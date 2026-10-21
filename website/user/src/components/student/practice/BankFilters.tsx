import { Check, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Switch } from '@/components/ui';
import { getSubject } from '@/data';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Difficulty, SubjectId } from '@/types';
import { DIFFICULTIES, tagLabel } from './utils';

export interface BankFilterState {
  subject: SubjectId | 'all';
  unit: string;
  topic: string;
  difficulties: Difficulty[];
  tags: string[];
  bookmarkedOnly: boolean;
  search: string;
}

export const emptyFilters = (subject: BankFilterState['subject'] = 'all'): BankFilterState => ({
  subject,
  unit: '',
  topic: '',
  difficulties: [],
  tags: [],
  bookmarkedOnly: false,
  search: '',
});

/** Count of active filters (subject chips and search are shown separately, but still count). */
export const activeFilterCount = (f: BankFilterState) =>
  (f.subject !== 'all' ? 1 : 0) +
  (f.unit ? 1 : 0) +
  (f.topic ? 1 : 0) +
  f.difficulties.length +
  f.tags.length +
  (f.bookmarkedOnly ? 1 : 0) +
  (f.search.trim() ? 1 : 0);

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

const diffColor: Record<Difficulty, string> = {
  easy: 'border-success/40 bg-success/10 text-success',
  medium: 'border-warning/40 bg-warning/10 text-[#B45309]',
  hard: 'border-danger/40 bg-danger/10 text-danger',
};

interface BankFiltersProps {
  value: BankFilterState;
  onChange: (patch: Partial<BankFilterState>) => void;
  topics: { key: string; label: string }[];
  tags: string[];
  bookmarkCount: number;
}

/** Unit / topic / difficulty / tags / bookmarked filters for the question bank. */
export function BankFilters({ value, onChange, topics, tags, bookmarkCount }: BankFiltersProps) {
  const { t } = useTranslation();
  const { l } = useLang();
  const [allTags, setAllTags] = useState(false);
  const subject = value.subject === 'all' ? undefined : getSubject(value.subject);
  const visibleTags = allTags ? tags : tags.slice(0, 12);

  return (
    <div className="space-y-6">
      <Select
        label={t('practice.bank.filters.unit')}
        value={value.unit}
        disabled={!subject}
        hint={!subject ? t('practice.bank.filters.unitHint') : undefined}
        onChange={(e) => onChange({ unit: e.target.value, topic: '' })}
      >
        <option value="">{t('practice.bank.filters.anyUnit')}</option>
        {subject?.units.map((u) => (
          <option key={u.id} value={u.id}>
            {l(u.title)}
          </option>
        ))}
      </Select>

      <Select
        label={t('practice.bank.filters.topic')}
        value={value.topic}
        onChange={(e) => onChange({ topic: e.target.value })}
      >
        <option value="">{t('practice.bank.filters.anyTopic')}</option>
        {topics.map((tp) => (
          <option key={tp.key} value={tp.key}>
            {tp.label}
          </option>
        ))}
      </Select>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-primary">{t('practice.bank.filters.difficulty')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTIES.map((d) => {
            const on = value.difficulties.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ difficulties: toggle(value.difficulties, d) })}
                className={cn(
                  'rounded-xl border px-2 py-2 text-sm font-semibold transition',
                  on ? diffColor[d] : 'border-primary/10 bg-white text-muted hover:border-primary/25 hover:text-primary',
                )}
              >
                {t(`common.difficulty.${d}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-primary">{t('practice.bank.filters.tags')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {visibleTags.map((tag) => {
            const on = value.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ tags: toggle(value.tags, tag) })}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  on
                    ? 'border-primary bg-primary text-white'
                    : 'border-primary/10 bg-white text-muted hover:border-accent/60 hover:text-primary',
                )}
              >
                {on && <Check className="h-3 w-3" aria-hidden />}
                {tagLabel(t, tag)}
              </button>
            );
          })}
        </div>
        {tags.length > 12 && (
          <button
            type="button"
            onClick={() => setAllTags((v) => !v)}
            className="mt-2 text-xs font-semibold text-accent hover:text-primary"
            aria-expanded={allTags}
          >
            {allTags ? t('practice.bank.filters.fewerTags') : t('practice.bank.filters.moreTags', { count: tags.length - 12 })}
          </button>
        )}
      </fieldset>

      <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent/5 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Star className="h-4 w-4 fill-accent text-accent" aria-hidden />
          {t('practice.bank.filters.bookmarkedOnly')}
          <span className="rounded-full bg-white px-1.5 text-[11px] text-muted num">{bookmarkCount}</span>
        </span>
        <Switch
          checked={value.bookmarkedOnly}
          onChange={(v) => onChange({ bookmarkedOnly: v })}
          label={t('practice.bank.filters.bookmarkedOnly')}
        />
      </div>
    </div>
  );
}
