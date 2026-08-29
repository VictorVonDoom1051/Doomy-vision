import { createApp } from './app.js';
import { config, assertProductionReady } from './config.js';
import { logger } from './logger.js';

const problems = assertProductionReady();
if (problems.length) {
  logger.error({ problems }, 'refusing_to_start_outside_mock_mode_without_config');
  console.error('Doomy Vision no puede arrancar fuera de MOCK_MODE sin esta configuración:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, mockMode: config.mockMode }, 'doomy_vision_backend_started');
  // eslint-disable-next-line no-console
  console.log(`Doomy Vision backend escuchando en :${config.port} (mock_mode=${config.mockMode})`);
});

/**
 * Apagado ordenado (Fase 25-30/56-59, Mission 002): Railway manda SIGTERM
 * para detener un deploy viejo durante un rollout, y espera que el proceso
 * cierre limpio en vez de matarlo a la fuerza. Sin esto, un SIGTERM corta
 * conexiones en curso a medio request (un usuario pierde su respuesta) y
 * puede dejar el puerto en un estado raro para el siguiente contenedor.
 *
 * Orden: dejar de aceptar conexiones nuevas -> esperar a que las conexiones
 * en curso terminen solas (server.close callback) -> salir. Si algo se
 * cuelga, un timeout de seguridad fuerza la salida en vez de dejar el
 * proceso colgado para siempre (Railway también tiene su propio timeout,
 * pero no depender de eso).
 */
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return; // segundo SIGTERM mientras ya se está cerrando: ignorar, no reintentar
  shuttingDown = true;
  logger.info({ signal }, 'doomy_vision_backend_shutting_down');
  // eslint-disable-next-line no-console
  console.log(`Doomy Vision backend recibió ${signal} — cerrando conexiones en curso...`);

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'doomy_vision_backend_shutdown_error');
      process.exit(1);
    }
    logger.info('doomy_vision_backend_shutdown_clean');
    // eslint-disable-next-line no-console
    console.log('Doomy Vision backend cerrado limpiamente.');
    process.exit(0);
  });

  // Salvavidas: si algún socket keep-alive nunca cierra solo, no dejar el
  // proceso colgado indefinidamente. Con margen sobre REQUEST_TIMEOUT_MS
  // para dar tiempo a que los requests en curso terminen normalmente.
  const forceExitMs = config.limits.requestTimeoutMs + 10000;
  setTimeout(() => {
    logger.warn({ forceExitMs }, 'doomy_vision_backend_shutdown_forced');
    process.exit(1);
  }, forceExitMs).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
