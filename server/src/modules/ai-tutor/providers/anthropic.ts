/**
 * Anthropic adapter (official @anthropic-ai/sdk). Streams text deltas into the existing AIT-08 SSE path and
 * reports real token usage for the allowance / cost accounting.
 *
 * - Default model: ANTHROPIC_MODEL (claude-sonnet-5-5) when the admin-selected model is not a Claude model.
 * - Thinking is left at the model default (adaptive on current models); only text deltas reach the student.
 * - Server-side refusal fallback (`fallbacks: "default"`, beta server-side-fallback-2026-07-01) is on by
 *   default (ANTHROPIC_SERVER_FALLBACK=false turns it off, e.g. behind a proxy that strips betas).
 * - `temperature` is only sent to legacy models: current Claude models reject non-default sampling values.
 */
import Anthropic from '@anthropic-ai/sdk';
import { estimateTokens } from '../allowance.js';
import { contextBlock } from './http.js';
import { AiProviderError, type AiGenerateRequest, type AiGenerateResult, type AiProvider } from './types.js';

export interface AnthropicAdapterOptions {
  apiKey: string;
  baseURL?: string;
  serverFallback?: boolean;
  /** Test hook: custom fetch (mocked HTTP). */
  fetch?: typeof fetch;
  maxRetries?: number;
}

/** Legacy models that still accept a custom temperature (Claude 3.x and 4.0–4.6); current models reject it. */
export function acceptsTemperature(model: string): boolean {
  if (/^claude-3/.test(model)) return true;
  const m = /^claude-(?:opus|sonnet|haiku)-(\d+)(?:-(\d)(?!\d))?/.exec(model);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2] ?? 0);
  return major < 4 || (major === 4 && minor <= 6);
}

const REFUSAL_TEXT = {
  en: "Sorry, I can't help with that request. Try asking about your lessons or a practice question.",
  ar: 'عذراً، لا يمكنني المساعدة في هذا الطلب. جرّب السؤال عن دروسك أو عن سؤال تدريبي.',
};

export class AnthropicSdkProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly serverFallback: boolean;

  constructor(opts: AnthropicAdapterOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: opts.maxRetries ?? 2, timeout: 120_000, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
    this.serverFallback = opts.serverFallback ?? true;
  }

  private messages(req: AiGenerateRequest): Anthropic.Beta.BetaMessageParam[] {
    return req.messages.map((m) =>
      m.imageUrl
        ? { role: m.role, content: [{ type: 'image', source: { type: 'url', url: m.imageUrl } }, { type: 'text', text: m.content || ' ' }] }
        : { role: m.role, content: m.content },
    );
  }

  async stream(req: AiGenerateRequest, onDelta: (text: string) => void): Promise<AiGenerateResult> {
    const ctx = contextBlock(req.context, req.lang);
    let text = '';
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: ctx ? `${req.system}\n\n${ctx}` : req.system,
          messages: this.messages(req),
          ...(acceptsTemperature(req.model) ? { temperature: req.temperature } : {}),
          ...(this.serverFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal: req.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
          text += event.delta.text;
          onDelta(event.delta.text);
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal' && !text.trim()) {
        text = REFUSAL_TEXT[req.lang];
        onDelta(text);
      }
      return {
        text,
        tokensIn: final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0),
        tokensOut: final.usage.output_tokens || estimateTokens(text),
        model: final.model ?? req.model,
        provider: this.name,
      };
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      if (err instanceof Anthropic.APIError) throw new AiProviderError(`AI provider request failed: ${err.message}`, err.status);
      throw new AiProviderError(`AI provider request failed: ${(err as Error).message}`);
    }
  }
}
