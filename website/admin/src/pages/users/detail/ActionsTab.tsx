import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { KeyRound, Lock, LockOpen, School, ShieldAlert, Unlock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea, useConfirm } from '@/components/ui';
import { logAudit } from '@/store/audit';
import { useCan } from '@/store/auth';
import { useSchools, useStudents, useSubjects } from '@/store/core';
import type { Student } from '@/types';
import { useLocalize } from '@/hooks/useLocale';
import { MOCK_NOW } from '@/utils/random';

const DURATIONS = [7, 14, 30, 60, 90];

function ActionCard({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={desc} icon={icon} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function ActionsTab({ student }: { student: Student }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const update = useStudents((s) => s.update);
  const subjects = useSubjects((s) => s.items);
  const schools = useSchools((s) => s.items);
  const name = L(student, 'name');
  const canEdit = can('users', 'edit');

  // ── Manual access grant ────────────────────────────────────────────────────
  const grantSchema = z.object({
    subjectId: z.string().min(1, t('errors.required')),
    days: z.coerce.number().int().min(1, t('errors.min', { min: 1 })).max(365, t('errors.max', { max: 365 })),
    reason: z.string().trim().min(5, t('users.actions.reasonRequired')),
  });
  type GrantForm = z.infer<typeof grantSchema>;
  const grant = useForm<GrantForm>({ resolver: zodResolver(grantSchema), defaultValues: { subjectId: subjects[0]?.id ?? '', days: 30, reason: '' } });

  const onGrant = (v: GrantForm) => {
    const subject = subjects.find((s) => s.id === v.subjectId);
    const expiresAt = addDays(MOCK_NOW, v.days).toISOString();
    update(
      student.id,
      { entitlements: [...student.entitlements.filter((e) => !(e.subjectId === v.subjectId && e.source === 'manual')), { subjectId: v.subjectId, expiresAt, source: 'manual' }] },
      { action: 'student.grant_access', summary: `Manual access to ${subject?.name_en} for ${v.days} days — ${v.reason}` },
    );
    toast.success(t('users.actions.granted', { subject: L(subject, 'name'), days: v.days }));
    grant.reset({ subjectId: v.subjectId, days: 30, reason: '' });
  };

  // ── Attribution ────────────────────────────────────────────────────────────
  const [schoolId, setSchoolId] = useState(student.schoolId ?? '');
  const [referral, setReferral] = useState(student.referralCode ?? '');
  const attrChanged = schoolId !== (student.schoolId ?? '') || referral.trim() !== (student.referralCode ?? '');

  const saveAttribution = async () => {
    const ok = await confirm({ title: t('users.actions.attrConfirm', { name }), body: t('users.actions.attrBody'), tone: 'warning', confirmText: t('users.actions.saveAttr'), reason: true });
    if (!ok) return;
    const school = schools.find((s) => s.id === schoolId);
    update(
      student.id,
      {
        schoolId: schoolId || null,
        referralCode: referral.trim() || null,
        marketerId: school?.marketerId ?? student.marketerId,
        source: schoolId ? 'school' : referral.trim() ? 'referral' : student.source,
      },
      { action: 'student.change_attribution', summary: `Changed attribution for ${student.name_en} — ${ok.reason}` },
    );
    toast.success(t('users.actions.attrDone'));
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
    update(student.id, lock ? { locked: true, sessions: [] } : { locked: false }, {
      action: lock ? 'student.lock' : 'student.unlock',
      summary: `${lock ? 'Locked' : 'Unlocked'} account of ${student.name_en} — ${ok.reason}`,
    });
    toast.success(t(lock ? 'users.actions.lockedToast' : 'users.actions.unlockedToast'));
  };

  const resetOtp = async () => {
    const ok = await confirm({ title: t('users.actions.otpConfirm', { name }), body: t('users.actions.otpDesc'), tone: 'warning', confirmText: t('users.actions.otpReset') });
    if (!ok) return;
    logAudit({ action: 'student.reset_otp', entity: 'student', entityId: student.id, summary: `Reset OTP attempts and lockout for ${student.name_en}`, before: { otpFailures: 5, otpLocked: true }, after: { otpFailures: 0, otpLocked: false } });
    toast.success(t('users.actions.otpDone'));
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
          <Button variant={student.locked ? 'primary' : 'danger'} icon={student.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />} onClick={toggleLock}>
            {t(student.locked ? 'users.actions.unlockAccount' : 'users.actions.lockAccount')}
          </Button>
        </div>
      </ActionCard>

      <ActionCard icon={<KeyRound className="h-4 w-4" />} title={t('users.actions.otpTitle')} desc={t('users.actions.otpDesc')}>
        <div className="flex justify-end">
          <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={resetOtp}>
            {t('users.actions.otpReset')}
          </Button>
        </div>
      </ActionCard>

      <ActionCard icon={<ShieldAlert className="h-4 w-4" />} title={t('users.actions.grantTitle')} desc={t('users.actions.grantDesc')}>
        <form onSubmit={grant.handleSubmit(onGrant)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('users.actions.subject')} error={grant.formState.errors.subjectId?.message} htmlFor="grant-subject" required>
              <Select id="grant-subject" options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))} {...grant.register('subjectId')} />
            </Field>
            <Field label={t('users.actions.duration')} error={grant.formState.errors.days?.message} htmlFor="grant-days" required>
              <Select id="grant-days" options={DURATIONS.map((d) => ({ value: String(d), label: t('users.actions.durationDays', { count: d }) }))} {...grant.register('days')} />
            </Field>
          </div>
          <Field label={t('users.actions.reason')} error={grant.formState.errors.reason?.message} htmlFor="grant-reason" required>
            <Textarea id="grant-reason" rows={3} placeholder={t('users.actions.reasonPlaceholder')} invalid={!!grant.formState.errors.reason} {...grant.register('reason')} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit">{t('users.actions.grant')}</Button>
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
              options={[{ value: '', label: t('users.filters.noSchool') }, ...schools.map((s) => ({ value: s.id, label: `${L(s, 'name')} · ${s.code}` }))]}
            />
          </Field>
          <Field label={t('users.actions.referral')} htmlFor="attr-ref">
            <Input id="attr-ref" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} placeholder="REF-XXX00" dir="ltr" />
          </Field>
          <div className="flex justify-end">
            <Button onClick={saveAttribution} disabled={!attrChanged}>
              {t('users.actions.saveAttr')}
            </Button>
          </div>
        </div>
      </ActionCard>
    </div>
  );
}
