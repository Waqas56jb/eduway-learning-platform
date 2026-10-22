import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, RotateCcw, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/store/auth';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

/** Local draft of a singleton settings value with dirty tracking. */
export function useDraft<T extends object>(value: T) {
  const [draft, setDraft] = useState<T>(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const set = <K extends keyof T>(key: K, v: T[K]) => setDraft((d) => ({ ...d, [key]: v }));
  return { draft, setDraft, set, dirty, reset: () => setDraft(value) };
}

export function useCanEditSettings() {
  return useCan()('settings', 'edit');
}

/** Read-only notice for roles without settings.edit. */
export function ReadOnlyNotice() {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm text-ink/80">
      <Lock className="h-4 w-4 text-warning" /> {t('common.readOnly')}
    </div>
  );
}

/** Sticky bottom bar that appears while a settings form has unsaved changes. */
export function SaveBar({ dirty, onSave, onReset, saving }: { dirty: boolean; onSave: () => void; onReset: () => void; saving?: boolean }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="sticky bottom-4 z-20 mt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-surface/95 px-4 py-3 shadow-lift backdrop-blur">
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              {t('common.unsavedChanges')}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onReset} icon={<RotateCcw className="h-4 w-4" />}>
                {t('actions.reset')}
              </Button>
              <Button size="sm" onClick={onSave} loading={saving} icon={<Save className="h-4 w-4" />}>
                {t('actions.saveChanges')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Toggleable pill chips (platforms, placements…). */
export function ChipToggle<K extends string>({
  options,
  value,
  onChange,
  disabled,
  min = 0,
}: {
  options: { value: K; label: ReactNode }[];
  value: K[];
  onChange: (next: K[]) => void;
  disabled?: boolean;
  /** Minimum number of selected chips (prevents deselecting the last one). */
  min?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled || (on && value.length <= min)}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-60',
              on ? 'bg-accent/15 text-primary ring-accent/50' : 'bg-surface text-muted ring-line hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Section({ title, subtitle, icon, children, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} />
      <CardBody className="space-y-5">{children}</CardBody>
    </Card>
  );
}
