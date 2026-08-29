import { validateImageUpload, validateAudioUpload } from './middleware/validate.js';
import { optimizeImage, makeThumbnail } from './imageOptimizer.js';
import { createSTTProvider } from './providers/stt.js';
import { createTTSProvider } from './providers/tts.js';
import { createLLMProvider, REQUEST_CURRENT_VIEW_TOOL } from './providers/llm.js';
import { sessionStore } from './state.js';
import { classifyVisionIntent } from './intent.js';
import { wantsToRemember, rememberedVisionStore } from './visionMemory.js';
import { putAudio } from './audioCache.js';
import { config } from './config.js';
import { logStage, logger } from './logger.js';
import { VisionError, LLMError, AudioError } from './errors.js';

/**
 * Orquestador de un turno de conversación (secciones 2, 14, 17, 18, 21, 39).
 *
 * Extraído de `routes/conversation.js` en Mission 004 para poder reusarse
 * tal cual desde el endpoint de un solo golpe `/ask` (Atajos de iOS / Siri),
 * sin duplicar la lógica de STT -> visión -> LLM -> memoria -> TTS. La ruta
 * `/conversation` sigue siendo la dueña del contrato HTTP (validación de
 * `session_id`, JWT, forma exacta del JSON); aquí vive solo la orquestación.
 *
 * No cambia ningún comportamiento respecto de Mission 003 — es un
 * movimiento de código verificado con la suite existente.
 */

const stt = createSTTProvider();
const tts = createTTSProvider();
const llm = createLLMProvider();

export const SYSTEM_PROMPT = [
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
export const WEARABLE_BREVITY_SUFFIX =
  ' Responde en una o dos frases como máximo, sin listas ni markdown: el usuario solo va a escucharte, no a leerte.';

/**
 * Ejecuta un turno completo sobre una sesión ya resuelta.
 *
 * @returns {Promise<object>} campos de resultado que la ruta traduce a JSON.
 *   `timings` se muta en el camino (mismo objeto que recibe la ruta).
 */
export async function runConversationTurn({
  session,
  deviceId,
  requestId,
  text = '',
  imageFile = null,
  audioFile = null,
  responseMode = 'screen',
  timings = {},
}) {
  // --- 1. Resolver texto de entrada (directo o vía STT) ---
  let userText = text?.trim() || '';
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
      timings.stt_ms = Date.now() - tStt0;
      logStage({ requestId, sessionId: session.id, deviceId, stage: 'stt', durationMs: timings.stt_ms, result: 'error' });
      if (sttErr instanceof AudioError) throw sttErr;
      throw new AudioError(undefined, { cause: sttErr });
    }
    timings.stt_ms = Date.now() - tStt0;
    transcription = { text: result.text, duration_ms: result.durationMs };
    userText = userText || result.text;
    logStage({ requestId, sessionId: session.id, deviceId, stage: 'stt', durationMs: timings.stt_ms, result: 'ok' });
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
    logStage({ requestId, sessionId: session.id, deviceId, stage: 'vision_capture', durationMs: timings.vision_prepare_ms, result: 'ok' });
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
      logStage({ requestId, sessionId: session.id, deviceId, stage: 'llm', durationMs: Date.now() - tLlm0, result: 'error' });
      throw new LLMError(undefined, { cause: llmErr });
    }
    timings.llm_ms = Date.now() - tLlm0;
    logStage({ requestId, sessionId: session.id, deviceId, stage: 'llm', durationMs: timings.llm_ms, result: 'ok' });

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
      logStage({ requestId, sessionId: session.id, deviceId, stage: 'tts', durationMs: timings.tts_ms, result: 'ok' });
    } catch (ttsErr) {
      timings.tts_ms = Date.now() - tTts0;
      ttsFailed = true;
      logger.warn({ request_id: requestId, session_id: session.id, err: ttsErr?.message }, 'TTS falló — se responde solo con texto');
      logStage({ requestId, sessionId: session.id, deviceId, stage: 'tts', durationMs: timings.tts_ms, result: 'error' });
    }
  }

  return {
    text: llmResult.text,
    audio,
    ttsFailed,
    visionUsed,
    visionRequested,
    visionRequiredReason,
    transcription,
    remembered,
    timings,
  };
}
