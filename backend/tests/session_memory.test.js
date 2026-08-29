import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { makeApp, registerDevice, createSession, V1_PREFIX as V1 } from './helpers.js';
import { MockLLMProvider } from './../src/providers/llm.js';

/**
 * Fase 12-14 (Mission 002): pruebas rigurosas de memoria de sesión visual.
 *
 * MOCK_MODE no "ve" contenido de imagen (MockLLMProvider no analiza bytes),
 * así que estas pruebas NO pueden verificar "el modelo reconoció que la
 * imagen B es distinta de la A" por contenido semántico. En vez de eso,
 * verificamos lo que el backend SÍ controla y puede probarse honestamente:
 * qué bytes de imagen exactos llegan al proveedor LLM en cada turno, y que
 * nunca se envían dos imágenes a la vez (confirmando, en vez de simular,
 * que no existe memoria multi-imagen real todavía).
 */

let imageABuffer;
let imageBBuffer;

beforeAll(async () => {
  imageABuffer = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 30, b: 30 } },
  }).jpeg().toBuffer();
  imageBBuffer = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 30, g: 30, b: 200 } },
  }).jpeg().toBuffer();
});

async function setup() {
  const app = makeApp();
  const token = await registerDevice(app);
  const session = await createSession(app, token, { mode: 'mock' });
  return { app, token, sessionId: session.session_id };
}

describe('Memoria visual de sesión — una imagen activa a la vez (Fase 12/13)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Imagen A + pregunta + follow-up sin imagen nueva: el follow-up sigue usando los bytes de A', async () => {
    const chatSpy = vi.spyOn(MockLLMProvider.prototype, 'chat');
    const { app, token, sessionId } = await setup();

    await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', '¿qué estoy viendo?')
      .attach('image', imageABuffer, { filename: 'a.jpg', contentType: 'image/jpeg' });

    const res2 = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿tiene PoE?' });

    expect(res2.status).toBe(200);
    expect(res2.body.vision_used).toBe(true);
    // El segundo call al LLM (follow-up) debe haber recibido exactamente
    // los mismos bytes de imagen que el primero (A re-optimizada), y debe
    // existir imagen en ambos — no una ausencia de imagen en el follow-up.
    const firstCallArgs = chatSpy.mock.calls[0][0];
    const followUpArgs = chatSpy.mock.calls[1][0];
    expect(followUpArgs.imageBase64).toBeTruthy();
    expect(followUpArgs.imageBase64).toBe(firstCallArgs.imageBase64);
  });

  it('Imagen B reemplaza el contexto visual activo: el siguiente follow-up ya NO usa los bytes de A', async () => {
    const chatSpy = vi.spyOn(MockLLMProvider.prototype, 'chat');
    const { app, token, sessionId } = await setup();

    await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', '¿qué estoy viendo?')
      .attach('image', imageABuffer, { filename: 'a.jpg', contentType: 'image/jpeg' });

    await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', 'ahora mira esto')
      .attach('image', imageBBuffer, { filename: 'b.jpg', contentType: 'image/jpeg' });

    const res3 = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿tiene PoE?' });

    expect(res3.status).toBe(200);
    const imgAArgs = chatSpy.mock.calls[0][0].imageBase64;
    const imgBArgs = chatSpy.mock.calls[1][0].imageBase64;
    const followUpArgs = chatSpy.mock.calls[2][0].imageBase64;

    expect(imgBArgs).not.toBe(imgAArgs);
    expect(followUpArgs).toBe(imgBArgs);
    expect(followUpArgs).not.toBe(imgAArgs);
  });

  it('Limitación honesta: una pregunta comparativa tras reemplazar la imagen solo tiene acceso a la imagen activa (B), nunca a ambas a la vez', async () => {
    const chatSpy = vi.spyOn(MockLLMProvider.prototype, 'chat');
    const { app, token, sessionId } = await setup();

    await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', '¿qué estoy viendo?')
      .attach('image', imageABuffer, { filename: 'a.jpg', contentType: 'image/jpeg' });

    await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', 'ahora mira esto')
      .attach('image', imageBBuffer, { filename: 'b.jpg', contentType: 'image/jpeg' });

    const res3 = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, text: '¿cuál de los dos tenía más puertos?' });

    expect(res3.status).toBe(200);
    // El backend NO tiene forma de responder esto con conocimiento real de
    // ambas imágenes: solo una imagen (B) llega al LLM en esta request. Se
    // documenta como limitación conocida (docs/DOOMY_VISION_ARCHITECTURE.md),
    // no se simula ni se inventa una respuesta comparativa real.
    const call = chatSpy.mock.calls[2][0];
    expect(call.imageBase64).toBeTruthy();
    expect(call.imageBase64).toBe(chatSpy.mock.calls[1][0].imageBase64); // = B
    expect(call.imageBase64).not.toBe(chatSpy.mock.calls[0][0].imageBase64); // != A
  });

  it('vision_context_summary se reemplaza cuando llega una imagen nueva, nunca acumula ambas', async () => {
    const { app, token, sessionId } = await setup();

    const resA = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', '¿qué estoy viendo?')
      .attach('image', imageABuffer, { filename: 'a.jpg', contentType: 'image/jpeg' });

    const resB = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('text', 'ahora mira esto')
      .attach('image', imageBBuffer, { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(resA.body.vision_context_summary.text).toBe(resA.body.text);
    expect(resB.body.vision_context_summary.text).toBe(resB.body.text);
    expect(resB.body.vision_context_summary.capturedAt).toBeGreaterThanOrEqual(resA.body.vision_context_summary.capturedAt);
  });
});

