import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}

interface ToastApi {
  show: (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const colors = { success: 'text-success', error: 'text-danger', info: 'text-accent', warning: 'text-warning' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (toast) => {
      const id = ++idRef.current;
      const item: ToastItem = { duration: 4000, ...toast, id };
      setItems((xs) => [...xs.slice(-3), item]);
      window.setTimeout(() => dismiss(id), item.duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ type: 'success', title, description }),
      error: (title, description) => show({ type: 'error', title, description }),
      info: (title, description) => show({ type: 'info', title, description }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[120] flex flex-col items-center gap-2 px-4 md:bottom-6 md:end-6 md:start-auto md:items-end"
      >
        <AnimatePresence initial={false}>
          {items.map((it) => {
            const Icon = icons[it.type];
            return (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-primary p-4 text-white shadow-lift"
                role="status"
              >
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', colors[it.type])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{it.title}</p>
                  {it.description && <p className="mt-0.5 text-sm text-white/70">{it.description}</p>}
                  {it.action && (
                    <button
                      type="button"
                      onClick={() => {
                        it.action?.onClick();
                        dismiss(it.id);
                      }}
                      className="mt-2 text-sm font-semibold text-accent-light hover:underline"
                    >
                      {it.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(it.id)}
                  aria-label={t('common.close')}
                  className="rounded-lg p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
