# Doomy Vision — Mission 003 — Pasos de Deployment

## Estado Actual

✓ Proyecto Railway creado: `doomy-vision`
✓ Servicio Railway creado: `doomy-vision`
✓ 27/31 variables de entorno configuradas
✓ Código local committeado (branch `feature/doomy-vision`)
✓ railway.toml listo con Nixpacks builder
⏳ Esperando: 4 credenciales de proveedores + conexión a repositorio

## Opción A: Victor Conecta el Repositorio GitHub (Recomendado si ya existe)

### Paso 1: Verificar si existe repositorio remoto en GitHub

```bash
# En tu máquina local, dentro de doomy-vision/
git remote -v
# Si no hay salida, no hay remote configurado
```

### Paso 2: Crear repositorio remoto en GitHub (si no existe)

Si aún no existe:
1. Ir a https://github.com/new
2. Nombre: `doomy-vision`
3. Descripción: "Ray-Ban Meta glasses bridge to Doomy AI — isolated Railway service"
4. Privado (solo Victor)
5. Sin inicializar README, .gitignore ni LICENSE (ya los tenemos locales)
6. Click "Create repository"

### Paso 3: Conectar repositorio local a GitHub

```bash
cd ~/doomy-vision/

# Agregar remote
git remote add origin https://github.com/VictorVonDoom1051/doomy-vision.git

# Cambiar rama principal de 'feature/doomy-vision' a 'main' (opcional, pero recomendado para producción)
git branch -m feature/doomy-vision main

# Push del código
git push -u origin main
```

### Paso 4: Conectar GitHub con Railway

En Railway dashboard:
1. Ir a proyecto `doomy-vision`
2. Service: `doomy-vision`
3. Settings → Deploy → Source
4. Click "Connect Repository"
5. Seleccionar `VictorVonDoom1051/doomy-vision`
6. Branch: `main`
7. Deploy automaticamente en cada push

### Paso 5: Agregar las 4 credenciales en Railway

En Railway dashboard:
1. Proyecto: `doomy-vision`
2. Service: `doomy-vision`
3. Variables tab
4. Agregar estas 4 nuevas variables:

```
ANTHROPIC_API_KEY = <valor desde console.anthropic.com>
GROQ_API_KEY = <valor desde console.groq.com>
ELEVENLABS_API_KEY = <valor desde elevenlabs.io>
ELEVENLABS_VOICE_ID = <valor desde elevenlabs.io, ej. "VVD">
```

### Paso 6: Verificar deployment

Railway debería iniciar un deployment automático. Esperar a que termine:
- Build: ✓ PASS
- Deploy: ✓ PASS
- Healthcheck (`/api/doomy-vision/v1/health/ready`): ✓ PASS

Click en la URL del servicio para obtener el dominio Railway asignado.

## Opción B: Claude Configura el Repositorio GitHub (Si Victor autoriza)

Si Victor da permiso, Claude puede:
1. Crear el repositorio GitHub directamente (vía API)
2. Hacer push del código
3. Conectar con Railway

**Autorización requerida**: "Crea el repositorio GitHub `doomy-vision` y conéctalo con Railway"

---

## Después del Deployment

Una vez que el servicio esté DEPLOYED y sano:

### 1. Obtener URL de la WebApp

```
https://<railway-domain>/doomy-vision/dev/
```

Railway te dará el dominio, ej:
```
https://doomy-vision-production.up.railway.app/doomy-vision/dev/
```

### 2. Probar Dev Console desde navegador

Abriendo:
```
https://doomy-vision-production.up.railway.app/doomy-vision/dev/
```

Debe mostrar:
- Campo "Internal key" (enmascarado)
- Botón "Connect"
- Sesión creada correctamente

### 3. Verificar healthchecks

```bash
# Liveness
curl https://doomy-vision-production.up.railway.app/api/doomy-vision/v1/health

# Readiness
curl https://doomy-vision-production.up.railway.app/api/doomy-vision/v1/health/ready
```

Ambos deben responder con status 200 OK.

### 4. Verificar logs

En Railway dashboard:
- Service: `doomy-vision`
- Logs tab
- Buscar `doomy_vision_backend_started` = confirmación de arranque correcto

---

## Si Ocurren Errores Durante Deployment

### Error: "Build failed"

Revisar logs en Railway → Build logs. Posibles causas:
- Dependencia de npm no instalable (generalmente no)
- Archivo `.env` no removido (no debería estar en repo)

### Error: "Service failed to start"

Revisar logs en Railway → Logs. Buscar mensajes que comiencen con `level":50` (errores).

Posibles causas:
1. Falta alguna variable requerida (ver DOOMY_VISION_MISSION_003_SETUP.md)
2. Credencial de proveedor inválida (Anthropic/Groq/ElevenLabs)
3. `NODE_ENV=production` + `MOCK_MODE=true` sin `ALLOW_MOCK_IN_PRODUCTION=true`

### Error: "Healthcheck timeout"

El servicio arranca pero `/health/ready` tarda más de 30 segundos o no responde.

Posibles causas:
1. Credenciales de proveedores incorrectas (tries de conexión lentos)
2. Network timeout

Solución temporal: aumentar `healthcheckTimeout` en `railway.toml` a 60 segundos y re-deployar.

---

## Verificación de Aislamiento

Antes de continuar a pruebas, VERIFICAR que NO se modificó ningún otro servicio:

En Railway dashboard:
- Proyecto `doomy-assistant`: sin cambios ✓
- Proyecto `doomy-whatsapp-production`: sin cambios ✓
- Proyecto `vonveria-swim`: sin cambios ✓
- Proyecto `vonveria-arena`: sin cambios ✓

---

## Próximos Pasos (PASO 4-7)

Una vez que el deployment esté PASS:
1. **PASO 4**: Verificar HTTPS y WebApp (Dev Console)
2. **PASO 5**: Primera prueba real (texto, visión, seguimiento)
3. **PASO 6**: Pruebas de proveedores reales (si credenciales configuradas)
4. **PASO 7**: Pipeline completo (micrófono → transcripción → visión → respuesta → audio)

Ver `DOOMY_VISION_PROGRESS.md` para track de próximas misiones.
