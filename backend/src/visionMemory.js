/**
 * Vision Memory (sección 16).
 *
 * Distingue:
 *  - ephemeral vision: la imagen/​resumen vive en SessionStore con TTL
 *    corto, solo para la conversación activa. Ya implementado.
 *  - remembered vision: el usuario dice explícitamente "Doomy, recuerda
 *    este equipo" -> se marca esa interacción con remember:true. Este
 *    backend NO implementa almacenamiento permanente (el sistema de
 *    memoria real de Doomy vive en doomy-assistant/Postgres y no debe
 *    tocarse desde aquí sin autorización — ver DOOMY_VISION_BLOCKERS.md).
 *
 * Esta clase es la interfaz preparada: un RememberedVisionStore real
 * (Postgres-backed, dentro de doomy-assistant) puede implementar el mismo
 * método `remember()` sin cambiar quien la llama.
 */
export class RememberedVisionStore {
  /**
   * @param {{sessionId: string, imageSummary: string, thumbnailB64: string|null, userNote: string}} entry
   * @returns {Promise<{id: string, stored: boolean, reason?: string}>}
   */
  async remember(entry) {
    throw new Error('not implemented — placeholder interface, ver visionMemory.js');
  }
}

/** Implementación no-op explícita: no persiste nada, pero no rompe el flujo. */
export class NoopRememberedVisionStore extends RememberedVisionStore {
  async remember(entry) {
    return {
      id: null,
      stored: false,
      reason:
        'Vision memory permanente aún no está conectada al sistema de memoria real de Doomy. ' +
        'Ver DOOMY_VISION_BLOCKERS.md — interfaz lista, integración pendiente de autorización.',
    };
  }
}

export const rememberedVisionStore = new NoopRememberedVisionStore();

/** Detecta frases explícitas de "recordar" (es/en), heurística simple y documentada. */
const REMEMBER_PATTERNS = [
  /recuerda (este|esta|ese|esa)/i,
  /gu[aá]rdate (este|esta|ese|esa)/i,
  /remember this/i,
];

export function wantsToRemember(text) {
  if (!text) return false;
  return REMEMBER_PATTERNS.some((re) => re.test(text));
}
