import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Ban, CheckCircle2, CreditCard, ExternalLink, KeyRound, MapPin, MonitorSmartphone, RotateCcw, ShieldAlert, ShieldX, Siren, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { SecurityAlert } from '@/types';
import { useSecurityAlerts } from '@/store/security';
import { useStudents } from '@/store/core';
import { useCan } from '@/store/auth';
import { useMockLoading } from '@/hooks/useMockLoading';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, FilterSelect, SkeletonCard, StatCard, StatusBadge, useConfirm, type Tone } from '@/components/ui';

const KINDS: SecurityAlert['kind'][] = ['multiple_devices', 'otp_bruteforce', 'unusual_location', 'payment_fraud', 'admin_login_failure'];
const SEVERITIES: SecurityAlert['severity'][] = ['critical', 'high', 'medium', 'low'];

const KIND_ICON: Record<SecurityAlert['kind'], typeof Siren> = {
  multiple_devices: MonitorSmartphone,
  otp_bruteforce: KeyRound,
  unusual_location: MapPin,
  payment_fraud: CreditCard,
  admin_login_failure: UserX,
};

const SEV_TONE: Record<SecurityAlert['severity'], Tone> = { critical: 'danger', high: 'danger', medium: 'warning', low: 'info' };
const SEV_BAR: Record<SecurityAlert['severity'], string> = { critical: 'bg-danger', high: 'bg-[#F97316]', medium: 'bg-warning', low: 'bg-info' };
const SEV_ICON_BG: Record<SecurityAlert['severity'], string> = {
  critical: 'bg-danger/10 text-danger',
  high: 'bg-[#F97316]/10 text-[#EA580C]',
  medium: 'bg-warning/10 text-[#B45309] dark:text-warning',
  low: 'bg-info/10 text-info',
};

