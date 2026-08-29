// Tipos de error de Doomy Vision (sección 45 del brief original, Fase 24 de
// Mission 002). Cada uno tiene:
//  - `code`: el nombre de clase (compatibilidad con la Mission 001 y los
//    56 tests existentes — NO se renombra para no romper contratos ya
//    probados).
//  - `dvCode`: un código interno estable tipo DV_XXX_NNN (Fase 24), pensado
//    para diagnosticar en logs/dashboards sin parsear el mensaje humano.
//  - `message`: amigable, apto para mostrarse al usuario final.
//  - detalle técnico (`details`/`cause`) que solo llega a logs, nunca al
//    cliente.

const DV_CODE = {
  AuthenticationError: 'DV_AUTH_001',
  ValidationError: 'DV_VALIDATION_001',
  NotFoundError: 'DV_NOTFOUND_001',
  RateLimitError: 'DV_RATE_001',
  VisionError: 'DV_VISION_001',
  AudioError: 'DV_AUDIO_001',
  PlaybackError: 'DV_TTS_001',
  LLMError: 'DV_LLM_001',
  DoomyAPIError: 'DV_CORE_001',
  SessionError: 'DV_SESSION_001',
  TimeoutError: 'DV_TIMEOUT_001',
};

export class DoomyVisionError extends Error {
  constructor(code, message, { status = 500, cause, details } = {}) {
    super(message);
    this.name = 'DoomyVisionError';
    this.code = code;
    this.dvCode = DV_CODE[code] || 'DV_UNKNOWN_001';
    this.status = status;
    this.cause = cause;
    this.details = details;
  }
}

export class AuthenticationError extends DoomyVisionError {
  constructor(message = 'No autorizado', opts = {}) {
    super('AuthenticationError', message, { status: 401, ...opts });
  }
}

export class ValidationError extends DoomyVisionError {
  constructor(message = 'Solicitud inválida', opts = {}) {
    super('ValidationError', message, { status: 400, ...opts });
  }
}

export class NotFoundError extends DoomyVisionError {
  constructor(message = 'No encontrado', opts = {}) {
    super('NotFoundError', message, { status: 404, ...opts });
  }
}

export class RateLimitError extends DoomyVisionError {
  constructor(message = 'Demasiadas solicitudes', opts = {}) {
    super('RateLimitError', message, { status: 429, ...opts });
  }
}

export class VisionError extends DoomyVisionError {
  constructor(message = 'No se pudo procesar la imagen', opts = {}) {
    super('VisionError', message, { status: 502, ...opts });
  }
}

export class AudioError extends DoomyVisionError {
  constructor(message = 'No se pudo procesar el audio', opts = {}) {
    super('AudioError', message, { status: 502, ...opts });
  }
}

export class PlaybackError extends DoomyVisionError {
  constructor(message = 'No se pudo generar el audio de respuesta', opts = {}) {
    super('PlaybackError', message, { status: 502, ...opts });
  }
}

/** Fallo específico del proveedor LLM (Anthropic u otro) — Fase 22: "Anthropic
 * failure → mensaje de servicio IA no disponible." Distinto de DoomyAPIError,
 * que es para cuando Doomy Vision mismo actúa como cliente de otro servicio. */
export class LLMError extends DoomyVisionError {
  constructor(message = 'El servicio de IA no está disponible en este momento', opts = {}) {
    super('LLMError', message, { status: 502, ...opts });
  }
}

export class DoomyAPIError extends DoomyVisionError {
  constructor(message = 'Doomy Core no está disponible', opts = {}) {
    super('DoomyAPIError', message, { status: 502, ...opts });
  }
}

/** Fase 21 — un request individual tardó más que REQUEST_TIMEOUT_MS. Nunca
 * deja una conexión colgada indefinidamente esperando a un cliente lento o
 * a un proveedor que nunca responde ni falla explícitamente. */
export class TimeoutError extends DoomyVisionError {
  constructor(message = 'La solicitud tardó demasiado y fue cancelada', opts = {}) {
    super('TimeoutError', message, { status: 504, ...opts });
  }
}

// Fase 15-24 (seguridad): `details` es información de diagnóstico pensada
// para el cliente en errores 4xx (p. ej. "estos son los MIME permitidos"),
// pero en errores 5xx puede terminar reflejando detalle interno de un
// proveedor externo (Anthropic/Groq/ElevenLabs) o similar. Nunca se filtra
// stack trace en ningún caso (nunca se pone `err.stack` en `details` para
// empezar), pero además, en producción, `details` se omite por completo del
// cuerpo enviado al cliente cuando el status es 5xx — sigue disponible
// completo en los logs del servidor vía logger.error, solo no viaja al
// cliente.
export function toHttpResponse(err, { nodeEnv = process.env.NODE_ENV } = {}) {
  if (err instanceof DoomyVisionError) {
    const hideDetails = nodeEnv === 'production' && err.status >= 500;
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          dv_code: err.dvCode,
          message: err.message,
          details: hideDetails ? undefined : err.details,
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'InternalError', dv_code: 'DV_INTERNAL_001', message: 'Error interno de Doomy Vision' } },
  };
}
