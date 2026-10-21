import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { CheckCircle2, Clapperboard, FileText, Loader2, Plus, RefreshCw, Subtitles, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Lesson, LessonResource, VideoState } from '@/types';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { fmtBytes, fmtDuration } from '@/utils/format';
import { IMAGES } from '@/utils/images';
import { teachers } from '@/data/curriculum';
import { useLessons, useSubjects, useTopics, useUnits } from '@/store/core';
import { useLocalize } from '@/hooks/useLocale';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { FileUpload } from '@/components/ui/FileUpload';
import { ProgressBar } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

/* ─── Schema & mapping ───────────────────────────────────────────────────── */

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
    videoState: z.enum(['none', 'uploading', 'processing', 'ready', 'failed']),
    captions: z.string(),
    resources: z.array(z.object({ id: z.string(), name: z.string(), sizeKb: z.number() })),
    completionThreshold: z.coerce.number().int().min(10, t('content.editor.errors.threshold')).max(100, t('content.editor.errors.threshold')),
    prerequisiteId: z.string(),
  });
}

export type LessonFormValues = z.infer<ReturnType<typeof lessonSchema>>;

export function lessonToForm(l?: Lesson | null, defaults?: Partial<LessonFormValues>): LessonFormValues {
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
      thumbnail: IMAGES.laptopStudy,
      videoState: 'none',
      captions: '',
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
    videoState: l.videoState,
    captions: l.captions ?? '',
    resources: l.resources,
    completionThreshold: l.completionThreshold,
    prerequisiteId: l.prerequisiteId ?? '',
  };
}

