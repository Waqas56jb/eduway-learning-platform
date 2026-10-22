import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, FlaskConical, PartyPopper, RotateCcw, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/utils/cn';
import { toCsv } from '@/utils/csv';
import { fmtNumber } from '@/utils/format';
import { useCan } from '@/store/auth';
import { useLang } from '@/hooks/useLocale';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, DataTable, FileUpload, Segmented } from '@/components/ui';
import { QuestionText } from '@/components/forms/QuestionForm';
import { download, errorMessage, http, toastError } from '@/api/client';
import { qk } from '@/api/keys';
import { uploadFile } from '@/api/storage';
import { questionsApi, type ImportPreviewDto, type ImportRow } from '@/api/questions';
import type { PageMeta, SuccessEnvelope } from '@/api/types';

const COLUMNS = [
  'subject', 'unit', 'topic', 'type', 'difficulty', 'body_en', 'body_ar',
  'option_a_en', 'option_a_ar', 'option_b_en', 'option_b_ar', 'option_c_en', 'option_c_ar', 'option_d_en', 'option_d_ar',
  'correct', 'explanation_en', 'explanation_ar', 'tags', 'source', 'year',
] as const;
type Col = (typeof COLUMNS)[number];
type Raw = Record<Col, string>;

const row = (v: Partial<Raw>): Raw => Object.fromEntries(COLUMNS.map((c) => [c, v[c] ?? ''])) as Raw;

