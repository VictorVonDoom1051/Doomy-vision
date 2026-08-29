import { ValidationError } from './../errors.js';
import { config } from './../config.js';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_AUDIO_MIME = new Set(['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/webm', 'audio/ogg']);

export function validateImageUpload(file) {
  if (!file) throw new ValidationError('Falta el archivo de imagen');
  if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    throw new ValidationError(`Tipo de imagen no soportado: ${file.mimetype}`, {
      details: { allowed: [...ALLOWED_IMAGE_MIME] },
    });
  }
  const maxBytes = config.limits.visionMaxImageMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new ValidationError(`Imagen demasiado grande (${(file.size / 1e6).toFixed(1)}MB > ${config.limits.visionMaxImageMb}MB)`);
  }
}

export function validateAudioUpload(file) {
  if (!file) throw new ValidationError('Falta el archivo de audio');
  if (!ALLOWED_AUDIO_MIME.has(file.mimetype)) {
    throw new ValidationError(`Tipo de audio no soportado: ${file.mimetype}`, {
      details: { allowed: [...ALLOWED_AUDIO_MIME] },
    });
  }
  const maxBytes = config.limits.audioMaxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new ValidationError(`Audio demasiado grande (${(file.size / 1e6).toFixed(1)}MB > ${config.limits.audioMaxMb}MB)`);
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    throw new ValidationError(`Campos faltantes: ${missing.join(', ')}`, { details: { missing } });
  }
}

/** Sanitiza nombres de archivo (sección 28) antes de usarlos en logs/paths. */
export function sanitizeFilename(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
