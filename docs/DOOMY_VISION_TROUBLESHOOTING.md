# Doomy Vision — Troubleshooting

## Backend

**"Doomy Vision no puede arrancar fuera de MOCK_MODE sin esta configuración"**
Faltan `DOOMY_VISION_INTERNAL_KEY`, `DOOMY_VISION_JWT_SECRET` o `ANTHROPIC_API_KEY` con
`DOOMY_VISION_MOCK_MODE=false`. O se completan esas variables, o se deja `MOCK_MODE=true`
para desarrollo.

**401 en `/device/register`**
El header `x-doomy-vision-key` no coincide con `DOOMY_VISION_INTERNAL_KEY` del servidor.
En `MOCK_MODE=true` sin `DOOMY_VISION_INTERNAL_KEY` configurada, cualquier request pasa;
en cuanto se configura, hay que mandar el valor exacto.

**429 Too Many Requests**
`RATE_LIMIT_MAX_PER_MINUTE` (default 60) alcanzado. Es por proceso/IP, no por sesión.

**Imagen rechazada con ValidationError**
Revisar `VISION_MAX_IMAGE_MB` (default 6MB) y que el MIME sea uno de
`image/jpeg|png|webp|heic|heif`.

## Gradle / Kotlin (`bridge-android/core`)

**`InvalidPathException: Malformed input or unmappable characters` al compilar tests**
El locale del sistema es POSIX/C (sin UTF-8) y algún nombre de test (backtick) tiene
caracteres no-ASCII (tildes, ñ, etc.), lo que rompe la generación de nombres de clase para
lambdas. Ya corregido en este repo (los nombres de test evitan acentos + `gradle.properties`
fuerza `file.encoding=UTF-8`), pero si aparece de nuevo: `LANG=C.UTF-8 LC_ALL=C.UTF-8
gradle test`, o evitar acentos en nombres `` `de test` ``.

## Meta Wearables DAT / Ray-Ban (para cuando haya hardware)

**Los Ray-Ban no aparecen para emparejar**
Confirmar que están emparejados primero en la app oficial "Meta AI" (no en Ajustes de
Bluetooth del sistema) — el flujo de DAT depende de ese emparejamiento previo.

**El registro (deeplink a Meta AI) no vuelve a la app**
Verificar el `APPLICATION_ID` en el manifest/plist — un ID incorrecto o no aprobado hace
que Meta AI rechace el deeplink silenciosamente.

**Bluetooth / HFP no conecta**
Revisar permisos `BLUETOOTH_CONNECT`/`BLUETOOTH_SCAN` (Android 12+) o el Info.plist
correspondiente en iOS. Confirmar que el perfil HFP se conectó (no solo A2DP) — HFP es el
que trae el micrófono, A2DP es solo audio de salida de alta calidad.

**Micrófono equivocado (se usa el del teléfono sin darse cuenta)**
Por diseño, `AudioRouteManager` nunca asume Ray-Ban por default — si la UI muestra
"Micrófono: iPhone ⚠️" cuando deberían estar los lentes, es una señal real de que HFP no
está conectado, no un bug de la UI. Revisar el estado de Bluetooth del sistema primero.

**`capturePhoto()` falla mientras se está en llamada/HFP activo**
Comportamiento reportado por la comunidad de desarrolladores de MWDAT (ver
`DOOMY_VISION_ARCHITECTURE.md#foto-vs-frame-de-stream`). `CompositeVisionFrameProvider`
ya está diseñado para caer automáticamente al frame de stream en este caso — si no lo
hace, revisar que `assessQuality()` no esté marcando el frame de stream como `UNUSABLE`
incorrectamente.

**Cámara no se recupera después de detener audio**
No hay guía oficial confirmada sobre el orden exacto — este proyecto adopta la postura
conservadora de inicializar audio antes que cámara (ver Arquitectura §4.6). Si el
problema persiste con hardware real, documentar el comportamiento exacto encontrado aquí
y actualizar `docs/DOOMY_VISION_ARCHITECTURE.md`.

## Railway (cuando se despliegue)

**Healthcheck falla tras deploy**
Confirmar `PORT` — Railway inyecta su propio `PORT`, y `server.js` ya lo respeta via
`config.port` (lee `process.env.PORT`). No hardcodear el puerto.

**TTS/STT no funcionan en producción pero sí en local**
Confirmar que `DOOMY_VISION_MOCK_MODE=false` esté seteado en el servicio de Railway (no
solo en `.env` local) y que las llaves (`ANTHROPIC_API_KEY`, `GROQ_API_KEY`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`) estén copiadas correctamente desde
`doomy-assistant`.
