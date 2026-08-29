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
    llmModel: process.env.DOOMY_VISION_LLM_MODEL || 'claude-sonnet-4-5-20250929',
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
  return problems;
}
