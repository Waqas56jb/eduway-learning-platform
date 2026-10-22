import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertOctagon,
  Ban,
  BellRing,
  Bot,
  CheckCheck,
  Flag,
  Gauge,
  RotateCcw,
  ShieldBan,
  Tags,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useExport, exportRequest } from '@/api/hooks';
import { flatRef } from '@/api/adapters';
import {
  AI_EXPORT,
  useAiFlagDetail,
  useAiFlags,
  useAiSettings,
  useBlockStudent,
  useFlaggedUsers,
  useSaveAiSettings,
  useSetFlagStatus,
  useToggleUserAi,
  useWarnUser,
  type AiFlagDto,
  type AiFlagStatus,
  type FlaggedUserDto,
} from '@/api/aiTutor';
import { cn } from '@/utils/cn';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Field,
  FilterSelect,
  Input,
  Modal,
  Skeleton,
  SkeletonCard,
  StatusBadge,
  TagInput,
  useConfirm,
} from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ReasonBadge, SeverityBadge } from './shared';

const SEV_RANK = { low: 1, medium: 2, high: 3 } as const;

export default function AiAbuseControls() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const editable = can('aitutor', 'edit');
  const canExport = can('aitutor', 'export');

  const settingsQ = useAiSettings();
  const settings = settingsQ.data;
  const saveRateLimits = useSaveAiSettings();
  const saveKw = useSaveAiSettings();
  const toggleUser = useToggleUserAi();
  const warnUser = useWarnUser();
  const blockStudent = useBlockStudent();
  const setFlag = useSetFlagStatus();

  const [perMin, setPerMin] = useState(0);
  const [perHour, setPerHour] = useState(0);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState('');
  const [fSeverity, setFSeverity] = useState('');
  const [fReason, setFReason] = useState('');

  useEffect(() => {
    if (!settings) return;
    setPerMin(settings.rateLimitPerMinute);
    setPerHour(settings.rateLimitPerHour);
    setKeywords(settings.blockedKeywords);
  }, [settings]);

  const users = useFlaggedUsers();
  const flags = useAiFlags({ status: fStatus, severity: fSeverity, reason: fReason });
  const detailQ = useAiFlagDetail(detailId);
  const detail = detailQ.data ?? flags.items.find((f) => f.id === detailId) ?? null;

  const expUsers = useExport(AI_EXPORT.users, 'ai-flagged-users');
  const expFlags = useExport(AI_EXPORT.flags, 'ai-flagged-conversations');

  const rateDirty =
    !!settings && (perMin !== settings.rateLimitPerMinute || perHour !== settings.rateLimitPerHour);
  const kwDirty =
    !!settings && JSON.stringify(keywords) !== JSON.stringify(settings.blockedKeywords);
  const nameOf = (u: { student: FlaggedUserDto['student'] }) => L(flatRef(u.student), 'name');

  const saveRates = () => {
    if (perMin < 1 || perHour < perMin) {
      toast.error(t('aitutor.abuse.rateInvalid'));
      return;
    }
    saveRateLimits.mutate({ rateLimitPerMinute: perMin, rateLimitPerHour: perHour });
  };

  const saveKeywords = () => saveKw.mutate({ blockedKeywords: keywords });

  const warn = (u: FlaggedUserDto) =>
    warnUser.mutate(u.student.id, {
      onSuccess: () => toast.success(t('aitutor.abuse.warnedToast', { name: nameOf(u) })),
    });

  const toggleAi = async (u: FlaggedUserDto) => {
    const name = nameOf(u);
    if (u.aiDisabled) {
      toggleUser.mutate(
        { studentId: u.student.id, disable: false },
        { onSuccess: () => toast.success(t('aitutor.abuse.aiEnabledToast', { name })) },
      );
      return;
    }
    const ok = await confirm({
      title: t('aitutor.abuse.disableAiTitle', { name }),
      body: t('aitutor.abuse.disableAiBody'),
      confirmText: t('aitutor.abuse.disableAi'),
      tone: 'warning',
      reason: true,
    });
    if (!ok) return;
    toggleUser.mutate(
      { studentId: u.student.id, disable: true, reason: ok.reason },
      { onSuccess: () => toast.success(t('aitutor.abuse.aiDisabledToast', { name })) },
    );
  };

  const block = async (u: FlaggedUserDto) => {
    const name = nameOf(u);
    if (u.locked) {
      blockStudent.mutate(
        { id: u.student.id, block: false },
        { onSuccess: () => toast.success(t('aitutor.abuse.unblockedToast', { name })) },
      );
      return;
    }
    const ok = await confirm({
      title: t('aitutor.abuse.blockTitle', { name }),
      body: t('aitutor.abuse.blockBody'),
      confirmText: t('actions.block'),
      tone: 'danger',
      reason: true,
    });
    if (!ok) return;
    blockStudent.mutate(
      { id: u.student.id, block: true, reason: ok.reason },
      { onSuccess: () => toast.success(t('aitutor.abuse.blockedToast', { name })) },
    );
  };

  const setFlagStatus = (f: AiFlagDto, status: AiFlagStatus) =>
    setFlag.mutate(
      { id: f.id, status },
      {
        onSuccess: () =>
          toast.success(t('aitutor.abuse.flagUpdated', { status: t(`status.${status}`) })),
      },
    );

  const busy = toggleUser.isPending || warnUser.isPending || blockStudent.isPending;

  const userColumns = useMemo<ColumnDef<FlaggedUserDto>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => nameOf(r),
        header: t('common.student'),
        enableSorting: false,
        cell: ({ row }) => {
          const s = flatRef(row.original.student);
          return (
            <div className="flex items-center gap-2.5">
              <Avatar name={s.name_en} size="sm" />
              <div className="min-w-0">
                <Link
                  to={`/users/${s.id}`}
                  className="block truncate font-medium hover:text-accent"
                  onClick={(e) => e.stopPropagation()}
                >
                  {L(s, 'name')}
                </Link>
                <span className="num text-xs text-muted" dir="ltr">
                  {s.mobile}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'flags',
        accessorKey: 'flags',
        header: t('aitutor.abuse.flags'),
        meta: { align: 'end' },
      },
      { id: 'open', accessorKey: 'open', header: t('status.open'), meta: { align: 'end' } },
      {
        id: 'highest',
        accessorFn: (r) => SEV_RANK[r.highest],
        header: t('aitutor.abuse.highest'),
        cell: ({ row }) => <SeverityBadge severity={row.original.highest} />,
      },
      {
        id: 'last',
        accessorKey: 'last',
        header: t('aitutor.abuse.lastFlag'),
        cell: ({ getValue }) => (
          <span className="text-xs text-muted">{fmtRelative(getValue<string>())}</span>
        ),
      },
      {
        id: 'state',
        accessorFn: (r) => (r.locked ? 'blocked' : r.aiDisabled ? 'ai_disabled' : 'active'),
        header: t('common.status'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.locked ? (
              <StatusBadge status="blocked" />
            ) : row.original.aiDisabled ? (
              <Badge tone="warning" dot>
                {t('aitutor.abuse.aiOff')}
              </Badge>
            ) : (
              <StatusBadge status="active" />
            )}
            {row.original.warned && (
              <span title={row.original.warnedAt ? fmtDateTime(row.original.warnedAt) : undefined}>
                <Badge tone="info">{t('aitutor.abuse.warned')}</Badge>
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        enableSorting: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          editable ? (
            <div className="flex justify-end gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                title={t('aitutor.abuse.warn')}
                aria-label={t('aitutor.abuse.warn')}
                disabled={busy}
                onClick={() => warn(row.original)}
              >
                <BellRing className="h-4 w-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy}
                title={
                  row.original.aiDisabled
                    ? t('aitutor.abuse.enableAi')
                    : t('aitutor.abuse.disableAi')
                }
                aria-label={
                  row.original.aiDisabled
                    ? t('aitutor.abuse.enableAi')
                    : t('aitutor.abuse.disableAi')
                }
                onClick={() => toggleAi(row.original)}
              >
                {row.original.aiDisabled ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy || !can('users', 'edit')}
                className="text-danger hover:bg-danger/10 hover:text-danger"
                title={row.original.locked ? t('actions.unlock') : t('actions.block')}
                aria-label={row.original.locked ? t('actions.unlock') : t('actions.block')}
                onClick={() => block(row.original)}
              >
                <Ban className="h-4 w-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, editable, busy],
  );

  const flagColumns = useMemo<ColumnDef<AiFlagDto>[]>(
    () => [
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: t('common.date'),
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {fmtDateTime(getValue<string>())}
          </span>
        ),
      },
      {
        id: 'student',
        accessorFn: (r) => L(flatRef(r.student), 'name'),
        header: t('common.student'),
        enableSorting: false,
        cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
      },
      {
        id: 'subject',
        accessorFn: (r) => L(flatRef(r.subject), 'name'),
        header: t('common.subject'),
        enableSorting: false,
      },
      {
        id: 'excerpt',
        accessorKey: 'excerpt',
        header: t('aitutor.abuse.excerpt'),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="line-clamp-1 max-w-xs text-ink/80" dir="auto">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        header: t('common.reason'),
        cell: ({ row }) => <ReasonBadge reason={row.original.reason} />,
      },
      {
        id: 'severity',
        accessorKey: 'severity',
        header: t('aitutor.abuse.severity'),
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [t, L],
  );

  return (
    <>
      <PageHeader title={t('aitutor.abuse.title')} subtitle={t('aitutor.abuse.subtitle')} />

      {settingsQ.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : !settings ? (
        <QueryError error={settingsQ.error} onRetry={() => settingsQ.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title={t('aitutor.abuse.rateLimits')}
              subtitle={t('aitutor.abuse.rateSub')}
              icon={<Gauge className="h-4 w-4" />}
            />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('aitutor.abuse.perMinute')} htmlFor="rl-min">
                  <Input
                    id="rl-min"
                    type="number"
                    min={1}
                    value={perMin}
                    disabled={!editable}
                    onChange={(e) => setPerMin(Number(e.target.value) || 0)}
                    suffix={t('aitutor.abuse.req')}
                  />
                </Field>
                <Field label={t('aitutor.abuse.perHour')} htmlFor="rl-hour">
                  <Input
                    id="rl-hour"
                    type="number"
                    min={1}
                    value={perHour}
                    disabled={!editable}
                    onChange={(e) => setPerHour(Number(e.target.value) || 0)}
                    suffix={t('aitutor.abuse.req')}
                  />
                </Field>
              </div>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                {t('aitutor.abuse.rateHint', { min: fmtNumber(perMin), hour: fmtNumber(perHour) })}
              </p>
              {editable && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!rateDirty}
                    onClick={() => {
                      setPerMin(settings.rateLimitPerMinute);
                      setPerHour(settings.rateLimitPerHour);
                    }}
                  >
                    {t('actions.reset')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!rateDirty}
                    loading={saveRateLimits.isPending}
                    onClick={saveRates}
                  >
                    {t('actions.save')}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t('aitutor.abuse.keywords')}
              subtitle={t('aitutor.abuse.keywordsSub')}
              icon={<Tags className="h-4 w-4" />}
              action={<Badge tone="navy">{fmtNumber(keywords.length)}</Badge>}
            />
            <CardBody className="space-y-4">
              <TagInput
                value={keywords}
                onChange={setKeywords}
                disabled={!editable}
                placeholder={t('aitutor.abuse.keywordPlaceholder')}
                aria-label={t('aitutor.abuse.keywords')}
              />
              <p className="text-xs text-muted">{t('aitutor.abuse.keywordsHint')}</p>
              {editable && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!kwDirty}
                    onClick={() => setKeywords(settings.blockedKeywords)}
                  >
                    {t('actions.reset')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!kwDirty}
                    loading={saveKw.isPending}
                    onClick={saveKeywords}
                  >
                    {t('actions.save')}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <ShieldBan className="h-4 w-4 text-accent" />
          <h2 className="section-title">{t('aitutor.abuse.flaggedUsers')}</h2>
          <span className="text-xs text-muted">· {t('aitutor.abuse.flaggedUsersSub')}</span>
        </div>
        <DataTable
          data={users.items}
          columns={userColumns}
          loading={users.isLoading}
          error={users.error}
          onRetry={() => users.refetch()}
          server={users.server}
          getRowId={(r) => r.student.id}
          pageSize={5}
          onExport={
            canExport ? () => expUsers.mutate(exportRequest('csv', users.exportFilters)) : undefined
          }
          exporting={expUsers.isPending}
        />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-accent" />
          <h2 className="section-title">{t('aitutor.abuse.conversations')}</h2>
        </div>
        <DataTable
          data={flags.items}
          columns={flagColumns}
          loading={flags.isLoading}
          error={flags.error}
          onRetry={() => flags.refetch()}
          server={flags.server}
          pageSize={10}
          onRowClick={(f) => setDetailId(f.id)}
          onExport={
            canExport ? () => expFlags.mutate(exportRequest('csv', flags.exportFilters)) : undefined
          }
          exporting={expFlags.isPending}
          toolbar={
            <>
              <FilterSelect
                label={t('common.status')}
                value={fStatus}
                onChange={setFStatus}
                options={['open', 'reviewed', 'dismissed'].map((s) => ({
                  value: s,
                  label: t(`status.${s}`),
                }))}
              />
              <FilterSelect
                label={t('aitutor.abuse.severity')}
                value={fSeverity}
                onChange={setFSeverity}
                options={(['high', 'medium', 'low'] as const).map((s) => ({
                  value: s,
                  label: t(`aitutor.severity.${s}`),
                }))}
              />
              <FilterSelect
                label={t('common.reason')}
                value={fReason}
                onChange={setFReason}
                options={(
                  ['cheating', 'prompt_injection', 'self_harm', 'abuse', 'off_topic'] as const
                ).map((r) => ({ value: r, label: t(`aitutor.reasons.${r}`) }))}
              />
            </>
          }
        />
      </section>

      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        size="lg"
        title={t('aitutor.abuse.detailTitle')}
        description={
          detail
            ? `${detail.id.slice(0, 8).toUpperCase()} · ${fmtDateTime(detail.createdAt)}`
            : undefined
        }
        footer={
          detail && editable ? (
            <>
              {detail.status !== 'open' && (
                <Button
                  variant="ghost"
                  icon={<RotateCcw className="h-4 w-4" />}
                  disabled={setFlag.isPending}
                  onClick={() => setFlagStatus(detail, 'open')}
                >
                  {t('aitutor.abuse.reopen')}
                </Button>
              )}
              {detail.status !== 'dismissed' && (
                <Button
                  variant="secondary"
                  icon={<X className="h-4 w-4" />}
                  disabled={setFlag.isPending}
                  onClick={() => setFlagStatus(detail, 'dismissed')}
                >
                  {t('aitutor.usage.dismiss')}
                </Button>
              )}
              {detail.status !== 'reviewed' && (
                <Button
                  icon={<CheckCheck className="h-4 w-4" />}
                  loading={setFlag.isPending}
                  onClick={() => setFlagStatus(detail, 'reviewed')}
                >
                  {t('aitutor.usage.review')}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {detailQ.isLoading && !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : detailQ.error && !detail ? (
          <QueryError compact error={detailQ.error} onRetry={() => detailQ.refetch()} />
        ) : (
          detail && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={detail.severity} />
                <ReasonBadge reason={detail.reason} />
                <StatusBadge status={detail.status} />
                <Badge tone="slate">{t(`aitutor.abuse.sources.${detail.source}`)}</Badge>
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">{t('common.student')}</dt>
                  <dd className="mt-0.5 font-medium">
                    <Link to={`/users/${detail.student.id}`} className="hover:text-accent">
                      {L(flatRef(detail.student), 'name')}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('common.subject')}</dt>
                  <dd className="mt-0.5 font-medium">{L(flatRef(detail.subject), 'name')}</dd>
                </div>
                {detail.reviewedBy && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">{t('aitutor.abuse.reviewedBy')}</dt>
                    <dd className="mt-0.5 font-medium">
                      {L(flatRef(detail.reviewedBy), 'name')} ·{' '}
                      <span className="text-xs text-muted">{fmtDateTime(detail.reviewedAt)}</span>
                      {detail.note && (
                        <span className="mt-0.5 block text-xs font-normal text-muted">
                          {detail.note}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <div>
                <div className="mb-2 text-xs font-semibold text-muted">
                  {t('aitutor.abuse.conversation')}
                </div>
                <div className="scrollbar-thin max-h-[22rem] space-y-3 overflow-y-auto rounded-xl border border-line bg-surface-2 p-4">
                  {detailQ.data && detailQ.data.transcript.length > 0 ? (
                    detailQ.data.transcript.map((m, i) =>
                      m.role === 'student' ? (
                        <div key={i} className="flex justify-end">
                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl rounded-ee-sm bg-btn px-4 py-2.5 text-sm text-btn-ink',
                              m.flagged && 'ring-2 ring-danger/60',
                            )}
                            dir="auto"
                          >
                            {m.flagged && (
                              <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold">
                                <Flag className="h-3 w-3" /> {t('aitutor.abuse.flaggedMessage')}
                              </span>
                            )}
                            {m.text}
                            <span className="mt-1 block text-[10px] opacity-70">
                              {fmtDateTime(m.at)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div key={i} className="flex">
                          <div
                            className="max-w-[85%] rounded-2xl rounded-es-sm border border-line bg-surface px-4 py-2.5 text-sm text-ink/80"
                            dir="auto"
                          >
                            <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                              <Bot className="h-3.5 w-3.5" /> EDUWAY Tutor
                            </span>
                            {m.text}
                            <span className="mt-1 block text-[10px] text-muted">
                              {fmtDateTime(m.at)}
                            </span>
                          </div>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="flex justify-end">
                      <div
                        className="max-w-[85%] rounded-2xl rounded-ee-sm bg-btn px-4 py-2.5 text-sm text-btn-ink"
                        dir="auto"
                      >
                        {detail.excerpt}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted">
                {detailQ.data && detailQ.data.transcript.length > 0
                  ? t('aitutor.abuse.transcriptNote')
                  : t('aitutor.abuse.detailNote')}
              </p>
            </div>
          )
        )}
      </Modal>
    </>
  );
}
