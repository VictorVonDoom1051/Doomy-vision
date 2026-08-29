# Doomy Vision — Despliegue en Railway

**Estado de esta misión: PREPARE, DO NOT DEPLOY.** Todo lo de este documento fue
verificado localmente (build, arranque en modo producción simulado, health checks,
apagado ordenado con SIGTERM — ver `DOOMY_VISION_MISSION_002_REPORT.md` para la evidencia
real). **No se creó ningún servicio, variable, dominio ni recurso en el Railway real de
Victor durante esta misión** — la única interacción con Railway fue de solo lectura
(auditoría de infraestructura existente). Desplegar es una decisión explícita de Victor;
esta guía deja el camino listo para que sea un checklist mecánico, no una investigación.

## 0. Antes de empezar

- Este backend vive en `doomy-vision/backend/` dentro de su propio repo/carpeta aislada.
  **No reutiliza ni modifica ningún servicio Railway existente** (`doomy-assistant`,
  Home Assistant, VonverIA, etc.) — se crea como un servicio Railway **nuevo e
  independiente**.
- No requiere base de datos propia todavía (`SessionStore` es en memoria — ver
  `docs/DOOMY_VISION_ARCHITECTURE.md §4.2` para el esquema Postgres ya diseñado pero no
  creado). **No conectar `doomy-postgres` ni ningún otro recurso compartido sin
  autorización explícita de Victor.**

## 1. Crear el servicio

1. En el proyecto Railway donde Victor quiera alojarlo (nuevo proyecto o uno existente —
   decisión suya), click **New Service → GitHub Repo** (o **Empty Service** + deploy
   manual si el repo aislado de Doomy Vision todavía no está en GitHub — ver
   `DOOMY_VISION_BLOCKERS.md`, BLOCKER 1).
2. Si el repo contiene más que Doomy Vision (monorepo), fijar **Root Directory** =
   `doomy-vision/` en la configuración del servicio, o `doomy-vision/backend/` si se
   prefiere apuntar directo al backend (en ese caso ajustar `railway.toml` — ver abajo,
   sus comandos asumen que la raíz del servicio es `doomy-vision/`).
3. Builder: **Nixpacks** (default de Railway, no requiere acción — ver `railway.toml` en
   la raíz del repo para la justificación de por qué no se usa Docker).

## 2. Variables de entorno requeridas

Configurar en el tab **Variables** del servicio — **nunca en el repo, nunca en este
documento**. Ver la tabla completa en la sección 4. Como mínimo para arrancar en
producción real (no mock):

```
NODE_ENV=production
DOOMY_VISION_MOCK_MODE=false
DOOMY_VISION_INTERNAL_KEY=<openssl rand -hex 32>
DOOMY_VISION_JWT_SECRET=<openssl rand -hex 32>
ANTHROPIC_API_KEY=<la misma que usa doomy-assistant, o una nueva>
```

Sin `ANTHROPIC_API_KEY` (o con `MOCK_MODE=true` en producción sin
`ALLOW_MOCK_IN_PRODUCTION=true`), **el proceso rechaza arrancar** con un mensaje claro de
qué falta (verificado esta misión — ver el reporte). Esto es intencional: mejor que
Railway muestre "deploy failed" a que un ambiente "de producción" quede respondiendo con
datos simulados sin que nadie lo note.

Para transcripción de voz (Groq) y texto a voz (ElevenLabs) reales, agregar también
`GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` — sin ellas, esos dos
proveedores individualmente caen a Mock aunque `DOOMY_VISION_MOCK_MODE=false` (ver
`createSTTProvider()`/`createTTSProvider()` en `backend/src/providers/`), y el LLM
(Anthropic) seguirá siendo real. Documentar esto sí es información útil de producto: es
válido lanzar con solo el LLM real y STT/TTS todavía en mock mientras se decide sobre esas
llaves.

## 3. Start command y healthcheck

Ya definidos en `railway.toml` (raíz del repo) — Railway los toma automáticamente si el
servicio apunta a esa raíz:

