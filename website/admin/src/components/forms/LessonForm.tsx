import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clapperboard, FileText, Loader2, Plus, RefreshCw, Subtitles, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { VideoState } from '@/types';
import { cn } from '@/utils/cn';
import { fmtBytes, fmtDuration } from '@/utils/format';
import { useLocalize } from '@/hooks/useLocale';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { FileUpload } from '@/components/ui/FileUpload';
import { ProgressBar } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toastError } from '@/api/client';
import { qk } from '@/api/keys';
import { uploadFile, useUpload } from '@/api/storage';
import {
  lessonsApi,
  useLessonOptions,
  useSubjectsQuery,
  useTeachersQuery,
  useUnitsQuery,
  videosApi,
  type LessonVM,
  type LessonWriteDto,
} from '@/api/content';
import type { Lang } from '@/api/types';

/* ─── Schema & mapping ───────────────────────────────────────────────────── */

const resourceSchema = z.object({ id: z.string(), name: z.string(), sizeKb: z.number(), fileKey: z.string().optional() });

export function lessonSchema(t: TFunction) {
  return z.object({
    title_en: z.string().trim().min(3, t('content.editor.errors.titleEn')),
    title_ar: z.string().trim().min(3, t('content.editor.errors.titleAr')),
    description_en: z.string(),
    description_ar: z.string(),
    subjectId: z.string().min(1, t('content.editor.errors.subject')),
    unitId: z.string().min(1, t('content.editor.errors.unit')),
    topicId: z.string().min(1, t('content.editor.errors.topic')),
    teacherId: z.string().min(1, t('content.editor.errors.teacher')),
    order: z.coerce.number().int().min(1, t('errors.min', { min: 1 })),
    durationMin: z.coerce.number().min(0.5, t('content.editor.errors.duration')).max(240, t('errors.max', { max: 240 })),
    thumbnail: z.string(),
    /** undefined = unchanged, null = cleared, string = newly uploaded file key. */
    thumbnailFileKey: z.string().nullable().optional(),
    videoState: z.enum(['none', 'uploading', 'processing', 'ready', 'failed']),
    /** New lessons only: video uploaded before the lesson exists; registered right after create. */
    pendingVideoKey: z.string().optional(),
    captions: z.string(),
    captionsFileKey: z.string().nullable().optional(),
    resources: z.array(resourceSchema),
    completionThreshold: z.coerce.number().int().min(10, t('content.editor.errors.threshold')).max(100, t('content.editor.errors.threshold')),
    prerequisiteId: z.string(),
  });
}

export type LessonFormValues = z.infer<ReturnType<typeof lessonSchema>>;

export function lessonToForm(l?: LessonVM | null, defaults?: Partial<LessonFormValues>): LessonFormValues {
  if (!l) {
    return {
      title_en: '',
      title_ar: '',
      description_en: '',
      description_ar: '',
      subjectId: '',
      unitId: '',
      topicId: '',
      teacherId: '',
      order: 1,
      durationMin: 20,
      thumbnail: '',
      thumbnailFileKey: undefined,
      videoState: 'none',
      pendingVideoKey: undefined,
      captions: '',
      captionsFileKey: undefined,
      resources: [],
      completionThreshold: 80,
      prerequisiteId: '',
      ...defaults,
    };
  }
  return {
    title_en: l.title_en,
    title_ar: l.title_ar,
    description_en: l.description_en,
    description_ar: l.description_ar,
    subjectId: l.subjectId,
    unitId: l.unitId,
    topicId: l.topicId,
    teacherId: l.teacherId,
    order: l.order,
    durationMin: Math.round((l.durationSec / 60) * 10) / 10,
    thumbnail: l.thumbnail,
    thumbnailFileKey: undefined,
    videoState: l.videoState,
    pendingVideoKey: undefined,
    captions: l.captions ?? '',
    captionsFileKey: undefined,
    resources: l.resources,
    completionThreshold: l.completionThreshold,
    prerequisiteId: l.prerequisiteId ?? '',
  };
}

const captionLang = (fileName: string): Lang => (/[._-](en|eng|english)[._-]/i.test(`.${fileName}.`) ? 'en' : 'ar');

