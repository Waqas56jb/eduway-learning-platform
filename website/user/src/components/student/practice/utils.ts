import type { TFunction } from 'i18next';
import type { Difficulty, Mistake } from '@/types';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export const difficultyTone = (d: Difficulty) =>
  d === 'easy' ? ('success' as const) : d === 'medium' ? ('warning' as const) : ('danger' as const);

/** Human label for a question tag slug; falls back to the slug itself when untranslated. */
export function tagLabel(t: TFunction, slug: string): string {
  return String(t(`practice.tags.${slug}`, { defaultValue: slug.replace(/-/g, ' ') }));
}

export const sourceLabelKey = (s: Mistake['source']) => `practice.source.${s}`;
