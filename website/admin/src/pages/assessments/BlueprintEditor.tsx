import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { z } from 'zod';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Plus, Save, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { BlueprintRow, Difficulty, ExamBlueprint } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDate, fmtNumber } from '@/utils/format';
import { uid } from '@/utils/id';
import { daysAhead } from '@/utils/random';
import { useBlueprints } from '@/store/assessments';
import { useQuestions } from '@/store/questions';
import { useSubjects, useTopics, useUnits } from '@/store/core';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, Input, Segmented, Select, StatusBadge, Switch, useConfirm } from '@/components/ui';

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFF_COLOR: Record<Difficulty, string> = { easy: '#16A34A', medium: '#F59E0B', hard: '#DC2626' };

const toLocal = (iso: string) => (iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : '');

/** Change one difficulty share and rebalance the other two so the row always sums to 100. */
function rebalance(row: BlueprintRow, key: Difficulty, value: number): BlueprintRow {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = DIFFS.filter((d) => d !== key);
  const prevSum = others.reduce((s, d) => s + row[d], 0);
  const remaining = 100 - v;
  const next = { ...row, [key]: v };
  if (prevSum === 0) {
    next[others[0]] = Math.floor(remaining / 2);
    next[others[1]] = remaining - Math.floor(remaining / 2);
  } else {
    next[others[0]] = Math.round((row[others[0]] / prevSum) * remaining);
    next[others[1]] = remaining - next[others[0]];
  }
  return next;
}

const newRow = (subjectId = ''): BlueprintRow => ({ id: uid('bpr'), subjectId, topicId: null, count: 10, easy: 30, medium: 50, hard: 20 });

const emptyBlueprint = (): ExamBlueprint => ({
  id: uid('bp'),
  name_en: '',
  name_ar: '',
  rows: [newRow('sub_math')],
  durationMin: 90,
  randomize: true,
  scoring: 'standard',
  attemptLimit: 2,
  reviewBeforeSubmit: true,
  availableFrom: daysAhead(1),
  availableTo: daysAhead(31),
  status: 'draft',
  attempts: 0,
  updatedAt: new Date().toISOString(),
});

