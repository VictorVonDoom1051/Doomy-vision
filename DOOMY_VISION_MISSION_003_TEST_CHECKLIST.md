# Doomy Vision — Mission 003 — Test Checklist

**Estado**: Backend desplegado en Railway. Credenciales de proveedores configuradas. **Listo para pruebas.**

---

## PASO 4 — WebApp / HTTPS

### 4.1 Verificar HTTPS y acceso a Dev Console

**Ejecutar ANTES de pruebas funcionales**:

```bash
# Reemplazar <railway-domain> con el dominio real de Railway
DOMAIN="doomy-vision-production.up.railway.app"

# 1. Verificar HTTPS
curl -I https://$DOMAIN/doomy-vision/dev/
# Esperado: HTTP/2 200 ✓

# 2. Verificar redirección HTTP → HTTPS (opcional, Railway lo hace automáticamente)
curl -I http://$DOMAIN/doomy-vision/dev/
# Esperado: HTTP/2 301 o 307 → redirección a HTTPS ✓

# 3. Verificar dev console accesible
curl -s https://$DOMAIN/doomy-vision/dev/ | grep -i "doomy" | head -5
# Esperado: HTML de la página, sin errores de 404/500 ✓
```

### 4.2 Abrir Dev Console en navegador

1. URL: `https://<railway-domain>/doomy-vision/dev/`
2. Verificar elementos:
   - [ ] Campo "Internal key" visible (enmascarado)
   - [ ] Botón "Connect"
   - [ ] Área de chat vacía
   - [ ] Indicador de estado (debe mostrar `IDLE`)
   - [ ] Botón de micrófono gris (deshabilitado hasta conectar)
   - [ ] Botón de cámara

### 4.3 Verificar CORS

Si Dev Console está en un dominio diferente al backend:

```bash
DOMAIN="doomy-vision-production.up.railway.app"

# Probar CORS preflight
curl -X OPTIONS https://$DOMAIN/api/doomy-vision/v1/device/register \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST"

# Esperado: status 200, header `Access-Control-Allow-Origin` presente
```

**Nota**: En CORS_ALLOWED_ORIGINS vacío (default), todos los orígenes están permitidos.

---

## PASO 5 — Primera Prueba Real

### 5.1 Conectar (obtener JWT)

**Acción**:
1. Abriendo Dev Console
2. Internal key: cualquier valor (en mock mode fue "changeme...", en producción es el valor secreto de Railway)
3. Click **"Connect"**