/** Example rows for the "Use sample file" button — sent through the real import pipeline (3 rows intentionally invalid). */
const SAMPLE: Raw[] = [
  row({ subject: 'math', unit: '1', topic: '1', type: 'mcq', difficulty: 'easy', body_en: 'Simplify $(1 + i)^2$.', body_ar: 'بسّط $(1 + i)^2$.', option_a_en: '$2i$', option_a_ar: '$2i$', option_b_en: '$2$', option_b_ar: '$2$', option_c_en: '$0$', option_c_ar: '$0$', option_d_en: '$1 + 2i$', option_d_ar: '$1 + 2i$', correct: 'A', explanation_en: '$(1+i)^2 = 1 + 2i + i^2 = 2i$.', explanation_ar: '$(1+i)^2 = 1 + 2i - 1 = 2i$.', tags: 'complex-numbers;squares', source: 'Ministerial Exam', year: '2023' }),
  row({ subject: 'math', unit: '3', topic: '2', type: 'mcq', difficulty: 'medium', body_en: 'Evaluate $\\int_1^{e} \\frac{1}{x}\\,dx$.', body_ar: 'احسب $\\int_1^{e} \\frac{1}{x}\\,dx$.', option_a_en: '$1$', option_a_ar: '$1$', option_b_en: '$e$', option_b_ar: '$e$', option_c_en: '$0$', option_c_ar: '$0$', option_d_en: '$e - 1$', option_d_ar: '$e - 1$', correct: 'A', explanation_en: '$[\\ln x]_1^e = 1 - 0 = 1$.', explanation_ar: '$[\\ln x]_1^e = 1$.', tags: 'definite-integral;logarithm', source: 'EDUWAY Original' }),
  row({ subject: 'physics', unit: '1', topic: '2', type: 'mcq', difficulty: 'medium', body_en: 'Three $6\\,\\mu F$ capacitors are connected in parallel. The equivalent capacitance is:', body_ar: 'ثلاث متسعات سعة كل منها $6\\,\\mu F$ ربطت على التوازي. السعة المكافئة:', option_a_en: '$18\\,\\mu F$', option_a_ar: '$18\\,\\mu F$', option_b_en: '$2\\,\\mu F$', option_b_ar: '$2\\,\\mu F$', option_c_en: '$6\\,\\mu F$', option_c_ar: '$6\\,\\mu F$', option_d_en: '$12\\,\\mu F$', option_d_ar: '$12\\,\\mu F$', correct: 'A', explanation_en: 'In parallel capacitances add: $3 \\times 6 = 18\\,\\mu F$.', explanation_ar: 'في التوازي تجمع السعات: $18\\,\\mu F$.', tags: 'parallel;capacitance', source: 'Ministerial Exam', year: '2022' }),
  row({ subject: 'physics', unit: '2', topic: '1', type: 'true_false', difficulty: 'easy', body_en: "Lenz's law is a consequence of the conservation of energy.", body_ar: 'قانون لنز نتيجة لقانون حفظ الطاقة.', option_a_en: 'True', option_a_ar: 'صح', option_b_en: 'False', option_b_ar: 'خطأ', correct: 'A', explanation_en: 'The induced current opposes the change that produces it, so energy is conserved.', explanation_ar: 'التيار المحتث يعاكس التغير المسبب له فتُحفظ الطاقة.', tags: 'lenz;induction', source: 'EDUWAY Original' }),
  row({ subject: 'chemistry', unit: '2', topic: '1', type: 'mcq', difficulty: 'easy', body_en: 'The pH of pure water at $25^\\circ C$ is:', body_ar: 'قيمة pH للماء النقي عند $25^\\circ C$:', option_a_en: '7', option_a_ar: '7', option_b_en: '0', option_b_ar: '0', option_c_en: '14', option_c_ar: '14', option_d_en: '1', option_d_ar: '1', correct: 'A', explanation_en: '$[H^+] = 10^{-7}\\,M$ so pH = 7.', explanation_ar: '$[H^+] = 10^{-7}\\,M$ إذن pH = 7.', tags: 'pH', source: 'Textbook Exercise' }),
  row({ subject: 'chemistry', unit: '3', topic: '1', type: 'mcq', difficulty: 'hard', body_en: 'Which metal is the strongest reducing agent: Mg, Zn, Fe or Cu?', body_ar: 'أي الفلزات أقوى عامل مختزل: Mg أم Zn أم Fe أم Cu؟', option_a_en: 'Mg', option_a_ar: 'Mg', option_b_en: 'Zn', option_b_ar: 'Zn', option_c_en: 'Fe', option_c_ar: 'Fe', option_d_en: 'Cu', option_d_ar: 'Cu', correct: 'A', explanation_en: 'Mg has the most negative reduction potential ($-2.37\\,V$).', explanation_ar: 'للمغنيسيوم أقل جهد اختزال ($-2.37\\,V$).', tags: 'reducing-agent;electrochemistry', source: 'Ministerial Exam', year: '2021' }),
  row({ subject: 'biology', unit: '2', topic: '1', type: 'mcq', difficulty: 'medium', body_en: 'How many gamete types does a plant with genotype $AaBb$ produce?', body_ar: 'كم نوعاً من الأمشاج ينتج نبات تركيبه الجيني $AaBb$؟', option_a_en: '4', option_a_ar: '4', option_b_en: '2', option_b_ar: '2', option_c_en: '1', option_c_ar: '1', option_d_en: '8', option_d_ar: '8', correct: 'A', explanation_en: 'AB, Ab, aB and ab — four types.', explanation_ar: 'AB و Ab و aB و ab — أربعة أنواع.', tags: 'gametes;dihybrid', source: 'EDUWAY Original' }),
  row({ subject: 'english', unit: '2', topic: '2', type: 'mcq', difficulty: 'easy', body_en: 'The letter ______ by the manager yesterday.', body_ar: 'اختر الإجابة الصحيحة: The letter ______ by the manager yesterday.', option_a_en: 'was signed', option_a_ar: 'was signed', option_b_en: 'signed', option_b_ar: 'signed', option_c_en: 'is signing', option_c_ar: 'is signing', option_d_en: 'has signed', option_d_ar: 'has signed', correct: 'A', explanation_en: 'Past simple passive: was + past participle.', explanation_ar: 'المبني للمجهول في الماضي: was + التصريف الثالث.', tags: 'passive-voice', source: 'Ministerial Exam', year: '2024' }),
  row({ subject: 'english', unit: '1', topic: '2', type: 'mcq', difficulty: 'medium', body_en: 'He told me that he ______ the report the day before.', body_ar: 'اختر الإجابة الصحيحة: He told me that he ______ the report the day before.', option_a_en: 'had finished', option_a_ar: 'had finished', option_b_en: 'finishes', option_b_ar: 'finishes', option_c_en: 'has finished', option_c_ar: 'has finished', option_d_en: 'will finish', option_d_ar: 'will finish', correct: 'A', explanation_en: 'Reported speech moves past simple back to past perfect.', explanation_ar: 'في الكلام المنقول يتحول الماضي البسيط إلى الماضي التام.', tags: 'reported-speech', source: 'EDUWAY Original' }),
  // Invalid rows ↓
  row({ subject: 'biology', unit: '3', topic: '1', type: 'mcq', difficulty: 'easy', body_en: 'Which sugar is found in DNA?', body_ar: '', option_a_en: 'Deoxyribose', option_a_ar: 'سكر الرايبوز منقوص الأوكسجين', option_b_en: 'Ribose', option_b_ar: 'الرايبوز', option_c_en: 'Glucose', option_c_ar: 'الكلوكوز', option_d_en: 'Sucrose', option_d_ar: 'السكروز', correct: 'A', explanation_en: 'DNA contains deoxyribose.', explanation_ar: 'يحتوي الدنا على سكر الرايبوز منقوص الأوكسجين.', tags: 'dna', source: 'EDUWAY Original' }),
  row({ subject: 'geology', unit: '1', topic: '1', type: 'mcq', difficulty: 'easy', body_en: 'Which rock type forms from cooled magma?', body_ar: 'أي نوع من الصخور يتكون من الصهارة المبردة؟', option_a_en: 'Igneous', option_a_ar: 'نارية', option_b_en: 'Sedimentary', option_b_ar: 'رسوبية', option_c_en: 'Metamorphic', option_c_ar: 'متحولة', option_d_en: 'Fossil', option_d_ar: 'أحفورية', correct: 'A', explanation_en: 'Igneous rocks crystallise from magma.', explanation_ar: 'تتبلور الصخور النارية من الصهارة.', tags: 'rocks', source: 'EDUWAY Original' }),
  row({ subject: 'physics', unit: '3', topic: '1', type: 'mcq', difficulty: 'expert', body_en: 'The frequency of the Iraqi national grid is:', body_ar: 'تردد الشبكة الوطنية العراقية:', option_a_en: '50 Hz', option_a_ar: '50 Hz', option_b_en: '60 Hz', option_b_ar: '60 Hz', correct: 'E', explanation_en: 'Iraq uses a 50 Hz supply.', explanation_ar: 'يعتمد العراق تردد 50 Hz.', tags: 'ac', source: 'EDUWAY Original', year: '2031' }),
];

