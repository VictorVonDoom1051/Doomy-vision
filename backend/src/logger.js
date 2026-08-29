import pino from 'pino';
import { config } from './config.js';

// Logging estructurado (sección 24). Nunca se loguean API keys, tokens,
// credenciales, imágenes completas o audio completo — solo metadata
// (tamaños, duraciones, hashes cortos si acaso).
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-doomy-vision-key"]',
  '*.apiKey',
  '*.api_key',
  '*.token',
  '*.access_token',
  '*.internalKey',
  '*.image',
  '*.image_base64',
  '*.audio',
  '*.audio_base64',
];

export const logger = pino({
  level: config.nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'doomy-vision-backend' },
});

/**
 * Log estructurado de una etapa del pipeline de una interacción
 * (sección 24: audio_capture, upload, stt, vision_capture, vision_upload,
 * llm, tts, download, playback).
 */
export function logStage({ requestId, sessionId, deviceId, stage, durationMs, result, extra }) {
  logger.info({
    request_id: requestId,
    session_id: sessionId,
    device: deviceId,
    stage,
    duration_ms: durationMs,
    result,
    ...(extra || {}),
  }, `stage:${stage}`);
}
