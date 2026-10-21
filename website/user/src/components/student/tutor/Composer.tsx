import { ImagePlus, Send } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ComposerProps {
  placeholder: string;
  /** Shorter placeholder for phones, so the empty composer stays one line tall. */
  compactPlaceholder?: string;
  busy: boolean;
  onSend: (text: string) => void;
  onAttach: () => void;
}

/** Auto-growing chat input. Enter sends, Shift+Enter inserts a new line. */
const NARROW = '(max-width: 639px)';

export function Composer({ placeholder, compactPlaceholder, busy, onSend, onAttach }: ComposerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);

  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, narrow]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-end gap-2 rounded-2xl border border-primary/10 bg-white p-2 shadow-soft transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        <button
          type="button"
          onClick={onAttach}
          aria-label={t('account.tutor.attach')}
          title={t('account.tutor.attach')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-primary/5 hover:text-primary"
        >
          <ImagePlus className="h-5 w-5" aria-hidden />
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={narrow && compactPlaceholder ? compactPlaceholder : placeholder}
          aria-label={t('account.tutor.composerLabel')}
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-muted/70"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={t('account.tutor.send')}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
            canSend
              ? 'bg-primary text-white shadow-soft hover:scale-105 hover:bg-primary-light hover:shadow-glow'
              : 'bg-primary/5 text-primary/30',
          )}
        >
          <Send className="h-[18px] w-[18px] rtl:-scale-x-100" aria-hidden />
        </button>
      </div>
      <p className="hidden px-2 text-center text-[11px] text-muted sm:block">
        {t('account.tutor.hint')} · {t('account.tutor.disclaimer')}
      </p>
    </form>
  );
}
