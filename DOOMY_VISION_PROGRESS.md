# Doomy Vision — Progress

_Actualizado durante la sesión, no solo al final. Este documento cubre dos misiones:
Mission 001 (construcción inicial) y Mission 002 (endurecimiento + pipeline real), en ese
orden cronológico. Mission 002 se agrega arriba porque es el estado más reciente; la
sección Mission 001 se conserva abajo sin editar como historial._

---

## MISSION 002 — Estado actual (el más reciente)

### COMPLETED

- **Baseline re-verificado desde cero** (no asumido): `rm -rf node_modules && npm install
  && npm test` → 30/30 backend heredado confirmado real; `rm -rf core/build .gradle &&
  gradle test` → 26/26 Kotlin `:core` confirmado real. Detalle completo en
  `MISSION_002_BASELINE.md`.
- **Providers reales auditados y actualizados**: `@anthropic-ai/sdk` 0.32.1 → 0.122.0,
  modelo `claude-sonnet-5` verificado contra documentación oficial vigente. Groq (Whisper)
  y ElevenLabs auditados contra su documentación oficial actual — código correcto, pero
  **sin credenciales reales disponibles en este entorno** (ver `DOOMY_VISION_BLOCKERS.md`
  BLOCKER 5), así que quedan **IMPLEMENTED NOT VERIFIED**, nunca "REAL VERIFIED".
- **Pipeline completo instrumentado**: `upload_ms`, `vision_prepare_ms` (renombrado desde
  `vision_ms`), `audio_capture_ms` (eco del cliente), `request_id`/`X-Request-Id`,
  `response_mode` (`screen`/`wearable`, con sufijo de brevedad para lentes), manejo
  explícito de fallos de proveedor: STT/LLM ahora normalizan cualquier excepción cruda a
  errores tipados (`AudioError`/`LLMError`) en vez de dejar pasar un 500 genérico; **TTS
  fallido nunca tira el turno completo** — responde 200 con `audio: null` +
  `audio_unavailable: true`, el texto siempre llega. `vision_context_summary` (el texto ya
  generado por el LLM sobre la imagen activa, nunca una segunda llamada de resumen) y
  `vision_required` (razón explícita cuando hace falta una imagen nueva) agregados al
  contrato de respuesta.
- **Memoria de sesión probada rigurosamente**: imagen activa persiste correctamente en
  follow-ups, se reemplaza por completo (no acumula) con una imagen nueva,
  `vision_context_summary` se reemplaza junto con ella. **Limitación real documentada
  honestamente** (no simulada): no existe memoria multi-imagen — una pregunta comparativa
  entre dos fotos distintas no puede responderse porque la primera ya no existe en memoria
  cuando llega la segunda (`docs/DOOMY_VISION_ARCHITECTURE.md §4.2.1`).
- **Aislamiento entre sesiones concurrentes verificado con una prueba real** (crítico):
  dos sesiones simultáneas con imágenes distintas y follow-ups propios, vía `Promise.all`,
  nunca cruzan `session_id` ni contexto — confirmado, no asumido.
- **Developer Console móvil endurecido**: push-to-talk real con máquina de estados visible
  (`IDLE/LISTENING/PROCESSING/SPEAKING/ERROR`), protección contra doble-inicio, parada
  automática por duración máxima, cancelación por gesto fuera de los límites del botón /
  `visibilitychange` / `blur`, detección de MIME segura para Safari (`pickMimeType()`),
  manejo de `online`/`offline`, credenciales enmascaradas con toggle de visibilidad.
  Verificado funcional con Playwright en emulación de viewport móvil real (iPhone 13),
  incluyendo reproducción real de audio (`readyState`).
- **Seguridad endurecida**: `helmet`, CORS configurable por entorno
  (`CORS_ALLOWED_ORIGINS`), rate limiting diferenciado (general vs. visión/audio),
  comparación de `DOOMY_VISION_INTERNAL_KEY` a tiempo constante
  (`crypto.timingSafeEqual`), timeout de request con `TimeoutError`/504, mapeo limpio de
  errores de Multer, `details` de error oculto en producción para 5xx (preservado para
  4xx), guardia de arranque que bloquea `MOCK_MODE=true` en producción salvo escape hatch
  explícito. Todo verificado con pruebas reales, no solo revisado por inspección.
