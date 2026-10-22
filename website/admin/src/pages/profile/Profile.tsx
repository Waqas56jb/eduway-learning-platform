import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, KeyRound, Moon, Palette, ShieldCheck, ShieldOff, Sun, UserRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, CardBody, CardFooter, CardHeader, Field, FileUpload, Input, Segmented, SkeletonCard, Switch, useConfirm } from '@/components/ui';
import { useLocalize } from '@/hooks/useLocale';
import { useAuth, useCurrentAdmin, useCurrentRole } from '@/store/auth';
import { useUi } from '@/store/ui';
import { cn } from '@/utils/cn';
import { fmtDate, fmtRelative } from '@/utils/format';
import { adminMeApi, authApi, type MfaSetupDto } from '@/api/auth';
import { errorMessage, isApiError, toastError } from '@/api/client';
import { qk } from '@/api/keys';
import { useUpload } from '@/api/storage';

/* ─── Password strength ───────────────────────────────────────────────────── */
const rules = (p: string) => ({
  length: p.length >= 10,
  case: /[a-z]/.test(p) && /[A-Z]/.test(p),
  number: /\d/.test(p),
  symbol: /[^A-Za-z0-9]/.test(p),
});
const score = (p: string) => (p ? Object.values(rules(p)).filter(Boolean).length : 0);
const STRENGTH_COLORS = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-info', 'bg-success'];

