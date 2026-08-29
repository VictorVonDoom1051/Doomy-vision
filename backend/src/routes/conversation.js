import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { requireAccessToken } from './../middleware/auth.js';
import { validateImageUpload, validateAudioUpload, requireFields } from './../middleware/validate.js';
import { optimizeImage, makeThumbnail } from './../imageOptimizer.js';
import { createSTTProvider } from './../providers/stt.js';
import { createTTSProvider } from './../providers/tts.js';
import { createLLMProvider, REQUEST_CURRENT_VIEW_TOOL } from './../providers/llm.js';
import { sessionStore } from './../state.js';
import { classifyVisionIntent } from './../intent.js';
import { wantsToRemember, rememberedVisionStore } from './../visionMemory.js';
import { putAudio } from './../audioCache.js';
import { config } from './../config.js';
import { logStage, logger } from './../logger.js';
import { metrics } from './../metrics.js';
import { VisionError, LLMError, AudioError } from './../errors.js';

export const conversationRouter = Router();

const upload = multer({
  limits: { fileSize: Math.max(config.limits.visionMaxImageMb, config.limits.audioMaxMb) * 1024 * 1024 },
});

const stt = createSTTProvider();
const tts = createTTSProvider();
const llm = createLLMProvider();

const SYSTEM_PROMPT = [
  'Eres Doomy, un asistente de IA con voz robótica y una personalidad segura y directa.',
  'El usuario te habla a través de sus lentes Ray-Ban Meta. Cuando recibas una imagen, es literalmente',
  'lo que el usuario está viendo en este momento a través de sus lentes.',
  'Responde de forma breve y natural, apta para ser leída en voz alta (texto a voz).',
  'No menciones que eres un modelo de lenguaje ni detalles técnicos internos.',
].join(' ');

