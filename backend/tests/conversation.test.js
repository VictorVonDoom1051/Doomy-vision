import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp, registerDevice, createSession, V1_PREFIX as V1, TINY_JPEG_BASE64 } from './helpers.js';
import { MockTTSProvider } from './../src/providers/tts.js';
import { MockLLMProvider } from './../src/providers/llm.js';
import { MockSTTProvider } from './../src/providers/stt.js';

async function setup() {
  const app = makeApp();
  const token = await registerDevice(app);
  const session = await createSession(app, token, { mode: 'mock' });
  return { app, token, sessionId: session.session_id };
}

describe('POST /conversation — texto', () => {
  it('responde a una pregunta de texto simple sin usar visión', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿Qué hora es?' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
    expect(res.body.vision_used).toBe(false);
    expect(res.body.session_id).toBe(sessionId);
    expect(res.body.response_id).toBeTruthy();
    expect(res.body.latency_ms.total_ms).toBeGreaterThanOrEqual(0);
  });

  it('rechaza sin session_id', async () => {
    const { app, token } = await setup();
    const res = await request(app).post(`${V1}/conversation`).set('authorization', `Bearer ${token}`).send({ text: 'hola' });
    expect(res.status).toBe(400);
  });

  it('rechaza sin texto ni audio', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId });
    expect(res.status).toBe(400);
  });

  it('404 con session_id inexistente', async () => {
    const { app, token } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: '00000000-0000-0000-0000-000000000000', text: 'hola' });
    expect(res.status).toBe(404);
  });
});

describe('POST /conversation — visión', () => {
  it('acepta una imagen adjunta y marca vision_used=true', async () => {
    const { app, token, sessionId } = await setup();
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', '¿Qué estoy viendo?')
      .attach('image', jpeg, { filename: 'frame.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.vision_used).toBe(true);
  });

  it('mantiene continuidad: una pregunta de seguimiento reutiliza la última imagen', async () => {
    const { app, token, sessionId } = await setup();
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', '¿Qué estoy viendo?')
      .attach('image', jpeg, { filename: 'frame.jpg', contentType: 'image/jpeg' });

    const followUp = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿Tiene PoE?' });

    expect(followUp.status).toBe(200);
    expect(followUp.body.vision_used).toBe(true);
  });

  it('sin imagen previa y pregunta que requiere visión -> vision_requested=true, no inventa respuesta', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿Qué estoy viendo?' });

    expect(res.status).toBe(200);
    expect(res.body.vision_requested).toBe(true);
    expect(res.body.vision_used).toBe(false);
  });

  it('rechaza un MIME de imagen inválido', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', 'mira esto')
      .attach('image', Buffer.from('not an image'), { filename: 'file.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ValidationError');
  });

  it('rechaza una imagen que excede el tamaño máximo configurado', async () => {
    const { app, token, sessionId } = await setup();
    const bigBuffer = Buffer.alloc(7 * 1024 * 1024, 1); // 7MB > VISION_MAX_IMAGE_MB(6) del test env
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', 'mira esto')
      .attach('image', bigBuffer, { filename: 'huge.jpg', contentType: 'image/jpeg' });

    expect([400, 413]).toContain(res.status);
  });
});

describe('POST /conversation — audio', () => {
  it('transcribe audio (mock STT) y responde', async () => {
    const { app, token, sessionId } = await setup();
    const fakeWav = Buffer.alloc(1000, 0);
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .attach('audio', fakeWav, { filename: 'ptt.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(res.body.transcription).toBeTruthy();
    expect(res.body.transcription.text).toBeTruthy();
  });

  it('rechaza un MIME de audio inválido', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .attach('audio', Buffer.from('nope'), { filename: 'file.exe', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
  });
});

describe('POST /conversation — instrumentación y contrato de respuesta (Mission 002)', () => {
  it('devuelve request_id (igual a response_id) y el header X-Request-Id', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿Qué hora es?' });

    expect(res.status).toBe(200);
    expect(res.body.request_id).toBeTruthy();
    expect(res.body.request_id).toBe(res.body.response_id);
    expect(res.headers['x-request-id']).toBe(res.body.request_id);
  });

  it('hace eco de audio_capture_ms (client-measured) en latency_ms', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: 'hola', audio_capture_ms: 842 });

    expect(res.status).toBe(200);
    expect(res.body.latency_ms.audio_capture_ms).toBe(842);
  });

  it('response_mode=wearable no rompe el flujo y se refleja en la respuesta', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: 'hola', response_mode: 'wearable' });

    expect(res.status).toBe(200);
    expect(res.body.response_mode).toBe('wearable');
  });

  it('vision_context_summary refleja el texto real ya devuelto por el LLM, no un valor inventado', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', '¿qué estoy viendo?')
      .attach('image', Buffer.from(TINY_JPEG_BASE64, 'base64'), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.vision_context_summary).toBeTruthy();
    expect(res.body.vision_context_summary.text).toBe(res.body.text);
  });

  it('vision_required trae status y reason cuando se necesita una imagen nueva', async () => {
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿qué estoy viendo?' });

    expect(res.status).toBe(200);
    expect(res.body.vision_requested).toBe(true);
    expect(res.body.vision_required).toMatchObject({ status: 'vision_required' });
    expect(typeof res.body.vision_required.reason).toBe('string');
  });
});

describe('POST /conversation — fallos de proveedores (Fase 22/44)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('si TTS falla, la respuesta sigue siendo 200 con el texto y audio=null (nunca se pierde el texto)', async () => {
    vi.spyOn(MockTTSProvider.prototype, 'speak').mockRejectedValueOnce(new Error('ElevenLabs caído (simulado)'));
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿Qué hora es?' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
    expect(res.body.audio).toBeNull();
    expect(res.body.audio_unavailable).toBe(true);
  });

  it('si STT falla, se devuelve un AudioError tipado (502) y NUNCA se llama al LLM con texto vacío/basura', async () => {
    vi.spyOn(MockSTTProvider.prototype, 'transcribe').mockRejectedValueOnce(new Error('Groq caído (simulado)'));
    const chatSpy = vi.spyOn(MockLLMProvider.prototype, 'chat');
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .attach('audio', Buffer.alloc(1000, 0), { filename: 'ptt.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AudioError');
    // Lo más importante: el fallo de transcripción nunca debe dejar pasar
    // texto vacío/basura al LLM — el request se aborta ANTES de llegar ahí.
    expect(chatSpy).not.toHaveBeenCalled();
  });

  it('si el LLM falla, se devuelve un LLMError tipado (502, DV_LLM_001), no un 500 genérico', async () => {
    vi.spyOn(MockLLMProvider.prototype, 'chat').mockRejectedValueOnce(new Error('Anthropic caído (simulado)'));
    const { app, token, sessionId } = await setup();
    const res = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿Qué hora es?' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('LLMError');
    expect(res.body.error.dv_code).toBe('DV_LLM_001');
    // El mensaje debe ser amigable, nunca la excepción cruda del proveedor.
    expect(res.body.error.message).not.toMatch(/Anthropic caído/);
  });
});