- **Start command**: `cd backend && node src/server.js`
- **Healthcheck path**: `/api/doomy-vision/v1/health/ready` (no `/health/live` — Railway
  no debe enrutar tráfico a un deploy nuevo hasta que la configuración de producción esté
  completa, no solo hasta que el proceso abra el puerto).
- **Puerto**: Railway inyecta `PORT` automáticamente; `src/config.js` ya lo lee
  (`process.env.PORT`, default 8090 solo para desarrollo local).

Si el servicio apunta directo a `doomy-vision/backend/` como root (en vez de
`doomy-vision/`), ajustar el `startCommand` en la configuración del servicio a
`node src/server.js` (sin el `cd backend &&`) — o copiar `railway.toml` a esa carpeta con
los comandos ajustados.

## 4. Matriz de variables de entorno

Ningún valor real aparece en este documento ni en ningún archivo del repo — solo nombres,
si son requeridas, si son secretas, y su default.

| Variable | Requerida (dev) | Requerida (prod) | Secreta | Descripción | Default |
|---|---|---|---|---|---|
| `PORT` | No | No (Railway la inyecta) | No | Puerto HTTP | `8090` |
| `NODE_ENV` | No | Sí (`production`) | No | Entorno de ejecución | `development` |
| `DOOMY_VISION_MOCK_MODE` | No | Sí (`false`) | No | Usa proveedores simulados si `true` | `true` |
| `DOOMY_VISION_INTERNAL_KEY` | No (mock) | **Sí** | **Sí** | Secreto compartido Bridge↔backend para `/device/register` | — |
| `DOOMY_VISION_JWT_SECRET` | No (mock) | **Sí** | **Sí** | Firma de los access tokens JWT | — |
| `DOOMY_VISION_ACCESS_TOKEN_TTL_MIN` | No | No | No | Minutos de vida del access token | `60` |
| `DOOMY_CORE_URL` | No | No (aún no integrado) | No | URL de Doomy Core, para integración futura | — |
| `DOOMY_CORE_INTERNAL_KEY` | No | No (aún no integrado) | **Sí** | Llave para llamar a Doomy Core, futuro | — |
| `ANTHROPIC_API_KEY` | No (mock) | **Sí** (para LLM real) | **Sí** | Proveedor de IA principal | — |
| `DOOMY_VISION_LLM_MODEL` | No | No | No | Modelo de Anthropic a usar | `claude-sonnet-5` |
| `GROQ_API_KEY` | No | No (STT cae a mock sin ella) | **Sí** | Transcripción de voz real | — |
| `DOOMY_VISION_STT_MODEL` | No | No | No | Modelo Whisper en Groq | `whisper-large-v3-turbo` |
| `ELEVENLABS_API_KEY` | No | No (TTS cae a mock sin ella) | **Sí** | Texto a voz real | — |
| `ELEVENLABS_VOICE_ID` | No | No (junto con la key, para TTS real) | No* | Voz ya configurada en la cuenta ElevenLabs | — |
| `DOOMY_VISION_TTS_MODEL` | No | No | No | Modelo TTS en ElevenLabs | `eleven_flash_v2_5` |
| `VISION_MAX_IMAGE_MB` | No | No | No | Tamaño máximo de imagen aceptada | `6` |
| `VISION_MAX_LONG_EDGE_PX` | No | No | No | Redimensión al subir | `1280` |
| `VISION_JPEG_QUALITY` | No | No | No | Calidad de recompresión JPEG | `78` |
| `AUDIO_MAX_SECONDS` | No | No | No | Duración máxima de audio aceptada | `30` |
| `AUDIO_MAX_MB` | No | No | No | Tamaño máximo de audio aceptado | `10` |
| `REQUEST_TIMEOUT_MS` | No | No | No | Timeout por llamada a proveedor externo + margen del servidor | `20000` |
| `REQUEST_TIMEOUT_MARGIN_MS` | No | No | No | Margen extra del timeout de servidor sobre el de proveedor | `5000` |
| `SESSION_TTL_MINUTES` | No | No | No | Expiración de una sesión inactiva | `60` |
| `SESSION_LAST_IMAGE_TTL_MINUTES` | No | No | No | Expiración de la "imagen activa" de una sesión | `15` |
| `RATE_LIMIT_MAX_PER_MINUTE` | No | No | No | Límite general (`/device`, `/session`, `/conversation`) | `60` |
| `RATE_LIMIT_VISION_AUDIO_MAX_PER_MINUTE` | No | No | No | Límite para `/vision` y `/audio/*` | `30` |
| `MAX_RESPONSE_TOKENS` | No | No | No | `max_tokens` del LLM — control de costo | `1024` |
| `MAX_CONVERSATION_HISTORY` | No | No | No | Turnos de historial conservados por sesión | `12` |
| `CORS_ALLOWED_ORIGINS` | No | Recomendado si hay clientes web | No | Lista separada por comas de orígenes permitidos | vacío (abierto) |
| `ALLOW_MOCK_IN_PRODUCTION` | No | No (solo si es intencional) | No | Permite `NODE_ENV=production` + `MOCK_MODE=true` a la vez | `false` |
| `RUN_REAL_PROVIDER_TESTS` | No | **No — nunca en el servicio desplegado** | No | Solo para `scripts/real-*-smoke-test.*` locales | `false` |
| `VISION_ENABLED` | No | No | No | Feature flag de visión | `true` |
| `REALTIME_ENABLED` | No | No | No | Feature flag de flujo realtime (no implementado en V1) | `false` |
| `TTS_ENABLED` | No | No | No | Feature flag de texto a voz | `true` |
| `DIAGNOSTICS_ENABLED` | No | No | No | Expone `/diagnostics` | `true` |
| `TOOL_CALLING_VISION_ENABLED` | No | No | No | Activa la herramienta `request_current_view` | `false` |

