import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Bot, CheckCircle2, Clock, PlayCircle, Repeat2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubjectKey } from '@/types';
import { activityInRange, pctChange, previousRange, topicSignals, type DailyActivity } from '@/data/analytics';
import { SUBJECT_COLORS } from '@/data/subjects';
import { useUi } from '@/store/ui';
import { useStudents, useSubjects, useTopics, useUnits } from '@/store/core';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { cn } from '@/utils/cn';
import { createRng } from '@/utils/random';
import { fmtNumber, fmtPercent } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, BarChart, LineChart } from '@/components/charts';
import { Card, CardBody, CardHeader, DateRangePicker, Segmented, Skeleton, StatCard, Switch } from '@/components/ui';
import { bucketCount, bucketIndex, bucketLabel, grainFor } from './buckets';

const SUBJECT_PREFIX: Record<SubjectKey, string> = { math: 'math', physics: 'phys', chemistry: 'chem', biology: 'bio', english: 'eng' };
const KEYS: SubjectKey[] = ['math', 'physics', 'chemistry', 'biology', 'english'];

type Num = keyof Pick<DailyActivity, 'dau' | 'wau' | 'mau' | 'watchMinutes' | 'videoCompletionRate' | 'quizAttempts' | 'quizCompletionRate' | 'examAttempts' | 'aiQuestions'>;

/** Aggregate daily rows into chart buckets: sums for counts, averages for rates/active users. */
function aggregate(rows: DailyActivity[], from: string, to: string) {
  const grain = grainFor(from, to);
  const n = bucketCount(from, to, grain);
  const acc = Array.from({ length: n }, () => ({ days: 0, sums: {} as Record<Num, number> }));
  const keys: Num[] = ['dau', 'wau', 'mau', 'watchMinutes', 'videoCompletionRate', 'quizAttempts', 'quizCompletionRate', 'examAttempts', 'aiQuestions'];
  for (const r of rows) {
    const i = bucketIndex(`${r.date}T12:00:00`, from, to, grain);
    if (i < 0 || i >= n) continue;
    acc[i].days++;
    for (const k of keys) acc[i].sums[k] = (acc[i].sums[k] ?? 0) + r[k];
  }
  const avg = (b: (typeof acc)[number], k: Num) => (b.days ? (b.sums[k] ?? 0) / b.days : 0);
  return acc.map((b, i) => ({
    label: bucketLabel(i, from, grain),
    dau: Math.round(avg(b, 'dau')),
    wau: Math.round(avg(b, 'wau')),
    mau: Math.round(avg(b, 'mau')),
    watchHours: Math.round((b.sums.watchMinutes ?? 0) / 60),
    videoCompletion: +avg(b, 'videoCompletionRate').toFixed(1),
    quizCompletion: +avg(b, 'quizCompletionRate').toFixed(1),
    quizAttempts: b.sums.quizAttempts ?? 0,
    examAttempts: b.sums.examAttempts ?? 0,
    aiQuestions: b.sums.aiQuestions ?? 0,
  }));
}

/** Heatmap cell colour: `bad` in [0,1] → green → amber → red with alpha, legible in both themes. */
function heat(bad: number) {
  const b = Math.max(0, Math.min(1, bad));
  if (b > 0.66) return `rgba(220,38,38,${0.14 + (b - 0.66) * 0.9})`;
  if (b > 0.33) return `rgba(245,158,11,${0.14 + (b - 0.33) * 0.6})`;
  return `rgba(22,163,74,${0.1 + (0.33 - b) * 0.5})`;
}

const rng = createRng(1515);
/** Per-question accuracy samples (5 per topic ≈ 150 questions) around each topic's accuracy. */
const questionAccuracy = topicSignals.flatMap((s) => Array.from({ length: 5 }, () => Math.max(5, Math.min(99, s.accuracy + (rng.next() - 0.5) * 30))));

