import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, MailCheck, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { AuthShell } from './AuthShell';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const schema = z.object({ email: z.string().email(t('auth.emailInvalid')) });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  return (
    <AuthShell title={t('auth.forgotTitle')}>
      {sentTo ? (
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
            <MailCheck className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-xl font-bold text-primary">{t('auth.forgotTitle')}</h1>
          <p className="mt-2 text-sm text-muted">{t('auth.linkSent', { email: sentTo })}</p>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold text-primary">{t('auth.forgotTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('auth.forgotSub')}</p>
          <form
            className="mt-6 space-y-4"
            noValidate
            onSubmit={handleSubmit(async (v) => {
              await new Promise((r) => setTimeout(r, 700));
              setSentTo(v.email);
            })}
          >
            <Field label={t('auth.email')} error={errors.email?.message} htmlFor="fp-email">
              <Input id="fp-email" type="email" icon={<Mail />} placeholder="name@eduway.iq" invalid={!!errors.email} {...register('email')} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              {t('auth.sendLink')}
            </Button>
          </form>
        </>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4 flip-rtl" /> {t('auth.backToLogin')}
      </Link>
    </AuthShell>
  );
}
