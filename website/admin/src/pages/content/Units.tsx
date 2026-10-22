import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, FolderTree, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/utils/cn';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { errorMessage, isApiError, toastError } from '@/api/client';
import { qk } from '@/api/keys';
import { curriculumKeys, topicsApi, unitsApi, useSubjectsQuery, useUnitsQuery, type TopicVM, type UnitVM } from '@/api/content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, EmptyState, Field, Input, Modal, Skeleton, Tabs, useConfirm } from '@/components/ui';

/* ─── Sortable row shell ─────────────────────────────────────────────────── */

function SortableRow({ id, label, disabled, children }: { id: string; label: string; disabled?: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={t('content.units.dragHandle', { name: label })}
      className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded text-muted transition hover:bg-ink/5 hover:text-ink active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-20 opacity-90 [&>*]:shadow-lift [&>*]:ring-2 [&>*]:ring-accent/40')}
    >
      {children(handle)}
    </div>
  );
}

/** Order number input that commits on blur / Enter. */
function OrderInput({ value, max, onCommit, disabled, label }: { value: number; max: number; onCommit: (n: number) => void; disabled?: boolean; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.min(max, Math.max(1, Math.round(Number(draft) || value)));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      min={1}
      max={max}
      value={draft}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className="h-8 w-12 shrink-0 rounded-md border border-line bg-surface text-center text-xs font-semibold text-ink num focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
    />
  );
}

/* ─── Name modal (unit / topic) ─────────────────────────────────────────── */

interface NameModalState {
  kind: 'unit' | 'topic';
  id: string | null;
  parentId: string; // subjectId for unit, unitId for topic
  name_en: string;
  name_ar: string;
}