interface Parsed {
  index: number;
  raw: Raw;
  errors: Record<string, string>;
  valid: boolean;
  duplicateOf: ImportRow['duplicateOf'];
  resolved: ImportRow['resolved'];
}

const toParsed = (r: ImportRow): Parsed => ({
  index: r.row,
  raw: row(r.raw as Partial<Raw>),
  errors: { ...r.errors },
  valid: r.valid,
  duplicateOf: r.duplicateOf,
  resolved: r.resolved,
});

/** ADM-IMP-03 returns the rows page in `data.rows` and paging in `meta`. */
async function fetchImport(importId: string, params: { filter: 'all' | 'valid' | 'invalid'; page: number; pageSize: number }) {
  const res = await http.get<SuccessEnvelope<ImportPreviewDto>>(`/admin/questions/import/${importId}`, { params });
  return { preview: res.data.data, meta: res.data.meta as PageMeta | undefined };
}

type Step = 1 | 2 | 3 | 4;

export default function BulkImport() {
  const { t } = useTranslation();
  const lang = useLang();
  const can = useCan();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState('');
  const [importId, setImportId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [rows, setRows] = useState<Parsed[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState<'all' | 'valid' | 'errors'>('all');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [committing, setCommitting] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);

  // Load the current preview page whenever import / filter / paging changes; poll while the server is parsing.
  useEffect(() => {
    if (!importId) return;
    let stop = false;
    let timer: number | undefined;
    const run = async () => {
      setRowsLoading(true);
      try {
        const r = await fetchImport(importId, { filter: filter === 'errors' ? 'invalid' : filter, page: page + 1, pageSize });
        if (stop) return;
        setPreview(r.preview);
        if (r.preview.status === 'parsing') {
          timer = window.setTimeout(run, 2000);
          return;
        }
        setRows((r.preview.rows ?? []).map(toParsed));
        setMeta(r.meta ?? null);
        setParsing(false);
        if (r.preview.status === 'failed' || r.preview.status === 'expired') toast.error(t(`apiErrors.reasons.${r.preview.status === 'expired' ? 'IMPORT_EXPIRED' : 'IMPORT_NOT_READY'}`));
      } catch (e) {
        if (!stop) {
          toastError(e);
          setParsing(false);
        }
      } finally {
        if (!stop) setRowsLoading(false);
      }
    };
    run();
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [importId, filter, page, pageSize, t]);

  const downloadTemplate = async () => {
    try {
      await download('/admin/questions/import/template', { params: { format: 'csv' }, fallbackName: 'eduway-question-import-template.csv' });
      toast.success(t('questions.import.templateDownloaded'));
      if (step === 1) setStep(2);
    } catch (e) {
      toastError(e);
    }
  };

  /** Upload to storage (STO-01) then hand the file key to the import parser (ADM-IMP-02). */
  const onFile = async (file: File) => {
    setParsing(true);
    setUploadPct(0);
    try {
      const up = await uploadFile(file, 'question_import', setUploadPct);
      setUploadPct(null);
      const created = await questionsApi.import.upload(up.fileKey);
      setFileName(created.fileName || file.name);
      setPreview(created);
      setFilter('all');
      setPage(0);
      setResult(null);
      setImportId(created.importId);
      setStep(3);
    } catch (e) {
      setUploadPct(null);
      setParsing(false);
      toast.error(errorMessage(e));
    }
  };

  const loadSample = () => {
    const csv = toCsv(SAMPLE as unknown as Record<string, unknown>[], COLUMNS.map((c) => ({ key: c, header: c })));
    onFile(new File(['\ufeff' + csv], 'sample-ministerial-batch.csv', { type: 'text/csv' }));
  };

  const totals = preview?.totals ?? { rows: 0, valid: 0, invalid: 0 };
  const validCount = totals.valid;
  const invalid = totals.invalid;

  const doImport = async () => {
    if (!importId) return;
    setCommitting(true);
    try {
      const r = await questionsApi.import.commit(importId);
      setResult({ imported: r.imported, skipped: r.skipped });
      setStep(4);
      toast.success(t('questions.import.imported', { count: r.imported }));
      qc.invalidateQueries({ queryKey: qk.questions.all });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCommitting(false);
    }
  };

  const downloadErrors = () =>
    importId && download(`/admin/questions/import/${importId}/errors`, { fallbackName: `import-errors-${importId}.csv` }).catch(toastError);

  const reset = () => {
    setRows([]);
    setPreview(null);
    setImportId(null);
    setFileName('');
    setResult(null);
    setStep(2);
  };

  const shown = rows;

  const errCell = (r: Parsed, ...keys: (Col | 'duplicate')[]) => keys.some((k) => r.errors[k] || (k === 'duplicate' && r.duplicateOf));
  const cellCls = (bad: boolean) => cn('rounded px-1.5 py-0.5', bad && 'bg-danger/10 text-danger ring-1 ring-danger/30');

  const columns = useMemo<ColumnDef<Parsed, unknown>[]>(
    () => [
      { id: 'row', accessorKey: 'index', header: t('questions.import.row'), meta: { className: 'w-14' }, cell: ({ row: r }) => <span className="text-xs text-muted num">#{r.original.index}</span> },
      {
        id: 'ok',
        accessorFn: (r) => (r.valid ? 1 : 0),
        header: t('common.status'),
        cell: ({ row: r }) =>
          r.original.valid ? (
            <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>
              {t('questions.import.valid')}
            </Badge>
          ) : (
            <Badge tone="danger" icon={<AlertCircle className="h-3 w-3" />}>
              {t('questions.import.errorsCount', { count: Object.keys(r.original.errors).length })}
            </Badge>
          ),
      },
      {
        id: 'subject',
        accessorFn: (r) => r.raw.subject,
        header: t('common.subject'),
        cell: ({ row: r }) => {
          const s = r.original.resolved?.subject;
          return <span className={cellCls(errCell(r.original, 'subject'))}>{s ? s.name[lang] : r.original.raw.subject || '∅'}</span>;
        },
      },
      {
        id: 'location',
        header: `${t('common.unit')} / ${t('common.topic')}`,
        enableSorting: false,
        cell: ({ row: r }) => <span className={cn('num text-xs', cellCls(errCell(r.original, 'unit', 'topic')))}>U{r.original.raw.unit || '?'} · T{r.original.raw.topic || '?'}</span>,
      },
      {
        id: 'meta',
        header: `${t('common.type')} / ${t('questions.fields.difficulty')}`,
        enableSorting: false,
        cell: ({ row: r }) => (
          <span className="flex flex-col gap-1 text-xs">
            <span className={cellCls(errCell(r.original, 'type'))}>{r.original.raw.type || '∅'}</span>
            <span className={cellCls(errCell(r.original, 'difficulty'))}>{r.original.raw.difficulty || '∅'}</span>
          </span>
        ),
      },
      {
        id: 'body',
        header: t('questions.fields.question'),
        enableSorting: false,
        cell: ({ row: r }) => (
          <div className="min-w-[16rem] max-w-md space-y-1 text-[13px]">
            <div className={cn('line-clamp-2', cellCls(errCell(r.original, 'body_en', 'duplicate')))}>
              <QuestionText text={r.original.raw.body_en || '∅'} />
            </div>
            <div dir="rtl" className={cn('line-clamp-1 text-muted', cellCls(errCell(r.original, 'body_ar')))}>
              {r.original.raw.body_ar ? <QuestionText text={r.original.raw.body_ar} /> : '∅'}
            </div>
          </div>
        ),
      },
      {
        id: 'correct',
        header: t('questions.import.correct'),
        enableSorting: false,
        cell: ({ row: r }) => <span className={cn('font-mono text-xs font-semibold', cellCls(errCell(r.original, 'correct', 'option_a_en', 'option_a_ar')))}>{r.original.raw.correct || '∅'}</span>,
      },
      {
        id: 'errors',
        header: t('questions.import.issues'),
        enableSorting: false,
        cell: ({ row: r }) => {
          const e = [...Object.values(r.original.errors), ...(r.original.duplicateOf && !r.original.errors.duplicate ? [t('questions.import.errDuplicate', { code: r.original.duplicateOf.code })] : [])];
          return e.length ? (
            <ul className="min-w-[14rem] list-disc space-y-0.5 ps-4 text-xs text-danger">
              {e.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-muted">—</span>
          );
        },
      },
    ],
     
    [t, lang],
  );

  const STEPS: { n: Step; label: string }[] = [
    { n: 1, label: t('questions.import.step1') },
    { n: 2, label: t('questions.import.step2') },
    { n: 3, label: t('questions.import.step3') },
    { n: 4, label: t('questions.import.step4') },
  ];

  return (
    <>
      <PageHeader
        title={t('questions.import.title')}
        subtitle={t('questions.import.subtitle')}
        actions={
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={downloadTemplate}>
            {t('questions.import.downloadTemplate')}
          </Button>
        }
      />

      <ol className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.n} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition', step === s.n ? 'border-accent bg-accent/[0.07]' : step > s.n ? 'border-success/40 bg-success/[0.05]' : 'border-line bg-surface')}>
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', step > s.n ? 'bg-success text-white' : step === s.n ? 'bg-accent text-white' : 'bg-ink/5 text-muted')}>
              {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </span>
            <span className={cn('font-medium', step >= s.n ? 'text-ink' : 'text-muted')}>{s.label}</span>
          </li>
        ))}
      </ol>

      {!can('questions', 'create') ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted">{t('common.noPermission')}</p>
          </CardBody>
        </Card>
      ) : step === 4 && result ? (
        <Card>
          <CardBody className="flex flex-col items-center py-12 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success">
              <PartyPopper className="h-8 w-8" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-bold text-primary">{t('questions.import.doneTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('questions.import.doneHint', { file: fileName })}</p>
            <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-3">
              <div className="rounded-xl border border-success/30 bg-success/[0.06] p-4">
                <div className="kpi-num text-3xl text-success">{fmtNumber(result.imported)}</div>
                <div className="text-xs text-muted">{t('questions.import.importedLabel')}</div>
              </div>
              <div className="rounded-xl border border-danger/30 bg-danger/[0.05] p-4">
                <div className="kpi-num text-3xl text-danger">{fmtNumber(result.skipped)}</div>
                <div className="text-xs text-muted">{t('questions.import.skippedLabel')}</div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <ButtonLink to="/questions">{t('questions.import.viewBank')}</ButtonLink>
              <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
                {t('questions.import.another')}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : step === 3 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <FileSpreadsheet className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold text-ink">{fileName}</span>
            <Badge tone="neutral">{t('questions.import.rowsTotal', { count: totals.rows })}</Badge>
            <Badge tone="success">{t('questions.import.rowsValid', { count: validCount })}</Badge>
            {invalid > 0 && <Badge tone="danger">{t('questions.import.rowsInvalid', { count: invalid })}</Badge>}
            {preview?.status === 'parsing' && <Badge tone="warning">{t('questions.import.parsing')}</Badge>}
            <div className="ms-auto flex flex-wrap gap-2">
              {invalid > 0 && (
                <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={downloadErrors}>
                  {t('questions.import.errorReport')}
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
                {t('questions.import.chooseAnother')}
              </Button>
              <Button size="sm" icon={<Upload className="h-4 w-4" />} loading={committing} disabled={!validCount || preview?.status !== 'ready'} onClick={doImport}>
                {t('questions.import.importValid', { count: validCount })}
              </Button>
            </div>
          </div>
          <DataTable
            data={shown}
            columns={columns}
            getRowId={(r) => String(r.index)}
            hideSearch
            loading={rowsLoading && rows.length === 0}
            pageSize={25}
            server={{
              total: meta?.total ?? (filter === 'all' ? totals.rows : filter === 'valid' ? validCount : invalid),
              page,
              pageSize,
              onPage: setPage,
              onPageSize: (n) => {
                setPageSize(n);
                setPage(0);
              },
              sorting: [],
              onSorting: () => undefined,
              search: '',
              onSearch: () => undefined,
            }}
            rowClassName={(r) => (r.valid ? undefined : 'bg-danger/[0.03]')}
            toolbar={
              <Segmented
                size="sm"
                aria-label={t('actions.filter')}
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setPage(0);
                }}
                options={[
                  { value: 'all', label: `${t('common.all')} (${totals.rows})` },
                  { value: 'valid', label: `${t('questions.import.valid')} (${validCount})` },
                  { value: 'errors', label: `${t('questions.import.withErrors')} (${invalid})` },
                ]}
              />
            }
          />
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader title={t('questions.import.uploadTitle')} subtitle={t('questions.import.uploadHint')} icon={<Upload className="h-4 w-4" />} />
            <CardBody className="space-y-4">
              <FileUpload accept=".csv,.xlsx,.xls" maxSizeMb={10} onFile={(f) => onFile(f)} hint={t('questions.import.formats')} disabled={parsing} progress={uploadPct} />
              {parsing && <p className="animate-pulse text-center text-sm text-muted">{t('questions.import.parsing')}</p>}
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                {t('questions.import.or')}
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="outline" className="w-full" icon={<FlaskConical className="h-4 w-4" />} loading={parsing} onClick={loadSample}>
                {t('questions.import.useSample')}
              </Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('questions.import.rulesTitle')} />
            <CardBody>
              <ul className="space-y-2.5 text-sm text-ink/80">
                {(['rule1', 'rule2', 'rule3', 'rule4', 'rule5'] as const).map((k) => (
                  <li key={k} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{t(`questions.import.${k}`)}</span>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" size="sm" className="mt-5 w-full" icon={<Download className="h-4 w-4" />} onClick={downloadTemplate}>
                {t('questions.import.downloadTemplate')}
              </Button>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
