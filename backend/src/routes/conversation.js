import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { requireAccessToken } from './../middleware/auth.js';
import { requireFields } from './../middleware/validate.js';
import { sessionStore } from './../state.js';
import { config } from './../config.js';
import { logStage } from './../logger.js';
import { metrics } from './../metrics.js';
import { runConversationTurn } from './../conversationEngine.js';

export const conversationRouter = Router();

const upload = multer({
  limits: { fileSize: Math.max(config.limits.visionMaxImageMb, config.limits.audioMaxMb) * 1024 * 1024 },
});

/**
 * Middleware que mide el tiempo entre "llega el request" y "multer terminó
 * de parsear el multipart" — esto es lo más cercano a un `upload_ms` real
 * que el backend puede medir (el tiempo de subida en sí, desde el
 * dispositivo, solo lo puede medir el propio cliente — ver `audio_capture_ms`
 * más abajo, que sí es explícitamente client-measured).
 */
function timeUpload(req, res, next) {
  req._uploadStart = Date.now();
  next();
}

/**
 * POST /conversation — orquestador central (secciones 2, 14, 17, 18, 21, 39).
 * Acepta multipart/form-data:
 *   session_id (requerido)
 *   text (opcional si se manda audio)
 *   image (opcional — archivo)
 *   audio (opcional — archivo, si el input es voz)
 *   input_type (opcional: text | voice | voice_with_vision | vision — informativo)
 *   audio_capture_ms (opcional — medido por el cliente, se hace eco en latency_ms)
 *   response_mode (opcional: 'screen' | 'wearable' — default 'screen')
 *
 * La orquestación real (STT -> visión -> LLM -> memoria -> TTS) vive en
 * `conversationEngine.js`, compartida con `/ask` (Atajos de iOS / Siri).
 */
conversationRouter.post(
  '/conversation',
  timeUpload,
  requireAccessToken,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  async (req, res, next) => {
    const requestId = uuid();
    res.setHeader('X-Request-Id', requestId);
    const timings = {};
    if (req._uploadStart) timings.upload_ms = Date.now() - req._uploadStart;
    const tTotal0 = Date.now();
    let session;

    try {
      requireFields(req.body || {}, ['session_id']);
      session = sessionStore.get(req.body.session_id);

      // Client-measured, nunca calculado por el backend — se documenta así
      // en la respuesta (Fase 6: instrumentación por etapa).
      const audioCaptureMs = req.body.audio_capture_ms !== undefined ? Number(req.body.audio_capture_ms) : undefined;
      if (Number.isFinite(audioCaptureMs)) timings.audio_capture_ms = audioCaptureMs;

      const responseMode = req.body.response_mode === 'wearable' ? 'wearable' : 'screen';

      const result = await runConversationTurn({
        session,
        deviceId: req.deviceId,
        requestId,
        text: req.body.text,
        imageFile: req.files?.image?.[0] || null,
        audioFile: req.files?.audio?.[0] || null,
        responseMode,
        timings,
      });

      timings.total_ms = Date.now() - tTotal0;
      metrics.recordRequest({
        success: true,
        totalMs: timings.total_ms,
        sttMs: timings.stt_ms,
        visionMs: timings.vision_prepare_ms,
        llmMs: timings.llm_ms,
        ttsMs: timings.tts_ms,
      });

      res.json({
        session_id: session.id,
        request_id: requestId,
        response_id: requestId,
        text: result.text,
        audio: result.audio,
        audio_unavailable: result.ttsFailed,
        actions: [],
        vision_used: result.visionUsed,
        vision_requested: result.visionRequested,
        vision_required: result.visionRequested
          ? { status: 'vision_required', reason: result.visionRequiredReason }
          : null,
        vision_context_summary: session.visionContextSummary,
        response_mode: responseMode,
        transcription: result.transcription,
        remembered: result.remembered,
        latency_ms: timings,
      });
    } catch (err) {
      timings.total_ms = Date.now() - tTotal0;
      metrics.recordRequest({ success: false, totalMs: timings.total_ms });
      logStage({
        requestId,
        sessionId: session?.id,
        deviceId: req.deviceId,
        stage: 'conversation',
        durationMs: timings.total_ms,
        result: 'error',
      });
      next(err);
    }
  }
);