\* `ELEVENLABS_VOICE_ID` no es un secreto en sí (es un identificador de voz, no una
credencial), pero se trata como configuración sensible por convención — no se
publica en ningún lugar de todas formas.

## 5. Verificación post-deploy

1. `GET https://<dominio>.up.railway.app/api/doomy-vision/v1/health/live` → `200
   {"status":"ok",...}`.
2. `GET https://<dominio>.up.railway.app/api/doomy-vision/v1/health/ready` → `200
   {"status":"ready","problems":[]}`. Si devuelve `503` con `problems`, revisar las
   variables de la sección 2 — el mensaje dice exactamente qué falta, sin exponer
   valores.
3. `GET https://<dominio>.up.railway.app/api/doomy-vision/v1/diagnostics` → confirmar
   `mock_mode: false` y `providers.llm: "ANTHROPIC"` (o `"MOCK"` si se decidió lanzar
   así intencionalmente).
4. Probar `POST /device/register` con la `DOOMY_VISION_INTERNAL_KEY` real, luego
   `POST /session`, luego `POST /conversation` con un texto simple — confirmar respuesta
   real de Anthropic (o mock, según lo configurado). **Este es el primer momento en que
   se recomienda hacer 1-3 llamadas reales pagadas, si Victor lo autoriza — no antes.**
5. Dominio: usar `Generate Domain` de Railway para un subdominio `*.up.railway.app`, o
   configurar un dominio propio si Victor lo prefiere — no requiere nada especial de este
   backend (no depende de un dominio fijo en su configuración).

## 6. Rollback

Railway conserva los deploys anteriores — desde el tab **Deployments** del servicio,
`Redeploy` sobre el deploy anterior que funcionaba es el rollback más simple, sin tocar
código. Como Doomy Vision es un servicio nuevo e independiente, un rollback aquí **nunca
afecta a ningún otro servicio** (Doomy WhatsApp, Doomy Calendar, etc.).

## 7. Eliminación segura (si se decide no continuar)

Como el servicio es nuevo, aislado, y no comparte base de datos ni variables con nada
existente, eliminarlo desde el dashboard de Railway (**Settings → Danger → Delete
Service**) es seguro y no deja nada huérfano en otros servicios. No se creó ninguna base
de datos ni bucket asociado que limpiar aparte.
