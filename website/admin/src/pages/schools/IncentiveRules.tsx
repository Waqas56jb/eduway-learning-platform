import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GitBranchPlus, History, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { IncentiveRule } from '@/types';
import { useIncentiveRules } from '@/store/partners';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { fmtDate, fmtMoney } from '@/utils/format';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { IncentiveRuleForm, useTierValidator } from '@/components/forms/IncentiveRuleForm';
import { Button, Card, CardHeader, Segmented, SkeletonCard, StatusBadge, useConfirm } from '@/components/ui';

type Partner = IncentiveRule['partnerType'];

export default function IncentiveRules() {
  const { t } = useTranslation();
  const L = useLocalize();
  const confirm = useConfirm();
  const can = useCan();
  const admin = useCurrentAdmin();
  const loading = useMockLoading();
  const rules = useIncentiveRules((s) => s.items);
  const add = useIncentiveRules((s) => s.add);
  const update = useIncentiveRules((s) => s.update);
  const remove = useIncentiveRules((s) => s.remove);
  const validateTiers = useTierValidator();

  const [partner, setPartner] = useState<Partner>('school');
  const module = partner === 'school' ? 'schools' : 'marketers';
  const versions = useMemo(() => rules.filter((r) => r.partnerType === partner).sort((a, b) => b.version - a.version), [rules, partner]);
  const active = versions.find((r) => r.status === 'active');
  const draft = versions.find((r) => r.status === 'draft');
  const [selectedId, setSelectedId] = useState<string | undefined>(active?.id);

  useEffect(() => {
    setSelectedId((cur) => (versions.some((v) => v.id === cur) ? cur : (active?.id ?? versions[0]?.id)));
  }, [versions, active?.id]);

  const selected = versions.find((v) => v.id === selectedId);

  const createVersion = () => {
    if (draft) {
      toast.error(t('schools.rules.draftExists'));
      setSelectedId(draft.id);
      return;
    }
    const base = active ?? versions[0];
    if (!base) return;
    const version = Math.max(...versions.map((v) => v.version)) + 1;
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const next: IncentiveRule = {
      ...base,
      id: uid('inc'),
      version,
      status: 'draft',
      effectiveFrom: tomorrow,
      effectiveTo: null,
      tiers: base.tiers.map((x) => ({ ...x, id: uid('tier') })),
      createdBy: admin?.name ?? 'Admin',
      createdAt: new Date().toISOString(),
    };
    add(next, { action: 'incentive_rule.create_version', summary: `Created ${base.name_en} v${version} (draft) from v${base.version}` });
    setSelectedId(next.id);
    toast.success(t('schools.rules.draftCreated', { version }));
  };

  const activate = async (rule: IncentiveRule) => {
    const problems = validateTiers(rule.tiers, rule.qualificationThreshold);
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    const ok = await confirm({ title: t('schools.rules.activateTitle', { version: rule.version }), body: t('schools.rules.activateBody'), tone: 'primary', confirmText: t('schools.rules.activate') });
    if (!ok) return;
    if (active) {
      const end = new Date(new Date(rule.effectiveFrom).getTime() - 86_400_000).toISOString();
      update(active.id, { status: 'superseded', effectiveTo: end }, { action: 'incentive_rule.supersede', summary: `${active.name_en} v${active.version} superseded by v${rule.version}` });
    }
    update(rule.id, { status: 'active' }, { action: 'incentive_rule.activate', summary: `Activated ${rule.name_en} v${rule.version}` });
    toast.success(t('schools.rules.activated', { version: rule.version }));
  };

  const deleteDraft = async (rule: IncentiveRule) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: `v${rule.version}` }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    remove(rule.id);
    toast.success(t('toast.deleted', { entity: `v${rule.version}` }));
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
              <Button icon={<GitBranchPlus className="h-4 w-4" />} onClick={createVersion}>
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
                        v.status === 'active' ? 'bg-success' : v.status === 'draft' ? 'bg-warning' : 'bg-ink/20',
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
                        {v.tiers.length} · {fmtMoney(Math.min(...v.tiers.map((x) => x.amount)), 'IQD', true)}–{fmtMoney(Math.max(...v.tiers.map((x) => x.amount)), 'IQD', true)}
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
          {loading || !selected ? (
            <SkeletonCard lines={8} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{L(selected, 'name')}</h2>
                <span className="text-sm text-muted">v{selected.version}</span>
                <StatusBadge status={selected.status} />
              </div>
              <IncentiveRuleForm
                rule={selected}
                readOnly={!editable}
                onSave={(patch) => {
                  update(selected.id, patch, { action: 'incentive_rule.update_draft', summary: `Edited draft ${selected.name_en} v${selected.version}` });
                  toast.success(t('schools.rules.saved'));
                }}
                actions={
                  selected.status === 'draft' && (
                    <>
                      {can(module, 'delete') && (
                        <Button variant="ghost" className="text-danger hover:bg-danger/10" icon={<Trash2 className="h-4 w-4" />} onClick={() => deleteDraft(selected)}>
                          {t('schools.rules.deleteDraft')}
                        </Button>
                      )}
                      {can(module, 'approve') && (
                        <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => activate(selected)}>
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
