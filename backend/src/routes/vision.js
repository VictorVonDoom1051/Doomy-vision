import { Router } from 'express';
import multer from 'multer';
import { requireAccessToken } from './../middleware/auth.js';
import { validateImageUpload, requireFields } from './../middleware/validate.js';
import { optimizeImage, makeThumbnail } from './../imageOptimizer.js';
import { sessionStore } from './../state.js';
import { rememberedVisionStore } from './../visionMemory.js';
import { config } from './../config.js';
import { logStage } from './../logger.js';
import { v4 as uuid } from 'uuid';

export const visionRouter = Router();

const upload = multer({ limits: { fileSize: config.limits.visionMaxImageMb * 1024 * 1024 } });

/**
 * POST /vision — sección 7/8/40.
 * multipart/form-data: campo "image" + campo "session_id".
 * Registra la imagen como "última imagen activa" de la sesión sin
 * necesidad de pasar por /conversation (útil para el simulador y para
 * VisionFrameProvider del Bridge cuando sube un frame de forma proactiva).
 */
visionRouter.post('/vision', requireAccessToken, upload.single('image'), async (req, res, next) => {
  const requestId = uuid();
  const t0 = Date.now();
  try {
    requireFields(req.body || {}, ['session_id']);
    validateImageUpload(req.file);
    const session = sessionStore.get(req.body.session_id);

    const optimized = await optimizeImage(req.file.buffer);
    const thumbnailB64 = await makeThumbnail(req.file.buffer);

    // Resumen de texto corto en vez de guardar la imagen completa
    // indefinidamente (sección 15). Aquí usamos un resumen mínimo; en
    // /conversation el LLM puede generar uno más rico a partir de su propia
    // respuesta.
    const summary = `Imagen capturada (${optimized.width}x${optimized.height}, ${(optimized.compressed_bytes / 1024).toFixed(0)}KB)`;

    sessionStore.setLastImage(session, { thumbnailB64, summary, width: optimized.width, height: optimized.height });
    // Guardamos también el buffer optimizado (pequeño) para reutilizarlo en
    // el siguiente turno de conversación dentro del TTL — no es texto, así
    // que vive en el objeto de sesión en memoria, nunca en logs.
    session.lastImageBuffer = { buffer: optimized.buffer, mime: optimized.mime };

    let remembered = null;
    if (req.body.remember === 'true' || req.body.remember === true) {
      remembered = await rememberedVisionStore.remember({
        sessionId: session.id,
        imageSummary: summary,
        thumbnailB64,
        userNote: req.body.note || '',
      });
    }

    logStage({
      requestId,
      sessionId: session.id,
      deviceId: req.deviceId,
      stage: 'vision_upload',
      durationMs: Date.now() - t0,
      result: 'ok',
      extra: {
        original_bytes: optimized.original_bytes,
        compressed_bytes: optimized.compressed_bytes,
        compression_ms: optimized.compression_ms,
      },
    });

    res.status(201).json({
      request_id: requestId,
      session_id: session.id,
      image: {
        width: optimized.width,
        height: optimized.height,
        original_bytes: optimized.original_bytes,
        compressed_bytes: optimized.compressed_bytes,
        compression_ms: optimized.compression_ms,
        thumbnail_base64: thumbnailB64,
      },
      remembered,
    });
  } catch (err) {
    logStage({ requestId, deviceId: req.deviceId, stage: 'vision_upload', durationMs: Date.now() - t0, result: 'error' });
    next(err);
  }
});
