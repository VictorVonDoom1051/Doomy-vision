# Doomy Vision — Arquitectura

## 1. Objetivo

Doomy Vision conecta lentes Ray-Ban Meta con Doomy (el asistente de IA de Victor) para que
el usuario pueda preguntar "Doomy, ¿qué estoy viendo?" y recibir una respuesta hablada,
usando la cámara y el micrófono de los lentes.

Principio rector (dado por el usuario y respetado en todo el diseño):

> Los lentes NO contienen el cerebro. La app móvil (Doomy Bridge) NO es un segundo Doomy —
> solo conecta sensores con Doomy Core. Toda la inteligencia vive en Doomy Core / Railway.

```
Ray-Ban Meta → Doomy Bridge (móvil) → Internet → Doomy Vision API → Doomy Core (IA) → TTS → Doomy Bridge → bocinas Ray-Ban
```

## 2. Auditoría del sistema real (hecha antes de diseñar nada)

Doomy ya existe y está en producción en Railway (proyecto `doomy-assistant`,
workspace `victorvondoom1051's Projects`), con estos servicios:

| Servicio | Repo / fuente | Notas |
|---|---|---|
| `doomy-assistant` | `VictorVonDoom1051/doomy-assistant` @ `main` | Backend principal, Node/Express, dominio `doomy-assistant-production.up.railway.app` |
| `Doomy Calendar` | mismo repo, rama `feature/doomy-calendar-v1`, `/calendar-service` | Servicio de calendario aislado |
| `Doomy Oficina Test` | mismo repo, rama `feature/doomy-calendar-v1` | Ambiente de staging/pruebas |
| `nemsveria-casa` | `VictorVonDoom1051/nemsveria-casa` @ `main` | Otro asistente Doomy (proyecto Nemsveria), mismo patrón |
| `doomy-postgres` | — | Base de datos de `doomy-assistant` |

Y un proyecto Railway separado `doomy-whatsapp-production` (Evolution API + bridge +
Redis + Postgres) para Doomy WhatsApp — **no tocado por esta misión**, solo consumido
como referencia de patrón (mismo estilo de "internal key" para autenticar un bridge).

Variables de entorno reales detectadas en `doomy-assistant` (solo nombres, nunca
valores — ver sección de seguridad) confirman el stack:

- **LLM**: `ANTHROPIC_API_KEY` → Claude ya es el proveedor de IA de Doomy. Doomy Vision
  reutiliza el mismo proveedor, no crea un segundo sistema de IA.
