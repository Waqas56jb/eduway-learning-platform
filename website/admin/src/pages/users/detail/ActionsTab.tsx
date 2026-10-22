import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Lock, LockOpen, School, ShieldAlert, Unlock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea, useConfirm } from '@/components/ui';
import { useCan } from '@/store/auth';
import { useLang } from '@/hooks/useLocale';
import { fmtDateTime } from '@/utils/format';
import { errorMessage, isApiError } from '@/api/client';
import { useApiMutation } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { studentsApi, useToggleLock, type AdminStudentDetail } from '@/api/students';

const DURATIONS = [7, 14, 30, 60, 90];

function ActionCard({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={desc} icon={icon} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function ActionsTab({ student }: { student: AdminStudentDetail }) {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const confirm = useConfirm();
  const lookups = useLookups();
  const subjects = lookups.subjects;
  const schools = lookups.schools;
  const name = student.name[lang];
  const canEdit = can('users', 'edit');
  const detailKeys = [qk.students.detail(student.id), qk.students.sub('entitlement-logs', student.id), qk.students.list()];
  const lockMut = useToggleLock(student.id);

  // ── Manual access grant ────────────────────────────────────────────────────
  const grantSchema = z.object({
    subjectId: z.string().min(1, t('errors.required')),
    days: z.coerce.number().int().min(1, t('errors.min', { min: 1 })).max(365, t('errors.max', { max: 365 })),
    reason: z.string().trim().min(5, t('users.actions.reasonRequired')),
  });
  type GrantForm = z.infer<typeof grantSchema>;
  const grant = useForm<GrantForm>({ resolver: zodResolver(grantSchema), defaultValues: { subjectId: subjects[0]?.id ?? '', days: 30, reason: '' } });
  useEffect(() => {
    if (!grant.getValues('subjectId') && subjects[0]) grant.setValue('subjectId', subjects[0].id);
  }, [subjects, grant]);

  const grantMut = useApiMutation((v: GrantForm) => studentsApi.grantAccess(student.id, v), {
    invalidate: detailKeys,
    onSuccess: (_d, v) => {
      const subject = lookups.subject(v.subjectId);
      toast.success(t('users.actions.granted', { subject: subject?.name[lang] ?? '', days: v.days }));
      grant.reset({ subjectId: v.subjectId, days: 30, reason: '' });
    },
  });
  const onGrant = (v: GrantForm) => grantMut.mutate(v);

  // ── Attribution ────────────────────────────────────────────────────────────
  const [schoolId, setSchoolId] = useState(student.schoolId ?? '');
  const [referral, setReferral] = useState(student.referralCode ?? '');
  const attrChanged = schoolId !== (student.schoolId ?? '') || referral.trim() !== (student.referralCode ?? '');

  const [refError, setRefError] = useState<string | null>(null);
  useEffect(() => {
    setSchoolId(student.schoolId ?? '');
    setReferral(student.referralCode ?? '');
  }, [student.schoolId, student.referralCode]);
  const attrMut = useApiMutation(
    (reason: string) => studentsApi.attribution(student.id, { schoolId: schoolId || null, referralCode: referral.trim() || null, reason }),
    {
      invalidate: detailKeys,
      success: 'users.actions.attrDone',
      silentError: true,
      onError: (e) => {
        if (isApiError(e) && e.reason === 'REFERRAL_CODE_INVALID') setRefError(errorMessage(e));
        else toast.error(errorMessage(e));
      },
    },
  );
  const saveAttribution = async () => {
    setRefError(null);
    const ok = await confirm({ title: t('users.actions.attrConfirm', { name }), body: t('users.actions.attrBody'), tone: 'warning', confirmText: t('users.actions.saveAttr'), reason: true });
    if (!ok) return;
    attrMut.mutate(ok.reason);
  };

  // ── Lock / OTP ─────────────────────────────────────────────────────────────
  const toggleLock = async () => {
    const lock = !student.locked;
    const ok = await confirm({
      title: t(lock ? 'users.actions.lockConfirm' : 'users.actions.unlockConfirm', { name }),
      body: t('users.actions.lockDesc'),
      tone: lock ? 'danger' : 'primary',
      confirmText: t(lock ? 'users.actions.lockAccount' : 'users.actions.unlockAccount'),
      reason: true,
    });
    if (!ok) return;
    lockMut.mutate({ lock, reason: ok.reason });
  };

  const otpMut = useApiMutation(() => studentsApi.resetOtp(student.id), { invalidate: [qk.students.detail(student.id)], success: 'users.actions.otpDone' });
  const resetOtp = async () => {
    const ok = await confirm({ title: t('users.actions.otpConfirm', { name }), body: t('users.actions.otpDesc'), tone: 'warning', confirmText: t('users.actions.otpReset') });
    if (!ok) return;
    otpMut.mutate();
  };

  if (!canEdit) {
    return (
      <Card className="flex items-center gap-3 p-5 text-sm text-muted">
        <ShieldAlert className="h-5 w-5 text-warning" /> {t('common.readOnly')}
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ActionCard icon={student.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />} title={t('users.actions.lockTitle')} desc={t('users.actions.lockDesc')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink">
            {t('common.status')}: <strong>{student.locked ? t('status.locked') : t('status.active')}</strong>
          </span>
          <Button variant={student.locked ? 'primary' : 'danger'} loading={lockMut.isPending} icon={student.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />} onClick={toggleLock}>
            {t(student.locked ? 'users.actions.unlockAccount' : 'users.actions.lockAccount')}
          </Button>
        </div>
      </ActionCard>

      <ActionCard icon={<KeyRound className="h-4 w-4" />} title={t('users.actions.otpTitle')} desc={t('users.actions.otpDesc')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-2 text-sm text-ink">
            {t('users.actions.otpFailures', { count: student.otp?.failures ?? 0 })}
            {student.otp?.locked && (
              <Badge tone="danger">
                {t('users.actions.otpLocked')}
                {student.otp.lockedUntil ? ` · ${fmtDateTime(student.otp.lockedUntil)}` : ''}
              </Badge>
            )}
          </span>
          <Button variant="secondary" loading={otpMut.isPending} icon={<KeyRound className="h-4 w-4" />} onClick={resetOtp}>
            {t('users.actions.otpReset')}
          </Button>
        </div>
      </ActionCard>

      <ActionCard icon={<ShieldAlert className="h-4 w-4" />} title={t('users.actions.grantTitle')} desc={t('users.actions.grantDesc')}>
        <form onSubmit={grant.handleSubmit(onGrant)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('users.actions.subject')} error={grant.formState.errors.subjectId?.message} htmlFor="grant-subject" required>
              <Select id="grant-subject" options={subjects.map((s) => ({ value: s.id, label: s.name[lang] }))} {...grant.register('subjectId')} />
            </Field>
            <Field label={t('users.actions.duration')} error={grant.formState.errors.days?.message} htmlFor="grant-days" required>
              <Select id="grant-days" options={DURATIONS.map((d) => ({ value: String(d), label: t('users.actions.durationDays', { count: d }) }))} {...grant.register('days')} />
            </Field>
          </div>
          <Field label={t('users.actions.reason')} error={grant.formState.errors.reason?.message} htmlFor="grant-reason" required>
            <Textarea id="grant-reason" rows={3} placeholder={t('users.actions.reasonPlaceholder')} invalid={!!grant.formState.errors.reason} {...grant.register('reason')} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={grantMut.isPending}>{t('users.actions.grant')}</Button>
          </div>
        </form>
      </ActionCard>

      <ActionCard icon={<School className="h-4 w-4" />} title={t('users.actions.attrTitle')} desc={t('users.actions.attrDesc')}>
        <div className="space-y-4">
          <Field label={t('users.actions.school')} htmlFor="attr-school">
            <Select
              id="attr-school"
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              options={[{ value: '', label: t('users.filters.noSchool') }, ...schools.map((s) => ({ value: s.id, label: `${s.name[lang]} · ${s.code}` }))]}
            />
          </Field>
          <Field label={t('users.actions.referral')} htmlFor="attr-ref" error={refError ?? undefined}>
            <Input id="attr-ref" value={referral} invalid={!!refError} onChange={(e) => { setReferral(e.target.value.toUpperCase()); setRefError(null); }} placeholder="REF-XXX00" dir="ltr" />
          </Field>
          <div className="flex justify-end">
            <Button onClick={saveAttribution} loading={attrMut.isPending} disabled={!attrChanged}>
              {t('users.actions.saveAttr')}
            </Button>
          </div>
        </div>
      </ActionCard>
    </div>
  );
}
