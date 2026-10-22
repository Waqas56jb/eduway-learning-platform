import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  PlayCircle,
  Repeat2,
  Smartphone,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLearningAnalytics, useTopicSignals } from '@/api/analytics';
import { useLookups } from '@/api/lookups';
import { flatLoc, flatRef } from '@/api/adapters';
import { useUi } from '@/store/ui';
import { useLocalize } from '@/hooks/useLocale';
import { cn } from '@/utils/cn';
import { fmtNumber, fmtPercent } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { AreaChart, BarChart, LineChart } from '@/components/charts';
import {
  Card,
  CardBody,
  CardHeader,
  DateRangePicker,
  Segmented,
  Skeleton,
  StatCard,
  Switch,
} from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

const PLATFORM_COLORS: Record<string, string> = {
  web: '#0B1F3A',
  ios: '#C9A24A',
  android: '#059669',
};

/** Heatmap cell colour: `bad` in [0,1] → green → amber → red with alpha, legible in both themes. */
function heat(bad: number) {
  const b = Math.max(0, Math.min(1, bad));
  if (b > 0.66) return `rgba(220,38,38,${0.14 + (b - 0.66) * 0.9})`;
  if (b > 0.33) return `rgba(245,158,11,${0.14 + (b - 0.33) * 0.6})`;
  return `rgba(22,163,74,${0.1 + (0.33 - b) * 0.5})`;
}

const SCORE_COLORS = ['#DC2626', '#F59E0B', '#EAB308', '#2563EB', '#059669', '#C9A24A'];

