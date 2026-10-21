import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, CalendarRange, Copy, Link2, MapPin, MessageSquarePlus, Pencil, Phone, QrCode, Target, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { School, Student } from '@/types';
import { governorateById, packageById } from '@/data';
import { calcIncentive, nextTier } from '@/data/incentives';
import { useMarketers, useSchools, useStudents } from '@/store/core';
import { useIncentiveRules } from '@/store/partners';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { useMockLoading } from '@/hooks/useMockLoading';
import { fmtDate, fmtMoney, fmtNumber, fmtRelative } from '@/utils/format';
import { uid } from '@/utils/id';
import { PageHeader } from '@/components/layout/PageHeader';
import { SchoolForm } from '@/components/forms/SchoolForm';
import { Avatar, Button, ButtonLink, Card, CardBody, CardHeader, DataTable, EmptyState, ProgressBar, Select, SkeletonCard, StatusBadge, Textarea, useConfirm } from '@/components/ui';
import { reassignSchool } from '@/pages/marketers/attribution';
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
  const confirm = useConfirm();
  const can = useCan();
  const admin = useCurrentAdmin();
  const loading = useMockLoading();
  const school = useSchools((s) => s.items.find((x) => x.id === id));
  const update = useSchools((s) => s.update);
  const marketers = useMarketers((s) => s.items);
  const allStudents = useStudents((s) => s.items);
  const rule = useIncentiveRules((s) => s.items.find((r) => r.partnerType === 'school' && r.status === 'active'));
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState('');

  const students = useMemo(() => allStudents.filter((s) => s.schoolId === id), [allStudents, id]);

  const studentCols = useMemo<ColumnDef<Student>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => L(r, 'name'),
        header: t('common.student'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            <Avatar name={row.original.name_en} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{L(row.original, 'name')}</span>
              <span className="block text-xs text-muted num" dir="ltr">
                {row.original.mobile}
              </span>
            </span>
          </span>
        ),
      },
      { id: 'package', accessorFn: (r) => L(packageById(r.packageId), 'name'), header: t('schools.detail.package'), cell: ({ getValue }) => <span className="text-muted">{getValue<string>()}</span> },
      { accessorKey: 'subscriptionStatus', header: t('schools.detail.subscription'), cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { accessorKey: 'createdAt', header: t('common.created'), cell: ({ getValue }) => <span className="whitespace-nowrap text-muted">{fmtDate(getValue<string>())}</span> },
    ],
    [t, L],
  );

  if (!school) {
    return (
      <Card>
        <EmptyState title={t('schools.detail.notFound')} action={<ButtonLink to="/schools" variant="secondary" icon={<ArrowLeft className="h-4 w-4 flip-rtl" />}>{t('schools.detail.back')}</ButtonLink>} />
      </Card>
    );
  }

  const link = `https://eduway.iq/join?code=${encodeURIComponent(school.code)}`;
  const paid = school.verifiedPaidStudents;
  const res = rule ? calcIncentive(rule, paid) : null;
  const next = rule ? nextTier(rule.tiers, paid) : null;
  const curFrom = res?.tier?.from ?? 0;
  const progress = next ? ((paid - curFrom) / Math.max(1, next.from - curFrom)) * 100 : 100;

  const changeMarketer = async (toId: string) => {
    const target = toId || null;
    if (target === school.marketerId) return;
    let reason: string | undefined;
    if (school.marketerId && target) {
      const cur = marketers.find((m) => m.id === school.marketerId);
      const r = await confirm({
        title: t('marketers.detail.doubleTitle'),
        body: t('marketers.detail.doubleBody', { school: L(school, 'name'), marketer: cur ? L(cur, 'name') : '—' }),
        tone: 'warning',
        confirmText: t('marketers.detail.override'),
        reason: { label: t('marketers.detail.overrideReason'), placeholder: t('marketers.detail.overridePlaceholder') },
      });
      if (!r) return;
      reason = r.reason;
    }
    reassignSchool(school.id, target, reason);
    toast.success(reason ? t('marketers.detail.overridden') : t('schools.detail.marketerChanged'));
  };

  const addNote = () => {
    const body = note.trim();
    if (!body) return;
    update(school.id, (s: School) => ({ notes: [{ id: uid('note'), author: admin?.name ?? 'Admin', body, createdAt: new Date().toISOString() }, ...s.notes] }), {
      action: 'school.add_note',
      summary: `Added note to ${school.name_en}`,
    });
    setNote('');
    toast.success(t('schools.detail.noteAdded'));
  };

  const gov = governorateById(school.governorateId);
  const mkt = marketers.find((m) => m.id === school.marketerId);

  return (
    <>
      <PageHeader
        title={L(school, 'name')}
        current={L(school, 'name')}
        meta={
          <>
            <StatusBadge status={school.status} />
            <TierBadge tier={school.tier} />
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
          {loading ? (
            <SkeletonCard lines={4} />
          ) : (
            <Card>
              <CardHeader icon={<Target className="h-4 w-4" />} title={t('schools.detail.progress')} subtitle={t('schools.detail.progressSub')} />
              <CardBody>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="kpi-num text-4xl text-primary">{fmtNumber(paid)}</div>
                    <div className="text-xs text-muted">{t('schools.fields.paidStudents')}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-xs text-muted">{t('schools.detail.estimated')}</div>
                    <div className="kpi-num text-2xl text-accent">{fmtMoney(res?.amount ?? 0)}</div>
                    {res?.tier && res.tier.rewardType === 'per_student' && <div className="text-xs text-muted">{t('schools.detail.rate', { amount: fmtMoney(res.tier.amount) })}</div>}
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <TierBadge tier={res?.tier?.label ?? school.tier} />
                  <ProgressBar value={progress} size="md" className="flex-1" label={t('schools.detail.progress')} />
                  {next && <TierBadge tier={next.label} />}
                </div>
                <p className="mt-2 text-sm text-muted">{next ? t('schools.detail.nextTier', { count: next.from - paid, tier: next.label }) : t('schools.detail.topTier')}</p>
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
            <CardHeader icon={<UserRound className="h-4 w-4" />} title={t('schools.detail.attributed')} subtitle={t('common.results', { count: students.length })} />
            <DataTable
              bare
              data={students}
              columns={studentCols}
              loading={loading}
              pageSize={5}
              onRowClick={can('users', 'view') ? (s) => navigate(`/users/${s.id}`) : undefined}
              searchText={(s) => `${s.name_en} ${s.name_ar} ${s.mobile}`}
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
                  <div className="text-xs text-muted">{L(gov, 'name')}</div>
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
                  {mkt && <Avatar name={mkt.name_en} src={mkt.avatar} size="sm" />}
                  <Select
                    id="sd-mkt"
                    className="flex-1"
                    value={school.marketerId ?? ''}
                    disabled={!can('schools', 'edit')}
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
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('schools.detail.notePlaceholder')} aria-label={t('schools.detail.addNote')} />
                  <div className="flex justify-end">
                    <Button size="sm" disabled={!note.trim()} onClick={addNote}>
                      {t('schools.detail.addNote')}
                    </Button>
                  </div>
                </div>
              )}
              {school.notes.length === 0 ? (
                <p className="text-sm text-muted">{t('schools.detail.noNotes')}</p>
              ) : (
                <ul className="space-y-3">
                  {school.notes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-line bg-surface-2 p-3">
                      <div className="text-sm text-ink">{n.body}</div>
                      <div className="mt-1.5 text-[11px] text-muted">
                        {n.author} · {fmtRelative(n.createdAt)}
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
