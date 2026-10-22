import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Archive, ArrowLeft, CheckCircle2, Copy, Eye, MessageSquareWarning, RotateCcw, Save, Send, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Difficulty, Lang, Question, QuestionStatus, QuestionType } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtNumber, fmtPercent } from '@/utils/format';
import { useQueryClient } from '@tanstack/react-query';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { useDebounce } from '@/hooks/useMisc';
import { errorMessage, isApiError } from '@/api/client';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { questionsApi, toQuestionWrite, type QuestionAction, type QuestionVM } from '@/api/questions';
import { useUpload } from '@/api/storage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, FileUpload, Input, Segmented, Select, StatusBadge, TagInput, useConfirm } from '@/components/ui';
import {
  CurriculumSelects,
  DifficultyBadge,
  OptionsEditor,
  QuestionPreview,
  QuestionText,
  RichTextField,
  WorkflowSteps,
  defaultOptions,
  emptyQuestion,
  validateQuestion,
  QUESTION_SOURCES,
  type QuestionErrors,
} from '@/components/forms/QuestionForm';
import { SkeletonCard } from '@/components/ui';

/** Server validation paths → editor error keys. */
const FIELD_MAP: Record<string, keyof QuestionErrors> = {
  'body.en': 'body_en',
  'body.ar': 'body_ar',
  'explanation.en': 'explanation_en',
  'explanation.ar': 'explanation_ar',
  subjectId: 'subjectId',
  unitId: 'unitId',
  topicId: 'topicId',
  year: 'year',
};

