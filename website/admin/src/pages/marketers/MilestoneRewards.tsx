import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, ChevronDown, GitBranchPlus, History, Plus, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { isApiError, toastError } from '@/api/client';
import { qk } from '@/api/keys';
import { milestonesApi, partnerKeys, useMilestoneSets, type MilestoneItemVM } from '@/api/partners';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { fmtDate, fmtMoney, fmtNumber } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, SkeletonCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

/** Draft rows carry a local key; `id` is kept for items that already exist server-side. */
type DraftRow = MilestoneItemVM & { key: string; isNew?: boolean };

export default function MilestoneRewards() {
  const { t } = useTranslation();
  const L = useLocalize();
  const confirm = useConfirm();
  const can = useCan();
  const qc = useQueryClient();
  const setsQ = useMilestoneSets();
  const loading = setsQ.isLoading;
  const sets = useMemo(() => setsQ.data ?? [], [setsQ.data]);
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const activeSet = sets.find((s) => s.status === 'active') ?? null;
  const draftSet = sets.find((s) => s.status === 'draft') ?? null;
  const active = activeSet?.items ?? [];
  const activeVersion = activeSet?.version ?? 0;
  const draftVersion = draftSet?.version ?? null;

  // Local editable copy of the draft (saved with PUT /admin/milestone-sets/:id).
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const serverDraft = useMemo(() => (draftSet?.items ?? []).map((i) => ({ ...i, key: i.id })), [draftSet]);
  useEffect(() => setDraft(serverDraft), [serverDraft]);
  const dirty = JSON.stringify(draft.map(({ key: _k, isNew: _n, ...r }) => r)) !== JSON.stringify(serverDraft.map(({ key: _k, ...r }) => r));

  const history = useMemo(() => sets.filter((s) => s.status !== 'draft').sort((a, b) => b.version - a.version), [sets]);

  const draftInvalid =
    draft.length === 0 ||
    new Set(draft.map((d) => d.threshold)).size !== draft.length ||
    draft.some((d) => d.threshold <= 0 || d.reward <= 0 || !d.label_en.trim() || !d.label_ar.trim());

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.milestones.all }), ...partnerKeys.map((k) => qc.invalidateQueries({ queryKey: k }))]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      return true;
    } catch (e) {
      if (isApiError(e) && e.reason === 'DRAFT_EXISTS') {
        toast.error(t('marketers.milestones.draftExists'));
        await refresh();
      } else toastError(e);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const update = (key: string, patch: Partial<DraftRow>) => setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const createVersion = () =>
    run('create', async () => {
      const created = await milestonesApi.createDraft(activeSet?.id);
      await refresh();
      toast.success(t('marketers.milestones.draftCreated', { version: created.version }));
    });

  const addRow = () => {
    const top = Math.max(0, ...draft.map((d) => d.threshold));
    setDraft((rows) => [...rows, { key: uid('ms'), id: '', isNew: true, threshold: top + 10, reward: 100000, label_en: '', label_ar: '' }]);
  };

  const saveDraft = async (silent = false) => {
    if (!draftSet) return false;
    return run('save', async () => {
      await milestonesApi.saveDraft(draftSet.id, {
        items: draft.map((d) => ({ id: d.isNew || !d.id ? undefined : d.id, threshold: d.threshold, reward: d.reward, label: { en: d.label_en.trim(), ar: d.label_ar.trim() } })),
      });
      await refresh();
      if (!silent) toast.success(t('marketers.milestones.saved'));
    });
  };

  const activate = async () => {
    if (!draftSet) return;
    if (draftInvalid) {
      toast.error(t('marketers.milestones.invalid'));
      return;
    }
    const ok = await confirm({ title: t('marketers.milestones.activateTitle', { version: draftVersion }), body: t('marketers.milestones.activateBody'), tone: 'primary', confirmText: t('actions.confirm') });
    if (!ok) return;
    if (dirty && !(await saveDraft(true))) return;
    await run('activate', async () => {
      await milestonesApi.activate(draftSet.id);
      await refresh();
      toast.success(t('marketers.milestones.activated', { version: draftVersion }));
    });
  };

  const deleteDraft = async () => {
    if (!draftSet) return;
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: t('marketers.milestones.draftSet', { version: draftVersion }) }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    await run('delete', async () => {
      await milestonesApi.remove(draftSet.id);
      await refresh();
      toast.success(t('toast.deleted', { entity: `v${draftVersion}` }));
    });
  };

  const canEdit = can('marketers', 'edit');

  return (
    <>
      <PageHeader
        title={t('marketers.milestones.title')}
        subtitle={t('marketers.milestones.subtitle')}
        actions={
          canEdit &&
          !loading &&
          draftVersion === null && (
            <Button icon={<GitBranchPlus className="h-4 w-4" />} loading={busy === 'create'} onClick={createVersion}>
              {t('marketers.milestones.newVersion')}
            </Button>
          )
        }
      />

      {setsQ.error && !setsQ.data ? (
        <QueryError error={setsQ.error} onRetry={() => setsQ.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {loading ? (
              <SkeletonCard lines={6} />
            ) : (
              <Card>
                <CardHeader
                  icon={<Award className="h-4 w-4" />}
                  title={t('marketers.milestones.activeSet')}
                  subtitle={activeSet ? `v${activeVersion} · ${t('marketers.milestones.effective', { date: fmtDate(activeSet.effectiveFrom) })}` : undefined}
                  action={<StatusBadge status="active" />}
                />
                <CardBody>
                  {active.length === 0 ? (
                    <EmptyState compact />
                  ) : (
                    <div className="grid gap-4 md:grid-cols-3">
                      {active.map((m, i) => {
                        const reached = activeSet?.reachedBy[m.id] ?? [];
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
                                        <Avatar name={x.name_en} src={x.avatarUrl} size="sm" />
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

            {draftSet && (
              <Card className="border-warning/40">
                <CardHeader
                  title={t('marketers.milestones.draftSet', { version: draftVersion })}
                  subtitle={t('marketers.milestones.milestonesCount', { count: draft.length })}
                  action={
                    <span className="flex items-center gap-2">
                      {dirty && <Badge tone="warning">{t('common.unsavedChanges')}</Badge>}
                      <StatusBadge status="draft" />
                    </span>
                  }
                />
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
                          <tr key={d.key} className="border-t border-line">
                            <td className="py-2 pe-2">
                              <Input type="number" min={1} disabled={!canEdit} value={d.threshold} aria-label={t('marketers.milestones.threshold')} className="h-9 w-24" onChange={(e) => update(d.key, { threshold: Number(e.target.value) || 0 })} />
                            </td>
                            <td className="py-2 pe-2">
                              <Input type="number" min={0} step={5000} disabled={!canEdit} value={d.reward} suffix="IQD" aria-label={t('marketers.milestones.reward')} className="w-40 [&_input]:h-9" onChange={(e) => update(d.key, { reward: Number(e.target.value) || 0 })} />
                            </td>
                            <td className="py-2 pe-2">
                              <Input disabled={!canEdit} value={d.label_en} aria-label={t('marketers.milestones.labelEn')} className="h-9" onChange={(e) => update(d.key, { label_en: e.target.value })} />
                            </td>
                            <td className="py-2 pe-2">
                              <Input disabled={!canEdit} dir="rtl" value={d.label_ar} aria-label={t('marketers.milestones.labelAr')} className="h-9" onChange={(e) => update(d.key, { label_ar: e.target.value })} />
                            </td>
                            <td className="py-2">
                              {canEdit && (
                                <button
                                  type="button"
                                  disabled={draft.length <= 1}
                                  onClick={() => setDraft((rows) => rows.filter((r) => r.key !== d.key))}
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
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" icon={<Trash2 className="h-4 w-4" />} loading={busy === 'delete'} onClick={deleteDraft}>
                          {t('marketers.milestones.deleteDraft')}
                        </Button>
                        <Button size="sm" variant="secondary" icon={<Save className="h-4 w-4" />} disabled={!dirty || draftInvalid} loading={busy === 'save'} onClick={() => saveDraft()}>
                          {t('actions.saveDraft')}
                        </Button>
                        {can('marketers', 'approve') && (
                          <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} disabled={draftInvalid} loading={busy === 'activate'} onClick={activate}>
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
            ) : history.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t('marketers.milestones.noHistory')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((set) => {
                  const open = openVersion === set.version;
                  return (
                    <li key={set.id}>
                      <button onClick={() => setOpenVersion(open ? null : set.version)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3.5 text-start transition hover:bg-ink/[0.03]">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{t('marketers.milestones.version', { version: set.version })}</div>
                          <div className="text-xs text-muted">
                            {t('marketers.milestones.effective', { date: fmtDate(set.effectiveFrom) })} · {t('marketers.milestones.milestonesCount', { count: set.items.length })}
                          </div>
                        </div>
                        <StatusBadge status={set.status} />
                        <ChevronDown className={cn('h-4 w-4 text-muted transition', open && 'rotate-180')} />
                      </button>
                      {open && (
                        <ul className="space-y-1.5 bg-surface-2 px-5 py-3">
                          {set.items.map((r) => (
                            <li key={r.id} className="flex items-center justify-between text-xs">
                              <span>
                                <span className="font-medium text-ink">{L(r, 'label')}</span> <span className="text-muted num">· {fmtNumber(r.threshold)}</span>
                              </span>
                              <span className="font-semibold num">{fmtMoney(r.reward)}</span>
                            </li>
                          ))}
                          {set.createdBy && <li className="pt-1 text-[11px] text-muted">{t('schools.rules.createdBy', { name: set.createdBy })}</li>}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
