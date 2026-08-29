# Doomy Vision — Test Plan

## Automatizados (ejecutados en esta sesión)

### Backend (`backend/`) — `npm test`, Vitest + Supertest, MOCK_MODE, sin llamadas pagadas

**43/43 PASS** (Mission 002 — subió de 30/30 sin bajar ninguno; nunca se removió una prueba
para "arreglar" un número). Cobertura añadida esta misión, además de la heredada:

- Instrumentación y contrato de respuesta: `request_id` (= `response_id`) + header
  `X-Request-Id`, eco de `audio_capture_ms` client-measured, `response_mode` (screen/wearable),
  `vision_context_summary` (siempre el texto real ya generado, nunca inventado),
  `vision_required` con `status` + `reason`.
- **Fallos de proveedores (bug real encontrado y corregido)**: si TTS falla, la respuesta
  sigue siendo 200 con el texto y `audio: null` / `audio_unavailable: true` — antes fallaba
  toda la request y se perdía también el texto. Si el LLM falla, se devuelve `LLMError`
  tipado (502, `DV_LLM_001`) con mensaje amigable, nunca la excepción cruda ni un 500 genérico.
- Memoria visual de sesión (`tests/session_memory.test.js`): imagen A + follow-up sigue
  usando los bytes de A; imagen B reemplaza el contexto (el follow-up ya no ve A);
  limitación honesta documentada — una pregunta comparativa tras el reemplazo solo tiene
  acceso a la imagen activa, nunca a ambas; `vision_context_summary` se reemplaza, no
  acumula. **Aislamiento crítico entre sesiones concurrentes** (sección 53): dos sesiones
  en paralelo, cada una con su propia imagen y sus propios follow-ups, nunca mezclan
  `session_id`, imagen activa ni historial; `request_id` único bajo concurrencia.
- `/diagnostics` expone límites operativos no secretos (`limits.audio_max_seconds`, etc.)
  para que el simulador/Bridge se auto-ajusten, verificado que nunca filtra secretos.

**Bug real encontrado y corregido en `src/intent.js`**: la heurística de "pregunta corta de
seguimiento" usaba un límite de 6 palabras; se descubrió escribiendo el test de la
limitación honesta de arriba (falló primero de forma genuina) que preguntas normales de 7
palabras en español ("¿cuál de los dos tenía más puertos?") caían fuera del umbral y
perdían la imagen activa sin motivo. Corregido subiendo el límite a 12 palabras.

**Bug real encontrado y corregido — reset de sesión no limpiaba el contexto visual**:
`POST /session/:id/reset` limpiaba `history`/`lastImage`/`turns` pero no
`lastImageBuffer` ni `visionContextSummary` — un turno de texto completamente nuevo
después de un reset seguía devolviendo el resumen visual de la imagen de ANTES del reset.
Encontrado con una prueba real que falló primero (`tests/session.test.js`), corregido.

**Bug real encontrado y corregido — fallo de red crudo en STT no se normalizaba**:
`GroqSTTProvider` ya envolvía un `!resp.ok` en `AudioError`, pero una excepción de `fetch`
en sí (DNS, timeout, conexión rechazada) no pasaba por ese envoltorio y se colaba como un
500 genérico en vez de un 502 `AudioError` limpio. Encontrado simulando un fallo de red
crudo en la prueba de STT (`tests/conversation.test.js`), corregido envolviendo la llamada
en `conversation.js` igual que ya se hacía para LLM/TTS. Confirmado además que un fallo de
STT nunca deja pasar texto vacío/basura al LLM (el request se aborta antes).

**Concurrencia (Fase 53, `tests/concurrency.test.js`)**: 10 conversaciones simultáneas en
10 sesiones distintas — sin crash, sin mezclar `session_id`, `request_id` únicos. 8
requests simultáneos DENTRO de la misma sesión — el historial final refleja exactamente
el número de turnos esperado, sin pérdidas ni duplicados bajo concurrencia.

**Recuperación de errores (Fase 22/44)**: un fallo de LLM o de TTS en un turno no deja la
sesión ni el proceso en un estado roto — el turno siguiente, en la misma sesión, sin
reiniciar nada, funciona normalmente (probado explícitamente, no asumido).

Cobertura heredada de Mission 001:

- Registro de dispositivo: llave interna correcta/incorrecta, campos faltantes.
- Auth: rutas protegidas sin token, con token inválido/expirado.
- Sesiones: creación, 404 en sesión inexistente, reset.
- Conversación de texto: respuesta simple, sin `session_id`, sin texto ni audio, sesión
  inexistente.