export default function QuestionEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const admin = useCurrentAdmin();
  const lang = useLang();
  const qc = useQueryClient();
  const existingQ = useApiQuery(qk.questions.detail(id), () => questionsApi.get(id as string), { enabled: !isNew });
  const existing = existingQ.data as QuestionVM | undefined;
  const imageUpload = useUpload('question_image');
  const [imageKey, setImageKey] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  const [q, setQ] = useState<Question>(() => emptyQuestion(admin?.id ?? ''));
  const [baseline, setBaseline] = useState(() => JSON.stringify(q));
  const [errors, setErrors] = useState<QuestionErrors>({});
  const [previewLang, setPreviewLang] = useState<Lang>('en');

  // (Re)load when navigating between questions or after the server returns a fresh copy.
  useEffect(() => {
    const next = existing ? structuredClone(existing as Question) : emptyQuestion(admin?.id ?? '');
    setQ(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    setImageKey(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, existing?.updatedAt]);

  // Duplicate check against the server (ADM-QST-11), debounced while typing.
  const simInput = useDebounce(`${q.topicId}|${q.body_en}`, 600);
  const similarQ = useApiQuery(
    qk.questions.sub('similar', simInput, q.id),
    () => questionsApi.similar({ topicId: q.topicId, body: { en: q.body_en, ar: q.body_ar }, excludeId: isNew ? undefined : q.id, limit: 3 }),
    { enabled: !!q.topicId && q.body_en.length > 12 && !!simInput, staleTime: 60_000, meta: { silentError: true } },
  );
  const similar = useMemo(
    () => (q.topicId && q.body_en.length > 12 ? (similarQ.data ?? []).map((x) => ({ q: { id: x.question.id, code: x.question.code, body_en: x.question.body.en, body_ar: x.question.body.ar }, score: x.score })) : []),
    [similarQ.data, q.topicId, q.body_en],
  );

  if (!isNew && existingQ.isLoading) {
    return (
      <>
        <PageHeader title={t('common.loading')} />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      </>
    );
  }

  if (id && !existing) {
    const notFound = !existingQ.error || (isApiError(existingQ.error) && existingQ.error.status === 404);
    return (
      <>
        <PageHeader title={notFound ? t('questions.editor.notFound') : t('api.loadFailed')} />
        <Card>
          <EmptyState
            title={notFound ? t('questions.editor.notFound') : t('api.loadFailed')}
            hint={notFound ? t('questions.editor.notFoundHint') : errorMessage(existingQ.error)}
            action={notFound ? <ButtonLink to="/questions">{t('questions.editor.backToBank')}</ButtonLink> : <Button variant="secondary" onClick={() => existingQ.refetch()}>{t('api.retry')}</Button>}
          />
        </Card>
      </>
    );
  }

  const dirty = JSON.stringify(q) !== baseline;
  const canApprove = can('questions', 'approve');
  const canEdit = isNew ? can('questions', 'create') : can('questions', 'edit');
  const locked = !canEdit || ((q.status === 'published' || q.status === 'archived') && !canApprove);
  const set = <K extends keyof Question>(k: K, v: Question[K]) => setQ((p) => ({ ...p, [k]: v }));
  const nameOf = (which: 'author' | 'reviewer') => {
    const a = existing?.[which];
    if (a) return a.name[lang];
    return which === 'author' && isNew && admin ? L(admin, 'name') : '—';
  };

  const validate = () => {
    const e = validateQuestion(q, t);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('questions.validation.fixErrors'));
      return false;
    }
    return true;
  };

  const applyError = (e: unknown) => {
    if (isApiError(e) && Object.keys(e.fields).length) {
      const out: QuestionErrors = {};
      for (const [k, msg] of Object.entries(e.fields)) {
        const key = FIELD_MAP[k] ?? (k.startsWith('options') ? 'options' : undefined);
        if (key && !out[key]) out[key] = msg;
      }
      setErrors(out);
      toast.error(t('questions.validation.fixErrors'));
    } else toast.error(errorMessage(e));
  };

  /** Persist the editor state, optionally with a workflow action (ADM-QST-04/05/07). */
  const persist = async (to: QuestionStatus | null, action: QuestionAction | null, message = t('toast.saved'), comment?: string) => {
    setBusy(action ?? 'save');
    const body = toQuestionWrite(q, imageKey);
    try {
      let saved: QuestionVM;
      if (isNew) {
        saved = await questionsApi.create({ ...body, status: to === 'in_review' ? 'in_review' : 'draft' });
        toast.success(t('toast.created', { entity: t('questions.entity') }));
      } else if (to && action) {
        saved = await questionsApi.transition(q.id, { to, action, comment, patch: dirty && !locked ? body : undefined });
        toast.success(message);
      } else {
        saved = await questionsApi.update(q.id, body);
        toast.success(message);
      }
      qc.setQueryData(qk.questions.detail(saved.id), saved);
      await qc.invalidateQueries({ queryKey: qk.questions.all });
      setBaseline(JSON.stringify(saved));
      setQ(structuredClone(saved as Question));
      setImageKey(undefined);
      if (isNew) navigate(`/questions/${saved.id}`, { replace: true });
    } catch (e) {
      applyError(e);
    } finally {
      setBusy(null);
    }
  };

  const onSave = () => validate() && persist(null, null);
  const onSubmit = () => validate() && persist('in_review', 'submit', t('questions.toast.submitted'));
  const onApprove = () => validate() && persist('approved', 'approve', t('questions.toast.approved'));
  const onReject = async () => {
    const r = await confirm({ title: t('questions.review.rejectTitle'), body: t('questions.review.rejectBody'), tone: 'warning', confirmText: t('actions.reject'), reason: { label: t('questions.review.comment'), placeholder: t('questions.review.commentPlaceholder') } });
    if (r) persist('draft', 'reject', t('questions.toast.rejected'), r.reason);
  };
  const onPublish = async () => {
    if (!validate()) return;
    const r = await confirm({ title: t('questions.editor.publishTitle'), body: t('questions.editor.publishBody'), tone: 'primary', confirmText: t('actions.publish') });
    if (r) persist('published', 'publish', t('questions.toast.published'));
  };
  const onArchive = async () => {
    const r = await confirm({ title: t('questions.editor.archiveTitle'), body: t('questions.editor.archiveBody'), tone: 'warning', confirmText: t('actions.archive') });
    if (r) persist('archived', 'archive', t('questions.toast.archived'));
  };
  const onRestore = () => persist('draft', 'restore', t('questions.toast.restored'));
  const onDelete = async () => {
    const r = await confirm({ title: t('confirm.deleteTitle', { entity: q.code }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!r) return;
    try {
      await questionsApi.remove(q.id);
      await qc.invalidateQueries({ queryKey: qk.questions.all });
      toast.success(t('toast.deleted', { entity: q.code }));
      navigate('/questions');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const changeType = (type: QuestionType) => {
    if (type === q.type) return;
    setQ((p) => ({ ...p, type, options: defaultOptions(type) }));
  };

  const author = nameOf('author');

  return (
    <>
      <PageHeader
        title={isNew ? t('questions.editor.newTitle') : q.code}
        current={isNew ? t('questions.editor.newTitle') : q.code}
        subtitle={isNew ? t('questions.editor.newSubtitle') : undefined}
        meta={
          <>
            <StatusBadge status={q.status} />
            <DifficultyBadge value={q.difficulty} />
            <Badge tone="navy">{t(`questions.types.${q.type}`)}</Badge>
            {q.duplicateOf && (
              <Badge tone="warning" icon={<Copy className="h-3 w-3" />}>
                {t('questions.bank.possibleDuplicate')}
              </Badge>
            )}
            {dirty && <Badge tone="accent">{t('common.unsavedChanges')}</Badge>}
          </>
        }
        actions={
          <>
            <ButtonLink to="/questions" variant="ghost" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('actions.back')}
            </ButtonLink>
            {!isNew && can('questions', 'delete') && (
              <Button variant="secondary" icon={<Trash2 className="h-4 w-4 text-danger" />} onClick={onDelete}>
                {t('actions.delete')}
              </Button>
            )}
            {!locked && (
              <Button icon={<Save className="h-4 w-4" />} onClick={onSave} loading={busy === 'save'} disabled={(!isNew && !dirty) || !!busy || imageUpload.uploading}>
                {isNew ? t('actions.saveDraft') : t('actions.saveChanges')}
              </Button>
            )}
          </>
        }
      />

      {locked && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-info/25 bg-info/[0.06] px-4 py-3 text-sm text-ink">
          <Eye className="h-4 w-4 text-info" /> {canEdit ? t('questions.editor.lockedPublished') : t('common.readOnly')}
        </div>
      )}
      {q.reviewComment && q.status === 'draft' && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <div className="font-semibold text-ink">{t('questions.editor.reviewerFeedback')}</div>
            <p className="mt-0.5 text-ink/80">{q.reviewComment}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title={t('questions.editor.questionCard')}
              subtitle={t('questions.editor.questionCardHint')}
              action={
                <Segmented
                  size="sm"
                  aria-label={t('common.type')}
                  value={q.type}
                  onChange={(v) => !locked && changeType(v)}
                  options={(['mcq', 'true_false', 'fill_blank'] as const).map((v) => ({ value: v, label: t(`questions.types.${v}`) }))}
                />
              }
            />
            <CardBody className="space-y-5">
              <RichTextField id="q-body-en" label={t('questions.fields.bodyEn')} required value={q.body_en} onChange={(v) => set('body_en', v)} error={errors.body_en} disabled={locked} allowBlank={q.type === 'fill_blank'} placeholder={t('questions.editor.bodyPlaceholderEn')} />
              <RichTextField id="q-body-ar" label={t('questions.fields.bodyAr')} required dir="rtl" value={q.body_ar} onChange={(v) => set('body_ar', v)} error={errors.body_ar} disabled={locked} allowBlank={q.type === 'fill_blank'} placeholder={t('questions.editor.bodyPlaceholderAr')} />
              <Field label={t('questions.fields.image')} hint={t('questions.editor.imageHint')}>
                <FileUpload
                  accept="image/png,image/jpeg,image/webp"
                  maxSizeMb={5}
                  preview={q.image}
                  disabled={locked || imageUpload.uploading}
                  progress={imageUpload.progress}
                  compact
                  onFile={async (f, url) => {
                    const prev = q.image;
                    if (url) set('image', url);
                    const r = await imageUpload.start(f);
                    imageUpload.reset();
                    if (r) setImageKey(r.fileKey);
                    else set('image', prev);
                  }}
                  onClear={() => {
                    set('image', null);
                    setImageKey(null);
                  }}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={q.type === 'fill_blank' ? t('questions.editor.acceptedAnswers') : t('questions.editor.optionsCard')} subtitle={q.type === 'mcq' ? t('questions.editor.optionsHint') : q.type === 'true_false' ? t('questions.editor.tfHint') : undefined} />
            <CardBody>
              <OptionsEditor type={q.type} options={q.options} onChange={(o) => set('options', o)} error={errors.options} disabled={locked} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('questions.fields.explanation')} subtitle={t('questions.editor.explanationHint')} />
            <CardBody className="grid gap-5 lg:grid-cols-2">
              <RichTextField label={t('questions.fields.explanationEn')} required rows={3} value={q.explanation_en} onChange={(v) => set('explanation_en', v)} error={errors.explanation_en} disabled={locked} />
              <RichTextField label={t('questions.fields.explanationAr')} required rows={3} dir="rtl" value={q.explanation_ar} onChange={(v) => set('explanation_ar', v)} error={errors.explanation_ar} disabled={locked} />
            </CardBody>
          </Card>
        </div>

        {/* Side column */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title={t('questions.editor.workflow')} />
            <CardBody className="space-y-4">
              <WorkflowSteps status={q.status} />
              <div className="flex flex-wrap gap-2">
                {isNew && canEdit && (
                  <Button size="sm" variant="secondary" loading={busy === 'submit'} icon={<Send className="h-4 w-4" />} onClick={() => validate() && persist('in_review', 'submit', t('questions.toast.submitted'))}>
                    {t('actions.submitForReview')}
                  </Button>
                )}
                {!isNew && q.status === 'draft' && canEdit && (
                  <Button size="sm" loading={busy === 'submit'} icon={<Send className="h-4 w-4" />} onClick={onSubmit}>
                    {t('actions.submitForReview')}
                  </Button>
                )}
                {!isNew && q.status === 'in_review' && canApprove && (
                  <>
                    <Button size="sm" variant="success" loading={busy === 'approve'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={onApprove}>
                      {t('actions.approve')}
                    </Button>
                    <Button size="sm" variant="secondary" loading={busy === 'reject'} icon={<XCircle className="h-4 w-4 text-danger" />} onClick={onReject}>
                      {t('actions.reject')}
                    </Button>
                  </>
                )}
                {!isNew && q.status === 'approved' && canApprove && (
                  <Button size="sm" loading={busy === 'publish'} icon={<UploadCloud className="h-4 w-4" />} onClick={onPublish}>
                    {t('actions.publish')}
                  </Button>
                )}
                {!isNew && (q.status === 'published' || q.status === 'approved') && canApprove && (
                  <Button size="sm" variant="secondary" loading={busy === 'archive'} icon={<Archive className="h-4 w-4" />} onClick={onArchive}>
                    {t('actions.archive')}
                  </Button>
                )}
                {!isNew && q.status === 'archived' && canEdit && (
                  <Button size="sm" variant="secondary" loading={busy === 'restore'} icon={<RotateCcw className="h-4 w-4" />} onClick={onRestore}>
                    {t('actions.restore')}
                  </Button>
                )}
                {!isNew && q.status === 'in_review' && !canApprove && <p className="text-xs text-muted">{t('questions.editor.awaitingReview')}</p>}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-xs">
                <div>
                  <dt className="text-muted">{t('questions.fields.author')}</dt>
                  <dd className="mt-0.5 font-medium text-ink">{author}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('questions.fields.reviewer')}</dt>
                  <dd className="mt-0.5 font-medium text-ink">{nameOf('reviewer')}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('questions.fields.usage')}</dt>
                  <dd className="mt-0.5 font-medium text-ink num">{fmtNumber(q.usageCount)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('questions.fields.accuracy')}</dt>
                  <dd className="mt-0.5 font-medium text-ink num">{q.usageCount && existing?.accuracyKnown ? fmtPercent(q.accuracy) : '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted">{t('common.updated')}</dt>
                  <dd className="mt-0.5 font-medium text-ink">{isNew ? '—' : fmtDateTime(q.updatedAt)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {similar.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <AlertTriangle className="h-4 w-4 text-warning" /> {t('questions.editor.similarFound', { count: similar.length })}
              </div>
              <ul className="mt-2 space-y-2">
                {similar.map(({ q: o, score }) => (
                  <li key={o.id}>
                    <Link to={`/questions/${o.id}`} className="block rounded-lg bg-surface p-2.5 text-xs ring-1 ring-line transition hover:ring-accent/50">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-primary" dir="ltr">
                          {o.code}
                        </span>
                        <Badge tone="warning">{fmtPercent(score * 100)}</Badge>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-ink/80">
                        <QuestionText text={L(o, 'body')} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card>
            <CardHeader title={t('questions.editor.classification')} />
            <CardBody className="space-y-4">
              <CurriculumSelects
                value={{ subjectId: q.subjectId, unitId: q.unitId, topicId: q.topicId }}
                onChange={(v) => setQ((p) => ({ ...p, ...v }))}
                errors={errors}
                disabled={locked}
              />
              <Field label={t('questions.fields.difficulty')}>
                <Segmented
                  className="w-full [&>button]:flex-1"
                  aria-label={t('questions.fields.difficulty')}
                  value={q.difficulty}
                  onChange={(v: Difficulty) => !locked && set('difficulty', v)}
                  options={(['easy', 'medium', 'hard'] as const).map((d) => ({ value: d, label: t(`difficulty.${d}`) }))}
                />
              </Field>
              <Field label={t('questions.fields.tags')} hint={t('questions.editor.tagsHint')}>
                <TagInput value={q.tags} onChange={(v) => set('tags', v)} disabled={locked} placeholder={t('questions.editor.tagsPlaceholder')} aria-label={t('questions.fields.tags')} />
              </Field>
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <Field label={t('questions.fields.source')}>
                  <Select value={q.source} disabled={locked} onChange={(e) => set('source', e.target.value)} options={QUESTION_SOURCES.map((s) => ({ value: s, label: t(`questions.sources.${s.replace(/\s+/g, '')}`) }))} />
                </Field>
                <Field label={t('questions.fields.year')} error={errors.year}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={2000}
                    max={2027}
                    disabled={locked}
                    value={q.year ?? ''}
                    invalid={!!errors.year}
                    onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)}
                    placeholder="2025"
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card className="xl:sticky xl:top-24">
            <CardHeader
              title={t('questions.editor.studentPreview')}
              subtitle={t('questions.editor.studentPreviewHint')}
              action={<Segmented size="sm" aria-label={t('common.language')} value={previewLang} onChange={setPreviewLang} options={[{ value: 'en', label: 'EN' }, { value: 'ar', label: 'ع' }]} />}
            />
            <CardBody className={cn('bg-surface-2/40')}>
              <QuestionPreview key={`${previewLang}-${q.type}-${q.options.length}`} question={q} lang={previewLang} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
