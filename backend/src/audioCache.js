import { v4 as uuid } from 'uuid';

/**
 * Caché de audio TTS en memoria, de muy corta duración. El Bridge hace
 * streaming/descarga inmediatamente después de recibir la respuesta;
 * no se almacenan grabaciones ni audios generados indefinidamente
 * (sección 19/20: "No almacenar grabaciones indefinidamente por defecto").
 */
const TTL_MS = 5 * 60 * 1000;
const store = new Map();

export function putAudio(buffer, mime) {
  const id = uuid();
  store.set(id, { buffer, mime, createdAt: Date.now() });
  return id;
}

export function getAudio(id) {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(id);
  }
}, 60 * 1000).unref?.();
