import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { config } from './config.js';
import { logger } from './logger.js';
import { toHttpResponse } from './errors.js';

import { healthRouter } from './routes/health.js';
import { deviceRouter } from './routes/device.js';
import { sessionRouter } from './routes/session.js';
import { conversationRouter } from './routes/conversation.js';
import { visionRouter } from './routes/vision.js';
import { audioRouter } from './routes/audio.js';
import { diagnosticsRouter } from './routes/diagnostics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(cors()); // Bridge llama desde app móvil nativa; el simulador web es interno.
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: config.nodeEnv !== 'test',
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    })
  );

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.limits.rateLimitMaxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const V1 = '/api/doomy-vision/v1';
  app.use(V1, healthRouter);
  app.use(V1, diagnosticsRouter);
  app.use(V1, limiter, deviceRouter);
  app.use(V1, limiter, sessionRouter);
  app.use(V1, limiter, conversationRouter);
  app.use(V1, limiter, visionRouter);
  app.use(V1, limiter, audioRouter);

  // Web Simulator / Developer Console (sección 22) — herramienta interna.
  app.use('/doomy-vision/dev', express.static(path.join(__dirname, '..', '..', 'simulator')));

  app.get('/', (_req, res) => {
    res.json({ service: 'doomy-vision-backend', docs: `${V1}/health`, dev_console: '/doomy-vision/dev' });
  });

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NotFoundError', message: `Ruta no encontrada: ${req.method} ${req.path}` } });
  });

  // Manejador de errores central — nunca expone stack traces al cliente.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const { status, body } = toHttpResponse(err);
    if (status >= 500) {
      logger.error({ err, requestId: req.id }, 'unhandled_error');
    } else {
      logger.warn({ code: err.code, message: err.message }, 'handled_error');
    }
    res.status(status).json(body);
  });

  return app;
}
