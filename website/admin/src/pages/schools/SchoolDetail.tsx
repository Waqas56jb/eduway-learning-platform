import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, CalendarRange, Copy, Link2, MapPin, MessageSquarePlus, Pencil, Phone, QrCode, Target, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { qk } from '@/api/keys';
import { useApiMutation, usePagedList } from '@/api/hooks';
import { useLookups } from '@/api/lookups';
import { schoolsApi, useSchool, useSchoolNotes, useSchoolProgress, type AttributedStudentDto } from '@/api/partners';
import { useCan } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { fmtDate, fmtMoney, fmtNumber, fmtRelative } from '@/utils/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { SchoolForm } from '@/components/forms/SchoolForm';
import { Avatar, Button, ButtonLink, Card, CardBody, CardHeader, DataTable, EmptyState, ProgressBar, Select, SkeletonCard, StatusBadge, Textarea } from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { useAttributionGuard } from '@/pages/marketers/attribution';
import { SettlementsTable } from './SettlementsTable';
import { TierBadge } from './TierBadge';

/** Decorative, deterministic QR-style matrix derived from the referral link. */
function QrBadge({ value, size = 132 }: { value: string; size?: number }) {
  const n = 21;
  const cells = useMemo(() => {
    let h = 2166136261;
    const bits: boolean[] = [];
    for (let i = 0; i < n * n; i++) {
      h ^= value.charCodeAt(i % value.length) + i;
      h = Math.imul(h, 16777619) >>> 0;
      bits.push((h & 7) < 3);
    }
    return bits;
  }, [value]);
  const finder = (x: number, y: number) => x < 7 && y < 7;
  const inFinder = (x: number, y: number) => finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y);
  const s = size / n;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="rounded-lg bg-white p-1.5" role="img" aria-label="QR">
      {cells.map((on, i) => {
        const x = i % n;
        const y = Math.floor(i / n);
        return on && !inFinder(x, y) ? <rect key={i} x={x * s} y={y * s} width={s} height={s} fill="#0B1F3A" /> : null;
      })}
      {[
        [0, 0],
        [n - 7, 0],
        [0, n - 7],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x * s} y={y * s} width={7 * s} height={7 * s} fill="#0B1F3A" rx={s} />
          <rect x={(x + 1) * s} y={(y + 1) * s} width={5 * s} height={5 * s} fill="#fff" rx={s * 0.6} />
          <rect x={(x + 2) * s} y={(y + 2) * s} width={3 * s} height={3 * s} fill="#C9A24A" rx={s * 0.4} />
        </g>
      ))}
    </svg>
  );
}

const copy = async (text: string, okMsg: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error(text);
  }
};


