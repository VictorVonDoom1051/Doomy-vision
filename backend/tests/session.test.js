import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, registerDevice, V1_PREFIX as V1 } from './helpers.js';

describe('device registration & auth', () => {
  it('rejects registration with wrong internal key', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/device/register`)
      .set('x-doomy-vision-key', 'wrong-key')
      .send({ device_id: 'd1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AuthenticationError');
  });

  it('registers a device and returns a bearer token', async () => {
    const app = makeApp();
    const token = await registerDevice(app, 'd1');
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT shape
  });

  it('rejects registration missing device_id', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/device/register`)
      .set('x-doomy-vision-key', process.env.DOOMY_VISION_INTERNAL_KEY)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ValidationError');
  });

  it('rejects protected routes without a token', async () => {
    const app = makeApp();
    const res = await request(app).post(`${V1}/session`).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a malformed/expired token', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/session`)
      .set('authorization', 'Bearer not-a-real-token')
      .send({});
    expect(res.status).toBe(401);
  });
});

describe('session lifecycle', () => {
  it('creates a session', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const res = await request(app)
      .post(`${V1}/session`)
      .set('authorization', `Bearer ${token}`)
      .send({ mode: 'mock' });
    expect(res.status).toBe(201);
    expect(res.body.session_id).toBeTruthy();
    expect(res.body.turns).toBe(0);
    expect(res.body.has_active_image).toBe(false);
  });

  it('returns 404 for an invalid session id', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const res = await request(app)
      .get(`${V1}/session/00000000-0000-0000-0000-000000000000`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NotFoundError');
  });

  it('resets a session', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const create = await request(app).post(`${V1}/session`).set('authorization', `Bearer ${token}`).send({});
    const sessionId = create.body.session_id;

    await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: 'hola' });

    const reset = await request(app).post(`${V1}/session/${sessionId}/reset`).set('authorization', `Bearer ${token}`).send({});
    expect(reset.status).toBe(200);
    expect(reset.body.turns).toBe(0);
  });
});
