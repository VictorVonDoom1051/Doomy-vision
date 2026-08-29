import Anthropic from '@anthropic-ai/sdk';
import { config } from './../config.js';
import { logger } from './../logger.js';

/**
 * LLMProvider — interfaz desacoplada (sección 12/19/20 style, aplicada a
 * IA multimodal). Doomy Vision NO implementa un segundo "sistema de IA":
 * reutiliza el mismo proveedor (Anthropic) que ya usa doomy-assistant
 * (ANTHROPIC_API_KEY ya existe en Railway). Este adapter es intercambiable.
 *
 * chat({ systemPrompt, history, userText, imageBase64, tools }) ->
 *   { text, toolCalls: [{name, input}], usage }
 */
export class AnthropicLLMProvider {
  constructor({ apiKey = config.providers.anthropicApiKey, model = config.providers.llmModel } = {}) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat({ systemPrompt, history = [], userText, imageBase64, imageMime = 'image/jpeg', tools = [] }) {
    const content = [];
    if (imageBase64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMime, data: imageBase64 },
      });
    }
    content.push({ type: 'text', text: userText });

    const messages = [
      ...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text })),
      { role: 'user', content },
    ];

    // max_tokens configurable (Fase 20, protección de costo) y timeout
    // explícito por request (Fase 21) — este era el único proveedor sin
    // timeout propio; stt.js/tts.js ya usan AbortSignal.timeout() en su
    // fetch crudo. El SDK de Anthropic acepta un timeout por-request (ms)
    // como segundo argumento de options, sin afectar el body enviado.
    const resp = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: config.limits.maxResponseTokens,
        system: systemPrompt,
        messages,
        ...(tools.length ? { tools } : {}),
      },
      { timeout: config.limits.requestTimeoutMs }
    );

    const textBlocks = resp.content.filter((b) => b.type === 'text').map((b) => b.text);
    const toolCalls = resp.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ name: b.name, input: b.input, id: b.id }));

    return {
      text: textBlocks.join('\n').trim(),
      toolCalls,
      usage: resp.usage,
      stopReason: resp.stop_reason,
    };
  }
}

/**
 * Mock determinista — usado cuando DOOMY_VISION_MOCK_MODE=true o cuando
 * no hay ANTHROPIC_API_KEY. Nunca hace llamadas pagadas.
 */
export class MockLLMProvider {
  async chat({ userText, imageBase64 }) {
    logger.debug({ hasImage: !!imageBase64 }, 'MockLLMProvider.chat');
    const lower = (userText || '').toLowerCase();
    let text;
    if (imageBase64) {
      text = 'Parece un NVR Hikvision de ocho canales. (respuesta simulada — MOCK_MODE activo)';
    } else if (lower.includes('poe')) {
      text = 'Sí, la mayoría de los modelos de ocho canales de esa gama soportan PoE. (respuesta simulada)';
    } else if (lower.includes('hora')) {
      text = `Son las ${new Date().toLocaleTimeString('es-MX')}. (respuesta simulada)`;
    } else {
      text = `Doomy Vision está conectado correctamente. Recibí: "${userText}". (respuesta simulada — MOCK_MODE activo)`;
    }
    return { text, toolCalls: [], usage: { input_tokens: 0, output_tokens: 0 }, stopReason: 'end_turn' };
  }
}

export function createLLMProvider() {
  if (!config.mockMode && config.providers.anthropicApiKey) {
    return new AnthropicLLMProvider();
  }
  return new MockLLMProvider();
}

/**
 * Definición de la herramienta `request_current_view` (sección 18).
 * Cuando TOOL_CALLING_VISION_ENABLED=true y el proveedor real soporta tool
 * calling, el modelo puede solicitar una imagen fresca en vez de que el
 * Bridge siempre la adjunte de antemano. El flujo de dos fases
 * (tool_use -> Bridge captura -> se reenvía) se documenta en
 * docs/DOOMY_VISION_ARCHITECTURE.md#request_current_view.
 */
export const REQUEST_CURRENT_VIEW_TOOL = {
  name: 'request_current_view',
  description:
    'Solicita una imagen fresca de lo que el usuario está viendo ahora mismo a través de sus Ray-Ban Meta. ' +
    'Úsala cuando la pregunta del usuario requiera ver algo y no tengas ya una imagen reciente y relevante en el contexto.',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Por qué se necesita ver (breve, para diagnóstico).' },
    },
    required: [],
  },
};
