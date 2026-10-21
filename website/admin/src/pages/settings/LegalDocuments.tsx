import { useEffect, useMemo, useState } from 'react';
import { FilePlus2, FileText, Rocket, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { LegalVersion } from '@/types';
import { useLegalVersions } from '@/store/settings';
import { useStudents } from '@/store/core';
import { useMockLoading } from '@/hooks/useMockLoading';
import { useLang } from '@/hooks/useLocale';
import { fmtDate, fmtNumber, fmtPercent } from '@/utils/format';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { BarChart } from '@/components/charts';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, ProgressBar, Segmented, SkeletonCard, StatCard, StatusBadge, Tabs, Textarea, useConfirm } from '@/components/ui';
import { ReadOnlyNotice, useCanEditSettings } from './_shared';

type Doc = LegalVersion['doc'];

const nextVersion = (versions: LegalVersion[]) => {
  const max = versions.map((v) => v.version.split('.').map(Number)).sort((a, b) => b[0] - a[0] || (b[1] ?? 0) - (a[1] ?? 0))[0] ?? [0, 0];
  return `${max[0]}.${(max[1] ?? 0) + 1}`;
};

export default function LegalDocuments() {
  const { t } = useTranslation();
  const lang = useLang();
  const loading = useMockLoading();
  const all = useLegalVersions((s) => s.items);
  const add = useLegalVersions((s) => s.add);
  const update = useLegalVersions((s) => s.update);
  const updateMany = useLegalVersions((s) => s.updateMany);
  const remove = useLegalVersions((s) => s.remove);
  const totalStudents = useStudents((s) => s.items.length);
  const confirm = useConfirm();
  const editable = useCanEditSettings();

  const [doc, setDoc] = useState<Doc>('terms');
  const versions = useMemo(
    () => all.filter((v) => v.doc === doc).sort((a, b) => (b.publishedAt ?? '9999').localeCompare(a.publishedAt ?? '9999')),
    [all, doc],
  );
  const current = versions.find((v) => v.status === 'published');
  const draftDoc = versions.find((v) => v.status === 'draft');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.find((v) => v.id === selectedId) ?? draftDoc ?? current ?? versions[0];

  const [edit, setEdit] = useState({ version: '', body_en: '', body_ar: '' });
  const [viewLang, setViewLang] = useState<'en' | 'ar'>(lang);
  useEffect(() => {
    if (selected) setEdit({ version: selected.version, body_en: selected.body_en, body_ar: selected.body_ar });
  }, [selected]);

  const isDraft = selected?.status === 'draft';
  const dirty = !!selected && isDraft && (edit.version !== selected.version || edit.body_en !== selected.body_en || edit.body_ar !== selected.body_ar);
  const docLabel = t(`settings.legal.${doc}`);

  const createDraft = () => {
    if (draftDoc) {
      setSelectedId(draftDoc.id);
      return;
    }
    const base = current ?? versions[0];
    const v: LegalVersion = {
      id: uid('lg'),
      doc,
      version: nextVersion(versions),
      body_en: base?.body_en ?? '',
      body_ar: base?.body_ar ?? '',
      status: 'draft',
      publishedAt: null,
      acceptances: 0,
    };
    add(v, { summary: `Created ${doc} v${v.version} draft` });
    setSelectedId(v.id);
    toast.success(t('settings.legal.draftCreated', { version: v.version }));
  };

  const saveDraft = () => {
    if (!selected) return;
    update(selected.id, edit, { summary: `Edited ${doc} v${edit.version} draft` });
    toast.success(t('settings.legal.draftSaved'));
  };

  const publish = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: t('settings.legal.publishTitle', { doc: docLabel, version: edit.version }),
      body: t('settings.legal.publishBody'),
      tone: 'primary',
      confirmText: t('actions.publish'),
    });
    if (!ok) return;
    if (current) updateMany([current.id], { status: 'retired' }, { action: 'legal_document.retire', summary: `Retired ${doc} v${current.version}` });
    update(selected.id, { ...edit, status: 'published', publishedAt: new Date().toISOString() }, { action: 'legal_document.publish', summary: `Published ${doc} v${edit.version}` });
    toast.success(t('settings.legal.published', { version: edit.version }));
  };

  const discard = async () => {
    if (!selected) return;
    const ok = await confirm({ title: t('confirm.deleteTitle', { entity: `${docLabel} v${selected.version}` }), body: t('confirm.deleteBody'), tone: 'danger', confirmText: t('actions.delete') });
    if (!ok) return;
    remove(selected.id);
    setSelectedId(null);
    toast.success(t('toast.deleted', { entity: `v${selected.version}` }));
  };

  const chartData = [...versions]
    .filter((v) => v.status !== 'draft')
    .reverse()
    .map((v) => ({ version: `v${v.version}`, acceptances: v.acceptances }));
  const rate = current ? (current.acceptances / Math.max(1, totalStudents)) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={t('settings.legal.title')}
        subtitle={t('settings.legal.subtitle')}
        actions={
          editable && (
            <Button onClick={createDraft} icon={<FilePlus2 className="h-4 w-4" />}>
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
          { key: 'terms', label: t('settings.legal.terms'), icon: <FileText />, count: all.filter((v) => v.doc === 'terms').length },
          { key: 'privacy', label: t('settings.legal.privacy'), icon: <ShieldCheck />, count: all.filter((v) => v.doc === 'privacy').length },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard loading={loading} label={t('settings.legal.currentVersion')} value={current ? `v${current.version}` : '—'} hint={current ? t('settings.legal.publishedOn', { date: fmtDate(current.publishedAt) }) : undefined} icon={<FileText />} color="#0B1F3A" />
        <StatCard loading={loading} label={t('settings.legal.acceptances')} value={fmtNumber(current?.acceptances ?? 0)} hint={t('settings.legal.ofStudents', { total: fmtNumber(totalStudents) })} icon={<Users />} color="#16A34A" />
        <StatCard loading={loading} label={t('settings.legal.acceptanceRate')} value={fmtPercent(Math.min(100, rate))} hint={t('settings.legal.pendingReacceptance', { count: Math.max(0, totalStudents - (current?.acceptances ?? 0)) })} icon={<ShieldCheck />} color="#C9A24A" />
      </div>

      {loading ? (
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
                        <span className="block text-sm font-medium text-ink">{docLabel} v{v.version}</span>
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
                <BarChart data={chartData} xKey="version" series={[{ key: 'acceptances', label: t('settings.legal.acceptances'), color: '#C9A24A' }]} height={200} valueFormat={(v) => fmtNumber(v)} />
                {current && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted">v{current.version}</span>
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
                    <Field label={t('settings.legal.versionLabel')} className="max-w-[10rem]">
                      <Input dir="ltr" value={edit.version} onChange={(e) => setEdit((s) => ({ ...s, version: e.target.value }))} />
                    </Field>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Field label={t('settings.legal.bodyEn')}>
                        <Textarea dir="ltr" rows={16} value={edit.body_en} onChange={(e) => setEdit((s) => ({ ...s, body_en: e.target.value }))} className="font-mono text-[13px]" />
                      </Field>
                      <Field label={t('settings.legal.bodyAr')}>
                        <Textarea dir="rtl" rows={16} value={edit.body_ar} onChange={(e) => setEdit((s) => ({ ...s, body_ar: e.target.value }))} className="text-[14px]" />
                      </Field>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
                      <Button variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={discard} icon={<Trash2 className="h-4 w-4" />}>
                        {t('settings.legal.discardDraft')}
                      </Button>
                      <Button variant="secondary" onClick={saveDraft} disabled={!dirty} icon={<Save className="h-4 w-4" />}>
                        {t('actions.saveDraft')}
                      </Button>
                      <Button onClick={publish} disabled={!edit.body_en.trim() || !edit.body_ar.trim() || !edit.version.trim()} icon={<Rocket className="h-4 w-4" />}>
                        {t('actions.publish')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        {selected.publishedAt && <Badge tone="navy">{t('settings.legal.publishedOn', { date: fmtDate(selected.publishedAt) })}</Badge>}
                        <Badge>{t('settings.legal.acceptedBy', { count: selected.acceptances })}</Badge>
                      </div>
                      <Segmented size="sm" value={viewLang} onChange={setViewLang} options={[{ value: 'en', label: 'EN' }, { value: 'ar', label: 'ع' }]} />
                    </div>
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
    </div>
  );
}
