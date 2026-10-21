import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Filter, Megaphone, RotateCcw, Send, Users, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Campaign, DeliveryLogEntry, NotifChannel } from '@/types';
import { NOTIF_CHANNELS, PROVIDER_BY_CHANNEL } from '@/data/messaging';
import { governorates } from '@/data/geo';
import { useCampaigns, useDeliveryLog, useTemplates } from '@/store/messaging';
import { usePackages, useSchools, useStudents, useSubjects } from '@/store/core';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { fmtDateTime, fmtNumber } from '@/utils/format';
import { MOCK_NOW } from '@/utils/random';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, Field, Input, ProgressBar, Segmented, Select, StatusBadge, Tooltip, useConfirm } from '@/components/ui';
import { CHANNEL_META, ChannelIcon, PhonePreview } from './_shared';

interface Audience {
  package: string;
  subject: string;
  governorate: string;
  school: string;
  inactiveDays: string;
}

const EMPTY: Audience = { package: '', subject: '', governorate: '', school: '', inactiveDays: '' };

export default function SendCampaign() {
  const { t } = useTranslation();
  const lang = useLang();
  const L = useLocalize();
  const loading = useMockLoading();
  const can = useCan();
  const confirm = useConfirm();
  const admin = useCurrentAdmin();
  const students = useStudents((s) => s.items);
  const packages = usePackages((s) => s.items);
  const subjects = useSubjects((s) => s.items);
  const schools = useSchools((s) => s.items);
  const templates = useTemplates((s) => s.items);
  const campaigns = useCampaigns((s) => s.items);
  const addCampaign = useCampaigns((s) => s.add);
  const updateCampaign = useCampaigns((s) => s.update);
  const setLog = useDeliveryLog((s) => s.setItems);
  const updateLog = useDeliveryLog((s) => s.updateMany);

  const canSend = can('notifications', 'create');
  const [aud, setAud] = useState<Audience>(EMPTY);
  const [channel, setChannel] = useState<NotifChannel>('push');
  const [templateId, setTemplateId] = useState('tpl_newlesson_push');
  const [name, setName] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [previewLang, setPreviewLang] = useState<'en' | 'ar'>(lang);
  const [sending, setSending] = useState(false);

  const matched = useMemo(() => {
    const cutoff = aud.inactiveDays ? MOCK_NOW.getTime() - Number(aud.inactiveDays) * 86_400_000 : null;
    return students.filter(
      (s) =>
        !s.locked &&
        (!aud.package || s.packageId === aud.package) &&
        (!aud.subject || s.entitlements.some((e) => e.subjectId === aud.subject)) &&
        (!aud.governorate || s.governorateId === aud.governorate) &&
        (!aud.school || s.schoolId === aud.school) &&
        (cutoff === null || new Date(s.lastActive).getTime() < cutoff),
    );
  }, [students, aud]);

  const reachable = channel === 'email' ? matched.filter((s) => s.email) : matched;
  const channelTemplates = templates.filter((tp) => tp.channel === channel);
  const template = templates.find((tp) => tp.id === templateId && tp.channel === channel);
  const activeFilters = Object.values(aud).filter(Boolean).length;
  const scheduleInvalid = when === 'later' && (!at || new Date(at).getTime() <= Date.now());
  const ready = canSend && !!template && reachable.length > 0 && name.trim().length >= 3 && !scheduleInvalid;

  const setChannelAndTemplate = (ch: NotifChannel) => {
    setChannel(ch);
    const first = templates.find((tp) => tp.channel === ch && tp.active) ?? templates.find((tp) => tp.channel === ch);
    setTemplateId(first?.id ?? '');
  };

  const send = async () => {
    if (!template) return;
    const ok = await confirm({
      title: when === 'now' ? t('notifications.campaign.confirmSendTitle', { count: reachable.length }) : t('notifications.campaign.confirmScheduleTitle'),
      body: t('notifications.campaign.confirmBody', { name: name.trim(), channel: t(`notifications.channels.${channel}`), count: reachable.length, when: when === 'now' ? t('notifications.campaign.immediately') : fmtDateTime(new Date(at)) }),
      tone: 'primary',
      confirmText: when === 'now' ? t('actions.send') : t('actions.schedule'),
    });
    if (!ok) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 700));
    const now = new Date().toISOString();
    const cmp: Campaign = {
      id: uid('cmp'),
      name: name.trim(),
      channel,
      templateId: template.id,
      audienceCount: reachable.length,
      filters: { package: aud.package || null, subject: aud.subject || null, governorate: aud.governorate || null, school: aud.school || null, inactiveDays: aud.inactiveDays ? Number(aud.inactiveDays) : null },
      status: when === 'now' ? 'sending' : 'scheduled',
      scheduledAt: when === 'later' ? new Date(at).toISOString() : null,
      sentAt: when === 'now' ? now : null,
      createdBy: admin?.name ?? 'Admin',
    };
    addCampaign(cmp, { action: when === 'now' ? 'campaign.send' : 'campaign.schedule', summary: `${when === 'now' ? 'Sent' : 'Scheduled'} campaign “${cmp.name}” to ${cmp.audienceCount} students via ${channel}` });

    if (when === 'now') {
      const entries: DeliveryLogEntry[] = reachable.map((s) => ({
        id: uid('dl'),
        campaignId: cmp.id,
        templateId: template.id,
        studentId: s.id,
        channel,
        provider: PROVIDER_BY_CHANNEL[channel],
        status: 'queued',
        error: null,
        attempts: 1,
        createdAt: now,
      }));
      setLog([...entries, ...useDeliveryLog.getState().items]);
      // Simulate provider callbacks: most deliver, a few fail.
      setTimeout(() => {
        const failIds = entries.filter((_, i) => i % 17 === 5).map((e) => e.id);
        const okIds = entries.filter((e) => !failIds.includes(e.id)).map((e) => e.id);
        updateLog(okIds, { status: 'delivered' }, { silent: true });
        if (failIds.length) updateLog(failIds, { status: 'failed', error: channel === 'push' ? 'Device token expired (UNREGISTERED)' : 'Carrier rejected: number unreachable' }, { silent: true });
        updateCampaign(cmp.id, { status: 'sent' }, { silent: true });
      }, 2200);
      toast.success(t('notifications.campaign.sentToast', { count: reachable.length }));
    } else {
      toast.success(t('notifications.campaign.scheduledToast', { when: fmtDateTime(new Date(at)) }));
    }
    setSending(false);
    setName('');
    setAt('');
    setWhen('now');
  };

  const cancelScheduled = async (c: Campaign) => {
    const ok = await confirm({ title: t('notifications.campaign.cancelTitle', { name: c.name }), body: t('notifications.campaign.cancelBody'), tone: 'warning', confirmText: t('notifications.campaign.cancelCampaign') });
    if (!ok) return;
    updateCampaign(c.id, { status: 'draft', scheduledAt: null }, { action: 'campaign.cancel', summary: `Cancelled scheduled campaign “${c.name}”` });
    toast.success(t('notifications.campaign.cancelledToast'));
  };

  const columns = useMemo<ColumnDef<Campaign>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('notifications.campaign.name'),
        meta: { label: t('notifications.campaign.name') },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <ChannelIcon channel={row.original.channel} />
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="text-xs text-muted">{t(`notifications.channels.${row.original.channel}`)}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'audienceCount',
        header: t('notifications.campaign.recipients'),
        meta: { label: t('notifications.campaign.recipients'), align: 'end' },
        cell: ({ getValue }) => fmtNumber(getValue<number>()),
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        id: 'when',
        accessorFn: (r) => r.sentAt ?? r.scheduledAt ?? '',
        header: t('notifications.campaign.when'),
        meta: { label: t('notifications.campaign.when') },
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{row.original.sentAt ? fmtDateTime(row.original.sentAt) : row.original.scheduledAt ? fmtDateTime(row.original.scheduledAt) : '—'}</span>,
      },
      { accessorKey: 'createdBy', header: t('notifications.campaign.createdBy'), meta: { label: t('notifications.campaign.createdBy') } },
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

  const filterSelect = (key: keyof Audience, label: string, options: { value: string; label: string }[]) => (
    <Field label={label}>
      <Select value={aud[key]} onChange={(e) => setAud((a) => ({ ...a, [key]: e.target.value }))} placeholder={t('common.all')} options={options} />
    </Field>
  );

  const pct = students.length ? (reachable.length / students.length) * 100 : 0;

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
              {filterSelect('package', t('common.package'), packages.map((p) => ({ value: p.id, label: L(p, 'name') })))}
              {filterSelect('subject', t('common.subject'), subjects.map((s) => ({ value: s.id, label: L(s, 'name') })))}
              {filterSelect('governorate', t('common.governorate'), governorates.map((g) => ({ value: g.id, label: L(g, 'name') })))}
              {filterSelect('school', t('common.school'), schools.map((s) => ({ value: s.id, label: L(s, 'name') })))}
              <Field label={t('notifications.campaign.inactiveDays')} hint={t('notifications.campaign.inactiveDaysHint')}>
                <Input type="number" min={1} max={365} value={aud.inactiveDays} onChange={(e) => setAud((a) => ({ ...a, inactiveDays: e.target.value }))} placeholder="—" suffix={t('common.days')} />
              </Field>
              <div className="flex flex-col justify-end">
                <div className="rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Users className="h-3.5 w-3.5 text-accent" /> {t('notifications.campaign.previewCount')}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="kpi-num text-2xl text-primary">{loading ? '—' : fmtNumber(reachable.length)}</span>
                    <span className="text-xs text-muted">/ {fmtNumber(students.length)}</span>
                  </div>
                  <ProgressBar value={pct} size="xs" className="mt-2" />
                </div>
              </div>
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
                {channel === 'email' && matched.length !== reachable.length && (
                  <p className="mt-2 text-xs text-warning">{t('notifications.campaign.emailReach', { count: matched.length - reachable.length })}</p>
                )}
              </div>
              <Field label={t('notifications.campaign.template')} error={!template ? t('notifications.campaign.noTemplate') : undefined}>
                <Select
                  value={template ? templateId : ''}
                  onChange={(e) => setTemplateId(e.target.value)}
                  placeholder={channelTemplates.length ? undefined : t('notifications.campaign.noTemplate')}
                  options={channelTemplates.map((tp) => ({ value: tp.id, label: `${tp.name}${tp.active ? '' : ` (${t('status.inactive')})`}` }))}
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
                <Button onClick={send} disabled={!ready} loading={sending} icon={when === 'now' ? <Send className="h-4 w-4 flip-rtl" /> : <CalendarClock className="h-4 w-4" />}>
                  {when === 'now' ? t('notifications.campaign.sendTo', { count: reachable.length }) : t('actions.schedule')}
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
              <PhonePreview channel={channel} lang={previewLang} subject={previewLang === 'ar' ? template.subject_ar : template.subject_en} body={previewLang === 'ar' ? template.body_ar : template.body_en} />
            ) : (
              <EmptyState compact title={t('notifications.campaign.noTemplate')} hint={t('notifications.campaign.noTemplateHint')} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink">{t('notifications.campaign.history')}</h2>
          <Badge>{campaigns.length}</Badge>
        </div>
        <DataTable data={campaigns} columns={columns} loading={loading} exportName="campaigns" initialSort={[{ id: 'when', desc: true }]} pageSize={5} />
      </div>
    </div>
  );
}
