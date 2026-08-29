# Doomy Vision — Blockers

Ningún bloqueo detuvo la misión completa: cada uno se documenta aquí y el trabajo
continuó en cualquier otra parte independiente, tal como se pidió.

_Actualizado en Mission 002: los BLOCKERS 1-4 (Mission 001) siguen vigentes sin cambios —
ninguno se resolvió esta sesión, se re-confirman abajo. Se agrega BLOCKER 5, específico de
Mission 002._

---

## BLOCKER 5 (Mission 002) — Sin credenciales reales de proveedor en este entorno

**IMPACT**: Alto para poder marcar Anthropic/Groq/ElevenLabs como "REAL VERIFIED" en vez
de "IMPLEMENTED NOT VERIFIED". Cero impacto en el resto del trabajo — todo el pipeline,
la instrumentación, la seguridad, los tests y la documentación se completaron y
verificaron igual, en `MOCK_MODE`.

**EVIDENCE**: Se intentó leer los valores reales de `ANTHROPIC_API_KEY`, `GROQ_API_KEY`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` del servicio `doomy-assistant` en Railway vía
el MCP de Railway conectado a esta sesión (`list-variables`). La respuesta confirma que
las 51 variables existen (incluidas las cuatro anteriores), pero **`valuesRedacted:
true`** — esta conexión de Railway (OAuth app, no API token de sesión completa) solo
expone nombres de variable, nunca valores en texto plano. Esto es el comportamiento de
seguridad correcto de Railway para conexiones OAuth, no un bug ni un permiso a pedir que
se cambie. Ver `MISSION_002_BASELINE.md` para el detalle completo de este hallazgo.

**WHAT WAS TRIED**: `list-variables` vía Railway MCP (confirmó existencia, no valores);
no se intentó ningún otro método para extraer las llaves (correcto — extraerlas sin
autorización explícita de Victor estaría fuera de la regla de aislamiento y de buenas
prácticas de seguridad, incluso si técnicamente fuera posible).

**WHAT USER NEEDS TO DO**: Si Victor quiere pasar de IMPLEMENTED NOT VERIFIED a REAL
VERIFIED para los tres proveedores, puede proveer credenciales de prueba explícitamente
(idealmente llaves separadas/acotadas, no las de producción de `doomy-assistant`) en una
sesión futura. Con eso, `npm run smoke` (backend) hace como mucho 1-3 llamadas reales por
proveedor — nunca un loop, nunca automatizado — y `npm run smoke:pipeline` valida el
pipeline completo de punta a punta contra un servidor con `MOCK_MODE=false`.

**WHAT CLAUDE CONTINUED WORKING ON**: Todo el resto de Mission 002 en `MOCK_MODE=true` —
pipeline completo instrumentado, manejo de fallos de proveedor probado con mocks que
simulan fallos reales (timeout, auth inválida, respuesta malformada), los dos scripts de
smoke test escritos y verificados en su lógica de gate/ejecución (aunque sin credenciales
para ejercer las llamadas reales en sí), y el código de los tres providers auditado línea
por línea contra la documentación oficial vigente de cada proveedor (Anthropic Messages
API, Groq Whisper, ElevenLabs TTS) para maximizar la probabilidad de que funcionen a la
primera cuando haya credenciales reales.

---

## BLOCKER 1 — Acceso de lectura al repositorio `doomy-assistant`

**IMPACT**: Alto para "reutilizar arquitectura existente" al pie de la letra; bajo para
el resultado entregado, porque Doomy Vision se diseñó aislado desde el principio.

**EVIDENCE**: `git clone` y `curl https://api.github.com/repos/VictorVonDoom1051/doomy-assistant`
desde este entorno devuelven: *"GitHub access to this repository is not enabled for this
session."* No hay `gh` CLI autenticado ni token de git configurado en el entorno de
trabajo. El repo no es público (una petición no autenticada a la API de GitHub no
devuelve sus datos).

**WHAT WAS TRIED**:
- `git clone https://github.com/VictorVonDoom1051/doomy-assistant.git` → falla (pide
  credenciales).
