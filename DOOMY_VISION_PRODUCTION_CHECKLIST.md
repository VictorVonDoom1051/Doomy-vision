# Doomy Vision — Production Checklist

Checklist mecánico para cuando Victor decida desplegar. Cada ítem indica si ya quedó
verificado esta misión (con evidencia real en `DOOMY_VISION_MISSION_002_REPORT.md`) o si
requiere una acción de Victor al momento del deploy real.

## Tests

- [x] Suite de backend en verde antes de cualquier deploy (`cd backend && npm test`) —
      55/55 PASS, confirmado en esta misión.
- [x] Suite de Bridge `:core` en verde (`cd bridge-android/core && gradle test`) —
      26/26 PASS, heredado de Mission 001, no tocado esta misión.
- [ ] (Al desplegar) Re-correr `npm test` contra el commit exacto que se va a desplegar,
      no confiar en una corrida vieja.

## Secretos

- [ ] `DOOMY_VISION_INTERNAL_KEY` generado con `openssl rand -hex 32` (no un valor
      trivial) y cargado como variable de entorno en Railway, nunca en el repo.
- [ ] `DOOMY_VISION_JWT_SECRET` generado igual, distinto del anterior.
- [ ] `ANTHROPIC_API_KEY` real cargada (o decisión consciente de lanzar con
      `DOOMY_VISION_MOCK_MODE=true` + `ALLOW_MOCK_IN_PRODUCTION=true`, documentada como
      tal).
- [ ] `GROQ_API_KEY` / `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` cargadas si se quiere
      voz real desde el día uno (opcional — sin ellas, STT/TTS caen a mock
      individualmente sin bloquear el arranque).

## Modo mock deshabilitado

- [x] `assertProductionReady()` bloquea el arranque si `NODE_ENV=production` +
      `DOOMY_VISION_MOCK_MODE=true` sin `ALLOW_MOCK_IN_PRODUCTION=true` — verificado
      con una corrida real esta misión (ver reporte).
- [ ] Confirmar `DOOMY_VISION_MOCK_MODE=false` en las variables de Railway antes del
      primer deploy real (o la decisión consciente de mock, ver arriba).

## Auth habilitada

- [x] `requireAccessToken` y `verifyInternalKey` ya exigen configuración real fuera de
      mock mode — sin `DOOMY_VISION_JWT_SECRET`, ninguna ruta protegida funciona.
- [x] Comparación de `DOOMY_VISION_INTERNAL_KEY` en tiempo constante
      (`crypto.timingSafeEqual`) — verificado esta misión.
- [ ] Confirmar que el internal key nunca quedó commiteado en el repo (`git log -p` no
      debería mostrarlo — el `.env` real nunca se trackeó, confirmado en
      `MISSION_002_BASELINE.md`).

## Conectividad de proveedores

- [ ] (Al desplegar) `GET /diagnostics` en el servicio real debe reportar
      `providers.llm: "ANTHROPIC"` si se configuró `ANTHROPIC_API_KEY`.
- [ ] Un primer `POST /conversation` de texto simple contra el servicio real desplegado,
      para confirmar que la llave de Anthropic funciona — el primer momento razonable
      para 1-3 llamadas reales pagadas, si Victor lo autoriza.

## Rate limiting

- [x] Límite general (`RATE_LIMIT_MAX_PER_MINUTE`) y diferenciado para `/vision` y
      `/audio/*` (`RATE_LIMIT_VISION_AUDIO_MAX_PER_MINUTE`) implementados y probados
      como independientes entre sí esta misión.
- [ ] Revisar si los defaults (60/min general, 30/min vision+audio) tienen sentido para
      el volumen esperado real, ajustar si hace falta.

## Health

- [x] `/health/live` y `/health/ready` implementados y separados, verificados con una
      corrida real en modo producción simulado esta misión.
- [x] `railway.toml` apunta el healthcheck de Railway a `/health/ready`, no `/health/live`.

## HTTPS

- [x] Railway sirve HTTPS automáticamente en todos sus dominios (`*.up.railway.app` y
      dominios propios configurados) — no requiere ninguna configuración de este backend.
- [ ] Si se usa un dominio propio, confirmar que el certificado TLS se emitió
      correctamente desde el dashboard de Railway antes de anunciar el servicio.

## CORS

- [x] `CORS_ALLOWED_ORIGINS` configurable por entorno, probado esta misión (con y sin
      lista fijada).
- [ ] Si algún cliente basado en navegador va a llamar al backend directamente (no el
      Bridge nativo), fijar `CORS_ALLOWED_ORIGINS` explícitamente antes de lanzar.

## Logging

- [x] Redacción de `pino` verificada activa (nunca loguea `authorization`,
      `x-doomy-vision-key`, api keys, imágenes ni audio completos) — confirmado con
      logs reales generados esta misión.
- [ ] Configurar `LOG_LEVEL` en Railway si se quiere menos verbosidad que `info` en
      producción (opcional, default razonable).

## Límites de costo

- [x] `MAX_RESPONSE_TOKENS`, `MAX_CONVERSATION_HISTORY`, límites de imagen/audio, y
      timeout de proveedor todos configurables vía env, ninguno hardcodeado.
- [ ] Revisar los defaults contra el presupuesto real esperado antes de un lanzamiento
      con tráfico de verdad.

## Rollback

- [x] Documentado en `docs/DOOMY_VISION_RAILWAY_DEPLOY.md §6` — Railway conserva deploys
      anteriores, `Redeploy` es el rollback.

## Smoke test

- [ ] Después de desplegar: registrar un device, crear una sesión, mandar un texto
      simple, confirmar respuesta — el checklist exacto está en
      `docs/DOOMY_VISION_RAILWAY_DEPLOY.md §5`.

---

**Ítems marcados `[x]`**: verificados con evidencia real esta misión (no asumidos).
**Ítems marcados `[ ]`**: requieren una acción de Victor al momento del deploy real —
ninguno se puede marcar por adelantado sin el servicio real desplegado.
