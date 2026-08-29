# ⚡ Victor's Checklist — Mission 003

**Estado**: Railway listo, código listo. **Solo falta su acción**.

---

## OPCIÓN 1: Deployment Manual Rápido (< 10 minutos)

### 1. Obtener 4 credenciales

Necesarias SOLO ESTA VEZ:

| Proveedor | Acción | Dónde |
|---|---|---|
| **Anthropic** | Copiar clave API | https://console.anthropic.com/settings/api-keys |
| **Groq** | Copiar clave API | https://console.groq.com/keys |
| **ElevenLabs** | Copiar clave API | https://elevenlabs.io/app/api |
| **ElevenLabs** | Copiar Voice ID | https://elevenlabs.io/app/voice-lab (usar "VVD" o tu voz preferida) |

### 2. Agregar a Railway (vía dashboard)

1. Ir a https://railway.app
2. Proyecto: `doomy-vision`
3. Service: `doomy-vision`
4. **Variables** tab
5. Agregar 4 variables nuevas:
   - Nombre: `ANTHROPIC_API_KEY` → Valor: `sk-ant-v4-...`
   - Nombre: `GROQ_API_KEY` → Valor: `...`
   - Nombre: `ELEVENLABS_API_KEY` → Valor: `...`
   - Nombre: `ELEVENLABS_VOICE_ID` → Valor: `VVD` (o tu voice ID)

**Importante**: No copiar/pegar mal — copy-paste exacto, sin espacios extras.

### 3. Conectar Repositorio (OPCIONAL pero recomendado)

Si prefieres **CI/CD automático** en cada push:

1. Proyecto: `doomy-vision` → Service: `doomy-vision`
2. **Settings** tab → **Source** section
3. Click **"Connect Repository"**
4. Seleccionar tu repo (u otro existente)
5. Branch: `main` o `feature/doomy-vision`

Si prefieres saltar esto: Claude puede hacer push manual en cada actualización.

### 4. Esperar deployment

Railway automáticamente:
1. Detecta variables nuevas
2. Inicia rebuild/redeploy
3. Healthcheck en `/api/doomy-vision/v1/health/ready`
4. ✓ Listo cuando veas verde

---

## OPCIÓN 2: Dale Autorización a Claude

Enviar mensaje:

> "Crea el repositorio GitHub `doomy-vision`, push el código, y conecta Railway. Las credenciales de proveedores las agrego yo manualmente."

Claude puede:
- Crear repo GitHub
- Push código
- Conectar con Railway via CLI

(Necesita autorización explícita porque toca GitHub)

---

## Una Vez DEPLOYED

### 1. Verificar URL

Railway asignará un dominio. La WebApp será accesible en:

```
https://<tu-railway-domain>/doomy-vision/dev/
```

Ejemplo:
```
https://doomy-vision-production.up.railway.app/doomy-vision/dev/
```

### 2. Abrir Dev Console

1. Copiar la URL anterior
2. Abrir en navegador (PC o teléfono)
3. Click "Connect"
4. Escribir: `"Hola Doomy Vision. Responde únicamente: conexión correcta."`
5. Esperar respuesta

Si ves la respuesta → ✓ BACKEND FUNCIONANDO

### 3. Probar Visión (opcional ahora)

1. Click "Take Photo" o "Upload Image"
2. Escribir: `"¿Qué estoy viendo?"`
3. Esperar respuesta con análisis de imagen

---

## Si Algo No Funciona

### Error: "Service failed to start"

Revisar Railway logs:
1. Proyecto: `doomy-vision` → Service: `doomy-vision`
2. **Logs** tab
3. Buscar línea roja o error

Causas comunes:
- Credencial inválida (copiar/pegar incorrecto)
- Typo en nombre de variable
- Red issue (poco probable)

### Error: "No response"

Esperar 1-2 minutos más (Railway a veces tarda en escalar el servicio).

Si persiste: check healthcheck en Railway dashboard.

---

## Próximos Pasos

Una vez deployment PASS:

1. **Pruebas de texto**: Verificar que responde
2. **Pruebas de visión**: Imagen + pregunta
3. **Pruebas móvil**: Desde teléfono real
4. **Pipeline completo**: Micrófono → Voz de respuesta

Más detalles en `DOOMY_VISION_PROGRESS.md` (sección PASO 4-7).

---

**¿Preguntas? Revisar**:
- `DOOMY_VISION_MISSION_003_SETUP.md` — Variables en detalle
- `DOOMY_VISION_MISSION_003_DEPLOY_STEPS.md` — Pasos completos
- `DOOMY_VISION_RAILWAY_DEPLOY.md` — Guía técnica

¡Avisa cuando deployment esté PASS!
