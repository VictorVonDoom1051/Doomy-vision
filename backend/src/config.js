import 'dotenv/config';

function bool(v, def) {
  if (v === undefined || v === '') return def;
  return String(v).toLowerCase() === 'true' || v === '1';
}
function num(v, def) {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  port: num(process.env.PORT, 8090),
  nodeEnv: process.env.NODE_ENV || 'development',
  mockMode: bool(process.env.DOOMY_VISION_MOCK_MODE, true),

  auth: {
    internalKey: process.env.DOOMY_VISION_INTERNAL_KEY || '',
    jwtSecret: process.env.DOOMY_VISION_JWT_SECRET || '',
    accessTokenTtlMin: num(process.env.DOOMY_VISION_ACCESS_TOKEN_TTL_MIN, 60),
  },

  doomyCore: {
    url: process.env.DOOMY_CORE_URL || '',
    internalKey: process.env.DOOMY_CORE_INTERNAL_KEY || '',
  },

  providers: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    // claude-sonnet-5 es el modelo por default actual recomendado por Anthropic para
    // este tipo de uso (velocidad/inteligencia, visión + tool use) — verificado contra
    // platform.claude.com/docs en esta misión (Fase 2), reemplaza el default anterior
    // (claude-sonnet-4-5-20250929, ya superado). Configurable de todas formas.
    llmModel: process.env.DOOMY_VISION_LLM_MODEL || 'claude-sonnet-5',
    groqApiKey: process.env.GROQ_API_KEY || '',
    sttModel: process.env.DOOMY_VISION_STT_MODEL || 'whisper-large-v3-turbo',
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '',
    ttsModel: process.env.DOOMY_VISION_TTS_MODEL || 'eleven_flash_v2_5',
  },

  limits: {
    visionMaxImageMb: num(process.env.VISION_MAX_IMAGE_MB, 6),
    visionMaxLongEdgePx: num(process.env.VISION_MAX_LONG_EDGE_PX, 1280),
    visionJpegQuality: num(process.env.VISION_JPEG_QUALITY, 78),
    audioMaxSeconds: num(process.env.AUDIO_MAX_SECONDS, 30),
    audioMaxMb: num(process.env.AUDIO_MAX_MB, 10),
    requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 20000),
    sessionTtlMinutes: num(process.env.SESSION_TTL_MINUTES, 60),
    sessionLastImageTtlMinutes: num(process.env.SESSION_LAST_IMAGE_TTL_MINUTES, 15),
    rateLimitMaxPerMinute: num(process.env.RATE_LIMIT_MAX_PER_MINUTE, 60),
    // Fase 20 (Mission 002) — protección de costo explícita, antes hardcodeada.
    maxResponseTokens: num(process.env.MAX_RESPONSE_TOKENS, 1024),
    maxHistoryTurns: num(process.env.MAX_CONVERSATION_HISTORY, 12),
    // Fase 19 — límite diferenciado para /vision y /audio/* (subida directa de
    // archivos pesados), separado del límite general de /device, /session y
    // /conversation. Por defecto más estricto que el general.
    rateLimitVisionAudioMaxPerMinute: num(process.env.RATE_LIMIT_VISION_AUDIO_MAX_PER_MINUTE, 30),
  },

  // Fase 37 — CORS configurable por entorno. Vacío = comportamiento actual
  // (abierto), pensado para desarrollo/simulador interno. En producción se
  // recomienda fijar una lista explícita si algún cliente basado en
  // navegador (no el Bridge nativo, que no manda header Origin) necesita
  // llamar directo al backend.
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  flags: {
    visionEnabled: bool(process.env.VISION_ENABLED, true),
    realtimeEnabled: bool(process.env.REALTIME_ENABLED, false),
    ttsEnabled: bool(process.env.TTS_ENABLED, true),
    diagnosticsEnabled: bool(process.env.DIAGNOSTICS_ENABLED, true),
    toolCallingVisionEnabled: bool(process.env.TOOL_CALLING_VISION_ENABLED, false),
  },
};

// In mock mode we allow missing secrets (dev/test). Outside mock mode we
// fail fast and loud rather than silently running with no auth.
export function assertProductionReady() {
  const problems = [];
  if (!config.mockMode) {
    if (!config.auth.internalKey) problems.push('DOOMY_VISION_INTERNAL_KEY is not set');
    if (!config.auth.jwtSecret) problems.push('DOOMY_VISION_JWT_SECRET is not set');
    if (!config.providers.anthropicApiKey) problems.push('ANTHROPIC_API_KEY is not set');
  }
  // Fase 20 — NODE_ENV=production con MOCK_MODE=true a la vez casi siempre es
  // un error de configuración (quedaría "en producción" respondiendo con
  // datos simulados de IA sin que nadie lo note). Se bloquea el arranque por
  // defecto; ALLOW_MOCK_IN_PRODUCTION=true es un escape hatch explícito y
  // documentado para el caso raro de querer un ambiente de staging con
  // NODE_ENV=production a propósito.
  if (config.nodeEnv === 'production' && config.mockMode && process.env.ALLOW_MOCK_IN_PRODUCTION !== 'true') {
    problems.push(
      'NODE_ENV=production con DOOMY_VISION_MOCK_MODE=true al mismo tiempo — esto casi ' +
        'siempre es un error (producción respondiendo con datos simulados). Si es intencional ' +
        '(p. ej. un staging con NODE_ENV=production), fija ALLOW_MOCK_IN_PRODUCTION=true explícitamente.'
    );
  }
  return problems;
}