export default function SchoolDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const lookups = useLookups();
  const guard = useAttributionGuard();
  const schoolQ = useSchool(id);
  const progressQ = useSchoolProgress(id);
  const notesQ = useSchoolNotes(id);
  const school = schoolQ.data;
  const marketers = lookups.marketers;
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState('');
  const [changing, setChanging] = useState(false);

  const students = usePagedList({
    key: (p) => qk.schools.sub('students', id, p),
    fetcher: (p) => schoolsApi.students(id!, p),
    pageSize: 5,
    initialSort: '-createdAt',
    enabled: !!id,
  });

  const addNoteM = useApiMutation((body: string) => schoolsApi.addNote(id!, body), {
    invalidate: [qk.schools.sub('notes', id), qk.schools.detail(id)],
    success: 'schools.detail.noteAdded',
    onSuccess: () => setNote(''),
  });

  const studentCols = useMemo<ColumnDef<AttributedStudentDto>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => L({ name_en: r.name.en, name_ar: r.name.ar }, 'name'),
        header: t('common.student'),
        cell: ({ row }) => {
          const n = { name_en: row.original.name.en, name_ar: row.original.name.ar };
          return (
            <span className="flex items-center gap-2.5">
              <Avatar name={n.name_en} src={row.original.avatarUrl} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{L(n, 'name')}</span>
                <span className="block text-xs text-muted num" dir="ltr">
                  {row.original.mobile}
                </span>
              </span>
            </span>
          );
        },
      },
      {
        id: 'package',
        accessorFn: (r) => (r.package ? L({ name_en: r.package.name.en, name_ar: r.package.name.ar }, 'name') : '—'),
        header: t('schools.detail.package'),
        enableSorting: false,
        cell: ({ getValue }) => <span className="text-muted">{getValue<string>()}</span>,
      },
      { id: 'subscriptionStatus', accessorKey: 'subscriptionStatus', header: t('schools.detail.subscription'), enableSorting: false, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { id: 'createdAt', accessorKey: 'createdAt', header: t('common.created'), cell: ({ getValue }) => <span className="whitespace-nowrap text-muted">{fmtDate(getValue<string>())}</span> },
    ],
    [t, L],
  );

  if (schoolQ.isLoading) {
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
        </div>
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!school) {
    if (schoolQ.error && schoolQ.error.code !== 'NOT_FOUND') return <QueryError error={schoolQ.error} onRetry={() => schoolQ.refetch()} />;
    return (
      <Card>
        <EmptyState title={t('schools.detail.notFound')} action={<ButtonLink to="/schools" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>{t('schools.detail.back')}</ButtonLink>} />
      </Card>
    );
  }

  const link = school.referralLink;
  const prog = progressQ.data;
  const rule = prog?.rule ?? null;
  const res = prog?.result ?? null;
  const next = res?.nextTier ?? null;
  const paid = prog?.paid ?? school.periodPaidStudents;
  const progress = prog ? prog.progressPct : 0;
  const toNext = res?.studentsToNext ?? (next ? next.from - paid : 0);

  const changeMarketer = async (toId: string) => {
    const target = toId || null;
    if (target === school.marketerId) return;
    setChanging(true);
    const r = await guard({
      schoolName: L(school, 'name'),
      currentMarketerName: school.marketer ? L(school.marketer, 'name') : null,
      needsReason: !!school.marketerId && !!target,
      run: (overrideReason) => schoolsApi.setMarketer(school.id, { marketerId: target, overrideReason }),
    });
    setChanging(false);
    if (r) toast.success(r.overridden ? t('marketers.detail.overridden') : t('schools.detail.marketerChanged'));
  };

  const addNote = () => {
    const body = note.trim();
    if (!body) return;
    addNoteM.mutate(body);
  };

  const mkt = school.marketer;
  const notes = notesQ.data ?? [];

  return (
    <>
      <PageHeader
        title={L(school, 'name')}
        current={L(school, 'name')}
        meta={
          <>
            <StatusBadge status={school.status} />
            {school.tier && <TierBadge tier={school.tier} />}
            <span className="text-xs text-muted">{t('schools.detail.contractEnds', { date: fmtDate(school.contractEnd) })}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />} onClick={() => navigate('/schools')}>
              {t('actions.back')}
            </Button>
            {can('schools', 'edit') && (
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                {t('actions.edit')}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Incentive progress */}
          {progressQ.isLoading ? (
            <SkeletonCard lines={4} />
          ) : progressQ.error ? (
            <QueryError error={progressQ.error} onRetry={() => progressQ.refetch()} />
          ) : (
            <Card>
              <CardHeader
                icon={<Target className="h-4 w-4" />}
                title={t('schools.detail.progress')}
                subtitle={prog ? `${t('schools.detail.progressSub')} · ${prog.period.key}` : t('schools.detail.progressSub')}
              />
              <CardBody>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="kpi-num text-4xl text-primary">{fmtNumber(paid)}</div>
                    <div className="text-xs text-muted">{t('schools.detail.periodPaid')}</div>
                    <div className="mt-1 text-[11px] text-muted">{t('schools.detail.allTimePaid', { count: school.verifiedPaidStudents })}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-xs text-muted">{t('schools.detail.estimated')}</div>
                    <div className="kpi-num text-2xl text-accent">{fmtMoney(res?.amount ?? school.estimatedReward)}</div>
                    {res?.tier && res.tier.rewardType === 'per_student' && <div className="text-xs text-muted">{t('schools.detail.rate', { amount: fmtMoney(res.tier.amount) })}</div>}
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  {(res?.tier?.label || school.tier) && <TierBadge tier={res?.tier?.label ?? school.tier} />}
                  <ProgressBar value={progress} size="md" className="flex-1" label={t('schools.detail.progress')} />
                  {next && <TierBadge tier={next.label} />}
                </div>
                <p className="mt-2 text-sm text-muted">
                  {!rule ? t('schools.detail.noRule') : next ? t('schools.detail.nextTier', { count: toNext, tier: next.label }) : t('schools.detail.topTier')}
                </p>
                {rule && (
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {rule.tiers.map((tier) => {
                      const on = res?.tier?.id === tier.id;
                      return (
                        <div key={tier.id} className={on ? 'rounded-lg border border-accent/60 bg-accent/[0.06] p-3' : 'rounded-lg border border-line p-3'}>
                          <div className="text-xs font-semibold text-ink">{tier.label}</div>
                          <div className="mt-0.5 text-[11px] text-muted num" dir="ltr">
                            {tier.from}–{tier.to ?? '∞'}
                          </div>
                          <div className="mt-1 text-sm font-semibold num">{fmtMoney(tier.amount, 'IQD', true)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader icon={<UserRound className="h-4 w-4" />} title={t('schools.detail.attributed')} subtitle={t('common.results', { count: students.meta.total })} />
            <DataTable
              bare
              data={students.items}
              columns={studentCols}
              loading={students.isLoading}
              error={students.error}
              onRetry={() => students.refetch()}
              server={students.server}
              onRowClick={can('users', 'view') ? (s) => navigate(`/users/${s.id}`) : undefined}
              emptyTitle={t('schools.detail.attributedEmpty')}
              emptyHint=" "
              maxHeight="420px"
            />
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title={t('schools.detail.settlements')} />
            <SettlementsTable partnerType="school" partnerId={school.id} compact />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t('schools.detail.profile')} />
            <CardBody className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <div className="font-medium">{L(school, 'city')}</div>
                  <div className="text-xs text-muted">{L(school, 'governorateName')}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <div className="font-medium">{school.contactName}</div>
                  <a href={`tel:${school.contactMobile.replace(/\s/g, '')}`} className="text-xs text-muted hover:text-accent num" dir="ltr">
                    {school.contactMobile}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <div className="text-xs text-muted">{t('schools.fields.contract')}</div>
                  <div className="font-medium">
                    {fmtDate(school.contractStart)} – {fmtDate(school.contractEnd)}
                  </div>
                </div>
              </div>
              <div className="border-t border-line pt-4">
                <label htmlFor="sd-mkt" className="label">
                  {t('schools.fields.marketer')}
                </label>
                <div className="flex items-center gap-2">
                  {mkt && <Avatar name={mkt.name_en} src={mkt.avatarUrl} size="sm" />}
                  <Select
                    id="sd-mkt"
                    className="flex-1"
                    value={school.marketerId ?? ''}
                    disabled={!(can('schools', 'edit') || can('marketers', 'edit')) || changing}
                    placeholder={t('schools.unassigned')}
                    options={marketers.filter((m) => m.status === 'active' || m.id === school.marketerId).map((m) => ({ value: m.id, label: L(m, 'name') }))}
                    onChange={(e) => changeMarketer(e.target.value)}
                    aria-label={t('schools.detail.changeMarketer')}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<QrCode className="h-4 w-4" />} title={t('schools.detail.referral')} subtitle={t('schools.detail.referralHint')} />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="shrink-0 rounded-xl bg-navy-grad p-2 shadow-soft">
                  <QrBadge value={link} size={112} />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('schools.detail.scanToJoin')}</div>
                  <code className="block rounded-lg bg-accent/10 px-3 py-2 text-center text-lg font-bold tracking-widest text-primary" dir="ltr">
                    {school.code}
                  </code>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs text-ink" dir="ltr">
                  {link}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(school.code, t('toast.copied'))}>
                  {t('schools.detail.copyCode')}
                </Button>
                <Button size="sm" variant="secondary" icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => copy(link, t('toast.copied'))}>
                  {t('schools.detail.copyLink')}
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<MessageSquarePlus className="h-4 w-4" />} title={t('schools.detail.notes')} />
            <CardBody className="space-y-4">
              {can('schools', 'edit') && (
                <div className="space-y-2">
                  <Textarea rows={3} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder={t('schools.detail.notePlaceholder')} aria-label={t('schools.detail.addNote')} />
                  <div className="flex justify-end">
                    <Button size="sm" disabled={!note.trim()} loading={addNoteM.isPending} onClick={addNote}>
                      {t('schools.detail.addNote')}
                    </Button>
                  </div>
                </div>
              )}
              {notesQ.isLoading ? (
                <SkeletonCard lines={2} />
              ) : notesQ.error ? (
                <QueryError compact error={notesQ.error} onRetry={() => notesQ.refetch()} />
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted">{t('schools.detail.noNotes')}</p>
              ) : (
                <ul className="space-y-3">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-line bg-surface-2 p-3">
                      <div className="whitespace-pre-line text-sm text-ink">{n.body}</div>
                      <div className="mt-1.5 text-[11px] text-muted">
                        {L({ name_en: n.author?.name.en, name_ar: n.author?.name.ar }, 'name')} · {fmtRelative(n.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <SchoolForm open={editOpen} onClose={() => setEditOpen(false)} school={school} />
    </>
  );
}
