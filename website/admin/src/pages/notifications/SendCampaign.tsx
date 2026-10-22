import { useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { CalendarClock, Filter, Globe, Megaphone, RotateCcw, Send, Smartphone, Users, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { NotifChannel } from '@/types';
import {
  NOTIF_CHANNELS,
  PLATFORMS,
  notificationsApi,
  type CampaignFilters,
  type CampaignVM,
  type SubscriptionStatus,
} from '@/api/notifications';
import { qk } from '@/api/keys';
import { uuid, isApiError } from '@/api/client';
import { exportRequest, useApiMutation, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import type { Platform } from '@/api/types';
import { useCan } from '@/store/auth';
import { useDebounce } from '@/hooks/useMisc';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { fmtDateTime, fmtNumber } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, Field, Input, ProgressBar, Segmented, Select, StatusBadge, Tooltip, useConfirm } from '@/components/ui';
import { CHANNEL_META, ChannelIcon, PhonePreview, useTemplateVariables } from './_shared';

interface Audience {
  package: string;
  subject: string;
  governorate: string;
  school: string;
  inactiveDays: string;
  subscriptionStatus: string;
  platforms: Platform[];
}

const EMPTY: Audience = { package: '', subject: '', governorate: '', school: '', inactiveDays: '', subscriptionStatus: '', platforms: [] };
const SUB_STATUSES: SubscriptionStatus[] = ['active', 'trial', 'expired', 'cancelled', 'none'];

const toFilters = (a: Audience): CampaignFilters => ({
  packageId: a.package || null,
  subjectId: a.subject || null,
  governorateId: a.governorate || null,
  schoolId: a.school || null,
  inactiveDays: a.inactiveDays ? Number(a.inactiveDays) : null,
  platforms: a.platforms.length ? a.platforms : null,
  subscriptionStatus: (a.subscriptionStatus || null) as SubscriptionStatus | null,
});

export default function SendCampaign() {
  const { t } = useTranslation();
  const lang = useLang();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const lookups = useLookups();
  const vars = useTemplateVariables();

  const canSend = can('notifications', 'create');
  const [aud, setAud] = useState<Audience>(EMPTY);
  const [channel, setChannel] = useState<NotifChannel>('push');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [previewLang, setPreviewLang] = useState<'en' | 'ar'>(lang);
  /** Idempotency-Key for the pending send; reused if the same send is retried, cleared on success. */
  const idemKey = useRef<string | null>(null);

  // Live audience count (ADM-CMP-03), debounced so typing "inactive days" doesn't spam the API.
  const filters = useMemo(() => toFilters(aud), [aud]);
  const debounced = useDebounce(JSON.stringify({ filters, channel }), 350);
  const previewArgs = useMemo(() => JSON.parse(debounced) as { filters: CampaignFilters; channel: NotifChannel }, [debounced]);
  const audienceQ = useApiQuery(qk.campaigns.sub('audience', previewArgs), () => notificationsApi.audiencePreview(previewArgs.filters, previewArgs.channel), {
    placeholderData: (prev) => prev,
  });
  const audience = audienceQ.data;
  const audienceStale = audienceQ.isFetching || debounced !== JSON.stringify({ filters, channel });

  // Templates usable for the selected channel (ADM-NTT-01?channel&active=true).
  const tplQ = useApiQuery(qk.templates.list({ channel, active: true, pageSize: 100, picker: true }), () =>
    notificationsApi.listTemplates({ channel, active: true, pageSize: 100, sort: 'name' }),
  );
  const channelTemplates = tplQ.data?.items ?? [];
  const template = channelTemplates.find((tp) => tp.id === templateId) ?? channelTemplates[0];

  const history = usePagedList({ key: qk.campaigns.list, fetcher: notificationsApi.listCampaigns, initialSort: '-createdAt', pageSize: 5 });
  const exp = useExport('/admin/campaigns/export', 'campaigns');

  const reachable = audience?.reachable ?? 0;
  const matched = audience?.matched ?? 0;
  const total = audience?.total ?? 0;
  const activeFilters = Object.values(aud).filter((v) => (Array.isArray(v) ? v.length > 0 : !!v)).length;
  const scheduleInvalid = when === 'later' && (!at || new Date(at).getTime() <= Date.now());
  const ready = canSend && !!template && !!audience && !audienceStale && reachable > 0 && name.trim().length >= 3 && !scheduleInvalid;

  const setChannelAndTemplate = (ch: NotifChannel) => {
    setChannel(ch);
    setTemplateId('');
  };

  const togglePlatform = (p: Platform) =>
    setAud((a) => ({ ...a, platforms: a.platforms.includes(p) ? a.platforms.filter((x) => x !== p) : [...a.platforms, p] }));

  const sendM = useApiMutation(
    (v: { body: Parameters<typeof notificationsApi.createCampaign>[0]; key: string }) => notificationsApi.createCampaign(v.body, v.key),
    {
      invalidate: [qk.campaigns.all, qk.deliveries.all],
      silentError: true,
      onError: (err) => {
        if (isApiError(err) && err.reason === 'NO_RECIPIENTS') toast.error(t('notifications.campaign.noRecipients'));
        else toast.error(err.message || t('apiErrors.INTERNAL'));
      },
    },
  );

  const cancelM = useApiMutation((c: CampaignVM) => notificationsApi.cancelCampaign(c.id), {
    invalidate: [qk.campaigns.all],
    success: 'notifications.campaign.cancelledToast',
  });

  const send = async () => {
    if (!template) return;
    const ok = await confirm({
      title: when === 'now' ? t('notifications.campaign.confirmSendTitle', { count: reachable }) : t('notifications.campaign.confirmScheduleTitle'),
      body: t('notifications.campaign.confirmBody', { name: name.trim(), channel: t(`notifications.channels.${channel}`), count: reachable, when: when === 'now' ? t('notifications.campaign.immediately') : fmtDateTime(new Date(at)) }),
      tone: 'primary',
      confirmText: when === 'now' ? t('actions.send') : t('actions.schedule'),
    });
    if (!ok) return;
    idemKey.current ??= uuid();
    const sendAt = when === 'later' ? new Date(at).toISOString() : null;
    const cmp = await sendM
      .mutateAsync({ body: { name: name.trim(), channel, templateId: template.id, filters, sendAt }, key: idemKey.current })
      .catch(() => null);
    if (!cmp) return;
    idemKey.current = null;
    if (sendAt) toast.success(t('notifications.campaign.scheduledToast', { when: fmtDateTime(sendAt) }));
    else toast.success(t('notifications.campaign.sentToast', { count: cmp.audienceCount }));
    setName('');
    setAt('');
    setWhen('now');
  };

  const cancelScheduled = async (c: CampaignVM) => {
    const ok = await confirm({ title: t('notifications.campaign.cancelTitle', { name: c.name }), body: t('notifications.campaign.cancelBody'), tone: 'warning', confirmText: t('notifications.campaign.cancelCampaign') });
    if (!ok) return;
    cancelM.mutate(c);
  };

  const columns = useMemo<ColumnDef<CampaignVM>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: t('notifications.campaign.name'),
        meta: { label: t('notifications.campaign.name') },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <ChannelIcon channel={row.original.channel} />
            <div className="min-w-0">
              <Link to={`/notifications/campaigns/${row.original.id}`} className="block truncate font-medium text-ink hover:text-accent hover:underline">
                {row.original.name}
              </Link>
              <div className="text-xs text-muted">
                {t(`notifications.channels.${row.original.channel}`)}
                {row.original.templateName && <> · {row.original.templateName}</>}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'audienceCount',
        accessorKey: 'audienceCount',
        header: t('notifications.campaign.recipients'),
        meta: { label: t('notifications.campaign.recipients'), align: 'end' },
        cell: ({ row }) => {
          const s = row.original.stats;
          return (
            <div className="whitespace-nowrap">
              <div>{fmtNumber(row.original.audienceCount)}</div>
              {(s.delivered > 0 || s.failed > 0) && (
                <div className="text-[11px] text-muted">
                  <span className="text-success">{fmtNumber(s.delivered)}</span> · <span className={s.failed ? 'text-danger' : undefined}>{fmtNumber(s.failed)}</span>
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        id: 'createdAt',
        accessorFn: (r) => r.sentAt ?? r.scheduledAt ?? r.createdAt,
        header: t('notifications.campaign.when'),
        meta: { label: t('notifications.campaign.when') },
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{row.original.sentAt ? fmtDateTime(row.original.sentAt) : row.original.scheduledAt ? fmtDateTime(row.original.scheduledAt) : '—'}</span>,
      },
      { id: 'createdBy', accessorKey: 'createdBy', enableSorting: false, header: t('notifications.campaign.createdBy'), meta: { label: t('notifications.campaign.createdBy') } },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        meta: { noExport: true, align: 'end' },
        cell: ({ row }) =>
          row.original.status === 'scheduled' && canSend ? (
            <Tooltip content={t('notifications.campaign.cancelCampaign')}>
              <Button size="icon-sm" variant="ghost" className="text-danger hover:bg-danger/10" aria-label={t('notifications.campaign.cancelCampaign')} onClick={() => cancelScheduled(row.original)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </Tooltip>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canSend],
  );

  const filterSelect = (key: Exclude<keyof Audience, 'platforms'>, label: string, options: { value: string; label: string }[]) => (
    <Field label={label}>
      <Select value={aud[key]} onChange={(e) => setAud((a) => ({ ...a, [key]: e.target.value }))} placeholder={t('common.all')} options={options} />
    </Field>
  );

  const pct = total ? (reachable / total) * 100 : 0;
  const excluded = audience?.excluded;
  const excludedTotal = excluded ? excluded.noEmail + excluded.noPushToken + excluded.optedOut + excluded.locked : 0;

  return (
    <div>
      <PageHeader title={t('notifications.campaign.title')} subtitle={t('notifications.campaign.subtitle')} />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title={t('notifications.campaign.audience')}
              subtitle={t('notifications.campaign.audienceHint')}
              icon={<Filter className="h-4 w-4" />}
              action={
                activeFilters > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setAud(EMPTY)} icon={<RotateCcw className="h-3.5 w-3.5" />}>
                    {t('actions.clearFilters')}
                  </Button>
                )
              }
            />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filterSelect('package', t('common.package'), lookups.packages.map((p) => ({ value: p.id, label: L(p, 'name') })))}
              {filterSelect('subject', t('common.subject'), lookups.subjects.map((s) => ({ value: s.id, label: L(s, 'name') })))}
              {filterSelect('governorate', t('common.governorate'), lookups.governorates.map((g) => ({ value: g.id, label: L(g, 'name') })))}
              {filterSelect('school', t('common.school'), lookups.schools.map((s) => ({ value: s.id, label: L(s, 'name') })))}
              {filterSelect('subscriptionStatus', t('notifications.campaign.subscriptionStatus'), SUB_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })))}
              <Field label={t('notifications.campaign.inactiveDays')} hint={t('notifications.campaign.inactiveDaysHint')}>
                <Input type="number" min={1} max={365} value={aud.inactiveDays} onChange={(e) => setAud((a) => ({ ...a, inactiveDays: e.target.value }))} placeholder="—" suffix={t('common.days')} />
              </Field>
              <Field label={t('notifications.campaign.platforms')} hint={t('notifications.campaign.platformsHint')} className="sm:col-span-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('notifications.campaign.platforms')}>
                  {PLATFORMS.map((p) => {
                    const on = aud.platforms.includes(p);
                    const Icon = p === 'web' ? Globe : Smartphone;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        aria-pressed={on}
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition',
                          on ? 'border-accent bg-accent/[0.08] text-primary shadow-sm' : 'border-line text-muted hover:border-accent/50 hover:text-ink',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {t(`notifications.platforms.${p}`)}
                      </button>
                    );
                  })}
                  {aud.platforms.length === 0 && <span className="self-center text-xs text-muted">{t('notifications.campaign.allPlatforms')}</span>}
                </div>
              </Field>
              <div className="flex flex-col justify-end">
                <div className={cn('rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3 transition-opacity', audienceStale && audience && 'opacity-60')} aria-live="polite">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Users className="h-3.5 w-3.5 text-accent" /> {t('notifications.campaign.previewCount')}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="kpi-num text-2xl text-primary">{audienceQ.isLoading ? '—' : fmtNumber(reachable)}</span>
                    <span className="text-xs text-muted">/ {fmtNumber(total)}</span>
                  </div>
                  <ProgressBar value={pct} size="xs" className="mt-2" />
                  {audienceQ.error && !audience && (
                    <button type="button" onClick={() => audienceQ.refetch()} className="mt-1.5 text-[11px] font-medium text-danger hover:underline">
                      {t('api.loadFailed')} · {t('api.retry')}
                    </button>
                  )}
                </div>
              </div>
              {audience && (matched !== reachable || excludedTotal > 0) && (
                <p className="text-xs text-muted sm:col-span-2 lg:col-span-3">
                  {t('notifications.campaign.matchedOf', { matched: fmtNumber(matched), reachable: fmtNumber(reachable) })}
                  {excluded && excludedTotal > 0 && (
                    <>
                      {' — '}
                      {[
                        excluded.noPushToken > 0 && t('notifications.campaign.excluded.noPushToken', { count: excluded.noPushToken }),
                        excluded.noEmail > 0 && t('notifications.campaign.excluded.noEmail', { count: excluded.noEmail }),
                        excluded.optedOut > 0 && t('notifications.campaign.excluded.optedOut', { count: excluded.optedOut }),
                        excluded.locked > 0 && t('notifications.campaign.excluded.locked', { count: excluded.locked }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </>
                  )}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('notifications.campaign.message')} icon={<Megaphone className="h-4 w-4" />} />
            <CardBody className="space-y-5">
              <Field label={t('notifications.campaign.name')} required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('notifications.campaign.namePlaceholder')} />
              </Field>
              <div>
                <span className="label">{t('notifications.channel')}</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {NOTIF_CHANNELS.map((ch) => {
                    const Icon = CHANNEL_META[ch].icon;
                    const on = ch === channel;
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChannelAndTemplate(ch)}
                        aria-pressed={on}
                        className={cn('flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition', on ? 'border-accent bg-accent/[0.08] text-primary shadow-sm' : 'border-line text-muted hover:border-accent/50 hover:text-ink')}
                      >
                        <Icon className="h-5 w-5" style={{ color: on ? CHANNEL_META[ch].color : undefined }} />
                        {t(`notifications.channels.${ch}`)}
                      </button>
                    );
                  })}
                </div>
                {channel === 'email' && !!excluded?.noEmail && <p className="mt-2 text-xs text-warning">{t('notifications.campaign.emailReach', { count: excluded.noEmail })}</p>}
                {channel === 'push' && !!excluded?.noPushToken && <p className="mt-2 text-xs text-warning">{t('notifications.campaign.pushReach', { count: excluded.noPushToken })}</p>}
              </div>
              <Field label={t('notifications.campaign.template')} error={!tplQ.isLoading && !template ? t('notifications.campaign.noTemplate') : undefined}>
                <Select
                  value={template?.id ?? ''}
                  onChange={(e) => setTemplateId(e.target.value)}
                  disabled={tplQ.isLoading}
                  placeholder={tplQ.isLoading ? t('notifications.campaign.loadingTemplates') : channelTemplates.length ? undefined : t('notifications.campaign.noTemplate')}
                  options={channelTemplates.map((tp) => ({ value: tp.id, label: tp.name }))}
                />
              </Field>
              <div>
                <span className="label">{t('notifications.campaign.schedule')}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented
                    value={when}
                    onChange={setWhen}
                    options={[
                      { value: 'now', label: t('notifications.campaign.sendNow') },
                      { value: 'later', label: t('notifications.campaign.sendLater') },
                    ]}
                  />
                  {when === 'later' && (
                    <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="w-auto" invalid={!!at && scheduleInvalid} aria-label={t('notifications.campaign.scheduledFor')} />
                  )}
                </div>
                {when === 'later' && at && scheduleInvalid && <p className="mt-1 text-xs text-danger">{t('notifications.campaign.futureOnly')}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-xs text-muted">{t('notifications.campaign.optOutNote')}</p>
                <Button onClick={send} disabled={!ready} loading={sendM.isPending} icon={when === 'now' ? <Send className="h-4 w-4 flip-rtl" /> : <CalendarClock className="h-4 w-4" />}>
                  {when === 'now' ? t('notifications.campaign.sendTo', { count: reachable }) : t('actions.schedule')}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-24 xl:self-start">
          <CardHeader
            title={t('notifications.editor.preview')}
            subtitle={template?.name}
            action={<Segmented size="sm" value={previewLang} onChange={setPreviewLang} options={[{ value: 'en', label: 'EN' }, { value: 'ar', label: 'ع' }]} />}
          />
          <CardBody className="bg-surface-2">
            {template ? (
              <PhonePreview
                channel={channel}
                lang={previewLang}
                subject={previewLang === 'ar' ? template.subject_ar : template.subject_en}
                body={previewLang === 'ar' ? template.body_ar : template.body_en}
                samples={vars.samples}
              />
            ) : (
              <EmptyState compact title={t('notifications.campaign.noTemplate')} hint={t('notifications.campaign.noTemplateHint')} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink">{t('notifications.campaign.history')}</h2>
          <Badge>{history.meta.total}</Badge>
        </div>
        <DataTable
          data={history.items}
          columns={columns}
          loading={history.isLoading}
          error={history.error}
          onRetry={() => history.refetch()}
          server={history.server}
          onExport={can('notifications', 'export') ? (ids) => exp.mutate(exportRequest('csv', history.exportFilters, ids)) : undefined}
          exporting={exp.isPending}
          pageSize={5}
        />
      </div>
    </div>
  );
}