// Instrucción adicional para respuestas destinadas a las gafas (Fase 14 /
// sección "wearable_response"): más breves, sin listas ni formato visual,
// pensadas para escucharse. `response_mode` es informativo y opcional —
// nunca cambia qué se le pide al modelo, solo el estilo de la respuesta.
const WEARABLE_BREVITY_SUFFIX =
  ' Responde en una o dos frases como máximo, sin listas ni markdown: el usuario solo va a escucharte, no a leerte.';

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

      const imageFile = req.files?.image?.[0];
      const audioFile = req.files?.audio?.[0];

      // --- 1. Resolver texto de entrada (directo o vía STT) ---
      let userText = req.body.text?.trim() || '';
      let transcription = null;
      if (audioFile) {
        validateAudioUpload(audioFile);
        const tStt0 = Date.now();
        let result;
        try {
          result = await stt.transcribe(audioFile.buffer, { mime: audioFile.mimetype, filename: audioFile.originalname });
        } catch (sttErr) {
          // Fase 22/31 (bug real encontrado con una prueba genuina): GroqSTTProvider
          // ya envuelve un `!resp.ok` en AudioError, pero una excepción de red cruda
          // del propio `fetch` (DNS, timeout, conexión rechazada) no pasaba por ahí y
          // se colaba como un 500 genérico en vez de un 502 AudioError limpio.
          // Se normaliza aquí, en el mismo punto donde ya se atajan LLM/TTS.
          timings.stt_ms = Date.now() - tStt0;
          logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'stt', durationMs: timings.stt_ms, result: 'error' });
          if (sttErr instanceof AudioError) throw sttErr;
          throw new AudioError(undefined, { cause: sttErr });
        }
        timings.stt_ms = Date.now() - tStt0;
        transcription = { text: result.text, duration_ms: result.durationMs };
        userText = userText || result.text;
        logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'stt', durationMs: timings.stt_ms, result: 'ok' });
      }
      if (!userText) {
        throw new VisionError('No se recibió texto ni audio transcribible', { status: 400, code: 'ValidationError' });
      }

      // --- 2. Resolver imagen: adjunta en esta request, reutilizada, o ninguna ---
      let imageBase64 = null;
      let imageMime = null;
      let visionUsed = false;
      let visionRequested = false;
      let visionRequiredReason = null;

      if (imageFile) {
        validateImageUpload(imageFile);
        const tVision0 = Date.now();
        const optimized = await optimizeImage(imageFile.buffer);
        const thumbnailB64 = await makeThumbnail(imageFile.buffer);
        timings.vision_prepare_ms = Date.now() - tVision0;
        sessionStore.setLastImage(session, {
          thumbnailB64,
          summary: `Imagen capturada (${optimized.width}x${optimized.height})`,
          width: optimized.width,
          height: optimized.height,
        });
        session.lastImageBuffer = { buffer: optimized.buffer, mime: optimized.mime };
        imageBase64 = optimized.buffer.toString('base64');
        imageMime = optimized.mime;
        visionUsed = true;
        logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'vision_capture', durationMs: timings.vision_prepare_ms, result: 'ok' });
      } else if (config.flags.visionEnabled) {
        const activeImage = sessionStore.getActiveImage(session);
        const intent = classifyVisionIntent(userText, { hasActiveImage: !!activeImage });
        if (intent === 'reuse_last_image' && activeImage && session.lastImageBuffer) {
          imageBase64 = session.lastImageBuffer.buffer.toString('base64');
          imageMime = session.lastImageBuffer.mime;
          visionUsed = true;
        } else if (intent === 'needs_new_image') {
          // V1 (REST, sin tool calling en vivo): le decimos al Bridge que
          // capture y reenvíe con el frame adjunto, en vez de adivinar.
          visionRequested = true;
          visionRequiredReason = activeImage
            ? 'La última imagen activa expiró o no aplica para esta pregunta; se necesita una captura nueva.'
            : 'La pregunta requiere ver algo y todavía no hay ninguna imagen en esta sesión.';
        }
      }

      // --- 3. LLM (con o sin herramienta request_current_view) ---
      let llmResult;
      if (visionRequested && !config.flags.toolCallingVisionEnabled) {
        // No llamamos al LLM todavía: el contrato le pide al Bridge la imagen.
        llmResult = {
          text: 'Necesito ver lo que estás viendo — dame un segundo.',
          toolCalls: [],
        };
      } else {
        const tLlm0 = Date.now();
        const tools = config.flags.toolCallingVisionEnabled ? [REQUEST_CURRENT_VIEW_TOOL] : [];
        const systemPromptForRequest = responseMode === 'wearable' ? SYSTEM_PROMPT + WEARABLE_BREVITY_SUFFIX : SYSTEM_PROMPT;
        try {
          llmResult = await llm.chat({
            systemPrompt: systemPromptForRequest,
            history: session.history.filter((h) => h.role !== 'system'),
            userText,
            imageBase64,
            imageMime,
            tools,
          });
        } catch (llmErr) {
          // Fase 22: un fallo del proveedor de IA (Anthropic caído, rate
          // limit, timeout, etc.) debe traducirse en un error claro y
          // tipado, nunca en un 500 genérico sin contexto.
          logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'llm', durationMs: Date.now() - tLlm0, result: 'error' });
          throw new LLMError(undefined, { cause: llmErr });
        }
        timings.llm_ms = Date.now() - tLlm0;
        logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'llm', durationMs: timings.llm_ms, result: 'ok' });

        if (llmResult.toolCalls?.some((c) => c.name === 'request_current_view')) {
          visionRequested = true;
          visionRequiredReason = 'El modelo pidió explícitamente una imagen nueva (request_current_view).';
        }
      }

      // --- 4. Memoria: turnos + posible "recordar" ---
      sessionStore.addTurn(session, { role: 'user', text: userText, visionUsed });
      sessionStore.addTurn(session, { role: 'assistant', text: llmResult.text, visionUsed });

      // Fase 12/13: guardamos el resumen textual REAL que el modelo ya
      // generó para la imagen activa (nunca inventado, nunca una segunda
      // llamada solo para "resumir"). Se reemplaza en cada imagen nueva
      // (setLastImage ya lo limpia) — es deliberadamente de una sola imagen
      // a la vez; ver docs para la limitación honesta de memoria multi-imagen.
      if (visionUsed) {
        sessionStore.setVisionContextSummary(session, llmResult.text);
      }

      let remembered = null;
      if (wantsToRemember(userText) && sessionStore.getActiveImage(session)) {
        const activeImage = sessionStore.getActiveImage(session);
        remembered = await rememberedVisionStore.remember({
          sessionId: session.id,
          imageSummary: activeImage.summary,
          thumbnailB64: activeImage.thumbnailB64,
          userNote: userText,
        });
      }

      // --- 5. TTS ---
      // Fase 44 (bug identificado y corregido): un fallo de TTS NUNCA debe
      // tirar toda la respuesta — el texto ya está listo y es lo más
      // importante. Si el audio falla, se responde igual con audio: null
      // y se loguea la falla como warning, no como error fatal.
      let audio = null;
      let ttsFailed = false;
      if (config.flags.ttsEnabled && llmResult.text) {
        const tTts0 = Date.now();
        try {
          const { audioBuffer, mime } = await tts.speak(llmResult.text);
          timings.tts_ms = Date.now() - tTts0;
          const audioId = putAudio(audioBuffer, mime);
          audio = { url: `/api/doomy-vision/v1/audio/${audioId}`, format: mime, expires_in_s: 300 };
          logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'tts', durationMs: timings.tts_ms, result: 'ok' });
        } catch (ttsErr) {
          timings.tts_ms = Date.now() - tTts0;
          ttsFailed = true;
          logger.warn({ request_id: requestId, session_id: session.id, err: ttsErr?.message }, 'TTS falló — se responde solo con texto');
          logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'tts', durationMs: timings.tts_ms, result: 'error' });
        }
      }

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
        text: llmResult.text,
        audio,
        audio_unavailable: ttsFailed,
        actions: [],
        vision_used: visionUsed,
        vision_requested: visionRequested,
        vision_required: visionRequested ? { status: 'vision_required', reason: visionRequiredReason } : null,
        vision_context_summary: session.visionContextSummary,
        response_mode: responseMode,
        transcription,
        remembered,
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
