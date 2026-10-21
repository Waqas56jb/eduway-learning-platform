import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { useIsRtl } from '@/hooks/useLocale';

/** Shared overlay behaviour: Esc to close, body scroll lock, focus first field, restore focus. */
function useOverlay(open: boolean, onClose: () => void, panel: React.RefObject<HTMLDivElement>) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus],input:not([type=hidden]),select,textarea') ?? panel.current;
      target?.focus({ preventScroll: true });
    }, 60);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, panel]);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

const MODAL_SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md', className }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { t } = useTranslation();
  useOverlay(open, onClose, panel);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-[#0B1F3A]/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-lift outline-none sm:rounded-2xl',
              MODAL_SIZES[size],
              className,
            )}
          >
            {title && (
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div>
                  <h2 id={titleId} className="text-base font-semibold text-ink">
                    {title}
                  </h2>
                  {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                </div>
                <button onClick={onClose} className="-me-2 rounded-lg p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink" aria-label={t('actions.close')}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

const DRAWER_W = { md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' };

/** Right-side panel (left in RTL) for quick create/edit forms. */
export function Drawer({ open, onClose, title, description, children, footer, width = 'lg' }: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const rtl = useIsRtl();
  const { t } = useTranslation();
  useOverlay(open, onClose, panel);
  const off = rtl ? '-100%' : '100%';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            className="absolute inset-0 bg-[#0B1F3A]/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ x: off }}
            animate={{ x: 0 }}
            exit={{ x: off }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className={cn('absolute inset-y-0 end-0 flex w-full flex-col border-s border-line bg-surface shadow-lift outline-none', DRAWER_W[width])}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-base font-semibold text-ink">
                  {title}
                </h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button onClick={onClose} className="-me-2 rounded-lg p-1.5 text-muted transition hover:bg-ink/5 hover:text-ink" aria-label={t('actions.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
