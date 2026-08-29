# Doomy desde los Ray-Ban con Siri (Atajos de iOS)

Cómo llamar a Doomy con los lentes puestos, sin sacar el teléfono y **sin
esperar la aprobación de Meta**.

## Por qué esto funciona hoy

Los Ray-Ban Meta son dos cosas distintas para el iPhone:

| Parte | Cómo se accede | ¿Necesita aprobación de Meta? |
|---|---|---|
| Micrófono y bocinas | Bluetooth HFP normal | **No** |
| Cámara | Meta Device Access Toolkit | Sí (Developer Preview) |

Esto está documentado en `DOOMY_VISION_ARCHITECTURE.md` §4.5: el audio de los
lentes *"no pasa por el SDK de DAT — se accede through iOS or Android Bluetooth
profiles"*. Es decir: **oír y hablar por los lentes ya se puede**. Solo la
cámara está bloqueada.

El hueco de la cámara se cubre con el botón de captura de los propios lentes:
la foto se sincroniza al carrete del iPhone y el Atajo la recoge de ahí.

## El endpoint: `POST /ask`

Existe específicamente para esto. Un Atajo no puede encadenar tres llamadas ni
guardar un JWT entre ejecuciones, así que `/ask`:

- Autentica con `x-doomy-vision-key` directo (sin register → session → JWT).
- **No pide `session_id`**: mantiene la continuidad por `device_id`, así el
  seguimiento (*"¿y tiene PoE?"*) funciona solo.
- Responde en modo `wearable` por default: una o dos frases, para escuchar.
- Devuelve `audio_url` **absoluta**, lista para reproducir.

```
POST https://doomy-vision-production.up.railway.app/api/doomy-vision/v1/ask
Header: x-doomy-vision-key: <DOOMY_VISION_INTERNAL_KEY>
Body (form o multipart):
  text        pregunta (opcional si mandas audio)
  image       foto (opcional)
  audio       grabación (opcional)
  device_id   default 'siri-shortcut' — la continuidad se agrupa por aquí
  reset       'true' para empezar conversación limpia
```

Respuesta plana a propósito (los Atajos solo leen claves de primer nivel):

```json
{
  "text": "Un círculo rojo sobre el texto DOOMY 42...",
  "audio_url": "https://.../api/doomy-vision/v1/audio/d17acb45-...",
  "session_id": "b3719352-...",
  "session_created": false,
  "vision_used": true,
  "total_ms": 2390
}
```

## Los dos Atajos

Conviene tener dos, en vez de uno que siempre manda foto: una pregunta de solo
voz no necesita gastar tokens de visión.

### Atajo 1 — "Doomy" (solo voz)

Se invoca: **"Hey Siri, Doomy"**

1. **Dictar texto** *(Dictate Text)* — captura la pregunta por voz.
2. **Obtener contenido de URL** *(Get Contents of URL)*
   - URL: `https://doomy-vision-production.up.railway.app/api/doomy-vision/v1/ask`
   - Método: `POST`
   - Encabezados: `x-doomy-vision-key` → tu internal key
   - Cuerpo de la solicitud: **Formulario**
     - `text` → `Texto dictado`
     - `device_id` → `victor-iphone`
3. **Obtener valor del diccionario** *(Get Dictionary Value)* — clave: `text`
4. **Hablar texto** *(Speak Text)*

### Atajo 2 — "Doomy mira" (con foto de los lentes)

Se invoca: **"Hey Siri, Doomy mira"**, después de apretar el botón de captura
de los lentes.

1. **Obtener fotos recientes** *(Get Latest Photos)* — cantidad: 1
2. **Dictar texto** *(Dictate Text)*
3. **Obtener contenido de URL** — igual que arriba, pero el formulario lleva:
   - `text` → `Texto dictado`
   - `device_id` → `victor-iphone`
   - `image` → `Fotos recientes`   ← al adjuntar archivo pasa a multipart solo
4. **Obtener valor del diccionario** — clave: `text`
5. **Hablar texto**

> Con los lentes conectados por Bluetooth, "Hablar texto" sale por **las bocinas
> de los lentes**, no por el altavoz del teléfono.

### Opcional: la voz real de Doomy (ElevenLabs)

"Hablar texto" usa la voz de Siri. Para la voz de Doomy, cambia los últimos dos
pasos por:

3. **Obtener valor del diccionario** — clave: `audio_url`
4. **Obtener contenido de URL** — método `GET` sobre esa URL
5. Reproducir el archivo resultante

El audio se sirve como `audio/mpeg` y **expira a los 5 minutos** (`audioCache.js`),
así que el Atajo debe reproducirlo enseguida, no guardarlo.

## Qué está verificado y qué no

Probado de verdad contra producción (no en teoría):

- ✅ `/ask` con cuerpo de formulario → responde
- ✅ `/ask` con imagen adjunta → `vision_used: true`, descripción correcta
- ✅ Seguimiento sin imagen, mismo `device_id` → reusa la sesión
      (`session_created: false`) y responde sobre la foto anterior
- ✅ `audio_url` devuelve `Content-Type: audio/mpeg`, 200 OK
- ✅ 70/70 tests del backend

Falta probar en el iPhone real, y son las tres cosas que pueden fallar:

- ❓ **Que la foto de los lentes llegue rápido al carrete.** Es el eslabón más
  débil de todo esto. Puede requerir abrir la app Meta AI para que sincronice.
  Si tarda demasiado, el Atajo tomará la foto *anterior* — que es el modo
  exacto en que esto falla de forma silenciosa y confusa.
- ❓ **Que Siri se pueda invocar por el micrófono de los lentes** sin tocar el
  teléfono. Si no, "Hey Siri" en voz alta lo oye el propio iPhone igual.
- ❓ **Los nombres exactos de las acciones** de Atajos según la versión de iOS.

## Diagnóstico rápido

| Síntoma | Causa probable |
|---|---|
| `401` | Internal key mal escrita en el encabezado |
| `400 No se recibió texto ni audio` | El campo `text` no llegó — revisa que el cuerpo sea "Formulario" |
| Responde *"Necesito ver lo que estás viendo"* | No llegó imagen y la pregunta requería visión — adjunta `image` |
| Describe algo que ya no estás viendo | La foto de los lentes no se sincronizó a tiempo; el Atajo tomó la anterior |
| `429` | Límite de 30 requests/minuto para rutas con imagen |