- **Health liveness/readiness separados**: `/health` (alias), `/health/live` (nunca
  depende de config/proveedores), `/health/ready` (revisa configuración crítica, nunca
  filtra valores de secretos, solo nombres de lo que falta).
- **Apagado ordenado (`SIGTERM`/`SIGINT`)**: espera requests en vuelo, con timeout de
  seguridad para forzar salida; verificado con un proceso real spawneado y matado.
- **Railway listo para desplegar, sin desplegar**: `railway.toml` (Nixpacks, justificado
  sobre Docker porque `sharp` resuelve con binarios prebuilt y no hace falta ffmpeg),
  `docs/DOOMY_VISION_RAILWAY_DEPLOY.md` (guía completa con matriz de variables),
  `DOOMY_VISION_PRODUCTION_CHECKLIST.md`. Ningún recurso real de Railway fue creado ni
  modificado.
- **Suite de tests expandida de 30/30 heredado a 60/60**, con tres bugs reales encontrados
  y corregidos (ver abajo), cobertura nueva de: instrumentación/contrato de respuesta,
  fallos de proveedor (STT/LLM/TTS), memoria de sesión con imágenes reales generadas con
  `sharp`, aislamiento crítico entre sesiones concurrentes, seguridad (helmet, CORS, rate
  limit diferenciado, timeout real end-to-end, producción+mock bloqueado), concurrencia (10
  sesiones simultáneas, 8 requests simultáneos en una sesión, recuperación tras fallo de
  LLM/TTS).
- **E2E Playwright expandido**: sube una imagen real generada con `sharp`, confirma
  `vision_used`, reproduce el audio de respuesta y confirma `readyState`, envía un
  follow-up y confirma continuidad de sesión, resetea y confirma que el contexto se
  limpia.
- **Dos scripts de smoke test con proveedores reales** (`real-provider-smoke-test.mjs`,
  `real-pipeline-smoke-test.mjs`), ambos gateados detrás de `RUN_REAL_PROVIDER_TESTS=true`,
  nunca en CI/`npm test`, máximo un puñado de llamadas reales por corrida — verificados
  funcionando (gate-rejection, all-SKIPPED sin credenciales, y pipeline completo SUCCESS
  contra un servidor local en mock mode).
- **Documentación nueva**: `docs/DOOMY_VISION_PRIVACY.md` (honesto, sin prometer nada que
  el código no implemente), `docs/DOOMY_VISION_BRIDGE_API.md` (contrato congelado de API),
  `docs/openapi.yaml` (validado de verdad con `@apidevtools/swagger-parser`, no solo
  inspección visual), README.md reescrito con estado real no inflado.
- **`npm audit` revisado**: 0 vulnerabilidades en dependencias de producción; 5
  vulnerabilidades dev-only en la cadena `vitest→vite→esbuild`, sin cambios respecto al
  baseline (no introducidas esta sesión, requieren un salto mayor de `vitest` evaluado y
  pospuesto por ser breaking).
- **Re-ejecución final completa con evidencia real**: instalación limpia de `node_modules`
  + 60/60 backend, rebuild limpio de Gradle + 26/26 Kotlin `:core`, E2E Playwright PASS,
  dry-run de despliegue en modo producción simulado (arranque, `/health/ready`, apagado
  ordenado con `SIGTERM`) verificado con evidencia real, smoke test de pipeline completo
  contra servidor mock local con SUCCESS, y verificación de aislamiento (`pwd`, `git
  status`, `git diff --stat`, `git log`) confirmando que todos los cambios viven dentro de
  `doomy-vision/` y ningún otro proyecto fue tocado.

### Bugs reales encontrados y corregidos esta sesión

