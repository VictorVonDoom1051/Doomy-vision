# Doomy Vision

Doomy Vision conecta unos Ray-Ban Meta (o, mientras tanto, el teléfono/navegador como
fallback) con Doomy — el asistente de IA de Victor / ACS Technology — como ojos,
micrófono y salida de audio. Caso de uso central: **"Doomy, ¿qué estoy viendo?"**, con
continuidad de contexto en preguntas de seguimiento ("¿Tiene PoE?").

**Proyecto aislado por diseño**: vive completo dentro de `doomy-vision/`, no modifica ni
depende en tiempo de ejecución de ningún otro servicio de Doomy (WhatsApp, Calendario,
Oficina, Home Assistant, VonverIA, etc.). Ver "Regla de aislamiento" más abajo.

## Arquitectura en una frase

`Lentes/teléfono → Bridge (relay de sensores "tonto", sin inteligencia propia) → Doomy
Vision backend (Railway, aislado) → Anthropic/Groq/ElevenLabs → de vuelta al Bridge`. Toda
la inteligencia vive en el backend; el Bridge nunca llama directo a un proveedor de IA ni
guarda llaves de IA. Detalle completo en `docs/DOOMY_VISION_ARCHITECTURE.md`.

```
backend/          API Doomy Vision (Node/Express) — /api/doomy-vision/v1
  src/routes/        device, session, conversation, vision, audio, health, diagnostics
  src/providers/      LLM (Anthropic/mock), STT (Groq/mock), TTS (ElevenLabs/mock) — intercambiables
  tests/               60 tests (Vitest+Supertest), + E2E Playwright manual, + scripts de smoke con proveedores reales
  scripts/             smoke tests gateados detrás de RUN_REAL_PROVIDER_TESTS=true (nunca en CI)
simulator/          Dev Console web ("Doomy Vision Phone Prototype") — probar todo el flujo sin lentes ni app nativa,
                      incluyendo push-to-talk real y usable desde un navegador de teléfono
bridge-android/      App puente Android — :core es Kotlin/JVM puro (probado, 26 tests), :app requiere Android Studio
bridge-ios/          Espejo Swift del Bridge — mismo diseño, no compilado aquí (requiere Xcode)
docs/                Toda la documentación — ver índice abajo
railway.toml         Config lista para desplegar (builder Nixpacks, healthcheck) — NO crea nada por sí sola
```

## Empieza aquí (5 minutos)

```bash
cd backend
npm install
npm test        # 60/60 esperado, sin llamadas pagadas (MOCK_MODE)
npm run dev      # arranca en :8090, MOCK_MODE=true por defecto
```

Abrir `http://localhost:8090/doomy-vision/dev/` — el Dev Console. Poner cualquier valor
en "Internal key" (en mock mode no se valida contra nada real), conectar, y probar el
flujo completo: escribir o mantener presionado el botón de voz, adjuntar una imagen,
preguntar "¿Qué estoy viendo?" y luego "¿Tiene PoE?" para ver la continuidad de contexto.

Otros scripts útiles (`backend/package.json`):

| Comando | Qué hace |
|---|---|
| `npm test` | Suite completa, siempre mock, nunca llamadas pagadas |
| `npm run dev` | Servidor con auto-reload |
| `npm run e2e` | E2E real en navegador headless (requiere Playwright — no es dependencia del proyecto, instalar aparte si se quiere correr) |
| `npm run smoke` | 1 llamada real como mucho por proveedor — requiere `RUN_REAL_PROVIDER_TESTS=true` y credenciales reales |
| `npm run smoke:pipeline` | Pipeline completo contra un backend en marcha, con fixtures generadas en memoria — mismo gate |

## Estado real (no inflado)

- Backend: **60/60 tests PASS**, pipeline completo probado en mock mode (texto, voz,
  imagen, y sus combinaciones), instrumentado por etapa, con manejo explícito de fallos de
  proveedor (TTS cae con gracia, LLM/STT dan errores tipados en vez de romper el turno).
