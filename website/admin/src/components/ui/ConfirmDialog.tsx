import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';
import { Field, Input, Textarea } from './Input';
import { cn } from '@/utils/cn';

export interface ConfirmOptions {
  title: ReactNode;
  body?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary' | 'warning';
  /** Show a reason textarea; confirmation is blocked until it's filled. */
  reason?: boolean | { label?: string; placeholder?: string };
  /** Require typing this exact word to enable the confirm button. */
  typeToConfirm?: string;
}

export interface ConfirmResult {
  reason: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult | null>;

const Ctx = createContext<ConfirmFn | null>(null);

/**
 * `const confirm = useConfirm(); const ok = await confirm({ title, body, tone: 'danger' }); if (!ok) return;`
 * Resolves to `{ reason }` on confirm or `null` on cancel.
 */
export function useConfirm() {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const resolver = useRef<(r: ConfirmResult | null) => void>();

  const confirm = useCallback<ConfirmFn>((o) => {
    setReason('');
    setTyped('');
    setOpts(o);
    return new Promise((res) => {
      resolver.current = res;
    });
  }, []);

  const finish = (r: ConfirmResult | null) => {
    resolver.current?.(r);
    resolver.current = undefined;
    setOpts(null);
  };

  const tone = opts?.tone ?? 'danger';
  const needReason = !!opts?.reason;
  const reasonCfg = typeof opts?.reason === 'object' ? opts.reason : {};
  const blocked = (needReason && reason.trim().length < 3) || (!!opts?.typeToConfirm && typed !== opts.typeToConfirm);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => finish(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => finish(null)}>
              {opts?.cancelText ?? t('actions.cancel')}
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={blocked}
              onClick={() => finish({ reason: reason.trim() })}
              data-autofocus={!needReason && !opts?.typeToConfirm ? true : undefined}
            >
              {opts?.confirmText ?? t('actions.confirm')}
            </Button>
          </>
        }
      >
        {opts && (
          <div className="flex gap-4">
            <span
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-full',
                tone === 'danger' ? 'bg-danger/10 text-danger' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-accent/15 text-accent',
              )}
            >
              {tone === 'primary' ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-ink">{opts.title}</h2>
                {opts.body && <div className="mt-1 text-sm text-muted">{opts.body}</div>}
              </div>
              {needReason && (
                <Field label={reasonCfg.label ?? t('common.reason')} required>
                  <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonCfg.placeholder} />
                </Field>
              )}
              {opts.typeToConfirm && (
                <Field label={t('confirm.typeToConfirm', { word: opts.typeToConfirm })}>
                  <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                </Field>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}