1. **`src/intent.js`** — el umbral de "pregunta de seguimiento corta" (≤6 palabras) era
   demasiado estricto: una pregunta normal en español de 7 palabras perdía la reutilización
   de la imagen activa sin razón semántica. Encontrado por un test real que falló
   (`session_memory.test.js`). Corregido subiendo el umbral a 12 palabras.
2. **`src/routes/session.js`** — `POST /session/:id/reset` no limpiaba
   `lastImageBuffer` ni `visionContextSummary`, dejando un turno post-reset con contexto
   visual obsoleto. Encontrado con una reproducción manual antes de escribir el test
   permanente. Corregido y cubierto con una prueba de regresión.
3. **`src/routes/conversation.js`** — una excepción cruda de `fetch()` en la llamada a
   Groq STT (DNS, timeout, conexión rechazada) no estaba envuelta, y se propagaba como un
   500 genérico en vez de un 502 `AudioError` tipado. Encontrado por un test que simulaba
   exactamente ese escenario. Corregido envolviendo la llamada en try/catch y normalizando
   a `AudioError`; confirmado además que el LLM nunca se invoca cuando STT falla.

### Real Provider Status (vocabulario exacto, sin inflar)

| Proveedor | Estado |
|---|---|
| Anthropic (Claude, LLM) | **IMPLEMENTED NOT VERIFIED** — SDK actualizado a 0.122.0, modelo `claude-sonnet-5`, código auditado contra docs oficiales vigentes; nunca se hizo una llamada real (sin credenciales en este entorno) |
| Groq (Whisper, STT) | **IMPLEMENTED NOT VERIFIED** — mismo motivo |
| ElevenLabs (TTS) | **IMPLEMENTED NOT VERIFIED** — mismo motivo |

Ninguno alcanza "REAL VERIFIED" — eso requeriría una llamada real exitosa con
credenciales reales, que no ocurrió en esta sesión (ver `DOOMY_VISION_BLOCKERS.md`
BLOCKER 5).

### TEST RESULTS finales (reales, no inventados)

| Suite | Resultado |
|---|---|
| Backend (Vitest+Supertest), instalación limpia | **60/60 PASS** |
| Bridge `:core` (Gradle+JUnit5), build limpio | **26/26 PASS** |
| Web Simulator / Dev Console (Playwright E2E, viewport móvil) | **PASS** |
| Smoke test proveedores reales (`RUN_REAL_PROVIDER_TESTS=true`) | **NOT RUN** — sin credenciales reales disponibles; el script en sí fue verificado (gate-rejection + all-SKIPPED) |
| Smoke test pipeline completo, servidor mock local | **PASS** (SUCCESS en ambos turnos, ~195ms total) |
| Dry-run de despliegue (producción simulada local) | **PASS** (arranque, `/health/ready`, `SIGTERM` ordenado) |
| Ray-Ban hardware real | **NOT RUN** — sin hardware ni Developer Preview aprobado |
| Railway (deploy real) | **NOT RUN** (deliberado — "PREPARE, DO NOT DEPLOY") |

Ver `DOOMY_VISION_MISSION_002_REPORT.md` para el reporte completo con todas las secciones
mandatadas.

### NEXT (Mission 002)

Idéntico al NEXT de Mission 001 abajo — nada de eso cambió de estado esta sesión, ver esa
sección. Ítems específicos de Mission 002:

1. Victor: si en algún momento provee credenciales reales de prueba (Anthropic/Groq/
   ElevenLabs) de forma explícita y acotada, correr `npm run smoke` (máximo ~1 llamada por
   proveedor) para pasar de IMPLEMENTED NOT VERIFIED a REAL VERIFIED.
2. Victor: autorizar el despliegue real a Railway cuando esté listo — la guía y el
   checklist ya existen (`docs/DOOMY_VISION_RAILWAY_DEPLOY.md`,
   `DOOMY_VISION_PRODUCTION_CHECKLIST.md`); no se creó ningún recurso real todavía.
3. Correr el checklist manual de navegador móvil real (`docs/DOOMY_VISION_TEST_PLAN.md`)
   en Android Chrome / iPhone Safari físicos — solo emulado con Playwright hasta ahora.

