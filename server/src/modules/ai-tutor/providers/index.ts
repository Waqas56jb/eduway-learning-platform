/**
 * Provider selection. The provider is AI_PROVIDER (env override) or else the admin setting
 * `ai_settings.provider`; the matching API key must be present. Missing key (or AI_FORCE_MOCK / NODE_ENV=test)
 * → the offline MockAiProvider, so the API never requires a key to run.
 */
import { env, type Env } from '../../../config/env.js';
import { AnthropicSdkProvider } from './anthropic.js';
import { OpenAiCompatibleProvider } from './http.js';
import { MockAiProvider } from './mock.js';
import type { AiProvider } from './types.js';

export * from './types.js';
export { MockAiProvider } from './mock.js';

export type ProviderName = 'openai' | 'anthropic' | 'azure' | 'mock';

let mock: MockAiProvider | null = null;
const mockProvider = () => (mock ??= new MockAiProvider(env.NODE_ENV === 'test' ? 0 : 12));

/** Test hook: replace the provider returned by `providerFor` (null restores the default selection). */
let override: AiProvider | null = null;
export function setProviderOverride(p: AiProvider | null): void {
  override = p;
}

/** Pure selection (unit-tested): which backend serves answers for an admin-selected provider name. */
export function resolveAiProvider(adminChoice: ProviderName, e: Env): ProviderName {
  const wanted = e.AI_PROVIDER ?? adminChoice;
  if (e.AI_FORCE_MOCK || e.NODE_ENV === 'test') return 'mock';
  if (wanted === 'openai' && e.OPENAI_API_KEY) return 'openai';
  if (wanted === 'azure' && e.AZURE_OPENAI_API_KEY && e.AZURE_OPENAI_BASE_URL) return 'azure';
  if (wanted === 'anthropic' && e.ANTHROPIC_API_KEY) return 'anthropic';
  return 'mock';
}

const cache = new Map<ProviderName, AiProvider>();
function build(name: ProviderName): AiProvider {
  const hit = cache.get(name);
  if (hit) return hit;
  let p: AiProvider;
  if (name === 'openai') p = new OpenAiCompatibleProvider('openai', env.OPENAI_BASE_URL, env.OPENAI_API_KEY ?? '', false, undefined, env.OPENAI_REASONING_EFFORT);
  else if (name === 'azure') p = new OpenAiCompatibleProvider('azure', env.AZURE_OPENAI_BASE_URL ?? '', env.AZURE_OPENAI_API_KEY ?? '', true);
  else if (name === 'anthropic') p = new AnthropicSdkProvider({ apiKey: env.ANTHROPIC_API_KEY ?? '', baseURL: env.ANTHROPIC_BASE_URL, serverFallback: env.ANTHROPIC_SERVER_FALLBACK });
  else p = mockProvider();
  cache.set(name, p);
  return p;
}

export function providerFor(name: ProviderName): AiProvider {
  if (override) return override;
  return build(resolveAiProvider(name, env));
}

/**
 * Model to request from a provider: the admin-selected model when it belongs to that provider's family,
 * otherwise the provider default (ANTHROPIC_MODEL / OPENAI_MODEL) — e.g. AI_PROVIDER=anthropic while the admin
 * setting still says gpt-4o.
 */
export function resolveModel(providerName: string, configured: string, e: Pick<Env, 'ANTHROPIC_MODEL' | 'OPENAI_MODEL'> = env): string {
  const isClaude = /^claude/i.test(configured);
  if (providerName === 'anthropic') return isClaude ? configured : e.ANTHROPIC_MODEL;
  if (providerName === 'openai') return isClaude || !configured || /-azure$/i.test(configured) ? e.OPENAI_MODEL : configured;
  return configured;
}

/** Embedding backend for pgvector retrieval: OpenAI-compatible when a key exists, else the deterministic mock. */
export function embeddingProvider(): { provider: AiProvider; model: string; real: boolean } {
  if (!env.AI_FORCE_MOCK && env.NODE_ENV !== 'test' && env.OPENAI_API_KEY) {
    return { provider: build('openai'), model: env.AI_EMBEDDING_MODEL, real: true };
  }
  return { provider: mockProvider(), model: 'mock-hash-1536', real: false };
}

/** Which provider is actually serving answers (admin settings / health). */
export function activeProviderName(name: ProviderName): string {
  return providerFor(name).name;
}
