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
    // Límites operativos NO secretos — el Bridge/simulador los usa para
    // auto-ajustar su comportamiento (p. ej. cortar la grabación de PTT
    // antes de que el backend la rechace) sin tener que duplicar los
    // valores por env var en el cliente. Nunca incluye secretos/keys.
    limits: {
      audio_max_seconds: config.limits.audioMaxSeconds,
      audio_max_mb: config.limits.audioMaxMb,
      vision_max_image_mb: config.limits.visionMaxImageMb,
      rate_limit_max_per_minute: config.limits.rateLimitMaxPerMinute,
    },
    active_sessions: sessionStore.count(),
    metrics: metrics.snapshot(),
    timestamp: new Date().toISOString(),
  });
});
