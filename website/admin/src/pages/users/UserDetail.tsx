import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Bot, CreditCard, Gauge, Lock, LockOpen, MapPin, MonitorSmartphone, NotebookPen, Phone, School, ShieldCheck, Target, UserRound, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, ButtonLink, Card, EmptyState, ProgressBar, SkeletonCard, StatusBadge, Tabs, useConfirm, type TabItem } from '@/components/ui';
import { governorates } from '@/data/geo';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useCan } from '@/store/auth';
import { useSchools, useStudents, useTransactions } from '@/store/core';
import { fmtDate, fmtMoney, fmtNumber, fmtPercent } from '@/utils/format';
import { OverviewTab } from './detail/OverviewTab';
import { ActivityTab } from './detail/ActivityTab';
import { PaymentsTab } from './detail/PaymentsTab';
import { SessionsTab } from './detail/SessionsTab';
import { NotesTab } from './detail/NotesTab';
import { ActionsTab } from './detail/ActionsTab';

type TabKey = 'overview' | 'activity' | 'payments' | 'sessions' | 'notes' | 'actions';

const AI_ALLOWANCE = 100;

export default function UserDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading(400, [id]);
  const student = useStudents((s) => s.items.find((x) => x.id === id));
  const update = useStudents((s) => s.update);
  const schools = useSchools((s) => s.items);
  const allTxns = useTransactions((s) => s.items);
  const txns = useMemo(() => allTxns.filter((x) => x.studentId === id), [allTxns, id]);
  const [tab, setTab] = useState<TabKey>('overview');

  if (!student) {
    return (
      <div>
        <PageHeader title={t('users.detail.notFound')} />
        <Card>
          <EmptyState
            title={t('users.detail.notFound')}
            hint={t('users.detail.notFoundHint')}
            action={
              <ButtonLink to="/users" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
                {t('users.detail.back')}
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const name = L(student, 'name');
  const school = schools.find((s) => s.id === student.schoolId);
  const gov = governorates.find((g) => g.id === student.governorateId);
  const lifetime = txns.filter((x) => x.status === 'paid' || x.status === 'partially_refunded').reduce((s, x) => s + x.amount - x.refundedAmount, 0);
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
    update(student.id, lock ? { locked: true, sessions: [] } : { locked: false }, {
      action: lock ? 'student.lock' : 'student.unlock',
      summary: `${lock ? 'Locked' : 'Unlocked'} account of ${student.name_en} — ${ok.reason}`,
    });
    toast.success(t(lock ? 'users.actions.lockedToast' : 'users.actions.unlockedToast'));
  };

  const tabs: TabItem<TabKey>[] = [
    { key: 'overview', label: t('users.tabs.overview'), icon: <UserRound /> },
    { key: 'activity', label: t('users.tabs.activity'), icon: <Activity /> },
    { key: 'payments', label: t('users.tabs.payments'), icon: <CreditCard />, count: txns.length },
    { key: 'sessions', label: t('users.tabs.sessions'), icon: <MonitorSmartphone />, count: student.sessions.length },
    { key: 'notes', label: t('users.tabs.notes'), icon: <NotebookPen />, count: student.notes.length },
    { key: 'actions', label: t('users.tabs.actions'), icon: <ShieldCheck /> },
  ];

  const summary = [
    { icon: <Gauge className="h-4 w-4" />, label: t('users.detail.progress'), value: fmtPercent(student.progress), bar: student.progress, color: '#2563EB' },
    { icon: <Target className="h-4 w-4" />, label: t('users.detail.avgScore'), value: fmtPercent(student.avgScore), bar: student.avgScore, color: '#059669' },
    { icon: <Bot className="h-4 w-4" />, label: t('users.detail.aiUsed'), value: fmtNumber(student.aiQuestionsUsed), sub: t('users.detail.ofAllowance', { n: AI_ALLOWANCE }), bar: student.aiQuestionsUsed, color: '#EA580C' },
    { icon: <Wallet className="h-4 w-4" />, label: t('users.detail.lifetime'), value: fmtMoney(lifetime), color: '#C9A24A' },
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
              <Button variant={student.locked ? 'primary' : 'danger'} onClick={toggleLock} icon={student.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}>
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
          <Avatar name={student.name_en} src={student.avatar} size="xl" className="-mt-10 ring-4" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{name}</h2>
              <StatusBadge status={student.subscriptionStatus} />
              {student.locked && (
                <Badge tone="danger" icon={<Lock className="h-3 w-3" />}>
                  {t('users.detail.lockedBadge')}
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                <span dir="ltr" className="num">
                  {student.mobile}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {L(gov, 'name')}
              </span>
              {school && (
                <span className="inline-flex items-center gap-1.5">
                  <School className="h-3.5 w-3.5" />
                  {L(school, 'name')}
                </span>
              )}
              <span className="num">{student.id}</span>
              <span>{t('users.detail.joined', { date: fmtDate(student.createdAt) })}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((m) =>
          loading ? (
            <SkeletonCard key={m.label} lines={2} />
          ) : (
            <Card key={m.label} className="p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${m.color}1A`, color: m.color }}>
                  {m.icon}
                </span>
                {m.label}
              </div>
              <div className="kpi-num mt-2 text-2xl text-primary">{m.value}</div>
              {m.sub && <div className="text-[11px] text-muted">{m.sub}</div>}
              {m.bar !== undefined && <ProgressBar value={m.bar} color={m.color} className="mt-2" label={m.label} />}
            </Card>
          ),
        )}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      ) : (
        <div role="tabpanel" className="animate-fade-in">
          {tab === 'overview' && <OverviewTab student={student} />}
          {tab === 'activity' && <ActivityTab student={student} />}
          {tab === 'payments' && <PaymentsTab transactions={txns} />}
          {tab === 'sessions' && <SessionsTab student={student} />}
          {tab === 'notes' && <NotesTab student={student} />}
          {tab === 'actions' && <ActionsTab student={student} />}
        </div>
      )}
    </div>
  );
}