export default function LearningAnalytics() {
  const { t } = useTranslation();
  const L = useLocalize();
  const range = useUi((s) => s.range);
  const [subject, setSubject] = useState<string>('all');
  const [compare, setCompare] = useState(false);
  const lookups = useLookups();
  const subjectId =
    subject === 'all' ? '' : (lookups.subjects.find((s) => s.slug === subject)?.id ?? '');
  const q = useLearningAnalytics({ from: range.from, to: range.to, compare });
  const topicsQ = useTopicSignals({ from: range.from, to: range.to, subjectId });
  const loading = q.isLoading;
  const d = q.data;

  const data = useMemo(() => {
    const k = d?.kpis;
    const pair = (x: { value: number; prev: number | null } | undefined) => [
      x?.value ?? 0,
      x?.prev ?? 0,
    ];
    return {
      timeline: (d?.timeline ?? []).map((r) => ({ ...r, prevDau: r.prevDau ?? 0 })),
      kpi: {
        dau: pair(k?.dau),
        wau: [k?.dau.wau ?? 0, 0],
        mau: [k?.dau.mau ?? 0, 0],
        watch: pair(k?.watchHours),
        video: pair(k?.videoCompletion),
        quiz: pair(k?.quizCompletion),
        exams: pair(k?.examAttempts),
        ai: pair(k?.aiQuestions),
      },
      deltas: {
        dau: k?.dau.deltaPct ?? undefined,
        watch: k?.watchHours.deltaPct ?? undefined,
        video: k?.videoCompletion.deltaPct ?? undefined,
        quiz: k?.quizCompletion.deltaPct ?? undefined,
      },
    };
  }, [d]);

  const topicRows = useMemo(
    () =>
      (topicsQ.data ?? d?.weakTopics ?? [])
        .map((s) => ({
          ...s,
          color: s.subject.color,
          topic: L(flatLoc('name', s.topic), 'name'),
          unit: L(flatLoc('name', s.unit), 'name'),
        }))
        .filter((r) => !subjectId || r.subject.id === subjectId)
        .sort((a, b) => a.accuracy - b.accuracy),
    [topicsQ.data, d, L, subjectId],
  );

  const bySubject = (d?.scoreBySubject ?? []).map((r) => ({
    name: L(flatRef(r), 'name'),
    score: +r.score.toFixed(1),
    color: r.color,
  }));
  const accBands = d?.questionAccuracy ?? [];
  const questionCount = accBands.reduce((a, b) => a + b.questions, 0);
  const scoreBands = (d?.examScores ?? []).map((b, i) => ({
    ...b,
    color: SCORE_COLORS[i % SCORE_COLORS.length],
  }));
  const recurrence = (d?.mistakeRecurrence ?? []).slice(0, 8).map((r) => {
    const name = L(flatRef(r), 'name');
    return { name: name.length > 26 ? `${name.slice(0, 25)}…` : name, recurrence: r.recurrence };
  });
  const platforms = d?.platforms ?? [];

  const k = data.kpi;
  const dl = data.deltas;
  const spark = (
    key:
      | 'dau'
      | 'watchHours'
      | 'videoCompletion'
      | 'quizCompletion'
      | 'examAttempts'
      | 'aiQuestions',
  ) => data.timeline.map((r) => r[key]);
  const subjectOptions = [
    { value: 'all', label: t('common.all') },
    ...lookups.subjects.map((s) => ({ value: s.slug, label: L(s, 'name') })),
  ];

  return (
    <>
      <PageHeader
        title={t('analytics.learning.title')}
        subtitle={t('analytics.learning.subtitle')}
        actions={
          <>
            <Switch
              checked={compare}
              onChange={setCompare}
              label={<span className="text-xs">{t('common.comparePrevious')}</span>}
              className="rounded-lg border border-line bg-surface px-3 py-1.5"
            />
            <DateRangePicker />
          </>
        }
      />

      {q.error && !d ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              loading={loading}
              label={t('analytics.learning.dau')}
              value={fmtNumber(Math.round(k.dau[0]))}
              delta={compare ? dl.dau : undefined}
              icon={<Users />}
              trend={spark('dau')}
              color="#0B1F3A"
              hint={t('analytics.learning.wauMau', {
                wau: fmtNumber(k.wau[0]),
                mau: fmtNumber(k.mau[0]),
              })}
            />
            <StatCard
              loading={loading}
              label={t('analytics.learning.watchTime')}
              value={`${fmtNumber(Math.round(k.watch[0]))} ${t('analytics.learning.hrs')}`}
              delta={compare ? dl.watch : undefined}
              icon={<Clock />}
              trend={spark('watchHours')}
              color="#C9A24A"
            />
            <StatCard
              loading={loading}
              label={t('analytics.learning.videoCompletion')}
              value={fmtPercent(k.video[0], 1)}
              delta={compare ? dl.video : undefined}
              icon={<PlayCircle />}
              trend={spark('videoCompletion')}
              color="#2563EB"
            />
            <StatCard
              loading={loading}
              label={t('analytics.learning.quizCompletion')}
              value={fmtPercent(k.quiz[0], 1)}
              delta={compare ? dl.quiz : undefined}
              icon={<CheckCircle2 />}
              trend={spark('quizCompletion')}
              color="#059669"
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader
                title={t('analytics.learning.activeTitle')}
                subtitle={t('analytics.learning.activeSub')}
                icon={<Activity className="h-4 w-4" />}
              />
              <CardBody>
                <LineChart
                  loading={loading}
                  data={data.timeline}
                  xKey="label"
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    { key: 'dau', label: t('analytics.learning.dauShort'), color: '#0B1F3A' },
                    ...(compare
                      ? [
                          {
                            key: 'prevDau',
                            label: t('analytics.learning.prevDau'),
                            color: '#94A3B8',
                          },
                        ]
                      : []),
                    { key: 'wau', label: t('analytics.learning.wauShort'), color: '#C9A24A' },
                    { key: 'mau', label: t('analytics.learning.mauShort'), color: '#2563EB' },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={t('analytics.learning.engagementTitle')}
                subtitle={t('analytics.learning.engagementSub')}
                icon={<PlayCircle className="h-4 w-4" />}
              />
              <CardBody>
                <AreaChart
                  loading={loading}
                  data={data.timeline}
                  xKey="label"
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    {
                      key: 'watchHours',
                      label: t('analytics.learning.watchHours'),
                      color: '#C9A24A',
                    },
                    {
                      key: 'quizAttempts',
                      label: t('analytics.learning.quizAttempts'),
                      color: '#059669',
                    },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={t('analytics.learning.completionTitle')}
                subtitle={t('analytics.learning.completionSub')}
              />
              <CardBody>
                <LineChart
                  loading={loading}
                  data={data.timeline}
                  xKey="label"
                  valueFormat={(v) => `${v}%`}
                  series={[
                    {
                      key: 'videoCompletion',
                      label: t('analytics.learning.videoCompletion'),
                      color: '#2563EB',
                    },
                    {
                      key: 'quizCompletion',
                      label: t('analytics.learning.quizCompletion'),
                      color: '#059669',
                    },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={t('analytics.learning.scoresTitle')}
                subtitle={t('analytics.learning.scoresSub')}
              />
              <CardBody>
                <BarChart
                  loading={loading}
                  data={bySubject}
                  xKey="name"
                  colorByRow
                  valueFormat={(v) => `${v}%`}
                  series={[
                    { key: 'score', label: t('analytics.learning.avgScore'), color: '#0B1F3A' },
                  ]}
                />
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
                  options={subjectOptions}
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
                  options={subjectOptions.map((o) => ({ ...o, label: o.label.split(' ')[0] }))}
                  className="flex flex-wrap"
                />
              </div>
              {loading || topicsQ.isLoading ? (
                <Skeleton className="h-80 w-full rounded-lg" />
              ) : (
                <div className="scrollbar-thin max-h-[30rem] overflow-auto rounded-lg border border-line">
                  <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {[
                          t('common.topic'),
                          t('analytics.learning.accuracy'),
                          t('analytics.learning.recurrence'),
                          t('analytics.learning.attempts'),
                          t('analytics.learning.avgTime'),
                        ].map((h, i) => (
                          <th
                            key={h}
                            className={cn(
                              'border-b border-line bg-surface-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted',
                              i === 0 ? 'text-start' : 'text-center',
                            )}
                          >
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
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: r.color }}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium text-ink">{r.topic}</div>
                                <div className="truncate text-[11px] text-muted">{r.unit}</div>
                              </div>
                            </div>
                          </td>
                          <td className="border-b border-line p-1">
                            <div
                              className="num rounded-md py-1.5 text-center font-semibold text-ink"
                              style={{ background: heat((80 - r.accuracy) / 45) }}
                            >
                              {fmtPercent(r.accuracy, 1)}
                            </div>
                          </td>
                          <td className="border-b border-line p-1">
                            <div
                              className="num rounded-md py-1.5 text-center font-semibold text-ink"
                              style={{ background: heat((r.mistakeRecurrence - 6) / 36) }}
                            >
                              {fmtPercent(r.mistakeRecurrence, 1)}
                            </div>
                          </td>
                          <td className="border-b border-line p-1">
                            <div
                              className="num rounded-md py-1.5 text-center text-ink"
                              style={{ background: heat(1 - r.attempts / 1400) }}
                            >
                              {fmtNumber(r.attempts)}
                            </div>
                          </td>
                          <td className="border-b border-line p-1">
                            <div
                              className="num rounded-md py-1.5 text-center text-ink"
                              style={{ background: heat((r.avgTimeSec - 35) / 105) }}
                            >
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
              <CardHeader
                title={t('analytics.learning.accuracyTitle')}
                subtitle={t('analytics.learning.accuracySub', { count: questionCount })}
              />
              <CardBody>
                <BarChart
                  loading={loading}
                  data={accBands}
                  xKey="label"
                  colorByRow
                  height={240}
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    {
                      key: 'questions',
                      label: t('analytics.learning.questions'),
                      color: '#0B1F3A',
                    },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={t('analytics.learning.examTitle')}
                subtitle={t('analytics.learning.examSub', { n: fmtNumber(k.exams[0]) })}
              />
              <CardBody>
                <BarChart
                  loading={loading}
                  data={scoreBands}
                  xKey="label"
                  colorByRow
                  height={240}
                  valueFormat={(v) => fmtNumber(v)}
                  series={[{ key: 'students', label: t('common.students'), color: '#0B1F3A' }]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={t('analytics.learning.recurrenceTitle')}
                subtitle={t('analytics.learning.recurrenceSub')}
                icon={<Repeat2 className="h-4 w-4" />}
              />
              <CardBody>
                <BarChart
                  loading={loading}
                  horizontal
                  data={recurrence}
                  xKey="name"
                  categoryWidth={170}
                  height={280}
                  valueFormat={(v) => `${v}%`}
                  series={[
                    {
                      key: 'recurrence',
                      label: t('analytics.learning.recurrence'),
                      color: '#DC2626',
                    },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title={t('analytics.learning.aiTitle')}
                subtitle={t('analytics.learning.aiSub', { n: fmtNumber(k.ai[0]) })}
                icon={<Bot className="h-4 w-4" />}
                action={
                  <Link
                    to="/ai-tutor"
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    {t('actions.viewAll')}
                  </Link>
                }
              />
              <CardBody>
                <AreaChart
                  loading={loading}
                  data={data.timeline}
                  xKey="label"
                  height={280}
                  valueFormat={(v) => fmtNumber(v)}
                  series={[
                    {
                      key: 'aiQuestions',
                      label: t('analytics.learning.aiQuestions'),
                      color: '#7C3AED',
                    },
                  ]}
                />
              </CardBody>
            </Card>
          </div>

          {/* Platform split (web / iOS / Android) */}
          <Card className="mt-6">
            <CardHeader
              title={t('analytics.platform.title')}
              subtitle={t('analytics.platform.learningSub')}
              icon={<Smartphone className="h-4 w-4" />}
            />
            <CardBody>
              <BarChart
                loading={loading}
                data={platforms.map((p) => ({
                  name: t(`analytics.platform.${p.platform}`),
                  dau: p.dau,
                  watchHours: p.watchHours,
                  quizAttempts: p.quizAttempts,
                }))}
                xKey="name"
                height={240}
                valueFormat={(v) => fmtNumber(v)}
                series={[
                  {
                    key: 'dau',
                    label: t('analytics.learning.dauShort'),
                    color: PLATFORM_COLORS.web,
                  },
                  {
                    key: 'watchHours',
                    label: t('analytics.learning.watchHours'),
                    color: PLATFORM_COLORS.ios,
                  },
                  {
                    key: 'quizAttempts',
                    label: t('analytics.learning.quizAttempts'),
                    color: PLATFORM_COLORS.android,
                  },
                ]}
              />
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
