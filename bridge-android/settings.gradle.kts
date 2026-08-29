// Solo el módulo `core` se incluye en el build raíz: es Kotlin/JVM puro
// (sin dependencia de Android SDK) y SÍ compila y corre tests en este
// entorno. `app/` es el módulo de la aplicación Android real (UI, CameraX,
// Bluetooth, Meta Wearables DAT) y requiere Android Studio + Android SDK
// para compilar — no está incluido aquí a propósito para que `./gradlew test`
// funcione sin esas herramientas. Ver docs/DOOMY_VISION_SETUP.md.
rootProject.name = "doomy-vision-bridge"
include(":core")
