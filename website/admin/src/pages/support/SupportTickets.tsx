import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Clock,
  Globe,
  Inbox,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Send,
  Smartphone,
  Trash2,
  UserCheck,
  UserRound,
  UserX,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { formatPhone, phoneHref } from '@/utils/phone';
import { useAuth, useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { qk } from '@/api/keys';
import { exportRequest, useExport, usePagedList } from '@/api/hooks';
import { flatRef } from '@/api/adapters';
import { useLookups } from '@/api/lookups';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  supportApi,
  useSupportTicket,
  useTicketMutations,
  type SupportTicketDto,
  type TicketPriority,
  type TicketStatus,
} from '@/api/support';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryError } from '@/components/ui/QueryError';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Drawer,
  Field,
  FilterSelect,
  MenuDivider,
  MenuItem,
  MenuLabel,
  Popover,
  Select,
  SkeletonCard,
  StatCard,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  type Tone,
  useConfirm,
} from '@/components/ui';

type TabKey = 'all' | TicketStatus;
const PRIORITY_TONE: Record<TicketPriority, Tone> = { high: 'danger', medium: 'warning', low: 'slate' };
const SOURCE_ICON = { contact_form: Globe, app: Smartphone, admin: UserRound } as const;
const isEmail = (v: string) => /@/.test(v);

