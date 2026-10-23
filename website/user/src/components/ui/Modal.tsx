import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hide the close (×) button and disable backdrop/Escape dismissal. */
  persistent?: boolean;
  className?: string;
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onClose, title, description, children, footer, size = 'md', persistent, className }: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        'button:not([data-modal-close]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (el ?? panelRef.current)?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
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
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, persistent, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-primary/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={persistent ? undefined : onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={cn(
              // Phones: bottom sheet (sm/md) or full-screen sheet (lg/xl, e.g. the lesson quiz); centred dialog from `sm` up.
              'relative w-full overflow-y-auto overscroll-contain bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift outline-none sm:max-h-[92vh] sm:rounded-3xl sm:p-8',
              size === 'lg' || size === 'xl' ? 'h-[100svh] max-h-[100svh] sm:h-auto' : 'max-h-[92svh] rounded-t-3xl',
              widths[size],
              className,
            )}
          >
            {!persistent && (
              <button
                type="button"
                data-modal-close
                onClick={onClose}
                aria-label={t('common.close')}
                className="absolute end-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-primary/5 hover:text-primary sm:end-4 sm:top-4"
              >
                <X className="h-5 w-5" />
              </button>
            )}
            {title && (
              <h2 id={titleId} className="pe-10 text-xl font-bold text-primary sm:text-2xl">
                {title}
              </h2>
            )}
            {description && <p className="mt-2 text-muted">{description}</p>}
            {children && <div className={cn(title || description ? 'mt-6' : '')}>{children}</div>}
            {footer && <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
