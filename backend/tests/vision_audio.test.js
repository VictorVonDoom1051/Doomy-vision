import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, registerDevice, createSession, V1_PREFIX as V1, TINY_JPEG_BASE64 } from './helpers.js';

describe('POST /vision', () => {
  it('sube una imagen y la registra como última imagen activa de la sesión', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const session = await createSession(app, token, {});
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');

    const res = await request(app)
      .post(`${V1}/vision`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', session.session_id)
      .attach('image', jpeg, { filename: 'frame.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.image.width).toBeGreaterThan(0);
    expect(res.body.image.compressed_bytes).toBeGreaterThan(0);

    const check = await request(app).get(`${V1}/session/${session.session_id}`).set('authorization', `Bearer ${token}`);
    expect(check.body.has_active_image).toBe(true);
  });

  it('con remember=true devuelve una respuesta explícita (no persiste de verdad — interfaz preparada)', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const session = await createSession(app, token, {});
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');

    const res = await request(app)
      .post(`${V1}/vision`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', session.session_id)
      .field('remember', 'true')
      .attach('image', jpeg, { filename: 'frame.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.remembered.stored).toBe(false);
    expect(res.body.remembered.reason).toMatch(/no está conectada/);
  });

  it('rechaza sin session_id', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    const res = await request(app)
      .post(`${V1}/vision`)
      .set('authorization', `Bearer ${token}`)
      .attach('image', jpeg, { filename: 'frame.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });
});

describe('POST /audio/transcribe y /audio/speak', () => {
  it('transcribe audio con el proveedor mock', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const res = await request(app)
      .post(`${V1}/audio/transcribe`)
      .set('authorization', `Bearer ${token}`)
      .attach('audio', Buffer.alloc(500, 1), { filename: 'ptt.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
  });

  it('genera audio con el proveedor mock y permite descargarlo', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const res = await request(app)
      .post(`${V1}/audio/speak`)
      .set('authorization', `Bearer ${token}`)
      .send({ text: 'Hola, soy Doomy.' });

    expect(res.status).toBe(200);
    expect(res.body.audio.url).toMatch(/\/audio\//);

    const download = await request(app).get(res.body.audio.url);
    expect(download.status).toBe(200);
    expect(download.body.length).toBeGreaterThan(0);
  });

  it('/audio/:id inexistente devuelve 404', async () => {
    const app = makeApp();
    const res = await request(app).get(`${V1}/audio/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });

  it('/audio/speak sin texto -> 400', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const res = await request(app).post(`${V1}/audio/speak`).set('authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('health & diagnostics', () => {
  it('GET /health no requiere auth', async () => {
    const app = makeApp();
    const res = await request(app).get(`${V1}/health`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /diagnostics reporta modo mock y proveedores', async () => {
    const app = makeApp();
    const res = await request(app).get(`${V1}/diagnostics`);
    expect(res.status).toBe(200);
    expect(res.body.mock_mode).toBe(true);
    expect(res.body.providers.llm).toBe('MOCK');
  });

  it('GET /diagnostics expone límites operativos no secretos (para que el Bridge/simulador se auto-ajuste)', async () => {
    const app = makeApp();
    const res = await request(app).get(`${V1}/diagnostics`);
    expect(res.status).toBe(200);
    expect(res.body.limits).toBeTruthy();
    expect(typeof res.body.limits.audio_max_seconds).toBe('number');
    expect(typeof res.body.limits.audio_max_mb).toBe('number');
    // nunca debe filtrar secretos en este payload
    const asString = JSON.stringify(res.body);
    expect(asString).not.toMatch(/internalKey|api_key|apiKey|jwtSecret/i);
  });

  it('ruta desconocida devuelve 404 estructurado', async () => {
    const app = makeApp();
    const res = await request(app).get('/no/existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NotFoundError');
  });
});
