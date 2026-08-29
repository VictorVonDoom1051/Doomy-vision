import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { verifyInternalKey } from './../middleware/auth.js';
import { sessionStore } from './../state.js';
import { config } from './../config.js';
import { logStage } from './../logger.js';
import { metrics } from './../metrics.js';
import { runConversationTurn } from './../conversationEngine.js';

export const askRouter = Router();

const upload = multer({
  limits: { fileSize: Math.max(config.limits.visionMaxImageMb, config.limits.audioMaxMb) * 1024 * 1024 },
});

/**
 * Construye una URL absoluta para el audio.
 *
 * `req.protocol` no sirve detrás del proxy de Railway sin `trust proxy`, y
 * activarlo globalmente cambiaría cómo `express-rate-limit` calcula la clave
 * por IP en todas las rutas. Como aquí solo se necesita para armar un enlace
 * (no para decisiones de seguridad), se leen los headers de forwarding
 * directamente y se cae a `https` — que es lo que sirve Railway.
 */
function absoluteUrl(req, path) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || req.protocol || 'https';
  const host = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() || req.get('host');
  return `${proto}://${host}${path}`;
}

/**
 * POST /ask — endpoint de un solo golpe (Mission 004).
 *
 * Existe para clientes que no pueden encadenar tres llamadas ni administrar
 * un JWT: en concreto los **Atajos de iOS** invocados por voz con Siri
 * mientras el usuario trae puestos los Ray-Ban (el micrófono y las bocinas
 * de los lentes son Bluetooth HFP normal, no necesitan el SDK de Meta —
 * ver docs/DOOMY_VISION_ARCHITECTURE.md §4.5).
 *
 * Diferencias contra `/conversation`:
 *  - Autentica con `x-doomy-vision-key` directo (sin register -> JWT).
 *  - No recibe `session_id`: la continuidad se mantiene por `device_id`,
 *    así el Atajo no tiene que guardar estado entre invocaciones.
 *  - `response_mode` es 'wearable' por default (respuestas cortas, para oír).
 *  - Devuelve `audio_url` ABSOLUTA, lista para que el Atajo la reproduzca.
 *
 * Acepta multipart/form-data (o JSON si no se manda archivo):
 *   text       (opcional si se manda audio)
 *   image      (opcional — archivo, la foto de los lentes)
 *   audio      (opcional — archivo, si el input es voz)
 *   device_id  (opcional — default 'siri-shortcut')
 *   reset      (opcional — 'true' fuerza una sesión nueva y limpia)
 *   response_mode (opcional: 'screen' | 'wearable' — default 'wearable')
 */
askRouter.post(
  '/ask',
  verifyInternalKey,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  async (req, res, next) => {
    const requestId = uuid();
    res.setHeader('X-Request-Id', requestId);
    const timings = {};
    const tTotal0 = Date.now();
    let session;

    try {
      const body = req.body || {};
      const deviceId = String(body.device_id || 'siri-shortcut').slice(0, 64);
      const responseMode = body.response_mode === 'screen' ? 'screen' : 'wearable';

      // `reset` explícito: empieza conversación nueva sin arrastrar historial
      // ni la última imagen (equivalente a POST /session/:id/reset).
      const wantsReset = String(body.reset || '').toLowerCase() === 'true';
      const found = sessionStore.findOrCreateByDevice({ deviceId, deviceType: 'rayban_meta', mode: 'real' });
      session = found.session;
      if (wantsReset && !found.created) {
        session.history = [];
        session.lastImage = null;
        session.lastImageBuffer = null;
        session.visionContextSummary = null;
        session.turns = 0;
      }

      const result = await runConversationTurn({
        session,
        deviceId,
        requestId,
        text: body.text,
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

      // Forma deliberadamente plana: los Atajos de iOS leen valores de
      // diccionario por clave de primer nivel, sin poder navegar anidados
      // cómodamente. `text` y `audio_url` son las dos únicas claves que el
      // Atajo necesita tocar.
      res.json({
        text: result.text,
        audio_url: result.audio ? absoluteUrl(req, result.audio.url) : null,
        audio_unavailable: result.ttsFailed,
        session_id: session.id,
        session_created: found.created,
        device_id: deviceId,
        vision_used: result.visionUsed,
        vision_requested: result.visionRequested,
        transcription: result.transcription?.text ?? null,
        request_id: requestId,
        total_ms: timings.total_ms,
      });
    } catch (err) {
      timings.total_ms = Date.now() - tTotal0;
      metrics.recordRequest({ success: false, totalMs: timings.total_ms });
      logStage({
        requestId,
        sessionId: session?.id,
        deviceId: req.body?.device_id,
        stage: 'ask',
        durationMs: timings.total_ms,
        result: 'error',
      });
      next(err);
    }
  }
);
