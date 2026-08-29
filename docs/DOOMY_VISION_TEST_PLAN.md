# Doomy Vision — Test Plan

## Automatizados (ejecutados en esta sesión)

### Backend (`backend/`) — `npm test`, Vitest + Supertest, MOCK_MODE, sin llamadas pagadas

**30/30 PASS.** Cobertura:

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
`vision_requested`. Sin errores de JS de la propia app (los dos únicos `requestfailed`
detectados en la primera corrida eran de red: Google Fonts bloqueado por el egress de
este sandbox, y un favicon 404 — ambos corregidos/documentados, no son bugs de la
aplicación; en Railway con salida a internet normal, Google Fonts carga sin problema).

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
