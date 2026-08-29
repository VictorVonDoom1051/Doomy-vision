import { v4 as uuid } from 'uuid';
import { config } from './config.js';
import { NotFoundError } from './errors.js';

/**
 * Almacén de sesiones en memoria (sección 15/16).
 *
 * Diseño preparado para reemplazarse por Postgres real de Doomy más
 * adelante (Doomy ya tiene DATABASE_URL en producción) sin cambiar el
 * contrato — ver docs/DOOMY_VISION_ARCHITECTURE.md#sesiones para el
 * esquema de tabla propuesto. NO se tocan tablas ni bases de datos
 * productivas desde este backend aislado.
 *
 * Política de contexto (sección 15/16):
 *  - Se conserva un historial corto de turnos (texto only, sin imágenes).
 *  - Se conserva UNA "última imagen activa" (ephemeral vision) con
 *    expiración propia, más un resumen textual corto ("vision_context_summary")
 *    guardado en el turno del propio LLM ya generado — nunca inventado ni
 *    re-derivado con una segunda llamada. Se reemplaza cuando llega una
 *    imagen nueva (una sola "vista activa" a la vez — sin memoria multi-imagen
 *    real todavía; ver docs/DOOMY_VISION_ARCHITECTURE.md#limitaciones).
 *  - "remembered vision" es un flag por turno que deja preparada la
 *    interfaz `RememberedVisionStore` (ver vision-memory.js) para cuando
 *    el sistema de memoria real de Doomy la soporte. No persiste nada
 *    permanente en este backend por defecto.
 */

export class SessionStore {
  constructor({
    ttlMinutes = config.limits.sessionTtlMinutes,
    lastImageTtlMinutes = config.limits.sessionLastImageTtlMinutes,
    maxHistoryTurns = config.limits.maxHistoryTurns,
  } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.lastImageTtlMs = lastImageTtlMinutes * 60 * 1000;
    this.maxHistoryTurns = maxHistoryTurns;
  }

  create({ deviceId, deviceType = 'rayban_meta', mode = 'real' }) {
    const now = Date.now();
    const session = {
      id: uuid(),
      deviceId,
      deviceType, // rayban_meta | mock | phone
      mode, // real | mock | phone (MODE A/B/C)
      createdAt: now,
      lastActivityAt: now,
      history: [], // [{ role, text, timestamp, visionUsed }]
      lastImage: null, // { thumbnailB64, summary, capturedAt, width, height }
      visionContextSummary: null, // { text, capturedAt } — respuesta real del LLM, nunca inventado
      remembered: [], // interfaz preparada, no persistida fuera de este proceso
      turns: 0,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundError(`Sesión no encontrada: ${id}`);
    if (Date.now() - session.lastActivityAt > this.ttlMs) {
      this.sessions.delete(id);
      throw new NotFoundError(`Sesión expirada: ${id}`);
    }
    return session;
  }

  touch(session) {
    session.lastActivityAt = Date.now();
  }

  /**
   * Devuelve la sesión viva más reciente de un dispositivo, o crea una nueva
   * (Mission 004, para `/ask`). Un Atajo de iOS no puede guardar estado entre
   * invocaciones de forma cómoda: manda solo su `device_id` y el backend le
   * mantiene la continuidad de la conversación ("¿qué es esto?" -> "¿tiene
   * PoE?") sin que el cliente tenga que administrar `session_id`.
   *
   * Las sesiones expiradas se ignoran aquí igual que en `get()` — nunca se
   * revive una sesión pasada de TTL, se crea una nueva y limpia.
   */
  findOrCreateByDevice({ deviceId, deviceType = 'rayban_meta', mode = 'real' }) {
    const now = Date.now();
    let newest = null;
    for (const session of this.sessions.values()) {
      if (session.deviceId !== deviceId) continue;
      if (now - session.lastActivityAt > this.ttlMs) continue;
      if (!newest || session.lastActivityAt > newest.lastActivityAt) newest = session;
    }
    if (newest) {
      this.touch(newest);
      return { session: newest, created: false };
    }
    return { session: this.create({ deviceId, deviceType, mode }), created: true };
  }

  addTurn(session, { role, text, visionUsed = false }) {
    session.history.push({ role, text, timestamp: Date.now(), visionUsed });
    if (session.history.length > this.maxHistoryTurns) {
      session.history.splice(0, session.history.length - this.maxHistoryTurns);
    }
    if (role === 'user') session.turns += 1;
    this.touch(session);
  }

  setLastImage(session, { thumbnailB64, summary, width, height }) {
    session.lastImage = {
      thumbnailB64,
      summary,
      width,
      height,
      capturedAt: Date.now(),
    };
    // Nueva imagen reemplaza el contexto visual activo — sin memoria
    // multi-imagen real (documentado como limitación honesta, no simulada).
    session.visionContextSummary = null;
    session.lastImageBuffer = null;
    this.touch(session);
  }

  /** Guarda el resumen textual REAL que ya devolvió el LLM para esta imagen
   * (nunca un resumen inventado ni una segunda llamada solo para resumir). */
  setVisionContextSummary(session, text) {
    session.visionContextSummary = { text, capturedAt: Date.now() };
    this.touch(session);
  }

  getActiveImage(session) {
    if (!session.lastImage) return null;
    if (Date.now() - session.lastImage.capturedAt > this.lastImageTtlMs) {
      return null; // expiró — Doomy debe pedir una nueva captura
    }
    return session.lastImage;
  }

  // Barrido periódico de sesiones expiradas (evita crecer sin límite).
  sweep() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > this.ttlMs) this.sessions.delete(id);
    }
  }

  count() {
    return this.sessions.size;
  }
}

export const sessionStore = new SessionStore();

// Barrido cada 5 minutos; unref para no mantener el proceso vivo en tests.
const sweepInterval = setInterval(() => sessionStore.sweep(), 5 * 60 * 1000);
sweepInterval.unref?.();
