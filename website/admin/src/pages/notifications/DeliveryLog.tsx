import { useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, RefreshCcw, Send, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { fromDaysAgo, NOTIF_CHANNELS, notificationsApi, type DeliveryVM } from '@/api/notifications';
import { qk } from '@/api/keys';
import { exportRequest, useApiMutation, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import type { BulkResult } from '@/api/types';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDateTime, fmtNumber, fmtPercent } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryError } from '@/components/ui/QueryError';
import { Badge, Button, Card, DataTable, FilterSelect, ProgressBar, Skeleton, StatCard, StatusBadge, Tooltip } from '@/components/ui';
import { CHANNEL_META, ChannelIcon } from './_shared';

const RANGES = ['1', '7', '30'] as const;

export default function DeliveryLog() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [range, setRange] = useState('');

  const canRetry = can('notifications', 'edit') || can('notifications', 'create');

  // `from` is resolved once per range choice so the query key stays stable between renders.
  const from = useMemo(() => fromDaysAgo(range), [range]);
  const list = usePagedList({
    key: qk.deliveries.list,
    fetcher: notificationsApi.listDeliveries,
    filters: { channel, status, provider, from },
    initialSort: '-createdAt',
    pageSize: 10,
  });
  // KPIs + provider health for the same filters as the table (ADM-DLV-02: every filter except `status`,
  // because the KPIs are the status breakdown).
  const search = list.exportFilters.q;
  const statsParams = useMemo(() => ({ channel, provider, from, q: search }), [channel, provider, from, search]);
  const statsQ = useApiQuery(qk.deliveries.sub('stats', statsParams), () => notificationsApi.deliveryStats(statsParams), { placeholderData: keepPreviousData });
  const stats = statsQ.data;
  // Provider health cards act as the provider filter, so they use the same filters minus `provider`
  // (same query key as the KPIs when no provider is picked → one request).
  const healthParams = useMemo(() => ({ channel, provider: '', from, q: search }), [channel, from, search]);
  const healthQ = useApiQuery(qk.deliveries.sub('stats', healthParams), () => notificationsApi.deliveryStats(healthParams), { placeholderData: keepPreviousData });
  const exp = useExport('/admin/deliveries/export', 'delivery-log');

  const retryM = useApiMutation((body: { ids?: string[]; filter?: Record<string, unknown> }) => notificationsApi.retry(body), {
    invalidate: [qk.deliveries.all, qk.campaigns.all],
    onSuccess: (r: BulkResult) => {
      if (r.succeeded.length) toast.success(t('notifications.log.retried', { count: r.succeeded.length }));
      else if (!r.failed.length) toast(t('notifications.log.nothingToRetry'));
      if (r.failed.length) toast.error(t('notifications.bulkFailed', { count: r.failed.length, message: r.failed[0].message }));
    },
  });

  const retry = (entries: DeliveryVM[]) => {
    const ids = entries.filter((e) => e.status === 'failed').map((e) => e.id);
    if (ids.length) retryM.mutate({ ids });
  };

  /** Retry every failed delivery matching the current filters (not just the visible page). */
  const retryAllInView = () => {
    retryM.mutate({ filter: { channel: channel || undefined, provider: provider || undefined, from, q: list.exportFilters.q, status: 'failed' } });
  };

  const providerStats = useMemo(() => healthQ.data?.byProvider ?? [], [healthQ.data]);

  const columns = useMemo<ColumnDef<DeliveryVM>[]>(
    () => [
      {
        id: 'id',
        accessorKey: 'id',
        enableSorting: false,
        header: t('common.id'),
        meta: { label: t('common.id') },
        cell: ({ getValue }) => <code className="text-xs text-muted">{getValue<string>()}</code>,
      },
      {
        id: 'recipient',
        accessorFn: (r) => r.recipient?.name_en ?? r.studentId,
        enableSorting: false,
        header: t('notifications.log.recipient'),
        meta: { label: t('notifications.log.recipient') },
        cell: ({ row }) => {
          const s = row.original.recipient;
          return s ? (
            <Link to={`/users/${s.id}`} onClick={(e) => e.stopPropagation()} className="block hover:text-accent">
              <span className="block font-medium">{L(s, 'name')}</span>
              <span className="block text-xs text-muted" dir="ltr">{s.mobile}</span>
            </Link>
          ) : (
            <span className="text-muted">{row.original.studentId || '—'}</span>
          );
        },
      },
      {
        id: 'template',
        accessorFn: (r) => r.templateName ?? '—',
        enableSorting: false,
        header: t('notifications.log.template'),
        meta: { label: t('notifications.log.template') },
        cell: ({ getValue }) => <span className="text-sm text-ink/80">{getValue<string>()}</span>,
      },
      {
        id: 'channel',
        accessorKey: 'channel',
        enableSorting: false,
        header: t('notifications.channel'),
        meta: { label: t('notifications.channel') },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={CHANNEL_META[row.original.channel].tone}>{t(`notifications.channels.${row.original.channel}`)}</Badge>
            {row.original.platform && <span className="text-[10px] uppercase tracking-wide text-muted">{t(`notifications.platforms.${row.original.platform}`)}</span>}
          </div>
        ),
      },
      { id: 'provider', accessorKey: 'provider', enableSorting: false, header: t('notifications.log.provider'), meta: { label: t('notifications.log.provider') } },
      {
        id: 'status',
        accessorKey: 'status',
        enableSorting: false,
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => (
          <div>
            <StatusBadge status={row.original.status} />
            {row.original.error && (
              <div className="mt-1 max-w-[14rem] truncate text-[11px] text-danger" title={row.original.error}>
                {row.original.error}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'attempts',
        accessorKey: 'attempts',
        enableSorting: false,
        header: t('notifications.log.attempts'),
        meta: { label: t('notifications.log.attempts'), align: 'end' },
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: t('common.date'),
        meta: { label: t('common.date') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(getValue<string>())}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          row.original.status === 'failed' && canRetry ? (
            <Tooltip content={t('actions.retry')}>
              <Button size="icon-sm" variant="ghost" aria-label={t('actions.retry')} disabled={retryM.isPending} onClick={() => retry([row.original])}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </Tooltip>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, canRetry, retryM.isPending],
  );

  const providerOptions = useMemo(() => [...new Set(providerStats.map((p) => p.provider))], [providerStats]);

  return (
    <div>
      <PageHeader title={t('notifications.log.title')} subtitle={t('notifications.log.subtitle')} />

      {statsQ.error && !stats ? (
        <QueryError className="mb-6" error={statsQ.error} onRetry={() => statsQ.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard loading={statsQ.isLoading} label={t('notifications.log.total')} value={fmtNumber(stats?.total ?? 0)} icon={<Send />} color="#0B1F3A" />
            <StatCard loading={statsQ.isLoading} label={t('notifications.log.deliveryRate')} value={fmtPercent(stats?.rate ?? 0, 1)} icon={<CheckCircle2 />} color="#16A34A" />
            <StatCard loading={statsQ.isLoading} label={t('status.failed')} value={fmtNumber(stats?.failed ?? 0)} icon={<AlertTriangle />} color="#DC2626" />
            <StatCard loading={statsQ.isLoading} label={t('status.queued')} value={fmtNumber(stats?.queued ?? 0)} icon={<RefreshCcw />} color="#C9A24A" />
          </div>

          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Server className="h-4 w-4 text-accent" /> {t('notifications.log.providerHealth')}
          </h2>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {healthQ.isLoading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
              : providerStats.map((p) => {
                  const tone = p.rate >= 90 ? 'success' : p.rate >= 75 ? 'warning' : 'danger';
                  return (
                    <Card key={`${p.provider}-${p.channel}`} className={cn('p-4 transition', provider === p.provider && 'ring-2 ring-accent')}>
                      <button className="w-full text-start" onClick={() => setProvider(provider === p.provider ? '' : p.provider)} aria-pressed={provider === p.provider}>
                        <div className="flex items-center gap-2">
                          <ChannelIcon channel={p.channel} className="h-7 w-7" />
                          <span className="truncate text-sm font-semibold text-ink">{p.provider}</span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="kpi-num text-xl text-primary">{fmtPercent(p.rate)}</span>
                          <span className="text-[11px] text-muted">{t('notifications.log.ofMessages', { count: p.total })}</span>
                        </div>
                        <ProgressBar value={p.rate} tone={tone} size="xs" className="mt-2" />
                        <div className="mt-2 text-[11px] text-muted">
                          {p.failed > 0 ? <span className="text-danger">{t('notifications.log.failedN', { count: p.failed })}</span> : t('notifications.log.healthy')}
                        </div>
                      </button>
                    </Card>
                  );
                })}
          </div>
        </>
      )}

      <DataTable
        data={list.items}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onExport={can('notifications', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        initialHidden={['id']}
        toolbar={
          <>
            <FilterSelect label={t('notifications.channel')} value={channel} onChange={setChannel} options={NOTIF_CHANNELS.map((c) => ({ value: c, label: t(`notifications.channels.${c}`) }))} />
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['delivered', 'sent', 'failed', 'queued'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect label={t('notifications.log.provider')} value={provider} onChange={setProvider} options={providerOptions.map((p) => ({ value: p, label: p }))} />
            <FilterSelect label={t('common.date')} value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: t(r === '1' ? 'dateRange.today' : `dateRange.${r}d`) }))} />
          </>
        }
        toolbarEnd={
          canRetry && (stats?.failed ?? 0) > 0 && status !== 'delivered' && status !== 'queued' && status !== 'sent' ? (
            <Button size="sm" variant="secondary" loading={retryM.isPending} icon={<RefreshCcw className="h-4 w-4" />} onClick={retryAllInView}>
              {t('notifications.log.retryAllFailed')}
            </Button>
          ) : undefined
        }
        bulkActions={
          canRetry
            ? (sel, clear) => (
                <Button
                  size="sm"
                  disabled={!sel.some((s) => s.status === 'failed')}
                  loading={retryM.isPending}
                  icon={<RefreshCcw className="h-4 w-4" />}
                  onClick={() => {
                    retry(sel);
                    clear();
                  }}
                >
                  {t('notifications.log.retrySelected', { count: sel.filter((s) => s.status === 'failed').length })}
                </Button>
              )
            : undefined
        }
      />
    </div>
  );
}
