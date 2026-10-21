import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertOctagon, Ban, BellRing, Bot, CheckCheck, Gauge, RotateCcw, ShieldBan, Tags, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { AiFlaggedConversation, Student } from '@/types';
import { useAiSettings, useFlaggedConversations } from '@/store/ai';
import { useStudents } from '@/store/core';
import { useCan } from '@/store/auth';
import { logAudit } from '@/store/audit';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, DataTable, Field, FilterSelect, Input, Modal, SkeletonCard, StatusBadge, TagInput, useConfirm } from '@/components/ui';
import { ReasonBadge, SeverityBadge, SUBJECT_KEY } from './shared';

const SEV_RANK = { low: 1, medium: 2, high: 3 } as const;

interface FlaggedUser {
  id: string;
  student: Student | undefined;
  name: string;
  flags: number;
  open: number;
  highest: AiFlaggedConversation['severity'];
  last: string;
  aiDisabled: boolean;
  locked: boolean;
}

export default function AiAbuseControls() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const confirm = useConfirm();
  const loading = useMockLoading(450);
  const editable = can('aitutor', 'edit');

  const settings = useAiSettings((s) => s.settings);
  const updateSettings = useAiSettings((s) => s.update);
  const flags = useFlaggedConversations((s) => s.items);
  const updateFlag = useFlaggedConversations((s) => s.update);
  const students = useStudents((s) => s.items);
  const updateStudent = useStudents((s) => s.update);

  const [perMin, setPerMin] = useState(settings.rateLimitPerMinute);
  const [perHour, setPerHour] = useState(settings.rateLimitPerHour);
  const [keywords, setKeywords] = useState(settings.blockedKeywords);
  const [warned, setWarned] = useState<string[]>([]);
  const [detail, setDetail] = useState<AiFlaggedConversation | null>(null);
  const [fStatus, setFStatus] = useState('');
  const [fSeverity, setFSeverity] = useState('');
  const [fReason, setFReason] = useState('');

  const rateDirty = perMin !== settings.rateLimitPerMinute || perHour !== settings.rateLimitPerHour;
  const kwDirty = JSON.stringify(keywords) !== JSON.stringify(settings.blockedKeywords);
  const studentName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? L(s, 'name') : id;
  };

  const flaggedUsers = useMemo<FlaggedUser[]>(() => {
    const map = new Map<string, AiFlaggedConversation[]>();
    flags.forEach((f) => map.set(f.studentId, [...(map.get(f.studentId) ?? []), f]));
    return [...map.entries()]
      .map(([id, list]) => {
        const student = students.find((s) => s.id === id);
        const highest = list.reduce<AiFlaggedConversation['severity']>((m, f) => (SEV_RANK[f.severity] > SEV_RANK[m] ? f.severity : m), 'low');
        return {
          id,
          student,
          name: student ? L(student, 'name') : id,
          flags: list.length,
          open: list.filter((f) => f.status === 'open').length,
          highest,
          last: list.map((f) => f.createdAt).sort().reverse()[0],
          aiDisabled: settings.disabledUserIds.includes(id),
          locked: !!student?.locked,
        };
      })
      .sort((a, b) => SEV_RANK[b.highest] - SEV_RANK[a.highest] || b.open - a.open);
  }, [flags, students, settings.disabledUserIds, L]);

  const filteredFlags = flags.filter((f) => (!fStatus || f.status === fStatus) && (!fSeverity || f.severity === fSeverity) && (!fReason || f.reason === fReason));

  const saveRates = () => {
    if (perMin < 1 || perHour < perMin) {
      toast.error(t('aitutor.abuse.rateInvalid'));
      return;
    }
    updateSettings({ rateLimitPerMinute: perMin, rateLimitPerHour: perHour }, { action: 'ai_settings.rate_limits', summary: `Set AI rate limits to ${perMin}/min, ${perHour}/hour` });
    toast.success(t('toast.saved'));
  };

  const saveKeywords = () => {
    updateSettings({ blockedKeywords: keywords }, { action: 'ai_settings.blocked_keywords', summary: `Updated blocked keyword list (${keywords.length} terms)` });
    toast.success(t('toast.saved'));
  };

  const warn = (u: FlaggedUser) => {
    setWarned((w) => [...w, u.id]);
    logAudit({ action: 'student.ai_warning', entity: 'student', entityId: u.id, summary: `Sent AI Tutor usage warning to ${u.student?.name_en ?? u.id}` });
    toast.success(t('aitutor.abuse.warnedToast', { name: u.name }));
  };

  const toggleAi = async (u: FlaggedUser) => {
    if (u.aiDisabled) {
      updateSettings({ disabledUserIds: settings.disabledUserIds.filter((x) => x !== u.id) }, { action: 'ai_settings.user_enable', summary: `Re-enabled AI Tutor for ${u.student?.name_en ?? u.id}` });
      toast.success(t('aitutor.abuse.aiEnabledToast', { name: u.name }));
      return;
    }
    const ok = await confirm({ title: t('aitutor.abuse.disableAiTitle', { name: u.name }), body: t('aitutor.abuse.disableAiBody'), confirmText: t('aitutor.abuse.disableAi'), tone: 'warning', reason: true });
    if (!ok) return;
    updateSettings({ disabledUserIds: [...settings.disabledUserIds, u.id] }, { action: 'ai_settings.user_disable', summary: `Disabled AI Tutor for ${u.student?.name_en ?? u.id} — ${ok.reason}` });
    toast.success(t('aitutor.abuse.aiDisabledToast', { name: u.name }));
  };

  const block = async (u: FlaggedUser) => {
    if (!u.student) return;
    if (u.locked) {
      updateStudent(u.id, { locked: false }, { action: 'student.unlock', summary: `Unblocked ${u.student.name_en} after AI abuse review` });
      toast.success(t('aitutor.abuse.unblockedToast', { name: u.name }));
      return;
    }
    const ok = await confirm({ title: t('aitutor.abuse.blockTitle', { name: u.name }), body: t('aitutor.abuse.blockBody'), confirmText: t('actions.block'), tone: 'danger', reason: true });
    if (!ok) return;
    updateStudent(u.id, { locked: true }, { action: 'student.block', summary: `Blocked ${u.student.name_en} for AI Tutor abuse — ${ok.reason}` });
    toast.success(t('aitutor.abuse.blockedToast', { name: u.name }));
  };

  const setFlagStatus = (f: AiFlaggedConversation, status: AiFlaggedConversation['status']) => {
    updateFlag(f.id, { status }, { action: `ai_flag.${status}`, summary: `Set flagged AI conversation ${f.id} to ${status}` });
    setDetail((d) => (d && d.id === f.id ? { ...d, status } : d));
    toast.success(t('aitutor.abuse.flagUpdated', { status: t(`status.${status}`) }));
  };

  const userColumns = useMemo<ColumnDef<FlaggedUser>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: t('common.student'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.original.student?.name_en ?? row.original.id} size="sm" />
            <div className="min-w-0">
              <Link to={`/users/${row.original.id}`} className="block truncate font-medium hover:text-accent" onClick={(e) => e.stopPropagation()}>
                {row.original.name}
              </Link>
              <span className="text-xs text-muted num" dir="ltr">
                {row.original.student?.mobile}
              </span>
            </div>
          </div>
        ),
      },
      { accessorKey: 'flags', header: t('aitutor.abuse.flags'), meta: { align: 'end' } },
      { accessorKey: 'open', header: t('status.open'), meta: { align: 'end' } },
      {
        id: 'highest',
        accessorFn: (r) => SEV_RANK[r.highest],
        header: t('aitutor.abuse.highest'),
        cell: ({ row }) => <SeverityBadge severity={row.original.highest} />,
        meta: { exportValue: (r) => r.highest },
      },
      { accessorKey: 'last', header: t('aitutor.abuse.lastFlag'), cell: ({ getValue }) => <span className="text-xs text-muted">{fmtRelative(getValue<string>())}</span> },
      {
        id: 'state',
        accessorFn: (r) => (r.locked ? 'blocked' : r.aiDisabled ? 'ai_disabled' : 'active'),
        header: t('common.status'),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.locked ? <StatusBadge status="blocked" /> : row.original.aiDisabled ? <Badge tone="warning" dot>{t('aitutor.abuse.aiOff')}</Badge> : <StatusBadge status="active" />}
            {warned.includes(row.original.id) && <Badge tone="info">{t('aitutor.abuse.warned')}</Badge>}
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
              <Button size="icon-sm" variant="ghost" title={t('aitutor.abuse.warn')} aria-label={t('aitutor.abuse.warn')} disabled={warned.includes(row.original.id)} onClick={() => warn(row.original)}>
                <BellRing className="h-4 w-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" title={row.original.aiDisabled ? t('aitutor.abuse.enableAi') : t('aitutor.abuse.disableAi')} aria-label={row.original.aiDisabled ? t('aitutor.abuse.enableAi') : t('aitutor.abuse.disableAi')} onClick={() => toggleAi(row.original)}>
                {row.original.aiDisabled ? <RotateCcw className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </Button>
              <Button size="icon-sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" title={row.original.locked ? t('actions.unlock') : t('actions.block')} aria-label={row.original.locked ? t('actions.unlock') : t('actions.block')} onClick={() => block(row.original)}>
                <Ban className="h-4 w-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, warned, editable, settings.disabledUserIds],
  );

  const flagColumns = useMemo<ColumnDef<AiFlaggedConversation>[]>(
    () => [
      { accessorKey: 'createdAt', header: t('common.date'), cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(getValue<string>())}</span> },
      { id: 'student', accessorFn: (r) => studentName(r.studentId), header: t('common.student'), cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
      { id: 'subject', accessorFn: (r) => t(`subjects.${SUBJECT_KEY[r.subjectId]}`), header: t('common.subject') },
      {
        accessorKey: 'excerpt',
        header: t('aitutor.abuse.excerpt'),
        cell: ({ getValue }) => (
          <span className="line-clamp-1 max-w-xs text-ink/80" dir="auto">
            {getValue<string>()}
          </span>
        ),
      },
      { accessorKey: 'reason', header: t('common.reason'), cell: ({ row }) => <ReasonBadge reason={row.original.reason} /> },
      { id: 'severity', accessorFn: (r) => SEV_RANK[r.severity], header: t('aitutor.abuse.severity'), cell: ({ row }) => <SeverityBadge severity={row.original.severity} />, meta: { exportValue: (r) => r.severity } },
      { accessorKey: 'status', header: t('common.status'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, students, L],
  );

  return (
    <>
      <PageHeader title={t('aitutor.abuse.title')} subtitle={t('aitutor.abuse.subtitle')} />

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('aitutor.abuse.rateLimits')} subtitle={t('aitutor.abuse.rateSub')} icon={<Gauge className="h-4 w-4" />} />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('aitutor.abuse.perMinute')} htmlFor="rl-min">
                  <Input id="rl-min" type="number" min={1} value={perMin} disabled={!editable} onChange={(e) => setPerMin(Number(e.target.value) || 0)} suffix={t('aitutor.abuse.req')} />
                </Field>
                <Field label={t('aitutor.abuse.perHour')} htmlFor="rl-hour">
                  <Input id="rl-hour" type="number" min={1} value={perHour} disabled={!editable} onChange={(e) => setPerHour(Number(e.target.value) || 0)} suffix={t('aitutor.abuse.req')} />
                </Field>
              </div>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{t('aitutor.abuse.rateHint', { min: fmtNumber(perMin), hour: fmtNumber(perHour) })}</p>
              {editable && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" disabled={!rateDirty} onClick={() => { setPerMin(settings.rateLimitPerMinute); setPerHour(settings.rateLimitPerHour); }}>
                    {t('actions.reset')}
                  </Button>
                  <Button size="sm" disabled={!rateDirty} onClick={saveRates}>
                    {t('actions.save')}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('aitutor.abuse.keywords')} subtitle={t('aitutor.abuse.keywordsSub')} icon={<Tags className="h-4 w-4" />} action={<Badge tone="navy">{fmtNumber(keywords.length)}</Badge>} />
            <CardBody className="space-y-4">
              <TagInput value={keywords} onChange={setKeywords} disabled={!editable} placeholder={t('aitutor.abuse.keywordPlaceholder')} aria-label={t('aitutor.abuse.keywords')} />
              <p className="text-xs text-muted">{t('aitutor.abuse.keywordsHint')}</p>
              {editable && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" disabled={!kwDirty} onClick={() => setKeywords(settings.blockedKeywords)}>
                    {t('actions.reset')}
                  </Button>
                  <Button size="sm" disabled={!kwDirty} onClick={saveKeywords}>
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
        <DataTable data={flaggedUsers} columns={userColumns} loading={loading} exportName="ai-flagged-users" pageSize={5} searchText={(r) => `${r.name} ${r.student?.name_en ?? ''} ${r.student?.mobile ?? ''}`} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-accent" />
          <h2 className="section-title">{t('aitutor.abuse.conversations')}</h2>
        </div>
        <DataTable
          data={filteredFlags}
          columns={flagColumns}
          loading={loading}
          exportName="ai-flagged-conversations"
          onRowClick={setDetail}
          initialSort={[{ id: 'createdAt', desc: true }]}
          searchText={(r) => `${r.excerpt} ${studentName(r.studentId)}`}
          toolbar={
            <>
              <FilterSelect label={t('common.status')} value={fStatus} onChange={setFStatus} options={['open', 'reviewed', 'dismissed'].map((s) => ({ value: s, label: t(`status.${s}`) }))} />
              <FilterSelect label={t('aitutor.abuse.severity')} value={fSeverity} onChange={setFSeverity} options={(['high', 'medium', 'low'] as const).map((s) => ({ value: s, label: t(`aitutor.severity.${s}`) }))} />
              <FilterSelect label={t('common.reason')} value={fReason} onChange={setFReason} options={(['cheating', 'prompt_injection', 'self_harm', 'abuse', 'off_topic'] as const).map((r) => ({ value: r, label: t(`aitutor.reasons.${r}`) }))} />
            </>
          }
        />
      </section>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="lg"
        title={t('aitutor.abuse.detailTitle')}
        description={detail ? `${detail.id.toUpperCase()} · ${fmtDateTime(detail.createdAt)}` : undefined}
        footer={
          detail && editable ? (
            <>
              {detail.status !== 'open' && (
                <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setFlagStatus(detail, 'open')}>
                  {t('aitutor.abuse.reopen')}
                </Button>
              )}
              {detail.status !== 'dismissed' && (
                <Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => setFlagStatus(detail, 'dismissed')}>
                  {t('aitutor.usage.dismiss')}
                </Button>
              )}
              {detail.status !== 'reviewed' && (
                <Button icon={<CheckCheck className="h-4 w-4" />} onClick={() => setFlagStatus(detail, 'reviewed')}>
                  {t('aitutor.usage.review')}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={detail.severity} />
              <ReasonBadge reason={detail.reason} />
              <StatusBadge status={detail.status} />
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{t('common.student')}</dt>
                <dd className="mt-0.5 font-medium">
                  <Link to={`/users/${detail.studentId}`} className="hover:text-accent">
                    {studentName(detail.studentId)}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('common.subject')}</dt>
                <dd className="mt-0.5 font-medium">{t(`subjects.${SUBJECT_KEY[detail.subjectId]}`)}</dd>
              </div>
            </dl>
            <div>
              <div className="mb-2 text-xs font-semibold text-muted">{t('aitutor.abuse.conversation')}</div>
              <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-ee-sm bg-btn px-4 py-2.5 text-sm text-btn-ink" dir="auto">
                    {detail.excerpt}
                  </div>
                </div>
                <div className="flex">
                  <div className="max-w-[85%] rounded-2xl rounded-es-sm border border-line bg-surface px-4 py-2.5 text-sm text-ink/80">
                    <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                      <Bot className="h-3.5 w-3.5" /> EDUWAY Tutor
                    </span>
                    {t(`aitutor.abuse.botReply.${detail.reason}`)}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted">{t('aitutor.abuse.detailNote')}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
