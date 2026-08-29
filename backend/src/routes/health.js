import { Router } from 'express';
import { config, assertProductionReady } from './../config.js';

export const healthRouter = Router();

/**
 * Fase 15/16 (Mission 002) — liveness vs readiness separados, antes
 * `/health` hacía las dos cosas a la vez sin distinción.
 *
 * - Liveness (`/health/live`): "¿el proceso sigue vivo?" — nunca revisa
 *   dependencias externas, nunca puede reportar `false` solo porque un
 *   proveedor de IA esté caído (eso mataría el proceso en un orquestador
 *   que reinicia contenedores por liveness-fail, empeorando un incidente
 *   de proveedor externo en vez de ayudarlo).
 * - Readiness (`/health/ready`): "¿puede este proceso atender tráfico
 *   correctamente ahora mismo?" — sí revisa configuración: en producción,
 *   los mismos checks que `assertProductionReady()` corre al arrancar
 *   (si por lo que sea faltara config crítica después de arrancar, o el
 *   proceso está en un estado MOCK_MODE+production inconsistente).
 *
 * `/health` (sin sufijo) se conserva por compatibilidad hacia atrás con
 * Mission 001 — sigue siendo el equivalente a liveness.
 */
function livenessBody() {
  return {
    status: 'ok',
    service: 'doomy-vision-backend',
    version: process.env.npm_package_version || '0.1.0',
    mock_mode: config.mockMode,
    timestamp: new Date().toISOString(),
  };
}

healthRouter.get('/health', (_req, res) => {
  res.json(livenessBody());
});

healthRouter.get('/health/live', (_req, res) => {
  res.json(livenessBody());
});

healthRouter.get('/health/ready', (_req, res) => {
  const problems = assertProductionReady();
  const ready = problems.length === 0;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    problems, // nunca incluye valores de secretos, solo qué falta
    mock_mode: config.mockMode,
    node_env: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});
