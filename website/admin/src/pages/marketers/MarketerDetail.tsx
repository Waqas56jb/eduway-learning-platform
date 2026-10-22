import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Award, BarChart3, Check, Mail, MapPin, Pencil, Phone, Plus, School as SchoolIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useApiMutation } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import { marketersApi, partnerKeys, useMarketer, useMarketerPerformance } from '@/api/partners';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { cn } from '@/utils/cn';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { MarketerForm } from '@/components/forms/MarketerForm';
import { BarChart } from '@/components/charts';
import { Avatar, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, ProgressBar, Select, SkeletonCard, StatCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { SettlementsTable } from '@/pages/schools/SettlementsTable';
import { TierBadge } from '@/pages/schools/TierBadge';
import { useAttributionGuard } from './attribution';

export default function MarketerDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const can = useCan();
  const lookups = useLookups();
  const guard = useAttributionGuard();
  const detailQ = useMarketer(id);
  const perfQ = useMarketerPerformance(id);
  const marketer = detailQ.data?.marketer;
  const marketers = lookups.marketers;
  const schools = lookups.schools;
  const monthly = perfQ.data ?? [];
  const loading = detailQ.isLoading;
  const [pick, setPick] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const unassignM = useApiMutation((schoolId: string) => marketersApi.unassignSchool(id!, schoolId), {
    invalidate: [...partnerKeys],
    success: 'marketers.detail.unassigned',
  });

  if (detailQ.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCard key={i} loading label="" value="" />
          ))}
        </div>
        <SkeletonCard lines={8} />
      </div>
    );
  }

  if (!marketer) {
    if (detailQ.error && detailQ.error.code !== 'NOT_FOUND') return <QueryError error={detailQ.error} onRetry={() => detailQ.refetch()} />;
    return (
      <Card>
        <EmptyState title={t('marketers.detail.notFound')} action={<ButtonLink to="/marketers" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>{t('marketers.detail.back')}</ButtonLink>} />
      </Card>
    );
  }

  const canEdit = can('marketers', 'edit');
  const assigned = detailQ.data?.schools ?? [];
  const available = schools.filter((s) => s.marketerId !== marketer.id);
  const ms = detailQ.data?.milestones;
  const active = ms?.set?.items ?? [];
  const paid = marketer.paidStudents;
  const next = ms?.next ?? null;
  const progressPct = ms?.progressPct ?? 0;
  const toNext = ms?.toNext ?? (next ? next.threshold - paid : 0);

  const assign = async () => {
    const school = schools.find((s) => s.id === pick);
    if (!school) return;
    const cur = marketers.find((m) => m.id === school.marketerId);
    setAssigning(true);
    const r = await guard({
      schoolName: L(school, 'name'),
      currentMarketerName: cur ? L(cur, 'name') : null,
      needsReason: !!school.marketerId && school.marketerId !== marketer.id,
      run: (overrideReason) => marketersApi.assignSchool(marketer.id, school.id, overrideReason),
    });
    setAssigning(false);
    if (!r) return;
    toast.success(r.overridden ? t('marketers.detail.overridden') : t('marketers.detail.assignedToast'));
    setPick('');
  };

  const unassign = async (schoolId: string) => {
    const school = assigned.find((s) => s.id === schoolId);
    if (!school) return;
    const ok = await confirm({ title: t('marketers.detail.unassignTitle', { school: L(school, 'name') }), body: t('marketers.detail.unassignBody'), confirmText: t('actions.unassign') });
    if (!ok) return;
    unassignM.mutate(schoolId);
  };

  return (
    <>
      <PageHeader
        title={L(marketer, 'name')}
        current={L(marketer, 'name')}
        meta={
          <>
            <StatusBadge status={marketer.status} />
            <span className="text-xs text-muted">
              {t('marketers.fields.joined')} {fmtDate(marketer.joinedAt)}
            </span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />} onClick={() => navigate('/marketers')}>
              {t('actions.back')}
            </Button>
            {canEdit && (
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                {t('actions.edit')}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('marketers.fields.schools')} value={fmtNumber(assigned.length)} icon={<SchoolIcon />} color="#7C3AED" />
        <StatCard loading={loading} label={t('marketers.fields.paid')} value={fmtNumber(paid)} icon={<Check />} color="#2563EB" trend={monthly.length ? monthly.map((m) => m.students) : undefined} />
        <StatCard loading={loading} label={t('marketers.fields.milestones')} value={`${fmtNumber(marketer.milestonesHit)} / ${fmtNumber(active.length)}`} icon={<Award />} color="#C9A24A" />
        <StatCard loading={loading} label={t('marketers.fields.pendingReward')} value={fmtMoney(marketer.pendingReward, 'IQD', true)} icon={<BarChart3 />} color="#16A34A" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<BarChart3 className="h-4 w-4" />} title={t('marketers.detail.performance')} subtitle={t('marketers.detail.performanceSub')} />
            <CardBody>
              {perfQ.error ? (
                <QueryError compact error={perfQ.error} onRetry={() => perfQ.refetch()} />
              ) : (
                <BarChart
                  data={monthly}
                  xKey="month"
                  xFormat={(v) => fmtDate(`${v}-01T00:00:00`, 'MMM')}
                  valueFormat={(v) => fmtNumber(v)}
                  series={[{ key: 'students', label: t('marketers.fields.paid'), color: '#C9A24A' }]}
                  loading={perfQ.isLoading}
                  height={240}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<SchoolIcon className="h-4 w-4" />} title={t('marketers.detail.assigned')} subtitle={t('common.results', { count: assigned.length })} />
            <CardBody className="space-y-4">
              {canEdit && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    className="flex-1"
                    value={pick}
                    onChange={(e) => setPick(e.target.value)}
                    placeholder={t('marketers.detail.selectSchool')}
                    aria-label={t('marketers.detail.assignSchool')}
                    options={available.map((s) => {
                      const cur = marketers.find((m) => m.id === s.marketerId);
                      return { value: s.id, label: cur ? `${L(s, 'name')} — ${t('marketers.detail.assignedTo', { name: L(cur, 'name') })}` : L(s, 'name') };
                    })}
                  />
                  <Button icon={<Plus className="h-4 w-4" />} disabled={!pick} loading={assigning} onClick={assign}>
                    {t('marketers.detail.assignSchool')}
                  </Button>
                </div>
              )}
              {assigned.length === 0 ? (
                <EmptyState compact title={t('marketers.detail.noSchools')} hint=" " />
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {assigned.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/[0.07] text-primary">
                        <SchoolIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/schools/${s.id}`} className="block truncate text-sm font-semibold text-ink hover:text-accent">
                          {L(s, 'name')}
                        </Link>
                        <div className="text-xs text-muted">
                          {L(s, 'city')} · {fmtNumber(s.verifiedPaidStudents)} {t('marketers.detail.students')}
                        </div>
                      </div>
                      {s.tier && <TierBadge tier={s.tier} />}
                      <StatusBadge status={s.status} className="hidden sm:inline-flex" />
                      {canEdit && (
                        <Tooltip content={t('actions.unassign')}>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="hover:bg-danger/10 hover:text-danger"
                            aria-label={t('actions.unassign')}
                            loading={unassignM.isPending && unassignM.variables === s.id}
                            onClick={() => unassign(s.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title={t('marketers.detail.settlements')} />
            <SettlementsTable partnerType="marketer" partnerId={marketer.id} compact />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardBody className="flex flex-col items-center text-center">
              <Avatar name={marketer.name_en} src={marketer.avatar} size="xl" />
              <h2 className="mt-3 text-base font-semibold">{L(marketer, 'name')}</h2>
              <div className="mt-4 w-full space-y-3 text-start text-sm">
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-muted" />
                  <a href={`tel:${marketer.mobile.replace(/\s/g, '')}`} className="hover:text-accent num" dir="ltr">
                    {marketer.mobile}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 shrink-0 text-muted" />
                  <a href={`mailto:${marketer.email}`} className="truncate hover:text-accent">
                    {marketer.email}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 shrink-0 text-muted" />
                  <span>{L(marketer, 'governorateName')}</span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<Award className="h-4 w-4" />} title={t('marketers.detail.milestones')} />
            <CardBody className="space-y-4">
              <div>
                <ProgressBar value={next ? progressPct : 100} size="md" label={t('marketers.detail.milestones')} />
                <p className="mt-2 text-xs text-muted">
                  {!ms?.set
                    ? t('marketers.detail.noMilestoneSet')
                    : next
                      ? t('marketers.detail.nextMilestone', { count: toNext, label: L(next, 'label'), reward: fmtMoney(next.reward) })
                      : t('marketers.detail.allMilestones')}
                </p>

              </div>
              <ol className="space-y-2">
                {active.map((m) => {
                  const hit = paid >= m.threshold;
                  return (
                    <li key={m.id} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', hit ? 'border-success/30 bg-success/[0.06]' : 'border-line')}>
                      <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', hit ? 'bg-success text-white' : 'bg-ink/[0.06] text-muted')}>
                        {hit ? <Check className="h-4 w-4" /> : m.threshold}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{L(m, 'label')}</div>
                        <div className="text-xs text-muted num">
                          {fmtNumber(m.threshold)} {t('marketers.detail.students')}
                        </div>
                      </div>
                      <span className="text-sm font-semibold num">{fmtMoney(m.reward, 'IQD', true)}</span>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      <MarketerForm open={editOpen} onClose={() => setEditOpen(false)} marketer={marketer} />
    </>
  );
}