- **STT**: `GROQ_API_KEY` → Groq (Whisper) ya está integrado.
- **TTS**: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`,
  `DOOMY_TTS_PROVIDER`, `DOOMY_TTS_ENABLED`, `DOOMY_TTS_AUTO_SPEAK`,
  `DOOMY_TTS_MAX_CHARS` → ElevenLabs, voz "VVD" (según memoria del proyecto).
- **Home Assistant / Frigate**: `HA_URL`, `HA_TOKEN`, `HA_ALLOWED_DOMAINS`,
  `HA_ALLOW_SENSITIVE`, `FRIGATE_URL`, `FRIGATE_ALLOWED_CAMERAS`, `FRIGATE_MAX_EVENTS`.
- **WhatsApp bridge**: `DOOMY_WHATSAPP_INTERNAL_KEY`, `WHATSAPP_BRIDGE_URL` — **este es
  el patrón de autenticación que Doomy Vision copia** para su propio bridge
  (`DOOMY_VISION_INTERNAL_KEY`): un secreto compartido presentado por un "bridge"
  externo para obtener acceso, en vez de reusar credenciales maestras.
- **Calendar**: `CALENDAR_URL`, `CALENDAR_DOOMY_KEY`, `CALENDAR_TIMEZONE`.
- **Retell**: `RETELL_API_KEY` (voz telefónica — no relacionado con Vision).
- Persistencia: `DATABASE_URL` (Postgres).

**No se pudo leer el código fuente real del repositorio** (`VictorVonDoom1051/doomy-assistant`)
desde este entorno — ver `DOOMY_VISION_BLOCKERS.md`. Todo el diseño de abajo se basa en la
auditoría de infraestructura (Railway) y en los nombres de variables reales, que son una señal
fuerte y confiable del stack, pero no se pudo confirmar contra el código exacto (rutas
existentes, forma exacta de los modelos, middlewares). Por eso Doomy Vision se construyó
**aislado**, con su propio backend Node/Express independiente, en vez de intentar insertar
código a ciegas dentro de un repositorio que no se pudo inspeccionar.

## 3. Aislamiento (regla crítica del usuario)

Doomy Vision vive enteramente en `doomy-vision/` y no modifica ningún archivo de otros
proyectos (Doomy WhatsApp, Doomy Calendar, Home Assistant, Retell, VonverIA, etc.). Todo
lo que necesita de esos sistemas se consumiría por su API pública, nunca editando su código.

El backend expone únicamente `/api/doomy-vision/v1/*` y corre como **servicio Railway
independiente** cuando se despliegue (ver `DOOMY_VISION_SETUP.md`) — no se tocó ningún
servicio ni variable de entorno existente en Railway durante esta misión (solo lectura,
vía Railway MCP, para la auditoría de arriba).

## 4. Componentes

```
doomy-vision/
├── backend/            Node/Express — /api/doomy-vision/v1 (real, probado)
├── simulator/           Web Simulator / Dev Console (real, probado)
├── bridge-android/
│   ├── core/            Kotlin/JVM puro — lógica de negocio (real, 26/26 tests PASS)
│   └── app/              App Android real (estructura completa, NO compilado — falta Android SDK + acceso DAT)
├── bridge-ios/
│   ├── Sources/DoomyVisionCore/  Swift puro — espejo de bridge-android/core (NO compilado — sin Xcode)
│   └── Tests/                     Espejo de los tests de Android (NOT RUN)
└── docs/                Esta carpeta
```

### 4.1 Backend Doomy Vision (`backend/`)

Express + Node 22 (ESM), aislado del backend real. Endpoints bajo `/api/doomy-vision/v1`:

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Liveness, sin auth |
| GET | `/diagnostics` | Estado de proveedores, métricas, sesiones activas |
| POST | `/device/register` | Bridge presenta `DOOMY_VISION_INTERNAL_KEY` → recibe un JWT de corta duración |
| POST | `/session` | Crea una sesión de conversación |
| GET | `/session/:id` | Estado de una sesión |
| POST | `/session/:id/reset` | Limpia historial + última imagen |
| POST | `/conversation` | Orquestador principal: texto y/o audio y/o imagen → respuesta + TTS |
| POST | `/vision` | Sube una imagen fuera de una conversación (p. ej. VisionFrameProvider proactivo) |
| POST | `/audio/transcribe` | STT aislado |
| POST | `/audio/speak` | TTS aislado |
| GET | `/audio/:id` | Descarga de audio TTS generado (caché de 5 min) |

Proveedores desacoplados (`src/providers/`): `LLMProvider` (Anthropic real / Mock),
`STTProvider` (Groq real / Mock), `TTSProvider` (ElevenLabs real / Mock). Con
`DOOMY_VISION_MOCK_MODE=true` (default en `.env.example`) todo funciona con proveedores
deterministas sin gastar un centavo ni requerir llaves reales — así se probó todo el flujo
end-to-end en esta sesión.

### 4.2 Sesiones y contexto (secciones 15/16)

`SessionStore` (en memoria, `src/state.js`) mantiene por sesión: un historial corto
(últimos 12 turnos, solo texto), y **una** "última imagen activa" con TTL propio
(`SESSION_LAST_IMAGE_TTL_MINUTES`, default 15 min) — ni el historial completo de imágenes
ni las imágenes se guardan indefinidamente.

Diseño preparado para Postgres real (Doomy ya tiene `DATABASE_URL`) sin cambiar el
contrato — pero **no se creó ninguna tabla ni se tocó ninguna base de datos productiva**
desde este backend aislado (regla explícita del usuario). Esquema propuesto para cuando se
autorice la integración:

```sql
create table doomy_vision_sessions (
  id uuid primary key,
  device_id text not null,
  device_type text not null,
  mode text not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create table doomy_vision_turns (
  id bigserial primary key,
  session_id uuid references doomy_vision_sessions(id) on delete cascade,
  role text not null,
  text text not null,
  vision_used boolean not null default false,
  created_at timestamptz not null default now()
);
```

### 4.3 Intent de visión (`needsVision`, sección 17)

`src/intent.js` clasifica cada turno en `needs_new_image | reuse_last_image | no_vision`
con una heurística explícita y centralizada (no repartida por el código). Casos cubiertos
y **probados** (`tests/conversation.test.js`):

- "¿Qué estoy viendo?" sin imagen activa → `vision_requested: true` (el backend le pide
  al Bridge que capture y reenvíe — nunca inventa una respuesta sin haber visto nada).
- Misma pregunta con imagen adjunta → `vision_used: true`.
- Pregunta de seguimiento corta ("¿Tiene PoE?") con una imagen activa reciente → reutiliza
  la imagen sin pedir una nueva captura. Este es el caso de uso exacto del punto 2 de la
  misión, y está probado end-to-end (backend + Dev Console con Playwright).

`request_current_view` (`src/providers/llm.js`) está definida como *tool* de Claude y
lista para activarse con `TOOL_CALLING_VISION_ENABLED=true` — el modelo puede pedir ver
en vez de depender solo de la heurística. Diseño listo, flujo de tool-calling en vivo no
es requisito de V1 (sección 18: "no es obligatorio terminar este flujo realtime en V1").

### 4.4 Foto vs. frame de stream (sección 8)

`VisionFrameProvider` (`bridge-android/core/.../VisionFrameProvider.kt`, espejo en
Swift) es una abstracción que intenta, en orden: `capturePhoto` → frame de stream →
cámara del teléfono → imagen mock, registrando cada intento/fallback en diagnósticos.
Esto es exactamente lo que pide la sección 8 ante los reportes de interacción entre
`capturePhoto` y HFP activo. Probado con 4 casos (fallback exitoso, calidad insuficiente,
fallo total, mock como último recurso) — **26/26 tests del módulo `core` en verde**.

### 4.5 Audio Ray-Ban (secciones 9/10)

Confirmado con la documentación oficial de Meta (ver §7 abajo): el micrófono y las
bocinas de los Ray-Ban **no pasan por el SDK de DAT** — se acceden "through iOS or
Android Bluetooth profiles" (HFP), con audio del micrófono a 8 kHz mono. Por eso
`AudioRouteManager` es independiente de `WearablesManager`: en Android real usa
`AudioManager` + `BluetoothHeadset` (código real en
`app/src/.../audio/AndroidAudioRouteManager.kt`, no compilado aquí por falta de Android
SDK), y en iOS usaría `AVAudioSession`. La UI nunca asume silenciosamente que se está
usando el micrófono de los lentes — siempre refleja la ruta real
(`Micrófono: Ray-Ban Meta ✅` / `Micrófono: iPhone ⚠️`).

### 4.6 Orden de inicialización audio/cámara (sección 10)

La documentación oficial de Meta (Integration Overview) **no especifica** un orden
explícito entre HFP y el stream de cámara de MWDAT — se investigó activamente
(`wearables.developer.meta.com/docs/develop/dat/build-overview/`) y esa ausencia se
documenta aquí en vez de inventarse una regla. Postura adoptada, conservadora:
inicializar la ruta de audio (HFP) **antes** de iniciar la sesión de cámara MWDAT — ver
`AndroidAudioRouteManager.start()`. Cuando haya acceso a hardware real, esto debe
validarse con el checklist de `DOOMY_VISION_TEST_PLAN.md` §"Orden de inicialización".

### 4.7 Meta Wearables DAT — estado real (secciones 4/32/52)

Investigado en esta sesión contra la documentación y los repos oficiales vigentes
(no se asumió nada de versiones anteriores):

- **Versión actual**: Device Access Toolkit v0.7.0, "Developer Preview" (no
  publicable de forma general — "Publishing is currently not available during the
  Developer Preview phase").
- **Plataformas**: iOS (SPM, `github.com/facebook/meta-wearables-dat-ios`) y Android
  (Gradle vía GitHub Packages con `GITHUB_TOKEN`,
  `github.com/facebook/meta-wearables-dat-android`).
- **Módulos**: `MWDATCore` (registro de app, sesión, permisos), `MWDATCamera` (cámara:
  stream, resolución/fps, `capturePhoto`), `MWDATDisplay` (solo para Ray-Ban Display, no
  aplica a Ray-Ban Meta estándar).
- **Dispositivos soportados**: Ray-Ban Meta Gen 1/2, Ray-Ban Meta Display, Oakley Meta
  HSTN, Oakley Meta Vanguard.
- **Flujo de registro**: deeplink desde la app de Doomy Vision hacia la app oficial
  "Meta AI" para confirmar el registro (evento de UI, una sola vez).
- **Mock Device Kit**: probado documentalmente (no con hardware) — flujo real: abrir el
  debug menu del sample app oficial → "Enable MockDeviceKit" → "Pair RayBan Meta" →
  toggles de power/don/unfold → cámara mock (cámara real del teléfono o video h265
  pregrabado) → captura de foto simulada configurable.
- **Bloqueo real**: requiere aprobación en el Developer Preview de Meta + un
  `APPLICATION_ID` emitido por Meta + (Android) un `GITHUB_TOKEN` con acceso al paquete
  privado de Meta. Ninguna de esas tres cosas existe en este entorno — ver
  `DOOMY_VISION_BLOCKERS.md`. `MockWearablesManager` en `:core` SÍ está implementado y
  probado (reproduce la regla documentada "powered on and worn before streaming").

Fuentes consultadas (todas de 2026, no ejemplos viejos):
- https://wearables.developer.meta.com/docs/develop/dat/
- https://wearables.developer.meta.com/docs/develop/dat/build-overview/
- https://wearables.developer.meta.com/docs/mock-device-kit
- https://developers.meta.com/wearables/faq/
- https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/
- https://github.com/facebook/meta-wearables-dat-ios
- https://github.com/facebook/meta-wearables-dat-android

### 4.8 Máquina de estados (sección 38)

Un solo estado central (`BridgeState`, igual en Kotlin y Swift) en vez de banderas
booleanas repartidas: `DISCONNECTED, CONNECTING, READY, LISTENING, CAPTURING_VISION,
UPLOADING, PROCESSING, SPEAKING, ERROR`, con una tabla explícita de transiciones válidas.
Un bug real se encontró y corrigió durante las pruebas: la transición directa
`READY → PROCESSING` (turno de texto sin pasar por `LISTENING`, p. ej. desde el Dev
Console) no estaba permitida originalmente — ver `DOOMY_VISION_PROGRESS.md`.

### 4.9 Push-to-talk (secciones 3/11)

V1 es estrictamente push-to-talk (no full-duplex): `PushToTalkManager` fuerza el flujo
`READY → (press) → LISTENING → (release) → PROCESSING → SPEAKING → READY`, rechaza
`press` fuera de `READY` y `release` fuera de `LISTENING`, y aplica un límite de duración
de grabación configurable (`max_audio_seconds`). Probado (5 tests, Android/JVM).

## 5. Seguridad y privacidad (secciones 27–29)

- Ninguna llamada de IA sale del Bridge directamente: las llaves de Anthropic/Groq/
  ElevenLabs viven solo en el backend de Doomy Vision (Railway), nunca en la app móvil.
- Autenticación en dos pasos, mismo patrón que `DOOMY_WHATSAPP_INTERNAL_KEY`: el Bridge
  presenta un secreto compartido (`DOOMY_VISION_INTERNAL_KEY`) una vez para registrar el
  dispositivo, y recibe un JWT de corta duración (`DOOMY_VISION_ACCESS_TOKEN_TTL_MIN`,
  default 60 min) para todo lo demás.
- Validación estricta de MIME type y tamaño en imagen y audio (`src/middleware/validate.js`),
  rate limiting por IP (`express-rate-limit`, configurable), timeouts en llamadas a
  proveedores externos.
- Logs estructurados (`pino`) con **redacción explícita** de tokens, API keys e imágenes/
  audio completos — solo se loguean metadatos (tamaños, duraciones, resultado).
- Privacy by default: no hay streaming continuo de cámara al servidor (V1 nunca manda
  video, solo un frame comprimido cuando hace falta), no hay grabación continua de audio
  (push-to-talk hace explícito cuándo se escucha), la visión solo ocurre dentro de una
  interacción iniciada por el usuario.

## 6. Lo que Doomy Vision NO hace (por diseño)

- No transmite video continuo a Railway (sección 7).
- No implementa conversación full-duplex en V1 (sección 3).
- No persiste imágenes de forma permanente por defecto — "remembered vision" es una
  interfaz preparada (`visionMemory.js` / próxima integración con la memoria real de
  Doomy) que hoy responde honestamente "no conectada todavía", nunca finge persistir.
- No modifica ni lee el código de Doomy WhatsApp, Doomy Calendar, Home Assistant,
  Retell, VonverIA o cualquier otro proyecto — ver `DOOMY_VISION_BLOCKERS.md` para lo
  que sí necesitaría acceso de lectura (el propio repo de `doomy-assistant`).
