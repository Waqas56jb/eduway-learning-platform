import { Check, Download, FileText, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Textarea, useToast } from '@/components/ui';
import { useLang } from '@/hooks/useLang';
import { readStore, writeStore } from '@/lib/storage';
import type { Lesson } from '@/types';

export function ResourcesPanel({ lesson }: { lesson: Lesson }) {
  const { t } = useTranslation();
  const { l } = useLang();
  const toast = useToast();

  if (!lesson.resources.length) {
    return <EmptyState icon={<FileText className="h-7 w-7" />} title={t('learn.lesson.resources.empty')} />;
  }

  return (
    <ul className="space-y-3">
      {lesson.resources.map((r, i) => (
        <li
          key={i}
          className="flex items-center gap-4 rounded-2xl border border-primary/5 bg-white p-4 transition hover:border-accent/30 hover:shadow-soft"
        >
          <span className="relative flex h-12 w-11 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <FileText className="h-5 w-5" aria-hidden />
            <span className="absolute -bottom-1.5 rounded bg-danger px-1 text-[9px] font-black uppercase text-white">PDF</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">{l(r.title)}</p>
            <p className="mt-0.5 text-xs text-muted num">
              {t('learn.lesson.resources.pages', { count: r.pages })} · <span dir="ltr">{r.size}</span>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => toast.success(t('learn.lesson.resources.started'), l(r.title))}
            aria-label={t('learn.lesson.resources.downloadFile', { file: l(r.title) })}
          >
            <span className="hidden sm:inline">{t('learn.lesson.resources.download')}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

type SaveState = 'idle' | 'saving' | 'saved';

/** Personal notes for a lesson, autosaved to localStorage. Remount per lesson. */
export function NotesPanel({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const key = `eduway.notes.${lessonId}`;
  const [text, setText] = useState(() => readStore<string>(key, ''));
  const [state, setState] = useState<SaveState>('idle');
  const lastSaved = useRef(text);

  useEffect(() => {
    if (text === lastSaved.current) {
      setState((s) => (s === 'saving' ? 'saved' : s));
      return;
    }
    setState('saving');
    const id = window.setTimeout(() => {
      writeStore(key, text.trim() ? text : null);
      lastSaved.current = text;
      setState('saved');
    }, 700);
    return () => window.clearTimeout(id);
  }, [text, key]);

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
      </p>
    </div>
  );
}
