import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Bot, CreditCard, Gauge, Lock, LockOpen, MapPin, MonitorSmartphone, NotebookPen, Phone, School, ShieldCheck, Target, UserRound, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, ButtonLink, Card, EmptyState, ProgressBar, SkeletonCard, StatusBadge, Tabs, useConfirm, type TabItem } from '@/components/ui';
import { useLang } from '@/hooks/useLocale';
import { useCan } from '@/store/auth';
import { fmtDate, fmtMoney, fmtNumber, fmtPercent } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { errorMessage, isApiError } from '@/api/client';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { studentsApi, useToggleLock } from '@/api/students';
import { OverviewTab } from './detail/OverviewTab';
import { ActivityTab } from './detail/ActivityTab';
import { PaymentsTab } from './detail/PaymentsTab';
import { SessionsTab } from './detail/SessionsTab';
import { NotesTab } from './detail/NotesTab';
import { ActionsTab } from './detail/ActionsTab';
import { PlatformBadges } from './detail/shared';

type TabKey = 'overview' | 'activity' | 'payments' | 'sessions' | 'notes' | 'actions';

export default function UserDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const confirm = useConfirm();
  const q = useApiQuery(qk.students.detail(id), () => studentsApi.get(id), { enabled: !!id });
  const student = q.data;
  const [tab, setTab] = useState<TabKey>('overview');
  const lockMut = useToggleLock(id);

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title={t('common.loading')} />
        <SkeletonCard lines={3} className="mb-6" />
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      </div>
    );
  }

  if (!student) {
    const notFound = !q.error || (isApiError(q.error) && q.error.status === 404);
    return (
      <div>
        <PageHeader title={notFound ? t('users.detail.notFound') : t('api.loadFailed')} />
        <Card>
          <EmptyState
            title={notFound ? t('users.detail.notFound') : t('api.loadFailed')}
            hint={notFound ? t('users.detail.notFoundHint') : errorMessage(q.error)}
            action={
              notFound ? (
                <ButtonLink to="/users" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
                  {t('users.detail.back')}
                </ButtonLink>
              ) : (
                <Button variant="secondary" onClick={() => q.refetch()}>
                  {t('api.retry')}
                </Button>
              )
            }
          />
        </Card>
      </div>
    );
  }

  const name = student.name[lang];
  const canEdit = can('users', 'edit');

  const toggleLock = async () => {
    const lock = !student.locked;
    const ok = await confirm({
      title: t(lock ? 'users.actions.lockConfirm' : 'users.actions.unlockConfirm', { name }),
      body: t('users.actions.lockDesc'),
      tone: lock ? 'danger' : 'primary',
      confirmText: t(lock ? 'users.actions.lockAccount' : 'users.actions.unlockAccount'),
      reason: true,
    });
    if (!ok) return;
    lockMut.mutate({ lock, reason: ok.reason });
  };

  const tabs: TabItem<TabKey>[] = [
    { key: 'overview', label: t('users.tabs.overview'), icon: <UserRound /> },
    { key: 'activity', label: t('users.tabs.activity'), icon: <Activity /> },
    { key: 'payments', label: t('users.tabs.payments'), icon: <CreditCard />, count: student.counts.transactions },
    { key: 'sessions', label: t('users.tabs.sessions'), icon: <MonitorSmartphone />, count: student.counts.sessions },
    { key: 'notes', label: t('users.tabs.notes'), icon: <NotebookPen />, count: student.counts.notes },
    { key: 'actions', label: t('users.tabs.actions'), icon: <ShieldCheck /> },
  ];

  const quota = student.aiAllowance?.quota ?? 0;
  const summary = [
    { icon: <Gauge className="h-4 w-4" />, label: t('users.detail.progress'), value: fmtPercent(student.progress), bar: student.progress, max: 100, color: '#2563EB' },
    { icon: <Target className="h-4 w-4" />, label: t('users.detail.avgScore'), value: fmtPercent(student.avgScore), bar: student.avgScore, max: 100, color: '#059669' },
    {
      icon: <Bot className="h-4 w-4" />,
      label: t('users.detail.aiUsed'),
      value: fmtNumber(student.aiAllowance?.used ?? student.aiQuestionsUsed),
      sub: student.aiDisabled ? t('users.detail.aiDisabled') : t('users.detail.ofAllowance', { n: quota }),
      bar: student.aiAllowance?.used ?? student.aiQuestionsUsed,
      max: Math.max(quota, 1),
      color: '#EA580C',
    },
    { icon: <Wallet className="h-4 w-4" />, label: t('users.detail.lifetime'), value: fmtMoney(student.lifetimeValue), color: '#C9A24A' },
  ];

  return (
    <div>
      <PageHeader
        title={name}
        current={name}
        actions={
          <>
            <ButtonLink to="/users" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('actions.back')}
            </ButtonLink>
            {canEdit && (
              <Button
                variant={student.locked ? 'primary' : 'danger'}
                onClick={toggleLock}
                loading={lockMut.isPending}
                icon={student.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              >
                {t(student.locked ? 'users.actions.unlockAccount' : 'users.actions.lockAccount')}
              </Button>
            )}
          </>
        }
      />

      {/* Identity card */}
      <Card className="mb-6 overflow-hidden">
        <div className="h-16 bg-navy-grad bg-[length:200%] sm:h-20" aria-hidden>
          <div className="h-full w-full bg-[radial-gradient(60%_120%_at_90%_0%,rgba(201,162,74,0.35),transparent_70%)] rtl:bg-[radial-gradient(60%_120%_at_10%_0%,rgba(201,162,74,0.35),transparent_70%)]" />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <Avatar name={student.name.en} src={student.avatarUrl ?? undefined} size="xl" className="-mt-10 ring-4" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{name}</h2>
              <StatusBadge status={student.subscriptionStatus} />
              {student.locked && (
                <Badge tone="danger" icon={<Lock className="h-3 w-3" />}>
                  {t('users.detail.lockedBadge')}
                </Badge>
              )}
              <PlatformBadges platforms={student.platforms} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                <span dir="ltr" className="num">
                  {formatPhone(student.mobile)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {student.governorate?.name[lang] ?? '—'}
              </span>
              {(student.school || student.schoolName) && (
                <span className="inline-flex items-center gap-1.5">
                  <School className="h-3.5 w-3.5" />
                  {student.school?.name[lang] ?? student.schoolName}
                </span>
              )}
              <span className="num">{student.id.slice(0, 8)}</span>
              <span>{t('users.detail.joined', { date: fmtDate(student.memberSince ?? student.createdAt) })}</span>
            </div>
            {student.locked && student.lockedReason && <p className="mt-2 text-xs text-danger">{student.lockedReason}</p>}
          </div>
        </div>
      </Card>

      {/* Summary metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted">
              <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${m.color}1A`, color: m.color }}>
                {m.icon}
              </span>
              {m.label}
            </div>
            <div className="kpi-num mt-2 text-2xl text-primary">{m.value}</div>
            {m.sub && <div className="text-[11px] text-muted">{m.sub}</div>}
            {m.bar !== undefined && <ProgressBar value={m.bar} max={m.max} color={m.color} className="mt-2" label={m.label} />}
          </Card>
        ))}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />

      <div role="tabpanel" className="animate-fade-in">
        {tab === 'overview' && <OverviewTab student={student} />}
        {tab === 'activity' && <ActivityTab student={student} />}
        {tab === 'payments' && <PaymentsTab studentId={student.id} />}
        {tab === 'sessions' && <SessionsTab student={student} />}
        {tab === 'notes' && <NotesTab student={student} />}
        {tab === 'actions' && <ActionsTab student={student} />}
      </div>
    </div>
  );
}