/** Form values → lesson fields (without id/status/versions). */
export function formToLesson(v: LessonFormValues): Omit<Lesson, 'id' | 'status' | 'versions' | 'publishAt' | 'updatedAt' | 'views'> {
  return {
    title_en: v.title_en.trim(),
    title_ar: v.title_ar.trim(),
    description_en: v.description_en.trim(),
    description_ar: v.description_ar.trim(),
    subjectId: v.subjectId,
    unitId: v.unitId,
    topicId: v.topicId,
    teacherId: v.teacherId,
    order: v.order,
    durationSec: Math.round(v.durationMin * 60),
    thumbnail: v.thumbnail,
    videoState: v.videoState as VideoState,
    captions: v.captions || null,
    resources: v.resources as LessonResource[],
    completionThreshold: v.completionThreshold,
    prerequisiteId: v.prerequisiteId || null,
  };
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
  const subjects = useSubjects((s) => s.items);
  const units = useUnits((s) => s.items);
  const topics = useTopics((s) => s.items);
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;
  const subjectId = useWatch({ control, name: 'subjectId' });
  const unitId = useWatch({ control, name: 'unitId' });

  const subjectUnits = units.filter((u) => u.subjectId === subjectId).sort((a, b) => a.order - b.order);
  const unitTopics = topics.filter((x) => x.unitId === unitId).sort((a, b) => a.order - b.order);
  const subjectTeachers = teachers.filter((x) => !subjectId || x.subjectId === subjectId);

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

export function LessonMediaSection({ form, icon, disabled }: { form: FormApi; icon?: ReactNode; disabled?: boolean }) {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;
  const thumbnail = useWatch({ control, name: 'thumbnail' });
  const videoState = useWatch({ control, name: 'videoState' }) as VideoState;
  const captions = useWatch({ control, name: 'captions' });
  const durationMin = useWatch({ control, name: 'durationMin' });
  const [progress, setProgress] = useState(videoState === 'ready' ? 100 : 0);
  const [videoFile, setVideoFile] = useState<{ name: string; sizeKb: number } | null>(null);
  const timers = useRef<number[]>([]);
  const videoInput = useRef<HTMLInputElement>(null);
  const captionInput = useRef<HTMLInputElement>(null);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearInterval(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const startUpload = (file: File) => {
    clearTimers();
    setVideoFile({ name: file.name, sizeKb: Math.round(file.size / 1024) });
    setProgress(0);
    setValue('videoState', 'uploading', { shouldDirty: true });
    let p = 0;
    const up = window.setInterval(() => {
      p = Math.min(100, p + 4 + Math.random() * 9);
      setProgress(p);
      if (p >= 100) {
        clearTimers();
        setValue('videoState', 'processing', { shouldDirty: true });
        const proc = window.setTimeout(() => {
          setValue('videoState', 'ready', { shouldDirty: true });
          // Mock metadata probe: read duration from the "transcoder".
          if (!durationMin || Number(durationMin) <= 1) setValue('durationMin', Math.round(14 + Math.random() * 18), { shouldDirty: true });
          toast.success(t('content.editor.uploadDone'));
        }, 2200);
        timers.current.push(proc);
      }
    }, 180);
    timers.current.push(up);
  };

  const meta = STATE_META[videoState];

  return (
    <Section title={t('content.editor.media')} icon={icon}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Field label={t('content.editor.thumbnail')} hint={t('content.editor.thumbnailHint')}>
          <FileUpload
            accept="image/*"
            maxSizeMb={5}
            disabled={disabled}
            preview={thumbnail || null}
            onFile={(_, url) => url && setValue('thumbnail', url, { shouldDirty: true })}
            onClear={() => setValue('thumbnail', '', { shouldDirty: true })}
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
                    <div className="truncate text-sm font-medium text-ink">{videoFile?.name ?? 'lesson-master-1080p.mp4'}</div>
                    <div className={cn('mt-0.5 flex items-center gap-1.5 text-xs font-medium', meta.tone)}>
                      {meta.icon}
                      {t(`content.editor.videoStates.${videoState}`)}
                      {videoState === 'uploading' && <span className="num">· {Math.round(progress)}%</span>}
                      {videoFile && <span className="text-muted">· {fmtBytes(videoFile.sizeKb)}</span>}
                      {videoState === 'ready' && <span className="text-muted num">· {fmtDuration(Number(durationMin || 0) * 60)}</span>}
                    </div>
                  </div>
                </div>
                {(videoState === 'uploading' || videoState === 'processing') && (
                  <ProgressBar className="mt-3" size="sm" tone={videoState === 'uploading' ? 'info' : 'warning'} value={videoState === 'uploading' ? progress : 100} label={t(`content.editor.videoStates.${videoState}`)} />
                )}
                {videoState === 'processing' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['360p', '480p', '720p', '1080p'].map((r, i) => (
                      <span key={r} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', i < 2 ? 'bg-success/10 text-success' : 'animate-pulse bg-warning/10 text-warning')}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
                {!disabled && videoState !== 'uploading' && videoState !== 'processing' && (
                  <div className="mt-3 flex gap-2">
                    <Button size="xs" variant="secondary" onClick={() => videoInput.current?.click()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                      {t('content.editor.replaceVideo')}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-danger hover:bg-danger/10 hover:text-danger"
                      onClick={() => {
                        setVideoFile(null);
                        setProgress(0);
                        setValue('videoState', 'none', { shouldDirty: true });
                      }}
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                    >
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
              {captions || t('content.editor.noCaptions')}
            </span>
            {!disabled && (
              <>
                <button type="button" onClick={() => captionInput.current?.click()} className="text-xs font-semibold text-accent hover:underline">
                  {t('actions.upload')}
                </button>
                {captions && (
                  <button type="button" onClick={() => setValue('captions', '', { shouldDirty: true })} className="text-muted hover:text-danger" aria-label={t('actions.remove')}>
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
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setValue('captions', f.name, { shouldDirty: true });
              e.target.value = '';
            }}
          />
        </Field>
      </div>
    </Section>
  );
}

export function LessonResourcesSection({ form, icon, disabled }: { form: FormApi; icon?: ReactNode; disabled?: boolean }) {
  const { t } = useTranslation();
  const resources = (useWatch({ control: form.control, name: 'resources' }) ?? []) as LessonResource[];
  const input = useRef<HTMLInputElement>(null);
  const set = (next: LessonResource[]) => form.setValue('resources', next, { shouldDirty: true });

  return (
    <Section
      title={t('content.editor.resources')}
      icon={icon}
      action={
        !disabled && (
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => input.current?.click()}>
            {t('content.editor.addResource')}
          </Button>
        )
      }
    >
      {resources.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t('content.editor.noResources')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger/10 text-danger">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{r.name}</div>
                <div className="text-xs text-muted num">PDF · {fmtBytes(r.sizeKb)}</div>
              </div>
              {!disabled && (
                <Button variant="ghost" size="icon-sm" className="hover:text-danger" aria-label={`${t('actions.remove')} ${r.name}`} onClick={() => set(resources.filter((x) => x.id !== r.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
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
          if (files.length) set([...resources, ...files.map((f) => ({ id: uid('res'), name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) }))]);
          e.target.value = '';
        }}
      />
    </Section>
  );
}

export function LessonRulesSection({ form, icon, lessonId, disabled }: { form: FormApi; icon?: ReactNode; lessonId?: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const lessons = useLessons((s) => s.items);
  const subjectId = useWatch({ control: form.control, name: 'subjectId' });
  const options = useMemo(
    () =>
      lessons
        .filter((l) => l.subjectId === subjectId && l.id !== lessonId && l.status !== 'archived')
        .sort((a, b) => a.order - b.order)
        .map((l) => ({ value: l.id, label: `${l.order}. ${L(l, 'title')}` })),
    [lessons, subjectId, lessonId, L],
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
