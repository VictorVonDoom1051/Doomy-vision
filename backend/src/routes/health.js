import { Router } from 'express';
import { config } from './../config.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'doomy-vision-backend',
    version: process.env.npm_package_version || '0.1.0',
    mock_mode: config.mockMode,
    timestamp: new Date().toISOString(),
  });
});
