import { useMemo } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarRange, GitBranch, Layers, LineChart as LineIcon, Target, Trophy, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { calcIncentiveLocal, partnerModule, type PartnerType } from '@/api/partners';
import { useIncentiveRule } from '@/api/drilldown';
import { useCan } from '@/store/auth';
import { useLang } from '@/hooks/useLocale';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { IncentiveCalculator } from '@/components/forms/IncentiveRuleForm';
import { AreaChart } from '@/components/charts';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, SkeletonCard, StatCard, StatusBadge } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

/** ADM-INC-02 — one incentive-rule version (read-only): validity, tiers, payout curve and the preview calculator. */
export default function IncentiveRuleDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routeModule = pathname.startsWith('/marketers') ? 'marketers' : 'schools';
  const q = useIncentiveRule(id);
  const rule = q.data;

  /** Total payout for 0…N paid students — N spans the last finite tier plus headroom. */
  const curve = useMemo(() => {
    if (!rule?.tiers.length) return [];
    const top = Math.max(rule.qualificationThreshold, ...rule.tiers.map((x) => x.to ?? x.from)) || 10;
    const max = Math.max(10, Math.ceil(top * 1.25));
    const step = Math.max(1, Math.round(max / 40));
    const pts: { students: string; amount: number }[] = [];
    for (let n = 0; n <= max; n += step) pts.push({ students: String(n), amount: calcIncentiveLocal(rule, n).amount });
    return pts;
  }, [rule]);

  const can = useCan();
  // The versions page lives under Schools (it switches partner type); marketer-only roles fall back to Marketers.
  const backTo = routeModule === 'schools' || can('schools', 'view') ? '/schools/incentive-rules' : '/marketers';

  if (q.isLoading) {
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

  if (!rule) {
    if (q.error && q.error.code !== 'NOT_FOUND') return <QueryError error={q.error} onRetry={() => q.refetch()} />;
    return (
      <Card>
        <EmptyState
          title={t('drilldown.rule.notFound')}
          action={
            <ButtonLink to={backTo} variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('drilldown.rule.back')}
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  // Marketer rules are gated by the marketers module, school rules by schools — keep the URL in the right section.
  const module = partnerModule(rule.partnerType as PartnerType);
  if (module !== routeModule) return <Navigate to={`/${module}/incentive-rules/${rule.id}`} replace />;

  const amounts = rule.tiers.map((x) => x.amount);
  const name = rule.name[lang] || rule.name.en;

  return (
    <>
      <PageHeader
        title={name}
        current={t('schools.rules.version', { version: rule.version })}
        meta={
          <>
            <StatusBadge status={rule.status} />
            <Badge tone={rule.partnerType === 'school' ? 'info' : 'purple'}>{rule.partnerType === 'school' ? t('schools.rules.partnerSchool') : t('schools.rules.partnerMarketer')}</Badge>
            <span className="text-xs text-muted">v{rule.version}</span>
          </>
        }
        actions={
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />} onClick={() => navigate(backTo)}>
            {t('drilldown.rule.back')}
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('schools.rules.threshold')} value={fmtNumber(rule.qualificationThreshold)} hint={t('drilldown.rule.thresholdHint')} icon={<Target />} color="#0B1F3A" />
        <StatCard label={t('schools.rules.tiers')} value={fmtNumber(rule.tiers.length)} icon={<Layers />} color="#7C3AED" />
        <StatCard label={t('schools.rules.period')} value={t(`schools.rules.periods.${rule.period}`)} icon={<CalendarRange />} color="#2563EB" />
        <StatCard
          label={t('drilldown.rule.rewardRange')}
          value={amounts.length ? `${fmtMoney(Math.min(...amounts), 'IQD', true)} – ${fmtMoney(Math.max(...amounts), 'IQD', true)}` : '—'}
          icon={<Trophy />}
          color="#C9A24A"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader icon={<Layers className="h-4 w-4" />} title={t('schools.rules.tiers')} subtitle={rule.status === 'draft' ? undefined : t('schools.rules.readOnlyHint')} />
            {rule.tiers.length === 0 ? (
              <EmptyState compact title={t('schools.rules.validation.minOneTier')} hint=" " />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="px-5 py-2.5 text-start font-medium">{t('schools.rules.tierLabel')}</th>
                      <th className="px-5 py-2.5 text-start font-medium">{t('drilldown.rule.studentsRange')}</th>
                      <th className="px-5 py-2.5 text-start font-medium">{t('schools.rules.rewardType')}</th>
                      <th className="px-5 py-2.5 text-end font-medium">{t('schools.rules.reward')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rule.tiers.map((tier) => (
                      <tr key={tier.id}>
                        <td className="px-5 py-3 font-medium">{tier.label || '—'}</td>
                        <td className="px-5 py-3 num" dir="ltr">
                          <span className="inline-block">
                            {fmtNumber(tier.from)} – {tier.to === null ? '∞' : fmtNumber(tier.to)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">{tier.rewardType === 'per_student' ? t('schools.rules.perStudent') : t('schools.rules.fixed')}</td>
                        <td className="px-5 py-3 text-end font-semibold num">
                          {fmtMoney(tier.amount)}
                          {tier.rewardType === 'per_student' && <span className="text-xs font-normal text-muted"> / {t('common.student')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={<LineIcon className="h-4 w-4" />} title={t('drilldown.rule.curve')} subtitle={t('drilldown.rule.curveSub')} />
            <CardBody>
              {curve.length === 0 ? (
                <EmptyState compact title={t('schools.rules.validation.minOneTier')} hint=" " />
              ) : (
                <AreaChart data={curve} xKey="students" valueFormat={(v) => fmtMoney(v, 'IQD', true)} series={[{ key: 'amount', label: t('schools.rules.computed'), color: '#C9A24A' }]} height={240} legend={false} />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<GitBranch className="h-4 w-4" />} title={t('drilldown.rule.validity')} />
            <dl className="divide-y divide-line text-sm">
              {[
                { label: t('schools.rules.effectiveFrom'), value: fmtDate(rule.effectiveFrom) },
                { label: t('schools.rules.effectiveTo'), value: rule.effectiveTo ? fmtDate(rule.effectiveTo) : t('schools.rules.openEnded') },
                { label: t('drilldown.rule.created'), value: `${rule.createdBy?.name[lang] ?? '—'} · ${fmtDateTime(rule.createdAt)}` },
                { label: t('drilldown.rule.activated'), value: rule.activatedAt ? `${rule.activatedBy?.name[lang] ?? '—'} · ${fmtDateTime(rule.activatedAt)}` : '—' },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 px-5 py-3">
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="text-end font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
            <CardBody className="border-t border-line pt-4">
              <ButtonLink to={`/${module}/settlements`} variant="ghost" size="sm" icon={<UserCheck className="h-4 w-4" />}>
                {t('drilldown.rule.viewSettlements')}
              </ButtonLink>
            </CardBody>
          </Card>
          {rule.tiers.length > 0 && <IncentiveCalculator rule={{ qualificationThreshold: rule.qualificationThreshold, tiers: rule.tiers }} />}
        </div>
      </div>
    </>
  );
}
