/**
 * Provider selection: `ai_settings.provider` + the matching API key from the environment. Missing key (or
 * AI_FORCE_MOCK / NODE_ENV=test) → the offline MockAiProvider, so the API never requires a key to run.
 */
import { env } from '../../../config/env.js';
import { AnthropicProvider, OpenAiCompatibleProvider } from './http.js';
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

export function providerFor(name: ProviderName): AiProvider {
  if (override) return override;
  if (env.AI_FORCE_MOCK || env.NODE_ENV === 'test') return mockProvider();
  if (name === 'openai' && env.OPENAI_API_KEY) return new OpenAiCompatibleProvider('openai', env.OPENAI_BASE_URL, env.OPENAI_API_KEY);
  if (name === 'azure' && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_BASE_URL) {
    return new OpenAiCompatibleProvider('azure', env.AZURE_OPENAI_BASE_URL, env.AZURE_OPENAI_API_KEY, true);
  }
  if (name === 'anthropic' && env.ANTHROPIC_API_KEY) return new AnthropicProvider(env.ANTHROPIC_BASE_URL, env.ANTHROPIC_API_KEY);
  return mockProvider();
}

/** Embedding backend for pgvector retrieval: OpenAI-compatible when a key exists, else the deterministic mock. */
export function embeddingProvider(): { provider: AiProvider; model: string; real: boolean } {
  if (!env.AI_FORCE_MOCK && env.NODE_ENV !== 'test' && env.OPENAI_API_KEY) {
    return { provider: new OpenAiCompatibleProvider('openai', env.OPENAI_BASE_URL, env.OPENAI_API_KEY), model: env.AI_EMBEDDING_MODEL, real: true };
  }
  return { provider: mockProvider(), model: 'mock-hash-1536', real: false };
}

/** Which provider is actually serving answers (admin settings / health). */
export function activeProviderName(name: ProviderName): string {
  return providerFor(name).name;
}
