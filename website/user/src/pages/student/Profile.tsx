import {
  Bell,
  Camera,
  Check,
  Globe2,
  GraduationCap,
  Lock,
  LogOut,
  MapPin,
  Monitor,
  Phone,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Tablet,
  User as UserIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Modal,
  PageHeader,
  Select,
  Seo,
  Skeleton,
  SkeletonList,
  Switch,
  useToast,
} from '@/components/ui';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/client';
import {
  meApi,
  useNotificationPrefs,
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
  useUpdateMe,
  useUpdateNotificationPrefs,
} from '@/api/me';
import { useGovernorates, useSchools } from '@/api/public';
import { uploadFile } from '@/api/storage';
import { normalizeMobile } from '@/components/auth/mobile';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { Lang, Session } from '@/types';

/** The web profile shows these 6 of the 9 NotificationPrefs toggles (ME-09/10). */
const PREF_KEYS = ['lessons', 'exams', 'payments', 'weekly', 'sms', 'whatsapp', 'email'] as const;
type PrefKey = (typeof PREF_KEYS)[number];

interface FormValues {
  name: string;
  governorate: string;
  school: string;
  email: string;
}

type Confirm = { kind: 'session'; session: Session } | { kind: 'others' } | { kind: 'reset' } | null;

/** Never let a server timestamp read as "in 2 minutes" on a device whose clock is behind. */
const pastIso = (iso: string) => new Date(Math.min(new Date(iso).getTime(), Date.now() - 60_000)).toISOString();

const deviceIcon = (device: string, platform?: string) => {
  if (platform === 'ios' || platform === 'android' || /iphone|android|app/i.test(device)) return Smartphone;
  if (/ipad|tablet/i.test(device)) return Tablet;
  return Monitor;
};

