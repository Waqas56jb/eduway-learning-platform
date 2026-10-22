import { Check, Download, FileText, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/api/client';
import { lessonsApi, useLessonNote, useSaveLessonNote } from '@/api/lessons';
import type { LessonDetail } from '@/api/types';
import { Button, EmptyState, Skeleton, Textarea, useToast } from '@/components/ui';
import { useLang } from '@/hooks/useLang';

/** Lesson PDFs — downloaded through a signed, expiring URL (CAT-07). */
export function ResourcesPanel({ lesson }: { lesson: LessonDetail }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!lesson.resources.length) {
    return <EmptyState icon={<FileText className="h-7 w-7" />} title={t('learn.lesson.resources.empty')} />;
  }

  const download = async (resourceId: string, title: string) => {
    setBusy(resourceId);
    try {
      const res = await lessonsApi.resourceUrl(lesson.id, resourceId);
      const a = document.createElement('a');
      a.href = res.url;
      a.download = res.fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(t('learn.lesson.resources.started'), title);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="space-y-3">
      {lesson.resources.map((r) => (
        <li
          key={r.id}
          className="flex items-center gap-4 rounded-2xl border border-primary/5 bg-white p-4 transition hover:border-accent/30 hover:shadow-soft"
        >
          <span className="relative flex h-12 w-11 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <FileText className="h-5 w-5" aria-hidden />
            <span className="absolute -bottom-1.5 rounded bg-danger px-1 text-[9px] font-black uppercase text-white">PDF</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">{l(r.title)}</p>
            <p className="mt-0.5 text-xs text-muted num">
              {r.pages !== null && <>{t('learn.lesson.resources.pages', { count: r.pages })} · </>}
              <span dir="ltr">{r.size}</span>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            loading={busy === r.id}
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => void download(r.id, l(r.title))}
            aria-label={t('learn.lesson.resources.downloadFile', { file: l(r.title) })}
          >
            <span className="hidden sm:inline">{t('learn.lesson.resources.download')}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Personal notes for a lesson (CAT-08 / CAT-09), autosaved 700 ms after typing stops. Remount per lesson. */
export function NotesPanel({ lessonId }: { lessonId: string }) {
  const note = useLessonNote(lessonId);
  if (note.isLoading) return <Skeleton className="h-48 rounded-2xl" />;
  return <NotesEditor lessonId={lessonId} initial={note.data?.text ?? ''} />;
}

function NotesEditor({ lessonId, initial }: { lessonId: string; initial: string }) {
  const { t } = useTranslation();
  const save = useSaveLessonNote(lessonId);
  const [text, setText] = useState(initial);
  const [state, setState] = useState<SaveState>('idle');
  const lastSaved = useRef(initial);
  const latest = useRef(text);
  latest.current = text;

  useEffect(() => {
    if (text === lastSaved.current) {
      setState((s) => (s === 'saving' ? 'saved' : s));
      return;
    }
    setState('saving');
    const id = window.setTimeout(() => {
      const value = text;
      save
        .mutateAsync(value.trim() ? value : '')
        .then(() => {
          lastSaved.current = value;
          if (latest.current === value) setState('saved');
        })
        .catch(() => setState('error'));
    }, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div>
      <Textarea
        label={t('learn.lesson.notes.label')}
        placeholder={t('learn.lesson.notes.placeholder')}
        hint={t('learn.lesson.notes.hint')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        maxLength={5000}
      />
      <p className="mt-2 flex h-5 items-center gap-1.5 text-xs font-semibold" aria-live="polite">
        {state === 'saving' && (
          <span className="flex items-center gap-1.5 text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('common.saving')}
          </span>
        )}
        {state === 'saved' && (
          <span className="flex items-center gap-1.5 text-success">
            <Check className="h-3.5 w-3.5" aria-hidden />
            {t('common.saved')}
          </span>
        )}
        {state === 'error' && <span className="text-danger">{t('errors.UNKNOWN')}</span>}
      </p>
    </div>
  );
}
