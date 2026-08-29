import { config } from './../config.js';
import { PlaybackError } from './../errors.js';
import { logger } from './../logger.js';

/**
 * TextToSpeechProvider — interfaz desacoplada (sección 20).
 * Adapter real usa ElevenLabs, ya presente en doomy-assistant
 * (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID / voz "VVD").
 *
 * speak(text) -> { audioBuffer, mime }
 */
export class ElevenLabsTTSProvider {
  constructor({
    apiKey = config.providers.elevenlabsApiKey,
    voiceId = config.providers.elevenlabsVoiceId,
    modelId = config.providers.ttsModel,
  } = {}) {
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurada');
    if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID no configurada');
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.modelId = modelId;
  }

  async speak(text) {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: this.modelId }),
      signal: AbortSignal.timeout(config.limits.requestTimeoutMs),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new PlaybackError('TTS (ElevenLabs) falló', { details: { status: resp.status, detail: detail.slice(0, 300) } });
    }
    const arrayBuffer = await resp.arrayBuffer();
    return { audioBuffer: Buffer.from(arrayBuffer), mime: 'audio/mpeg' };
  }
}

// WAV de silencio de ~0.3s válido, para que el Bridge/simulador pueda
// reproducir algo real en MOCK_MODE sin depender de ElevenLabs.
const SILENT_WAV_BASE64 =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export class MockTTSProvider {
  async speak(text) {
    logger.debug({ chars: text?.length }, 'MockTTSProvider.speak');
    return { audioBuffer: Buffer.from(SILENT_WAV_BASE64, 'base64'), mime: 'audio/wav' };
  }
}

export function createTTSProvider() {
  if (!config.mockMode && config.providers.elevenlabsApiKey && config.providers.elevenlabsVoiceId) {
    return new ElevenLabsTTSProvider();
  }
  return new MockTTSProvider();
}
