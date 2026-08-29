import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, V1_PREFIX as V1, TINY_JPEG_BASE64 } from './helpers.js';

/**
 * Tests de `POST /ask` (Mission 004) — el endpoint de un solo golpe que usa
 * el Atajo de iOS invocado por Siri con los Ray-Ban puestos.
 *
 * Lo que importa verificar aquí y no está cubierto por `/conversation`:
 *  - autentica con la internal key, NO con JWT
 *  - no recibe `session_id`: mantiene continuidad por `device_id`
 *  - devuelve una forma plana con `audio_url` absoluta (los Atajos no saben
 *    navegar JSON anidado cómodamente)
 */

const KEY = () => process.env.DOOMY_VISION_INTERNAL_KEY;

describe('POST /ask — autenticación', () => {
  it('rechaza sin internal key', async () => {
    const app = makeApp();
    const res = await request(app).post(`${V1}/ask`).send({ text: 'hola' });
    expect(res.status).toBe(401);
  });

  it('rechaza con internal key incorrecta', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', 'clave-equivocada')
      .send({ text: 'hola' });
    expect(res.status).toBe(401);
  });

  it('acepta con la internal key correcta y NO requiere JWT', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: '¿Qué hora es?' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
    expect(res.body.session_id).toBeTruthy();
  });
});

describe('POST /ask — continuidad por device_id', () => {
  it('crea sesión en el primer turno y la reutiliza en el segundo', async () => {
    const app = makeApp();
    const deviceId = `test-ask-${Date.now()}`;

    const first = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: 'Hola', device_id: deviceId });
    expect(first.status).toBe(200);
    expect(first.body.session_created).toBe(true);

    const second = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: '¿Y ahora?', device_id: deviceId });
    expect(second.status).toBe(200);
    expect(second.body.session_created).toBe(false);
    expect(second.body.session_id).toBe(first.body.session_id);
  });

  it('dispositivos distintos no comparten sesión', async () => {
    const app = makeApp();
    const a = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: 'Hola', device_id: `dev-a-${Date.now()}` });
    const b = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: 'Hola', device_id: `dev-b-${Date.now()}` });

    expect(a.body.session_id).not.toBe(b.body.session_id);
  });

  it('reset=true limpia el historial pero responde igual', async () => {
    const app = makeApp();
    const deviceId = `test-reset-${Date.now()}`;

    await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: 'Primer turno', device_id: deviceId });

    const res = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: 'Turno nuevo', device_id: deviceId, reset: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
  });
});

describe('POST /ask — forma de la respuesta', () => {
  it('devuelve audio_url absoluta, no relativa', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .send({ text: 'Hola Doomy' });

    expect(res.status).toBe(200);
    if (res.body.audio_url) {
      expect(res.body.audio_url).toMatch(/^https?:\/\//);
      expect(res.body.audio_url).toContain('/api/doomy-vision/v1/audio/');
    }
  });

  it('procesa una imagen adjunta y marca vision_used', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .field('text', '¿Qué estoy viendo?')
      .field('device_id', `test-img-${Date.now()}`)
      .attach('image', Buffer.from(TINY_JPEG_BASE64, 'base64'), 'frame.jpg');

    expect(res.status).toBe(200);
    expect(res.body.vision_used).toBe(true);
    expect(res.body.vision_requested).toBe(false);
  });

  it('rechaza sin texto ni audio', async () => {
    const app = makeApp();
    const res = await request(app).post(`${V1}/ask`).set('x-doomy-vision-key', KEY()).send({});
    expect(res.status).toBe(400);
  });

  // Bug real encontrado probando /ask contra producción: los Atajos de iOS
  // mandan `application/x-www-form-urlencoded` cuando el body es "Form" sin
  // archivo adjunto. Sin `express.urlencoded`, req.body llegaba vacío y una
  // pregunta de solo texto desde el Atajo devolvía 400.
  it('acepta un body form-urlencoded (el que manda un Atajo sin imagen)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`${V1}/ask`)
      .set('x-doomy-vision-key', KEY())
      .type('form')
      .send({ text: '¿Qué hora es?', device_id: `test-form-${Date.now()}` });

    expect(res.status).toBe(200);
    expect(res.body.text).toBeTruthy();
  });
});
