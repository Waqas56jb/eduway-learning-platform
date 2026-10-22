import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCheck, Clock, FileText, Filter, Inbox, Send, Users, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApiMutation, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { notificationsApi, type CampaignFilters, type DeliveryVM } from '@/api/notifications';
import { useCampaign } from '@/api/drilldown';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDateTime, fmtNumber, fmtPercent, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { DonutChart } from '@/components/charts';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, DataTable, EmptyState, FilterSelect, ProgressBar, SkeletonCard, StatCard, StatusBadge, useConfirm } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { CHANNEL_META, ChannelIcon } from './_shared';

const STAT_COLORS = { queued: '#94A3B8', sent: '#2563EB', delivered: '#16A34A', failed: '#DC2626' } as const;

/** ADM-CMP-02 — one campaign: audience filters, delivery funnel and its per-recipient deliveries (ADM-DLV-01 ?campaignId). */
export default function CampaignDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const can = useCan();
  const lookups = useLookups();
  const q = useCampaign(id);
  const c = q.data;

  const [status, setStatus] = useState('');
  const deliveries = usePagedList({
    key: qk.deliveries.list,
    fetcher: notificationsApi.listDeliveries,
    filters: { campaignId: id, status },
    initialSort: '-createdAt',
    pageSize: 10,
    enabled: !!id,
    refetchInterval: c?.status === 'sending' ? 5000 : undefined,
  });

  const cancelM = useApiMutation(() => notificationsApi.cancelCampaign(id!), {
    invalidate: [qk.campaigns.all],
    success: 'notifications.campaign.cancelledToast',
  });

  const columns = useMemo<ColumnDef<DeliveryVM>[]>(
    () => [
      {
        id: 'recipient',
        accessorFn: (r) => (r.recipient ? L(r.recipient, 'name') : '—'),
        header: t('notifications.log.recipient'),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original.recipient;
          if (!r) return <span className="text-muted">—</span>;
          return can('users', 'view') ? (
            <Link to={`/users/${r.id}`} className="font-medium text-ink hover:text-accent hover:underline">
              {L(r, 'name')}
            </Link>
          ) : (
            <span className="font-medium">{L(r, 'name')}</span>
          );
        },
      },
      { id: 'status', accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { id: 'provider', accessorKey: 'provider', header: t('notifications.log.provider'), cell: ({ getValue }) => <span className="text-muted">{getValue<string>()}</span> },
      { id: 'attempts', accessorKey: 'attempts', header: t('notifications.log.attempts'), meta: { align: 'end' }, cell: ({ getValue }) => fmtNumber(getValue<number>()) },
      {
        id: 'error',
        accessorKey: 'error',
        header: t('drilldown.campaign.error'),
        enableSorting: false,
        cell: ({ getValue }) => {
          const e = getValue<string | null>();
          return e ? <span className="line-clamp-2 max-w-[18rem] text-xs text-danger">{e}</span> : <span className="text-muted">—</span>;
        },
      },
      { id: 'createdAt', accessorKey: 'createdAt', header: t('common.created'), cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(getValue<string>())}</span> },
    ],
    [t, L, can],
  );

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCard key={i} loading label="" value="" />
          ))}
        </div>
        <SkeletonCard lines={8} />
      </div>
    );
  }

  if (!c) {
    if (q.error && q.error.code !== 'NOT_FOUND') return <QueryError error={q.error} onRetry={() => q.refetch()} />;
    return (
      <Card>
        <EmptyState
          title={t('drilldown.campaign.notFound')}
          action={
            <ButtonLink to="/notifications/campaigns" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>
              {t('drilldown.campaign.back')}
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  const s = c.stats;
  const processed = s.queued + s.sent + s.delivered + s.failed;
  const rate = processed ? (s.delivered / processed) * 100 : 0;
  const canCancel = c.status === 'scheduled' && can('notifications', 'create');

  const cancel = async () => {
    const ok = await confirm({ title: t('notifications.campaign.cancelTitle', { name: c.name }), body: t('notifications.campaign.cancelBody'), tone: 'warning', confirmText: t('notifications.campaign.cancelCampaign') });
    if (ok) cancelM.mutate();
  };

  const filters = describeFilters(c.filters);

  function describeFilters(f: CampaignFilters): { label: string; value: string }[] {
    const out: { label: string; value: string }[] = [];
    const name = <T extends { id: string }>(arr: T[], fid?: string | null) => {
      const x = fid ? arr.find((a) => a.id === fid) : undefined;
      return x ? L(x, 'name') : (fid ?? '');
    };
    if (f.packageId) out.push({ label: t('common.package'), value: name(lookups.packages, f.packageId) });
    if (f.subjectId) out.push({ label: t('common.subject'), value: name(lookups.subjects, f.subjectId) });
    if (f.governorateId) out.push({ label: t('common.governorate'), value: name(lookups.governorates, f.governorateId) });
    if (f.schoolId) out.push({ label: t('common.school'), value: name(lookups.schools, f.schoolId) });
    if (f.inactiveDays) out.push({ label: t('notifications.campaign.inactiveDays'), value: `${fmtNumber(f.inactiveDays)} ${t('common.days')}` });
    if (f.subscriptionStatus) out.push({ label: t('notifications.campaign.subscriptionStatus'), value: t(`status.${f.subscriptionStatus}`) });
    if (f.platforms?.length) out.push({ label: t('notifications.campaign.platforms'), value: f.platforms.map((p) => t(`notifications.platforms.${p}`)).join(' · ') });
    return out;
  }

  const info: { icon: ReactNode; label: string; value: ReactNode }[] = [
    { icon: <Send />, label: t('notifications.channel'), value: t(`notifications.channels.${c.channel}`) },
    {
      icon: <FileText />,
      label: t('notifications.campaign.template'),
      value:
        c.templateId && c.templateName ? (
          can('notifications', 'view') ? (
            <Link to={`/notifications/templates/${c.templateId}`} className="hover:text-accent hover:underline">
              {c.templateName}
            </Link>
          ) : (
            c.templateName
          )
        ) : (
          '—'
        ),
    },
    { icon: <CalendarClock />, label: t('notifications.campaign.scheduledFor'), value: c.scheduledAt ? fmtDateTime(c.scheduledAt) : '—' },
    { icon: <CheckCheck />, label: t('drilldown.campaign.sentAt'), value: c.sentAt ? fmtDateTime(c.sentAt) : '—' },
    { icon: <Users />, label: t('notifications.campaign.createdBy'), value: c.createdBy },
    { icon: <Clock />, label: t('common.created'), value: `${fmtDateTime(c.createdAt)} · ${fmtRelative(c.createdAt)}` },
  ];

  return (
    <>
      <PageHeader
        title={c.name}
        current={c.name}
        meta={
          <>
            <StatusBadge status={c.status} />
            <Badge tone={CHANNEL_META[c.channel].tone}>{t(`notifications.channels.${c.channel}`)}</Badge>
            {c.status === 'sending' && <span className="text-xs text-muted">{t('drilldown.campaign.live')}</span>}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />} onClick={() => navigate('/notifications/campaigns')}>
              {t('actions.back')}
            </Button>
            {canCancel && (
              <Button variant="danger" icon={<XCircle className="h-4 w-4" />} loading={cancelM.isPending} onClick={cancel}>
                {t('notifications.campaign.cancelCampaign')}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('notifications.campaign.recipients')} value={fmtNumber(c.audienceCount)} icon={<Users />} color="#0B1F3A" />
        <StatCard label={t('status.delivered')} value={fmtNumber(s.delivered)} icon={<CheckCheck />} color={STAT_COLORS.delivered} hint={t('drilldown.campaign.ofProcessed', { count: processed })} />
        <StatCard label={t('status.failed')} value={fmtNumber(s.failed)} icon={<AlertTriangle />} color={STAT_COLORS.failed} />
        <StatCard label={t('notifications.log.deliveryRate')} value={fmtPercent(rate, 1)} icon={<Send />} color="#C9A24A" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<Inbox className="h-4 w-4" />} title={t('drilldown.campaign.funnel')} subtitle={t('drilldown.campaign.funnelSub')} />
            <CardBody className="grid items-center gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
              {processed === 0 ? (
                <EmptyState compact className="md:col-span-2" title={c.status === 'scheduled' || c.status === 'draft' ? t('drilldown.campaign.notSentYet') : t('drilldown.campaign.noDeliveries')} hint=" " />
              ) : (
                <>
                  <DonutChart
                    data={(['delivered', 'sent', 'queued', 'failed'] as const).map((k) => ({ name: t(`status.${k}`), value: s[k], color: STAT_COLORS[k] }))}
                    centerValue={fmtPercent(rate, 0)}
                    centerLabel={t('notifications.log.deliveryRate')}
                    showLegend={false}
                  />
                  <ul className="space-y-3">
                    {(['delivered', 'sent', 'queued', 'failed'] as const).map((k) => (
                      <li key={k}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: STAT_COLORS[k] }} />
                            {t(`status.${k}`)}
                          </span>
                          <span className="font-semibold num">
                            {fmtNumber(s[k])} <span className="font-normal text-muted">· {fmtPercent(processed ? (s[k] / processed) * 100 : 0, 0)}</span>
                          </span>
                        </div>
                        <ProgressBar value={processed ? (s[k] / processed) * 100 : 0} color={STAT_COLORS[k]} label={t(`status.${k}`)} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title={t('drilldown.campaign.deliveries')}
              subtitle={t('common.results', { count: deliveries.meta.total })}
              action={
                <ButtonLink to="/notifications/delivery-log" variant="ghost" size="sm">
                  {t('drilldown.campaign.openLog')}
                </ButtonLink>
              }
            />
            <DataTable
              bare
              data={deliveries.items}
              columns={columns}
              loading={deliveries.isLoading}
              error={deliveries.error}
              onRetry={() => deliveries.refetch()}
              server={deliveries.server}
              getRowId={(r) => r.id}
              hideSearch
              toolbar={<FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['queued', 'sent', 'delivered', 'failed'] as const).map((x) => ({ value: x, label: t(`status.${x}`) }))} />}
              emptyTitle={t('drilldown.campaign.noDeliveries')}
              emptyHint={c.status === 'scheduled' ? t('drilldown.campaign.notSentYetHint') : ' '}
              maxHeight="520px"
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardBody className="flex items-center gap-3">
              <ChannelIcon channel={c.channel} className="h-11 w-11" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="text-xs text-muted">{t(`notifications.channels.${c.channel}`)}</div>
              </div>
            </CardBody>
            <dl className="divide-y divide-line border-t border-line">
              {info.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <dt className="flex items-center gap-2 text-muted [&>svg]:h-4 [&>svg]:w-4">
                    {row.icon}
                    {row.label}
                  </dt>
                  <dd className="text-end font-medium text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader icon={<Filter className="h-4 w-4" />} title={t('notifications.campaign.audience')} />
            <CardBody>
              {filters.length === 0 ? (
                <p className="text-sm text-muted">{t('drilldown.campaign.allStudents')}</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {filters.map((f) => (
                    <li key={f.label} className="flex items-start justify-between gap-3">
                      <span className="text-muted">{f.label}</span>
                      <span className="text-end font-medium">{f.value}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{t('notifications.campaign.optOutNote')}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
