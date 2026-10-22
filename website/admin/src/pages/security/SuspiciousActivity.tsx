import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Ban, CheckCircle2, CreditCard, ExternalLink, KeyRound, MapPin, MonitorSmartphone, RotateCcw, ShieldAlert, ShieldX, Siren, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SecurityAlert } from '@/types';
import { useCan } from '@/store/auth';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { formatPhone, isolatePhone } from '@/utils/phone';
import { useApiMutation, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { securityApi, type AlertsMeta, type SecurityAlertVM } from '@/api/security';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, FilterSelect, Pagination, SkeletonCard, StatCard, StatusBadge, useConfirm, type Tone } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

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
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('open');

  const canAct = can('security', 'edit');

  // Server sorts by severity desc, then newest (contract ADM-ALR-01 default).
  const list = usePagedList({
    key: qk.alerts.list,
    fetcher: securityApi.alerts,
    filters: { kind, severity, status },
    pageSize: 25,
  });
  const filtered = list.items;
  const stats = (list.meta as AlertsMeta).stats;
  const loading = list.isLoading;

  const isStudent = (a: SecurityAlertVM) => a.subjectType === 'student';
  const isAdmin = (a: SecurityAlertVM) => a.subjectType === 'admin';

  const inv = [qk.alerts.all, qk.students.all, qk.admins.all, qk.adminSessions.all];
  const resolveM = useApiMutation((v: { id: string; reason: string }) => securityApi.resolveAlert(v.id, v.reason), { invalidate: inv, success: 'security.alerts.resolved' });
  const blockM = useApiMutation((v: { id: string; reason: string }) => securityApi.blockAlert(v.id, v.reason), { invalidate: inv, success: 'security.alerts.blocked' });
  const reopenM = useApiMutation((id: string) => securityApi.reopenAlert(id), { invalidate: inv, success: 'security.alerts.reopened' });
  const busy = (id: string) =>
    (resolveM.isPending && resolveM.variables?.id === id) || (blockM.isPending && blockM.variables?.id === id) || (reopenM.isPending && reopenM.variables === id);

  const resolve = async (a: SecurityAlertVM) => {
    const ok = await confirm({ title: t('security.alerts.resolveTitle'), body: t('security.alerts.resolveBody'), tone: 'primary', confirmText: t('actions.resolve'), reason: true });
    if (!ok) return;
    resolveM.mutate({ id: a.id, reason: ok.reason });
  };

  const block = async (a: SecurityAlertVM) => {
    const ok = await confirm({
      title: t('security.alerts.blockTitle', { subject: isolatePhone(a.subject) || a.subject }),
      body: isStudent(a) ? t('security.alerts.blockBodyStudent') : isAdmin(a) ? t('security.alerts.blockBodyAdmin') : t('security.alerts.blockBody'),
      confirmText: t('actions.block'),
      reason: { placeholder: t('security.alerts.reasonPlaceholder') },
    });
    if (!ok) return;
    blockM.mutate({ id: a.id, reason: ok.reason });
  };

  const reopen = (a: SecurityAlertVM) => reopenM.mutate(a.id);

  return (
    <>
      <PageHeader title={t('security.alerts.title')} subtitle={t('security.alerts.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('security.alerts.kpiOpen')} value={fmtNumber(stats?.open ?? 0)} icon={<Siren />} color="#F59E0B" onClick={() => setStatus('open')} />
        <StatCard
          loading={loading}
          label={t('security.alerts.kpiCritical')}
          value={fmtNumber(stats?.openCriticalHigh ?? 0)}
          icon={<ShieldAlert />}
          color="#DC2626"
        />
        <StatCard loading={loading} label={t('security.alerts.kpiResolved')} value={fmtNumber(stats?.resolved ?? 0)} icon={<CheckCircle2 />} color="#16A34A" onClick={() => setStatus('resolved')} />
        <StatCard loading={loading} label={t('security.alerts.kpiBlocked')} value={fmtNumber(stats?.blocked ?? 0)} icon={<ShieldX />} color="#0B1F3A" onClick={() => setStatus('blocked')} />
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
        <span className="ms-auto text-xs text-muted num">{t('common.results', { count: list.meta.total })}</span>
      </Card>

      {list.error && !loading ? (
        <QueryError error={list.error} onRetry={() => list.refetch()} />
      ) : loading ? (
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
                        {formatPhone(a.subject)}
                      </div>
                      <p className="mt-1.5 text-sm text-muted">{a.detail}</p>
                      {a.status !== 'open' && a.resolutionReason && (
                        <p className="mt-1.5 text-xs text-ink/70">
                          <span className="font-medium">{t('security.alerts.resolution')}:</span> {a.resolutionReason}
                          {a.resolvedBy && <span className="text-muted"> — {a.resolvedBy}{a.resolvedAt ? ` · ${fmtRelative(a.resolvedAt)}` : ''}</span>}
                        </p>
                      )}
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
                          <Button variant="secondary" size="sm" disabled={busy(a.id)} icon={<CheckCircle2 className="h-4 w-4 text-success" />} onClick={() => resolve(a)}>
                            {t('actions.resolve')}
                          </Button>
                          <Button variant="danger" size="sm" loading={blockM.isPending && blockM.variables?.id === a.id} disabled={busy(a.id)} icon={<Ban className="h-4 w-4" />} onClick={() => block(a)}>
                            {t('actions.block')}
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" loading={reopenM.isPending && reopenM.variables === a.id} icon={<RotateCcw className="h-4 w-4" />} onClick={() => reopen(a)}>
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
      {!loading && !list.error && list.meta.total > list.server.pageSize && (
        <Card className="mt-4 overflow-hidden">
          <Pagination
            page={list.server.page}
            pageSize={list.server.pageSize}
            total={list.meta.total}
            onPage={list.server.onPage}
            onPageSize={list.server.onPageSize}
          />
        </Card>
      )}
    </>
  );
}
