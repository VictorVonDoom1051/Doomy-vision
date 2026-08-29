import jwt from 'jsonwebtoken';
import { config } from './../config.js';
import { AuthenticationError } from './../errors.js';

/**
 * Autenticación (sección 27/28).
 * No se reutilizan secretos maestros. Flujo:
 *   1. Bridge presenta DOOMY_VISION_INTERNAL_KEY (secreto compartido,
 *      igual patrón que DOOMY_WHATSAPP_INTERNAL_KEY ya usado en Doomy)
 *      en POST /device/register junto con su device_id.
 *   2. Backend emite un JWT de corta duración (access token).
 *   3. Todas las demás rutas requieren `Authorization: Bearer <token>`.
 * Las llaves de IA (Anthropic/Groq/ElevenLabs) NUNCA viajan al Bridge:
 * todas las llamadas de IA pasan por este backend.
 */

export function signAccessToken({ deviceId, sessionScope = 'device' }) {
  if (!config.auth.jwtSecret) throw new Error('DOOMY_VISION_JWT_SECRET no configurada');
  return jwt.sign(
    { sub: deviceId, scope: sessionScope },
    config.auth.jwtSecret,
    { expiresIn: `${config.auth.accessTokenTtlMin}m` }
  );
}

export function verifyInternalKey(req, _res, next) {
  const provided = req.header('x-doomy-vision-key');
  if (!config.auth.internalKey) {
    // Solo permitido en mock mode explícito — nunca en producción real.
    if (config.mockMode) return next();
    return next(new AuthenticationError('DOOMY_VISION_INTERNAL_KEY no configurada en el servidor'));
  }
  if (!provided || provided !== config.auth.internalKey) {
    return next(new AuthenticationError('Clave interna de Bridge inválida'));
  }
  next();
}

export function requireAccessToken(req, _res, next) {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AuthenticationError('Falta el token de acceso (Bearer)'));
  }
  if (!config.auth.jwtSecret) {
    if (config.mockMode) {
      req.deviceId = 'mock-device';
      return next();
    }
    return next(new AuthenticationError('DOOMY_VISION_JWT_SECRET no configurada en el servidor'));
  }
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret);
    req.deviceId = payload.sub;
    next();
  } catch (err) {
    next(new AuthenticationError('Token de acceso inválido o expirado', { cause: err }));
  }
}