**Esperado**:
```
→ POST /api/doomy-vision/v1/device/register
← 200 OK
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

**Estado en UI**: Debe cambiar de `IDLE` a "Connected", botones de micrófono y cámara habilitados.

### 5.2 Prueba de Texto Puro

**Acción**:
1. Escribir en chat: `"Hola Doomy Vision. Responde únicamente: conexión correcta."`
2. Click "Send" o Enter
3. Esperar respuesta

**Esperado**:
```json
{
  "status": "success",
  "response": {
    "text": "conexión correcta",
    "audio": null,
    "audio_unavailable": false,
    "vision_used": false,
    "vision_required": false,
    "vision_context_summary": null,
    "latencies": {
      "upload_ms": 5,
      "audio_capture_ms": 0,
      "vision_prepare_ms": 0,
      "request_id": "...",
      "response_id": "..."
    }
  }
}
```

**Validación**:
- [ ] Status: 200 OK
- [ ] Text: "conexión correcta" (exactamente como lo pidió)
- [ ] vision_used: false (no se usó imagen)
- [ ] latencies: presentes (confirma instrumentación)

---

## PASO 6 — Prueba de Visión

### 6.1 Subir imagen

**Acción**:
1. En Dev Console, click "Take Photo" o "Upload Image"
2. Seleccionar una imagen no sensible (p. ej. pantalla de computadora, objeto)
3. Esperar que suba

**Esperado**:
- [ ] Imagen se muestra en la UI
- [ ] No hay error 400/413 (tamaño o formato)
- [ ] Indicador de estado: "Image ready"

### 6.2 Pregunta de visión

**Acción**:
1. Escribir: `"¿Qué estoy viendo?"`
2. Click "Send"

**Esperado**:
```json
{
  "status": "success",
  "response": {
    "text": "<descripción detallada de la imagen>",
    "audio": "https://<domain>/api/doomy-vision/v1/audio/<id>",
    "audio_unavailable": false,
    "vision_used": true,
    "vision_required": false,
    "vision_context_summary": "<texto que el modelo generó>",
    "latencies": {
      "upload_ms": <num>,
      "vision_prepare_ms": <num>,
      "request_id": "..."
    }
  }
}
```

**Validación**:
- [ ] Status: 200 OK
- [ ] vision_used: true
- [ ] Text: contiene análisis de la imagen
- [ ] audio: URL presente (si TTS está habilitado)
- [ ] latencies.vision_prepare_ms: > 0 (confirma que procesó imagen)

### 6.3 Seguimiento (reutilizar imagen)

**Acción**:
1. Escribir: `"¿Qué características específicas puedes identificar?"`
2. Click "Send"

**Esperado**:
```json
{
  "status": "success",
  "response": {
    "text": "<análisis adicional>",
    "vision_used": true,
    "vision_context_summary": "<mismo contexto, sin recalcular>",
    ...
  }
}
```

**Validación**:
- [ ] vision_used: true (reutilizó la imagen activa)
- [ ] vision_context_summary: **IGUAL al anterior** (no la recalculó, confirmando reutilización)
- [ ] session_id: **IGUAL** (misma sesión)

**Este es el caso de uso central de la misión**. ✓

---

## PASO 7 — Pipeline Completo (Opcional, requiere micrófono en PC/teléfono)

### 7.1 STT → LLM → TTS

**Acción**:
1. Click botón de micrófono (PTT push-to-talk)
2. Mantener presionado mientras hablas: `"¿Qué estoy viendo?"`
3. Soltar botón
4. Esperar

**Esperado**:
```
1. Audio capturado (status: LISTENING)
2. Enviado a Groq STT (status: PROCESSING)
3. Groq responde con transcripción
4. Envía a Anthropic (status: PROCESSING)
5. Antropic responde con análisis
6. Envía a ElevenLabs (status: SPEAKING)
7. Audio TTS se reproduce en navegador
8. Vuelve a IDLE
```

**Validación**:
- [ ] Transcripción correcta de lo que dijiste
- [ ] Respuesta apropiada a tu pregunta
- [ ] Audio se reproduce (puedes escuchar la voz)
- [ ] Estado cambia fluidamente por cada fase

### 7.2 Latencias

**Acción**: Revisar objeto `latencies` en respuesta:

```json
{
  "latencies": {
    "upload_ms": <tiempo carga>,
    "audio_capture_ms": <echo del cliente>,
    "vision_prepare_ms": <si hay imagen>,
    "request_id": "uuid..."
  }
}
```

**Esperado**:
- Total < 5 segundos (desde que sueltas el botón hasta que escuchas la respuesta)
- upload_ms < 500ms
- vision_prepare_ms < 1000ms (si hay imagen)

---

## PASO 8 — Teléfono Real

### 8.1 Preparación

**Equipo requerido**:
- [ ] Android (Chrome) o iPhone (Safari)
- [ ] WiFi conectado (o datos móviles)
- [ ] Permisos de micrófono habilitados
- [ ] Permisos de cámara habilitados

### 8.2 URL en teléfono

Copiar URL en navegador del teléfono:
```
https://<railway-domain>/doomy-vision/dev/
```

**Esperado**:
- [ ] Página carga correctamente
- [ ] Layout responsive (una columna en móvil)
- [ ] Botones visibles y tocables (no tiny)
- [ ] Botón de PTT ocupa ancho completo
- [ ] Sin scroll horizontal

### 8.3 Checklist de Funcionalidad en Teléfono

| # | Prueba | Android Chrome | iPhone Safari | Status |
|---|---|---|---|---|
| 1 | Permiso micrófono (aceptar) | [ ] | [ ] | |
| 2 | Permiso micrófono (denegar) → estado ERROR visible | [ ] | [ ] | |
| 3 | Push-to-talk: mantener presionado, soltar, audio se adjunta | [ ] | [ ] | |
| 4 | PTT: interrumpir gesto (deslizar fuera del botón) cancela sin enviar | [ ] | [ ] | |
| 5 | PTT: cambiar app a mitad de grabación cancela en vez de dejar mic abierto | [ ] | [ ] | |
| 6 | PTT: grabación que excede duración máxima se corta sola | [ ] | [ ] | |
| 7 | Permiso cámara + captura manual | [ ] | [ ] | |
| 8 | Envío imagen + pregunta → vision_used en respuesta | [ ] | [ ] | |
| 9 | Audio respuesta se reproduce (escuchas voz) | [ ] | [ ] | |
| 10 | Reconexión red: cortar wifi, confirmar aviso y recuperación | [ ] | [ ] | |
| 11 | MediaRecorder format (Safari: mp4 critical) | N/A | [ ] | |

**Nota**: No marcar PASS en emulación — solo en teléfono físico real.

### 8.4 Llenar Checklist

Abrir este documento en teléfono o imprimirlo. Marcar cada fila:
- ✓ PASS
- ✗ FAIL (+ nota de qué falló)
- N/A (no aplica)

---

## Plantilla de Reporte

```markdown
## Prueba Ejecutada: PASO X

**Fecha**: 2026-08-XX
**Dominio**: https://doomy-vision-production.up.railway.app
**Resultado**: PASS / PARTIAL / FAIL

### Hallazgos

- [ ] Descripción del hallazgo

### Latencias

- Total: XXXms
- upload_ms: XXms
- vision_prepare_ms: XXms

### Errores

Ninguno / Listar si hay

### Notas

Detalles adicionales

```

---

## Orden Recomendado

1. **PASO 4**: HTTPS + Dev Console (5 min)
2. **PASO 5**: Texto puro (2 min)
3. **PASO 6**: Visión (5 min)
4. **PASO 7**: Pipeline micrófono (opcional, 5 min)
5. **PASO 8**: Teléfono (10-15 min)

**Tiempo total**: 30 minutos aproximadamente.

---

## Si Algo Falla

### 400 Bad Request
- Verificar formato de payload
- Verificar imagen: < 6 MB, JPEG/PNG validos

### 401 Unauthorized
- JWT expirado (reconectar con Connect)
- Internal key incorrecta

### 502 Bad Gateway
- Proveedor externo caído (Anthropic/Groq/ElevenLabs)
- Network issue en Railway

### 504 Gateway Timeout
- Request tardó > 20 segundos
- Proveedor muy lento

### "No response"
- Esperar 2-3 segundos más
- Revisar logs en Railway

---

## Próximos Pasos

Una vez PASO 8 PASS:
1. Documentar resultados en `DOOMY_VISION_PROGRESS.md`
2. Crear `DOOMY_VISION_MISSION_003_REPORT.md`
3. Evaluar PASO 11 (Ray-Ban real, o siguiente fase)

¡Avisa cuando termines las pruebas!
