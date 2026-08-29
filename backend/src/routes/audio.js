import { Router } from 'express';
import multer from 'multer';
import { requireAccessToken } from './../middleware/auth.js';
import { validateAudioUpload, requireFields } from './../middleware/validate.js';
import { createSTTProvider } from './../providers/stt.js';
import { createTTSProvider } from './../providers/tts.js';
import { config } from './../config.js';
import { logStage } from './../logger.js';
import { metrics } from './../metrics.js';
import { putAudio, getAudio } from './../audioCache.js';
import { v4 as uuid } from 'uuid';

export const audioRouter = Router();

const upload = multer({ limits: { fileSize: config.limits.audioMaxMb * 1024 * 1024 } });
const stt = createSTTProvider();
const tts = createTTSProvider();

/** POST /audio/transcribe — sección 19. multipart/form-data, campo "audio". */
audioRouter.post('/audio/transcribe', requireAccessToken, upload.single('audio'), async (req, res, next) => {
  const requestId = uuid();
  const t0 = Date.now();
  try {
    validateAudioUpload(req.file);
    const { text, durationMs } = await stt.transcribe(req.file.buffer, {
      mime: req.file.mimetype,
      filename: req.file.originalname,
    });
    logStage({ requestId, deviceId: req.deviceId, stage: 'stt', durationMs: Date.now() - t0, result: 'ok', extra: { bytes: req.file.size } });
    res.json({ request_id: requestId, text, duration_ms: Date.now() - t0, audio_bytes: req.file.size });
  } catch (err) {
    logStage({ requestId, deviceId: req.deviceId, stage: 'stt', durationMs: Date.now() - t0, result: 'error' });
    next(err);
  }
});

/** POST /audio/speak — sección 20. Body JSON: { text } -> { audio: {url, format} } */
audioRouter.post('/audio/speak', requireAccessToken, async (req, res, next) => {
  const requestId = uuid();
  const t0 = Date.now();
  try {
    requireFields(req.body || {}, ['text']);
    if (!config.flags.ttsEnabled) {
      return res.status(200).json({ request_id: requestId, audio: null, note: 'TTS_ENABLED=false' });
    }
    const { audioBuffer, mime } = await tts.speak(req.body.text);
    const id = putAudio(audioBuffer, mime);
    logStage({ requestId, deviceId: req.deviceId, stage: 'tts', durationMs: Date.now() - t0, result: 'ok', extra: { chars: req.body.text.length } });
    metrics.recordRequest({ success: true, ttsMs: Date.now() - t0 });
    res.json({
      request_id: requestId,
      audio: { url: `/api/doomy-vision/v1/audio/${id}`, format: mime, expires_in_s: 300 },
      duration_ms: Date.now() - t0,
    });
  } catch (err) {
    logStage({ requestId, deviceId: req.deviceId, stage: 'tts', durationMs: Date.now() - t0, result: 'error' });
    metrics.recordRequest({ success: false, ttsMs: Date.now() - t0 });
    next(err);
  }
});

/** GET /audio/:id — descarga el audio generado (sección 21 "audio.url"). */
audioRouter.get('/audio/:id', (req, res) => {
  const entry = getAudio(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: { code: 'NotFoundError', message: 'Audio no encontrado o expirado' } });
  }
  res.set('Content-Type', entry.mime);
  res.send(entry.buffer);
});
