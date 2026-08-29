# Doomy Vision — Setup

## Requisitos

| Componente | Requisito | Estado en este entorno |
|---|---|---|
| Backend | Node.js 20+ | ✅ Node 22 disponible, todo instalado y probado |
| Web Simulator | Ninguno extra (servido por el backend) | ✅ probado |
| Bridge Android `:core` | JDK 21 + Gradle | ✅ probado, 26/26 tests PASS |
| Bridge Android `:app` | Android Studio + Android SDK (compileSdk 35) | ❌ no disponible aquí |
| Bridge iOS | Xcode 15+ en macOS | ❌ no disponible aquí (entorno Linux) |
| Ray-Ban Meta reales | Developer Preview de Meta aprobado + lentes físicos | ❌ pendiente de Victor |

## 1. Backend (local)

```bash
cd doomy-vision/backend
cp .env.example .env        # MOCK_MODE=true por default — funciona sin llaves reales
npm install
npm test                     # 30/30 tests, sin llamadas pagadas
npm run dev                  # http://localhost:8090
```

Dev Console: abrir `http://localhost:8090/doomy-vision/dev/` — pegar la
`DOOMY_VISION_INTERNAL_KEY` de tu `.env` (en `MOCK_MODE=true` cualquier valor funciona
si `DOOMY_VISION_INTERNAL_KEY` está vacía, pero se recomienda fijarla siempre).

Para usar proveedores reales (Anthropic/Groq/ElevenLabs): copiar las mismas llaves que ya
usa `doomy-assistant` en Railway, poner `DOOMY_VISION_MOCK_MODE=false`, y generar secretos
nuevos para `DOOMY_VISION_INTERNAL_KEY` / `DOOMY_VISION_JWT_SECRET`
(`openssl rand -hex 32`).

## 2. Bridge Android — módulo `core` (lógica de negocio, sí compila aquí)

```bash
cd doomy-vision/bridge-android
LANG=C.UTF-8 LC_ALL=C.UTF-8 ./gradlew test   # ver Troubleshooting si el locale falla
```

(El wrapper de Gradle no se generó en este entorno por espacio/tiempo — usar
`gradle test` con Gradle 8.14+ instalado, o generar el wrapper con
`gradle wrapper --gradle-version 8.14.3` antes de abrir en Android Studio.)

## 3. Bridge Android — módulo `app` (app real, requiere Android Studio)

1. Abrir `doomy-vision/bridge-android/` completo en Android Studio (detectará `core` y `app`).
2. Obtener acceso al Developer Preview de Meta Wearables:
   https://developers.meta.com/wearables/ → aplicar → esperar aprobación.
3. Una vez aprobado, Meta emite un `APPLICATION_ID`. Reemplazar el placeholder en
   `app/src/main/res/values/strings.xml` (`mwdat_application_id_placeholder`) — nunca
   commitear el valor real directamente si el repo es público; usar
   `local.properties` + `buildConfigField`.
4. Generar un `GITHUB_TOKEN` con acceso de lectura a
   `maven.pkg.github.com/facebook/meta-wearables-dat-android` (requiere que tu cuenta de
   GitHub tenga acceso al repo privado de Meta — se otorga junto con la aprobación del
   Developer Preview).
5. Descomentar en `app/build.gradle.kts` las tres líneas `implementation("com.meta.wearable:...")`.
6. Descomentar/implementar las llamadas reales marcadas en
   `RealWearablesManager.kt` (cada método documenta exactamente qué llamada de MWDAT va ahí).
7. `./gradlew :app:assembleDebug`.

## 4. Bridge iOS (requiere macOS + Xcode)

1. Abrir `doomy-vision/bridge-ios/Package.swift` en Xcode, o `swift test` desde terminal
   para correr `DoomyVisionCoreTests` (espejo de los tests ya verdes en Android).
2. Mismo proceso de Developer Preview de Meta que Android (paso 2 arriba).
3. Agregar la dependencia SPM real:
   `https://github.com/facebook/meta-wearables-dat-ios` (descomentar en `Package.swift`).
4. Crear un target de app Xcode (SwiftUI) que use `DoomyVisionCore` + MWDAT +
   `AVFoundation`/`CoreBluetooth` para la implementación real de
   `WearablesManager`/`AudioRouteManager` — espejo de `app/` en Android.

## 5. Modo Mock (sin lentes, sin app móvil)

`DOOMY_VISION_MOCK_MODE=true` (default) hace que **todo el backend** funcione con
proveedores de IA simulados. Combinado con el Dev Console, se puede probar el 100% del
flujo de conversación (texto, visión, continuidad de contexto) sin hardware ni costo.

`MockWearablesManager` (Kotlin) / `MockWearablesManager` (Swift) simulan el flujo de
MockDeviceKit de Meta a nivel de lógica de negocio — no requieren el SDK real ni el
sample app oficial de Meta, aunque **sí conviene** probar también con el
`CameraAccess` sample app + MockDeviceKit oficial una vez haya acceso al Developer
Preview (sección 32 del brief original) para validar contra el comportamiento real de
Meta, no solo contra nuestra simulación.

## 6. Railway (cuando se autorice el deploy)

No se creó ningún servicio nuevo en Railway durante esta misión (regla explícita:
no crear servicios pagados automáticamente). Pasos para cuando Victor decida desplegar:

1. Crear un repositorio GitHub nuevo para `doomy-vision/` (o un subdirectorio dentro de
   `doomy-assistant` en una rama `feature/doomy-vision`, si se prefiere mantenerlo en el
   mismo repo — la carpeta ya está aislada y no interfiere).
2. En el proyecto Railway `doomy-assistant`, crear un servicio nuevo (`doomy-vision`)
   apuntando a ese repo/rama, `rootDirectory: /backend` si se deja en el monorepo.
3. Configurar las variables de `backend/.env.example` en el servicio (reusando los
   valores de `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`,
   `ELEVENLABS_VOICE_ID` ya existentes en `doomy-assistant` — no se necesitan llaves
   nuevas).
4. Generar `DOOMY_VISION_INTERNAL_KEY` y `DOOMY_VISION_JWT_SECRET` nuevos
   (`openssl rand -hex 32`), exclusivos de este servicio.
5. `DOOMY_VISION_MOCK_MODE=false`.
6. Desplegar. `GET /api/doomy-vision/v1/health` debe responder `{"status":"ok"}`.

**Nada de esto se ejecutó** en esta sesión — es la checklist lista para cuando Victor
decida avanzar (no requiere ninguna credencial que no exista ya en Railway, salvo las dos
que se generan localmente en el paso 4).
