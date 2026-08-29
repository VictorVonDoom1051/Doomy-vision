# Doomy Vision — Contrato de API para el Bridge (`/api/doomy-vision/v1`)

Este documento congela el contrato REST actual entre el Bridge (Android/iOS) y el backend
de Doomy Vision, para que el trabajo del Bridge pueda avanzar de forma independiente del
detalle interno del backend. Refleja **solo endpoints que existen de verdad hoy**,
verificado contra el código en `backend/src/routes/` — no es aspiracional.

Versionado: todo vive bajo `/api/doomy-vision/v1`. Un cambio incompatible (breaking) se
publicaría como `/v2` en paralelo, nunca modificando `/v1` in-place — todavía no ha
ocurrido ningún cambio de este tipo.

Todas las respuestas son `application/json` salvo `GET /audio/:id` (el audio en sí). Todas
las rutas salvo `/device/register`, `/health*` y `/diagnostics` requieren
`Authorization: Bearer <access_token>`.

## Errores (forma común a todos los endpoints)

```json
{
  "error": {
    "code": "ValidationError",
    "dv_code": "DV_VALIDATION_001",
    "message": "Mensaje legible, apto para mostrar al usuario",
    "details": { "opcional": "solo en 4xx, o en 5xx fuera de producción" }
  }
}
```

`code` es estable (nombre de clase, usado por tests desde Mission 001 — no cambia).
`dv_code` es un código interno más granular (Fase 24, Mission 002) pensado para
diagnóstico. Nunca se incluye un stack trace ni ningún secreto en el cuerpo del error.

| `code` | HTTP | Significado |
|---|---|---|
| `AuthenticationError` | 401 | Falta o es inválido el `Authorization: Bearer` (o `x-doomy-vision-key` en `/device/register`) |
| `ValidationError` | 400/413 | Campo faltante, MIME no soportado, archivo demasiado grande, multipart malformado |
| `NotFoundError` | 404 | Sesión/audio inexistente o expirado, ruta desconocida |
| `RateLimitError` | 429 | Se superó el límite de requests por minuto (general o de `/vision`+`/audio/*`) |
| `VisionError` | 502 | No se pudo procesar la imagen |
| `AudioError` | 502 | No se pudo procesar/transcribir el audio |
| `PlaybackError` | 502 | No se pudo generar el audio de respuesta (nota: en `/conversation` esto NO aborta el turno, ver abajo) |
| `LLMError` | 502 | El proveedor de IA (Anthropic) falló o no respondió a tiempo |
| `TimeoutError` | 504 | El servidor tardó demasiado en responder |

## 1. Crear un device / obtener un access token

```
POST /device/register
Header: x-doomy-vision-key: <DOOMY_VISION_INTERNAL_KEY>
Body: { "device_id": "string", "device_type"?: "rayban_meta" | "mock" | "phone" }

-> 200
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in_min": 60,
  "device_id": "string",
  "device_type": "rayban_meta"
}
```

El Bridge presenta el secreto compartido **una sola vez** al arrancar/re-emparejar, nunca
en cada request. El `access_token` resultante se usa como `Authorization: Bearer` en todo
lo demás, y expira solo — al expirar, repetir este paso.

## 2. Crear una sesión

```
POST /session
Header: Authorization: Bearer <access_token>
Body: { "device_type"?: string, "mode"?: "real" | "mock" | "phone" }

-> 201
{
  "session_id": "uuid",
  "device_id": "string",
  "device_type": "string",
  "mode": "string",
  "created_at": "ISO-8601",
  "turns": 0,
  "has_active_image": false,
  "active_image_summary": null
}
```

`GET /session/:id` devuelve la misma forma con el estado actual.

## 3. Enviar un turno — texto, voz, imagen, o combinaciones

Un único endpoint maneja las cinco combinaciones descritas en la sección original del
brief (texto solo, voz solo, texto+imagen, voz+imagen, follow-up sin imagen nueva):

```
POST /conversation
Header: Authorization: Bearer <access_token>
Content-Type: multipart/form-data

Campos:
  session_id        (requerido)
  text              (opcional si se manda audio)
  image             (opcional — archivo, JPEG/PNG/WEBP/HEIC/HEIF, ver límite en /diagnostics)
  audio             (opcional — archivo, WAV/MP3/MP4/M4A/WEBM/OGG, ver límite en /diagnostics)
  audio_capture_ms  (opcional — número, medido por el cliente, se hace eco en la respuesta)
  response_mode     (opcional — "screen" | "wearable", default "screen")
```

