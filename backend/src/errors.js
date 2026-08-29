// Tipos de error de Doomy Vision (sección 45 de la misión).
// Cada uno tiene un código estable para el cliente (Bridge) y un mensaje
// amigable separado del detalle técnico (que va solo a logs).

export class DoomyVisionError extends Error {
  constructor(code, message, { status = 500, cause, details } = {}) {
    super(message);
    this.name = 'DoomyVisionError';
    this.code = code;
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

export class DoomyAPIError extends DoomyVisionError {
  constructor(message = 'Doomy Core no está disponible', opts = {}) {
    super('DoomyAPIError', message, { status: 502, ...opts });
  }
}

export function toHttpResponse(err) {
  if (err instanceof DoomyVisionError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'InternalError', message: 'Error interno de Doomy Vision' } },
  };
}
