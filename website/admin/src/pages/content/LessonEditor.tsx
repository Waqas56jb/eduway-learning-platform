import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  FileStack,
  GitBranch,
  History,
  Info,
  ListChecks,
  Rocket,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { ContentStatus } from '@/types';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtRelative } from '@/utils/format';
import { useUi } from '@/store/ui';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { errorMessage, isApiError } from '@/api/client';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { curriculumKeys, lessonsApi } from '@/api/content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, SkeletonCard, StatusBadge, useConfirm } from '@/components/ui';
import {
  LessonBasicsSection,
  LessonMediaSection,
  LessonPlacementSection,
  LessonResourcesSection,
  LessonRulesSection,
  attachPendingMedia,
  formToWrite,
  lessonSchema,
  lessonToForm,
  type LessonFormValues,
} from '@/components/forms/LessonForm';
import { ScheduleModal, STATUS_COLOR, useLessonStatus } from './shared';

/** RHF field names for server validation paths (`title.en` → `title_en`). */
const FIELD_MAP: Record<string, keyof LessonFormValues> = {
  'title.en': 'title_en',
  'title.ar': 'title_ar',
  'description.en': 'description_en',
  'description.ar': 'description_ar',
  durationSec: 'durationMin',
};

const PIPELINE: ContentStatus[] = ['draft', 'in_review', 'approved', 'scheduled', 'published'];