- `curl https://api.github.com/repos/...` → 404/mensaje de acceso no habilitado.
- Auditoría alternativa vía Railway MCP (proyectos, servicios, `get-service-config`,
  `list-variables` — solo nombres) — **esto sí funcionó** y es la base de
  `docs/DOOMY_VISION_ARCHITECTURE.md §2`.

**WHAT USER NEEDS TO DO**: Conectar este repositorio a la sesión (o a un futuro entorno
de trabajo) con acceso de GitHub, o compartir un export/zip del código de
`doomy-assistant` para revisión — sin necesidad de dar acceso de escritura, solo lectura,
para poder integrar Doomy Vision como un módulo real más adelante en vez de un backend
paralelo.

**WHAT CLAUDE CONTINUED WORKING ON**: Todo el resto de la misión — el backend de Doomy
Vision se construyó como servicio Node/Express aislado, siguiendo el mismo *patrón* de
autenticación (`DOOMY_WHATSAPP_INTERNAL_KEY` → `DOOMY_VISION_INTERNAL_KEY`) y los mismos
proveedores de IA (mismos nombres de variable) inferidos de la auditoría de Railway, sin
necesitar el código fuente exacto.

---

## BLOCKER 2 — Meta Wearables Device Access Toolkit (Developer Preview)

**IMPACT**: Alto para MODE A (Ray-Ban reales) y para compilar `bridge-android/app` /
`bridge-ios` con la dependencia real de MWDAT. Cero impacto en el backend, el simulador
web, o la lógica de negocio del Bridge (`:core`), que no dependen de MWDAT.

