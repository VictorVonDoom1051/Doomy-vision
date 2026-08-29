import { Router } from 'express';
import { config } from './../config.js';
import { metrics } from './../metrics.js';
import { sessionStore } from './../state.js';

export const diagnosticsRouter = Router();

/**
 * GET /diagnostics — sección 23.
 * Refleja el estado que la UI de Bridge (panel diagnóstico) también
 * muestra localmente para su propio hardware; este endpoint reporta el
 * estado del lado de Doomy Core / Vision backend.
 */
diagnosticsRouter.get('/diagnostics', (_req, res) => {
  if (!config.flags.diagnosticsEnabled) {
    return res.status(404).json({ error: { code: 'NotFoundError', message: 'Diagnostics deshabilitado' } });
  }
  res.json({
    doomy_core: 'ONLINE',
    mock_mode: config.mockMode,
    providers: {
      llm: config.mockMode || !config.providers.anthropicApiKey ? 'MOCK' : 'ANTHROPIC',
      stt: config.mockMode || !config.providers.groqApiKey ? 'MOCK' : 'GROQ',
      tts: config.mockMode || !config.providers.elevenlabsApiKey ? 'MOCK' : 'ELEVENLABS',
    },
    flags: config.flags,
    active_sessions: sessionStore.count(),
    metrics: metrics.snapshot(),
    timestamp: new Date().toISOString(),
  });
});
