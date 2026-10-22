import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Eye, HardDrive, RefreshCw, Repeat2, ServerCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { fmtBytes, fmtCompact, fmtDate, fmtDuration, fmtNumber } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { exportRequest, useApiMutation, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { videosApi, type VideoVM } from '@/api/content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, DataTable, FilterSelect, StatCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';

export default function Videos() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const lang = useLang();
  const lookups = useLookups();
  const subjects = lookups.subjects;
  const [subject, setSubject] = useState('');
  const [stream, setStream] = useState('');
  const [cdn, setCdn] = useState('');
  const canAct = can('content', 'edit');
  const [inFlight, setInFlight] = useState(false);

  const list = usePagedList<VideoVM>({
    key: qk.videos.list,
    fetcher: videosApi.list,
    filters: { subjectId: subject, streamStatus: stream, cdnStatus: cdn },
    initialSort: '-views',
    // Keep the table live while assets are being re-synced / re-encoded.
    refetchInterval: inFlight ? 5000 : undefined,
  });
  const data = list.items;
  useEffect(() => setInFlight(data.some((v) => v.streamStatus === 'processing' || v.cdnStatus === 'pending')), [data]);
  const statsQ = useApiQuery(qk.videos.sub('stats'), videosApi.stats, { refetchInterval: inFlight ? 5000 : undefined });
  const totals = statsQ.data;
  const loading = statsQ.isLoading;

  const invalidate = [qk.videos.all, qk.lessons.all];
  const resyncMut = useApiMutation((v: VideoVM) => videosApi.cdnResync(v.id), {
    invalidate,
    onSuccess: (_d, v) => toast.success(t('content.videos.resynced', { id: v.assetId })),
  });
  const reprocessMut = useApiMutation((v: { video: VideoVM; reason?: string }) => videosApi.reprocess(v.video.id, v.reason), {
    invalidate,
    onSuccess: (_d, v) => toast.success(t('content.videos.reprocessed', { id: v.video.assetId })),
  });
  const bulkMut = useApiMutation((ids: string[]) => videosApi.bulkCdnResync(ids), {
    invalidate,
    onSuccess: (r) => {
      toast.success(t('content.videos.bulkResynced', { count: r.succeeded.length }));
      if (r.failed.length) toast.error(t('api.bulkPartial', { count: r.failed.length }));
    },
  });
  const exp = useExport('/admin/videos/export', 'video-library');

  const resync = (v: VideoVM) => resyncMut.mutate(v);
  const reprocess = async (v: VideoVM) => {
    const ok = await confirm({ title: t('content.videos.reprocessTitle'), body: t('content.videos.reprocessBody'), tone: 'warning', confirmText: t('content.videos.reprocess') });
    if (!ok) return;
    reprocessMut.mutate({ video: v, reason: ok.reason || undefined });
  };

  const columns = useMemo<ColumnDef<VideoVM>[]>(
    () => [
      {
        id: 'assetId',
        header: t('content.videos.assetId'),
        meta: { label: t('content.videos.assetId') },
        accessorKey: 'assetId',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[11px] text-ink/80" dir="ltr">
            {row.original.assetId}
          </span>
        ),
      },
      {
        id: 'lesson',
        header: t('common.lesson'),
        meta: { label: t('common.lesson') },
        enableSorting: false,
        accessorFn: (v) => v.lesson?.title[lang] ?? '',
        cell: ({ row }) => {
          const l = row.original.lesson;
          const s = l?.subject;
          return l ? (
            <Link to={`/content/lessons/${l.id}`} onClick={(e) => e.stopPropagation()} className="group flex min-w-[220px] items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s?.color }} />
              <span className="truncate font-medium text-ink group-hover:text-accent">{l.title[lang]}</span>
            </Link>
          ) : (
            '—'
          );
        },
      },
      { id: 'sizeMb', header: t('content.videos.size'), meta: { label: t('content.videos.size'), align: 'end' }, accessorKey: 'sizeMb', cell: ({ row }) => fmtBytes(row.original.sizeMb * 1024) },
      { id: 'durationSec', header: t('content.videos.duration'), meta: { label: t('content.videos.duration'), align: 'end', exportValue: (v) => fmtDuration(v.durationSec) }, accessorKey: 'durationSec', cell: ({ row }) => fmtDuration(row.original.durationSec) },
      { id: 'resolution', header: t('content.videos.resolution'), meta: { label: t('content.videos.resolution') }, accessorKey: 'resolution', enableSorting: false, cell: ({ row }) => <Badge tone={row.original.resolution === '4K' ? 'accent' : 'neutral'}>{row.original.resolution}</Badge> },
      { id: 'stream', header: t('content.videos.stream'), meta: { label: t('content.videos.stream') }, accessorKey: 'streamStatus', enableSorting: false, cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5" title={row.original.error ?? undefined}>
          <StatusBadge status={row.original.streamStatus} />
          {row.original.streamStatus === 'processing' && row.original.processingProgress != null && <span className="text-[11px] text-muted num">{Math.round(row.original.processingProgress)}%</span>}
        </span>
      ) },
      { id: 'cdn', header: t('content.videos.cdn'), meta: { label: t('content.videos.cdn') }, accessorKey: 'cdnStatus', enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.cdnStatus} /> },
      { id: 'views', header: t('content.videos.views'), meta: { label: t('content.videos.views'), align: 'end' }, accessorKey: 'views', cell: ({ row }) => fmtNumber(row.original.views) },
      { id: 'replays', header: t('content.videos.replays'), meta: { label: t('content.videos.replays'), align: 'end' }, accessorKey: 'replays', cell: ({ row }) => fmtNumber(row.original.replays) },
      { id: 'uploadedAt', header: t('content.videos.uploaded'), meta: { label: t('content.videos.uploaded') }, accessorKey: 'uploadedAt', cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDate(row.original.uploadedAt)}</span> },
      ...(canAct
        ? [
            {
              id: 'actions',
              header: '',
              enableSorting: false,
              enableHiding: false,
              meta: { noExport: true, align: 'end' as const },
              cell: ({ row }: { row: { original: VideoVM } }) => {
                const v = row.original;
                const busy = v.streamStatus === 'processing';
                return (
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Tooltip content={t('content.videos.resync')}>
                      <Button variant="ghost" size="icon-sm" disabled={busy || v.cdnStatus === 'pending'} aria-label={t('content.videos.resync')} onClick={() => resync(v)}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('content.videos.reprocess')}>
                      <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={t('content.videos.reprocess')} onClick={() => reprocess(v)}>
                        <ServerCog className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </div>
                );
              },
            } satisfies ColumnDef<VideoVM>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, lang, canAct],
  );

  return (
    <div>
      <PageHeader title={t('content.videos.title')} subtitle={t('content.videos.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('content.videos.totalStorage')} value={fmtBytes((totals?.totalStorageMb ?? 0) * 1024)} icon={<HardDrive />} color="#2563EB" hint={`${fmtNumber(totals?.count ?? 0)} ${t('nav.videos').toLowerCase()}`} />
        <StatCard loading={loading} label={t('content.videos.totalViews')} value={fmtCompact(totals?.totalViews ?? 0)} icon={<Eye />} color="#C9A24A" hint={`${fmtCompact(totals?.totalReplays ?? 0)} ${t('content.videos.replays').toLowerCase()}`} />
        <StatCard loading={loading} label={t('content.videos.readyAssets')} value={fmtNumber(totals?.ready ?? 0)} icon={<CheckCircle2 />} color="#16A34A" hint={`${Math.round(totals?.readyPct ?? 0)}%`} />
        <StatCard loading={loading} label={t('content.videos.issues')} value={fmtNumber(totals?.issues ?? 0)} icon={<AlertTriangle />} color="#DC2626" hint={`${t('content.videos.stream')} / ${t('content.videos.cdn')}`} />
      </div>

      <DataTable
        data={data}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onExport={can('content', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        initialHidden={['uploadedAt']}
        rowClassName={(v) => (v.streamStatus === 'failed' || v.cdnStatus === 'error' ? 'bg-danger/[0.03]' : undefined)}
        toolbar={
          <>
            <FilterSelect label={t('common.subject')} value={subject} onChange={setSubject} options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))} />
            <FilterSelect label={t('content.videos.stream')} value={stream} onChange={setStream} options={(['ready', 'processing', 'failed'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <FilterSelect label={t('content.videos.cdn')} value={cdn} onChange={setCdn} options={(['synced', 'pending', 'error'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
          </>
        }
        bulkActions={
          canAct
            ? (rows, clear) => (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulkMut.isPending}
                  icon={<Repeat2 className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    await bulkMut.mutateAsync(rows.filter((v) => v.streamStatus !== 'processing').map((v) => v.id)).catch(() => undefined);
                    clear();
                  }}
                >
                  {t('content.videos.bulkResync')}
                </Button>
              )
            : undefined
        }
      />
    </div>
  );
}