Respuesta:

```json
{
  "session_id": "uuid",
  "request_id": "uuid",
  "response_id": "uuid",
  "text": "Respuesta de Doomy, siempre presente si hubo turno (ver excepción vision_required abajo)",
  "audio": { "url": "/api/doomy-vision/v1/audio/<id>", "format": "audio/wav", "expires_in_s": 300 },
  "audio_unavailable": false,
  "actions": [],
  "vision_used": true,
  "vision_requested": false,
  "vision_required": null,
  "vision_context_summary": { "text": "...", "capturedAt": 1234567890 },
  "response_mode": "screen",
  "transcription": { "text": "...", "duration_ms": 420 },
  "remembered": null,
  "latency_ms": { "upload_ms": 4, "stt_ms": 420, "vision_prepare_ms": 9, "llm_ms": 800, "tts_ms": 300, "total_ms": 1540 }
}
```

Notas importantes para el Bridge:

- **`audio` puede ser `null`** aunque `text` esté presente — un fallo de TTS nunca tira el
  turno completo (ver `audio_unavailable: true` como señal explícita). El Bridge debe
  mostrar/leer `text` de todas formas.
- **`vision_requested: true`** significa que el backend necesita una imagen nueva antes de
  poder responder de verdad — en ese caso `text` es un mensaje genérico ("Necesito ver lo
  que estás viendo...") y el Bridge debe capturar una imagen y reenviar el mismo tipo de
  request con `image` adjunto. `vision_required` trae el detalle: `{ "status":
  "vision_required", "reason": "..." }`.
- **`vision_context_summary`** es el texto que el LLM ya generó sobre la imagen
  actualmente activa (o `null` si no hay ninguna) — útil para que el Bridge muestre
  contexto sin tener que re-preguntar. Se reemplaza con cada imagen nueva, nunca acumula.
- **`response_mode: "wearable"`** le pide al modelo respuestas más breves, aptas para
  hablarse por las bocinas de los lentes en vez de leerse en pantalla — no cambia el
  contrato de la respuesta, solo el estilo del texto.
- El campo `image` **reemplaza por completo** la imagen activa de la sesión — no hay
  memoria multi-imagen (ver `docs/DOOMY_VISION_ARCHITECTURE.md §4.2.1` para el detalle
  honesto de esta limitación).

## 4. Subir una imagen directamente (sin pasar por un turno completo)

Útil para que el Bridge suba proactivamente un frame (p. ej. al iniciar sesión con los
lentes ya viendo algo) sin generar todavía una respuesta del LLM:

```
POST /vision
Header: Authorization: Bearer <access_token>
Content-Type: multipart/form-data
Campos: session_id (requerido), image (requerido), remember? ("true"), note? (string)

-> 201
{
  "request_id": "uuid",
  "session_id": "uuid",
  "image": { "width": 1280, "height": 960, "original_bytes": 812000, "compressed_bytes": 94000, "compression_ms": 42, "thumbnail_base64": "..." },
  "remembered": null
}
```

## 5. Endpoints de audio directos

```
POST /audio/transcribe   (multipart, campo "audio") -> { request_id, text, duration_ms, audio_bytes }
POST /audio/speak        (JSON, { "text": "..." })   -> { request_id, audio: {url, format, expires_in_s}, duration_ms }
GET  /audio/:id                                       -> el audio (binario), 404 si expiró (TTL 5 min)
```

## 6. Limpiar una sesión

```
POST /session/:id/reset
Header: Authorization: Bearer <access_token>

-> 200 (misma forma que "crear sesión", con turns=0, has_active_image=false)
```

## 7. Salud y diagnóstico (sin auth)

```
GET /health          -> { status: "ok", ... }               (alias de /health/live, compatibilidad)
GET /health/live      -> { status: "ok", ... }               (liveness — nunca depende de config/proveedores)
GET /health/ready     -> { status: "ready"|"not_ready", problems: [...] }  (readiness — sí revisa config crítica)
GET /diagnostics      -> proveedores activos, límites operativos no secretos, métricas agregadas
```

`GET /diagnostics.limits` expone valores como `audio_max_seconds` para que el Bridge
pueda auto-ajustar su comportamiento (p. ej. cortar una grabación de PTT antes de que el
backend la rechace) sin duplicar esos números por su cuenta.