export default function LessonEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { move } = useLessonStatus();
  const lessonQ = useApiQuery(qk.lessons.detail(id), () => lessonsApi.get(id as string), { enabled: !isNew });
  const lesson = lessonQ.data;
  const loading = !isNew && lessonQ.isLoading;
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const canEdit = isNew ? can('content', 'create') : can('content', 'edit');
  const canApprove = can('content', 'approve');
  const readOnly = !canEdit;

  const schema = useMemo(() => lessonSchema(t), [t]);
  const form = useForm<LessonFormValues>({
    resolver: zodResolver(schema),
    values: lessonToForm(lesson),
    // Server refreshes (video processed, resources attached) must not wipe the admin's unsaved edits.
    resetOptions: { keepDirtyValues: true },
  });
  const { handleSubmit, formState, reset } = form;
  const dirty = formState.isDirty;
  const status: ContentStatus = lesson?.status ?? 'draft';
  const videoBusy = form.watch('videoState') === 'uploading' || (!isNew && form.watch('videoState') === 'processing');

  const applyServerErrors = (e: unknown) => {
    if (isApiError(e) && Object.keys(e.fields).length) {
      for (const [k, msg] of Object.entries(e.fields)) {
        const f = FIELD_MAP[k] ?? (k as keyof LessonFormValues);
        form.setError(f, { message: msg });
      }
      toast.error(t('apiErrors.VALIDATION_ERROR'));
    } else if (isApiError(e) && e.details.reason === 'VIDEO_NOT_READY') {
      toast.error(t('content.editor.videoNotReady'));
    } else toast.error(errorMessage(e));
  };

  /** Persist form values, optionally moving to a new status (ADM-LSN-02/04/06). */
  const persist = async (values: LessonFormValues, to?: ContentStatus, publishAt?: string | null) => {
    setBusy(to ?? 'save');
    const body = formToWrite(values);
    try {
      if (isNew) {
        const created = await lessonsApi.create({ ...body, status: to === 'in_review' ? 'in_review' : 'draft', versionNote: t(`content.editor.versionNote.${to ?? 'created'}`, { lng: 'en' }) });
        await attachPendingMedia(created.id, values).catch((e) => toast.error(errorMessage(e)));
        if (to && to !== 'draft' && to !== 'in_review') await move(created, to, publishAt);
        await Promise.all(curriculumKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
        toast.success(t('content.editor.created'));
        reset(values);
        navigate(`/content/lessons/${created.id}`, { replace: true });
        return;
      }
      if (!lesson) return;
      if (to && to !== lesson.status) {
        await move(lesson, to, publishAt, dirty ? body : undefined);
        toast.success(t('content.editor.statusChanged', { status: t(`status.${to}`) }));
      } else {
        const updated = await lessonsApi.update(lesson.id, { ...body, versionNote: t('content.editor.versionNote.saved', { lng: 'en' }) });
        qc.setQueryData(qk.lessons.detail(lesson.id), updated);
        await Promise.all(curriculumKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
        toast.success(t('content.editor.saved'));
      }
      reset({ ...values, thumbnailFileKey: undefined, captionsFileKey: undefined, pendingVideoKey: undefined });
    } catch (e) {
      applyServerErrors(e);
    } finally {
      setBusy(null);
    }
  };

  const onInvalid = () => toast.error(t('toast.error'));
  const run = (to?: ContentStatus, publishAt?: string | null) => handleSubmit((v) => persist(v, to, publishAt), onInvalid)();

  const onPublish = async () => {
    const ok = await confirm({ title: t('content.editor.publishTitle'), body: t('content.editor.publishBody'), tone: 'primary', confirmText: t('actions.publish') });
    if (ok) run('published');
  };
  const onArchive = async () => {
    const ok = await confirm({ title: t('content.editor.archiveTitle'), body: t('content.editor.archiveBody'), tone: 'warning', confirmText: t('actions.archive') });
    if (ok) run('archived');
  };
  const onDelete = async () => {
    if (!lesson) return;
    const ok = await confirm({ title: t('content.editor.deleteTitle'), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    try {
      await lessonsApi.remove(lesson.id);
      await Promise.all(curriculumKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
      qc.removeQueries({ queryKey: qk.lessons.detail(lesson.id) });
      toast.success(t('toast.deleted', { entity: L(lesson, 'title') }));
      navigate('/content/lessons');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (!isNew && !lesson && !loading) {
    const notFound = !lessonQ.error || (isApiError(lessonQ.error) && lessonQ.error.status === 404);
    return (
      <div>
        <PageHeader title={notFound ? t('content.editor.notFound') : t('api.loadFailed')} />
        <div className="card">
          <EmptyState
            title={notFound ? t('content.editor.notFound') : t('api.loadFailed')}
            hint={notFound ? t('content.editor.notFoundHint') : errorMessage(lessonQ.error)}
            action={
              notFound ? (
                <ButtonLink to="/content/lessons" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
                  {t('content.editor.backToLessons')}
                </ButtonLink>
              ) : (
                <Button variant="secondary" onClick={() => lessonQ.refetch()}>
                  {t('api.retry')}
                </Button>
              )
            }
          />
        </div>
      </div>
    );
  }

  const title = isNew ? t('content.editor.newTitle') : L(lesson, 'title');
  const stepIndex = PIPELINE.indexOf(status);
  const disabledAll = !!busy || videoBusy;

  return (
    <div className="pb-24">
      <PageHeader
        title={title}
        current={isNew ? t('content.editor.newTitle') : L(lesson, 'title')}
        meta={
          !isNew && lesson ? (
            <>
              <StatusBadge status={lesson.status} />
              <span className="text-xs text-muted">
                {t('common.updated')} {fmtRelative(lesson.updatedAt)}
              </span>
              {lesson.publishAt && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <CalendarClock className="h-3.5 w-3.5" /> {fmtDateTime(lesson.publishAt)}
                </span>
              )}
            </>
          ) : undefined
        }
        actions={
          <>
            <ButtonLink to="/content/lessons" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('actions.back')}
            </ButtonLink>
            {!isNew && can('content', 'delete') && (
              <Button variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={onDelete}>
                {t('actions.delete')}
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <SkeletonCard lines={5} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </div>
          <SkeletonCard lines={6} />
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          noValidate
        >
          <div className="grid items-start gap-6 xl:grid-cols-3">
            <fieldset disabled={readOnly} className="min-w-0 space-y-6 xl:col-span-2">
              {readOnly && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-ink">
                  <Info className="h-4 w-4 shrink-0 text-warning" /> {t('common.readOnly')}
                </div>
              )}
              <LessonBasicsSection form={form} icon={<BookOpen className="h-4 w-4" />} />
              <LessonPlacementSection form={form} icon={<GitBranch className="h-4 w-4" />} />
              <LessonMediaSection form={form} icon={<Clapperboard className="h-4 w-4" />} disabled={readOnly} lesson={lesson} />
              <LessonResourcesSection form={form} icon={<FileStack className="h-4 w-4" />} disabled={readOnly} lesson={lesson} />
              <LessonRulesSection form={form} icon={<ListChecks className="h-4 w-4" />} lessonId={lesson?.id} disabled={readOnly} />
            </fieldset>

            <aside className="space-y-6 xl:sticky xl:top-24">
              <Card>
                <CardHeader title={t('content.editor.workflow')} icon={<Rocket className="h-4 w-4" />} />
                <CardBody className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-muted">{t('content.editor.currentStatus')}</span>
                      <StatusBadge status={status} />
                    </div>
                    <ol className="flex items-center gap-1" aria-label={t('content.editor.workflow')}>
                      {PIPELINE.map((s, i) => {
                        const done = status !== 'archived' && i <= stepIndex;
                        return (
                          <li key={s} className="flex-1" title={t(`status.${s}`)}>
                            <span className="block h-1.5 rounded-full transition-colors" style={{ background: done ? STATUS_COLOR[status] : 'rgb(var(--c-border))' }} />
                            <span className={cn('mt-1 block truncate text-[10px]', done ? 'font-semibold text-ink' : 'text-muted')}>{t(`status.${s}`)}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {!canApprove && canEdit && (
                    <p className="rounded-lg bg-info/10 px-3 py-2 text-xs text-info">{t('content.editor.teacherOnly')}</p>
                  )}

                  <div className="grid gap-2">
                    {canEdit && (canApprove || status === 'draft' || status === 'in_review') && (
                      <Button variant="secondary" icon={<Save className="h-4 w-4" />} loading={busy === 'draft'} disabled={disabledAll} onClick={() => run('draft')}>
                        {t('actions.saveDraft')}
                      </Button>
                    )}
                    {canEdit && (status === 'draft' || (canApprove && status !== 'in_review' && status !== 'published')) && (
                      <Button variant="outline" icon={<Send className="h-4 w-4" />} loading={busy === 'in_review'} disabled={disabledAll} onClick={() => run('in_review')}>
                        {t('actions.submitForReview')}
                      </Button>
                    )}
                    {canApprove && (
                      <>
                        {(status === 'in_review' || status === 'draft') && (
                          <Button variant="success" icon={<BadgeCheck className="h-4 w-4" />} loading={busy === 'approved'} disabled={disabledAll} onClick={() => run('approved')}>
                            {t('actions.approve')}
                          </Button>
                        )}
                        {status !== 'published' && status !== 'archived' && (
                          <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} loading={busy === 'scheduled'} disabled={disabledAll} onClick={() => setScheduleOpen(true)}>
                            {t('actions.schedule')}
                          </Button>
                        )}
                        {status !== 'published' && (
                          <Button variant="gold" icon={<Rocket className="h-4 w-4" />} loading={busy === 'published'} disabled={disabledAll} onClick={onPublish}>
                            {t('actions.publish')}
                          </Button>
                        )}
                        {!isNew && status !== 'archived' && (
                          <Button variant="ghost" className="text-muted" icon={<Archive className="h-4 w-4" />} loading={busy === 'archived'} disabled={disabledAll} onClick={onArchive}>
                            {t('actions.archive')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t('content.editor.history')} icon={<History className="h-4 w-4" />} subtitle={lesson ? `${lesson.versions.length} ${t('common.version').toLowerCase()}` : undefined} />
                <CardBody>
                  {!lesson || lesson.versions.length === 0 ? (
                    <p className="text-sm text-muted">{t('content.editor.noHistory')}</p>
                  ) : (
                    <ol className="scrollbar-thin relative max-h-[22rem] space-y-4 overflow-y-auto border-s border-line ps-5">
                      {lesson.versions.map((v, i) => (
                        <li key={v.id} className="relative">
                          <span
                            className={cn('absolute -start-[1.6rem] top-1 grid h-3 w-3 place-items-center rounded-full ring-4 ring-surface', i === 0 ? 'bg-accent' : 'bg-line')}
                            aria-hidden
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-ink num">v{v.version}</span>
                            <StatusBadge status={v.status} />
                            {i === 0 && <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="current" />}
                          </div>
                          <p className="mt-1 text-sm text-ink/90">{v.note}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {v.author} · {fmtDateTime(v.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardBody>
              </Card>
            </aside>
          </div>

          {/* Sticky action bar */}
          {canEdit && (
            <div className={cn("no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-md", collapsed ? 'lg:ps-[72px]' : 'lg:ps-[260px]')}>
              <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 lg:px-8">
                <span className={cn('inline-flex items-center gap-2 text-xs font-medium', dirty ? 'text-warning' : 'text-muted')}>
                  <span className={cn('h-2 w-2 rounded-full', dirty ? 'animate-pulse bg-warning' : 'bg-success')} />
                  {dirty ? t('content.editor.unsaved') : t('content.editor.allSaved')}
                </span>
                <div className="ms-auto flex gap-2">
                  <Button variant="secondary" disabled={!dirty || !!busy} onClick={() => reset(lessonToForm(lesson))}>
                    {t('actions.reset')}
                  </Button>
                  <Button type="submit" icon={<Save className="h-4 w-4" />} loading={busy === 'save'} disabled={disabledAll || (!dirty && !isNew)}>
                    {isNew ? t('actions.create') : t('actions.saveChanges')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      <ScheduleModal
        open={scheduleOpen}
        title={t('content.editor.scheduleTitle')}
        initial={lesson?.publishAt}
        onClose={() => setScheduleOpen(false)}
        onConfirm={(iso) => {
          setScheduleOpen(false);
          run('scheduled', iso);
        }}
      />
    </div>
  );
}
