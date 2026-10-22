import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button, Seo } from '@/components/ui';
import { meApi } from '@/api/me';
import { keys } from '@/api/keys';
import { useAuth } from '@/hooks/useAuth';

type State = { kind: 'checking' } | { kind: 'ok'; email: string } | { kind: 'error'; missing?: boolean };

/** /verify-email?token=… — the link from the "Confirm your email" email (AUTH-30). Works signed in or out. */
export default function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>(token ? { kind: 'checking' } : { kind: 'error', missing: true });
  // The token is single use: never send it twice (React StrictMode runs effects twice in development).
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    meApi
      .confirmEmail(token)
      .then((r) => {
        setState({ kind: 'ok', email: r.email });
        void qc.invalidateQueries({ queryKey: keys.me });
      })
      .catch(() => setState({ kind: 'error' }));
  }, [token, qc]);

  return (
    <section className="relative flex min-h-[75vh] items-center pb-20 pt-32 md:pt-36">
      <Seo title={t('account.verifyEmail.seoTitle')} description={t('account.verifyEmail.seoTitle')} />
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="card mx-auto max-w-lg p-8 text-center"
          role="status"
          aria-live="polite"
        >
          {state.kind === 'checking' && (
            <>
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-accent" aria-hidden />
              <p className="mt-4 text-lg font-semibold text-primary">{t('account.verifyEmail.checking')}</p>
            </>
          )}
          {state.kind === 'ok' && (
            <>
              <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold text-primary">{t('account.verifyEmail.successTitle')}</h1>
              <p className="mt-3 text-muted">
                {t('account.verifyEmail.successBody', { email: state.email })}
              </p>
            </>
          )}
          {state.kind === 'error' && (
            <>
              <MailWarning className="mx-auto h-14 w-14 text-danger" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold text-primary">{t('account.verifyEmail.failTitle')}</h1>
              <p className="mt-3 text-muted">{state.missing ? t('account.verifyEmail.missing') : t('account.verifyEmail.failBody')}</p>
            </>
          )}
          {state.kind !== 'checking' && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {isAuthenticated ? (
                <Button to="/student/profile">{t('account.verifyEmail.toProfile')}</Button>
              ) : (
                <Button to="/">{t('account.verifyEmail.toHome')}</Button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
