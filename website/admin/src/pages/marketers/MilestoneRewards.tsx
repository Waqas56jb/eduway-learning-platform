import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, ChevronDown, GitBranchPlus, History, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { MilestoneRule } from '@/types';
import { useMarketers } from '@/store/core';
import { useMilestoneRules } from '@/store/partners';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, SkeletonCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';

export default function MilestoneRewards() {
  const { t } = useTranslation();
  const L = useLocalize();
  const confirm = useConfirm();
  const can = useCan();
  const loading = useMockLoading();
  const rules = useMilestoneRules((s) => s.items);
  const add = useMilestoneRules((s) => s.add);
  const update = useMilestoneRules((s) => s.update);
  const updateMany = useMilestoneRules((s) => s.updateMany);
  const removeMany = useMilestoneRules((s) => s.removeMany);
  const remove = useMilestoneRules((s) => s.remove);
  const marketers = useMarketers((s) => s.items);
  const updateMarketer = useMarketers((s) => s.update);
  const [openVersion, setOpenVersion] = useState<number | null>(null);

  const byStatus = (st: MilestoneRule['status']) => rules.filter((r) => r.status === st).sort((a, b) => a.threshold - b.threshold);
  const active = byStatus('active');
  const draft = byStatus('draft');
  const activeVersion = active[0]?.version ?? 0;
  const draftVersion = draft[0]?.version ?? null;
  const maxVersion = Math.max(0, ...rules.map((r) => r.version));

  const history = useMemo(() => {
    const map = new Map<number, MilestoneRule[]>();
    rules.filter((r) => r.status !== 'draft').forEach((r) => map.set(r.version, [...(map.get(r.version) ?? []), r]));
    return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([version, rows]) => ({ version, rows: rows.sort((a, b) => a.threshold - b.threshold) }));
  }, [rules]);

  const draftInvalid =
    draft.length === 0 ||
    new Set(draft.map((d) => d.threshold)).size !== draft.length ||
    draft.some((d) => d.threshold <= 0 || d.reward <= 0 || !d.label_en.trim() || !d.label_ar.trim());

  const createVersion = () => {
    const version = maxVersion + 1;
    const from = new Date(Date.now() + 86_400_000).toISOString();
    const rows = active.length ? active : [{ threshold: 5, reward: 50000, label_en: 'First Five', label_ar: 'الخمسة الأوائل' } as MilestoneRule];
    rows.forEach((r, i) =>
      add(
        { id: uid('ms'), version, threshold: r.threshold, reward: r.reward, label_en: r.label_en, label_ar: r.label_ar, status: 'draft', effectiveFrom: from },
        i === 0 ? { action: 'milestone_rule.create_version', summary: `Created milestone set v${version} (draft) from v${activeVersion}` } : { silent: true },
      ),
    );
    toast.success(t('marketers.milestones.draftCreated', { version }));
  };

  const addRow = () => {
    if (draftVersion === null) return;
    const top = Math.max(0, ...draft.map((d) => d.threshold));
    add({ id: uid('ms'), version: draftVersion, threshold: top + 10, reward: 100000, label_en: '', label_ar: '', status: 'draft', effectiveFrom: draft[0].effectiveFrom }, { silent: true });
  };

  const activate = async () => {
    if (draftVersion === null) return;
    if (draftInvalid) {
      toast.error(t('marketers.milestones.invalid'));
      return;
    }
    const ok = await confirm({ title: t('marketers.milestones.activateTitle', { version: draftVersion }), body: t('marketers.milestones.activateBody'), tone: 'primary', confirmText: t('actions.confirm') });
    if (!ok) return;
    if (active.length) updateMany(active.map((r) => r.id), { status: 'superseded' }, { action: 'milestone_rule.supersede', summary: `Milestone set v${activeVersion} superseded` });
    updateMany(draft.map((r) => r.id), { status: 'active', effectiveFrom: new Date().toISOString() }, { action: 'milestone_rule.activate', summary: `Activated milestone set v${draftVersion} (${draft.length} milestones)` });
    // Re-measure marketers against the new thresholds.
    marketers.forEach((m) => updateMarketer(m.id, { milestonesHit: draft.filter((d) => m.paidStudents >= d.threshold).length }, { silent: true }));
    toast.success(t('marketers.milestones.activated', { version: draftVersion }));
  };

  const deleteDraft = async () => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: t('marketers.milestones.draftSet', { version: draftVersion }) }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    removeMany(draft.map((d) => d.id), { action: 'milestone_rule.delete_draft', summary: `Deleted milestone draft v${draftVersion}` });
    toast.success(t('toast.deleted', { entity: `v${draftVersion}` }));
  };

  const canEdit = can('marketers', 'edit');

  return (
    <>
      <PageHeader
        title={t('marketers.milestones.title')}
        subtitle={t('marketers.milestones.subtitle')}
        actions={
          canEdit &&
          draftVersion === null && (
            <Button icon={<GitBranchPlus className="h-4 w-4" />} onClick={createVersion}>
              {t('marketers.milestones.newVersion')}
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {loading ? (
            <SkeletonCard lines={6} />
          ) : (
            <Card>
              <CardHeader
                icon={<Award className="h-4 w-4" />}
                title={t('marketers.milestones.activeSet')}
                subtitle={active[0] ? `v${activeVersion} · ${t('marketers.milestones.effective', { date: fmtDate(active[0].effectiveFrom) })}` : undefined}
                action={<StatusBadge status="active" />}
              />
              <CardBody>
                {active.length === 0 ? (
                  <EmptyState compact />
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    {active.map((m, i) => {
                      const reached = marketers.filter((x) => x.paidStudents >= m.threshold);
                      return (
                        <div key={m.id} className="relative overflow-hidden rounded-xl border border-line p-4">
                          <div className="absolute -end-6 -top-6 h-20 w-20 rounded-full bg-accent/10" aria-hidden />
                          <Badge tone="accent">#{i + 1}</Badge>
                          <div className="mt-3 text-sm font-semibold">{L(m, 'label')}</div>
                          <div className="kpi-num mt-1 text-2xl text-primary">{fmtMoney(m.reward, 'IQD', true)}</div>
                          <div className="text-xs text-muted">
                            {t('marketers.milestones.threshold')}: <span className="font-semibold text-ink num">{fmtNumber(m.threshold)}</span>
                          </div>
                          <div className="mt-4 border-t border-line pt-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('marketers.milestones.reachedBy')}</div>
                            {reached.length === 0 ? (
                              <span className="text-xs text-muted">{t('marketers.milestones.nobody')}</span>
                            ) : (
                              <div className="flex -space-x-2 rtl:space-x-reverse">
                                {reached.map((x) => (
                                  <Tooltip key={x.id} content={L(x, 'name')}>
                                    <Link to={`/marketers/${x.id}`} aria-label={L(x, 'name')}>
                                      <Avatar name={x.name_en} src={x.avatar} size="sm" />
                                    </Link>
                                  </Tooltip>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {draftVersion !== null && (
            <Card className="border-warning/40">
              <CardHeader title={t('marketers.milestones.draftSet', { version: draftVersion })} subtitle={t('marketers.milestones.milestonesCount', { count: draft.length })} action={<StatusBadge status="draft" />} />
              <CardBody className="space-y-3">
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <tr>
                        <th className="pb-2 text-start">{t('marketers.milestones.threshold')}</th>
                        <th className="pb-2 text-start">{t('marketers.milestones.reward')}</th>
                        <th className="pb-2 text-start">{t('marketers.milestones.labelEn')}</th>
                        <th className="pb-2 text-start">{t('marketers.milestones.labelAr')}</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.map((d) => (
                        <tr key={d.id} className="border-t border-line">
                          <td className="py-2 pe-2">
                            <Input type="number" min={1} disabled={!canEdit} value={d.threshold} aria-label={t('marketers.milestones.threshold')} className="h-9 w-24" onChange={(e) => update(d.id, { threshold: Number(e.target.value) || 0 }, { silent: true })} />
                          </td>
                          <td className="py-2 pe-2">
                            <Input type="number" min={0} step={5000} disabled={!canEdit} value={d.reward} suffix="IQD" aria-label={t('marketers.milestones.reward')} className="w-40 [&_input]:h-9" onChange={(e) => update(d.id, { reward: Number(e.target.value) || 0 }, { silent: true })} />
                          </td>
                          <td className="py-2 pe-2">
                            <Input disabled={!canEdit} value={d.label_en} aria-label={t('marketers.milestones.labelEn')} className="h-9" onChange={(e) => update(d.id, { label_en: e.target.value }, { silent: true })} />
                          </td>
                          <td className="py-2 pe-2">
                            <Input disabled={!canEdit} dir="rtl" value={d.label_ar} aria-label={t('marketers.milestones.labelAr')} className="h-9" onChange={(e) => update(d.id, { label_ar: e.target.value }, { silent: true })} />
                          </td>
                          <td className="py-2">
                            {canEdit && (
                              <button
                                type="button"
                                disabled={draft.length <= 1}
                                onClick={() => remove(d.id, { silent: true })}
                                className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                                aria-label={t('marketers.milestones.remove')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {draftInvalid && <p className="text-xs font-medium text-danger">{t('marketers.milestones.invalid')}</p>}
                {canEdit && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addRow}>
                      {t('marketers.milestones.addMilestone')}
                    </Button>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" icon={<Trash2 className="h-4 w-4" />} onClick={deleteDraft}>
                        {t('marketers.milestones.deleteDraft')}
                      </Button>
                      {can('marketers', 'approve') && (
                        <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} disabled={draftInvalid} onClick={activate}>
                          {t('marketers.milestones.activate', { version: draftVersion })}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="self-start overflow-hidden">
          <CardHeader icon={<History className="h-4 w-4" />} title={t('marketers.milestones.history')} />
          {loading ? (
            <div className="p-4">
              <SkeletonCard lines={2} />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {history.map(({ version, rows }) => {
                const open = openVersion === version;
                return (
                  <li key={version}>
                    <button onClick={() => setOpenVersion(open ? null : version)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3.5 text-start transition hover:bg-ink/[0.03]">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{t('marketers.milestones.version', { version })}</div>
                        <div className="text-xs text-muted">
                          {t('marketers.milestones.effective', { date: fmtDate(rows[0].effectiveFrom) })} · {t('marketers.milestones.milestonesCount', { count: rows.length })}
                        </div>
                      </div>
                      <StatusBadge status={rows[0].status} />
                      <ChevronDown className={cn('h-4 w-4 text-muted transition', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <ul className="space-y-1.5 bg-surface-2 px-5 py-3">
                        {rows.map((r) => (
                          <li key={r.id} className="flex items-center justify-between text-xs">
                            <span>
                              <span className="font-medium text-ink">{L(r, 'label')}</span> <span className="text-muted num">· {fmtNumber(r.threshold)}</span>
                            </span>
                            <span className="font-semibold num">{fmtMoney(r.reward)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
