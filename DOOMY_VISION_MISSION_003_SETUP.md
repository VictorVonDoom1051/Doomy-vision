# Doomy Vision — Mission 003 — Setup Railway

## Estado Actual

**Proyecto Railway creado**: `doomy-vision`
- Project ID: `dacc1549-16db-427d-8e07-239b79b82e23`
- Environment: `production` (ID: `e5f35f4c-d85b-4768-a09d-6dc6c2484186`)
- Service: `doomy-vision` (ID: `b0409ab6-93dc-448e-a4f7-e354ffb8f543`)
- Status: **Vacío, listo para conectar repositorio y credenciales**

## Variables Configuradas (27/31)

Las siguientes 27 variables ya están establecidas en Railway:

✓ NODE_ENV=production
✓ DOOMY_VISION_MOCK_MODE=false
✓ ALLOW_MOCK_IN_PRODUCTION=false
✓ DOOMY_VISION_INTERNAL_KEY=`<generada automáticamente>`
✓ DOOMY_VISION_JWT_SECRET=`<generada automáticamente>`
✓ DOOMY_VISION_LLM_MODEL=claude-sonnet-5
✓ DOOMY_VISION_STT_MODEL=whisper-large-v3-turbo
✓ DOOMY_VISION_TTS_MODEL=eleven_flash_v2_5
✓ VISION_MAX_IMAGE_MB=6
✓ VISION_MAX_LONG_EDGE_PX=1280
✓ VISION_JPEG_QUALITY=78
✓ AUDIO_MAX_SECONDS=30
✓ AUDIO_MAX_MB=10
✓ REQUEST_TIMEOUT_MS=20000
✓ SESSION_TTL_MINUTES=60
✓ SESSION_LAST_IMAGE_TTL_MINUTES=15
✓ RATE_LIMIT_MAX_PER_MINUTE=60
✓ RATE_LIMIT_VISION_AUDIO_MAX_PER_MINUTE=30
✓ MAX_RESPONSE_TOKENS=1024
✓ MAX_CONVERSATION_HISTORY=12
✓ CORS_ALLOWED_ORIGINS=`<vacío, abierto a cualquier origen>`
✓ VISION_ENABLED=true
✓ REALTIME_ENABLED=false
✓ TTS_ENABLED=true
✓ DIAGNOSTICS_ENABLED=true
✓ TOOL_CALLING_VISION_ENABLED=false
✓ RUN_REAL_PROVIDER_TESTS=false

## Variables Pendientes (4/31) — Requieren Credenciales

Las siguientes variables **DEBEN** ser proporcionadas por Victor manualmente en Railway:

### 1. ANTHROPIC_API_KEY

**Formato**: `sk-ant-v4-...` (clave de API de Anthropic)

**Dónde obtenerla**: 
- Login en console.anthropic.com
- API Keys section
- Crear o reutilizar clave existente

**Dónde configurarla en Railway**:
- Proyecto: `doomy-vision`
- Service: `doomy-vision`
- Environment: `production`
- Variable name: `ANTHROPIC_API_KEY`
- Value: `sk-ant-v4-...`

### 2. GROQ_API_KEY

**Formato**: Clave de API de Groq

**Dónde obtenerla**:
- Login en console.groq.com
- API Keys section
- Crear o reutilizar clave existente

**Dónde configurarla en Railway**:
- Proyecto: `doomy-vision`
- Service: `doomy-vision`
- Environment: `production`
- Variable name: `GROQ_API_KEY`
- Value: `<groq-api-key>`

### 3. ELEVENLABS_API_KEY

**Formato**: Clave de API de ElevenLabs

**Dónde obtenerla**:
- Login en elevenlabs.io
- API section
- Crear o reutilizar clave existente

**Dónde configurarla en Railway**:
- Proyecto: `doomy-vision`
- Service: `doomy-vision`
- Environment: `production`
- Variable name: `ELEVENLABS_API_KEY`
- Value: `<elevenlabs-api-key>`

### 4. ELEVENLABS_VOICE_ID

**Formato**: ID de voz de ElevenLabs (p. ej. "VVD" para la voz VVD ya usada en doomy-assistant)

**Dónde obtenerla**:
- ElevenLabs console
- Voices section
- Usar ID existente (probablemente "VVD" según memoria del proyecto)

**Dónde configurarla en Railway**:
- Proyecto: `doomy-vision`
- Service: `doomy-vision`
- Environment: `production`
- Variable name: `ELEVENLABS_VOICE_ID`
- Value: `<voice-id>`

## Pasos Siguientes para Victor

1. **Conectar repositorio GitHub** (opcional, si quiere que Railroad CI/CD automático; sino Claude puede hacer push manual):
   - En Railway: Service `doomy-vision` → Settings → Connect Repository
   - Seleccionar: `https://github.com/<owner>/doomy-vision`
   - Branch: main (o feature/doomy-vision)

2. **Proporcionar las 4 credenciales** (ANTHROPIC_API_KEY, GROQ_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID):
   - Agregar a Railway manualmente, O
   - Pasarlas a Claude para que las configure vía Railway MCP

3. **Verificar variables en Railway**:
   - Proyecto: `doomy-vision`
   - Service: `doomy-vision`
   - Variables tab
   - Confirmar que todas las 31 estén presentes

## Tecnología

- **Builder**: Nixpacks (Node.js)
- **Build command**: `cd backend && npm ci --omit=dev`
- **Start command**: `cd backend && node src/server.js`
- **Health check path**: `/api/doomy-vision/v1/health/ready`
- **Health check timeout**: 30s
- **Restart policy**: ON_FAILURE (max 3 retries)

## Aislamiento (verificado)

✓ Nuevo proyecto dedicado `doomy-vision`
✓ NO modifica ningún otro servicio (doomy-assistant, Doomy WhatsApp, etc.)
✓ NO accede a bases de datos productivas
✓ NO usa variables de otros proyectos

## Próximos Pasos (PASO 3)

Una vez que Victor proporcione las 4 credenciales:
1. Configurar en Railway
2. Conectar repositorio (push de código desde `doomy-vision/backend`)
3. Ejecutar deployment
4. Verificar `/api/doomy-vision/v1/health/ready` → 200 OK
5. Ejecutar pruebas de pipeline real (PASO 5-7)