/** Form values → LessonWriteDto (ADM-LSN-02/04). */
export function formToWrite(v: LessonFormValues): LessonWriteDto {
  return {
    title: { en: v.title_en.trim(), ar: v.title_ar.trim() },
    description: { en: v.description_en.trim(), ar: v.description_ar.trim() },
    subjectId: v.subjectId,
    unitId: v.unitId,
    topicId: v.topicId,
    teacherId: v.teacherId,
    order: v.order,
    durationSec: Math.round(v.durationMin * 60),
    completionThreshold: v.completionThreshold,
    prerequisiteId: v.prerequisiteId || null,
    ...(v.thumbnailFileKey !== undefined ? { thumbnailFileKey: v.thumbnailFileKey } : {}),
    ...(v.captionsFileKey !== undefined
      ? { captions: v.captionsFileKey ? [{ lang: captionLang(v.captions), fileKey: v.captionsFileKey }] : null }
      : {}),
  };
}

/** After creating a lesson: attach the video and PDFs uploaded while it did not exist yet. */
export async function attachPendingMedia(lessonId: string, v: LessonFormValues) {
  if (v.pendingVideoKey) await videosApi.register({ lessonId, fileKey: v.pendingVideoKey });
  for (const r of v.resources) {
    if (r.fileKey) await lessonsApi.addResource(lessonId, { fileKey: r.fileKey, title: { en: r.name, ar: r.name } });
  }
}

type FormApi = UseFormReturn<LessonFormValues>;

function Section({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} icon={icon} action={action} />
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

/* ─── Sections ───────────────────────────────────────────────────────────── */

export function LessonBasicsSection({ form, icon }: { form: FormApi; icon?: ReactNode }) {
  const { t } = useTranslation();
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <Section title={t('content.editor.basics')} icon={icon}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('content.editor.titleEn')} required error={errors.title_en?.message} htmlFor="l-ten">
          <Input id="l-ten" invalid={!!errors.title_en} {...register('title_en')} />
        </Field>
        <Field label={t('content.editor.titleAr')} required error={errors.title_ar?.message} htmlFor="l-tar">
          <Input id="l-tar" dir="rtl" invalid={!!errors.title_ar} {...register('title_ar')} />
        </Field>
        <Field label={t('content.editor.descEn')} htmlFor="l-den">
          <Textarea id="l-den" rows={4} {...register('description_en')} />
        </Field>
        <Field label={t('content.editor.descAr')} htmlFor="l-dar">
          <Textarea id="l-dar" rows={4} dir="rtl" {...register('description_ar')} />
        </Field>
      </div>
    </Section>
  );
}

export function LessonPlacementSection({ form, icon }: { form: FormApi; icon?: ReactNode }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const subjects = useSubjectsQuery().data ?? [];
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;
  const subjectId = useWatch({ control, name: 'subjectId' });
  const unitId = useWatch({ control, name: 'unitId' });
  const unitsQ = useUnitsQuery(subjectId);
  const teachers = useTeachersQuery().data ?? [];

  const subjectUnits = unitsQ.data ?? [];
  const unitTopics = subjectUnits.find((u) => u.id === unitId)?.topics ?? [];
  const subjectTeachers = teachers.filter((x) => !subjectId || !x.subjectId || x.subjectId === subjectId);

  return (
    <Section title={t('content.editor.placement')} icon={icon}>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t('common.subject')} required error={errors.subjectId?.message} htmlFor="l-sub">
          <Select
            id="l-sub"
            placeholder={t('content.editor.selectSubject')}
            invalid={!!errors.subjectId}
            options={[...subjects].sort((a, b) => a.order - b.order).map((s) => ({ value: s.id, label: L(s, 'name') }))}
            {...register('subjectId', {
              onChange: () => {
                setValue('unitId', '');
                setValue('topicId', '');
                setValue('teacherId', '');
                setValue('prerequisiteId', '');
              },
            })}
          />
        </Field>
        <Field label={t('common.unit')} required error={errors.unitId?.message} htmlFor="l-unit">
          <Select
            id="l-unit"
            placeholder={t('content.editor.selectUnit')}
            disabled={!subjectId}
            invalid={!!errors.unitId}
            options={subjectUnits.map((u) => ({ value: u.id, label: `${u.order}. ${L(u, 'name')}` }))}
            {...register('unitId', { onChange: () => setValue('topicId', '') })}
          />
        </Field>
        <Field label={t('common.topic')} required error={errors.topicId?.message} htmlFor="l-topic">
          <Select id="l-topic" placeholder={t('content.editor.selectTopic')} disabled={!unitId} invalid={!!errors.topicId} options={unitTopics.map((x) => ({ value: x.id, label: L(x, 'name') }))} {...register('topicId')} />
        </Field>
        <Field label={t('common.teacher')} required error={errors.teacherId?.message} htmlFor="l-teacher" className="md:col-span-2">
          <Select id="l-teacher" placeholder={t('content.editor.selectTeacher')} invalid={!!errors.teacherId} options={subjectTeachers.map((x) => ({ value: x.id, label: L(x, 'name') }))} {...register('teacherId')} />
        </Field>
        <Field label={t('content.editor.order')} error={errors.order?.message} htmlFor="l-order">
          <Input id="l-order" type="number" min={1} invalid={!!errors.order} {...register('order')} />
        </Field>
      </div>
    </Section>
  );
}

