import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { config } from './config.js';
import { logger } from './logger.js';
import { toHttpResponse, TimeoutError } from './errors.js';

import { healthRouter } from './routes/health.js';
import { deviceRouter } from './routes/device.js';
import { sessionRouter } from './routes/session.js';
import { conversationRouter } from './routes/conversation.js';
import { askRouter } from './routes/ask.js';
import { visionRouter } from './routes/vision.js';
import { audioRouter } from './routes/audio.js';
import { diagnosticsRouter } from './routes/diagnostics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * CORS por entorno (Fase 37). El Bridge nativo (Android/iOS) no manda
 * header `Origin`, así que esta política nunca lo afecta. Solo importa para
 * clientes basados en navegador (el Dev Console, o un futuro cliente web).
 * - `CORS_ALLOWED_ORIGINS` vacío (default): abierto — es el comportamiento
 *   original de Mission 001, correcto para desarrollo/simulador interno.
 * - `CORS_ALLOWED_ORIGINS` con valores: solo esos orígenes exactos pueden
 *   hacer requests cross-origin; cualquier otro se rechaza (sin excepción
 *   por NODE_ENV — si se configuró una lista, se respeta siempre).
 */
function corsOptions() {
  const allowed = config.cors.allowedOrigins;
  if (allowed.length === 0) return {}; // cors() default = abierto
  return {
    origin(origin, callback) {
      // Sin header Origin (apps nativas, curl, server-to-server) -> permitir.
      if (!origin || allowed.includes(origin)) return callback(null, true);
      callback(new Error('Origen no permitido por CORS'));
    },
  };
}

/**
 * Timeout de request (Fase 21) a nivel de servidor — protege contra un
 * cliente lento o una conexión colgada que nunca llega a completar el
 * request. Los proveedores externos (Anthropic/Groq/ElevenLabs) ya tienen
 * su propio timeout más corto (`config.limits.requestTimeoutMs` via
 * `AbortSignal.timeout` / opción `timeout` del SDK); este es el límite
 * exterior, con margen, para todo el ciclo de vida del request HTTP.
 */
function requestTimeoutMiddleware(req, res, next) {
  // Margen configurable (default 5s) sobre el timeout de proveedor —
  // separado para poder probar el middleware con un timeout total corto
  // sin tener que esperar 5s+ reales en cada corrida de tests.
  const margin = Number(process.env.REQUEST_TIMEOUT_MARGIN_MS) || 5000;
  const ms = config.limits.requestTimeoutMs + margin;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      const { status, body } = toHttpResponse(new TimeoutError(), { nodeEnv: config.nodeEnv });
      res.status(status).json(body);
    }
  }, ms);
  timer.unref?.();
  res.once('finish', () => clearTimeout(timer));
  res.once('close', () => clearTimeout(timer));
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Fase 17 — cabeceras de seguridad estándar. `contentSecurityPolicy`
  // desactivado a nivel global porque el Dev Console es una página propia
  // servida como estático con su <script> inline — CSP por defecto de
  // helmet la rompería; no aplica a las rutas de API (que son JSON puro).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));
  // Mission 004: los Atajos de iOS mandan un body "Form" como
  // `application/x-www-form-urlencoded` cuando no lleva archivo adjunto
  // (solo cambian a multipart si hay imagen). Sin este parser, `req.body`
  // llegaba vacío y una pregunta de solo texto desde el Atajo fallaba con
  // "No se recibió texto ni audio transcribible". Encontrado probando
  // `/ask` real contra producción, no en teoría.
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: config.nodeEnv !== 'test',
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    })
  );
  app.use(requestTimeoutMiddleware);

  // Fase 19 — límites de rate limit diferenciados por costo/tipo de
  // request, en vez de un único límite global compartido por todo.
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.limits.rateLimitMaxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
  });
  // /vision y /audio/* son subidas directas de archivos pesados (imagen u
  // audio) fuera del orquestador principal — límite más estricto por
  // defecto que texto/orquestación general.
  const visionAudioLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.limits.rateLimitVisionAudioMaxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const V1 = '/api/doomy-vision/v1';
  app.use(V1, healthRouter);
  app.use(V1, diagnosticsRouter);
  app.use(V1, generalLimiter, deviceRouter);
  app.use(V1, generalLimiter, sessionRouter);
  app.use(V1, generalLimiter, conversationRouter);
  app.use(V1, visionAudioLimiter, visionRouter);
  app.use(V1, visionAudioLimiter, audioRouter);
  // `/ask` acepta imagen adjunta como `/vision`, así que comparte el límite
  // más estricto en vez del general de texto.
  app.use(V1, visionAudioLimiter, askRouter);

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
    // Si el middleware de timeout ya respondió (Fase 21), no se puede
    // volver a escribir la respuesta — evita el ERR_HTTP_HEADERS_SENT que
    // se produciría si el handler original termina tarde después de todo.
    if (res.headersSent) {
      logger.warn({ requestId: req.id, code: err?.code }, 'error_after_headers_sent_ignored');
      return;
    }
    // Errores de Multer (multipart malformado, archivo excede el límite del
    // propio multer antes de llegar a validate.js, campo inesperado, etc.)
    // no son DoomyVisionError — sin este mapeo caían al branch 500 genérico
    // con status incorrecto para lo que es, en realidad, un error del
    // cliente. Nunca se reenvía `err.message` crudo de Multer tal cual
    // (puede incluir nombres de campo internos); se normaliza el mensaje.
    if (err?.name === 'MulterError') {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      logger.warn({ multerCode: err.code, requestId: req.id }, 'multer_error');
      return res.status(status).json({
        error: { code: 'ValidationError', dv_code: 'DV_VALIDATION_001', message: 'Archivo inválido o demasiado grande', details: { multer_code: err.code } },
      });
    }
    const { status, body } = toHttpResponse(err, { nodeEnv: config.nodeEnv });
    if (status >= 500) {
      logger.error({ err, requestId: req.id }, 'unhandled_error');
    } else {
      logger.warn({ code: err.code, message: err.message }, 'handled_error');
    }
    res.status(status).json(body);
  });

  return app;
}