---

## MISSION 001 — Estado original (histórico, sin editar)

### COMPLETED

- Auditoría de infraestructura real de Doomy (Railway: proyectos, servicios, variables
  de entorno, repos, estado de despliegue) — sin tocar nada, solo lectura.
- Investigación activa y documentada de Meta Wearables DAT v0.7.0 contra fuentes
  oficiales vigentes (no ejemplos viejos).
- Arquitectura completa de Doomy Vision (backend, simulador, Bridge, contratos,
  seguridad, privacidad) — `docs/DOOMY_VISION_ARCHITECTURE.md`.
- **Backend Doomy Vision** (`backend/`), Node/Express, `/api/doomy-vision/v1` completo:
  device registration + JWT, sesiones con continuidad de contexto e imagen activa con
  TTL, conversación orquestada (texto/audio/visión), intent de visión (`needsVision`),
  herramienta `request_current_view` definida, providers desacoplados
  (Anthropic/Groq/ElevenLabs + mocks), `ImageOptimizer` (sharp), rate limiting, logs
  estructurados con redacción, métricas, diagnostics, `MOCK_MODE`.
  **30/30 tests automatizados PASS** (Vitest + Supertest, sin llamadas pagadas).
  Verificado con smoke tests manuales end-to-end (registro → sesión → "¿qué estoy
  viendo?" con imagen → "¿tiene PoE?" reutilizando la imagen — el caso de uso central de
  la misión, funcionando de punta a punta).
- **Web Simulator / Dev Console** (`simulator/`): sesión, texto, imagen (archivo o
  cámara web), audio (grabación real del navegador), latencias por etapa, TTS
  reproducible, diagnóstico simulado de Ray-Ban, marcado claramente como herramienta
  interna. Probado con Playwright headless real (no simulado) — flujo completo sin
  errores de la propia app.
- **Bridge — módulo `:core`** (Kotlin/JVM puro, `bridge-android/core/`): máquina de
  estados central, PushToTalkManager, VisionFrameProvider con fallback automático
  (`capturePhoto` → stream → teléfono → mock), AudioRouteManager (nunca asume Ray-Ban
  por default), MockWearablesManager (fiel al flujo documentado de MockDeviceKit),
  ConversationManager, modelo de errores tipado. **26/26 tests automatizados PASS**
  (Gradle + JUnit5). **2 bugs reales encontrados y corregidos** durante esta corrida
  (ver abajo).
- **Bridge Android — módulo `:app`** (estructura real y completa, no compilada aquí):
  manifest con permisos correctos, `build.gradle.kts` con las dependencias reales de
  MWDAT (comentadas hasta tener acceso), `RealWearablesManager` con cada punto de
  integración documentado, `AndroidAudioRouteManager` (real, `AudioManager` +
  `BluetoothHeadset`), `PhoneCameraFrameProvider` (real, CameraX), `OkHttpDoomyApiClient`
  (real, contra el backend), UI Compose V1 (estado central, sin banderas booleanas
  repartidas).
- **Bridge iOS** (`bridge-ios/`): espejo completo en Swift de `:core` — mismas
  abstracciones, mismas correcciones de bugs aplicadas desde el inicio, tests espejo
  (NOT RUN — sin toolchain de Swift aquí).
- Documentación completa: `DOOMY_VISION_ARCHITECTURE.md`, `DOOMY_VISION_SETUP.md`,
  `DOOMY_VISION_TEST_PLAN.md`, `DOOMY_VISION_TROUBLESHOOTING.md`.
- Repo Git local inicializado en `doomy-vision/`, rama `feature/doomy-vision`, aislado de
  cualquier otro proyecto.

### IN PROGRESS / PARCIAL

- `request_current_view` como tool-calling en vivo: la herramienta está definida y el
  backend sabe manejar la respuesta `vision_requested`, pero el ciclo completo de
  "modelo pide ver a mitad de su propia respuesta, sin que el Bridge lo anticipe" no se
  implementó como *streaming* (no era requisito de V1 — sección 18 del brief).