const STATE_META: Record<VideoState, { tone: string; icon: ReactNode }> = {
  none: { tone: 'text-muted', icon: <Clapperboard className="h-4 w-4" /> },
  uploading: { tone: 'text-info', icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  processing: { tone: 'text-warning', icon: <RefreshCw className="h-4 w-4 animate-spin" /> },
  ready: { tone: 'text-success', icon: <CheckCircle2 className="h-4 w-4" /> },
  failed: { tone: 'text-danger', icon: <XCircle className="h-4 w-4" /> },
};

/**
 * Thumbnail, video and captions. Uploads go straight to storage via signed URLs (STO-01) with real progress.
 * Existing lessons register the video immediately (ADM-VID-01) and poll ADM-VID-03 until ready/failed;
 * new lessons keep the file key and register it right after the lesson is created.
 */
export function LessonMediaSection({ form, icon, disabled, lesson }: { form: FormApi; icon?: ReactNode; disabled?: boolean; lesson?: LessonVM }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;
  const thumbnail = useWatch({ control, name: 'thumbnail' });
  const formVideoState = useWatch({ control, name: 'videoState' }) as VideoState;
  const captions = useWatch({ control, name: 'captions' });
  const durationMin = useWatch({ control, name: 'durationMin' });
  const thumbUpload = useUpload('lesson_thumbnail');
  const captionUpload = useUpload('lesson_captions');
  const [progress, setProgress] = useState<number | null>(null);
  const [processing, setProcessing] = useState<{ id: string; pct: number | null } | null>(null);
  const [videoFile, setVideoFile] = useState<{ name: string; sizeKb: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const captionInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // Poll the asset while the server is transcoding (contract §33: every 3 s).
  const videoId = processing?.id ?? (lesson?.videoState === 'processing' ? lesson.video?.id : undefined);
  useEffect(() => {
    if (!videoId || !lesson) return;
    let stop = false;
    const tick = async () => {
      try {
        const v = await videosApi.get(videoId);
        if (stop) return;
        if (v.streamStatus === 'processing') {
          setProcessing({ id: videoId, pct: v.processingProgress });
          return;
        }
        setProcessing(null);
        await qc.invalidateQueries({ queryKey: qk.lessons.detail(lesson.id) });
        if (v.streamStatus === 'ready') {
          if (!Number(durationMin) || Number(durationMin) <= 1) setValue('durationMin', Math.round((v.durationSec / 60) * 10) / 10, { shouldDirty: true });
          toast.success(t('content.editor.uploadDone'));
        } else toast.error(v.error ?? t('content.editor.videoStates.failed'));
      } catch {
        /* keep polling */
      }
    };
    const h = window.setInterval(tick, 3000);
    tick();
    return () => {
      stop = true;
      window.clearInterval(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, lesson?.id]);

  const videoState: VideoState = progress !== null ? 'uploading' : processing ? 'processing' : formVideoState;
  const shownName = videoFile?.name ?? lesson?.video?.fileName ?? (lesson?.video ? lesson.video.assetId : null);
  const shownSizeKb = videoFile?.sizeKb ?? (lesson?.video ? Math.round(lesson.video.sizeMb * 1024) : null);

  const startUpload = async (file: File) => {
    abort.current?.abort();
    const c = new AbortController();
    abort.current = c;
    const prevState = formVideoState;
    setVideoFile({ name: file.name, sizeKb: Math.round(file.size / 1024) });
    setProgress(0);
    setValue('videoState', 'uploading');
    try {
      const up = await uploadFile(file, 'lesson_video', setProgress, c.signal);
      setProgress(null);
      if (lesson) {
        const v = await videosApi.register({ lessonId: lesson.id, fileKey: up.fileKey, replace: lesson.videoState !== 'none' });
        setProcessing({ id: v.id, pct: v.processingProgress });
        setValue('videoState', 'processing');
      } else {
        setValue('pendingVideoKey', up.fileKey, { shouldDirty: true });
        setValue('videoState', 'processing', { shouldDirty: true });
      }
    } catch (e) {
      setProgress(null);
      setVideoFile(null);
      setValue('videoState', prevState);
      toastError(e);
    }
  };

  const removeVideo = async () => {
    if (lesson && lesson.videoState !== 'none') {
      const ok = await confirm({ title: t('content.editor.removeVideo'), tone: 'danger', confirmText: t('actions.remove') });
      if (!ok) return;
      try {
        const updated = await lessonsApi.removeVideo(lesson.id);
        qc.setQueryData(qk.lessons.detail(lesson.id), updated);
        setValue('videoState', 'none');
      } catch (e) {
        toastError(e);
        return;
      }
    } else {
      setValue('pendingVideoKey', undefined, { shouldDirty: true });
      setValue('videoState', 'none', { shouldDirty: true });
    }
    setVideoFile(null);
    setProcessing(null);
  };

  const meta = STATE_META[videoState];

  return (
    <Section title={t('content.editor.media')} icon={icon}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Field label={t('content.editor.thumbnail')} hint={t('content.editor.thumbnailHint')}>
          <FileUpload
            accept="image/png,image/jpeg,image/webp"
            maxSizeMb={5}
            disabled={disabled || thumbUpload.uploading}
            progress={thumbUpload.progress}
            preview={thumbnail || null}
            onFile={async (file, url) => {
              const prev = thumbnail;
              if (url) setValue('thumbnail', url, { shouldDirty: true });
              const r = await thumbUpload.start(file);
              if (r) setValue('thumbnailFileKey', r.fileKey, { shouldDirty: true });
              else setValue('thumbnail', prev, { shouldDirty: true });
              thumbUpload.reset();
            }}
            onClear={() => {
              setValue('thumbnail', '', { shouldDirty: true });
              setValue('thumbnailFileKey', null, { shouldDirty: true });
            }}
          />
        </Field>

        <Field label={t('content.editor.video')} hint={t('content.editor.videoHint')}>
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            {videoState === 'none' ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => videoInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) startUpload(f);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-7 text-center transition hover:border-accent/60 disabled:opacity-50"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/10 text-accent">
                  <UploadCloud className="h-5 w-5" />
                </span>
                <span className="text-sm text-ink">
                  {t('content.editor.videoDrop')} <span className="font-semibold text-accent">{t('actions.browse')}</span>
                </span>
              </button>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-navy-grad text-accent">
                    <Clapperboard className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{shownName ?? '—'}</div>
                    <div className={cn('mt-0.5 flex items-center gap-1.5 text-xs font-medium', meta.tone)}>
                      {meta.icon}
                      {t(`content.editor.videoStates.${videoState}`)}
                      {videoState === 'uploading' && <span className="num">· {Math.round(progress ?? 0)}%</span>}
                      {videoState === 'processing' && processing?.pct != null && <span className="num">· {Math.round(processing.pct)}%</span>}
                      {shownSizeKb != null && <span className="text-muted">· {fmtBytes(shownSizeKb)}</span>}
                      {videoState === 'ready' && <span className="text-muted num">· {fmtDuration(Number(durationMin || 0) * 60)}</span>}
                    </div>
                  </div>
                  {videoState === 'uploading' && (
                    <Button size="xs" variant="ghost" onClick={() => abort.current?.abort()}>
                      {t('actions.cancel')}
                    </Button>
                  )}
                </div>
                {(videoState === 'uploading' || videoState === 'processing') && (
                  <ProgressBar
                    className="mt-3"
                    size="sm"
                    tone={videoState === 'uploading' ? 'info' : 'warning'}
                    value={videoState === 'uploading' ? (progress ?? 0) : (processing?.pct ?? 100)}
                    label={t(`content.editor.videoStates.${videoState}`)}
                  />
                )}
                {videoState === 'processing' && !lesson && <p className="mt-2 text-xs text-muted">{t('content.editor.videoAfterCreate')}</p>}
                {videoState === 'ready' && lesson?.video?.renditions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {lesson.video.renditions.map((r) => (
                      <span key={r} className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        {r}
                      </span>
                    ))}
                  </div>
                ) : null}
                {!disabled && videoState !== 'uploading' && !(videoState === 'processing' && lesson) && (
                  <div className="mt-3 flex gap-2">
                    <Button size="xs" variant="secondary" onClick={() => videoInput.current?.click()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                      {t('content.editor.replaceVideo')}
                    </Button>
                    <Button size="xs" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={removeVideo} icon={<Trash2 className="h-3.5 w-3.5" />}>
                      {t('content.editor.removeVideo')}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <input
              ref={videoInput}
              type="file"
              accept="video/*"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) startUpload(f);
                e.target.value = '';
              }}
            />
          </div>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('content.editor.duration')} error={errors.durationMin?.message} htmlFor="l-dur">
          <Input id="l-dur" type="number" step="0.5" min={0} suffix={t('common.minutes')} invalid={!!errors.durationMin} disabled={disabled} {...register('durationMin')} />
        </Field>
        <Field label={t('content.editor.captions')} hint={t('content.editor.captionsHint')}>
          <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3">
            <Subtitles className="h-4 w-4 shrink-0 text-muted" />
            <span className={cn('min-w-0 flex-1 truncate text-sm', captions ? 'text-ink' : 'text-muted')} dir="ltr">
              {captionUpload.progress != null ? t('api.uploading', { pct: captionUpload.progress }) : captions || t('content.editor.noCaptions')}
            </span>
            {!disabled && (
              <>
                <button type="button" disabled={captionUpload.uploading} onClick={() => captionInput.current?.click()} className="text-xs font-semibold text-accent hover:underline disabled:opacity-50">
                  {t('actions.upload')}
                </button>
                {captions && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue('captions', '', { shouldDirty: true });
                      setValue('captionsFileKey', null, { shouldDirty: true });
                    }}
                    className="text-muted hover:text-danger"
                    aria-label={t('actions.remove')}
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
          <input
            ref={captionInput}
            type="file"
            accept=".vtt,.srt,text/vtt"
            className="sr-only"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const r = await captionUpload.start(f);
              captionUpload.reset();
              if (!r) return;
              setValue('captions', f.name, { shouldDirty: true });
              setValue('captionsFileKey', r.fileKey, { shouldDirty: true });
            }}
          />
        </Field>
      </div>
    </Section>
  );
}

/**
 * PDF resources. Existing lessons attach/remove immediately (ADM-LSN-13/15); new lessons keep the uploaded
 * file keys and attach them right after creation.
 */
export function LessonResourcesSection({ form, icon, disabled, lesson }: { form: FormApi; icon?: ReactNode; disabled?: boolean; lesson?: LessonVM }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const resources = (useWatch({ control: form.control, name: 'resources' }) ?? []) as LessonFormValues['resources'];
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const set = (next: LessonFormValues['resources']) => form.setValue('resources', next, { shouldDirty: true });
  const refresh = () => (lesson ? qc.invalidateQueries({ queryKey: qk.lessons.detail(lesson.id) }) : Promise.resolve());

  const add = async (files: File[]) => {
    const added: LessonFormValues['resources'] = [];
    for (const f of files) {
      setUploading({ name: f.name, pct: 0 });
      try {
        const up = await uploadFile(f, 'lesson_resource', (pct) => setUploading({ name: f.name, pct }));
        if (lesson) await lessonsApi.addResource(lesson.id, { fileKey: up.fileKey, title: { en: f.name.replace(/\.pdf$/i, ''), ar: f.name.replace(/\.pdf$/i, '') } });
        else added.push({ id: up.fileKey, name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)), fileKey: up.fileKey });
      } catch (e) {
        toastError(e);
      }
    }
    setUploading(null);
    if (lesson) await refresh();
    else if (added.length) set([...resources, ...added]);
  };

  const remove = async (id: string) => {
    if (!lesson) {
      set(resources.filter((x) => x.id !== id));
      return;
    }
    setRemoving(id);
    try {
      await lessonsApi.removeResource(lesson.id, id);
      await refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Section
      title={t('content.editor.resources')}
      icon={icon}
      action={
        !disabled && (
          <Button size="sm" variant="secondary" loading={!!uploading} icon={<Plus className="h-4 w-4" />} onClick={() => input.current?.click()}>
            {t('content.editor.addResource')}
          </Button>
        )
      }
    >
      {uploading && (
        <div className="rounded-lg border border-line px-4 py-2.5">
          <div className="flex justify-between text-xs">
            <span className="truncate text-ink">{uploading.name}</span>
            <span className="text-muted num">{uploading.pct}%</span>
          </div>
          <ProgressBar className="mt-1.5" size="xs" tone="info" value={uploading.pct} label={uploading.name} />
        </div>
      )}
      {resources.length === 0 ? (
        !uploading && <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t('content.editor.noResources')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {resources.map((r) => {
            const file = lesson?.resourceFiles.find((x) => x.id === r.id);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger/10 text-danger">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {file?.url ? (
                    <a href={file.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:text-accent">
                      {r.name}
                    </a>
                  ) : (
                    <div className="truncate text-sm font-medium text-ink">{r.name}</div>
                  )}
                  <div className="text-xs text-muted num">
                    PDF · {fmtBytes(r.sizeKb)}
                    {file?.pages ? ` · ${file.pages} ${t('content.editor.pages')}` : ''}
                  </div>
                </div>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hover:text-danger"
                    loading={removing === r.id}
                    aria-label={`${t('actions.remove')} ${r.name}`}
                    onClick={() => remove(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) add(files);
        }}
      />
    </Section>
  );
}

export function LessonRulesSection({ form, icon, lessonId, disabled }: { form: FormApi; icon?: ReactNode; lessonId?: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const subjectId = useWatch({ control: form.control, name: 'subjectId' });
  const optionsQ = useLessonOptions({ subjectId, excludeArchived: true, sort: 'order' }, !!subjectId);
  const options = useMemo(
    () =>
      (optionsQ.data?.items ?? [])
        .filter((l) => l.id !== lessonId && l.status !== 'archived')
        .sort((a, b) => a.order - b.order)
        .map((l) => ({ value: l.id, label: `${l.order}. ${L(l, 'title')}` })),
    [optionsQ.data, lessonId, L],
  );
  const {
    formState: { errors },
  } = form;

  return (
    <Section title={t('content.editor.rules')} icon={icon}>
      <Controller
        control={form.control}
        name="completionThreshold"
        render={({ field }) => (
          <Field label={t('content.editor.threshold')} hint={t('content.editor.thresholdHint')} error={errors.completionThreshold?.message}>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Number(field.value) || 0}
                disabled={disabled}
                onChange={(e) => field.onChange(Number(e.target.value))}
                aria-label={t('content.editor.threshold')}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-ink/10 accent-[#C9A24A]"
              />
              <span className="w-14 rounded-md bg-accent/10 py-1 text-center text-sm font-semibold text-primary num">{Number(field.value) || 0}%</span>
            </div>
          </Field>
        )}
      />
      <Field label={t('content.editor.prerequisite')} htmlFor="l-pre">
        <Select id="l-pre" disabled={disabled || !subjectId} {...form.register('prerequisiteId')} options={[{ value: '', label: t('content.editor.noPrerequisite') }, ...options]} />
      </Field>
    </Section>
  );
}