export default function LearningAnalytics() {
  const { t } = useTranslation();
  const L = useLocalize();
  const range = useUi((s) => s.range);
  const loading = useMockLoading(500, [range.from, range.to]);
  const [subject, setSubject] = useState<'all' | SubjectKey>('all');
  const [compare, setCompare] = useState(false);
  const topics = useTopics((s) => s.items);
  const units = useUnits((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const students = useStudents((s) => s.items);

  const data = useMemo(() => {
    const cur = activityInRange(range.from, range.to);
    const p = previousRange(range.from, range.to);
    const pre = activityInRange(p.from, p.to);
    const mean = (rows: DailyActivity[], k: Num) => (rows.length ? rows.reduce((s, r) => s + r[k], 0) / rows.length : 0);
    const total = (rows: DailyActivity[], k: Num) => rows.reduce((s, r) => s + r[k], 0);
    const last = (rows: DailyActivity[], k: Num) => rows[rows.length - 1]?.[k] ?? 0;
    const timeline = aggregate(cur, range.from, range.to);
    const prevTimeline = aggregate(pre, p.from, p.to);
    return {
      timeline: timeline.map((r, i) => ({ ...r, prevDau: prevTimeline[i]?.dau ?? 0 })),
      kpi: {
        dau: [mean(cur, 'dau'), mean(pre, 'dau')],
        wau: [last(cur, 'wau'), last(pre, 'wau')],
        mau: [last(cur, 'mau'), last(pre, 'mau')],
        watch: [total(cur, 'watchMinutes') / 60, total(pre, 'watchMinutes') / 60],
        video: [mean(cur, 'videoCompletionRate'), mean(pre, 'videoCompletionRate')],
        quiz: [mean(cur, 'quizCompletionRate'), mean(pre, 'quizCompletionRate')],
        exams: [total(cur, 'examAttempts'), total(pre, 'examAttempts')],
        ai: [total(cur, 'aiQuestions'), total(pre, 'aiQuestions')],
      },
    };
  }, [range]);

  const topicRows = useMemo(
    () =>
      topicSignals
        .map((s) => {
          const topic = topics.find((x) => x.id === s.topicId);
          const unit = units.find((u) => u.id === topic?.unitId);
          const subjKey = KEYS.find((k) => s.topicId.startsWith(`unit_${SUBJECT_PREFIX[k]}_`))!;
          return { ...s, subjKey, topic: topic ? L(topic, 'name') : s.topicId, unit: unit ? L(unit, 'name') : '' };
        })
        .filter((r) => subject === 'all' || r.subjKey === subject)
        .sort((a, b) => a.accuracy - b.accuracy),
    [topics, units, L, subject],
  );

  const bySubject = KEYS.map((k) => {
    const rows = topicSignals.filter((s) => s.topicId.startsWith(`unit_${SUBJECT_PREFIX[k]}_`));
    const attempts = rows.reduce((s, r) => s + r.attempts, 0);
    const acc = rows.reduce((s, r) => s + r.accuracy * r.attempts, 0) / (attempts || 1);
    const sub = subjects.find((x) => x.key === k);
    return { name: sub ? L(sub, 'name') : t(`subjects.${k}`), score: +acc.toFixed(1), color: SUBJECT_COLORS[k] };
  });

  const accBands = ['0–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100'].map((label, i) => {
    const lo = i === 0 ? 0 : 30 + i * 10;
    const hi = i === 0 ? 40 : lo + 10;
    return { label: `${label}%`, questions: questionAccuracy.filter((a) => a >= lo && a < (hi === 100 ? 101 : hi)).length, color: i < 2 ? '#DC2626' : i < 4 ? '#F59E0B' : '#059669' };
  });

  const scoreBands = [
    { label: '< 50', lo: 0, hi: 50, color: '#DC2626' },
    { label: '50–59', lo: 50, hi: 60, color: '#F59E0B' },
    { label: '60–69', lo: 60, hi: 70, color: '#EAB308' },
    { label: '70–79', lo: 70, hi: 80, color: '#2563EB' },
    { label: '80–89', lo: 80, hi: 90, color: '#059669' },
    { label: '90+', lo: 90, hi: 101, color: '#C9A24A' },
  ].map((b) => ({ ...b, students: students.filter((s) => s.avgScore >= b.lo && s.avgScore < b.hi).length }));

  const recurrence = [...topicSignals]
    .sort((a, b) => b.mistakeRecurrence - a.mistakeRecurrence)
    .slice(0, 8)
    .map((s) => {
      const topic = topics.find((x) => x.id === s.topicId);
      const name = topic ? L(topic, 'name') : s.topicId;
      return { name: name.length > 26 ? `${name.slice(0, 25)}…` : name, recurrence: s.mistakeRecurrence };
    });

  const k = data.kpi;
  const d = (pair: number[]) => (compare ? pctChange(pair[0], pair[1]) : undefined);
  const spark = (key: 'dau' | 'watchHours' | 'videoCompletion' | 'quizCompletion' | 'examAttempts' | 'aiQuestions') => data.timeline.map((r) => r[key]);

  return (
    <>
      <PageHeader
        title={t('analytics.learning.title')}
        subtitle={t('analytics.learning.subtitle')}
        actions={
          <>
            <Switch checked={compare} onChange={setCompare} label={<span className="text-xs">{t('common.comparePrevious')}</span>} className="rounded-lg border border-line bg-surface px-3 py-1.5" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard loading={loading} label={t('analytics.learning.dau')} value={fmtNumber(Math.round(k.dau[0]))} delta={d(k.dau)} icon={<Users />} trend={spark('dau')} color="#0B1F3A" hint={t('analytics.learning.wauMau', { wau: fmtNumber(k.wau[0]), mau: fmtNumber(k.mau[0]) })} />
        <StatCard loading={loading} label={t('analytics.learning.watchTime')} value={`${fmtNumber(Math.round(k.watch[0]))} ${t('analytics.learning.hrs')}`} delta={d(k.watch)} icon={<Clock />} trend={spark('watchHours')} color="#C9A24A" />
        <StatCard loading={loading} label={t('analytics.learning.videoCompletion')} value={fmtPercent(k.video[0], 1)} delta={d(k.video)} icon={<PlayCircle />} trend={spark('videoCompletion')} color="#2563EB" />
        <StatCard loading={loading} label={t('analytics.learning.quizCompletion')} value={fmtPercent(k.quiz[0], 1)} delta={d(k.quiz)} icon={<CheckCircle2 />} trend={spark('quizCompletion')} color="#059669" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('analytics.learning.activeTitle')} subtitle={t('analytics.learning.activeSub')} icon={<Activity className="h-4 w-4" />} />
          <CardBody>
            <LineChart
              loading={loading}
              data={data.timeline}
              xKey="label"
              valueFormat={(v) => fmtNumber(v)}
              series={[
                { key: 'dau', label: t('analytics.learning.dauShort'), color: '#0B1F3A' },
                ...(compare ? [{ key: 'prevDau', label: t('analytics.learning.prevDau'), color: '#94A3B8' }] : []),
                { key: 'wau', label: t('analytics.learning.wauShort'), color: '#C9A24A' },
                { key: 'mau', label: t('analytics.learning.mauShort'), color: '#2563EB' },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('analytics.learning.engagementTitle')} subtitle={t('analytics.learning.engagementSub')} icon={<PlayCircle className="h-4 w-4" />} />
          <CardBody>
            <AreaChart
              loading={loading}
              data={data.timeline}
              xKey="label"
              valueFormat={(v) => fmtNumber(v)}
              series={[
                { key: 'watchHours', label: t('analytics.learning.watchHours'), color: '#C9A24A' },
                { key: 'quizAttempts', label: t('analytics.learning.quizAttempts'), color: '#059669' },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('analytics.learning.completionTitle')} subtitle={t('analytics.learning.completionSub')} />
          <CardBody>
            <LineChart
              loading={loading}
              data={data.timeline}
              xKey="label"
              valueFormat={(v) => `${v}%`}
              series={[
                { key: 'videoCompletion', label: t('analytics.learning.videoCompletion'), color: '#2563EB' },
                { key: 'quizCompletion', label: t('analytics.learning.quizCompletion'), color: '#059669' },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('analytics.learning.scoresTitle')} subtitle={t('analytics.learning.scoresSub')} />
          <CardBody>
            <BarChart loading={loading} data={bySubject} xKey="name" colorByRow valueFormat={(v) => `${v}%`} series={[{ key: 'score', label: t('analytics.learning.avgScore'), color: '#0B1F3A' }]} />
          </CardBody>
        </Card>
      </div>

      {/* Weak topics heatmap */}
      <Card className="mt-6">
        <CardHeader
          title={t('analytics.learning.heatmapTitle')}
          subtitle={t('analytics.learning.heatmapSub')}
          action={
            <Segmented
              size="sm"
              aria-label={t('common.subject')}
              value={subject}
              onChange={setSubject}
              options={[{ value: 'all' as const, label: t('common.all') }, ...KEYS.map((key) => ({ value: key, label: t(`subjects.${key}`) }))]}
              className="hidden md:inline-flex"
            />
          }
        />
        <CardBody>
          <div className="mb-3 md:hidden">
            <Segmented
              size="sm"
              aria-label={t('common.subject')}
              value={subject}
              onChange={setSubject}
              options={[{ value: 'all' as const, label: t('common.all') }, ...KEYS.map((key) => ({ value: key, label: t(`subjects.${key}`).split(' ')[0] }))]}
              className="flex flex-wrap"
            />
          </div>
          {loading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : (
            <div className="scrollbar-thin max-h-[30rem] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {[t('common.topic'), t('analytics.learning.accuracy'), t('analytics.learning.recurrence'), t('analytics.learning.attempts'), t('analytics.learning.avgTime')].map((h, i) => (
                      <th key={h} className={cn('border-b border-line bg-surface-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted', i === 0 ? 'text-start' : 'text-center')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topicRows.map((r) => (
                    <tr key={r.topicId}>
                      <td className="border-b border-line px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SUBJECT_COLORS[r.subjKey] }} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">{r.topic}</div>
                            <div className="truncate text-[11px] text-muted">{r.unit}</div>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-line p-1">
                        <div className="rounded-md py-1.5 text-center font-semibold text-ink num" style={{ background: heat((80 - r.accuracy) / 45) }}>
                          {fmtPercent(r.accuracy, 1)}
                        </div>
                      </td>
                      <td className="border-b border-line p-1">
                        <div className="rounded-md py-1.5 text-center font-semibold text-ink num" style={{ background: heat((r.mistakeRecurrence - 6) / 36) }}>
                          {fmtPercent(r.mistakeRecurrence, 1)}
                        </div>
                      </td>
                      <td className="border-b border-line p-1">
                        <div className="rounded-md py-1.5 text-center text-ink num" style={{ background: heat(1 - r.attempts / 1400) }}>
                          {fmtNumber(r.attempts)}
                        </div>
                      </td>
                      <td className="border-b border-line p-1">
                        <div className="rounded-md py-1.5 text-center text-ink num" style={{ background: heat((r.avgTimeSec - 35) / 105) }}>
                          {fmtNumber(r.avgTimeSec)} {t('common.seconds')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted">
            {[
              [heat(0.05), t('analytics.learning.legendGood')],
              [heat(0.5), t('analytics.learning.legendWatch')],
              [heat(0.95), t('analytics.learning.legendWeak')],
            ].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-5 rounded" style={{ background: c }} /> {l}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('analytics.learning.accuracyTitle')} subtitle={t('analytics.learning.accuracySub', { count: questionAccuracy.length })} />
          <CardBody>
            <BarChart loading={loading} data={accBands} xKey="label" colorByRow height={240} valueFormat={(v) => fmtNumber(v)} series={[{ key: 'questions', label: t('analytics.learning.questions'), color: '#0B1F3A' }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('analytics.learning.examTitle')} subtitle={t('analytics.learning.examSub', { n: fmtNumber(k.exams[0]) })} />
          <CardBody>
            <BarChart loading={loading} data={scoreBands} xKey="label" colorByRow height={240} valueFormat={(v) => fmtNumber(v)} series={[{ key: 'students', label: t('common.students'), color: '#0B1F3A' }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('analytics.learning.recurrenceTitle')} subtitle={t('analytics.learning.recurrenceSub')} icon={<Repeat2 className="h-4 w-4" />} />
          <CardBody>
            <BarChart loading={loading} horizontal data={recurrence} xKey="name" categoryWidth={170} height={280} valueFormat={(v) => `${v}%`} series={[{ key: 'recurrence', label: t('analytics.learning.recurrence'), color: '#DC2626' }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={t('analytics.learning.aiTitle')}
            subtitle={t('analytics.learning.aiSub', { n: fmtNumber(k.ai[0]) })}
            icon={<Bot className="h-4 w-4" />}
            action={<Link to="/ai-tutor" className="text-xs font-semibold text-accent hover:underline">{t('actions.viewAll')}</Link>}
          />
          <CardBody>
            <AreaChart loading={loading} data={data.timeline} xKey="label" height={280} valueFormat={(v) => fmtNumber(v)} series={[{ key: 'aiQuestions', label: t('analytics.learning.aiQuestions'), color: '#7C3AED' }]} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
