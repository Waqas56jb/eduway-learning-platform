import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, GitBranchPlus, History, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError, toastError } from '@/api/client';
import { qk } from '@/api/keys';
import { incentiveApi, partnerKeys, useIncentiveRules, type IncentiveRuleVM, type PartnerType } from '@/api/partners';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDate, fmtMoney } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { IncentiveRuleForm, useTierValidator } from '@/components/forms/IncentiveRuleForm';
import { Button, ButtonLink, Card, CardHeader, Segmented, SkeletonCard, StatusBadge, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

type Partner = PartnerType;

export default function IncentiveRules() {
  const { t } = useTranslation();
  const L = useLocalize();
  const confirm = useConfirm();
  const can = useCan();
  const qc = useQueryClient();
  const validateTiers = useTierValidator();

  const [partner, setPartner] = useState<Partner>('school');
  const module = partner === 'school' ? 'schools' : 'marketers';
  const rulesQ = useIncentiveRules(partner);
  const loading = rulesQ.isLoading;
  const versions = useMemo(() => [...(rulesQ.data ?? [])].sort((a, b) => b.version - a.version), [rulesQ.data]);
  const active = versions.find((r) => r.status === 'active');
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.incentiveRules.all }), ...partnerKeys.map((k) => qc.invalidateQueries({ queryKey: k }))]);
  const draft = versions.find((r) => r.status === 'draft');
  const [selectedId, setSelectedId] = useState<string | undefined>(active?.id);

  useEffect(() => {
    setSelectedId((cur) => (versions.some((v) => v.id === cur) ? cur : (active?.id ?? versions[0]?.id)));
  }, [versions, active?.id]);

  const selected = versions.find((v) => v.id === selectedId);

  const createVersion = async () => {
    if (draft) {
      toast.error(t('schools.rules.draftExists'));
      setSelectedId(draft.id);
      return;
    }
    setBusy('create');
    try {
      const created = await incentiveApi.createVersion(partner, (active ?? versions[0])?.id);
      await refresh();
      setSelectedId(created.id);
      toast.success(t('schools.rules.draftCreated', { version: created.version }));
    } catch (e) {
      if (isApiError(e) && e.reason === 'DRAFT_EXISTS') {
        toast.error(t('schools.rules.draftExists'));
        await refresh();
        const id = e.details.draftId as string | undefined;
        if (id) setSelectedId(id);
      } else toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const activate = async (rule: IncentiveRuleVM) => {
    const problems = validateTiers(rule.tiers, rule.qualificationThreshold);
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    const future = new Date(rule.effectiveFrom).getTime() > Date.now();
    const ok = await confirm({
      title: t('schools.rules.activateTitle', { version: rule.version }),
      body: future ? t('schools.rules.scheduleBody', { date: fmtDate(rule.effectiveFrom) }) : t('schools.rules.activateBody'),
      tone: 'primary',
      confirmText: t('schools.rules.activate'),
    });
    if (!ok) return;
    setBusy('activate');
    try {
      const r = await incentiveApi.activate(rule.id);
      await refresh();
      if (r.activated.status === 'scheduled') toast.success(t('schools.rules.scheduled', { version: rule.version, date: fmtDate(r.activated.effectiveFrom) }));
      else toast.success(t('schools.rules.activated', { version: rule.version }));
    } catch (e) {
      const issues = isApiError(e) && e.reason === 'TIERS_INVALID' ? (e.details.issues as string[] | undefined) : undefined;
      if (issues?.length) toast.error(issues.join(' · '));
      else toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const deleteDraft = async (rule: IncentiveRuleVM) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: `v${rule.version}` }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    setBusy('delete');
    try {
      await incentiveApi.remove(rule.id);
      await refresh();
      toast.success(t('toast.deleted', { entity: `v${rule.version}` }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async (rule: IncentiveRuleVM, patch: Partial<IncentiveRuleVM>) => {
    try {
      await incentiveApi.update(rule.id, {
        name: patch.name_en !== undefined ? { en: patch.name_en, ar: patch.name_ar ?? rule.name_ar } : undefined,
        qualificationThreshold: patch.qualificationThreshold,
        period: patch.period,
        effectiveFrom: patch.effectiveFrom,
        effectiveTo: patch.effectiveTo,
        tiers: patch.tiers?.map(({ id: _id, ...x }) => x),
      });
      await refresh();
      toast.success(t('schools.rules.saved'));
      return true;
    } catch (e) {
      const issues = isApiError(e) && e.reason === 'TIERS_INVALID' ? (e.details.issues as string[] | undefined) : undefined;
      if (issues?.length) toast.error(issues.join(' · '));
      else toastError(e);
      return false;
    }
  };

  const editable = selected?.status === 'draft' && can(module, 'edit');

  return (
    <>
      <PageHeader
        title={t('schools.rules.title')}
        subtitle={t('schools.rules.subtitle')}
        actions={
          <>
            <Segmented
              aria-label={t('schools.rules.partnerType')}
              value={partner}
              onChange={setPartner}
              options={[
                { value: 'school', label: t('schools.rules.partnerSchool') },
                { value: 'marketer', label: t('schools.rules.partnerMarketer') },
              ]}
            />
            {can(module, 'edit') && (
              <Button icon={<GitBranchPlus className="h-4 w-4" />} loading={busy === 'create'} onClick={createVersion}>
                {t('schools.rules.newVersion')}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="self-start overflow-hidden">
          <CardHeader icon={<History className="h-4 w-4" />} title={t('schools.rules.history')} />
          {loading ? (
            <div className="space-y-3 p-4">
              <SkeletonCard lines={1} />
              <SkeletonCard lines={1} />
            </div>
          ) : rulesQ.error ? (
            <QueryError compact error={rulesQ.error} onRetry={() => rulesQ.refetch()} />
          ) : versions.length === 0 ? (
            <p className="p-5 text-sm text-muted">{t('schools.rules.noVersions')}</p>
          ) : (
            <ol className="relative p-4">
              {versions.map((v, i) => {
                const on = v.id === selectedId;
                return (
                  <li key={v.id} className="relative ps-7">
                    {i < versions.length - 1 && <span className="absolute start-[9px] top-6 h-[calc(100%-12px)] w-px bg-line" aria-hidden />}
                    <span
                      className={cn(
                        'absolute start-0 top-3 grid h-[19px] w-[19px] place-items-center rounded-full ring-4 ring-surface',
                        v.status === 'active' ? 'bg-success' : v.status === 'draft' ? 'bg-warning' : v.status === 'scheduled' ? 'bg-info' : 'bg-ink/20',
                      )}
                      aria-hidden
                    >
                      {v.status === 'active' && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </span>
                    <button
                      onClick={() => setSelectedId(v.id)}
                      aria-current={on ? 'true' : undefined}
                      className={cn('mb-3 w-full rounded-lg border p-3 text-start transition', on ? 'border-accent bg-accent/[0.06] shadow-sm' : 'border-line hover:border-accent/50')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{t('schools.rules.version', { version: v.version })}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {fmtDate(v.effectiveFrom)} → {v.effectiveTo ? fmtDate(v.effectiveTo) : t('schools.rules.openEnded')}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {v.tiers.length} · {v.tiers.length ? `${fmtMoney(Math.min(...v.tiers.map((x) => x.amount)), 'IQD', true)}–${fmtMoney(Math.max(...v.tiers.map((x) => x.amount)), 'IQD', true)}` : '—'}
                      </div>
                      <div className="mt-1 text-[11px] text-muted/80">{t('schools.rules.createdBy', { name: v.createdBy })}</div>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <div className="min-w-0 space-y-3">
          {loading || (!selected && versions.length > 0) ? (
            <SkeletonCard lines={8} />
          ) : !selected ? (
            <Card>
              <p className="p-6 text-sm text-muted">{t('schools.rules.noVersions')}</p>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{L(selected, 'name')}</h2>
                <span className="text-sm text-muted">v{selected.version}</span>
                <StatusBadge status={selected.status} />
                <ButtonLink to={`/${module}/incentive-rules/${selected.id}`} variant="ghost" size="sm" icon={<Eye className="h-4 w-4" />} className="ms-auto">
                  {t('drilldown.rule.open')}
                </ButtonLink>
              </div>
              <IncentiveRuleForm
                rule={selected}
                readOnly={!editable}
                onSave={(patch) => saveDraft(selected, patch)}
                actions={
                  selected.status === 'draft' && (
                    <>
                      {can(module, 'delete') && (
                        <Button variant="ghost" className="text-danger hover:bg-danger/10" icon={<Trash2 className="h-4 w-4" />} loading={busy === 'delete'} onClick={() => deleteDraft(selected)}>
                          {t('schools.rules.deleteDraft')}
                        </Button>
                      )}
                      {can(module, 'approve') && (
                        <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} loading={busy === 'activate'} onClick={() => activate(selected)}>

                          {t('schools.rules.activate')}
                        </Button>
                      )}
                    </>
                  )
                }
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
