# Doomy Vision

Interfaz que conecta Ray-Ban Meta con Doomy (asistente de IA de Victor / ACS Technology)
como ojos, micrófono y salida de audio. Proyecto aislado — no modifica ningún otro
servicio de Doomy.

Empieza aquí:
- `DOOMY_VISION_FINAL_REPORT.md` — qué se logró en la última sesión de trabajo.
- `DOOMY_VISION_PROGRESS.md` — estado detallado, actualizado durante el trabajo.
- `DOOMY_VISION_BLOCKERS.md` — qué necesita intervención humana y por qué.
- `docs/DOOMY_VISION_ARCHITECTURE.md` — cómo funciona todo.
- `docs/DOOMY_VISION_SETUP.md` — cómo correrlo / compilarlo.
- `docs/DOOMY_VISION_TEST_PLAN.md` — qué se probó y cómo.

```
backend/          API Doomy Vision (Node/Express) — /api/doomy-vision/v1
simulator/         Dev Console web — probar sin lentes ni app móvil
bridge-android/    App puente Android (core probado; app real requiere Android Studio)
bridge-ios/        App puente iOS (espejo de core; requiere Xcode)
docs/              Documentación
```