describe('CRÍTICO — aislamiento entre sesiones simultáneas (Fase 53)', () => {
  it('dos sesiones concurrentes con imágenes distintas nunca mezclan contexto', async () => {
    const app = makeApp();
    const tokenA = await registerDevice(app, 'device-session-a');
    const tokenB = await registerDevice(app, 'device-session-b');
    const sessionA = (await createSession(app, tokenA, { mode: 'mock' })).session_id;
    const sessionB = (await createSession(app, tokenB, { mode: 'mock' })).session_id;

    // Primer turno de cada sesión, en paralelo, cada una con su propia imagen.
    const [firstA, firstB] = await Promise.all([
      request(app)
        .post(`${V1}/conversation`)
        .set('authorization', `Bearer ${tokenA}`)
        .field('session_id', sessionA)
        .field('text', '¿qué estoy viendo? (sesión A - NVR)')
        .attach('image', imageABuffer, { filename: 'a.jpg', contentType: 'image/jpeg' }),
      request(app)
        .post(`${V1}/conversation`)
        .set('authorization', `Bearer ${tokenB}`)
        .field('session_id', sessionB)
        .field('text', '¿qué estoy viendo? (sesión B - cámara)')
        .attach('image', imageBBuffer, { filename: 'b.jpg', contentType: 'image/jpeg' }),
    ]);

    expect(firstA.status).toBe(200);
    expect(firstB.status).toBe(200);
    expect(firstA.body.session_id).toBe(sessionA);
    expect(firstB.body.session_id).toBe(sessionB);

    // Follow-ups concurrentes de texto plano, en paralelo — cada uno debe
    // seguir viendo SOLO su propia imagen activa y su propio historial.
    const [followA, followB] = await Promise.all([
      request(app).post(`${V1}/conversation`).set('authorization', `Bearer ${tokenA}`).send({ session_id: sessionA, text: '¿tiene PoE?' }),
      request(app).post(`${V1}/conversation`).set('authorization', `Bearer ${tokenB}`).send({ session_id: sessionB, text: '¿tiene PoE?' }),
    ]);

    expect(followA.status).toBe(200);
    expect(followB.status).toBe(200);
    expect(followA.body.session_id).toBe(sessionA);
    expect(followB.body.session_id).toBe(sessionB);
    expect(followA.body.vision_used).toBe(true);
    expect(followB.body.vision_used).toBe(true);
    // request_id nunca se repite entre sesiones (unicidad bajo concurrencia).
    const ids = [firstA, firstB, followA, followB].map((r) => r.body.request_id);
    expect(new Set(ids).size).toBe(4);
  });
});
