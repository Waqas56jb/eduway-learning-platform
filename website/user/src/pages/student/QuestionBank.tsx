import { Info, Layers, Play, Search, SearchX, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { BankFilters, activeFilterCount, emptyFilters, type BankFilterState } from '@/components/student/practice/BankFilters';
import { QuestionPreviewCard } from '@/components/student/practice/QuestionPreviewCard';
import { PracticeSession } from '@/components/student/PracticeSession';
import { Button, EmptyState, Input, Modal, PageHeader, Seo, Skeleton, SubjectIcon, useMockLoading } from '@/components/ui';
import { getSubject, questions, subjects } from '@/data';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn, shuffle } from '@/lib/utils';
import type { Question, SubjectId } from '@/types';

const COUNTS = [10, 20, 50] as const;
const PAGE = 12;

const isSubjectId = (v: string | null): v is SubjectId => !!v && subjects.some((s) => s.id === v);

export default function QuestionBank() {
  const { t } = useTranslation();
  const { l, fmtNumber } = useLang();
  const { bookmarks, isBookmarked } = useStudent();
  const [params, setParams] = useSearchParams();
  const ready = useMockLoading(600);

  const paramSubject = params.get('subject');
  const urlSubject: SubjectId | 'all' = isSubjectId(paramSubject) ? paramSubject : 'all';
  const [filters, setFilters] = useState<BankFilterState>(() => emptyFilters(urlSubject));
  const [count, setCount] = useState<(typeof COUNTS)[number]>(10);
  const [visible, setVisible] = useState(PAGE);
  const [drawer, setDrawer] = useState(false);
  const [session, setSession] = useState<{ key: number; qs: Question[] } | null>(null);

  const patch = useCallback((p: Partial<BankFilterState>) => {
    setFilters((f) => ({ ...f, ...p }));
    setVisible(PAGE);
  }, []);

  // ?subject= is the source of truth for the subject, so links into the bank (e.g. from a
  // subject page or the top-bar search) re-scope the view even while it is already mounted.
  useEffect(() => {
    setFilters((f) => (f.subject === urlSubject ? f : { ...f, subject: urlSubject, unit: '', topic: '', tags: [] }));
    setVisible(PAGE);
    setSession(null);
  }, [urlSubject]);

  const selectSubject = (subject: SubjectId | 'all') => {
    patch({ subject, unit: '', topic: '', tags: [] });
    const next = new URLSearchParams(params);
    if (subject === 'all') next.delete('subject');
    else next.set('subject', subject);
    setParams(next, { replace: true });
  };

  const scope = useMemo(
    () => questions.filter((q) => filters.subject === 'all' || q.subjectId === filters.subject),
    [filters.subject],
  );

  const topics = useMemo(() => {
    const seen = new Map<string, string>();
    for (const q of scope) if (!filters.unit || q.unitId === filters.unit) seen.set(q.topic.en, l(q.topic));
    return [...seen].map(([key, label]) => ({ key, label }));
  }, [scope, filters.unit, l]);

  const tags = useMemo(() => [...new Set(scope.flatMap((q) => q.tags))], [scope]);

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return scope.filter(
      (q) =>
        (!filters.unit || q.unitId === filters.unit) &&
        (!filters.topic || q.topic.en === filters.topic) &&
        (!filters.difficulties.length || filters.difficulties.includes(q.difficulty)) &&
        (!filters.tags.length || filters.tags.some((tg) => q.tags.includes(tg))) &&
        (!filters.bookmarkedOnly || isBookmarked(q.id)) &&
        (!term || l(q.text).toLowerCase().includes(term) || l(q.topic).toLowerCase().includes(term)),
    );
  }, [scope, filters, isBookmarked, l]);

  const active = activeFilterCount(filters);
  const sessionSize = Math.min(count, filtered.length);

  const startSession = (pool: Question[], size: number) => {
    setSession({ key: Date.now(), qs: shuffle(pool).slice(0, size) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearAll = () => {
    selectSubject('all');
    setFilters(emptyFilters());
  };

  const seo = <Seo title={t('practice.bank.seoTitle')} description={t('practice.bank.seoDescription')} />;

  if (session) {
    return (
      <>
        {seo}
        <PracticeSession
          key={session.key}
          questions={session.qs}
          onExit={() => setSession(null)}
          onRestart={() =>
            session.qs.length === 1
              ? setSession({ key: Date.now(), qs: session.qs })
              : startSession(filtered.length ? filtered : session.qs, session.qs.length)
          }
        />
      </>
    );
  }

  const filterPanel = (
    <BankFilters value={filters} onChange={patch} topics={topics} tags={tags} bookmarkCount={bookmarks.length} />
  );

  const practicePanel = (
    <section aria-labelledby="start-practice" className="relative overflow-hidden rounded-3xl bg-navy-grad p-5 text-white shadow-lift sm:p-6">
      <div className="pointer-events-none absolute -end-10 -top-10 h-40 w-40 rounded-full bg-accent/25 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-2 text-accent-light">
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider">{t('practice.start.eyebrow')}</span>
        </div>
        <h2 id="start-practice" className="mt-2 font-sans text-xl font-bold tracking-normal text-white">
          {t('practice.start.title')}
        </h2>
        <p className="mt-1 text-sm text-white/65">{t('practice.start.subtitle')}</p>
        <div role="radiogroup" aria-label={t('practice.start.countLabel')} className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-white/10 p-1">
          {COUNTS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={count === c}
              onClick={() => setCount(c)}
              className={cn(
                'rounded-xl py-2 text-sm font-bold transition num',
                count === c ? 'bg-white text-primary shadow-soft' : 'text-white/75 hover:bg-white/10 hover:text-white',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-white/70" aria-live="polite">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-light" aria-hidden />
          {filtered.length === 0
            ? t('practice.start.none')
            : filtered.length < count
              ? t('practice.start.capped', { count: filtered.length })
              : t('practice.start.available', { count: filtered.length })}
        </p>
        <Button
          variant="gold"
          fullWidth
          className="mt-4"
          disabled={filtered.length === 0}
          onClick={() => startSession(filtered, sessionSize)}
          leftIcon={<Play className="h-4 w-4 rtl:-scale-x-100" />}
        >
          {t('practice.start.cta', { count: sessionSize })}
        </Button>
      </div>
    </section>
  );

  return (
    <>
      {seo}
      <PageHeader
        title={t('practice.bank.title')}
        subtitle={t('practice.bank.subtitle', {
          total: fmtNumber(questions.length),
          subjects: subjects.length,
          bookmarked: bookmarks.length,
        })}
      />

      {/* Subject chips */}
      <div role="group" aria-label={t('practice.bank.filters.subject')} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <SubjectChip active={filters.subject === 'all'} onClick={() => selectSubject('all')}>
          <Layers className="h-4 w-4" aria-hidden />
          {t('practice.bank.allSubjects')}
          <span className="num opacity-70">{questions.length}</span>
        </SubjectChip>
        {subjects.map((s) => (
          <SubjectChip
            key={s.id}
            active={filters.subject === s.id}
            color={s.color}
            onClick={() => selectSubject(s.id)}
          >
            <SubjectIcon id={s.id} className="h-4 w-4" />
            {l(s.name)}
            <span className="num opacity-70">{questions.filter((q) => q.subjectId === s.id).length}</span>
          </SubjectChip>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="hidden space-y-6 lg:block" aria-label={t('common.filters')}>
          {practicePanel}
          <div className="card p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-sans text-base font-bold tracking-normal text-primary">
                <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden />
                {t('common.filters')}
              </h2>
              {active > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-accent hover:text-primary">
                  {t('common.clearFilters')}
                </button>
              )}
            </div>
            {filterPanel}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex gap-3">
            <Input
              wrapperClassName="flex-1"
              type="search"
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder={t('practice.bank.searchPlaceholder')}
              aria-label={t('practice.bank.searchPlaceholder')}
              icon={<Search className="h-4 w-4" />}
            />
            <Button
              variant="subtle"
              className="h-auto shrink-0 lg:hidden"
              onClick={() => setDrawer(true)}
              leftIcon={<SlidersHorizontal className="h-4 w-4" />}
              aria-label={t('practice.bank.openFilters', { count: active })}
            >
              <span className="hidden sm:inline">{t('common.filters')}</span>
              {active > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-primary num">{active}</span>
              )}
            </Button>
          </div>

          <div className="mt-4 lg:hidden">{practicePanel}</div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted" aria-live="polite">
              {t('practice.bank.resultsCount', { count: filtered.length })}
            </p>
            {active > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-primary"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                {t('common.clearFilters')}
              </button>
            )}
          </div>

          {!ready ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-2" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card space-y-4 p-5">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex justify-between">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<SearchX className="h-7 w-7" />}
              title={t('practice.bank.empty.title')}
              body={filters.bookmarkedOnly && !bookmarks.length ? t('practice.bank.empty.noBookmarks') : t('practice.bank.empty.body')}
              action={
                <Button variant="outline" onClick={clearAll}>
                  {t('common.clearFilters')}
                </Button>
              }
            />
          ) : (
            <>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {filtered.slice(0, visible).map((q) => (
                  <QuestionPreviewCard key={q.id} question={q} onPractice={(qq) => startSession([qq], 1)} />
                ))}
              </div>
              {visible < filtered.length && (
                <div className="mt-6 text-center">
                  <Button variant="subtle" onClick={() => setVisible((v) => v + PAGE)}>
                    {t('practice.bank.showMore', { count: filtered.length - visible })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={drawer}
        onClose={() => setDrawer(false)}
        title={t('common.filters')}
        description={filters.subject !== 'all' ? l(getSubject(filters.subject)?.name) : undefined}
        footer={
          <>
            <Button variant="subtle" onClick={clearAll} disabled={active === 0}>
              {t('common.clearFilters')}
            </Button>
            <Button onClick={() => setDrawer(false)}>{t('practice.bank.showResults', { count: filtered.length })}</Button>
          </>
        }
      >
        {filterPanel}
      </Modal>
    </>
  );
}

function SubjectChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
        active ? 'text-white shadow-soft' : 'border-primary/10 bg-white text-primary hover:border-primary/25',
        active && !color && 'border-primary bg-primary',
      )}
      style={active && color ? { backgroundColor: color, borderColor: color } : !active && color ? { color } : undefined}
    >
      {children}
    </button>
  );
}
