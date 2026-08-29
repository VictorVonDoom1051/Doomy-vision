/**
 * Capa `needsVision` (sección 17). Heurística simple y explícita, no
 * "heurísticas frágiles regadas por todo el código" — todo vive aquí.
 *
 * Cuando TOOL_CALLING_VISION_ENABLED=true con un proveedor que soporte
 * tool calling real, esta heurística deja de ser la única señal: el
 * propio modelo puede pedir `request_current_view` (ver providers/llm.js).
 * needsVision() sigue siendo útil ahí como fallback/optimización para no
 * pagar un round-trip extra cuando es obvio que se necesita imagen.
 */

const VISION_TRIGGERS = [
  /qu[eé] (estoy|es lo que estoy) viendo/i,
  /qu[eé] es esto/i,
  /qu[eé] modelo (es|tiene)/i,
  /de qu[eé] marca/i,
  /puedes ver/i,
  /mira esto/i,
  /ve(s)? esto/i,
  /what am i (looking at|seeing)/i,
  /what is this/i,
  /can you see/i,
];

const FOLLOWUP_REFERENCE = [
  /^(no,? )?me refer[ií]a/i,
  /^(el|la|los|las) (de arriba|de abajo|otro|otra)/i,
  /^y (el|la|eso|esto)/i,
  /^(what about|i meant)/i,
];

/**
 * @returns {'needs_new_image'|'reuse_last_image'|'no_vision'}
 */
export function classifyVisionIntent(text, { hasActiveImage } = {}) {
  const t = (text || '').trim();
  if (!t) return 'no_vision';

  if (hasActiveImage && FOLLOWUP_REFERENCE.some((re) => re.test(t))) {
    return 'reuse_last_image';
  }
  if (VISION_TRIGGERS.some((re) => re.test(t))) {
    return hasActiveImage ? 'reuse_last_image' : 'needs_new_image';
  }
  // Pregunta corta de seguimiento inmediatamente después de una imagen activa:
  // reutilizamos por defecto en vez de pedir una nueva captura innecesaria.
  if (hasActiveImage && t.split(/\s+/).length <= 6) {
    return 'reuse_last_image';
  }
  return 'no_vision';
}
