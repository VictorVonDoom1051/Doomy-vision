import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, registerDevice, createSession, V1_PREFIX as V1, TINY_JPEG_BASE64 } from './helpers.js';

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
