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
app.listen(config.port, () => {
  logger.info({ port: config.port, mockMode: config.mockMode }, 'doomy_vision_backend_started');
  // eslint-disable-next-line no-console
  console.log(`Doomy Vision backend escuchando en :${config.port} (mock_mode=${config.mockMode})`);
});