/** Requester display: a registered student, or the name/contact typed into the public contact form. */
function Requester({ ticket, compact }: { ticket: SupportTicketDto; compact?: boolean }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  if (ticket.student) {
    const s = flatRef(ticket.student);
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={ticket.student.name.en} src={ticket.student.avatarUrl} size="sm" />
        <div className="min-w-0">
          {can('users', 'view') ? (
            <Link to={`/users/${ticket.student.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-ink hover:text-accent hover:underline">
              {L(s, 'name')}
            </Link>
          ) : (
            <span className="block truncate font-medium text-ink">{L(s, 'name')}</span>
          )}
          {!compact && (
            <span className="block text-[11px] text-muted num" dir="ltr">
              {formatPhone(ticket.student.mobile)}
            </span>
          )}
        </div>
      </div>
    );
  }
  const name = ticket.contact?.name || t('support.anonymous');
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        <span className="block truncate font-medium text-ink">{name}</span>
        {!compact && ticket.contact?.contact && (
          <span className="block truncate text-[11px] text-muted" dir="ltr">
            {ticket.contact.contact}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SupportTickets() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const adminId = useAuth((s) => s.adminId);
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('open');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [source, setSource] = useState('');
  const [assignee, setAssignee] = useState('');
  const [mine, setMine] = useState(false);
  const openId = params.get('ticket');
  const canEdit = can('users', 'edit');
  const canDelete = can('users', 'delete');

  const list = usePagedList({
    key: qk.support.list,
    fetcher: (p) => supportApi.list(p),
    filters: { status: tab === 'all' ? '' : tab, category, priority, source, assigneeId: mine ? (adminId ?? '') : assignee },
    initialSort: '-createdAt',
    refetchInterval: 60_000,
  });
  const counts = (list.data as { counts?: Record<TicketStatus, number> } | undefined)?.counts ?? { open: 0, pending: 0, resolved: 0 };
  const total = counts.open + counts.pending + counts.resolved;
  const m = useTicketMutations();
  const exp = useExport('/admin/support-tickets/export', 'support-tickets');

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('ticket', id);
    else next.delete('ticket');
    setParams(next, { replace: true });
  };

  const setStatus = (x: SupportTicketDto, status: TicketStatus) => m.update.mutate({ id: x.id, patch: { status } });
  const assignTo = (x: SupportTicketDto, id: string | null) => m.update.mutate({ id: x.id, patch: { assigneeId: id } });
  const remove = async (x: SupportTicketDto) => {
    const ok = await confirm({ title: t('support.deleteTitle', { id: x.id }), body: t('support.deleteBody'), confirmText: t('actions.delete') });
    if (!ok) return;
    m.remove.mutate(x.id, { onSuccess: () => openId === x.id && open(null) });
  };

  const columns = useMemo<ColumnDef<SupportTicketDto>[]>(
    () => [
      {
        id: 'number',
        accessorKey: 'id',
        header: t('support.ticket'),
        meta: { label: t('support.ticket') },
        cell: ({ row }) => {
          const x = row.original;
          return (
            <div className="min-w-[16rem] max-w-md">
              <div className="flex items-center gap-2">
                <code className="text-[11px] font-semibold text-muted" dir="ltr">
                  {x.id}
                </code>
                {x.replies > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-muted" title={t('support.repliesCount', { count: x.replies })}>
                    <MessageSquare className="h-3 w-3" /> <span className="num">{x.replies}</span>
                  </span>
                )}
              </div>
              <div className="truncate font-semibold text-ink" dir="auto">
                {L(flatRef({ name: x.subject }), 'name')}
              </div>
              <div className="truncate text-xs text-muted" dir="auto">
                {x.message}
              </div>
            </div>
          );
        },
      },
      {
        id: 'requester',
        accessorFn: (x) => x.student?.name.en ?? x.contact?.name ?? '',
        enableSorting: false,
        header: t('support.requester'),
        meta: { label: t('support.requester') },
        cell: ({ row }) => (
          <div className="min-w-[11rem]">
            <Requester ticket={row.original} />
          </div>
        ),
      },
      {
        id: 'category',
        accessorKey: 'category',
        enableSorting: false,
        header: t('support.category'),
        meta: { label: t('support.category') },
        cell: ({ row }) => {
          const Icon = SOURCE_ICON[row.original.source];
          return (
            <div className="whitespace-nowrap">
              <div className="text-ink/80">{t(`support.categories.${row.original.category}`)}</div>
              <div className="flex items-center gap-1 text-[11px] text-muted">
                <Icon className="h-3 w-3" /> {t(`support.sources.${row.original.source}`)}
              </div>
            </div>
          );
        },
      },
      {
        id: 'priority',
        accessorKey: 'priority',
        header: t('support.priority'),
        meta: { label: t('support.priority') },
        cell: ({ row }) => <Badge tone={PRIORITY_TONE[row.original.priority]} dot>{t(`support.priorities.${row.original.priority}`)}</Badge>,
      },
      {
        id: 'assignee',
        accessorFn: (x) => x.assignee?.name.en ?? '',
        enableSorting: false,
        header: t('support.assignee'),
        meta: { label: t('support.assignee') },
        cell: ({ row }) =>
          row.original.assignee ? (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Avatar name={row.original.assignee.name.en} src={row.original.assignee.avatarUrl} size="xs" />
              <span className="text-ink/80">{row.original.assignee.id === adminId ? t('support.me') : L(flatRef(row.original.assignee), 'name')}</span>
            </span>
          ) : (
            <span className="text-xs text-muted">{t('support.unassigned')}</span>
          ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => <StatusBadge status={row.original.status} label={t(`support.statuses.${row.original.status}`)} />,
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: t('common.created'),
        meta: { label: t('common.created') },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted" title={fmtDateTime(row.original.createdAt)}>
            {fmtRelative(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end', className: 'w-12' },
        cell: ({ row }) => {
          const x = row.original;
          if (!canEdit && !canDelete) return null;
          return (
            <span onClick={(e) => e.stopPropagation()}>
              <Popover
                panelClassName="w-56"
                trigger={({ toggle, open: isOpen }) => (
                  <button onClick={toggle} aria-expanded={isOpen} aria-label={t('actions.more')} className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-ink/[0.05] hover:text-ink">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              >
                {(close) => (
                  <div role="menu">
                    {canEdit && (
                      <>
                        {x.assignee?.id !== adminId && adminId && (
                          <MenuItem icon={<UserCheck />} onClick={() => { close(); assignTo(x, adminId); }}>
                            {t('support.assignMe')}
                          </MenuItem>
                        )}
                        {x.assignee && (
                          <MenuItem icon={<UserX />} onClick={() => { close(); assignTo(x, null); }}>
                            {t('support.unassign')}
                          </MenuItem>
                        )}
                        <MenuDivider />
                        <MenuLabel>{t('support.setStatus')}</MenuLabel>
                        {(['open', 'pending', 'resolved'] as TicketStatus[]).map((s) => (
                          <MenuItem key={s} active={x.status === s} disabled={x.status === s} onClick={() => { close(); setStatus(x, s); }}>
                            {t(`support.statuses.${s}`)}
                          </MenuItem>
                        ))}
                      </>
                    )}
                    {canDelete && (
                      <>
                        <MenuDivider />
                        <MenuItem danger icon={<Trash2 />} onClick={() => { close(); remove(x); }}>
                          {t('actions.delete')}
                        </MenuItem>
                      </>
                    )}
                  </div>
                )}
              </Popover>
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, adminId, canEdit, canDelete],
  );

  return (
    <div>
      <PageHeader title={t('support.title')} subtitle={t('support.subtitle')} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={list.isLoading} label={t('support.statuses.open')} value={fmtNumber(counts.open)} icon={<Inbox />} color="#DC2626" hint={t('support.kpiOpenHint')} onClick={() => setTab('open')} />
        <StatCard loading={list.isLoading} label={t('support.statuses.pending')} value={fmtNumber(counts.pending)} icon={<Clock />} color="#F59E0B" hint={t('support.kpiPendingHint')} onClick={() => setTab('pending')} />
        <StatCard loading={list.isLoading} label={t('support.statuses.resolved')} value={fmtNumber(counts.resolved)} icon={<CheckCircle2 />} color="#16A34A" hint={t('support.kpiResolvedHint')} onClick={() => setTab('resolved')} />
        <StatCard loading={list.isLoading} label={t('support.kpiTotal')} value={fmtNumber(total)} icon={<MessageSquare />} color="#0B1F3A" hint={t('support.kpiTotalHint')} onClick={() => setTab('all')} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'open', label: t('support.statuses.open'), count: counts.open },
              { key: 'pending', label: t('support.statuses.pending'), count: counts.pending },
              { key: 'resolved', label: t('support.statuses.resolved'), count: counts.resolved },
              { key: 'all', label: t('common.all'), count: total },
            ]}
          />
        </div>
        <DataTable
          key={tab}
          bare
          data={list.items}
          columns={columns}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          server={list.server}
          getRowId={(x) => x.id}
          onRowClick={(x) => open(x.id)}
          searchPlaceholder={t('support.searchPh')}
          rowClassName={(x) => cn(x.status === 'open' && x.priority === 'high' && 'bg-danger/[0.03]')}
          onExport={can('users', 'export') ? () => exp.mutate(exportRequest('csv', list.exportFilters)) : undefined}
          exporting={exp.isPending}
          toolbar={
            <>
              <FilterSelect label={t('support.category')} value={category} onChange={setCategory} options={TICKET_CATEGORIES.map((c) => ({ value: c, label: t(`support.categories.${c}`) }))} />
              <FilterSelect label={t('support.priority')} value={priority} onChange={setPriority} options={TICKET_PRIORITIES.map((p) => ({ value: p, label: t(`support.priorities.${p}`) }))} />
              <FilterSelect label={t('support.source')} value={source} onChange={setSource} options={TICKET_SOURCES.map((s) => ({ value: s, label: t(`support.sources.${s}`) }))} />
              {!mine && (
                <FilterSelect
                  label={t('support.assignee')}
                  value={assignee}
                  onChange={setAssignee}
                  options={[{ value: '__none', label: t('support.unassigned') }, ...lookups.admins.map((a) => ({ value: a.id, label: L(a, 'name') }))]}
                />
              )}
              <Switch size="sm" checked={mine} onChange={setMine} label={t('support.mine')} />
            </>
          }
          emptyTitle={tab === 'open' ? t('support.emptyOpen') : t('support.empty')}
          emptyHint={tab === 'open' ? t('support.emptyOpenHint') : t('support.emptyHint')}
        />
      </div>

      <TicketDrawer id={openId} onClose={() => open(null)} onDelete={canDelete ? remove : undefined} />
    </div>
  );
}

/* ─── Ticket detail: requester, triage controls, conversation, reply (ADM-SUP-02..05) ─── */

function TicketDrawer({ id, onClose, onDelete }: { id: string | null; onClose: () => void; onDelete?: (x: SupportTicketDto) => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const adminId = useAuth((s) => s.adminId);
  const lookups = useLookups();
  const q = useSupportTicket(id);
  const m = useTicketMutations();
  const [reply, setReply] = useState('');
  const [touched, setTouched] = useState(false);
  const canEdit = can('users', 'edit');
  const x = q.data;

  useEffect(() => {
    setReply('');
    setTouched(false);
  }, [id]);

  const replyErr = reply.trim().length < 2 ? t('support.replyTooShort') : undefined;
  const send = (status?: TicketStatus) => {
    setTouched(true);
    if (!x || replyErr) return;
    m.reply.mutate(
      { id: x.id, body: reply.trim(), status },
      {
        onSuccess: () => {
          setReply('');
          setTouched(false);
        },
      },
    );
  };
  const patch = (p: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null }) => x && m.update.mutate({ id: x.id, patch: p });

  const contact = x?.student ? x.student.mobile : x?.contact?.contact;
  const contactHref = contact ? (isEmail(contact) ? `mailto:${contact}?subject=${encodeURIComponent(`[${x?.id}] ${x?.subject.en ?? ''}`)}` : phoneHref(contact)) : null;

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width="xl"
      title={x ? L(flatRef({ name: x.subject }), 'name') : t('support.ticket')}
      description={
        x ? (
          <span className="flex flex-wrap items-center gap-2">
            <code className="text-xs" dir="ltr">
              {x.id}
            </code>
            <StatusBadge status={x.status} label={t(`support.statuses.${x.status}`)} />
            <span className="text-xs text-muted">{t('support.openedAt', { when: fmtDateTime(x.createdAt) })}</span>
          </span>
        ) : undefined
      }
      footer={
        x ? (
          <>
            {onDelete && (
              <Button variant="ghost" className="me-auto text-danger hover:bg-danger/10" icon={<Trash2 className="h-4 w-4" />} onClick={() => onDelete(x)}>
                {t('actions.delete')}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {t('actions.close')}
            </Button>
          </>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </div>
      ) : q.error || !x ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-5">
          {/* Requester + contact channel */}
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Requester ticket={x} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="navy">{t(`support.categories.${x.category}`)}</Badge>
                <Badge tone="slate">{t(`support.sources.${x.source}`)}</Badge>
                <Badge tone="neutral">{x.locale === 'ar' ? t('common.arabic') : t('common.english')}</Badge>
              </div>
            </div>
            {contact && contactHref && (
              <a href={contactHref} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-accent" dir="ltr">
                {isEmail(contact) ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />} {isEmail(contact) ? contact : formatPhone(contact)}
              </a>
            )}
            {!x.student && <p className="mt-2 text-xs text-muted">{t('support.contactFormNote')}</p>}
          </div>

          {/* Triage */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('common.status')} htmlFor="tk-status">
              <Select
                id="tk-status"
                value={x.status}
                disabled={!canEdit || m.update.isPending}
                onChange={(e) => patch({ status: e.target.value as TicketStatus })}
                options={(['open', 'pending', 'resolved'] as TicketStatus[]).map((s) => ({ value: s, label: t(`support.statuses.${s}`) }))}
              />
            </Field>
            <Field label={t('support.priority')} htmlFor="tk-priority">
              <Select
                id="tk-priority"
                value={x.priority}
                disabled={!canEdit || m.update.isPending}
                onChange={(e) => patch({ priority: e.target.value as TicketPriority })}
                options={TICKET_PRIORITIES.map((p) => ({ value: p, label: t(`support.priorities.${p}`) }))}
              />
            </Field>
            <Field label={t('support.assignee')} htmlFor="tk-assignee">
              <Select
                id="tk-assignee"
                value={x.assignee?.id ?? ''}
                disabled={!canEdit || m.update.isPending}
                onChange={(e) => patch({ assigneeId: e.target.value || null })}
                options={[
                  { value: '', label: t('support.unassigned') },
                  ...lookups.admins.map((a) => ({ value: a.id, label: a.id === adminId ? `${L(a, 'name')} (${t('support.me')})` : L(a, 'name') })),
                ]}
              />
            </Field>
          </div>

          {/* Conversation */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('support.conversation')}</h3>
            <ol className="space-y-3">
              <li className="rounded-xl border border-line p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{x.student ? L(flatRef(x.student), 'name') : x.contact?.name || t('support.anonymous')}</span>
                  <span title={fmtDateTime(x.createdAt)}>{fmtRelative(x.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90" dir="auto">
                  {x.message || '—'}
                </p>
              </li>
              {x.messages.map((msg) => {
                const mineMsg = msg.authorKind === 'admin';
                return (
                  <li key={msg.id} className={cn('rounded-xl border p-4', mineMsg ? 'ms-8 border-accent/30 bg-accent/[0.05]' : msg.authorKind === 'system' ? 'border-dashed border-line bg-surface-2' : 'me-8 border-line')}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        {mineMsg && msg.author && <Avatar name={msg.author.name.en} src={msg.author.avatarUrl} size="xs" />}
                        {mineMsg ? (msg.author ? L(flatRef(msg.author), 'name') : t('support.team')) : msg.authorKind === 'system' ? t('support.system') : t('support.requester')}
                      </span>
                      <span title={fmtDateTime(msg.createdAt)}>{fmtRelative(msg.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90" dir="auto">
                      {msg.body}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Reply */}
          {canEdit && (
            <div className="rounded-xl border border-line p-4">
              <Field label={t('support.reply')} hint={x.student ? t('support.replyHintStudent') : t('support.replyHintContact')} error={touched ? replyErr : undefined} htmlFor="tk-reply">
                <Textarea id="tk-reply" rows={4} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('support.replyPh')} dir="auto" />
              </Field>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {x.status !== 'resolved' && (
                  <Button variant="secondary" icon={<CheckCircle2 className="h-4 w-4" />} loading={m.reply.isPending && m.reply.variables?.status === 'resolved'} disabled={m.reply.isPending} onClick={() => send('resolved')}>
                    {t('support.replyResolve')}
                  </Button>
                )}
                <Button icon={<Send className="h-4 w-4 flip-rtl" />} loading={m.reply.isPending && m.reply.variables?.status !== 'resolved'} disabled={m.reply.isPending} onClick={() => send()}>
                  {t('support.sendReply')}
                </Button>
              </div>
            </div>
          )}
          {x.resolvedAt && <p className="text-center text-xs text-muted">{t('support.resolvedAt', { when: fmtDateTime(x.resolvedAt) })}</p>}
        </div>
      )}
    </Drawer>
  );
}
