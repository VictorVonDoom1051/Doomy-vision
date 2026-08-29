# Doomy Vision — Mission 002 Baseline

_Registrado al inicio de la Mission 002, re-ejecutando todo desde cero (no se asumieron
resultados de la sesión anterior)._

## Test results (fresh run, `node_modules` reinstalado desde cero)

| Suite | Comando | Resultado |
|---|---|---|
| Backend | `rm -rf node_modules && npm install && npm test` | **30/30 PASS** |
| Bridge `:core` | `rm -rf core/build .gradle && gradle test` | **26/26 PASS** |
| Playwright (Dev Console E2E) | `node tests/manual_e2e_simulator.mjs` | No re-ejecutado todavía en este punto — se re-corre en Fase 32 tras las mejoras del simulador |

Total heredado: **56/56 PASS**, confirmado real (no asumido).

## Git status

- Rama: `feature/doomy-vision`, 1 commit (`53bf340`), working tree limpio.
- `backend/.env` no existe en disco (correcto — está en `.gitignore`, nunca se commiteó).
- Ningún archivo fuera de `doomy-vision/` fue tocado (verificado: el commit inicial solo
  contiene rutas bajo `doomy-vision/`).

## Dependency status (backend)

`npm audit --omit=dev` → **0 vulnerabilidades** (producción limpia, heredado de la
sesión anterior).

`npm audit` (incluyendo dev) → 5 vulnerabilidades (3 moderate, 1 high, 1 critical), todas
en la cadena `vitest → vite → esbuild` (herramienta de testing, no se despliega a
producción). Corregirlas requiere saltar a `vitest@4.x` (breaking change de la API de
config) — evaluado en Fase 51, no se hizo un salto ciego.

`npm outdated` — paquetes con versión mayor disponible:

| Paquete | Actual | Última | Prioridad de actualizar |
|---|---|---|---|
| `@anthropic-ai/sdk` | 0.32.1 | 0.122.0 | **Alta** — es el proveedor de IA principal, se audita y actualiza en Fase 2 |
| `express` | 4.22.2 | 5.2.1 | Baja — Express 5 tiene breaking changes (manejo de errores async, sintaxis de rutas); no vale el riesgo sin necesidad funcional |
| `dotenv`, `pino`, `pino-http`, `uuid`, `express-rate-limit` | — | — | Baja — sin vulnerabilidades, saltos menores no urgentes |

## `.env.example` — revisión

Completo y coherente con `src/config.js` (revisado línea por línea). Ningún valor real
presente (confirmado). Un hallazgo: falta documentar los nuevos flags que se agregan en
esta misión (`RUN_REAL_PROVIDER_TESTS`, límites de costo adicionales) — se actualiza al
final de la Fase 20.

## Estructura actual

Sin cambios respecto al reporte de la misión anterior — ver
`docs/DOOMY_VISION_ARCHITECTURE.md §4` para el árbol completo. Nada duplicado, nada
reiniciado.

## Deuda técnica real identificada (para atacar esta misión)

1. `@anthropic-ai/sdk` desactualizado — riesgo de que el shape de `messages.create()` o
   nombres de modelo hayan cambiado desde 0.32.1. **Se aborda en Fase 2/3.**
2. No hay separación liveness/readiness (`/health` hace ambas cosas). **Fase 15/16.**
3. Rate limiting es un único límite global; la misión pide límites diferenciados por tipo
   de request. **Fase 19.**
4. No hay límites de costo explícitos más allá de tamaño de imagen/audio (p. ej.
   `MAX_RESPONSE_TOKENS`, `MAX_CONVERSATION_HISTORY` no está expuesto como env
   configurable aunque `MAX_HISTORY_TURNS` existe hardcodeado en `state.js`). **Fase 20.**
5. No hay CORS configurado por entorno (`cors()` sin opciones = todo permitido). Correcto
   para desarrollo/simulador interno, pero la misión pide revisarlo explícitamente para
   producción. **Fase 37.**
6. No hay `helmet`. **Fase 17.**
7. El simulador no tiene push-to-talk real con protección de gestos/cancelación, ni es
   responsive para móvil todavía (fue construido y probado en desktop headless). **Fases
   7-10.**
8. No existe endpoint de servicio para credenciales reales — todo el testing de
   proveedores reales ha sido 100% mock hasta ahora. **Ver limitación de credenciales
   abajo.**
9. `RememberedVisionStore` sigue siendo no-op — sin cambios, correcto por diseño (fuera
   de alcance sin autorización).
10. No hay `OpenAPI` spec todavía. **Fase 46.**

## Limitación de credenciales reales (nueva, relevante para Fase 2-5)

Se intentó leer los valores reales de `ANTHROPIC_API_KEY`, `GROQ_API_KEY`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` del servicio `doomy-assistant` en Railway vía
el MCP de Railway conectado a esta sesión (`list-variables`). La respuesta confirma que
las 51 variables existen (incluida `ANTHROPIC_API_KEY`, `GROQ_API_KEY`,
`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`), pero **`valuesRedacted: true`** — esta
conexión de Railway (OAuth app, no API token de sesión completa) solo expone nombres de
variable, nunca valores en texto plano. Esto es, de hecho, el comportamiento de seguridad
correcto de Railway para conexiones OAuth — no es un bug ni un permiso a solicitar
cambiar.

**Consecuencia**: no hay forma de obtener credenciales reales de proveedor en este
entorno sin que el usuario las provea explícitamente. Siguiendo la instrucción de la
misión ("si no existen credenciales, no pedirlas inmediatamente, continuar y documentar
qué falta"), esta sesión continúa con **verificación 100% mock/documental** de los tres
proveedores (código auditado contra la documentación oficial vigente, pero sin llamadas
reales) y deja la puerta abierta, documentada en `DOOMY_VISION_MISSION_002_REPORT.md`,
para que Victor decida si quiere proveer credenciales de prueba en una sesión futura.
