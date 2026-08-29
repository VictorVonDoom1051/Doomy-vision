import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp, registerDevice, createSession, V1_PREFIX as V1 } from './helpers.js';
import { MockLLMProvider } from './../src/providers/llm.js';

/**
 * Fase 31-35/53-55 (Mission 002): sanity de concurrencia y recuperación de
 * errores. No son pruebas de carga real (eso requeriría un entorno
 * dedicado) — son pruebas ligeras que demuestran, con evidencia real, que
 * el diseño en memoria (`SessionStore` como `Map` por `session.id`, sin
 * estado global compartido entre requests) se sostiene bajo concurrencia
 * moderada y que un fallo de proveedor no deja el proceso en un estado
 * roto para requests futuros.
 */

describe('Concurrencia — 5-10 requests simultáneos (Fase 53)', () => {
  it('10 conversaciones simultáneas en 10 sesiones distintas: sin crash, sin mezclar sesiones, request_id únicos', async () => {
    const app = makeApp();
    const N = 10;
    const tokens = await Promise.all(Array.from({ length: N }, (_, i) => registerDevice(app, `concurrent-device-${i}`)));
    const sessions = await Promise.all(tokens.map((t) => createSession(app, t, { mode: 'mock' })));

    const responses = await Promise.all(
      sessions.map((s, i) =>
        request(app)
          .post(`${V1}/conversation`)
          .set('authorization', `Bearer ${tokens[i]}`)
          .send({ session_id: s.session_id, text: `pregunta ${i}` })
      )
    );

    responses.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe(sessions[i].session_id);
    });

    const requestIds = responses.map((r) => r.body.request_id);
    expect(new Set(requestIds).size).toBe(N); // ninguno se repite bajo concurrencia
  });

  it('10 requests simultáneos DENTRO de la misma sesión no corrompen el historial (cada turno se agrega, ninguno se pierde silenciosamente)', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const session = await createSession(app, token, { mode: 'mock' });
    const N = 8;

    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        request(app)
          .post(`${V1}/conversation`)
          .set('authorization', `Bearer ${token}`)
          .send({ session_id: session.session_id, text: `mensaje concurrente ${i}` })
      )
    );

    responses.forEach((res) => expect(res.status).toBe(200));
    const requestIds = responses.map((r) => r.body.request_id);
    expect(new Set(requestIds).size).toBe(N);

    // El historial final debe reflejar exactamente 2*N turnos (user+assistant
    // por cada uno de los N requests) — sin turnos perdidos ni duplicados,
    // aunque MAX_CONVERSATION_HISTORY pueda haber recortado el principio.
    const finalSession = await request(app).get(`${V1}/session/${session.session_id}`).set('authorization', `Bearer ${token}`);
    expect(finalSession.status).toBe(200);
    expect(finalSession.body.turns).toBe(N); // `turns` cuenta solo turnos de usuario
  });
});

describe('Recuperación de errores — la sesión sigue funcionando después de un fallo de proveedor (Fase 22/44)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('un fallo del LLM en un turno no deja la sesión ni el proceso en un estado roto para el siguiente turno', async () => {
    const app = makeApp();
    const token = await registerDevice(app);
    const session = await createSession(app, token, { mode: 'mock' });

    vi.spyOn(MockLLMProvider.prototype, 'chat').mockRejectedValueOnce(new Error('Anthropic caído (simulado, una sola vez)'));

    const failedTurn = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: session.session_id, text: 'esto va a fallar' });
    expect(failedTurn.status).toBe(502);
    expect(failedTurn.body.error.code).toBe('LLMError');

    // Sin reiniciar el proceso ni la app: el siguiente turno, en la MISMA
    // sesión, debe funcionar normalmente — el fallo era de una llamada
    // puntual al proveedor, no de la sesión ni del servidor.
    const recoveredTurn = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: session.session_id, text: '¿sigues ahí?' });
    expect(recoveredTurn.status).toBe(200);
    expect(recoveredTurn.body.text).toBeTruthy();

    // La sesión conserva su identidad — no se creó una sesión nueva ni se
    // perdió el turno fallido de forma que rompiera el conteo.
    const finalSession = await request(app).get(`${V1}/session/${session.session_id}`).set('authorization', `Bearer ${token}`);
    expect(finalSession.status).toBe(200);
    expect(finalSession.body.turns).toBe(1); // solo el turno exitoso quedó registrado en el historial
  });

  it('un fallo de TTS no impide que turnos posteriores en la misma sesión generen audio normalmente', async () => {
    const { MockTTSProvider } = await import('./../src/providers/tts.js');
    const app = makeApp();
    const token = await registerDevice(app);
    const session = await createSession(app, token, { mode: 'mock' });

    vi.spyOn(MockTTSProvider.prototype, 'speak').mockRejectedValueOnce(new Error('ElevenLabs caído (simulado, una sola vez)'));

    const degraded = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: session.session_id, text: 'primer turno, sin audio' });
    expect(degraded.status).toBe(200);
    expect(degraded.body.audio).toBeNull();
    expect(degraded.body.audio_unavailable).toBe(true);

    const recovered = await request(app)
      .post(`${V1}/conversation`)
      .set('authorization', `Bearer ${token}`)
      .send({ session_id: session.session_id, text: 'segundo turno, con audio de nuevo' });
    expect(recovered.status).toBe(200);
    expect(recovered.body.audio).toBeTruthy();
    expect(recovered.body.audio_unavailable).toBe(false);
  });
});