**EVIDENCE**: Investigación activa (WebSearch/WebFetch) contra la documentación oficial
vigente (agosto 2026):
- El toolkit está en fase "Developer Preview" — requiere aplicar y ser aprobado
  (`developers.meta.com/wearables/faq/`: *"Publishing is currently not available during
  the Developer Preview phase"*).
- El paquete de Android se distribuye vía GitHub Packages con autenticación
  (`GITHUB_TOKEN` en `settings.gradle.kts`, ver README oficial de
  `facebook/meta-wearables-dat-android`) — acceso que solo se otorga junto con la
  aprobación del Developer Preview.
- El manifest requiere un `APPLICATION_ID` que **emite Meta** tras el registro.

**WHAT WAS TRIED**: Lectura completa de la documentación oficial actual (no ejemplos
viejos, verificado por fecha), de los dos repos oficiales (`meta-wearables-dat-ios`,
`meta-wearables-dat-android`) y de su FAQ, para entender exactamente qué se necesita y
diseñar la abstracción (`WearablesManager`) de forma que integrar el SDK real sea
"descomentar + implementar 3 métodos ya documentados", no un rediseño.

**WHAT USER NEEDS TO DO** (acción de Victor, no de Claude):
1. Aplicar al Developer Preview: https://developers.meta.com/wearables/
2. Tras aprobación, obtener el `APPLICATION_ID` y un `GITHUB_TOKEN` con acceso al paquete
   privado.
3. Tener Ray-Ban Meta físicos emparejados con la app oficial "Meta AI".
4. Tener una Mac con Xcode (para iOS) y/o Android Studio con Android SDK (para Android)
   — ninguno de los dos existe en este entorno de trabajo en la nube.

**WHAT CLAUDE CONTINUED WORKING ON**: `MockWearablesManager` (Kotlin y Swift), que
reproduce el comportamiento *documentado* de MockDeviceKit y está completamente probado
(Kotlin: 4 tests en verde). `RealWearablesManager` se dejó como estructura + comentarios
exactos de qué llamada real va en cada método, para minimizar el trabajo cuando el acceso
exista.

---

## BLOCKER 3 — Sin Android SDK / Xcode en este entorno

**IMPACT**: Los módulos `bridge-android/app` y `bridge-ios` (código de aplicación real,
UI, CameraX/AVFoundation, Bluetooth) no se pudieron compilar ni probar aquí.

**EVIDENCE**: `which xcodebuild`, `which android`/`sdkmanager` → vacío;
`$ANDROID_HOME`/`$ANDROID_SDK_ROOT` no configurados; el sistema operativo de este
contenedor es Linux (Xcode requiere macOS por definición). El dispositivo del usuario
vinculado a esta sesión (Windows, `alien-deox`) tampoco tiene Android Studio ni Xcode
instalados (Xcode es imposible en Windows de todas formas), y no había ninguna carpeta
conectada para siquiera verificarlo directamente en ese equipo.

**WHAT WAS TRIED**: Se aisló deliberadamente toda la lógica de negocio que SÍ es
independiente de esos SDKs en un módulo Kotlin/JVM puro (`bridge-android/core`), que se
compiló y probó con éxito con Gradle + JDK 21 (ambos sí disponibles aquí) — 26/26 tests
en verde, incluyendo 2 bugs reales encontrados y corregidos. El espejo en Swift
(`bridge-ios/`) se escribió con el mismo cuidado pero no pudo ejecutarse (sin toolchain
de Swift en Linux).

**WHAT USER NEEDS TO DO**: Abrir `bridge-android/` en Android Studio (con Android SDK
compileSdk 35 instalado) y/o `bridge-ios/Package.swift` en Xcode, en su propia máquina o
en un entorno con esas herramientas, para compilar y correr los módulos de aplicación.

**WHAT CLAUDE CONTINUED WORKING ON**: Backend, simulador web, arquitectura y toda la
lógica de negocio del Bridge que no depende de esos SDKs — que es, en volumen, la mayor
parte del sistema y la que más frecuentemente cambia durante el desarrollo.

---

## BLOCKER 4 (informativo, no bloqueante) — Google Fonts en el Dev Console durante pruebas

**IMPACT**: Cosmético únicamente. No afecta funcionalidad.

**EVIDENCE**: La prueba E2E con Playwright detectó `net::ERR_CONNECTION_RESET` al cargar
`fonts.googleapis.com` — el egress de red de este sandbox de trabajo no permite ese host
(aunque sí permite el resto de las pruebas: registro, sesión, conversación). El Dev
Console ya declara un stack de fuentes de respaldo (`system-ui, sans-serif`), así que la
página se ve y funciona correctamente de todas formas.

**WHAT USER NEEDS TO DO**: Nada — en Railway (con salida a internet normal) Google Fonts
cargará sin problema. Si se prefiere evitar la dependencia externa por completo, se puede
reemplazar por fuentes del sistema únicamente (cambio de una línea en
`simulator/index.html`).

**WHAT CLAUDE CONTINUED WORKING ON**: Se agregó un favicon inline (data URI) que sí
eliminó el otro error de red detectado (404 de `/favicon.ico`).

---

## Estado de BLOCKERS 1-4 al cierre de Mission 002

Re-confirmados, sin cambios de sustancia — ninguno se resolvió esta sesión porque
resolverlos requiere una acción de Victor (acceso al repo, aprobación de Meta, un
entorno con Android Studio/Xcode) fuera del alcance de esta sesión de trabajo:

- **BLOCKER 1** (acceso a `doomy-assistant`): sigue sin acceso. No se necesitó esta
  sesión — Mission 002 trabajó enteramente dentro de `doomy-vision/` como siempre.
- **BLOCKER 2** (Meta Wearables Developer Preview): sigue sin aprobación/credenciales de
  Meta. Cero impacto en el trabajo de Mission 002 (backend, seguridad, tests, docs), que
  no depende de MWDAT.
- **BLOCKER 3** (sin Android SDK/Xcode en este entorno): sigue igual. Mission 002 no
  tocó `bridge-android/app` ni `bridge-ios` más allá de lo ya descrito en
  `DOOMY_VISION_PROGRESS.md` — el rebuild limpio de `:core` (Kotlin/JVM puro, sí compila
  aquí) se re-verificó con éxito (26/26) como parte del re-run final de Mission 002.
- **BLOCKER 4** (Google Fonts en sandbox): sigue igual, cosmético, no bloqueante —
  reapareció de forma distinta durante el E2E expandido de Mission 002 (un
  `console.error` sin URL en vez de un `requestfailed`) y se documentó/filtró en el
  script de test sin necesitar ningún cambio de producto.
