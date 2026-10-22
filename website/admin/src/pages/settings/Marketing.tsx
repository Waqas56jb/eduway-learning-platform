import { BarChart3, Smartphone, Star, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSaveSettings, useSettingsSection, type MarketingSettings } from '@/api/settings';
import { fmtNumber, fmtPercent } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Field, Input, SkeletonCard } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ReadOnlyNotice, SaveBar, Section, useCanEditSettings, useDraft } from './_shared';

const EMPTY: MarketingSettings = {
  stats: { satisfactionPct: 0, passRatePct: 0, rating: 0, ratingCount: 0 },
  displayOverrides: {},
  appLinks: { appStore: null, googlePlay: null },
};
const URL_RE = /^https?:\/\/\S+$/;
const OVERRIDES = ['students', 'lessons', 'questions'] as const;
type StatKey = keyof MarketingSettings['stats'];

export default function MarketingSettingsPage() {
  const { t } = useTranslation();
  const q = useSettingsSection('marketing');
  const save = useSaveSettings('marketing');
  const loading = q.isLoading;
  const value = q.data ?? EMPTY;
  const { draft, setDraft, dirty, reset } = useDraft(value);
  const editable = useCanEditSettings();

  const setStat = (k: StatKey, v: number) => setDraft((d) => ({ ...d, stats: { ...d.stats, [k]: v } }));
  const setOverride = (k: (typeof OVERRIDES)[number], v: string) =>
    setDraft((d) => {
      const next = { ...d.displayOverrides };
      if (v.trim()) next[k] = v;
      else delete next[k];
      return { ...d, displayOverrides: next };
    });
  const setLink = (k: keyof MarketingSettings['appLinks'], v: string) => setDraft((d) => ({ ...d, appLinks: { ...d.appLinks, [k]: v.trim() ? v : null } }));

  const s = draft.stats;
  const badPct = (n: number) => !(n >= 0 && n <= 100);
  const badRating = !(s.rating >= 0 && s.rating <= 5);
  const badLink = (u: string | null) => !!u && !URL_RE.test(u.trim());
  const invalid = badPct(s.satisfactionPct) || badPct(s.passRatePct) || badRating || s.ratingCount < 0 || badLink(draft.appLinks.appStore) || badLink(draft.appLinks.googlePlay);

  const onSave = () => {
    if (invalid) return;
    save.mutate(draft);
  };

  return (
    <div>
      <PageHeader title={t('settings.marketing.title')} subtitle={t('settings.marketing.subtitle')} />
      {!editable && <ReadOnlyNotice />}
      {q.error && !q.data ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : loading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={6} className="xl:col-span-2" />
          <SkeletonCard lines={4} />
        </div>
      ) : (
        <fieldset disabled={!editable} className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Section title={t('settings.marketing.stats')} subtitle={t('settings.marketing.statsHint')} icon={<BarChart3 className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.marketing.satisfactionPct')} error={badPct(s.satisfactionPct) ? t('settings.marketing.pctInvalid') : undefined}>
                  <Input type="number" min={0} max={100} step={0.1} dir="ltr" value={s.satisfactionPct} onChange={(e) => setStat('satisfactionPct', Number(e.target.value))} suffix="%" />
                </Field>
                <Field label={t('settings.marketing.passRatePct')} error={badPct(s.passRatePct) ? t('settings.marketing.pctInvalid') : undefined}>
                  <Input type="number" min={0} max={100} step={0.1} dir="ltr" value={s.passRatePct} onChange={(e) => setStat('passRatePct', Number(e.target.value))} suffix="%" />
                </Field>
                <Field label={t('settings.marketing.rating')} error={badRating ? t('settings.marketing.ratingInvalid') : undefined}>
                  <Input type="number" min={0} max={5} step={0.1} dir="ltr" value={s.rating} onChange={(e) => setStat('rating', Number(e.target.value))} suffix={<Star className="h-3.5 w-3.5" />} />
                </Field>
                <Field label={t('settings.marketing.ratingCount')}>
                  <Input type="number" min={0} dir="ltr" value={s.ratingCount} onChange={(e) => setStat('ratingCount', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
                </Field>
              </div>
            </Section>
            <Section title={t('settings.marketing.overrides')} subtitle={t('settings.marketing.overridesHint')} icon={<Type className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-3">
                {OVERRIDES.map((k) => (
                  <Field key={k} label={t(`settings.marketing.override.${k}`)} hint={t('settings.marketing.overrideAuto')}>
                    <Input dir="ltr" placeholder="10k+" value={draft.displayOverrides[k] ?? ''} onChange={(e) => setOverride(k, e.target.value)} />
                  </Field>
                ))}
              </div>
            </Section>
            <Section title={t('settings.marketing.appLinks')} subtitle={t('settings.marketing.appLinksHint')} icon={<Smartphone className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.marketing.appStore')} error={badLink(draft.appLinks.appStore) ? t('settings.app.urlInvalid') : undefined}>
                  <Input dir="ltr" placeholder="https://apps.apple.com/…" value={draft.appLinks.appStore ?? ''} onChange={(e) => setLink('appStore', e.target.value)} />
                </Field>
                <Field label={t('settings.marketing.googlePlay')} error={badLink(draft.appLinks.googlePlay) ? t('settings.app.urlInvalid') : undefined}>
                  <Input dir="ltr" placeholder="https://play.google.com/…" value={draft.appLinks.googlePlay ?? ''} onChange={(e) => setLink('googlePlay', e.target.value)} />
                </Field>
              </div>
            </Section>
          </div>

          <Section title={t('common.preview')} subtitle={t('settings.marketing.previewHint')}>
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#0B1F3A] p-5 text-center text-white">
              <div>
                <div className="text-2xl font-bold text-accent-light num">{fmtPercent(s.satisfactionPct)}</div>
                <div className="text-[11px] text-white/60">{t('settings.marketing.satisfactionPct')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-accent-light num">{fmtPercent(s.passRatePct)}</div>
                <div className="text-[11px] text-white/60">{t('settings.marketing.passRatePct')}</div>
              </div>
              <div className="col-span-2 border-t border-white/10 pt-3">
                <div className="flex items-center justify-center gap-1 text-xl font-bold text-accent-light num">
                  <Star className="h-5 w-5 fill-current" /> {fmtNumber(s.rating, { maximumFractionDigits: 1 })}
                </div>
                <div className="text-[11px] text-white/60">{t('settings.marketing.ratingFrom', { count: s.ratingCount })}</div>
              </div>
            </div>
          </Section>
        </fieldset>
      )}
      {editable && <SaveBar dirty={dirty} onSave={onSave} onReset={reset} saving={save.isPending} />}
    </div>
  );
}