- WebSocket / realtime (sección 37): diseño de eventos documentado en la arquitectura,
  no implementado (correctamente fuera de alcance de V1 según el propio brief).

### BLOCKED

Ver `DOOMY_VISION_BLOCKERS.md` para el detalle completo de cada uno:
1. Sin acceso de lectura al repo real `VictorVonDoom1051/doomy-assistant`.
2. Meta Wearables DAT requiere aprobación del Developer Preview + `APPLICATION_ID` +
   `GITHUB_TOKEN` de Meta — ninguno existe en este entorno.
3. Sin Android SDK ni Xcode en este entorno de trabajo (ni en el equipo Windows
   vinculado a la sesión).

Ninguno de los tres detuvo la misión completa — cada uno se documentó y el trabajo
continuó en las partes independientes.

### TEST RESULTS (reales, no inventados) — al cierre de Mission 001

| Suite | Resultado |
|---|---|
| Backend (Vitest+Supertest) | **30/30 PASS** |
| Web Simulator (Playwright E2E) | **PASS** |
| Bridge `:core` (Gradle+JUnit5) | **26/26 PASS** (tras corregir 2 bugs reales) |
| Bridge iOS (XCTest) | NOT RUN — sin toolchain Swift en este entorno |
| Bridge Android `:app` (build) | NOT AVAILABLE — sin Android SDK |
| Ray-Ban hardware real | HARDWARE VERIFICATION PENDING |

_Estos números quedaron superados por Mission 002 (ver arriba: 60/60 backend). Se
conservan aquí sin editar como registro histórico de lo que existía al cierre de Mission
001._

### Bugs reales encontrados y corregidos en Mission 001

1. **`BridgeStateMachine`**: la transición `READY → PROCESSING` no estaba permitida,
   rompiendo cualquier turno de texto que no pasara primero por `LISTENING` (p. ej. desde
   el Dev Console). Corregido agregando `PROCESSING` al set de transiciones válidas desde
   `READY`, con el razonamiento documentado en el propio código.
2. **`CompositeVisionFrameProvider`**: registraba un evento de diagnóstico duplicado
   cuando un provider fallaba por excepción (una vez en el `catch`, otra vez en el chequeo
   de `frame == null` posterior), desalineando el orden y el conteo de eventos de
   fallback. Corregido para registrar una sola vez.
3. **Multer 1.x / sharp <0.35 / uuid <11**: `npm audit` marcó 1 vulnerabilidad crítica y
   varias altas/moderadas en dependencias de producción. Corregido actualizando a
   `multer@2.x`, `sharp@0.35.x`, `uuid@11.x` — `npm audit --omit=dev` queda en 0
   vulnerabilidades tras la actualización (las restantes son de `vitest`/`vite-node`,
   solo dev, no se envían a producción).

### NEXT (registrado al cierre de Mission 001 — ver también NEXT de Mission 002 arriba)

1. Victor: decidir si compartir acceso de lectura al repo `doomy-assistant` (para
   integrar Doomy Vision como módulo real en vez de servicio paralelo) o mantenerlo
   como servicio Railway independiente (arquitectura ya lista para ambos casos).
2. Victor: aplicar al Developer Preview de Meta Wearables si aún no lo ha hecho.
3. Abrir `bridge-android/` en Android Studio y `bridge-ios/` en Xcode para compilar y
   correr los módulos de aplicación real (no requieren más decisiones de diseño, solo
   las herramientas correctas).
4. Cuando haya acceso: reemplazar `RealWearablesManager`/`RealAudioRouteManager` (iOS)
   con las llamadas reales de MWDAT (ya documentadas línea por línea).
5. Desplegar el backend como servicio Railway nuevo siguiendo
   `docs/DOOMY_VISION_RAILWAY_DEPLOY.md` (Mission 002 movió el detalle de despliegue ahí
   y a `DOOMY_VISION_PRODUCTION_CHECKLIST.md` — checklist lista, nada ejecutado todavía).
</content>
