# Doomy Vision — Privacidad

Este documento describe **exactamente** qué captura, envía y retiene el backend de Doomy
Vision, verificado leyendo el código real (`backend/src/`), no descrito de memoria. Si
algo cambia en el código, este documento debe actualizarse — nunca promete una garantía
que el código no implemente de verdad.

## Qué se captura

- **Texto**: lo que el usuario escribe o dice (voz transcrita).
- **Audio**: solo mientras se mantiene presionado el botón de push-to-talk — nunca hay
  grabación continua. El audio se manda al backend como un archivo (una request), nunca
  como streaming continuo.
- **Imagen**: solo cuando el usuario adjunta una foto explícitamente (o el Bridge la
  captura por una pregunta que la requiere) — nunca hay envío continuo de video. V1 nunca
  manda frames de video, solo una foto puntual por interacción.

No se captura ubicación, datos biométricos, ni ningún perfil de usuario más allá de lo
descrito abajo.

## Qué se envía a terceros

Cuando `DOOMY_VISION_MOCK_MODE=false` (proveedores reales configurados), cada interacción
puede generar hasta tres llamadas salientes, cada una a un proveedor distinto:

| Dato | Proveedor | Cuándo |
|---|---|---|
| Audio de la grabación (PTT) | Groq (Whisper) | Si el turno incluye audio, para transcribirlo |
| Texto del usuario + imagen (si hay una activa) + historial reciente de la sesión | Anthropic (Claude) | En cada turno, para generar la respuesta |
| Texto de la respuesta de Doomy | ElevenLabs | Si `TTS_ENABLED=true`, para generar el audio de respuesta |

Las llaves de estos proveedores viven **solo** en el backend — nunca se envían al Bridge
(app móvil) ni al navegador. El Bridge y el Dev Console solo hablan con el backend de
Doomy Vision, nunca directo con Anthropic/Groq/ElevenLabs.

En `DOOMY_VISION_MOCK_MODE=true` (o cuando falta la credencial de un proveedor
específico), ese proveedor se reemplaza por una versión simulada que no envía nada a
ningún tercero — genera respuestas deterministas localmente.

## Qué se retiene, dónde, y por cuánto tiempo

Todo lo que sigue vive **en memoria del proceso Node.js**, nunca en disco ni en una base
de datos — un reinicio del proceso borra todo. No hay persistencia entre despliegues.

| Dato | Dónde | Cuánto dura |
|---|---|---|
| Historial de turnos (texto, sin audio ni imagen) | `SessionStore` (Map en memoria) | Últimos `MAX_CONVERSATION_HISTORY` turnos (default 12); toda la sesión expira tras `SESSION_TTL_MINUTES` de inactividad (default 60 min) o al reiniciar el proceso |
| Imagen activa (buffer optimizado + miniatura) | Campo de la sesión en memoria | Hasta `SESSION_LAST_IMAGE_TTL_MINUTES` (default 15 min), o hasta que llega una imagen nueva (la reemplaza por completo), o hasta un reset/expiración de sesión |
| `vision_context_summary` (el texto que el LLM ya generó sobre la imagen activa) | Campo de la sesión en memoria | Igual que la imagen activa — se reemplaza junto con ella, nunca se acumula |
| Audio de la grabación del usuario (el archivo de PTT en sí) | **No se retiene** | Se usa una sola vez para transcribir (STT) dentro del mismo request y se descarta — nunca se guarda en la sesión ni en ningún lado |
| Audio de la respuesta (TTS) | `audioCache` (Map en memoria) | 5 minutos exactos desde que se genera, luego se borra automáticamente; se sirve por una URL de un solo uso con ese mismo TTL |
| "Recordar" una imagen explícitamente (`remembered`) | **No implementado todavía** | La interfaz `RememberedVisionStore` existe pero es un no-op — pedir "recuerda esto" no persiste nada más allá de la sesión en memoria de hoy. Esto se documenta honestamente aquí y en la respuesta misma del backend, no se simula una persistencia que no existe |

## Qué se loguea (y qué nunca se loguea)

Los logs estructurados (`pino`) registran metadatos operativos: duración de cada etapa
(`stt_ms`, `llm_ms`, `tts_ms`, etc.), tamaños en bytes de imagen/audio, resultado
(`ok`/`error`), `session_id`, `device_id`, método y URL de la request, código de estado
HTTP.

**Nunca se loguea**: el texto que escribió o dijo el usuario, el texto de la respuesta de
Doomy, el contenido de la imagen (ni completo ni en base64), el contenido del audio (ni
completo ni en base64), API keys de ningún proveedor, el `DOOMY_VISION_INTERNAL_KEY`, el
header `Authorization` completo, ni ningún JWT emitido — todos estos campos están en la
lista de redacción explícita de `pino` (`src/logger.js`) y además, por diseño, ninguna
línea de log en el código construye un objeto que los incluya en primer lugar (verificado
línea por línea en `backend/src/`, no solo confiado a la redacción).

## Cómo borrar una sesión

`POST /api/doomy-vision/v1/session/:id/reset` borra, dentro del mismo proceso, el
historial de turnos, la imagen activa, su resumen, y el buffer de imagen asociado de esa
sesión — inmediatamente, no espera a un TTL. El Dev Console tiene un botón "Reset
session" que llama a este endpoint.

Alternativamente, no interactuar con una sesión durante `SESSION_TTL_MINUTES` (default 60
min) hace que se borre sola en el siguiente barrido periódico (cada 5 min).

No existe hoy un mecanismo de "borrar todas mis sesiones" a través de dispositivos,
porque no hay ningún identificador de usuario persistente más allá de `device_id` +
`session_id` — cada sesión es independiente y no se cruza con otras (verificado con
pruebas explícitas de aislamiento entre sesiones concurrentes, ver
`docs/DOOMY_VISION_TEST_PLAN.md`).

## Lo que este documento NO promete

- No promete cifrado end-to-end (usa HTTPS en tránsito cuando se despliega en Railway,
  como cualquier servicio web estándar — ver `docs/DOOMY_VISION_ARCHITECTURE.md` sección
  de HTTPS).
- No promete que los proveedores de IA (Anthropic/Groq/ElevenLabs) no retengan datos por
  su cuenta según sus propias políticas — eso está fuera del control de este backend; ver
  las políticas de privacidad de cada proveedor por separado.
- No promete un sistema de memoria persistente ni multi-imagen — explícitamente no existe
  todavía (ver arriba y `docs/DOOMY_VISION_ARCHITECTURE.md §4.2.1`).
