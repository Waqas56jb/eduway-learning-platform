import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Check, Copy, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RichText } from '@/components/ui/MathText';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import { StreamingAnswer } from './tutor/StreamingAnswer';
import type { ChatMessage } from './tutor/tutorEngine';

/**
 * KaTeX tuning inside bubbles: inline formulas flow (and wrap) with the surrounding text instead of
 * forming one rigid box, display formulas shrink a little on phones and scroll with a slim scrollbar.
 */
const MATH_TUNING =
  '[&_span.inline-block[dir=ltr]]:inline max-sm:[&_.katex-display>.katex]:text-[0.92em] [&_.overflow-x-auto]:[scrollbar-width:thin] [&_.overflow-x-auto]:[scrollbar-color:rgba(11,31,58,0.15)_transparent]';

interface TutorChatProps {
  messages: ChatMessage[];
  typing: boolean;
  streamingId: string | null;
  /** The streaming message is still receiving deltas from the server. */
  streamingLive?: boolean;
  welcomeText: string;
  onStreamDone: () => void;
  onRate: (id: string, rating: 'up' | 'down') => void;
  /** Resolves to whether the text reached the clipboard. */
  onCopy: (text: string) => Promise<boolean>;
  /** Rendered after the last message (e.g. suggestion chips). */
  footer?: ReactNode;
}

/** Gold tutor avatar used next to every tutor bubble. */
export function TutorAvatar({ size = 36 }: { size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full bg-gold-grad text-primary shadow-[0_6px_18px_-6px_rgba(201,162,74,0.8)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Sparkles style={{ width: size * 0.48, height: size * 0.48 }} />
    </span>
  );
}

function TypingBubble() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="flex items-end gap-3"
    >
      <TutorAvatar size={32} />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-es-md border border-primary/5 bg-white px-4 py-3.5 shadow-soft">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-accent"
            animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
        <span className="sr-only">{t('account.tutor.thinking')}</span>
      </div>
    </motion.div>
  );
}

/** Scrollable, auto-following message list for the AI tutor. */
export function TutorChat({ messages, typing, streamingId, streamingLive = false, welcomeText, onStreamDone, onRate, onCopy, footer }: TutorChatProps) {
  const { t } = useTranslation();
  const { l, fmtDate } = useLang();
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Follow the content as it grows (new messages, streaming text) unless the user scrolled up.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom();
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  // A newly sent message always brings the view back down.
  const last = messages[messages.length - 1];
  useEffect(() => {
    if (last?.role === 'student') {
      stickRef.current = true;
      setAtBottom(true);
      scrollToBottom(true);
    }
  }, [last, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    setAtBottom(near);
  };

  const time = (iso: string) => fmtDate(iso, { hour: 'numeric', minute: '2-digit' });

  const copy = async (m: ChatMessage) => {
    if (!(await onCopy(l(m.content)))) return;
    setCopiedId(m.id);
    window.setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1800);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t('account.tutor.messagesLabel')}
        className="h-full overflow-y-auto overscroll-contain px-3 py-5 sm:px-6"
      >
        <div ref={innerRef} className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.map((m) => {
            if (m.role === 'student') {
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-end gap-1"
                >
                  <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-navy-grad px-4 py-3 text-[15px] leading-relaxed text-white shadow-soft sm:max-w-[75%]">
                    {m.imageUrl && <img src={m.imageUrl} alt="" className="mb-2 max-h-60 rounded-xl object-contain" loading="lazy" />}
                    {l(m.content)}
                  </div>
                  <span className="px-1 text-[11px] text-muted num">
                    {t('account.tutor.you')} · {time(m.at)}
                  </span>
                </motion.div>
              );
            }
            const streaming = m.id === streamingId;
            const isWelcome = m.kind === 'welcome';
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3"
              >
                <TutorAvatar size={32} />
                <div className="min-w-0 max-w-[calc(100%-2.75rem)] sm:max-w-[85%]">
                  <div
                    className={cn(
                      'overflow-hidden rounded-2xl rounded-ss-md border px-4 py-3 text-[15px] text-ink shadow-soft',
                      MATH_TUNING,
                      isWelcome ? 'border-accent/25 bg-gradient-to-br from-accent/[0.08] to-white' : 'border-primary/5 bg-white',
                    )}
                  >
                    {streaming ? (
                      <StreamingAnswer source={l(m.content)} onDone={onStreamDone} live={streamingLive} />
                    ) : (
                      <RichText source={isWelcome ? welcomeText : l(m.content)} />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted">
                    <span className="num">{time(m.at)}</span>
                    {!isWelcome && !streaming && (
                      <>
                        <span aria-hidden className="mx-1 h-1 w-1 rounded-full bg-primary/15" />
                        <button
                          type="button"
                          onClick={() => void copy(m)}
                          aria-label={t('account.tutor.copy')}
                          title={t('account.tutor.copy')}
                          className="rounded-lg p-1.5 transition hover:bg-primary/5 hover:text-primary"
                        >
                          {copiedId === m.id ? (
                            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRate(m.id, 'up')}
                          aria-label={t('account.tutor.helpful')}
                          aria-pressed={m.rating === 'up'}
                          title={t('account.tutor.helpful')}
                          className={cn(
                            'rounded-lg p-1.5 transition hover:bg-primary/5 hover:text-primary',
                            m.rating === 'up' && 'text-success',
                          )}
                        >
                          <ThumbsUp className={cn('h-3.5 w-3.5', m.rating === 'up' && 'fill-success/20')} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRate(m.id, 'down')}
                          aria-label={t('account.tutor.notHelpful')}
                          aria-pressed={m.rating === 'down'}
                          title={t('account.tutor.notHelpful')}
                          className={cn(
                            'rounded-lg p-1.5 transition hover:bg-primary/5 hover:text-primary',
                            m.rating === 'down' && 'text-danger',
                          )}
                        >
                          <ThumbsDown className={cn('h-3.5 w-3.5', m.rating === 'down' && 'fill-danger/20')} aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
          <AnimatePresence>{typing && <TypingBubble key="typing" />}</AnimatePresence>
          {footer}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <AnimatePresence>
          {!atBottom && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              onClick={() => {
                stickRef.current = true;
                setAtBottom(true);
                scrollToBottom(true);
              }}
              aria-label={t('account.tutor.scrollDown')}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-primary/10 bg-white text-primary shadow-lift transition-colors hover:bg-cream"
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
