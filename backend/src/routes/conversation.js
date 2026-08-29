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
import { logStage } from './../logger.js';
import { metrics } from './../metrics.js';
import { VisionError } from './../errors.js';

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

/**
 * POST /conversation — orquestador central (secciones 2, 14, 17, 18, 21, 39).
 * Acepta multipart/form-data:
 *   session_id (requerido)
 *   text (opcional si se manda audio)
 *   image (opcional — archivo)
 *   audio (opcional — archivo, si el input es voz)
 *   input_type (opcional: text | voice | voice_with_vision | vision — informativo)
 */
conversationRouter.post(
  '/conversation',
  requireAccessToken,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  async (req, res, next) => {
    const requestId = uuid();
    const timings = {};
    const tTotal0 = Date.now();
    let session;

    try {
      requireFields(req.body || {}, ['session_id']);
      session = sessionStore.get(req.body.session_id);

      const imageFile = req.files?.image?.[0];
      const audioFile = req.files?.audio?.[0];

      // --- 1. Resolver texto de entrada (directo o vía STT) ---
      let userText = req.body.text?.trim() || '';
      let transcription = null;
      if (audioFile) {
        validateAudioUpload(audioFile);
        const tStt0 = Date.now();
        const result = await stt.transcribe(audioFile.buffer, { mime: audioFile.mimetype, filename: audioFile.originalname });
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

      if (imageFile) {
        validateImageUpload(imageFile);
        const tVision0 = Date.now();
        const optimized = await optimizeImage(imageFile.buffer);
        const thumbnailB64 = await makeThumbnail(imageFile.buffer);
        timings.vision_ms = Date.now() - tVision0;
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
        logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'vision_capture', durationMs: timings.vision_ms, result: 'ok' });
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
        llmResult = await llm.chat({
          systemPrompt: SYSTEM_PROMPT,
          history: session.history.filter((h) => h.role !== 'system'),
          userText,
          imageBase64,
          imageMime,
          tools,
        });
        timings.llm_ms = Date.now() - tLlm0;
        logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'llm', durationMs: timings.llm_ms, result: 'ok' });

        if (llmResult.toolCalls?.some((c) => c.name === 'request_current_view')) {
          visionRequested = true;
        }
      }

      // --- 4. Memoria: turnos + posible "recordar" ---
      sessionStore.addTurn(session, { role: 'user', text: userText, visionUsed });
      sessionStore.addTurn(session, { role: 'assistant', text: llmResult.text, visionUsed });

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
      let audio = null;
      if (config.flags.ttsEnabled && llmResult.text) {
        const tTts0 = Date.now();
        const { audioBuffer, mime } = await tts.speak(llmResult.text);
        timings.tts_ms = Date.now() - tTts0;
        const audioId = putAudio(audioBuffer, mime);
        audio = { url: `/api/doomy-vision/v1/audio/${audioId}`, format: mime, expires_in_s: 300 };
        logStage({ requestId, sessionId: session.id, deviceId: req.deviceId, stage: 'tts', durationMs: timings.tts_ms, result: 'ok' });
      }

      timings.total_ms = Date.now() - tTotal0;
      metrics.recordRequest({
        success: true,
        totalMs: timings.total_ms,
        sttMs: timings.stt_ms,
        visionMs: timings.vision_ms,
        llmMs: timings.llm_ms,
        ttsMs: timings.tts_ms,
      });

      res.json({
        session_id: session.id,
        response_id: requestId,
        text: llmResult.text,
        audio,
        actions: [],
        vision_used: visionUsed,
        vision_requested: visionRequested,
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
