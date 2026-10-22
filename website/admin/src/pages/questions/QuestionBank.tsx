import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, CheckCircle2, Copy, FileQuestion, FileUp, Plus, Send, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { QuestionStatus } from '@/types';
import { fmtNumber, fmtPercent, fmtRelative } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { exportRequest, useApiMutation, useApiQuery, useExport, usePagedList } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { questionsApi, type QuestionVM } from '@/api/questions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, ButtonLink, DataTable, FilterSelect, StatCard, StatusBadge, Tooltip, useConfirm } from '@/components/ui';
import { DifficultyBadge, QuestionText } from '@/components/forms/QuestionForm';

export default function QuestionBank() {
  const { t } = useTranslation();
  const L = useLocalize();
  const navigate = useNavigate();
  const can = useCan();
  const confirm = useConfirm();
  const lang = useLang();
  const lookups = useLookups();
  const subjects = lookups.subjects;
  const units = lookups.units;

  const [subject, setSubject] = useState('');
  const [unit, setUnit] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [dupOnly, setDupOnly] = useState(false);

  const list = usePagedList<QuestionVM>({
    key: qk.questions.list,
    fetcher: questionsApi.list,
    filters: { subjectId: subject, unitId: unit, difficulty, type, status, duplicatesOnly: dupOnly || undefined },
    initialSort: 'code',
  });
  const filtered = list.items;
  const statsQ = useApiQuery(qk.questions.sub('stats'), questionsApi.stats);
  const loading = statsQ.isLoading;
  const stats = {
    total: statsQ.data?.total ?? 0,
    published: statsQ.data?.published ?? 0,
    publishedPct: statsQ.data?.publishedPct ?? 0,
    review: statsQ.data?.inReview ?? 0,
    dups: statsQ.data?.duplicates ?? 0,
    subjects: statsQ.data?.subjectCount ?? subjects.length,
  };
  const refName = (r: { name: { en: string; ar: string } } | null) => (r ? r.name[lang] : '—');

  const columns = useMemo<ColumnDef<QuestionVM, unknown>[]>(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: t('questions.fields.code'),
        meta: { label: t('questions.fields.code'), className: 'w-36' },
        cell: ({ row }) => (
          <div className="space-y-1">
            <span className="font-mono text-xs font-semibold text-primary" dir="ltr">
              {row.original.code}
            </span>
            {row.original.duplicateOf && (
              <Tooltip content={t('questions.bank.duplicateOf', { code: row.original.duplicateCode ?? '' })}>
                <Badge tone="warning" icon={<Copy className="h-3 w-3" />}>
                  {t('questions.bank.possibleDuplicate')}
                </Badge>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        id: 'preview',
        accessorFn: (q) => L(q, 'body'),
        header: t('questions.fields.question'),
        enableSorting: false,
        meta: { label: t('questions.fields.question') },
        cell: ({ row }) => (
          <div className="line-clamp-2 min-w-[16rem] max-w-md text-[13px] text-ink">
            <QuestionText text={L(row.original, 'body')} />
          </div>
        ),
      },
      {
        id: 'subject',
        accessorFn: (q) => refName(q.subject),
        header: t('common.subject'),
        enableSorting: false,
        meta: { label: t('common.subject') },
        cell: ({ row }) => {
          const s = row.original.subject;
          return (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full" style={{ background: s?.color }} />
              {refName(s)}
            </span>
          );
        },
      },
      {
        id: 'topic',
        accessorFn: (q) => refName(q.topic),
        header: t('common.topic'),
        enableSorting: false,
        meta: { label: t('common.topic') },
        cell: ({ row }) => (
          <div className="min-w-[10rem]">
            <div className="text-[13px]">{refName(row.original.topic)}</div>
            <div className="text-[11px] text-muted">{refName(row.original.unit)}</div>
          </div>
        ),
      },
      {
        id: 'difficulty',
        accessorKey: 'difficulty',
        header: t('questions.fields.difficulty'),
        meta: { label: t('questions.fields.difficulty') },
        cell: ({ row }) => <DifficultyBadge value={row.original.difficulty} />,
      },
      {
        id: 'type',
        accessorKey: 'type',
        header: t('common.type'),
        meta: { label: t('common.type') },
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{t(`questions.types.${row.original.type}`)}</span>,
      },
      {
        id: 'tags',
        accessorFn: (q) => q.tags.join('; '),
        header: t('questions.fields.tags'),
        enableSorting: false,
        meta: { label: t('questions.fields.tags') },
        cell: ({ row }) => (
          <div className="flex max-w-[12rem] flex-wrap gap-1">
            {row.original.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink/70" dir="ltr">
                {tag}
              </span>
            ))}
            {row.original.tags.length > 2 && <span className="text-[10px] text-muted">+{row.original.tags.length - 2}</span>}
          </div>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('common.status'),
        meta: { label: t('common.status') },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'author',
        accessorFn: (q) => refName(q.author),
        header: t('questions.fields.author'),
        enableSorting: false,
        meta: { label: t('questions.fields.author') },
        cell: ({ row }) => {
          const a = row.original.author;
          return a ? (
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
              <Avatar name={a.name.en} src={a.avatarUrl ?? undefined} size="xs" />
              {a.name[lang]}
            </span>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'reviewer',
        accessorFn: (q) => refName(q.reviewer),
        header: t('questions.fields.reviewer'),
        enableSorting: false,
        meta: { label: t('questions.fields.reviewer') },
        cell: ({ row }) => {
          return <span className="whitespace-nowrap text-xs text-muted">{refName(row.original.reviewer)}</span>;
        },
      },
      {
        id: 'usageCount',
        accessorKey: 'usageCount',
        header: t('questions.fields.usage'),
        meta: { label: t('questions.fields.usage'), align: 'end' },
        cell: ({ row }) => fmtNumber(row.original.usageCount),
      },
      {
        id: 'accuracy',
        accessorKey: 'accuracy',
        header: t('questions.fields.accuracy'),
        meta: { label: t('questions.fields.accuracy'), align: 'end' },
        cell: ({ row }) => (row.original.usageCount && row.original.accuracyKnown ? fmtPercent(row.original.accuracy) : '—'),
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        header: t('common.updated'),
        meta: { label: t('common.updated') },
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtRelative(row.original.updatedAt)}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, L, lang],
  );

  const invalidate = [qk.questions.all];
  const bulkMut = useApiMutation((v: { ids: string[]; action: 'submit' | 'approve' | 'publish' | 'archive' }) => questionsApi.bulkTransition(v.ids, v.action), {
    invalidate,
    onSuccess: (r) => {
      toast.success(t('toast.bulkDone', { count: r.succeeded.length }));
      if (r.failed.length) toast.error(t('api.bulkPartial', { count: r.failed.length }));
    },
  });
  const deleteMut = useApiMutation((ids: string[]) => questionsApi.bulkDelete(ids), {
    invalidate,
    onSuccess: (r) => {
      toast.success(t('toast.deleted', { entity: t('questions.bank.countQuestions', { count: r.succeeded.length }) }));
      if (r.failed.length) toast.error(t('api.bulkPartial', { count: r.failed.length }));
    },
  });
  const dupMut = useApiMutation((id: string) => questionsApi.duplicate(id), {
    invalidate,
    onSuccess: (q) => {
      toast.success(t('toast.created', { entity: t('questions.entity') }));
      navigate(`/questions/${q.id}`);
    },
  });
  const exp = useExport('/admin/questions/export', 'question-bank');

  const bulkStatus = async (rows: QuestionVM[], to: QuestionStatus, clear: () => void, action: 'submit' | 'approve' | 'publish' | 'archive') => {
    const ok = await confirm({
      title: t('questions.bank.bulkConfirm', { count: rows.length, status: t(`status.${to}`) }),
      body: t('questions.bank.bulkConfirmBody'),
      tone: to === 'archived' ? 'warning' : 'primary',
      confirmText: t('actions.confirm'),
    });
    if (!ok) return;
    await bulkMut.mutateAsync({ ids: rows.map((r) => r.id), action }).catch(() => undefined);
    clear();
  };

  const unitOptions = units.filter((u) => !subject || u.subjectId === subject).map((u) => ({ value: u.id, label: L(u, 'name') }));
  const activeFilters = [subject, unit, difficulty, type, status].filter(Boolean).length + (dupOnly ? 1 : 0);

  return (
    <>
      <PageHeader
        title={t('questions.bank.title')}
        subtitle={t('questions.bank.subtitle')}
        actions={
          can('questions', 'create') && (
            <>
              <ButtonLink to="/questions/import" variant="secondary" icon={<FileUp className="h-4 w-4" />}>
                {t('nav.bulkImport')}
              </ButtonLink>
              <ButtonLink to="/questions/new" icon={<Plus className="h-4 w-4" />}>
                {t('questions.bank.newQuestion')}
              </ButtonLink>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label={t('questions.bank.statTotal')} value={fmtNumber(stats.total)} icon={<FileQuestion />} color="#0B1F3A" hint={t('questions.bank.statTotalHint', { count: stats.subjects })} />
        <StatCard loading={loading} label={t('questions.bank.statPublished')} value={fmtNumber(stats.published)} icon={<CheckCircle2 />} color="#16A34A" hint={fmtPercent(stats.publishedPct) + ' ' + t('questions.bank.ofBank')} />
        <StatCard
          loading={loading}
          label={t('questions.bank.statReview')}
          value={fmtNumber(stats.review)}
          icon={<ShieldCheck />}
          color="#F59E0B"
          hint={t('questions.bank.statReviewHint')}
          onClick={() => navigate('/questions/review')}
        />
        <StatCard loading={loading} label={t('questions.bank.statDuplicates')} value={fmtNumber(stats.dups)} icon={<Copy />} color="#DC2626" hint={t('questions.bank.statDuplicatesHint')} onClick={() => setDupOnly(true)} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        server={list.server}
        onExport={can('questions', 'export') ? (ids) => exp.mutate(exportRequest('csv', list.exportFilters, ids)) : undefined}
        exporting={exp.isPending}
        initialHidden={['accuracy', 'updatedAt', 'reviewer']}
        onRowClick={(q) => navigate(`/questions/${q.id}`)}
        searchPlaceholder={t('questions.bank.search')}
        toolbar={
          <>
            <FilterSelect
              label={t('common.subject')}
              value={subject}
              onChange={(v) => {
                setSubject(v);
                setUnit('');
              }}
              options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))}
            />
            <FilterSelect label={t('common.unit')} value={unit} onChange={setUnit} options={unitOptions} className="hidden md:block" />
            <FilterSelect label={t('questions.fields.difficulty')} value={difficulty} onChange={setDifficulty} options={(['easy', 'medium', 'hard'] as const).map((d) => ({ value: d, label: t(`difficulty.${d}`) }))} />
            <FilterSelect label={t('common.type')} value={type} onChange={setType} options={(['mcq', 'true_false', 'fill_blank'] as const).map((d) => ({ value: d, label: t(`questions.types.${d}`) }))} className="hidden lg:block" />
            <FilterSelect label={t('common.status')} value={status} onChange={setStatus} options={(['draft', 'in_review', 'approved', 'published', 'archived'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            {dupOnly && (
              <Badge tone="warning" icon={<Copy className="h-3 w-3" />}>
                {t('questions.bank.duplicatesOnly')}
              </Badge>
            )}
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSubject('');
                  setUnit('');
                  setDifficulty('');
                  setType('');
                  setStatus('');
                  setDupOnly(false);
                }}
              >
                {t('actions.clearFilters')}
              </Button>
            )}
          </>
        }
        bulkActions={(rows, clear) => (
          <>
            {can('questions', 'edit') && (
              <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} disabled={!rows.some((r) => r.status === 'draft')} onClick={() => bulkStatus(rows.filter((r) => r.status === 'draft'), 'in_review', clear, 'submit')}>
                {t('actions.submitForReview')}
              </Button>
            )}
            {can('questions', 'approve') && (
              <>
                <Button size="sm" variant="secondary" icon={<CheckCircle2 className="h-3.5 w-3.5" />} disabled={!rows.some((r) => r.status === 'in_review')} onClick={() => bulkStatus(rows.filter((r) => r.status === 'in_review'), 'approved', clear, 'approve')}>
                  {t('actions.approve')}
                </Button>
                <Button size="sm" variant="secondary" icon={<UploadCloud className="h-3.5 w-3.5" />} disabled={!rows.some((r) => r.status === 'approved')} onClick={() => bulkStatus(rows.filter((r) => r.status === 'approved'), 'published', clear, 'publish')}>
                  {t('actions.publish')}
                </Button>
                <Button size="sm" variant="secondary" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => bulkStatus(rows.filter((r) => r.status !== 'archived'), 'archived', clear, 'archive')}>
                  {t('actions.archive')}
                </Button>
              </>
            )}
            {can('questions', 'create') && rows.length === 1 && (
              <Button
                size="sm"
                variant="secondary"
                loading={dupMut.isPending}
                icon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => {
                  dupMut.mutate(rows[0].id);
                  clear();
                }}
              >
                {t('actions.duplicate')}
              </Button>
            )}
            {can('questions', 'delete') && (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={async () => {
                  const ok = await confirm({ title: t('confirm.deleteTitle', { entity: t('questions.bank.countQuestions', { count: rows.length }) }), body: t('confirm.deleteBody'), confirmText: t('actions.delete') });
                  if (!ok) return;
                  await deleteMut.mutateAsync(rows.map((r) => r.id)).catch(() => undefined);
                  clear();
                }}
              >
                {t('actions.delete')}
              </Button>
            )}
          </>
        )}
        emptyAction={
          can('questions', 'create') && (
            <ButtonLink to="/questions/new" size="sm" icon={<Plus className="h-4 w-4" />}>
              {t('questions.bank.newQuestion')}
            </ButtonLink>
          )
        }
      />
    </>
  );
}
