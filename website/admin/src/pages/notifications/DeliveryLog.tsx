import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, RefreshCcw, Send, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { DeliveryLogEntry } from '@/types';
import { NOTIF_CHANNELS, PROVIDERS } from '@/data/messaging';
import { useDeliveryLog, useTemplates } from '@/store/messaging';
import { useStudents } from '@/store/core';
import { useCan } from '@/store/auth';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDateTime, fmtNumber, fmtPercent } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, DataTable, FilterSelect, ProgressBar, Skeleton, StatCard, StatusBadge, Tooltip } from '@/components/ui';
import { CHANNEL_META, ChannelIcon } from './_shared';

const RANGES = ['1', '7', '30'] as const;

export default function DeliveryLog() {
  const { t } = useTranslation();
  const L = useLocalize();
  const loading = useMockLoading();
  const can = useCan();
  const log = useDeliveryLog((s) => s.items);
  const updateMany = useDeliveryLog((s) => s.updateMany);
  const templates = useTemplates((s) => s.items);
  const students = useStudents((s) => s.items);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [range, setRange] = useState('');

  const canRetry = can('notifications', 'edit') || can('notifications', 'create');
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const tplMap = useMemo(() => new Map(templates.map((tp) => [tp.id, tp])), [templates]);

  const rows = useMemo(() => {
    const newest = log.reduce((m, e) => (e.createdAt > m ? e.createdAt : m), '');
    const cutoff = range && newest ? new Date(newest).getTime() - Number(range) * 86_400_000 : null;
    return log.filter(
      (e) =>
        (!channel || e.channel === channel) &&
        (!status || e.status === status) &&
        (!provider || e.provider === provider) &&
        (cutoff === null || new Date(e.createdAt).getTime() >= cutoff),
    );
  }, [log, channel, status, provider, range]);

  const retry = (entries: DeliveryLogEntry[]) => {
    const failed = entries.filter((e) => e.status === 'failed');
    if (!failed.length) return;
    const ids = failed.map((e) => e.id);
    updateMany(ids, (e) => ({ status: 'queued', error: null, attempts: e.attempts + 1 }), {
      action: 'notification.retry',
      summary: failed.length === 1 ? `Retried failed ${failed[0].channel.toUpperCase()} delivery` : `Retried ${failed.length} failed deliveries`,
    });
    toast.success(t('notifications.log.retried', { count: failed.length }));
    setTimeout(() => updateMany(ids, { status: 'delivered' }, { silent: true }), 1800);
  };

  const providerStats = useMemo(
    () =>
      PROVIDERS.map((p) => {
        const list = log.filter((e) => e.provider === p);
        const delivered = list.filter((e) => e.status === 'delivered' || e.status === 'sent').length;
        const failed = list.filter((e) => e.status === 'failed').length;
        return { provider: p, total: list.length, delivered, failed, rate: list.length ? (delivered / list.length) * 100 : 100 };
      }).filter((s) => s.total > 0),
    [log],
  );

  const totals = useMemo(() => {
    const delivered = log.filter((e) => e.status === 'delivered').length;
    const failed = log.filter((e) => e.status === 'failed').length;
    const queued = log.filter((e) => e.status === 'queued').length;
    return { total: log.length, delivered, failed, queued, rate: log.length ? ((log.length - failed - queued) / log.length) * 100 : 0 };
  }, [log]);

  const columns = useMemo<ColumnDef<DeliveryLogEntry>[]>(
    () => [
      {
        accessorKey: 'id',
        header: t('common.id'),
        meta: { label: t('common.id') },
        cell: ({ getValue }) => <code className="text-xs text-muted">{getValue<string>()}</code>,
      },
      {
        id: 'recipient',
        accessorFn: (r) => studentMap.get(r.studentId)?.name_en ?? r.studentId,
        header: t('notifications.log.recipient'),
        meta: { label: t('notifications.log.recipient') },
        cell: ({ row }) => {
          const s = studentMap.get(row.original.studentId);
          return s ? (
            <Link to={`/users/${s.id}`} onClick={(e) => e.stopPropagation()} className="block hover:text-accent">
              <span className="block font-medium">{L(s, 'name')}</span>
              <span className="block text-xs text-muted" dir="ltr">{s.mobile}</span>
            </Link>
          ) : (
            <span className="text-muted">{row.original.studentId}</span>
          );
        },
      },
      {
        id: 'template',
        accessorFn: (r) => tplMap.get(r.templateId)?.name ?? r.templateId,
        header: t('notifications.log.template'),
        meta: { label: t('notifications.log.template') },
        cell: ({ getValue }) => <span className="text-sm text-ink/80">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'channel',
        header: t('notifications.channel'),
        meta: { label: t('notifications.channel') },
        cell: ({ row }) => <Badge tone={CHANNEL_META[row.original.channel].tone}>{t(`notifications.channels.${row.original.channel}`)}</Badge>,
      },
      { accessorKey: 'provider', header: t('notifications.log.provider'), meta: { label: t('notifications.log.provider') } },
      {
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => (
          <div>
            <StatusBadge status={row.original.status} />
            {row.original.error && <div className="mt-1 max-w-[14rem] truncate text-[11px] text-danger" title={row.original.error}>{row.original.error}</div>}
          </div>
        ),
      },
      {
        accessorKey: 'attempts',
        header: t('notifications.log.attempts'),
        meta: { label: t('notifications.log.attempts'), align: 'end' },
      },
      {
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
              <Button size="icon-sm" variant="ghost" aria-label={t('actions.retry')} onClick={() => retry([row.original])}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </Tooltip>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, studentMap, tplMap, canRetry],
  );

  return (
    <div>
      <PageHeader title={t('notifications.log.title')} subtitle={t('notifications.log.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('notifications.log.total')} value={fmtNumber(totals.total)} icon={<Send />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('notifications.log.deliveryRate')} value={fmtPercent(totals.rate, 1)} icon={<CheckCircle2 />} color="#16A34A" />
        <StatCard loading={loading} label={t('status.failed')} value={fmtNumber(totals.failed)} icon={<AlertTriangle />} color="#DC2626" />
        <StatCard loading={loading} label={t('status.queued')} value={fmtNumber(totals.queued)} icon={<RefreshCcw />} color="#C9A24A" />
      </div>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <Server className="h-4 w-4 text-accent" /> {t('notifications.log.providerHealth')}
      </h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : providerStats.map((p) => {
              const ch = NOTIF_CHANNELS.find((c) => log.some((e) => e.provider === p.provider && e.channel === c)) ?? 'push';
              const tone = p.rate >= 90 ? 'success' : p.rate >= 75 ? 'warning' : 'danger';
              return (
                <Card key={p.provider} className={cn('p-4 transition', provider === p.provider && 'ring-2 ring-accent')}>
                  <button className="w-full text-start" onClick={() => setProvider(provider === p.provider ? '' : p.provider)} aria-pressed={provider === p.provider}>
                    <div className="flex items-center gap-2">
                      <ChannelIcon channel={ch} className="h-7 w-7" />
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

      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        exportName="delivery-log"
        initialSort={[{ id: 'createdAt', desc: true }]}
        initialHidden={['id']}
        searchText={(r) => `${r.id} ${studentMap.get(r.studentId)?.name_en ?? ''} ${studentMap.get(r.studentId)?.name_ar ?? ''} ${studentMap.get(r.studentId)?.mobile ?? ''} ${r.provider} ${r.error ?? ''}`}
        toolbar={
          <>
            <FilterSelect label={t('notifications.channel')} value={channel} onChange={setChannel} options={NOTIF_CHANNELS.map((c) => ({ value: c, label: t(`notifications.channels.${c}`) }))} />
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['delivered', 'sent', 'failed', 'queued'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect label={t('notifications.log.provider')} value={provider} onChange={setProvider} options={PROVIDERS.map((p) => ({ value: p, label: p }))} />
            <FilterSelect label={t('common.date')} value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: t(r === '1' ? 'dateRange.today' : `dateRange.${r}d`) }))} />
          </>
        }
        toolbarEnd={
          canRetry && totals.failed > 0 ? (
            <Button size="sm" variant="secondary" icon={<RefreshCcw className="h-4 w-4" />} onClick={() => retry(rows)}>
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
