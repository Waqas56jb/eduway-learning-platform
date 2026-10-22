import { FileText, LogOut, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAcceptLegal } from '@/api/legal';
import { Button, Checkbox, Modal } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

/** Re-acceptance prompt shown when a newer Terms / Privacy version is published (`user.pendingLegal`, AUTH-08). */
export function LegalPrompt() {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const accept = useAcceptLegal();
  const [agreed, setAgreed] = useState(false);
  const pending = isAuthenticated ? (user?.pendingLegal ?? []) : [];
  if (!pending.length) return null;

  return (
    <Modal
      open
      persistent
      onClose={() => undefined}
      title={t('system.legal.title')}
      description={t('system.legal.body')}
      footer={
        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={() => void logout()} leftIcon={<LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}>
            {t('student.nav.logout')}
          </Button>
          <Button
            variant="gold"
            disabled={!agreed}
            loading={accept.isPending}
            onClick={() => accept.mutate(pending)}
            leftIcon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          >
            {t('system.legal.accept')}
          </Button>
        </div>
      }
    >
      <ul className="space-y-2">
        {pending.map((d) => (
          <li key={d.doc}>
            <a
              href={`/${d.doc}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:border-accent hover:bg-accent/5"
            >
              <FileText className="h-4 w-4 text-accent" aria-hidden />
              <span className="flex-1">{t(`system.legal.docs.${d.doc}`)}</span>
              <span className="num text-xs font-medium text-muted" dir="ltr">
                v{d.version}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} label={t('system.legal.agree')} />
      </div>
    </Modal>
  );
}