export default function Profile() {
  const { t } = useTranslation();
  const L = useLocalize();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const loading = !me;
  const admin = useCurrentAdmin();
  const role = useCurrentRole();
  const theme = useUi((s) => s.theme);
  const setUiTheme = useUi((s) => s.setTheme);
  const avatarUpload = useUpload('admin_avatar');
  const refreshMe = async () => {
    const fresh = await authApi.me();
    setMe(fresh);
    qc.setQueryData(qk.me, fresh);
  };
  const setTheme = (v: 'light' | 'dark') => {
    setUiTheme(v);
    adminMeApi.preferences({ theme: v }).catch(() => undefined);
  };
  const emailAlerts = me?.preferences.emailAlerts !== false;
  const setEmailAlerts = (v: boolean) => {
    if (me) setMe({ ...me, preferences: { ...me.preferences, emailAlerts: v } });
    adminMeApi
      .preferences({ emailAlerts: v })
      .then(() => toast.success(t('toast.saved')))
      .catch(() => {
        if (me) setMe({ ...me, preferences: { ...me.preferences, emailAlerts: !v } });
      });
  };

  // ── Profile form ────────────────────────────────────────────────────────────
  const profileSchema = z.object({
    name: z.string().trim().min(3, t('profile.nameMin')),
    name_ar: z.string().trim().min(3, t('profile.nameMin')),
    email: z.string().email(t('errors.invalidEmail')),
    mobile: z.string().regex(/^\+964\s?7\d{2}\s?\d{3}\s?\d{4}$/, t('profile.mobileInvalid')),
  });
  type ProfileForm = z.infer<typeof profileSchema>;
  const profileValues = useMemo(
    () => (admin ? { name: admin.name, name_ar: admin.name_ar, email: admin.email, mobile: admin.mobile } : undefined),
    [admin],
  );
  const pf = useForm<ProfileForm>({ resolver: zodResolver(profileSchema), values: profileValues });

  // ── Password form ───────────────────────────────────────────────────────────
  const pwSchema = z
    .object({
      current: z.string().min(1, t('errors.required')),
      next: z.string(),
      confirm: z.string(),
    })
    .superRefine((v, ctx) => {
      if (score(v.next) < 4) ctx.addIssue({ code: 'custom', path: ['next'], message: t('profile.password.weak') });
      else if (v.next === v.current) ctx.addIssue({ code: 'custom', path: ['next'], message: t('profile.password.same') });
      if (v.confirm !== v.next) ctx.addIssue({ code: 'custom', path: ['confirm'], message: t('profile.password.mismatch') });
    });
  type PwForm = z.infer<typeof pwSchema>;
  const pw = useForm<PwForm>({ resolver: zodResolver(pwSchema), defaultValues: { current: '', next: '', confirm: '' } });
  const nextPw = pw.watch('next');
  const strength = score(nextPw);
  const ruleState = rules(nextPw);

  // ── MFA ─────────────────────────────────────────────────────────────────────
  const [setup, setSetup] = useState<MfaSetupDto | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const secret = useMemo(() => (setup?.secret ?? '').replace(/(.{4})/g, '$1 ').trim(), [setup]);

  if (!admin) return null;

  const saveProfile = async (v: ProfileForm) => {
    try {
      await adminMeApi.update({ name: { en: v.name, ar: v.name_ar }, email: v.email, mobile: v.mobile });
      await refreshMe();
      toast.success(t('profile.saved'));
    } catch (e) {
      if (isApiError(e) && Object.keys(e.fields).length) {
        for (const [k, msg] of Object.entries(e.fields)) {
          const field = k === 'name.en' ? 'name' : k === 'name.ar' ? 'name_ar' : (k as keyof ProfileForm);
          pf.setError(field as keyof ProfileForm, { message: msg });
        }
      } else toastError(e);
    }
  };

  const onAvatar = async (file: File) => {
    const r = await avatarUpload.start(file);
    if (!r) return;
    try {
      await adminMeApi.update({ avatarFileKey: r.fileKey });
      await refreshMe();
      toast.success(t('profile.saved'));
    } catch (e) {
      toastError(e);
    } finally {
      avatarUpload.reset();
    }
  };

  const savePassword = async (v: PwForm) => {
    try {
      await adminMeApi.changePassword(v.current, v.next);
      pw.reset();
      toast.success(t('profile.password.updated'));
    } catch (e) {
      if (isApiError(e) && e.status === 401) pw.setError('current', { message: t('profile.password.currentWrong') });
      else if (isApiError(e) && e.reason === 'PASSWORD_POLICY') pw.setError('next', { message: errorMessage(e) });
      else toastError(e);
    }
  };

  const startSetup = async () => {
    setSetupLoading(true);
    try {
      setSetup(await authApi.mfaSetup());
      setRecovery(null);
    } catch (e) {
      toastError(e);
    } finally {
      setSetupLoading(false);
    }
  };

  const verifyMfa = async () => {
    setVerifying(true);
    try {
      const r = await authApi.mfaEnable(code);
      setRecovery(r.recoveryCodes);
      setSetup(null);
      setCode('');
      setCodeError(null);
      await refreshMe();
      toast.success(t('profile.mfa.enabledToast'));
    } catch (e) {
      setCodeError(isApiError(e) && (e.status === 401 || e.reason === 'MFA_INVALID') ? t('profile.mfa.invalid') : errorMessage(e));
    } finally {
      setVerifying(false);
    }
  };

  const disableMfa = async () => {
    const ok = await confirm({
      title: t('profile.mfa.disable'),
      tone: 'danger',
      reason: { label: t('profile.mfa.step3'), placeholder: '123456' },
    });
    if (!ok) return;
    try {
      const value = ok.reason.trim();
      await authApi.mfaDisable(/^\d{6}$/.test(value) ? { code: value } : { password: value });
      setRecovery(null);
      await refreshMe();
      toast.success(t('profile.mfa.disabledToast'));
    } catch (e) {
      toastError(e);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(setup?.secret ?? '');
      toast.success(t('toast.copied'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonCard lines={6} className="xl:col-span-2" />
          <SkeletonCard lines={6} />
        </div>
      </div>
    );
  }

  const pe = pf.formState.errors;
  const we = pw.formState.errors;

  return (
    <div>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Details */}
          <Card>
            <CardHeader title={t('profile.details')} subtitle={t('profile.detailsSub')} icon={<UserRound className="h-4 w-4" />} />
            <form onSubmit={pf.handleSubmit(saveProfile)} noValidate>
              <CardBody>
                <div className="mb-6 flex flex-wrap items-center gap-4">
                  <div className="w-24">
                    <Avatar name={admin.name} src={admin.avatar} size="xl" />
                    <FileUpload
                      compact
                      accept="image/png,image/jpeg,image/webp"
                      maxSizeMb={5}
                      progress={avatarUpload.progress}
                      disabled={avatarUpload.uploading}
                      onFile={(f) => onAvatar(f)}
                      label={<span className="text-xs">{t('actions.upload')}</span>}
                      hint=""
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-ink">{L(admin, 'name') !== '—' ? L(admin, 'name') : admin.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {role && <Badge tone="accent">{L(role, 'name')}</Badge>}
                      <span>{t('profile.memberSince', { date: fmtDate(admin.createdAt) })}</span>
                      {admin.lastLogin && <span>· {t('profile.lastLogin', { time: fmtRelative(admin.lastLogin) })}</span>}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('profile.nameEn')} error={pe.name?.message} htmlFor="pf-name" required>
                    <Input id="pf-name" invalid={!!pe.name} {...pf.register('name')} />
                  </Field>
                  <Field label={t('profile.nameAr')} error={pe.name_ar?.message} htmlFor="pf-name-ar" required>
                    <Input id="pf-name-ar" dir="rtl" lang="ar" invalid={!!pe.name_ar} {...pf.register('name_ar')} />
                  </Field>
                  <Field label={t('profile.email')} error={pe.email?.message} htmlFor="pf-email" required>
                    <Input id="pf-email" type="email" dir="ltr" invalid={!!pe.email} {...pf.register('email')} />
                  </Field>
                  <Field label={t('profile.mobile')} error={pe.mobile?.message} htmlFor="pf-mobile" required>
                    <Input id="pf-mobile" dir="ltr" invalid={!!pe.mobile} {...pf.register('mobile')} />
                  </Field>
                </div>
              </CardBody>
              <CardFooter>
                <Button variant="secondary" onClick={() => pf.reset()} disabled={!pf.formState.isDirty}>
                  {t('actions.reset')}
                </Button>
                <Button type="submit" disabled={!pf.formState.isDirty} loading={pf.formState.isSubmitting}>
                  {t('actions.saveChanges')}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader title={t('profile.password.title')} subtitle={t('profile.password.sub')} icon={<KeyRound className="h-4 w-4" />} />
            <form onSubmit={pw.handleSubmit(savePassword)} noValidate>
              <CardBody className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <Field label={t('profile.password.current')} error={we.current?.message} htmlFor="pw-current" required>
                    <Input id="pw-current" type="password" autoComplete="current-password" invalid={!!we.current} {...pw.register('current')} />
                  </Field>
                  <Field label={t('profile.password.new')} error={we.next?.message} htmlFor="pw-new" required>
                    <Input id="pw-new" type="password" autoComplete="new-password" invalid={!!we.next} {...pw.register('next')} />
                  </Field>
                  <Field label={t('profile.password.confirm')} error={we.confirm?.message} htmlFor="pw-confirm" required>
                    <Input id="pw-confirm" type="password" autoComplete="new-password" invalid={!!we.confirm} {...pw.register('confirm')} />
                  </Field>
                </div>
                <div className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">{t('profile.password.strength')}</span>
                    <span className="text-muted">{t(`profile.password.levels.${strength}`)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden>
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className={cn('h-1.5 rounded-full transition-colors', i <= strength ? STRENGTH_COLORS[strength] : 'bg-ink/10')} />
                    ))}
                  </div>
                  <ul className="mt-4 space-y-2">
                    {(Object.keys(ruleState) as (keyof typeof ruleState)[]).map((k) => (
                      <li key={k} className={cn('flex items-center gap-2 text-sm', ruleState[k] ? 'text-success' : 'text-muted')}>
                        {ruleState[k] ? <Check className="h-4 w-4" /> : <X className="h-4 w-4 opacity-60" />}
                        {t(`profile.password.rules.${k}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardBody>
              <CardFooter>
                <Button type="submit" loading={pw.formState.isSubmitting}>{t('profile.password.update')}</Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          {/* MFA */}
          <Card>
            <CardHeader
              title={t('profile.mfa.title')}
              subtitle={t('profile.mfa.sub')}
              icon={<ShieldCheck className="h-4 w-4" />}
              action={<Badge tone={admin.mfaEnabled ? 'success' : 'warning'} dot>{admin.mfaEnabled ? t('profile.mfa.enabled') : t('profile.mfa.disabled')}</Badge>}
            />
            <CardBody>
              {recovery && (
                <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <p className="text-sm font-semibold text-ink">{t('auth.recoveryTitle')}</p>
                  <p className="mt-1 text-xs text-muted">{t('auth.recoverySub')}</p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-xs" dir="ltr">
                    {recovery.map((c) => (
                      <span key={c} className="rounded bg-surface px-2 py-1 ring-1 ring-line">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {admin.mfaEnabled ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl bg-success/[0.07] p-4 text-sm text-ink">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    {t('profile.mfa.activeNote')}
                  </div>
                  <Button variant="secondary" className="w-full" icon={<ShieldOff className="h-4 w-4" />} onClick={disableMfa}>
                    {t('profile.mfa.disable')}
                  </Button>
                </div>
              ) : !setup ? (
                <Button className="w-full" icon={<ShieldCheck className="h-4 w-4" />} onClick={startSetup} loading={setupLoading}>
                  {t('profile.mfa.enable')}
                </Button>
              ) : (
                <ol className="space-y-5">
                  <li>
                    <p className="mb-3 text-sm font-medium text-ink">1. {t('profile.mfa.step1')}</p>
                    <div className="flex justify-center">
                      <img src={setup.qrDataUrl} alt="QR code" className="h-44 w-44 rounded-xl bg-white p-1 shadow-card ring-1 ring-line" />
                    </div>
                  </li>
                  <li>
                    <p className="mb-2 text-sm font-medium text-ink">2. {t('profile.mfa.step2')}</p>
                    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                      <code className="flex-1 font-mono text-sm tracking-wider text-ink" dir="ltr">
                        {secret}
                      </code>
                      <button type="button" onClick={copySecret} className="rounded p-1 text-muted hover:text-accent" aria-label={t('actions.copy')}>
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                  <li>
                    <p className="mb-2 text-sm font-medium text-ink">3. {t('profile.mfa.step3')}</p>
                    <div className="flex gap-2">
                      <Input
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setCodeError(null);
                        }}
                        inputMode="numeric"
                        placeholder="123456"
                        dir="ltr"
                        aria-label={t('profile.mfa.step3')}
                        invalid={!!codeError}
                        className="text-center font-semibold tracking-[0.4em]"
                      />
                      <Button onClick={verifyMfa} disabled={code.length !== 6} loading={verifying}>
                        {t('profile.mfa.verify')}
                      </Button>
                    </div>
                    {codeError && <p className="mt-1.5 text-xs font-medium text-danger">{codeError}</p>}
                  </li>
                  <li>
                    <Button variant="ghost" size="sm" onClick={() => setSetup(null)}>
                      {t('actions.cancel')}
                    </Button>
                  </li>
                </ol>
              )}
            </CardBody>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader title={t('profile.prefs.title')} icon={<Palette className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-ink">{t('profile.prefs.language')}</div>
                  <div className="text-xs text-muted">{t('profile.prefs.languageSub')}</div>
                </div>
                <LanguageSwitcher />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-ink">{t('profile.prefs.theme')}</div>
                  <div className="text-xs text-muted">{t('profile.prefs.themeSub')}</div>
                </div>
                <Segmented
                  size="sm"
                  aria-label={t('profile.prefs.theme')}
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="h-3.5 w-3.5" />{t('profile.prefs.light')}</span> },
                    { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="h-3.5 w-3.5" />{t('profile.prefs.dark')}</span> },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{t('profile.prefs.emailAlerts')}</div>
                  <div className="text-xs text-muted">{t('profile.prefs.emailAlertsSub')}</div>
                </div>
                <Switch checked={emailAlerts} onChange={setEmailAlerts} aria-label={t('profile.prefs.emailAlerts')} />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
