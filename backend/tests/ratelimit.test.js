import { describe, it, expect, beforeEach, vi } from 'vitest';

// El rate limit se lee de config al montar la app, que a su vez lee env al
// importarse. Para probarlo de forma aislada, forzamos un límite muy bajo y
// reimportamos los módulos en un grafo fresco con vi.resetModules().
describe('rate limiting', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('devuelve 429 al superar RATE_LIMIT_MAX_PER_MINUTE', async () => {
    process.env.RATE_LIMIT_MAX_PER_MINUTE = '2';
    const { createApp } = await import('./../src/app.js');
    const request = (await import('supertest')).default;
    const app = createApp();

    const key = process.env.DOOMY_VISION_INTERNAL_KEY;
    const V1 = '/api/doomy-vision/v1';

    const r1 = await request(app).post(`${V1}/device/register`).set('x-doomy-vision-key', key).send({ device_id: 'a' });
    const r2 = await request(app).post(`${V1}/device/register`).set('x-doomy-vision-key', key).send({ device_id: 'b' });
    const r3 = await request(app).post(`${V1}/device/register`).set('x-doomy-vision-key', key).send({ device_id: 'c' });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);

    // restaurar para el resto de la suite
    process.env.RATE_LIMIT_MAX_PER_MINUTE = '1000';
  });
});
