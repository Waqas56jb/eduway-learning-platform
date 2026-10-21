import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { NotifChannel, NotificationTemplate, NotifType } from '@/types';
import { NOTIF_CHANNELS, NOTIF_TYPES } from '@/data/messaging';
import { useTemplates } from '@/store/messaging';
import { useCan } from '@/store/auth';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useLang } from '@/hooks/useLocale';
import { fmtRelative } from '@/utils/format';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardHeader, DataTable, FilterSelect, Skeleton, Switch, Tooltip, useConfirm } from '@/components/ui';
import { CHANNEL_META, ChannelIcon } from './_shared';

export default function Templates() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const loading = useMockLoading();
  const can = useCan();
  const confirm = useConfirm();
  const items = useTemplates((s) => s.items);
  const add = useTemplates((s) => s.add);
  const update = useTemplates((s) => s.update);
  const remove = useTemplates((s) => s.remove);
  const removeMany = useTemplates((s) => s.removeMany);
  const updateMany = useTemplates((s) => s.updateMany);
  const [type, setType] = useState('');
  const [channel, setChannel] = useState('');

  const canEdit = can('notifications', 'edit');
  const canDelete = can('notifications', 'delete');
  const canCreate = can('notifications', 'create');

  const rows = useMemo(() => items.filter((i) => (!type || i.type === type) && (!channel || i.channel === channel)), [items, type, channel]);

  const duplicate = (tpl: NotificationTemplate) => {
    const copy = add({ ...tpl, id: uid('tpl'), name: `${tpl.name} (${t('notifications.templates.copySuffix')})`, active: false, updatedAt: new Date().toISOString() }, { action: 'notification_template.duplicate', summary: `Duplicated template “${tpl.name}”` });
    toast.success(t('notifications.templates.duplicated'));
    navigate(`/notifications/templates/${copy.id}`);
  };

  const del = async (tpl: NotificationTemplate) => {
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: tpl.name }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    remove(tpl.id);
    toast.success(t('toast.deleted', { entity: tpl.name }));
  };

  const columns = useMemo<ColumnDef<NotificationTemplate>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('common.name'),
        meta: { label: t('common.name') },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <ChannelIcon channel={row.original.channel} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{row.original.name}</div>
              <div className="max-w-[22rem] truncate text-xs text-muted">{lang === 'ar' ? row.original.body_ar : row.original.body_en}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: t('common.type'),
        meta: { label: t('common.type'), exportValue: (r) => t(`notifications.types.${r.type}`) },
        cell: ({ row }) => <span className="text-sm text-ink/80">{t(`notifications.types.${row.original.type}`)}</span>,
      },
      {
        accessorKey: 'channel',
        header: t('notifications.channel'),
        meta: { label: t('notifications.channel'), exportValue: (r) => t(`notifications.channels.${r.channel}`) },
        cell: ({ row }) => <Badge tone={CHANNEL_META[row.original.channel].tone}>{t(`notifications.channels.${row.original.channel}`)}</Badge>,
      },
      {
        id: 'variables',
        accessorFn: (r) => r.variables.join(', '),
        header: t('notifications.variables'),
        enableSorting: false,
        meta: { label: t('notifications.variables') },
        cell: ({ row }) => (
          <div className="flex max-w-[16rem] flex-wrap gap-1">
            {row.original.variables.slice(0, 3).map((v) => (
              <code key={v} className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-primary" dir="ltr">{`{${v}}`}</code>
            ))}
            {row.original.variables.length > 3 && <span className="text-[10px] text-muted">+{row.original.variables.length - 3}</span>}
          </div>
        ),
      },
      {
        accessorKey: 'active',
        header: t('common.status'),
        meta: { label: t('common.status'), exportValue: (r) => (r.active ? 'active' : 'inactive') },
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-2">
            <Switch
              size="sm"
              checked={row.original.active}
              disabled={!canEdit}
              aria-label={row.original.name}
              onChange={(v) => {
                update(row.original.id, { active: v, updatedAt: new Date().toISOString() }, { action: v ? 'notification_template.activate' : 'notification_template.deactivate' });
                toast.success(t(v ? 'notifications.templates.activated' : 'notifications.templates.deactivated'));
              }}
            />
            <span className={cn('text-xs', row.original.active ? 'text-success' : 'text-muted')}>{row.original.active ? t('status.active') : t('status.inactive')}</span>
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: t('common.updated'),
        meta: { label: t('common.updated') },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted">{fmtRelative(getValue<string>())}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Tooltip content={t('actions.edit')}>
              <Button size="icon-sm" variant="ghost" aria-label={t('actions.edit')} onClick={() => navigate(`/notifications/templates/${row.original.id}`)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </Tooltip>
            {canCreate && (
              <Tooltip content={t('actions.duplicate')}>
                <Button size="icon-sm" variant="ghost" aria-label={t('actions.duplicate')} onClick={() => duplicate(row.original)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip content={t('actions.delete')}>
                <Button size="icon-sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" aria-label={t('actions.delete')} onClick={() => del(row.original)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, lang, canEdit, canDelete, canCreate],
  );

  const cell = (ty: NotifType, ch: NotifChannel) => items.filter((i) => i.type === ty && i.channel === ch);

  return (
    <div>
      <PageHeader
        title={t('notifications.templates.title')}
        subtitle={t('notifications.templates.subtitle')}
        actions={
          canCreate && (
            <ButtonLink to="/notifications/templates/new" icon={<Plus className="h-4 w-4" />}>
              {t('notifications.templates.new')}
            </ButtonLink>
          )
        }
      />

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={t('notifications.templates.matrix')} subtitle={t('notifications.templates.matrixHint')} />
        {loading ? (
          <div className="p-5">
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-surface-2">
                  <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-muted">{t('common.type')}</th>
                  {NOTIF_CHANNELS.map((ch) => (
                    <th key={ch} className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <ChannelIcon channel={ch} className="h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5" />
                        {t(`notifications.channels.${ch}`)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIF_TYPES.map((ty) => (
                  <tr key={ty} className="border-t border-line">
                    <td className="px-4 py-2 font-medium text-ink">{t(`notifications.types.${ty}`)}</td>
                    {NOTIF_CHANNELS.map((ch) => {
                      const list = cell(ty, ch);
                      const active = list.some((l) => l.active);
                      const selected = type === ty && channel === ch;
                      return (
                        <td key={ch} className="px-3 py-1.5 text-center">
                          {list.length ? (
                            <button
                              onClick={() => {
                                setType(selected ? '' : ty);
                                setChannel(selected ? '' : ch);
                              }}
                              aria-pressed={selected}
                              aria-label={`${t(`notifications.types.${ty}`)} · ${t(`notifications.channels.${ch}`)}`}
                              className={cn(
                                'inline-flex h-8 min-w-14 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition',
                                active ? 'bg-success/10 text-success hover:bg-success/15' : 'bg-ink/5 text-muted hover:bg-ink/10',
                                selected && 'ring-2 ring-accent',
                              )}
                            >
                              <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-success' : 'bg-muted')} />
                              {list.length}
                            </button>
                          ) : canCreate ? (
                            <button
                              onClick={() => navigate(`/notifications/templates/new?type=${ty}&channel=${ch}`)}
                              className="inline-flex h-8 w-14 items-center justify-center rounded-lg border border-dashed border-line text-muted/60 transition hover:border-accent hover:text-accent"
                              aria-label={`${t('notifications.templates.new')}: ${t(`notifications.types.${ty}`)} · ${t(`notifications.channels.${ch}`)}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="text-muted/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        exportName="notification-templates"
        onRowClick={(r) => navigate(`/notifications/templates/${r.id}`)}
        initialSort={[{ id: 'updatedAt', desc: true }]}
        searchText={(r) => `${r.name} ${r.body_en} ${r.body_ar} ${r.type} ${r.channel}`}
        toolbar={
          <>
            <FilterSelect label={t('common.type')} value={type} onChange={setType} options={NOTIF_TYPES.map((v) => ({ value: v, label: t(`notifications.types.${v}`) }))} />
            <FilterSelect label={t('notifications.channel')} value={channel} onChange={setChannel} options={NOTIF_CHANNELS.map((v) => ({ value: v, label: t(`notifications.channels.${v}`) }))} />
          </>
        }
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button size="sm" variant="secondary" onClick={() => { updateMany(sel.map((s) => s.id), { active: true }); toast.success(t('toast.bulkDone', { count: sel.length })); clear(); }}>
                    {t('actions.activate')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { updateMany(sel.map((s) => s.id), { active: false }); toast.success(t('toast.bulkDone', { count: sel.length })); clear(); }}>
                    {t('actions.deactivate')}
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        const ok = await confirm({ title: t('notifications.templates.bulkDeleteTitle', { count: sel.length }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
                        if (!ok) return;
                        removeMany(sel.map((s) => s.id));
                        toast.success(t('toast.bulkDone', { count: sel.length }));
                        clear();
                      }}
                    >
                      {t('actions.delete')}
                    </Button>
                  )}
                </>
              )
            : undefined
        }
        emptyAction={canCreate ? <ButtonLink to="/notifications/templates/new" size="sm">{t('notifications.templates.new')}</ButtonLink> : undefined}
      />
    </div>
  );
}
