/** Cached AI settings (admin edits take effect within seconds; writes invalidate immediately). */
import { TtlCache } from '../../common/utils/cache.js';
import tutorData from '../../db/seed/data/student-extras.json' with { type: 'json' };
import { aiRepo, type AiSettingsRow } from './repository.js';

const cache = new TtlCache<AiSettingsRow>(10_000);

export const DEFAULT_MODELS: Record<'openai' | 'anthropic' | 'azure', { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-6-luna', label: 'GPT-6 Luna (default, cost-effective)' },
    { value: 'gpt-6-sol', label: 'GPT-6 Sol' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  ],
  azure: [{ value: 'gpt-4o-azure', label: 'GPT-4o (Azure deployment)' }],
};

/** Seeded per-subject suggestions (used when ai_settings.suggested_prompts has none for a subject). */
export const DEFAULT_SUGGESTIONS = (tutorData as unknown as { tutorSuggestions: Record<string, { en: string; ar: string }[]> }).tutorSuggestions;

export async function loadAiSettings(): Promise<AiSettingsRow> {
  const hit = cache.get('s');
  if (hit) return hit;
  let row = await aiRepo.settings();
  if (!row) {
    await aiRepo.ensureSettings();
    row = await aiRepo.settings();
  }
  if (!row) throw new Error('ai_settings row missing');
  cache.set('s', row);
  return row;
}

export function invalidateAiSettings(): void {
  cache.clear();
}

export function modelCatalog(row: Pick<AiSettingsRow, 'models'>): Record<'openai' | 'anthropic' | 'azure', { value: string; label: string }[]> {
  const m = row.models ?? {};
  return {
    openai: m.openai?.length ? m.openai : DEFAULT_MODELS.openai,
    anthropic: m.anthropic?.length ? m.anthropic : DEFAULT_MODELS.anthropic,
    azure: m.azure?.length ? m.azure : DEFAULT_MODELS.azure,
  };
}
