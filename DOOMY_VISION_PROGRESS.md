# Doomy Vision — Progress

_Actualizado durante la sesión, no solo al final._

## COMPLETED

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

## IN PROGRESS / PARCIAL

- `request_current_view` como tool-calling en vivo: la herramienta está definida y el
  backend sabe manejar la respuesta `vision_requested`, pero el ciclo completo de
  "modelo pide ver a mitad de su propia respuesta, sin que el Bridge lo anticipe" no se
  implementó como *streaming* (no era requisito de V1 — sección 18 del brief).
- WebSocket / realtime (sección 37): diseño de eventos documentado en la arquitectura,
  no implementado (correctamente fuera de alcance de V1 según el propio brief).

## BLOCKED

Ver `DOOMY_VISION_BLOCKERS.md` para el detalle completo de cada uno:
1. Sin acceso de lectura al repo real `VictorVonDoom1051/doomy-assistant`.
2. Meta Wearables DAT requiere aprobación del Developer Preview + `APPLICATION_ID` +
   `GITHUB_TOKEN` de Meta — ninguno existe en este entorno.
3. Sin Android SDK ni Xcode en este entorno de trabajo (ni en el equipo Windows
   vinculado a la sesión).

Ninguno de los tres detuvo la misión completa — cada uno se documentó y el trabajo
continuó en las partes independientes.

## TEST RESULTS (reales, no inventados)

| Suite | Resultado |
|---|---|
| Backend (Vitest+Supertest) | **30/30 PASS** |
| Web Simulator (Playwright E2E) | **PASS** |
| Bridge `:core` (Gradle+JUnit5) | **26/26 PASS** (tras corregir 2 bugs reales) |
| Bridge iOS (XCTest) | NOT RUN — sin toolchain Swift en este entorno |
| Bridge Android `:app` (build) | NOT AVAILABLE — sin Android SDK |
| Ray-Ban hardware real | HARDWARE VERIFICATION PENDING |

## Bugs reales encontrados y corregidos en esta sesión

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

## NEXT

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
   `docs/DOOMY_VISION_SETUP.md §6` (checklist lista, nada ejecutado todavía).
