import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp, registerDevice, createSession, V1_PREFIX as V1 } from './helpers.js';

describe('Fase 15-24 (Mission 002) — endurecimiento de seguridad', () => {
  describe('health: liveness vs readiness', () => {
    it('GET /health y /health/live responden igual (compatibilidad hacia atrás)', async () => {
      const app = makeApp();
      const a = await request(app).get(`${V1}/health`);
      const b = await request(app).get(`${V1}/health/live`);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.status).toBe('ok');
      expect(b.body.status).toBe('ok');
    });

    it('GET /health/ready es 200 en mock mode (no exige credenciales reales)', async () => {
      const app = makeApp();
      const res = await request(app).get(`${V1}/health/ready`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.problems).toEqual([]);
    });
  });

  describe('cabeceras de seguridad (helmet)', () => {
    it('las respuestas incluyen cabeceras de seguridad estándar', async () => {
      const app = makeApp();
      const res = await request(app).get(`${V1}/health`);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('errores de Multer', () => {
    it('un archivo que excede el límite de Multer se traduce en 413 ValidationError, no en un 500 crudo', async () => {
      const app = makeApp();
      const token = await registerDevice(app);
      const session = await createSession(app, token, { mode: 'mock' });
      // VISION_MAX_IMAGE_MB=6 en el entorno de test -> el límite del propio
      // multer en conversation.js es max(visionMaxImageMb, audioMaxMb) MB.
      const huge = Buffer.alloc(11 * 1024 * 1024, 1);
      const res = await request(app)
        .post(`${V1}/conversation`)
        .set('authorization', `Bearer ${token}`)
        .field('session_id', session.session_id)
        .field('text', 'mira esto')
        .attach('image', huge, { filename: 'huge.jpg', contentType: 'image/jpeg' });

      expect([400, 413]).toContain(res.status);
      expect(res.body.error.code).toBe('ValidationError');
      expect(res.body.error.dv_code).toBe('DV_VALIDATION_001');
    });
  });

  describe('vision_audio rate limiter separado del general', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('/vision tiene su propio límite (RATE_LIMIT_VISION_AUDIO_MAX_PER_MINUTE), independiente del general', async () => {
      process.env.RATE_LIMIT_MAX_PER_MINUTE = '1000';
      process.env.RATE_LIMIT_VISION_AUDIO_MAX_PER_MINUTE = '1';
      const { createApp } = await import('./../src/app.js');
      const req2 = (await import('supertest')).default;
      const app = createApp();
      const key = process.env.DOOMY_VISION_INTERNAL_KEY;

      const reg = await req2(app).post(`${V1}/device/register`).set('x-doomy-vision-key', key).send({ device_id: 'vis-1' });
      const token = reg.body.access_token;
      const sess = await req2(app).post(`${V1}/session`).set('authorization', `Bearer ${token}`).send({ mode: 'mock' });
      const sessionId = sess.body.session_id;

      const tinyJpeg = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
        'base64'
      );

      const r1 = await req2(app).post(`${V1}/vision`).set('authorization', `Bearer ${token}`).field('session_id', sessionId).attach('image', tinyJpeg, { filename: 'a.jpg', contentType: 'image/jpeg' });
      const r2 = await req2(app).post(`${V1}/vision`).set('authorization', `Bearer ${token}`).field('session_id', sessionId).attach('image', tinyJpeg, { filename: 'b.jpg', contentType: 'image/jpeg' });
      // El límite general (1000/min) no se agotó -> /device y /session (arriba) funcionaron.
      // /vision con límite=1 debe agotarse en la segunda llamada.
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(429);

      // El límite general sigue disponible para /session, aunque /vision ya se haya agotado.
      const sessCheck = await req2(app).get(`${V1}/session/${sessionId}`).set('authorization', `Bearer ${token}`);
      expect(sessCheck.status).toBe(200);

      process.env.RATE_LIMIT_VISION_AUDIO_MAX_PER_MINUTE = '30';
    });
  });

  describe('CORS configurable por entorno', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('con CORS_ALLOWED_ORIGINS vacío, cualquier origen recibe Access-Control-Allow-Origin (comportamiento actual)', async () => {
      const { createApp } = await import('./../src/app.js');
      const req2 = (await import('supertest')).default;
      const app = createApp();
      const res = await req2(app).get(`${V1}/health`).set('Origin', 'https://cualquier-sitio.example');
      expect(res.headers['access-control-allow-origin']).toBeTruthy();
    });

    it('con CORS_ALLOWED_ORIGINS fijado, un origen no listado no recibe la cabecera de permiso', async () => {
      process.env.CORS_ALLOWED_ORIGINS = 'https://permitido.example';
      const { createApp } = await import('./../src/app.js');
      const req2 = (await import('supertest')).default;
      const app = createApp();

      const allowed = await req2(app).get(`${V1}/health`).set('Origin', 'https://permitido.example');
      expect(allowed.headers['access-control-allow-origin']).toBe('https://permitido.example');

      const blocked = await req2(app).get(`${V1}/health`).set('Origin', 'https://no-permitido.example');
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();

      process.env.CORS_ALLOWED_ORIGINS = '';
    });
  });

  describe('detalles de error ocultos al cliente en producción para 5xx', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('en producción, un LLMError 502 no expone `details` al cliente (solo a logs)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DOOMY_VISION_MOCK_MODE = 'true'; // sigue en mock para no requerir credenciales reales
      process.env.ALLOW_MOCK_IN_PRODUCTION = 'true';
      const { toHttpResponse, LLMError } = await import('./../src/errors.js');
      const err = new LLMError(undefined, { details: { provider_status: 500, raw: 'detalle interno sensible' } });
      const { body } = toHttpResponse(err, { nodeEnv: 'production' });
      expect(body.error.details).toBeUndefined();

      // en desarrollo, sí se conserva (útil para depurar localmente)
      const { body: devBody } = toHttpResponse(err, { nodeEnv: 'development' });
      expect(devBody.error.details).toBeTruthy();

      process.env.NODE_ENV = 'test';
      process.env.ALLOW_MOCK_IN_PRODUCTION = 'false';
    });
  });

  describe('timeout de request (Fase 21)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('un handler que tarda más que REQUEST_TIMEOUT_MS + margen recibe un TimeoutError 504 real, end-to-end', async () => {
      vi.resetModules();
      process.env.REQUEST_TIMEOUT_MS = '30';
      process.env.REQUEST_TIMEOUT_MARGIN_MS = '20'; // total 50ms — el LLM mock tarda 300ms, así que dispara
      const { createApp } = await import('./../src/app.js');
      const req2 = (await import('supertest')).default;
      const { MockLLMProvider: FreshMockLLM } = await import('./../src/providers/llm.js');
      vi.spyOn(FreshMockLLM.prototype, 'chat').mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ text: 'tarde', toolCalls: [], usage: {} }), 300))
      );

      const app = createApp();
      const key = process.env.DOOMY_VISION_INTERNAL_KEY;
      const reg = await req2(app).post(`${V1}/device/register`).set('x-doomy-vision-key', key).send({ device_id: 'timeout-1' });
      const token = reg.body.access_token;
      const sess = await req2(app).post(`${V1}/session`).set('authorization', `Bearer ${token}`).send({ mode: 'mock' });

      const res = await req2(app)
        .post(`${V1}/conversation`)
        .set('authorization', `Bearer ${token}`)
        .send({ session_id: sess.body.session_id, text: 'esto va a tardar' });

      expect(res.status).toBe(504);
      expect(res.body.error.code).toBe('TimeoutError');
      expect(res.body.error.dv_code).toBe('DV_TIMEOUT_001');

      delete process.env.REQUEST_TIMEOUT_MARGIN_MS;
      process.env.REQUEST_TIMEOUT_MS = '20000';
    });
  });

  describe('arranque bloqueado: NODE_ENV=production + MOCK_MODE=true sin escape hatch', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('assertProductionReady() reporta el problema cuando production+mock coinciden sin ALLOW_MOCK_IN_PRODUCTION', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DOOMY_VISION_MOCK_MODE = 'true';
      delete process.env.ALLOW_MOCK_IN_PRODUCTION;
      const { assertProductionReady } = await import('./../src/config.js');
      const problems = assertProductionReady();
      expect(problems.some((p) => p.includes('MOCK_MODE'))).toBe(true);

      process.env.NODE_ENV = 'test';
    });

    it('con ALLOW_MOCK_IN_PRODUCTION=true, ya no se reporta ese problema', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DOOMY_VISION_MOCK_MODE = 'true';
      process.env.ALLOW_MOCK_IN_PRODUCTION = 'true';
      const { assertProductionReady } = await import('./../src/config.js');
      const problems = assertProductionReady();
      expect(problems.some((p) => p.includes('MOCK_MODE'))).toBe(false);

      process.env.NODE_ENV = 'test';
      process.env.ALLOW_MOCK_IN_PRODUCTION = 'false';
    });
  });
});
