import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Eye, HardDrive, RefreshCw, Repeat2, ServerCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { VideoAsset } from '@/types';
import { fmtBytes, fmtCompact, fmtDate, fmtDuration, fmtNumber } from '@/utils/format';
import { useLessons, useSubjects } from '@/store/core';
import { useVideos } from '@/store/content';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, DataTable, FilterSelect, StatCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';

export default function Videos() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading();
  const videos = useVideos((s) => s.items);
  const lessons = useLessons((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const [subject, setSubject] = useState('');
  const [stream, setStream] = useState('');
  const [cdn, setCdn] = useState('');

  const lessonMap = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const canAct = can('content', 'edit');

  const data = useMemo(
    () =>
      videos.filter((v) => {
        const l = lessonMap.get(v.lessonId);
        return (!subject || l?.subjectId === subject) && (!stream || v.streamStatus === stream) && (!cdn || v.cdnStatus === cdn);
      }),
    [videos, lessonMap, subject, stream, cdn],
  );

  const totals = useMemo(
    () => ({
      storage: videos.reduce((s, v) => s + v.sizeMb, 0),
      views: videos.reduce((s, v) => s + v.views, 0),
      ready: videos.filter((v) => v.streamStatus === 'ready' && v.cdnStatus === 'synced').length,
      issues: videos.filter((v) => v.streamStatus === 'failed' || v.cdnStatus === 'error').length,
    }),
    [videos],
  );

  const resync = (v: VideoAsset) => {
    useVideos.getState().update(v.id, { cdnStatus: 'pending' }, { action: 'video.cdn_resync', summary: `Queued CDN re-sync for ${v.assetId}` });
    toast.success(t('content.videos.resynced', { id: v.assetId }));
    setTimeout(() => {
      useVideos.getState().update(v.id, { cdnStatus: 'synced' }, { silent: true });
      toast.success(t('content.videos.resyncDone', { id: v.assetId }));
    }, 2200);
  };

  const reprocess = async (v: VideoAsset) => {
    const ok = await confirm({ title: t('content.videos.reprocessTitle'), body: t('content.videos.reprocessBody'), tone: 'warning', confirmText: t('content.videos.reprocess') });
    if (!ok) return;
    useVideos.getState().update(v.id, { streamStatus: 'processing', cdnStatus: 'pending' }, { action: 'video.reprocess', summary: `Started re-encoding ${v.assetId}` });
    toast.success(t('content.videos.reprocessed', { id: v.assetId }));
    setTimeout(() => {
      useVideos.getState().update(v.id, { streamStatus: 'ready', cdnStatus: 'synced', uploadedAt: new Date().toISOString() }, { silent: true });
      toast.success(t('content.videos.reprocessDone', { id: v.assetId }));
    }, 3500);
  };

  const columns = useMemo<ColumnDef<VideoAsset>[]>(
    () => [
      {
        id: 'assetId',
        header: t('content.videos.assetId'),
        meta: { label: t('content.videos.assetId') },
        accessorKey: 'assetId',
        cell: ({ row }) => (
          <span className="whitespace-nowrap rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[11px] text-ink/80" dir="ltr">
            {row.original.assetId}
          </span>
        ),
      },
      {
        id: 'lesson',
        header: t('common.lesson'),
        meta: { label: t('common.lesson'), exportValue: (v) => lessonMap.get(v.lessonId)?.title_en ?? '' },
        accessorFn: (v) => L(lessonMap.get(v.lessonId), 'title'),
        cell: ({ row }) => {
          const l = lessonMap.get(row.original.lessonId);
          const s = l ? subjectMap.get(l.subjectId) : undefined;
          return l ? (
            <Link to={`/content/lessons/${l.id}`} onClick={(e) => e.stopPropagation()} className="group flex min-w-[220px] items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s?.color }} />
              <span className="truncate font-medium text-ink group-hover:text-accent">{L(l, 'title')}</span>
            </Link>
          ) : (
            '—'
          );
        },
      },
      { id: 'size', header: t('content.videos.size'), meta: { label: t('content.videos.size'), align: 'end' }, accessorKey: 'sizeMb', cell: ({ row }) => fmtBytes(row.original.sizeMb * 1024) },
      { id: 'duration', header: t('content.videos.duration'), meta: { label: t('content.videos.duration'), align: 'end', exportValue: (v) => fmtDuration(v.durationSec) }, accessorKey: 'durationSec', cell: ({ row }) => fmtDuration(row.original.durationSec) },
      { id: 'resolution', header: t('content.videos.resolution'), meta: { label: t('content.videos.resolution') }, accessorKey: 'resolution', cell: ({ row }) => <Badge tone={row.original.resolution === '4K' ? 'accent' : 'neutral'}>{row.original.resolution}</Badge> },
      { id: 'stream', header: t('content.videos.stream'), meta: { label: t('content.videos.stream') }, accessorKey: 'streamStatus', cell: ({ row }) => <StatusBadge status={row.original.streamStatus} /> },
      { id: 'cdn', header: t('content.videos.cdn'), meta: { label: t('content.videos.cdn') }, accessorKey: 'cdnStatus', cell: ({ row }) => <StatusBadge status={row.original.cdnStatus} /> },
      { id: 'views', header: t('content.videos.views'), meta: { label: t('content.videos.views'), align: 'end' }, accessorKey: 'views', cell: ({ row }) => fmtNumber(row.original.views) },
      { id: 'replays', header: t('content.videos.replays'), meta: { label: t('content.videos.replays'), align: 'end' }, accessorKey: 'replays', cell: ({ row }) => fmtNumber(row.original.replays) },
      { id: 'uploaded', header: t('content.videos.uploaded'), meta: { label: t('content.videos.uploaded') }, accessorKey: 'uploadedAt', cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDate(row.original.uploadedAt)}</span> },
      ...(canAct
        ? [
            {
              id: 'actions',
              header: '',
              enableSorting: false,
              enableHiding: false,
              meta: { noExport: true, align: 'end' as const },
              cell: ({ row }: { row: { original: VideoAsset } }) => {
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
            } satisfies ColumnDef<VideoAsset>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, lessonMap, subjectMap, canAct],
  );

  return (
    <div>
      <PageHeader title={t('content.videos.title')} subtitle={t('content.videos.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('content.videos.totalStorage')} value={fmtBytes(totals.storage * 1024)} icon={<HardDrive />} color="#2563EB" hint={`${fmtNumber(videos.length)} ${t('nav.videos').toLowerCase()}`} />
        <StatCard loading={loading} label={t('content.videos.totalViews')} value={fmtCompact(totals.views)} icon={<Eye />} color="#C9A24A" hint={`${fmtCompact(videos.reduce((s, v) => s + v.replays, 0))} ${t('content.videos.replays').toLowerCase()}`} />
        <StatCard loading={loading} label={t('content.videos.readyAssets')} value={fmtNumber(totals.ready)} icon={<CheckCircle2 />} color="#16A34A" hint={`${Math.round((totals.ready / Math.max(1, videos.length)) * 100)}%`} />
        <StatCard loading={loading} label={t('content.videos.issues')} value={fmtNumber(totals.issues)} icon={<AlertTriangle />} color="#DC2626" hint={`${t('content.videos.stream')} / ${t('content.videos.cdn')}`} />
      </div>

      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        exportName={can('content', 'export') ? 'video-library' : undefined}
        searchText={(v) => {
          const l = lessonMap.get(v.lessonId);
          return `${v.assetId} ${l?.title_en ?? ''} ${l?.title_ar ?? ''}`;
        }}
        initialSort={[{ id: 'views', desc: true }]}
        initialHidden={['uploaded']}
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
                  icon={<Repeat2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    rows.filter((v) => v.streamStatus !== 'processing').forEach(resync);
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
