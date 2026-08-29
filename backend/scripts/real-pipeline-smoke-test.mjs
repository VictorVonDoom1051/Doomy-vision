#!/usr/bin/env node
// Doomy Vision — smoke test del pipeline COMPLETO contra un backend real en
// marcha (Fase 58, Mission 002): register -> session -> conversation con
// una imagen y un audio pequeños fijos (fixtures no sensibles, generados en
// memoria, nunca archivos de terceros) -> imprime SUCCESS/FAIL + latencia +
// un resumen corto de la respuesta. Nunca imprime secretos.
//
// Gateado igual que el smoke test de proveedores: requiere
// RUN_REAL_PROVIDER_TESTS=true. Si el backend contra el que apunta está en
// MOCK_MODE, esto simplemente confirma que el pipeline end-to-end funciona
// con datos simulados (sigue siendo útil como smoke test estructural); si
// apunta a un backend con credenciales reales, además ejercita el proveedor
// real de punta a punta UNA vez.
//
// Uso:
//   RUN_REAL_PROVIDER_TESTS=true DOOMY_VISION_API_BASE=http://localhost:8090 \
//     DOOMY_VISION_INTERNAL_KEY=... node scripts/real-pipeline-smoke-test.mjs

if (process.env.RUN_REAL_PROVIDER_TESTS !== 'true') {
  console.error('RUN_REAL_PROVIDER_TESTS no está en "true" — no se ejecutó nada.');
  process.exit(1);
}

const base = (process.env.DOOMY_VISION_API_BASE || 'http://localhost:8090').replace(/\/$/, '');
const v1 = `${base}/api/doomy-vision/v1`;
const internalKey = process.env.DOOMY_VISION_INTERNAL_KEY;

if (!internalKey) {
  console.error('DOOMY_VISION_INTERNAL_KEY no configurada — no se puede registrar un device.');
  process.exit(1);
}

// Fixture de imagen: 1x1 JPEG válido generado inline, no un archivo externo.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
// Fixture de audio: WAV de silencio de ~0.3s generado inline.
const SILENT_WAV_BASE64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${v1}${path}`, opts);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function summarize(body) {
  return {
    text: (body?.text || '').slice(0, 80),
    vision_used: body?.vision_used,
    audio_unavailable: body?.audio_unavailable,
    latency_ms: body?.latency_ms,
  };
}

console.log(`Doomy Vision — real pipeline smoke test contra ${base}\n`);
const t0 = Date.now();
try {
  const reg = await jsonFetch('/device/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-doomy-vision-key': internalKey },
    body: JSON.stringify({ device_id: 'smoke-test-pipeline' }),
  });
  if (reg.status !== 200) throw new Error(`register falló: ${reg.status} ${JSON.stringify(reg.body)}`);
  const token = reg.body.access_token;

  const sess = await jsonFetch('/session', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'phone' }),
  });
  if (sess.status !== 201) throw new Error(`session falló: ${sess.status} ${JSON.stringify(sess.body)}`);
  const sessionId = sess.body.session_id;

  // Turno 1: texto + imagen fixture.
  const fd1 = new FormData();
  fd1.append('session_id', sessionId);
  fd1.append('text', '¿qué estoy viendo?');
  fd1.append('image', new Blob([Buffer.from(TINY_JPEG_BASE64, 'base64')], { type: 'image/jpeg' }), 'fixture.jpg');
  const turn1 = await fetch(`${v1}/conversation`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd1 });
  const turn1Body = await turn1.json();
  if (turn1.status !== 200) throw new Error(`turno 1 falló: ${turn1.status} ${JSON.stringify(turn1Body)}`);
  console.log('[SUCCESS] turno 1 (texto + imagen):', JSON.stringify(summarize(turn1Body)));

  // Turno 2: audio fixture (sin texto), sigue en la misma sesión.
  const fd2 = new FormData();
  fd2.append('session_id', sessionId);
  fd2.append('audio', new Blob([Buffer.from(SILENT_WAV_BASE64, 'base64')], { type: 'audio/wav' }), 'fixture.wav');
  const turn2 = await fetch(`${v1}/conversation`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd2 });
  const turn2Body = await turn2.json();
  if (turn2.status !== 200) throw new Error(`turno 2 falló: ${turn2.status} ${JSON.stringify(turn2Body)}`);
  console.log('[SUCCESS] turno 2 (audio, continuidad de sesión):', JSON.stringify(summarize(turn2Body)));

  console.log(`\n[SUCCESS] pipeline completo — ${Date.now() - t0}ms totales`);
  process.exit(0);
} catch (err) {
  console.error(`\n[FAIL] ${err.message}`);
  process.exit(1);
}
