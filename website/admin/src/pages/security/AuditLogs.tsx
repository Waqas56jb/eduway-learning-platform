import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, Braces, Columns2, Fingerprint, Monitor, ShieldAlert, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuditLog } from '@/types';
import { useAudit } from '@/store/audit';
import { useCan } from '@/store/auth';
import { rangeFromPreset, type DateRange } from '@/store/ui';
import { useMockLoading } from '@/hooks/useMockLoading';
import { MOCK_NOW } from '@/utils/random';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, DataTable, DateRangePicker, Drawer, FilterSelect, Segmented, StatCard, type Tone } from '@/components/ui';

const SENSITIVE = /role|admin|refund|settings|feature_flag|delete|grant|block|deactivate|mfa|session/;

const verbTone = (action: string): Tone => {
  const verb = action.split('.').pop() ?? '';
  if (/delete|reject|block|deactivate|revoke|force|lock$/.test(verb)) return 'danger';
  if (/create|invite|grant|publish|approve|unlock|activate/.test(verb)) return 'success';
  if (/login|logout/.test(verb)) return 'info';
  return 'navy';
};

const show = (v: unknown) => (v === undefined ? '—' : v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function AuditLogs() {
  const { t } = useTranslation();
  const can = useCan();
  const loading = useMockLoading();
  const logs = useAudit((s) => s.items);
  const [actor, setActor] = useState('');
  const [entity, setEntity] = useState('');
  const [range, setRange] = useState<DateRange>(() => rangeFromPreset('30d'));
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [view, setView] = useState<'diff' | 'json'>('diff');

  const actors = useMemo(() => [...new Set(logs.map((l) => l.actor))].sort(), [logs]);
  const entities = useMemo(() => [...new Set(logs.map((l) => l.entity))].sort(), [logs]);

  const filtered = useMemo(() => {
    const from = range.from.slice(0, 10);
    const to = range.to.slice(0, 10);
    return logs.filter((l) => {
      const d = l.at.slice(0, 10);
      // Presets are open-ended so actions taken "now" always appear.
      if (d < from || (range.preset === 'custom' && d > to)) return false;
      return (!actor || l.actor === actor) && (!entity || l.entity === entity);
    });
  }, [logs, actor, entity, range]);

  const ref = Math.max(Date.now(), MOCK_NOW.getTime());
  const today = filtered.filter((l) => ref - new Date(l.at).getTime() < 86_400_000).length;

  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        id: 'at',
        accessorKey: 'at',
        header: t('security.audit.timestamp'),
        meta: { label: t('security.audit.timestamp'), className: 'whitespace-nowrap' },
        cell: ({ row: { original: l } }) => (
          <div>
            <div className="text-ink num">{fmtDateTime(l.at)}</div>
            <div className="text-[11px] text-muted">{fmtRelative(l.at)}</div>
          </div>
        ),
      },
      {
        id: 'actor',
        accessorKey: 'actor',
        header: t('security.audit.actor'),
        meta: { label: t('security.audit.actor') },
        cell: ({ row: { original: l } }) => (
          <div className="flex items-center gap-2">
            <Avatar name={l.actor} size="xs" />
            <div className="min-w-0">
              <div className="truncate font-medium">{l.actor}</div>
              <div className="truncate text-[11px] text-muted">{l.actorRole}</div>
            </div>
          </div>
        ),
      },
      {
        id: 'action',
        accessorKey: 'action',
        header: t('security.audit.action'),
        meta: { label: t('security.audit.action') },
        cell: ({ row: { original: l } }) => (
          <Badge tone={verbTone(l.action)} className="font-mono">
            <span dir="ltr">{l.action}</span>
          </Badge>
        ),
      },
      {
        id: 'entity',
        accessorKey: 'entity',
        header: t('security.audit.entity'),
        meta: { label: t('security.audit.entity') },
        cell: ({ getValue }) => <span className="capitalize text-ink/80">{String(getValue()).replace(/_/g, ' ')}</span>,
      },
      {
        id: 'entityId',
        accessorKey: 'entityId',
        header: t('security.audit.entityId'),
        meta: { label: t('security.audit.entityId') },
        cell: ({ getValue }) => (
          <code className="text-xs text-muted" dir="ltr">
            {String(getValue())}
          </code>
        ),
      },
      {
        id: 'summary',
        accessorKey: 'summary',
        header: t('security.audit.summary'),
        enableSorting: false,
        meta: { label: t('security.audit.summary'), className: 'min-w-[16rem]' },
        cell: ({ getValue }) => <span className="line-clamp-2 text-ink/90">{String(getValue())}</span>,
      },
      {
        id: 'ip',
        accessorFn: (l) => `${l.ip} · ${l.device}`,
        header: t('security.audit.ipDevice'),
        enableSorting: false,
        meta: { label: t('security.audit.ipDevice') },
        cell: ({ row: { original: l } }) => (
          <div className="text-xs">
            <div className="font-mono text-ink/80" dir="ltr">
              {l.ip}
            </div>
            <div className="text-muted">{l.device}</div>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <PageHeader
        title={t('security.audit.title')}
        subtitle={t('security.audit.subtitle')}
        meta={
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <b className="text-success">{t('security.audit.live')}</b> · {t('security.audit.liveHint')}
          </span>
        }
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('security.audit.kpiTotal')} value={fmtNumber(filtered.length)} icon={<Activity />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('security.audit.kpiToday')} value={fmtNumber(today)} icon={<Fingerprint />} color="#C9A24A" />
        <StatCard loading={loading} label={t('security.audit.kpiActors')} value={fmtNumber(new Set(filtered.map((l) => l.actor)).size)} icon={<Users />} color="#2563EB" />
        <StatCard loading={loading} label={t('security.audit.kpiSensitive')} value={fmtNumber(filtered.filter((l) => SENSITIVE.test(l.action)).length)} icon={<ShieldAlert />} color="#DC2626" />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        pageSize={25}
        onRowClick={(l) => {
          setView('diff');
          setSelected(l);
        }}
        exportName={can('security', 'export') ? 'audit-logs' : undefined}
        searchText={(l) => `${l.actor} ${l.action} ${l.entity} ${l.entityId} ${l.summary} ${l.ip}`}
        initialSort={[{ id: 'at', desc: true }]}
        initialHidden={['entityId']}
        toolbar={
          <>
            <FilterSelect label={t('security.audit.actor')} value={actor} onChange={setActor} options={actors.map((a) => ({ value: a, label: a }))} />
            <FilterSelect
              label={t('security.audit.entity')}
              value={entity}
              onChange={setEntity}
              options={entities.map((e) => ({ value: e, label: e.replace(/_/g, ' ') }))}
            />
          </>
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        width="lg"
        title={selected?.summary}
        description={selected ? `${fmtDateTime(selected.at)} · ${selected.actor}` : undefined}
      >
        {selected && <AuditDetail log={selected} view={view} setView={setView} />}
      </Drawer>
    </>
  );
}

function AuditDetail({ log, view, setView }: { log: AuditLog; view: 'diff' | 'json'; setView: (v: 'diff' | 'json') => void }) {
  const { t } = useTranslation();
  const before = log.before ?? {};
  const after = log.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));

  const meta: [string, React.ReactNode][] = [
    [t('security.audit.action'), <code dir="ltr">{log.action}</code>],
    [t('security.audit.entity'), <span className="capitalize">{log.entity.replace(/_/g, ' ')}</span>],
    [t('security.audit.entityId'), <code dir="ltr">{log.entityId}</code>],
    [t('security.audit.actor'), `${log.actor} · ${log.actorRole}`],
    [t('security.audit.timestamp'), fmtDateTime(log.at)],
    ['IP', <code dir="ltr">{log.ip}</code>],
    [t('security.sessions.device'), <span className="inline-flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5 text-muted" />{log.device}</span>],
  ];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('security.audit.metadata')}</h3>
        <dl className="divide-y divide-line rounded-xl border border-line">
          {meta.map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="text-end text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t('security.audit.details')}
            {changed.length > 0 && <span className="ms-2 normal-case tracking-normal text-accent">· {t('security.audit.changedFields', { count: changed.length })}</span>}
          </h3>
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'diff', label: <span className="inline-flex items-center gap-1"><Columns2 className="h-3.5 w-3.5" />{t('security.audit.diffView')}</span> },
              { value: 'json', label: <span className="inline-flex items-center gap-1"><Braces className="h-3.5 w-3.5" />{t('security.audit.rawJson')}</span> },
            ]}
          />
        </div>

        {keys.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t('security.audit.noDiff')}</p>
        ) : view === 'diff' ? (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-1/4 px-3 py-2 text-start">{t('security.audit.field')}</th>
                  <th className="px-3 py-2 text-start">{t('security.audit.before')}</th>
                  <th className="px-3 py-2 text-start">{t('security.audit.after')}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const diff = changed.includes(k);
                  return (
                    <tr key={k} className="border-t border-line align-top">
                      <td className="px-3 py-2 font-mono text-xs text-ink/80" dir="ltr">
                        {k}
                      </td>
                      <td className={cn('break-words px-3 py-2 font-mono text-xs', diff ? 'bg-danger/[0.06] text-danger line-through decoration-danger/40' : 'text-muted')} dir="ltr">
                        {show(before[k])}
                      </td>
                      <td className={cn('break-words px-3 py-2 font-mono text-xs', diff ? 'bg-success/[0.07] font-semibold text-success' : 'text-muted')} dir="ltr">
                        {show(after[k])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['before', log.before],
                ['after', log.after],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1 text-xs font-medium text-muted">{t(`security.audit.${k}`)}</div>
                <pre className="scrollbar-thin max-h-80 overflow-auto rounded-xl bg-[#0B1F3A] p-3 text-[11px] leading-relaxed text-[#E6C77A]" dir="ltr">
                  {JSON.stringify(v, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
