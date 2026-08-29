import { config } from './../config.js';
import { AudioError } from './../errors.js';
import { logger } from './../logger.js';

/**
 * SpeechToTextProvider — interfaz desacoplada (sección 19).
 * Adapter real usa Groq (Whisper), que ya está presente como
 * GROQ_API_KEY en las variables de doomy-assistant — mismo proveedor,
 * sin amarrar todo el sistema a él.
 *
 * transcribe(audioBuffer, { mime, filename }) -> { text, durationMs }
 */
export class GroqSTTProvider {
  constructor({ apiKey = config.providers.groqApiKey, model = config.providers.sttModel } = {}) {
    if (!apiKey) throw new Error('GROQ_API_KEY no configurada');
    this.apiKey = apiKey;
    this.model = model;
  }

  async transcribe(audioBuffer, { mime = 'audio/wav', filename = 'audio.wav' } = {}) {
    const t0 = Date.now();
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mime }), filename);
    form.append('model', this.model);
    form.append('response_format', 'json');

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(config.limits.requestTimeoutMs),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new AudioError('STT (Groq) falló', { details: { status: resp.status, detail: detail.slice(0, 300) } });
    }
    const data = await resp.json();
    return { text: (data.text || '').trim(), durationMs: Date.now() - t0 };
  }
}

export class MockSTTProvider {
  async transcribe(audioBuffer) {
    logger.debug({ bytes: audioBuffer?.length }, 'MockSTTProvider.transcribe');
    return { text: '¿Qué estoy viendo?', durationMs: 5 };
  }
}

export function createSTTProvider() {
  if (!config.mockMode && config.providers.groqApiKey) {
    return new GroqSTTProvider();
  }
  return new MockSTTProvider();
}
