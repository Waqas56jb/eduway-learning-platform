/** AI tutor adapters: Anthropic (official SDK, mocked fetch) and OpenAI-compatible (mocked axios stream). */
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { env, type Env } from '../../src/config/env.js';
import { acceptsTemperature, AnthropicSdkProvider } from '../../src/modules/ai-tutor/providers/anthropic.js';
import { OpenAiCompatibleProvider } from '../../src/modules/ai-tutor/providers/http.js';
import { resolveAiProvider, resolveModel } from '../../src/modules/ai-tutor/providers/index.js';
import type { AiGenerateRequest } from '../../src/modules/ai-tutor/providers/types.js';
import { fakeHttp } from './helpers/fake-http.js';

const req = (over: Partial<AiGenerateRequest> = {}): AiGenerateRequest => ({
  model: 'claude-sonnet-5-5',
  system: 'You are a tutor.',
  messages: [{ role: 'user', content: 'What is a derivative?' }],
  temperature: 0.4,
  maxTokens: 800,
  lang: 'en',
  subjectSlug: 'math',
  context: [{ sourceType: 'lesson_description', sourceId: 'l1', lessonId: 'l1', title: 'Derivatives', content: 'Rate of change.', score: 1 }],
  ...over,
});

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

function anthropicStream(text: string[], stop = 'end_turn'): string {
  return sse([
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 42, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ...text.map((t): [string, unknown] => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }]),
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 9 } }],
    ['message_stop', { type: 'message_stop' }],
  ]);
}

function fakeFetch(body: string, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status, headers: { 'content-type': status === 200 ? 'text/event-stream' : 'application/json', 'request-id': 'req_1' } });
  }) as typeof fetch;
  return { fn, calls };
}

describe('AnthropicSdkProvider', () => {
  it('streams text deltas and reports usage for allowance accounting', async () => {
    const f = fakeFetch(anthropicStream(['A derivative ', 'measures change.']));
    const p = new AnthropicSdkProvider({ apiKey: 'sk-test', fetch: f.fn, maxRetries: 0 });
    const deltas: string[] = [];
    const r = await p.stream(req(), (d) => deltas.push(d));
    expect(deltas).toEqual(['A derivative ', 'measures change.']);
    expect(r).toMatchObject({ text: 'A derivative measures change.', tokensIn: 42, tokensOut: 9, model: 'claude-sonnet-5-5', provider: 'anthropic' });
    const sent = JSON.parse(String(f.calls[0]?.init.body)) as Record<string, unknown>;
    expect(f.calls[0]?.url).toContain('/v1/messages');
    expect(sent.stream).toBe(true);
    expect(sent.model).toBe('claude-sonnet-5-5');
    expect(sent.temperature).toBeUndefined(); // current models reject non-default sampling
    expect(sent.fallbacks).toBe('default');
    expect(String(sent.system)).toContain('Derivatives');
    const headers = new Headers(f.calls[0]?.init.headers as ConstructorParameters<typeof Headers>[0]);
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(headers.get('x-api-key') ?? headers.get('authorization')).toMatch(/sk-test$/);
  });
  it('a refusal with no text becomes a polite localized answer', async () => {
    const f = fakeFetch(anthropicStream([], 'refusal'));
    const deltas: string[] = [];
    const r = await new AnthropicSdkProvider({ apiKey: 'k', fetch: f.fn, maxRetries: 0, serverFallback: false }).stream(req({ lang: 'ar' }), (d) => deltas.push(d));
    expect(r.text).toContain('عذراً');
    expect(deltas.join('')).toBe(r.text);
    expect(new Headers(f.calls[0]?.init.headers as ConstructorParameters<typeof Headers>[0]).get('anthropic-beta')).toBeNull();
  });
  it('API errors become AiProviderError with the status', async () => {
    const f = fakeFetch(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), 401);
    await expect(new AnthropicSdkProvider({ apiKey: 'bad', fetch: f.fn, maxRetries: 0 }).stream(req(), () => undefined)).rejects.toMatchObject({ name: 'AiProviderError', status: 401 });
  });
  it('temperature is only sent to legacy models', () => {
    expect(acceptsTemperature('claude-sonnet-5-5')).toBe(false);
    expect(acceptsTemperature('claude-opus-4-7')).toBe(false);
    expect(acceptsTemperature('claude-sonnet-4-6')).toBe(true);
    expect(acceptsTemperature('claude-sonnet-4-20250514')).toBe(true);
    expect(acceptsTemperature('claude-3-5-haiku-latest')).toBe(true);
  });
});

describe('OpenAiCompatibleProvider', () => {
  it('streams chat completion deltas with usage', async () => {
    const chunks = [
      `data: ${JSON.stringify({ model: 'gpt-4o-2024', choices: [{ delta: { content: 'Hello' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 30, completion_tokens: 4 } })}\n\n`,
      'data: [DONE]\n\n',
    ];
    const f = fakeHttp(() => ({ data: Readable.from(chunks) }));
    const p = new OpenAiCompatibleProvider('openai', 'https://api.openai.com/v1', 'sk-x', false, f.http);
    const deltas: string[] = [];
    const r = await p.stream(req({ model: 'gpt-4o' }), (d) => deltas.push(d));
    expect(deltas).toEqual(['Hello', ' world']);
    expect(r).toMatchObject({ text: 'Hello world', tokensIn: 30, tokensOut: 4, model: 'gpt-4o-2024', provider: 'openai' });
    expect(f.calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(f.calls[0]?.headers?.Authorization).toBe('Bearer sk-x');
    expect(f.body()).toMatchObject({ model: 'gpt-4o', stream: true, stream_options: { include_usage: true } });
  });
});

describe('AI provider selection', () => {
  const dev = (over: Partial<Env>): Env => ({ ...env, NODE_ENV: 'development', AI_FORCE_MOCK: false, ...over }) as Env;
  it('admin setting decides unless AI_PROVIDER overrides; missing key → mock', () => {
    expect(resolveAiProvider('anthropic', dev({ ANTHROPIC_API_KEY: 'k', AI_PROVIDER: undefined }))).toBe('anthropic');
    expect(resolveAiProvider('anthropic', dev({ ANTHROPIC_API_KEY: undefined, AI_PROVIDER: undefined }))).toBe('mock');
    expect(resolveAiProvider('anthropic', dev({ OPENAI_API_KEY: 'k', AI_PROVIDER: 'openai' }))).toBe('openai');
    expect(resolveAiProvider('openai', dev({ AI_PROVIDER: 'mock', OPENAI_API_KEY: 'k' }))).toBe('mock');
    expect(resolveAiProvider('anthropic', { ...dev({ ANTHROPIC_API_KEY: 'k' }), NODE_ENV: 'test' })).toBe('mock');
  });
  it('model falls back to the provider default when it belongs to another family', () => {
    const e = { ANTHROPIC_MODEL: 'claude-sonnet-5-5', OPENAI_MODEL: 'gpt-4o' };
    expect(resolveModel('anthropic', 'gpt-4o', e)).toBe('claude-sonnet-5-5');
    expect(resolveModel('anthropic', 'claude-opus-5-5', e)).toBe('claude-opus-5-5');
    expect(resolveModel('openai', 'claude-sonnet-5-5', e)).toBe('gpt-4o');
    expect(resolveModel('mock', 'whatever', e)).toBe('whatever');
  });
});