function NameModal({ state, onClose }: { state: NameModalState | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [en, setEn] = useState('');
  const [ar, setAr] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (state) {
      setEn(state.name_en);
      setAr(state.name_ar);
      setTouched(false);
    }
  }, [state]);

  const save = async () => {
    setTouched(true);
    if (!state || en.trim().length < 2 || ar.trim().length < 2 || saving) return;
    const name = { en: en.trim(), ar: ar.trim() };
    setSaving(true);
    try {
      if (state.kind === 'unit') {
        if (state.id) await unitsApi.update(state.id, name);
        else await unitsApi.create(state.parentId, name);
      } else {
        if (state.id) await topicsApi.update(state.id, name);
        else await topicsApi.create(state.parentId, name);
      }
      await Promise.all(curriculumKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
      toast.success(state.id ? t('toast.updated', { entity: en.trim() }) : t('toast.created', { entity: en.trim() }));
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const title = state
    ? state.kind === 'unit'
      ? state.id ? t('content.units.editUnit') : t('content.units.addUnit')
      : state.id ? t('content.units.editTopic') : t('content.units.addTopic')
    : '';

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={save} loading={saving}>{state?.id ? t('actions.saveChanges') : t('actions.create')}</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('common.nameEn')} required htmlFor="nm-en" error={touched && en.trim().length < 2 ? t('errors.required') : undefined}>
          <Input id="nm-en" value={en} onChange={(e) => setEn(e.target.value)} invalid={touched && en.trim().length < 2} />
        </Field>
        <Field label={t('common.nameAr')} required htmlFor="nm-ar" error={touched && ar.trim().length < 2 ? t('errors.required') : undefined}>
          <Input id="nm-ar" dir="rtl" value={ar} onChange={(e) => setAr(e.target.value)} invalid={touched && ar.trim().length < 2} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

/** Reassign 1..n order within a group (optimistic, before the server confirms). */
function applyOrder<T extends { id: string; order: number }>(all: T[], groupIds: string[]): T[] {
  const pos = new Map(groupIds.map((id, i) => [id, i + 1]));
  return all.map((x) => (pos.has(x.id) ? { ...x, order: pos.get(x.id)! } : x)).sort((a, b) => a.order - b.order);
}

export default function Units() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const location = useLocation();
  const qc = useQueryClient();
  const subjectsQ = useSubjectsQuery();
  const subjects = useMemo(() => subjectsQ.data ?? [], [subjectsQ.data]);
  const editable = can('content', 'edit');

  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.order - b.order), [subjects]);
  const initialSubject = (location.state as { subjectId?: string } | null)?.subjectId;
  const [picked, setSubjectId] = useState(initialSubject ?? '');
  const subjectId = picked || sortedSubjects[0]?.id || '';
  const unitsQ = useUnitsQuery(subjectId);
  const unitsKey = qk.units.list({ subjectId });
  const subjectUnits = useMemo(() => unitsQ.data ?? [], [unitsQ.data]);
  const loading = subjectsQ.isLoading || (!!subjectId && unitsQ.isLoading);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const seen = useMemo(() => new Set<string>(), []);
  useEffect(() => {
    // Expand newly loaded units by default.
    const fresh = subjectUnits.filter((u) => !seen.has(u.id));
    if (!fresh.length) return;
    fresh.forEach((u) => seen.add(u.id));
    setExpanded((e) => new Set([...e, ...fresh.map((u) => u.id)]));
  }, [subjectUnits, seen]);
  const [modal, setModal] = useState<NameModalState | null>(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const topicsOf = (unitId: string): TopicVM[] => subjectUnits.find((u) => u.id === unitId)?.topics ?? [];

  const refresh = () => Promise.all(curriculumKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
  /** Optimistically write the new unit list into the cache; roll back on failure. */
  const optimistic = async (next: UnitVM[], call: () => Promise<unknown>) => {
    const prev = qc.getQueryData<UnitVM[]>(unitsKey);
    qc.setQueryData(unitsKey, next);
    try {
      await call();
      toast.success(t('content.units.reordered'));
    } catch (e) {
      qc.setQueryData(unitsKey, prev);
      toastError(e);
    } finally {
      refresh();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderUnits = (ids: string[], movedId: string) =>
    optimistic(applyOrder(subjectUnits, ids), () => unitsApi.reorder(subjectId, ids, movedId));
  const reorderTopics = (unit: UnitVM, ids: string[], movedId: string) =>
    optimistic(
      subjectUnits.map((u) => (u.id === unit.id ? { ...u, topics: applyOrder(u.topics, ids) } : u)),
      () => topicsApi.reorder(unit.id, ids, movedId),
    );

  const onUnitDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = subjectUnits.map((u) => u.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    reorderUnits(next, String(e.active.id));
  };

  const moveUnitTo = (u: UnitVM, pos: number) => {
    const ids = subjectUnits.map((x) => x.id);
    reorderUnits(arrayMove(ids, ids.indexOf(u.id), pos - 1), u.id);
  };
  const moveTopicTo = (unit: UnitVM, topic: TopicVM, pos: number) => {
    const ids = topicsOf(unit.id).map((x) => x.id);
    reorderTopics(unit, arrayMove(ids, ids.indexOf(topic.id), pos - 1), topic.id);
  };

  const remove = async (call: () => Promise<unknown>, name: string) => {
    try {
      await call();
      toast.success(t('toast.deleted', { entity: name }));
    } catch (e) {
      const count = isApiError(e) ? Number(e.details.count ?? 0) : 0;
      toast.error(isApiError(e) && e.reason === 'HAS_DEPENDENTS' ? t('content.units.deleteBlocked', { count }) : errorMessage(e));
    } finally {
      refresh();
    }
  };

  const deleteUnit = async (u: UnitVM) => {
    if (u.lessonCount) {
      toast.error(t('content.units.deleteBlocked', { count: u.lessonCount }));
      return;
    }
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(u, 'name') }), body: t('content.units.deleteUnitBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    remove(() => unitsApi.remove(u.id), L(u, 'name'));
  };

  const deleteTopic = async (_unit: UnitVM, tp: TopicVM) => {
    if (tp.lessonCount) {
      toast.error(t('content.units.deleteBlocked', { count: tp.lessonCount }));
      return;
    }
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: L(tp, 'name') }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    remove(() => topicsApi.remove(tp.id), L(tp, 'name'));
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOpen = subjectUnits.every((u) => expanded.has(u.id));

  return (
    <div>
      <PageHeader
        title={t('content.units.title')}
        subtitle={t('content.units.subtitle')}
        actions={
          can('content', 'create') &&
          subject && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ kind: 'unit', id: null, parentId: subject.id, name_en: '', name_ar: '' })}>
              {t('content.units.addUnit')}
            </Button>
          )
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-3">
          <Tabs
            tabs={sortedSubjects.map((s) => ({
              key: s.id,
              label: (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {L(s, 'name')}
                </span>
              ),
              count: s.id === subjectId ? subjectUnits.length : s.stats.units,
            }))}
            value={subjectId}
            onChange={setSubjectId}
            className="flex-1 border-b-0"
          />
          {subjectUnits.length > 0 && (
            <button
              onClick={() => setExpanded(allOpen ? new Set() : new Set(subjectUnits.map((u) => u.id)))}
              className="mb-3 text-xs font-medium text-muted transition hover:text-accent"
            >
              {allOpen ? t('content.units.collapseAll') : t('content.units.expandAll')}
            </button>
          )}
        </div>
        <div className="border-t border-line bg-surface-2/50 p-4 sm:p-5">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : unitsQ.isError ? (
            <EmptyState title={t('api.loadFailed')} hint={errorMessage(unitsQ.error)} action={<Button size="sm" variant="secondary" onClick={() => unitsQ.refetch()}>{t('api.retry')}</Button>} />
          ) : subjectUnits.length === 0 ? (
            <EmptyState
              icon={<FolderTree className="h-10 w-10 text-accent" />}
              title={t('content.units.noUnits')}
              hint={t('common.emptyHint')}
              action={
                can('content', 'create') &&
                subject && (
                  <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setModal({ kind: 'unit', id: null, parentId: subject.id, name_en: '', name_ar: '' })}>
                    {t('content.units.addUnit')}
                  </Button>
                )
              }
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onUnitDragEnd}>
              <SortableContext items={subjectUnits.map((u) => u.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {subjectUnits.map((u) => {
                    const ts = topicsOf(u.id);
                    const open = expanded.has(u.id);
                    return (
                      <SortableRow key={u.id} id={u.id} label={L(u, 'name')} disabled={!editable}>
                        {(handle) => (
                          <div className="rounded-xl border border-line bg-surface shadow-card">
                            <div className="flex items-center gap-2 p-3 sm:gap-3">
                              {handle}
                              <OrderInput value={u.order} max={subjectUnits.length} disabled={!editable} onCommit={(n) => moveUnitTo(u, n)} label={`${t('common.order')} — ${L(u, 'name')}`} />
                              <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: subject?.color }} />
                              <button onClick={() => toggle(u.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-ink">{L(u, 'name')}</span>
                                  <span className="block truncate text-xs text-muted">{u.name_ar === L(u, 'name') ? u.name_en : u.name_ar}</span>
                                </span>
                                <ChevronDown className={cn('ms-auto h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
                              </button>
                              <div className="hidden items-center gap-1.5 sm:flex">
                                <Badge tone="navy">{t('content.units.topics', { count: ts.length })}</Badge>
                                <Badge tone="neutral">{t('content.units.lessons', { count: u.lessonCount })}</Badge>
                              </div>
                              {editable && (
                                <Button variant="ghost" size="icon-sm" aria-label={t('content.units.editUnit')} onClick={() => setModal({ kind: 'unit', id: u.id, parentId: u.subjectId, name_en: u.name_en, name_ar: u.name_ar })}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {can('content', 'delete') && (
                                <Button variant="ghost" size="icon-sm" className="hover:text-danger" aria-label={t('actions.delete')} onClick={() => deleteUnit(u)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            {open && (
                              <div className="border-t border-line px-3 pb-3 pt-2 sm:ps-12">
                                {ts.length === 0 ? (
                                  <p className="px-2 py-3 text-xs text-muted">{t('content.units.noTopics')}</p>
                                ) : (
                                  <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={(e) => {
                                      if (!e.over || e.active.id === e.over.id) return;
                                      const ids = ts.map((x) => x.id);
                                      reorderTopics(u, arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))), String(e.active.id));
                                    }}
                                  >
                                    <SortableContext items={ts.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                                      <div className="space-y-1.5">
                                        {ts.map((tp) => (
                                          <SortableRow key={tp.id} id={tp.id} label={L(tp, 'name')} disabled={!editable}>
                                            {(h) => (
                                              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2 py-1.5">
                                                {h}
                                                <OrderInput value={tp.order} max={ts.length} disabled={!editable} onCommit={(n) => moveTopicTo(u, tp, n)} label={`${t('common.order')} — ${L(tp, 'name')}`} />
                                                <span className="min-w-0 flex-1">
                                                  <span className="block truncate text-sm text-ink">{L(tp, 'name')}</span>
                                                </span>
                                                <span className="hidden text-xs text-muted num sm:inline">{t('content.units.lessons', { count: tp.lessonCount })}</span>
                                                {editable && (
                                                  <Button variant="ghost" size="icon-sm" aria-label={t('content.units.editTopic')} onClick={() => setModal({ kind: 'topic', id: tp.id, parentId: tp.unitId, name_en: tp.name_en, name_ar: tp.name_ar })}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                  </Button>
                                                )}
                                                {can('content', 'delete') && (
                                                  <Button variant="ghost" size="icon-sm" className="hover:text-danger" aria-label={t('actions.delete')} onClick={() => deleteTopic(u, tp)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </Button>
                                                )}
                                              </div>
                                            )}
                                          </SortableRow>
                                        ))}
                                      </div>
                                    </SortableContext>
                                  </DndContext>
                                )}
                                {can('content', 'create') && (
                                  <button
                                    onClick={() => setModal({ kind: 'topic', id: null, parentId: u.id, name_en: '', name_ar: '' })}
                                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
                                  >
                                    <Plus className="h-3.5 w-3.5" /> {t('content.units.addTopic')}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </SortableRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <NameModal state={modal} onClose={() => setModal(null)} />
    </div>
  );
}