- Conversación con visión: imagen adjunta (`vision_used: true`), continuidad entre turnos
  (pregunta de seguimiento reutiliza la última imagen — el caso de uso central de la
  misión), pregunta que requiere visión sin imagen previa (`vision_requested: true`, no
  inventa respuesta), MIME inválido, imagen que excede el tamaño máximo configurado.
- Conversación con audio: transcripción (mock STT), MIME de audio inválido.
- `/vision`: subida directa, flag `remember` (responde honestamente "no conectado
  todavía"), sin `session_id`.
- `/audio/transcribe`, `/audio/speak`, descarga de audio generado, 404 en audio
  inexistente/expirado.
- `/health`, `/diagnostics`, 404 estructurado en ruta desconocida.
- Rate limiting: 429 real al superar el límite configurado (aislado con
  `vi.resetModules()` + env override, sin afectar al resto de la suite).

### Web Simulator (`simulator/`) — Playwright headless (`backend/tests/manual_e2e_simulator.mjs`)

**PASS.** Flujo real en navegador: registro → sesión → turno de texto → turno que dispara
`vision_requested`. Sin errores de JS de la propia app (el único `requestfailed`
detectado es de red: Google Fonts bloqueado por el egress de este sandbox — corregido/
documentado, no es un bug de la aplicación; en Railway con salida a internet normal,
Google Fonts carga sin problema).

**Re-ejecutado en Mission 002 tras la reescritura del composer** (máquina de estados
IDLE/LISTENING/PROCESSING/SPEAKING/ERROR, botón PTT grande, internal key enmascarada,
auto-captura opcional) — sigue **PASS**, mismo resultado, sin errores nuevos de JS.

**Cobertura E2E expandida en Mission 002** (antes solo cubría texto + `vision_requested`
sin imagen): crear sesión -> **subir una imagen real** (fixture JPEG generada con `sharp`
en memoria, vía `page.setInputFiles`) -> preguntar -> confirmar `vision_used` en la
respuesta -> **reproducir de verdad el audio TTS mock** (`audio.play()` disparado en la
página, confirmando `readyState > 0`, no solo que el elemento exista) -> turno de
seguimiento -> **confirmar que la sesión se preservó** (mismo `session_id`, el follow-up
también trae `vision_used`) -> reset -> confirmar el mensaje correcto de
`vision_requested` tras el reset. Las 7 fases corren en una sola pasada, **PASS**, sin
errores de JS reales (el único ruido conocido sigue siendo Google Fonts bloqueado por el
egress del sandbox, filtrado explícitamente en el script porque no es un bug de la app).

**Emulación de viewport móvil real (Playwright `devices['iPhone 13']`) — PASS.** Se
verificó visualmente (capturas de pantalla reales, no asumidas) que el layout de una
columna, el botón de PTT a ancho completo y el campo de internal key enmascarado se ven y
funcionan correctamente en un viewport de iPhone emulado: conectar → sesión → enviar turno
de texto → respuesta con barra de latencia y reproductor de audio, todo legible y sin
overflow horizontal. **Esto es emulación de Chromium con perfil de dispositivo, no un
navegador móvil físico real** — ver el checklist de abajo para lo que falta probar en
hardware real.

#### Checklist manual — navegador móvil real (Fase 7-10, Mission 002)

**READY TO TEST** — implementado y verificado por emulación esta misión, pero **ningún
ítem de esta lista puede marcarse PASS sin un dispositivo físico real**, siguiendo la
misma regla de "no inventar resultados" que el checklist de hardware de abajo.

| # | Prueba | Android Chrome | iPhone Safari | Desktop Chrome |
|---|---|---|---|---|
| 1 | Permiso de micrófono (aceptar) | READY TO TEST | READY TO TEST | READY TO TEST |
| 2 | Permiso de micrófono (denegar) → estado ERROR visible, no falla en silencio | READY TO TEST | READY TO TEST | READY TO TEST |
| 3 | Push-to-talk: mantener presionado, soltar, se adjunta el audio | READY TO TEST | READY TO TEST | READY TO TEST |
| 4 | PTT: interrumpir el gesto (deslizar el dedo fuera del botón) cancela sin enviar | READY TO TEST | READY TO TEST | N/A (mouse) |
| 5 | PTT: cambiar de app/pestaña a mitad de grabación cancela en vez de dejar el mic abierto | READY TO TEST | READY TO TEST | READY TO TEST |
| 6 | PTT: grabación que excede la duración máxima se corta sola | READY TO TEST | READY TO TEST | READY TO TEST |
| 7 | Permiso de cámara + captura de frame manual | READY TO TEST | READY TO TEST | READY TO TEST |
| 8 | Envío de imagen + pregunta → respuesta con `vision_used` | READY TO TEST | READY TO TEST | READY TO TEST |
| 9 | Reproducción de audio de respuesta (TTS) — estado SPEAKING visible mientras suena | READY TO TEST | READY TO TEST | READY TO TEST |
| 10 | Reconexión de red: cortar wifi/datos a medio flujo, confirmar aviso claro y recuperación | READY TO TEST | READY TO TEST | READY TO TEST |
| 11 | `MediaRecorder` produce un formato de audio que el backend acepta (Safari no soporta `audio/webm`) | N/A | READY TO TEST — crítico, Safari necesita el fallback `audio/mp4` | N/A |

Instrucciones para ejecutar: desplegar el backend (local con `npm run dev` o Railway) con
el Dev Console accesible en `/doomy-vision/dev/` desde la red del teléfono, abrir con el
navegador correspondiente, y marcar cada fila PASS/FAIL con una nota corta.

### Bridge Android `:core` — Gradle/JUnit5, Kotlin/JVM puro

**26/26 PASS.** Cobertura: máquina de estados (transiciones válidas/ inválidas, listeners,
recuperación desde ERROR), Push-to-talk (ciclo completo, rechazo de press/release fuera de
orden, límite de duración), VisionFrameProvider (fallback `capturePhoto`→stream, frame de
calidad insuficiente, fallo total, mock como último recurso), MockWearablesManager (flujo
documentado de MockDeviceKit, orden power-on/don obligatorio, disconnect), AudioRoute
(nunca asume Ray-Ban por default, notifica cambios de ruta), ConversationManager (turno de
texto, turno con visión, error de API mueve a ERROR en vez de colgarse, `sendTurn` sin
sesión falla claro).

**Dos bugs reales encontrados y corregidos durante esta corrida** (no eran teóricos —
los tests fallaron primero, luego se corrigieron):
1. `READY → PROCESSING` no era una transición válida, rompiendo cualquier turno de texto
   que no pasara por `LISTENING` (p. ej. desde el Dev Console/teclado).
2. `CompositeVisionFrameProvider` registraba dos veces en diagnósticos cuando un provider
   fallaba por excepción, desalineando el orden de los eventos de fallback.

Ambos corregidos en `core/` y reflejados también en el espejo Swift (`bridge-ios/`).

## No ejecutados en este entorno (requieren macOS/Xcode o hardware)

- **Bridge iOS** (`bridge-ios/Tests/`): mismo contenido que los tests de Android, **NOT
  RUN** — sin toolchain de Swift en este contenedor Linux. Ejecutar con `swift test` en
  una Mac.
- **Bridge Android `:app`** (UI, CameraX, Bluetooth real, MWDAT real): **BUILD NOT
  AVAILABLE IN CURRENT ENVIRONMENT** — sin Android SDK. Abrir en Android Studio para
  compilar y correr instrumented tests.
- **Ray-Ban físicos**: todo lo que sigue es **HARDWARE VERIFICATION PENDING**.

## Checklist manual con hardware real (cuando Victor tenga acceso al Developer Preview + lentes)

Numerado según el orden recomendado en la sección 10 del brief original:

1. [ ] Emparejar Ray-Ban Meta en la app oficial "Meta AI".
2. [ ] Registrar Doomy Vision (deeplink) — confirmar que aparece en Meta AI como app conectada.
3. [ ] Aceptar permiso de cámara la primera vez.
4. [ ] Iniciar sesión DAT (`MWDATCore` + `MWDATCamera.startSession()`).
5. [ ] Confirmar HFP: la UI debe mostrar "Micrófono: Ray-Ban Meta ✅", no "iPhone ⚠️".
6. [ ] Grabar audio de prueba (PTT) y confirmar transcripción correcta.
7. [ ] Obtener un frame — probar primero `capturePhoto`, y si fallara (posible con HFP
       activo, ver sección 8 de la arquitectura), confirmar que
       `CompositeVisionFrameProvider` cae automáticamente al frame de stream.
8. [ ] Detener audio, confirmar que la cámara se recupera correctamente después.
9. [ ] Reproducir TTS por las bocinas de los Ray-Ban (no el teléfono).
10. [ ] Caso de uso completo: "Doomy, ¿qué estoy viendo?" → respuesta correcta → "¿Tiene
        PoE?" → Doomy mantiene contexto del mismo objeto.
11. [ ] Probar reconexión: apagar Bluetooth a medio flujo, confirmar mensaje claro
        ("Ray-Ban desconectados") y que la app no crashea.
12. [ ] Probar fallback de teléfono: con los lentes apagados, confirmar que MODE C
        (cámara/mic del teléfono) funciona como respaldo.

Ningún ítem de esta sección puede marcarse PASS sin ejecutarlo contra hardware real —
ver la regla "No inventar resultados" en `DOOMY_VISION_FINAL_REPORT.md`.