function Section({ icon, title, subtitle, children, className }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5 sm:p-6', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">{icon}</span>
        <CardHeader title={title} subtitle={subtitle} />
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { l, lang, setLang, fmtDate, fmtRelative } = useLang();
  const { user, me, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  // ME-01 (via /auth/me), ME-02 update, ME-03/04/05 sessions, ME-09/10 notification prefs, PUB-02/03 lookups.
  const updateMe = useUpdateMe();
  const sessionsQ = useSessions();
  const revokeSession = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const prefsQ = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const { data: governorates = [] } = useGovernorates();
  const ready = !!user && !sessionsQ.isLoading;
  const prefs = prefsQ.data ?? me?.notificationPrefs;
  const sessions = sessionsQ.data ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const ask = (c: NonNullable<Confirm>) => {
    setConfirm(c);
    setConfirmOpen(true);
  };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: user ? user.name[lang] || user.name.en : '',
      governorate: user?.governorate ?? '',
      school: user?.school ? user.school[lang] || user.school.en : '',
      email: user?.email ?? '',
    },
  });
  const governorate = watch('governorate');
  const { data: schools = [] } = useSchools(governorate || undefined, undefined, !!governorate);

  // Re-sync the form when the profile is refetched (e.g. after saving) and nothing is being edited.
  useEffect(() => {
    if (!user || isDirty) return;
    reset({
      name: user.name[lang] || user.name.en,
      governorate: user.governorate,
      school: user.school ? user.school[lang] || user.school.en : '',
      email: user.email ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name.en, user?.governorate, user?.school?.en, user?.email, lang]);

  if (!user) return null;

  const onSave = async (v: FormValues) => {
    const name = v.name.trim().replace(/\s+/g, ' ');
    const school = v.school.trim();
    const email = v.email.trim().toLowerCase();
    const emailChanged = email !== (user.email ?? '');
    const match = schools.find((s) => s.name.en.toLowerCase() === school.toLowerCase() || s.name.ar === school);
    try {
      await updateMe.mutateAsync({
        name,
        governorateId: v.governorate,
        schoolId: match ? match.id : null,
        schoolName: match ? null : school || null,
        ...(emailChanged ? { email: email || null } : {}),
      });
      reset({ name, governorate: v.governorate, school, email });
      toast.success(emailChanged && email ? t('account.profile.emailLinkSent', { email }) : t('toast.saved'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const changeLang = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    updateMe.mutate({ language: next });
    toast.success(i18n.getFixedT(next)('account.profile.languageChanged'));
  };

  const sendEmailLink = async () => {
    setSendingLink(true);
    try {
      const r = await meApi.requestEmailVerification();
      if (r.alreadyVerified) toast.info(t('account.profile.emailAlready'));
      else toast.success(t('account.profile.emailLinkSent', { email: r.email ?? '' }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSendingLink(false);
    }
  };

  const togglePref = (k: PrefKey, v: boolean) => {
    updatePrefs.mutate({ [k]: v }, { onSuccess: () => toast.success(t('account.profile.notifSaved')) });
  };

  // STO-01 (purpose student_avatar) → PATCH /me { avatarFileKey }.
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const fileKey = await uploadFile(file, 'student_avatar');
      await updateMe.mutateAsync({ avatarFileKey: fileKey });
      toast.success(t('toast.saved'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const others = sessions.filter((s) => !s.current);

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'session') {
        await revokeSession.mutateAsync(confirm.session.id);
        toast.success(t('account.profile.deviceRemoved'));
      } else if (confirm.kind === 'others') {
        await revokeOthers.mutateAsync();
        toast.success(t('account.profile.othersRemoved'));
      } else {
        // AUTH-06: sign out of every device, this one included.
        await authApi.logoutAll(false).catch(() => undefined);
        await logout();
        toast.success(t('account.profile.resetDone'));
        navigate('/');
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
    setConfirmOpen(false);
  };

  const onLogout = () => {
    void logout().then(() => {
      toast.info(t('toast.loggedOut'));
      navigate('/');
    });
  };

  const sub = me?.subscription;
  const pkg = sub && (sub.status === 'active' || sub.status === 'trial') ? sub.package : null;
  const confirmCopy =
    confirm?.kind === 'session'
      ? { title: t('account.profile.confirmDeviceTitle'), body: t('account.profile.confirmDeviceBody', { device: confirm.session.device }) }
      : confirm?.kind === 'others'
        ? { title: t('account.profile.confirmOthersTitle'), body: t('account.profile.confirmOthersBody') }
        : { title: t('account.profile.resetConfirmTitle'), body: t('account.profile.resetConfirmBody') };

  return (
    <>
      <Seo title={t('account.profile.seoTitle')} description={t('account.profile.seoDescription')} />
      <PageHeader title={t('account.profile.title')} subtitle={t('account.profile.subtitle')} />

      {!ready ? (
        <div className="space-y-6" aria-hidden>
          <Skeleton className="h-52 rounded-3xl" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
            <SkeletonList rows={3} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header card */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="card overflow-hidden"
            aria-label={l(user.name)}
          >
            <div className="relative h-28 bg-navy-grad sm:h-32">
              <div className="pointer-events-none absolute -top-10 end-10 h-40 w-40 rounded-full bg-accent/30 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_120%,rgba(201,162,74,0.25),transparent_50%)]" aria-hidden />
            </div>
            <div className="relative px-5 pb-6 sm:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                <div className="relative -mt-12 w-fit shrink-0 sm:-mt-14">
                  <Avatar src={user.avatar} alt={l(user.name)} size={104} className="ring-4 ring-white shadow-lift" />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-hidden
                    tabIndex={-1}
                    onChange={(e) => void onPhoto(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    aria-busy={uploading}
                    aria-label={t('account.profile.changePhoto')}
                    title={t('account.profile.changePhoto')}
                    className="absolute bottom-1 end-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gold-grad text-primary shadow-soft transition hover:scale-110"
                  >
                    <Camera className={cn('h-4 w-4', uploading && 'animate-pulse')} aria-hidden />
                  </button>
                </div>
                <div className="min-w-0 flex-1 sm:pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold text-primary">{l(user.name)}</h2>
                    {pkg && (
                      <Badge tone="gold">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                        {l(pkg.name)}
                      </Badge>
                    )}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
                    <li className="flex items-center gap-1.5">
                      <Phone className="h-4 w-4 text-accent" aria-hidden />
                      <span dir="ltr" className="num">
                        {normalizeMobile(user.mobile)}
                      </span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-accent" aria-hidden />
                      {l(user.governorateName ?? governorates.find((g) => g.id === user.governorate)?.name)}
                    </li>
                    <li className="flex min-w-0 items-center gap-1.5">
                      <GraduationCap className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                      <span className="truncate">{user.school ? l(user.school) : '—'}</span>
                    </li>
                  </ul>
                </div>
                <p className="text-xs font-medium text-muted sm:pt-5">
                  {t('account.profile.memberSince', { date: fmtDate(user.memberSince, { month: 'long', year: 'numeric' }) })}
                </p>
              </div>
            </div>
          </motion.section>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Personal info */}
              <Section icon={<UserIcon className="h-5 w-5" />} title={t('account.profile.personal')} subtitle={t('account.profile.personalSub')}>
                <form onSubmit={handleSubmit(onSave)} noValidate className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={t('account.profile.fullName')}
                    placeholder={t('account.profile.fullNamePlaceholder')}
                    autoComplete="name"
                    error={errors.name?.message}
                    wrapperClassName="sm:col-span-2"
                    {...register('name', {
                      required: t('validation.required'),
                      validate: (v) => v.trim().length >= 3 || t('validation.minLength', { count: 3 }),
                    })}
                  />
                  <Input
                    label={t('account.profile.mobile')}
                    value={normalizeMobile(user.mobile)}
                    readOnly
                    icon={<Lock className="h-4 w-4" />}
                    hint={t('account.profile.mobileLocked')}
                    className="cursor-not-allowed bg-primary/[0.03] text-muted num [unicode-bidi:plaintext]"
                  />
                  <div className="sm:col-span-2">
                    <Input
                      type="email"
                      dir="ltr"
                      label={t('account.profile.email')}
                      placeholder={t('account.profile.emailPlaceholder')}
                      optional={t('common.optional')}
                      autoComplete="email"
                      error={errors.email?.message}
                      hint={
                        user.email
                          ? user.emailVerified
                            ? t('account.profile.emailHint')
                            : t('account.profile.emailUnverified')
                          : t('account.profile.emailHint')
                      }
                      {...register('email', {
                        maxLength: { value: 200, message: t('validation.maxLength', { count: 200 }) },
                        validate: (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || t('account.profile.emailInvalid'),
                      })}
                    />
                    {user.email && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {user.emailVerified ? (
                          <Badge tone="success">
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            {t('account.profile.emailVerified')}
                          </Badge>
                        ) : (
                          <Button type="button" size="sm" variant="outline" loading={sendingLink} onClick={() => void sendEmailLink()}>
                            {t('account.profile.emailSendLink')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <Select label={t('account.profile.governorate')} {...register('governorate', { required: t('validation.required') })} error={errors.governorate?.message}>
                    {governorates.map((g) => (
                      <option key={g.id} value={g.id}>
                        {l(g.name)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label={t('account.profile.school')}
                    placeholder={t('account.profile.schoolPlaceholder')}
                    optional={t('common.optional')}
                    wrapperClassName="sm:col-span-2"
                    list="profile-schools"
                    {...register('school', { maxLength: { value: 80, message: t('validation.maxLength', { count: 80 }) } })}
                  />
                  <datalist id="profile-schools">
                    {schools.map((s) => (
                      <option key={s.id} value={l(s.name)} />
                    ))}
                  </datalist>
                  <div className="flex justify-end sm:col-span-2">
                    <Button
                      type="submit"
                      loading={isSubmitting}
                      disabled={!isDirty}
                      leftIcon={<Save className="h-4 w-4" aria-hidden />}
                    >
                      {isSubmitting ? t('common.saving') : t('account.profile.saveChanges')}
                    </Button>
                  </div>
                </form>
              </Section>

              {/* Notifications */}
              <Section icon={<Bell className="h-5 w-5" />} title={t('account.profile.notifTitle')} subtitle={t('account.profile.notifSub')}>
                <ul className="divide-y divide-primary/5">
                  {PREF_KEYS.map((k) => (
                    <li key={k} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold text-primary">{t(`account.profile.notif.${k}`)}</p>
                        <p className="text-xs text-muted">{t(`account.profile.notif.${k}Hint`)}</p>
                      </div>
                      <Switch checked={!!prefs?.[k]} onChange={(v) => togglePref(k, v)} label={t(`account.profile.notif.${k}`)} />
                    </li>
                  ))}
                </ul>
              </Section>
            </div>

            <div className="space-y-6">
              {/* Language */}
              <Section icon={<Globe2 className="h-5 w-5" />} title={t('account.profile.languageTitle')} subtitle={t('account.profile.languageSub')}>
                <fieldset>
                  <legend className="sr-only">{t('account.profile.languageTitle')}</legend>
                  <div className="grid gap-2.5">
                    {(
                      [
                        { id: 'ar', name: t('lang.arabic'), hint: t('account.profile.languageAr'), dir: 'rtl' },
                        { id: 'en', name: t('lang.english'), hint: t('account.profile.languageEn'), dir: 'ltr' },
                      ] as const
                    ).map((o) => {
                      const on = lang === o.id;
                      return (
                        <label
                          key={o.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition',
                            on ? 'border-accent bg-accent/5 ring-2 ring-accent/30' : 'border-primary/10 hover:border-primary/20',
                          )}
                        >
                          <input
                            type="radio"
                            name="language"
                            value={o.id}
                            checked={on}
                            onChange={() => changeLang(o.id)}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                              on ? 'bg-primary text-accent-light' : 'bg-primary/5 text-primary',
                            )}
                            aria-hidden
                          >
                            {o.id === 'ar' ? t('lang.ar') : t('lang.en')}
                          </span>
                          <span className="min-w-0 flex-1" dir={o.dir} lang={o.id}>
                            <span className="block text-sm font-semibold text-primary">{o.name}</span>
                            <span className="block text-xs text-muted">{o.hint}</span>
                          </span>
                          {on && <Check className="h-5 w-5 shrink-0 text-accent" aria-hidden />}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </Section>

              {/* Sessions */}
              <Section icon={<ShieldCheck className="h-5 w-5" />} title={t('account.profile.sessionsTitle')} subtitle={t('account.profile.sessionsSub')}>
                <ul className="space-y-2.5">
                  <AnimatePresence initial={false}>
                    {sessions.map((s) => {
                      const Icon = deviceIcon(s.device, s.platform);
                      return (
                        <motion.li
                          key={s.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 24, height: 0, marginTop: 0 }}
                          className={cn(
                            'flex items-center gap-3 overflow-hidden rounded-2xl border p-3',
                            s.current ? 'border-accent/30 bg-accent/5' : 'border-primary/5',
                          )}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-primary">
                              <span className="min-w-0 max-w-full truncate" dir="ltr" title={s.device}>
                                {s.device}
                              </span>
                              {s.current && <Badge tone="gold">{t('account.profile.thisDevice')}</Badge>}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {l(s.location)} ·{' '}
                              {s.current
                                ? t('account.profile.activeNow')
                                : t('account.profile.lastActive', { time: fmtRelative(pastIso(s.lastActive)) })}
                            </p>
                          </div>
                          {!s.current && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-danger hover:bg-danger/10"
                              onClick={() => ask({ kind: 'session', session: s })}
                              aria-label={t('account.profile.logoutDeviceAria', { device: s.device })}
                              title={t('account.profile.logoutDevice')}
                            >
                              <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                            </Button>
                          )}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
                {others.length > 0 ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    fullWidth
                    className="mt-4 !h-auto min-h-[2.5rem] !whitespace-normal py-2 text-center"
                    onClick={() => ask({ kind: 'others' })}
                  >
                    {t('account.profile.logoutOthers')}
                  </Button>
                ) : (
                  <p className="mt-4 text-center text-xs text-muted">{t('account.profile.noOtherSessions')}</p>
                )}
              </Section>

              {/* Danger zone */}
              <Card className="border-danger/15 p-5 sm:p-6">
                <CardHeader title={t('account.profile.dangerTitle')} subtitle={t('account.profile.dangerSub')} />
                <div className="mt-5 space-y-3">
                  <div className="flex flex-col items-start gap-3 rounded-2xl bg-cream p-3.5 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-start">
                    <p className="text-xs text-muted">{t('account.profile.resetHint')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ask({ kind: 'reset' })}
                      leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
                      className="max-w-full shrink-0 !h-auto min-h-[2.5rem] !whitespace-normal py-2"
                    >
                      {t('account.profile.reset')}
                    </Button>
                  </div>
                  <div className="flex flex-col items-start gap-3 rounded-2xl bg-danger/5 p-3.5 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-start">
                    <p className="text-xs text-muted">{t('account.profile.logoutHint')}</p>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={onLogout}
                      leftIcon={<LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
                      className="max-w-full shrink-0 !h-auto min-h-[2.5rem] !whitespace-normal py-2"
                    >
                      {t('account.profile.logout')}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        title={confirmCopy.title}
        description={confirmCopy.body}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void runConfirm()} loading={revokeSession.isPending || revokeOthers.isPending}>
              {confirm?.kind === 'reset' ? t('account.profile.reset') : t('account.profile.logoutDevice')}
            </Button>
          </>
        }
      />
    </>
  );
}