export default function BlueprintEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const existing = useBlueprints((s) => (id ? s.items.find((b) => b.id === id) : undefined));
  const add = useBlueprints((s) => s.add);
  const update = useBlueprints((s) => s.update);
  const questions = useQuestions((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const units = useUnits((s) => s.items);
  const topics = useTopics((s) => s.items);

  const [bp, setBp] = useState<ExamBlueprint>(() => (existing ? structuredClone(existing) : emptyBlueprint()));
  const [baseline, setBaseline] = useState(() => JSON.stringify(bp));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const next = existing ? structuredClone(existing) : emptyBlueprint();
    setBp(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const usable = useMemo(() => questions.filter((q) => q.status === 'published' || q.status === 'approved'), [questions]);

  /** Available vs required questions per difficulty for each row. */
  const availability = useMemo(
    () =>
      Object.fromEntries(
        bp.rows.map((r) => {
          const pool = usable.filter((q) => q.subjectId === r.subjectId && (!r.topicId || q.topicId === r.topicId));
          const per = DIFFS.map((d) => {
            const required = Math.round((r.count * r[d]) / 100);
            const available = pool.filter((q) => q.difficulty === d).length;
            return { d, required, available };
          });
          return [r.id, { per, ok: per.every((p) => p.available >= p.required), pool: pool.length }];
        }),
      ),
    [bp.rows, usable],
  );

  if (id && !existing) {
    return (
      <>
        <PageHeader title={t('assessments.blueprints.notFound')} />
        <Card>
          <EmptyState title={t('assessments.blueprints.notFound')} action={<ButtonLink to="/assessments/blueprints">{t('actions.back')}</ButtonLink>} />
        </Card>
      </>
    );
  }

  const canEdit = isNew ? can('assessments', 'create') : can('assessments', 'edit');
  const dirty = JSON.stringify(bp) !== baseline;
  const set = <K extends keyof ExamBlueprint>(k: K, v: ExamBlueprint[K]) => setBp((p) => ({ ...p, [k]: v }));
  const setRow = (rowId: string, patch: Partial<BlueprintRow> | ((r: BlueprintRow) => BlueprintRow)) =>
    setBp((p) => ({ ...p, rows: p.rows.map((r) => (r.id === rowId ? (typeof patch === 'function' ? patch(r) : { ...r, ...patch }) : r)) }));

  const total = bp.rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const mix = DIFFS.map((d) => ({ d, n: bp.rows.reduce((s, r) => s + Math.round(((Number(r.count) || 0) * r[d]) / 100), 0) }));
  const bySubject = subjects
    .map((s) => ({ s, n: bp.rows.filter((r) => r.subjectId === s.id).reduce((a, r) => a + (Number(r.count) || 0), 0) }))
    .filter((x) => x.n > 0);
  const shortRows = bp.rows.filter((r) => !availability[r.id]?.ok);

  const validate = () => {
    const schema = z
      .object({
        name_en: z.string().trim().min(3, t('errors.required')),
        name_ar: z.string().trim().min(3, t('errors.required')),
        durationMin: z.number().int().min(10, t('errors.min', { min: 10 })).max(300, t('errors.max', { max: 300 })),
        attemptLimit: z.number().int().min(1, t('errors.min', { min: 1 })).max(10, t('errors.max', { max: 10 })),
        availableFrom: z.string().min(1, t('errors.required')),
        availableTo: z.string().min(1, t('errors.required')),
        rows: z
          .array(z.object({ subjectId: z.string().min(1), count: z.number().int().min(1), easy: z.number(), medium: z.number(), hard: z.number() }))
          .min(1, t('assessments.editor.rowsRequired')),
      })
      .superRefine((v, ctx) => {
        if (v.availableFrom && v.availableTo && v.availableTo <= v.availableFrom) ctx.addIssue({ code: 'custom', path: ['availableTo'], message: t('assessments.editor.windowInvalid') });
        v.rows.forEach((r, i) => {
          if (!r.subjectId) ctx.addIssue({ code: 'custom', path: ['rows', i], message: t('errors.required') });
          if (r.easy + r.medium + r.hard !== 100) ctx.addIssue({ code: 'custom', path: ['rows', i], message: t('assessments.editor.mixInvalid') });
          if (r.count < 1) ctx.addIssue({ code: 'custom', path: ['rows', i], message: t('errors.min', { min: 1 }) });
        });
      });
    const res = schema.safeParse(bp);
    if (res.success) {
      setErrors({});
      return true;
    }
    const out: Record<string, string> = {};
    res.error.issues.forEach((i) => {
      const key = i.path[0] === 'rows' && typeof i.path[1] === 'number' ? `row:${bp.rows[i.path[1]]?.id}` : String(i.path[0]);
      out[key] ??= i.message;
    });
    setErrors(out);
    toast.error(t('questions.validation.fixErrors'));
    return false;
  };

  const save = async (status: ExamBlueprint['status'] = bp.status) => {
    if (!validate()) return;
    if (status === 'published' && shortRows.length) {
      const ok = await confirm({ title: t('assessments.editor.shortTitle'), body: t('assessments.editor.shortBody', { count: shortRows.length }), tone: 'warning', confirmText: t('actions.publish') });
      if (!ok) return;
    }
    const next = { ...bp, status, updatedAt: new Date().toISOString() };
    if (isNew) {
      add(next);
      toast.success(t('toast.created', { entity: t('assessments.blueprints.entity') }));
      setBaseline(JSON.stringify(next));
      navigate(`/assessments/blueprints/${next.id}`, { replace: true });
    } else {
      update(next.id, next, status !== bp.status ? { action: `exam_blueprint.${status === 'published' ? 'publish' : status}` } : undefined);
      setBp(next);
      setBaseline(JSON.stringify(next));
      toast.success(status === 'published' && bp.status !== 'published' ? t('assessments.editor.publishedToast') : t('toast.saved'));
    }
  };

  const topicOptions = (subjectId: string) =>
    units
      .filter((u) => u.subjectId === subjectId)
      .flatMap((u) => topics.filter((tp) => tp.unitId === u.id).map((tp) => ({ value: tp.id, label: `${u.order}.${tp.order} ${L(tp, 'name')}` })));

  return (
    <>
      <PageHeader
        title={isNew ? t('assessments.editor.newTitle') : L(bp, 'name')}
        current={isNew ? t('assessments.editor.newTitle') : L(bp, 'name')}
        meta={
          <>
            <StatusBadge status={bp.status} />
            {!isNew && <Badge tone="neutral">{t('assessments.editor.attemptsSoFar', { count: bp.attempts })}</Badge>}
            {dirty && <Badge tone="accent">{t('common.unsavedChanges')}</Badge>}
          </>
        }
        actions={
          <>
            <ButtonLink to="/assessments/blueprints" variant="ghost" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('actions.back')}
            </ButtonLink>
            {canEdit && (
              <Button variant="secondary" icon={<Save className="h-4 w-4" />} onClick={() => save()} disabled={!isNew && !dirty}>
                {isNew ? t('actions.saveDraft') : t('actions.saveChanges')}
              </Button>
            )}
            {can('assessments', 'approve') && bp.status !== 'published' && (
              <Button icon={<UploadCloud className="h-4 w-4" />} onClick={() => save('published')}>
                {t('actions.publish')}
              </Button>
            )}
          </>
        }
      />

      {!canEdit && <div className="mb-5 rounded-xl border border-info/25 bg-info/[0.06] px-4 py-3 text-sm text-ink">{t('common.readOnly')}</div>}

      <fieldset disabled={!canEdit} className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title={t('assessments.editor.basics')} />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Field label={t('common.nameEn')} required error={errors.name_en}>
                <Input value={bp.name_en} invalid={!!errors.name_en} onChange={(e) => set('name_en', e.target.value)} placeholder="Ministerial Mock Exam — Final" />
              </Field>
              <Field label={t('common.nameAr')} required error={errors.name_ar}>
                <Input dir="rtl" value={bp.name_ar} invalid={!!errors.name_ar} onChange={(e) => set('name_ar', e.target.value)} placeholder="الامتحان الوزاري التجريبي — النهائي" />
              </Field>
              <Field label={t('assessments.blueprints.duration')} error={errors.durationMin}>
                <Input type="number" min={10} max={300} suffix={t('common.minutes')} value={bp.durationMin} invalid={!!errors.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />
              </Field>
              <Field label={t('assessments.blueprints.attemptLimit')} error={errors.attemptLimit}>
                <Input type="number" min={1} max={10} value={bp.attemptLimit} invalid={!!errors.attemptLimit} onChange={(e) => set('attemptLimit', Number(e.target.value))} />
              </Field>
              <Field label={t('assessments.blueprints.scoring')} hint={t(`assessments.scoringHint.${bp.scoring}`)}>
                <Select value={bp.scoring} onChange={(e) => set('scoring', e.target.value as ExamBlueprint['scoring'])} options={(['standard', 'negative', 'weighted'] as const).map((s) => ({ value: s, label: t(`assessments.scoring.${s}`) }))} />
              </Field>
              <Field label={t('common.status')}>
                <Segmented
                  className="w-full [&>button]:flex-1"
                  aria-label={t('common.status')}
                  value={bp.status}
                  onChange={(v) => {
                    if (v === 'published' && !can('assessments', 'approve')) return toast.error(t('common.noPermission'));
                    set('status', v);
                  }}
                  options={(['draft', 'published', 'archived'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))}
                />
              </Field>
              <Field label={t('assessments.editor.availableFrom')} error={errors.availableFrom}>
                <Input type="datetime-local" value={toLocal(bp.availableFrom)} onChange={(e) => set('availableFrom', fromLocal(e.target.value))} />
              </Field>
              <Field label={t('assessments.editor.availableTo')} error={errors.availableTo}>
                <Input type="datetime-local" value={toLocal(bp.availableTo)} invalid={!!errors.availableTo} onChange={(e) => set('availableTo', fromLocal(e.target.value))} />
              </Field>
              <div className="grid gap-4 rounded-xl border border-line bg-surface-2 p-4 md:col-span-2 md:grid-cols-2">
                <Switch label={t('assessments.editor.randomize')} description={t('assessments.editor.randomizeHint')} checked={bp.randomize} onChange={(v) => set('randomize', v)} disabled={!canEdit} />
                <Switch label={t('assessments.editor.reviewBeforeSubmit')} description={t('assessments.editor.reviewBeforeSubmitHint')} checked={bp.reviewBeforeSubmit} onChange={(v) => set('reviewBeforeSubmit', v)} disabled={!canEdit} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t('assessments.editor.composition')}
              subtitle={t('assessments.editor.compositionHint')}
              action={
                <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => set('rows', [...bp.rows, newRow()])}>
                  {t('actions.addRow')}
                </Button>
              }
            />
            <CardBody className="space-y-4">
              {errors.rows && <p className="text-xs font-medium text-danger">{errors.rows}</p>}
              {bp.rows.map((r, i) => {
                const subj = subjects.find((s) => s.id === r.subjectId);
                const av = availability[r.id];
                const sum = r.easy + r.medium + r.hard;
                return (
                  <div key={r.id} className={cn('rounded-xl border p-4', errors[`row:${r.id}`] ? 'border-danger/50' : 'border-line')} style={{ borderInlineStartWidth: 4, borderInlineStartColor: subj?.color ?? 'transparent' }}>
                    <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_7rem_auto]">
                      <Field label={t('common.subject')}>
                        <Select value={r.subjectId} placeholder={t('questions.editor.selectSubject')} options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))} onChange={(e) => setRow(r.id, { subjectId: e.target.value, topicId: null })} aria-label={`${t('common.subject')} ${i + 1}`} />
                      </Field>
                      <Field label={t('common.topic')}>
                        <Select value={r.topicId ?? ''} disabled={!r.subjectId} placeholder={t('assessments.editor.allTopics')} options={topicOptions(r.subjectId)} onChange={(e) => setRow(r.id, { topicId: e.target.value || null })} aria-label={`${t('common.topic')} ${i + 1}`} />
                      </Field>
                      <Field label={t('assessments.blueprints.questions')}>
                        <Input type="number" min={1} max={100} value={r.count} onChange={(e) => setRow(r.id, { count: Number(e.target.value) })} aria-label={`${t('assessments.blueprints.questions')} ${i + 1}`} />
                      </Field>
                      <div className="flex items-end">
                        <Button variant="ghost" size="icon" className="hover:text-danger" disabled={bp.rows.length <= 1} onClick={() => set('rows', bp.rows.filter((x) => x.id !== r.id))} aria-label={`${t('actions.remove')} ${i + 1}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      {DIFFS.map((d) => {
                        const p = av?.per.find((x) => x.d === d);
                        const short = p && p.available < p.required;
                        return (
                          <div key={d}>
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                              <label htmlFor={`${r.id}-${d}`} className="font-semibold" style={{ color: DIFF_COLOR[d] }}>
                                {t(`difficulty.${d}`)}
                              </label>
                              <span className="font-semibold text-ink num">
                                {r[d]}% <span className="font-normal text-muted">· {p?.required ?? 0}</span>
                              </span>
                            </div>
                            <input
                              id={`${r.id}-${d}`}
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={r[d]}
                              onChange={(e) => setRow(r.id, (row) => rebalance(row, d, Number(e.target.value)))}
                              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink/10"
                              style={{ accentColor: DIFF_COLOR[d] }}
                            />
                            <div className={cn('mt-1 text-[11px]', short ? 'font-semibold text-danger' : 'text-muted')}>
                              {t('assessments.editor.availableInBank', { count: p?.available ?? 0 })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {sum !== 100 && <Badge tone="danger">{t('assessments.editor.sumIs', { sum })}</Badge>}
                      {av?.ok ? (
                        <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                          {t('assessments.editor.poolOk', { count: av.pool })}
                        </Badge>
                      ) : (
                        <Badge tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>
                          {t('assessments.editor.poolShort')}
                        </Badge>
                      )}
                      {errors[`row:${r.id}`] && <span className="font-medium text-danger">{errors[`row:${r.id}`]}</span>}
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>

        {/* Live summary */}
        <div className="min-w-0">
          <Card className="xl:sticky xl:top-24">
            <CardHeader title={t('assessments.editor.summary')} subtitle={t('assessments.editor.summaryHint')} />
            <CardBody className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="kpi-num text-3xl text-primary">{fmtNumber(total)}</div>
                  <div className="text-[11px] text-muted">{t('assessments.blueprints.questions')}</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="kpi-num text-3xl text-primary">{bp.durationMin}</div>
                  <div className="text-[11px] text-muted">{t('common.minutes')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Clock className="h-3.5 w-3.5" />
                {t('assessments.editor.perQuestion', { sec: total ? Math.round((bp.durationMin * 60) / total) : 0 })}
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-ink">{t('assessments.editor.bySubject')}</div>
                <ul className="space-y-2">
                  {bySubject.map(({ s, n }) => (
                    <li key={s.id}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{L(s, 'name')}</span>
                        <span className="font-semibold num">
                          {n} <span className="font-normal text-muted">· {Math.round((n / Math.max(1, total)) * 100)}%</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink/[0.07]">
                        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: s.color }} />
                      </div>
                    </li>
                  ))}
                  {!bySubject.length && <li className="text-xs text-muted">—</li>}
                </ul>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-ink">{t('assessments.editor.difficultyMix')}</div>
                <div className="flex h-3 overflow-hidden rounded-full bg-ink/[0.07]">
                  {mix.map(({ d, n }) => (
                    <div key={d} className="h-full transition-[width] duration-300" style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: DIFF_COLOR[d] }} title={`${t(`difficulty.${d}`)}: ${n}`} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px]">
                  {mix.map(({ d, n }) => (
                    <span key={d} className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: DIFF_COLOR[d] }} />
                      {t(`difficulty.${d}`)} <span className="font-semibold num">{n}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className={cn('rounded-xl border p-3 text-xs', shortRows.length ? 'border-warning/40 bg-warning/[0.06]' : 'border-success/30 bg-success/[0.06]')}>
                <div className="flex items-center gap-2 font-semibold text-ink">
                  {shortRows.length ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  {shortRows.length ? t('assessments.editor.availabilityShort', { count: shortRows.length }) : t('assessments.editor.availabilityOk')}
                </div>
                <p className="mt-1 text-muted">{t('assessments.editor.availabilityHint')}</p>
              </div>

              <dl className="space-y-2 border-t border-line pt-4 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('assessments.blueprints.scoring')}</dt>
                  <dd className="font-medium">{t(`assessments.scoring.${bp.scoring}`)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('assessments.blueprints.attemptLimit')}</dt>
                  <dd className="font-medium num">{bp.attemptLimit}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('assessments.blueprints.window')}</dt>
                  <dd className="text-end font-medium">
                    {fmtDate(bp.availableFrom, 'd MMM')} – {fmtDate(bp.availableTo, 'd MMM yyyy')}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('assessments.editor.randomize')}</dt>
                  <dd className="font-medium">{bp.randomize ? t('common.on') : t('common.off')}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('assessments.editor.reviewBeforeSubmit')}</dt>
                  <dd className="font-medium">{bp.reviewBeforeSubmit ? t('common.on') : t('common.off')}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </fieldset>
    </>
  );
}