export default function SuspiciousActivity() {
  const { t } = useTranslation();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const alerts = useSecurityAlerts((s) => s.items);
  const update = useSecurityAlerts((s) => s.update);
  const updateStudent = useStudents((s) => s.update);
  const students = useStudents((s) => s.items);
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('open');

  const canAct = can('security', 'edit');

  const filtered = useMemo(
    () =>
      alerts
        .filter((a) => (!kind || a.kind === kind) && (!severity || a.severity === severity) && (!status || a.status === status))
        .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.createdAt.localeCompare(a.createdAt)),
    [alerts, kind, severity, status],
  );

  const isStudent = (a: SecurityAlert) => !!a.subjectId?.startsWith('stu_');
  const isAdmin = (a: SecurityAlert) => !!a.subjectId?.startsWith('adm_');

  const resolve = async (a: SecurityAlert) => {
    const ok = await confirm({ title: t('security.alerts.resolveTitle'), body: t('security.alerts.resolveBody'), tone: 'primary', confirmText: t('actions.resolve'), reason: true });
    if (!ok) return;
    update(a.id, { status: 'resolved' }, { action: 'security_alert.resolve', summary: `Resolved ${a.kind.replace(/_/g, ' ')} alert for ${a.subject} — ${ok.reason}` });
    toast.success(t('security.alerts.resolved'));
  };

  const block = async (a: SecurityAlert) => {
    const ok = await confirm({
      title: t('security.alerts.blockTitle', { subject: a.subject }),
      body: isStudent(a) ? t('security.alerts.blockBodyStudent') : t('security.alerts.blockBody'),
      confirmText: t('actions.block'),
      reason: { placeholder: t('security.alerts.reasonPlaceholder') },
    });
    if (!ok) return;
    if (isStudent(a) && a.subjectId && students.some((s) => s.id === a.subjectId)) {
      updateStudent(a.subjectId, { locked: true, sessions: [] }, { action: 'student.block', summary: `Locked ${a.subject} from security alert — ${ok.reason}` });
    }
    update(a.id, { status: 'blocked' }, { action: 'security_alert.block', summary: `Blocked ${a.subject} (${a.kind.replace(/_/g, ' ')}) — ${ok.reason}` });
    toast.success(t('security.alerts.blocked'));
  };

  const reopen = (a: SecurityAlert) => {
    update(a.id, { status: 'open' }, { action: 'security_alert.reopen', summary: `Reopened alert for ${a.subject}` });
    toast.success(t('security.alerts.reopened'));
  };

  const open = alerts.filter((a) => a.status === 'open');

  return (
    <>
      <PageHeader title={t('security.alerts.title')} subtitle={t('security.alerts.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('security.alerts.kpiOpen')} value={fmtNumber(open.length)} icon={<Siren />} color="#F59E0B" onClick={() => setStatus('open')} />
        <StatCard
          loading={loading}
          label={t('security.alerts.kpiCritical')}
          value={fmtNumber(open.filter((a) => a.severity === 'critical' || a.severity === 'high').length)}
          icon={<ShieldAlert />}
          color="#DC2626"
        />
        <StatCard loading={loading} label={t('security.alerts.kpiResolved')} value={fmtNumber(alerts.filter((a) => a.status === 'resolved').length)} icon={<CheckCircle2 />} color="#16A34A" onClick={() => setStatus('resolved')} />
        <StatCard loading={loading} label={t('security.alerts.kpiBlocked')} value={fmtNumber(alerts.filter((a) => a.status === 'blocked').length)} icon={<ShieldX />} color="#0B1F3A" onClick={() => setStatus('blocked')} />
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
        <FilterSelect label={t('security.alerts.kind')} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`security.alerts.kinds.${k}`) }))} />
        <FilterSelect label={t('security.alerts.severity')} value={severity} onChange={setSeverity} options={SEVERITIES.map((s) => ({ value: s, label: t(`security.alerts.severities.${s}`) }))} />
        <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['open', 'resolved', 'blocked'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
        {(kind || severity || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setKind(''); setSeverity(''); setStatus(''); }}>
            {t('actions.clearFilters')}
          </Button>
        )}
        <span className="ms-auto text-xs text-muted num">{t('common.results', { count: filtered.length })}</span>
      </Card>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState title={t('security.alerts.noAlerts')} hint={t('security.alerts.noAlertsHint')} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((a, i) => {
            const Icon = KIND_ICON[a.kind];
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                <Card className={cn('relative h-full overflow-hidden p-5', a.status !== 'open' && 'opacity-80')}>
                  <span className={cn('absolute inset-y-0 start-0 w-1', SEV_BAR[a.severity])} aria-hidden />
                  <div className="flex items-start gap-4">
                    <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', SEV_ICON_BG[a.severity])}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-ink">{t(`security.alerts.kinds.${a.kind}`)}</h3>
                        <Badge tone={SEV_TONE[a.severity]} className={a.severity === 'critical' ? 'uppercase' : undefined}>
                          {t(`security.alerts.severities.${a.severity}`)}
                        </Badge>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="mt-1 text-sm font-medium text-ink/90" dir="auto">
                        {a.subject}
                      </div>
                      <p className="mt-1.5 text-sm text-muted">{a.detail}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span title={fmtDateTime(a.createdAt)}>
                          {t('security.alerts.detected')}: {fmtRelative(a.createdAt)}
                        </span>
                        {isStudent(a) && a.subjectId && (
                          <Link to={`/users/${a.subjectId}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                            {t('security.alerts.viewAccount')} <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                        {isAdmin(a) && (
                          <Link to="/security/admins" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                            {t('security.alerts.viewAccount')} <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  {canAct && (
                    <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                      {a.status === 'open' ? (
                        <>
                          <Button variant="secondary" size="sm" icon={<CheckCircle2 className="h-4 w-4 text-success" />} onClick={() => resolve(a)}>
                            {t('actions.resolve')}
                          </Button>
                          <Button variant="danger" size="sm" icon={<Ban className="h-4 w-4" />} onClick={() => block(a)}>
                            {t('actions.block')}
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => reopen(a)}>
                          {t('security.alerts.reopen')}
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