- Proveedores reales (Anthropic/Groq/ElevenLabs): código auditado contra documentación
  oficial vigente y **listo**, pero sin credenciales reales disponibles en el entorno de
  desarrollo de esta misión — nunca se hizo una llamada real pagada sin autorización
  explícita. Ver `DOOMY_VISION_MISSION_002_REPORT.md` para el detalle exacto.
- Simulador / Dev Console: funciona como prototipo de teléfono real — push-to-talk con
  protecciones de cancelación/duración máxima/permiso denegado, verificado en emulación de
  viewport móvil (iPhone) con Playwright. Falta el checklist manual en hardware físico real
  (ver `docs/DOOMY_VISION_TEST_PLAN.md`).
- Bridge Android `:core`: **26/26 tests PASS** (Kotlin/JVM puro). La app real (`:app`,
  CameraX/Bluetooth/MWDAT) no se compiló en este entorno — requiere Android Studio.
- Bridge iOS: mismo diseño espejado en Swift, no compilado (requiere Xcode/macOS).
- Meta Wearables Device Access Toolkit: Developer Preview, acceso gestionado por Victor
  directamente con Meta — fuera del alcance de esta sesión (ver `DOOMY_VISION_BLOCKERS.md`).
- Railway: **preparado, no desplegado** (`railway.toml`, `docs/DOOMY_VISION_RAILWAY_DEPLOY.md`,
  `DOOMY_VISION_PRODUCTION_CHECKLIST.md`) — ningún servicio, variable ni recurso real fue
  creado o modificado. Apagado ordenado (`SIGTERM`) y arranque en modo producción simulado
  verificados localmente con evidencia real.

## Regla de aislamiento (crítica, no negociable)

Doomy Vision **se conecta con** Doomy — no lo modifica para poder existir. Nunca se toca
código, base de datos, variable de entorno, dominio o configuración de Railway de ningún
otro servicio (Doomy WhatsApp, Doomy Calendario, Doomy Oficina, Home Assistant, Frigate,
Retell, Evolution API, VonverIA/Core/Swim). Si algo requiriera modificar otro servicio, se
documenta como propuesta en `DOOMY_VISION_BLOCKERS.md` y se espera autorización — nunca se
hace automáticamente.

## Índice de documentación

| Documento | Qué cubre |
|---|---|
| `docs/DOOMY_VISION_ARCHITECTURE.md` | Cómo funciona todo, decisiones de diseño, limitaciones honestas |
| `docs/DOOMY_VISION_SETUP.md` | Cómo correr/compilar cada parte del proyecto |
| `docs/DOOMY_VISION_TEST_PLAN.md` | Qué se probó, cómo, y con qué resultado real |
| `docs/DOOMY_VISION_BRIDGE_API.md` | Contrato congelado de la API REST, para trabajar el Bridge en paralelo |
| `docs/openapi.yaml` | El mismo contrato en OpenAPI 3.0 (validado con `@apidevtools/swagger-parser`) |
| `docs/DOOMY_VISION_PRIVACY.md` | Exactamente qué se captura, envía, retiene, y cómo borrar una sesión |
| `docs/DOOMY_VISION_RAILWAY_DEPLOY.md` | Guía paso a paso para desplegar (cuando Victor lo autorice) |
| `DOOMY_VISION_PRODUCTION_CHECKLIST.md` | Checklist mecánico pre-lanzamiento |
| `docs/DOOMY_VISION_TROUBLESHOOTING.md` | Problemas conocidos y cómo resolverlos |
| `DOOMY_VISION_PROGRESS.md` | Estado detallado, actualizado durante el trabajo |
| `DOOMY_VISION_BLOCKERS.md` | Qué necesita intervención humana y por qué |
| `DOOMY_VISION_FINAL_REPORT.md` / `DOOMY_VISION_MISSION_002_REPORT.md` | Reportes de cada sesión de trabajo |
