#!/usr/bin/env node
// Doomy Vision — smoke test de proveedores REALES (Fase 58, Mission 002).
//
// Hace COMO MUCHO 1 llamada real por proveedor configurado — nunca un loop,
// nunca una suite automatizada completa. Pensado para correrse a mano, una
// vez, cuando Victor quiera confirmar que una credencial real funciona.
//
// GATEADO ESTRICTAMENTE: nunca corre a menos que RUN_REAL_PROVIDER_TESTS=true
// esté explícitamente puesto en el entorno. Nunca se ejecuta en CI/tests
// automatizados (vitest ni lo importa ni lo corre).
//
// Uso:
//   RUN_REAL_PROVIDER_TESTS=true ANTHROPIC_API_KEY=... node scripts/real-provider-smoke-test.mjs
//
// Imprime solo SUCCESS/FAIL + latencia por proveedor + un resumen corto de
// la respuesta — nunca imprime la API key ni el cuerpo completo de la
// respuesta.

import 'dotenv/config';

if (process.env.RUN_REAL_PROVIDER_TESTS !== 'true') {
  console.error(
    'RUN_REAL_PROVIDER_TESTS no está en "true" — este script hace llamadas reales y ' +
      'potencialmente pagadas, así que requiere el flag explícito. No se ejecutó nada.'
  );
  process.exit(1);
}

const results = [];

async function testAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    results.push({ provider: 'anthropic', status: 'SKIPPED', reason: 'ANTHROPIC_API_KEY no configurada' });
    return;
  }
  const { AnthropicLLMProvider } = await import('./../src/providers/llm.js');
  const provider = new AnthropicLLMProvider();
  const t0 = Date.now();
  try {
    const res = await provider.chat({
      systemPrompt: 'Responde en una sola palabra.',
      history: [],
      userText: 'Di "hola" y nada más.',
    });
    results.push({
      provider: 'anthropic',
      status: 'SUCCESS',
      latency_ms: Date.now() - t0,
      response_summary: (res.text || '').slice(0, 60),
    });
  } catch (err) {
    results.push({ provider: 'anthropic', status: 'FAIL', latency_ms: Date.now() - t0, error: err.message });
  }
}

async function testGroq() {
  if (!process.env.GROQ_API_KEY) {
    results.push({ provider: 'groq', status: 'SKIPPED', reason: 'GROQ_API_KEY no configurada' });
    return;
  }
  // Genera un WAV de silencio corto (~0.3s) en memoria — no depende de un
  // archivo externo con contenido real de nadie, ni de audio grabado.
  const { GroqSTTProvider } = await import('./../src/providers/stt.js');
  const silentWav = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', 'base64');
  const provider = new GroqSTTProvider();
  const t0 = Date.now();
  try {
    const res = await provider.transcribe(silentWav, { mime: 'audio/wav', filename: 'silence.wav' });
    results.push({
      provider: 'groq',
      status: 'SUCCESS',
      latency_ms: Date.now() - t0,
      response_summary: `transcribed ${JSON.stringify(res.text || '').slice(0, 40)}`,
    });
  } catch (err) {
    results.push({ provider: 'groq', status: 'FAIL', latency_ms: Date.now() - t0, error: err.message });
  }
}

async function testElevenLabs() {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    results.push({ provider: 'elevenlabs', status: 'SKIPPED', reason: 'ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID no configuradas' });
    return;
  }
  const { ElevenLabsTTSProvider } = await import('./../src/providers/tts.js');
  // Reutiliza la voz YA configurada (ELEVENLABS_VOICE_ID) — nunca crea una
  // voz nueva. Texto fijo y corto para minimizar costo.
  const provider = new ElevenLabsTTSProvider();
  const t0 = Date.now();
  try {
    const res = await provider.speak('Hola, esto es una prueba de Doomy Vision.');
    results.push({
      provider: 'elevenlabs',
      status: 'SUCCESS',
      latency_ms: Date.now() - t0,
      response_summary: `${res.audioBuffer.length} bytes, ${res.mime}`,
    });
  } catch (err) {
    results.push({ provider: 'elevenlabs', status: 'FAIL', latency_ms: Date.now() - t0, error: err.message });
  }
}

console.log('Doomy Vision — real provider smoke test (máx. 1 llamada real por proveedor)\n');
await testAnthropic();
await testGroq();
await testElevenLabs();

console.log('\n--- Resultados ---');
for (const r of results) {
  const line = `[${r.status}] ${r.provider}` + (r.latency_ms != null ? ` (${r.latency_ms}ms)` : '') + (r.response_summary ? ` — ${r.response_summary}` : '') + (r.reason ? ` — ${r.reason}` : '') + (r.error ? ` — ${r.error}` : '');
  console.log(line);
}

const anyFail = results.some((r) => r.status === 'FAIL');
process.exit(anyFail ? 1 : 0);
