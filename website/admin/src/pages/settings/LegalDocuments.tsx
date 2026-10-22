import { useEffect, useState } from 'react';
import { FilePlus2, FileText, ListChecks, Rocket, Save, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { legalApi, useLegalStats, useLegalVersions, type LegalDoc, type LegalVersionUi } from '@/api/settings';
import { useApiMutation, useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { flatRef } from '@/api/adapters';
import { isApiError, toastError } from '@/api/client';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { useDebounce } from '@/hooks/useMisc';
import { fmtDate, fmtDateTime, fmtNumber, fmtPercent } from '@/utils/format';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { BarChart } from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  ProgressBar,
  Segmented,
  Skeleton,
  SkeletonCard,
  StatCard,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';
import { ReadOnlyNotice, useCanEditSettings } from './_shared';

type Doc = LegalDoc;
type Edit = { version: string; title_en: string; title_ar: string; body_en: string; body_ar: string; changeSummary_en: string; changeSummary_ar: string };
const EDIT_KEYS: (keyof Edit)[] = ['version', 'title_en', 'title_ar', 'body_en', 'body_ar', 'changeSummary_en', 'changeSummary_ar'];
const EMPTY_EDIT: Edit = { version: '', title_en: '', title_ar: '', body_en: '', body_ar: '', changeSummary_en: '', changeSummary_ar: '' };
const pick = (v: LegalVersionUi): Edit => Object.fromEntries(EDIT_KEYS.map((k) => [k, v[k] ?? ''])) as Edit;

export default function LegalDocuments() {
  const { t } = useTranslation();
  const lang = useLang();
  const confirm = useConfirm();
  const editable = useCanEditSettings();

  const [doc, setDoc] = useState<Doc>('terms');
  const termsQ = useLegalVersions('terms');
  const privacyQ = useLegalVersions('privacy');
  const versionsQ = doc === 'terms' ? termsQ : privacyQ;
  const statsQ = useLegalStats(doc);
  const versions = versionsQ.data ?? [];
  const loading = versionsQ.isLoading;
  const current = versions.find((v) => v.status === 'published');
  const draftDoc = versions.find((v) => v.status === 'draft');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.find((v) => v.id === selectedId) ?? draftDoc ?? current ?? versions[0];

  const [edit, setEdit] = useState<Edit>(EMPTY_EDIT);
  const [viewLang, setViewLang] = useState<'en' | 'ar'>(lang);
  const [acceptancesFor, setAcceptancesFor] = useState<LegalVersionUi | null>(null);
  useEffect(() => {
    if (selected) setEdit(pick(selected));
  }, [selected]);

  const isDraft = selected?.status === 'draft';
  const dirty = !!selected && isDraft && EDIT_KEYS.some((k) => edit[k] !== (selected[k] ?? ''));
  const docLabel = t(`settings.legal.${doc}`);
  const invalidate = [qk.legal.all];

  const createM = useApiMutation(() => legalApi.createDraft(doc, { cloneFromId: (current ?? versions[0])?.id }), {
    invalidate,
    silentError: true,
    onSuccess: (v) => {
      setSelectedId(v.id);
      toast.success(t('settings.legal.draftCreated', { version: v.version }));
    },
    onError: (err) => {
      const draftId = isApiError(err) && err.reason === 'DRAFT_EXISTS' ? (err.details.draftId as string | undefined) : undefined;
      if (draftId) {
        setSelectedId(draftId);
        void versionsQ.refetch();
      } else toastError(err);
    },
  });
  const saveM = useApiMutation(
    (v: { id: string; edit: Edit }) =>
      legalApi.update(v.id, {
        version: v.edit.version.trim(),
        title: { en: v.edit.title_en, ar: v.edit.title_ar },
        body: { en: v.edit.body_en, ar: v.edit.body_ar },
        changeSummary: v.edit.changeSummary_en.trim() || v.edit.changeSummary_ar.trim() ? { en: v.edit.changeSummary_en, ar: v.edit.changeSummary_ar } : null,
      }),
    { invalidate, success: 'settings.legal.draftSaved' },
  );
  const publishM = useApiMutation(
    async (v: { id: string; edit: Edit; save: boolean; requireReacceptance: boolean }) => {
      if (v.save) await saveM.mutateAsync({ id: v.id, edit: v.edit });
      return legalApi.publish(v.id, v.requireReacceptance);
    },
    { invalidate, success: (r) => t('settings.legal.published', { version: r.published.version }) },
  );
  const removeM = useApiMutation((v: LegalVersionUi) => legalApi.remove(v.id), {
    invalidate,
    success: (_r, v) => t('toast.deleted', { entity: `v${v.version}` }),
    onSuccess: () => setSelectedId(null),
  });

  const createDraft = () => {
    if (draftDoc) {
      setSelectedId(draftDoc.id);
      return;
    }
    createM.mutate();
  };

  const saveDraft = () => {
    if (selected) saveM.mutate({ id: selected.id, edit });
  };

  const publish = async () => {
    if (!selected) return;
    const choice = { requireReacceptance: true };
    const ok = await confirm({
      title: t('settings.legal.publishTitle', { doc: docLabel, version: edit.version }),
      body: <PublishBody onChange={(v) => (choice.requireReacceptance = v)} />,
      tone: 'primary',
      confirmText: t('actions.publish'),
    });
    if (!ok) return;
    publishM.mutate({ id: selected.id, edit, save: dirty, requireReacceptance: choice.requireReacceptance });
  };

  const discard = async () => {
    if (!selected) return;
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: `${docLabel} v${selected.version}` }), body: t('confirm.deleteBody'), tone: 'danger', confirmText: t('actions.delete') });
    if (ok) removeM.mutate(selected);
  };

  const stats = statsQ.data;
  const chartData = stats?.byVersion?.length
    ? stats.byVersion.map((b) => ({ version: `v${b.version}`, acceptances: b.acceptances }))
    : [...versions]
        .filter((v) => v.status !== 'draft')
        .reverse()
        .map((v) => ({ version: `v${v.version}`, acceptances: v.acceptances }));
  const totalStudents = stats?.totalStudents ?? 0;
  const acceptances = stats?.acceptances ?? current?.acceptances ?? 0;
  const rate = stats ? stats.rate : current ? (acceptances / Math.max(1, totalStudents)) * 100 : 0;
  const pending = stats?.pendingReacceptance ?? Math.max(0, totalStudents - acceptances);
  const statsLoading = statsQ.isLoading || loading;
  const publishedAt = stats?.publishedAt ?? current?.publishedAt ?? null;

  return (
    <div>
      <PageHeader
        title={t('settings.legal.title')}
        subtitle={t('settings.legal.subtitle')}
        actions={
          editable && (
            <Button onClick={createDraft} loading={createM.isPending} icon={<FilePlus2 className="h-4 w-4" />}>
              {draftDoc ? t('settings.legal.openDraft') : t('settings.legal.newVersion')}
            </Button>
          )
        }
      />
      {!editable && <ReadOnlyNotice />}

      <Tabs<Doc>
        className="mb-6"
        value={doc}
        onChange={(d) => {
          setDoc(d);
          setSelectedId(null);
        }}
        tabs={[
          { key: 'terms', label: t('settings.legal.terms'), icon: <FileText />, count: termsQ.data?.length },
          { key: 'privacy', label: t('settings.legal.privacy'), icon: <ShieldCheck />, count: privacyQ.data?.length },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          loading={statsLoading}
          label={t('settings.legal.currentVersion')}
          value={stats?.currentVersion ? `v${stats.currentVersion}` : current ? `v${current.version}` : '—'}
          hint={publishedAt ? t('settings.legal.publishedOn', { date: fmtDate(publishedAt) }) : undefined}
          icon={<FileText />}
          color="#0B1F3A"
        />
        <StatCard loading={statsLoading} label={t('settings.legal.acceptances')} value={fmtNumber(acceptances)} hint={t('settings.legal.ofStudents', { total: fmtNumber(totalStudents) })} icon={<Users />} color="#16A34A" />
        <StatCard loading={statsLoading} label={t('settings.legal.acceptanceRate')} value={fmtPercent(Math.min(100, rate))} hint={t('settings.legal.pendingReacceptance', { count: pending })} icon={<ShieldCheck />} color="#C9A24A" />
      </div>

      {versionsQ.error && !versionsQ.data ? (
        <QueryError error={versionsQ.error} onRetry={() => versionsQ.refetch()} />
      ) : loading ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={10} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader title={t('settings.legal.versions')} />
              <ul className="p-2">
                {versions.length === 0 && <EmptyState compact title={t('settings.legal.noVersions')} hint={editable ? t('settings.legal.noVersionsHint') : undefined} />}
                {versions.map((v) => (
                  <li key={v.id}>
                    <button
                      onClick={() => setSelectedId(v.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition',
                        selected?.id === v.id ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-ink/5',
                      )}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-primary num ring-1 ring-line">v{v.version}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">
                          {docLabel} v{v.version}
                        </span>
                        <span className="block text-xs text-muted">{v.publishedAt ? fmtDate(v.publishedAt) : t('settings.legal.notPublished')}</span>
                      </span>
                      <StatusBadge status={v.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title={t('settings.legal.acceptanceChart')} subtitle={t('settings.legal.acceptanceChartHint')} />
              <CardBody>
                {statsQ.error && !stats ? (
                  <QueryError compact error={statsQ.error} onRetry={() => statsQ.refetch()} />
                ) : (
                  <BarChart data={chartData} xKey="version" series={[{ key: 'acceptances', label: t('settings.legal.acceptances'), color: '#C9A24A' }]} height={200} valueFormat={(v) => fmtNumber(v)} />
                )}
                {(current || stats?.currentVersion) && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted">v{stats?.currentVersion ?? current?.version}</span>
                      <span className="font-semibold num">{fmtPercent(Math.min(100, rate))}</span>
                    </div>
                    <ProgressBar value={rate} tone="success" />
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {selected && (
            <Card className="min-w-0">
              <CardHeader
                title={`${docLabel} — v${selected.version}`}
                subtitle={isDraft ? t('settings.legal.draftHint') : selected.status === 'published' ? t('settings.legal.liveHint') : t('settings.legal.retiredHint')}
                action={<StatusBadge status={selected.status} />}
              />
              <CardBody className="space-y-5">
                {isDraft && editable ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
                      <Field label={t('settings.legal.versionLabel')}>
                        <Input dir="ltr" value={edit.version} onChange={(e) => setEdit((s) => ({ ...s, version: e.target.value }))} />
                      </Field>
                      <Field label={t('settings.legal.titleEn')}>
                        <Input dir="ltr" value={edit.title_en} onChange={(e) => setEdit((s) => ({ ...s, title_en: e.target.value }))} />
                      </Field>
                      <Field label={t('settings.legal.titleAr')}>
                        <Input dir="rtl" value={edit.title_ar} onChange={(e) => setEdit((s) => ({ ...s, title_ar: e.target.value }))} />
                      </Field>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Field label={t('settings.legal.bodyEn')}>
                        <Textarea dir="ltr" rows={16} value={edit.body_en} onChange={(e) => setEdit((s) => ({ ...s, body_en: e.target.value }))} className="font-mono text-[13px]" />
                      </Field>
                      <Field label={t('settings.legal.bodyAr')}>
                        <Textarea dir="rtl" rows={16} value={edit.body_ar} onChange={(e) => setEdit((s) => ({ ...s, body_ar: e.target.value }))} className="text-[14px]" />
                      </Field>
                      <Field label={t('settings.legal.changeSummaryEn')} hint={t('settings.legal.changeSummaryHint')}>
                        <Textarea dir="ltr" rows={2} value={edit.changeSummary_en} onChange={(e) => setEdit((s) => ({ ...s, changeSummary_en: e.target.value }))} />
                      </Field>
                      <Field label={t('settings.legal.changeSummaryAr')}>
                        <Textarea dir="rtl" rows={2} value={edit.changeSummary_ar} onChange={(e) => setEdit((s) => ({ ...s, changeSummary_ar: e.target.value }))} />
                      </Field>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
                      <Button variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={discard} loading={removeM.isPending} icon={<Trash2 className="h-4 w-4" />}>
                        {t('settings.legal.discardDraft')}
                      </Button>
                      <Button variant="secondary" onClick={saveDraft} disabled={!dirty} loading={saveM.isPending && !publishM.isPending} icon={<Save className="h-4 w-4" />}>
                        {t('actions.saveDraft')}
                      </Button>
                      <Button onClick={publish} loading={publishM.isPending} disabled={!edit.body_en.trim() || !edit.body_ar.trim() || !edit.version.trim()} icon={<Rocket className="h-4 w-4" />}>
                        {t('actions.publish')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        {selected.publishedAt && <Badge tone="navy">{t('settings.legal.publishedOn', { date: fmtDate(selected.publishedAt) })}</Badge>}
                        <Badge>{t('settings.legal.acceptedBy', { count: selected.acceptances })}</Badge>
                        {selected.status !== 'draft' && (
                          <Button variant="ghost" size="sm" onClick={() => setAcceptancesFor(selected)} icon={<ListChecks className="h-4 w-4" />}>
                            {t('settings.legal.viewAcceptances')}
                          </Button>
                        )}
                      </div>
                      <Segmented
                        size="sm"
                        value={viewLang}
                        onChange={setViewLang}
                        options={[
                          { value: 'en', label: 'EN' },
                          { value: 'ar', label: 'ع' },
                        ]}
                      />
                    </div>
                    {(viewLang === 'ar' ? selected.title_ar : selected.title_en) && (
                      <h3 className="text-base font-bold text-primary" dir={viewLang === 'ar' ? 'rtl' : 'ltr'}>
                        {viewLang === 'ar' ? selected.title_ar : selected.title_en}
                      </h3>
                    )}
                    {(viewLang === 'ar' ? selected.changeSummary_ar : selected.changeSummary_en) && (
                      <p className="rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2 text-xs text-ink/80" dir={viewLang === 'ar' ? 'rtl' : 'ltr'}>
                        <span className="font-semibold">{t('settings.legal.changeSummary')}: </span>
                        {viewLang === 'ar' ? selected.changeSummary_ar : selected.changeSummary_en}
                      </p>
                    )}
                    <article
                      dir={viewLang === 'ar' ? 'rtl' : 'ltr'}
                      lang={viewLang}
                      className="max-h-[60vh] overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-surface-2 p-6 text-sm leading-7 text-ink/85 scrollbar-thin"
                      style={{ fontFamily: viewLang === 'ar' ? 'Tajawal, sans-serif' : undefined }}
                    >
                      {viewLang === 'ar' ? selected.body_ar : selected.body_en}
                    </article>
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <AcceptancesModal version={acceptancesFor} docLabel={docLabel} onClose={() => setAcceptancesFor(null)} />
    </div>
  );
}

/** Body of the publish confirmation with the re-acceptance toggle. */
function PublishBody({ onChange }: { onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState(true);
  return (
    <div className="space-y-3">
      <p>{t('settings.legal.publishBody')}</p>
      <Switch
        checked={v}
        onChange={(next) => {
          setV(next);
          onChange(next);
        }}
        label={t('settings.legal.requireReacceptance')}
        description={t('settings.legal.requireReacceptanceHint')}
      />
    </div>
  );
}

/** Paged list of students who accepted a version (ADM-LGL-07). */
function AcceptancesModal({ version, docLabel, onClose }: { version: LegalVersionUi | null; docLabel: string; onClose: () => void }) {
  const { t } = useTranslation();
  const L = useLocalize();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  useEffect(() => {
    setPage(0);
  }, [q, version?.id, pageSize]);
  useEffect(() => {
    if (!version) setSearch('');
  }, [version]);
  const params = { q: q || undefined, page: page + 1, pageSize };
  const listQ = useApiQuery(qk.legal.sub('acceptances', version?.id, params), () => legalApi.acceptances(version!.id, params), { enabled: !!version, placeholderData: (p) => p });
  const rows = listQ.data?.items ?? [];
  const total = listQ.data?.meta.total ?? 0;

  return (
    <Modal open={!!version} onClose={onClose} size="lg" title={version ? t('settings.legal.acceptancesTitle', { doc: docLabel, version: version.version }) : ''} description={t('settings.legal.acceptancesHint')}>
      <Input icon={<Search />} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('settings.legal.searchStudents')} className="mb-3 [&_input]:h-9" aria-label={t('actions.search')} />
      {listQ.error && !listQ.data ? (
        <QueryError compact error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact title={q ? t('common.noResults') : t('settings.legal.noAcceptances')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-start">{t('common.student')}</th>
                <th className="px-3 py-2 text-start">{t('settings.legal.acceptedAt')}</th>
                <th className="px-3 py-2 text-start">{t('settings.legal.platform')}</th>
                <th className="px-3 py-2 text-start">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.student.id}-${r.acceptedAt}`} className="border-t border-line">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{L(flatRef(r.student), 'name')}</div>
                    <div className="text-[11px] text-muted" dir="ltr">
                      {r.student.mobile}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted num">{fmtDateTime(r.acceptedAt)}</td>
                  <td className="px-3 py-2">
                    <Badge>{t(`settings.platforms.${r.platform}`)}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted" dir="ltr">
                    {r.ip}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} className="border-t border-line" />
        </div>
      )}
    </Modal>
  );
}
