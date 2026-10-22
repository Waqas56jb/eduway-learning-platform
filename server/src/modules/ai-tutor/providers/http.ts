/**
 * OpenAI-compatible provider over HTTP (streaming): OpenAI `/chat/completions` (also Azure OpenAI deployments /
 * any compatible gateway). Parses the upstream SSE stream and forwards text deltas; usage comes from the final
 * `stream_options.include_usage` chunk. (Anthropic uses the official SDK — see anthropic.ts.)
 */
import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { Readable } from 'node:stream';
import { estimateTokens } from '../allowance.js';
import { parseSse } from '../sse.js';
import { AiProviderError, type AiChatMessage, type AiGenerateRequest, type AiGenerateResult, type AiProvider, type RetrievedChunk } from './types.js';

const TIMEOUT_MS = 120_000;

export function contextBlock(context: RetrievedChunk[], lang: 'en' | 'ar'): string {
  if (!context.length) return '';
  const head = lang === 'ar' ? 'مقتطفات من مواد EDUWAY (استخدمها عند الحاجة):' : 'Excerpts from EDUWAY course material (use when relevant):';
  return `${head}\n${context.map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`).join('\n\n')}`;
}

/** Read an upstream SSE body, invoking `onEvent` for each complete event. */
async function consumeSse(stream: Readable, onEvent: (event: string, data: string) => void): Promise<void> {
  let buf = '';
  for await (const chunk of stream) {
    buf += typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      for (const e of parseSse(`${block}\n\n`)) onEvent(e.event, e.data);
    }
  }
  if (buf.trim()) for (const e of parseSse(`${buf}\n\n`)) onEvent(e.event, e.data);
}

async function upstreamError(err: unknown): Promise<AiProviderError> {
  const ax = err as AxiosError<Readable>;
  let detail = ax.message;
  if (ax.response?.data && typeof (ax.response.data as Readable).on === 'function') {
    let body = '';
    try {
      for await (const c of ax.response.data) body += (c as Buffer).toString('utf8');
    } catch {
      /* ignore */
    }
    detail = body.slice(0, 300) || detail;
  }
  return new AiProviderError(`AI provider request failed: ${detail}`, ax.response?.status);
}

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly azure = false,
    private readonly http: AxiosInstance = axios,
  ) {}

  private headers(): Record<string, string> {
    return this.azure ? { 'api-key': this.apiKey } : { Authorization: `Bearer ${this.apiKey}` };
  }

  private url(path: string): string {
    return this.azure ? `${this.baseUrl}${path}?api-version=2024-10-21` : `${this.baseUrl}${path}`;
  }

  private toMessages(req: AiGenerateRequest) {
    const ctx = contextBlock(req.context, req.lang);
    const system = ctx ? `${req.system}\n\n${ctx}` : req.system;
    return [
      { role: 'system', content: system },
      ...req.messages.map((m: AiChatMessage) =>
        m.imageUrl
          ? { role: m.role, content: [{ type: 'text', text: m.content || ' ' }, { type: 'image_url', image_url: { url: m.imageUrl } }] }
          : { role: m.role, content: m.content },
      ),
    ];
  }

  async stream(req: AiGenerateRequest, onDelta: (text: string) => void): Promise<AiGenerateResult> {
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let model = req.model;
    try {
      const res = await this.http.post<Readable>(
        this.url('/chat/completions'),
        { model: req.model, messages: this.toMessages(req), temperature: req.temperature, max_tokens: req.maxTokens, stream: true, stream_options: { include_usage: true } },
        { headers: { ...this.headers(), 'Content-Type': 'application/json' }, responseType: 'stream', timeout: TIMEOUT_MS, signal: req.signal },
      );
      await consumeSse(res.data, (_event, data) => {
        if (data === '[DONE]') return;
        const json = JSON.parse(data) as { model?: string; choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        if (json.model) model = json.model;
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        if (json.usage) {
          tokensIn = json.usage.prompt_tokens ?? tokensIn;
          tokensOut = json.usage.completion_tokens ?? tokensOut;
        }
      });
    } catch (err) {
      if (err instanceof SyntaxError) throw new AiProviderError('AI provider returned malformed stream');
      throw await upstreamError(err);
    }
    return { text, tokensIn: tokensIn || estimateTokens(req.messages.map((m) => m.content).join('\n')), tokensOut: tokensOut || estimateTokens(text), model, provider: this.name };
  }

  async embed(texts: string[], model: string): Promise<number[][]> {
    const res = await this.http.post<{ data: { embedding: number[]; index: number }[] }>(
      this.url('/embeddings'),
      { model, input: texts },
      { headers: { ...this.headers(), 'Content-Type': 'application/json' }, timeout: 60_000 },
    );
    return [...res.data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
