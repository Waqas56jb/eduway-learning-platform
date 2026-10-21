import { CircleAlert, CircleCheck, Eye, Layers, Library, Repeat, Trophy } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MistakeItem } from '@/components/student/MistakeItem';
import {
  Button,
  EmptyState,
  PageHeader,
  Reveal,
  Seo,
  SkeletonList,
  SubjectBadgeIcon,
  SubjectIcon,
  Tabs,
  useMockLoading,
} from '@/components/ui';
import { getQuestion, subjects } from '@/data';
import { useLang } from '@/hooks/useLang';
import { useStudent } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import type { Mistake, Question, SubjectId } from '@/types';

type Filter = 'all' | 'unresolved' | 'reviewed' | 'mastered' | 'repeated';
type Row = { mistake: Mistake; question: Question };

const matches = (m: Mistake, f: Filter) =>
  f === 'all' ? true : f === 'repeated' ? m.repeatCount >= 2 : m.status === f;

export default function MyMistakes() {
  const { t } = useTranslation();
  const { l } = useLang();
  const { mistakes } = useStudent();
  const ready = useMockLoading(550);
  const [filter, setFilterState] = useState<Filter>('all');
  const [subject, setSubjectState] = useState<SubjectId | 'all'>('all');
  // Items the student is working on stay in view (and in place) until the filter changes,
  // even if a retry or status change means they no longer match it.
  const [pinned, setPinned] = useState<string[]>([]);
  const rank = useRef(new Map<string, number>());

  const setFilter = (f: Filter) => {
    setFilterState(f);
    setPinned([]);
  };
  const setSubject = (s: SubjectId | 'all') => {
    setSubjectState(s);
    setPinned([]);
  };
  const pin = useCallback((id: string) => setPinned((p) => (p.includes(id) ? p : [...p, id])), []);

  const rows = useMemo<Row[]>(() => {
    const list = mistakes
      .map((m) => ({ mistake: m, question: getQuestion(m.questionId) }))
      .filter((r): r is Row => !!r.question);
    // Newest first on arrival; afterwards the order is frozen so retried items don't jump around.
    const fresh = list.filter((r) => !rank.current.has(r.mistake.id));
    fresh.sort((a, b) => a.mistake.date.localeCompare(b.mistake.date));
    for (const r of fresh) rank.current.set(r.mistake.id, -rank.current.size - 1);
    return list.sort((a, b) => (rank.current.get(a.mistake.id) ?? 0) - (rank.current.get(b.mistake.id) ?? 0));
  }, [mistakes]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, unresolved: 0, reviewed: 0, mastered: 0, repeated: 0 };
    for (const r of rows) {
      c[r.mistake.status]++;
      if (r.mistake.repeatCount >= 2) c.repeated++;
    }
    return c;
  }, [rows]);

  const filtered = rows.filter(
    (r) =>
      (matches(r.mistake, filter) || pinned.includes(r.mistake.id)) &&
      (subject === 'all' || r.question.subjectId === subject),
  );

  // Group subject → unit, in curriculum order.
  const groups = subjects
    .map((s) => ({
      subject: s,
      units: s.units
        .map((u) => ({ unit: u, rows: filtered.filter((r) => r.question.subjectId === s.id && r.question.unitId === u.id) }))
        .filter((g) => g.rows.length),
    }))
    .filter((g) => g.units.length);

  const stats = [
    { k: 'unresolved', icon: CircleAlert, cls: 'bg-danger/10 text-danger' },
    { k: 'reviewed', icon: Eye, cls: 'bg-warning/10 text-warning' },
    { k: 'mastered', icon: Trophy, cls: 'bg-success/10 text-success' },
    { k: 'repeated', icon: Repeat, cls: 'bg-primary/5 text-primary' },
  ] as const;

  return (
    <>
      <Seo title={t('practice.mistakes.seoTitle')} description={t('practice.mistakes.seoDescription')} />
      <PageHeader
        title={t('practice.mistakes.title')}
        subtitle={t('practice.mistakes.subtitle')}
        actions={
          <Button to="/student/question-bank" variant="outline" leftIcon={<Library className="h-4 w-4" />}>
            {t('practice.mistakes.practiceMore')}
          </Button>
        }
      />

      <Reveal staggerChildren={0.06} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setFilter(s.k)}
            aria-pressed={filter === s.k}
            className={cn(
              'card flex items-center gap-3 p-4 text-start transition hover:-translate-y-0.5 hover:shadow-lift',
              filter === s.k && 'ring-2 ring-accent',
            )}
          >
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', s.cls)}>
              <s.icon className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-2xl font-bold text-primary num">{counts[s.k]}</span>
              <span className="text-xs font-medium text-muted">{t(`practice.mistakes.stats.${s.k}`)}</span>
            </span>
          </button>
        ))}
      </Reveal>

      <div className="mt-8 flex flex-col gap-4">
        <Tabs<Filter>
          ariaLabel={t('practice.mistakes.filterLabel')}
          value={filter}
          onChange={setFilter}
          items={(['all', 'unresolved', 'reviewed', 'mastered', 'repeated'] as Filter[]).map((f) => ({
            id: f,
            label: t(`practice.mistakes.tabs.${f}`),
            count: counts[f],
          }))}
        />
        <div role="group" aria-label={t('practice.mistakes.subjectFilter')} className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
          <button
            type="button"
            aria-pressed={subject === 'all'}
            onClick={() => setSubject('all')}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
              subject === 'all' ? 'border-primary bg-primary text-white' : 'border-primary/10 bg-white text-primary hover:border-primary/25',
            )}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            {t('common.all')}
          </button>
          {subjects.map((s) => {
            const on = subject === s.id;
            const n = rows.filter((r) => r.question.subjectId === s.id && matches(r.mistake, filter)).length;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSubject(s.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
                  on ? 'text-white' : 'border-primary/10 bg-white hover:border-primary/25',
                )}
                style={on ? { backgroundColor: s.color, borderColor: s.color } : { color: s.color }}
              >
                <SubjectIcon id={s.id} className="h-3.5 w-3.5" />
                {l(s.name)}
                <span className="num opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        {!ready ? (
          <SkeletonList rows={5} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={filter === 'mastered' ? <Trophy className="h-7 w-7" /> : <CircleCheck className="h-7 w-7" />}
            title={rows.length === 0 ? t('practice.mistakes.empty.noneTitle') : t('practice.mistakes.empty.title')}
            body={rows.length === 0 ? t('practice.mistakes.empty.noneBody') : t('practice.mistakes.empty.body')}
            action={
              <Button to="/student/question-bank" variant="gold">
                {t('practice.mistakes.practiceMore')}
              </Button>
            }
          />
        ) : (
          <div className="space-y-10">
            {groups.map(({ subject: s, units }) => (
              <section key={s.id} aria-labelledby={`mg-${s.id}`}>
                <header className="mb-4 flex items-center gap-3">
                  <SubjectBadgeIcon id={s.id} color={s.color} size={40} />
                  <div className="min-w-0">
                    <h2 id={`mg-${s.id}`} className="font-sans text-xl font-bold tracking-normal text-primary">
                      {l(s.name)}
                    </h2>
                    <p className="text-xs text-muted">
                      {t('practice.mistakes.groupCount', { count: units.reduce((n, u) => n + u.rows.length, 0) })}
                    </p>
                  </div>
                  <span className="h-px flex-1 bg-primary/10" aria-hidden />
                </header>
                <div className="space-y-6">
                  {units.map(({ unit, rows: urows }) => (
                    <div key={unit.id}>
                      <h3
                        className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold tracking-normal text-muted"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                        {l(unit.title)}
                        <span className="rounded-full bg-primary/5 px-2 py-0.5 text-[11px] text-primary num">{urows.length}</span>
                      </h3>
                      <ul className="space-y-3">
                        {urows.map((r) => (
                          <li key={r.mistake.id}>
                            <MistakeItem mistake={r.mistake} question={r.question} onActivity={pin} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
