import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, FlaskConical, PartyPopper, RotateCcw, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Difficulty, Question, QuestionType } from '@/types';
import { cn } from '@/utils/cn';
import { downloadFile, toCsv } from '@/utils/csv';
import { fmtNumber } from '@/utils/format';
import { uid } from '@/utils/id';
import { useQuestions } from '@/store/questions';
import { useSubjects, useTopics, useUnits } from '@/store/core';
import { logAudit } from '@/store/audit';
import { useCan, useCurrentAdmin } from '@/store/auth';
import { useLocalize } from '@/hooks/useLocale';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, DataTable, FileUpload, Segmented } from '@/components/ui';
import { QuestionText, nextQuestionCode, similarity } from '@/components/forms/QuestionForm';

const COLUMNS = [
  'subject', 'unit', 'topic', 'type', 'difficulty', 'body_en', 'body_ar',
  'option_a_en', 'option_a_ar', 'option_b_en', 'option_b_ar', 'option_c_en', 'option_c_ar', 'option_d_en', 'option_d_ar',
  'correct', 'explanation_en', 'explanation_ar', 'tags', 'source', 'year',
] as const;
type Col = (typeof COLUMNS)[number];
type Raw = Record<Col, string>;

const row = (v: Partial<Raw>): Raw => Object.fromEntries(COLUMNS.map((c) => [c, v[c] ?? ''])) as Raw;

/** Example content used for the template and the "sample file" demo (3 rows intentionally invalid). */
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

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      cur.push(field);
      if (cur.some((c) => c.trim())) rows.push(cur);
      cur = [];
      field = '';
    } else field += ch;
  }
  cur.push(field);
  if (cur.some((c) => c.trim())) rows.push(cur);
  return rows;
}

interface Parsed {
  index: number;
  raw: Raw;
  errors: Partial<Record<Col | 'duplicate', string>>;
  question: Question | null;
}

type Step = 1 | 2 | 3 | 4;

export default function BulkImport() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const admin = useCurrentAdmin();
  const all = useQuestions((s) => s.items);
  const addQ = useQuestions((s) => s.add);
  const subjects = useSubjects((s) => s.items);
  const units = useUnits((s) => s.items);
  const topics = useTopics((s) => s.items);

  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Parsed[]>([]);
  const [filter, setFilter] = useState<'all' | 'valid' | 'errors'>('all');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [parsing, setParsing] = useState(false);

  const validate = (raws: Raw[]): Parsed[] =>
    raws.map((r, i) => {
      const errors: Parsed['errors'] = {};
      const subject = subjects.find((s) => s.key === r.subject.trim().toLowerCase());
      if (!subject) errors.subject = t('questions.import.errSubject', { value: r.subject || '∅' });
      const unit = subject ? units.find((u) => u.subjectId === subject.id && u.order === Number(r.unit)) : undefined;
      if (subject && !unit) errors.unit = t('questions.import.errUnit', { value: r.unit || '∅' });
      const topic = unit ? topics.find((tp) => tp.unitId === unit.id && tp.order === Number(r.topic)) : undefined;
      if (unit && !topic) errors.topic = t('questions.import.errTopic', { value: r.topic || '∅' });
      const type = r.type.trim().toLowerCase() as QuestionType;
      if (!['mcq', 'true_false', 'fill_blank'].includes(type)) errors.type = t('questions.import.errType', { value: r.type || '∅' });
      const difficulty = r.difficulty.trim().toLowerCase() as Difficulty;
      if (!['easy', 'medium', 'hard'].includes(difficulty)) errors.difficulty = t('questions.import.errDifficulty', { value: r.difficulty || '∅' });
      if (r.body_en.trim().length < 8) errors.body_en = t('questions.import.errBody');
      if (r.body_ar.trim().length < 5) errors.body_ar = t('questions.import.errBody');
      const letters = ['a', 'b', 'c', 'd'] as const;
      const opts = letters
        .map((l) => ({ l, en: r[`option_${l}_en` as Col].trim(), ar: r[`option_${l}_ar` as Col].trim() }))
        .filter((o) => o.en || o.ar);
      if (type !== 'fill_blank' && opts.length < 2) errors.option_a_en = t('questions.validation.minOptions');
      if (opts.some((o) => !o.en || !o.ar)) errors.option_a_ar = t('questions.validation.emptyOption');
      const correct = r.correct.trim().toLowerCase();
      if (!opts.some((o) => o.l === correct)) errors.correct = t('questions.import.errCorrect', { value: r.correct || '∅' });
      if (r.year.trim() && (!/^\d{4}$/.test(r.year.trim()) || +r.year < 2000 || +r.year > 2027)) errors.year = t('questions.import.errYear', { value: r.year });
      if (!r.explanation_en.trim() || !r.explanation_ar.trim()) errors.explanation_en = t('questions.import.errExplanation');
      const dup = topic ? all.find((q) => q.topicId === topic.id && similarity(q.body_en, r.body_en) >= 0.8) : undefined;
      if (dup) errors.duplicate = t('questions.import.errDuplicate', { code: dup.code });

      const ok = Object.keys(errors).length === 0;
      const qid = uid('q');
      const question: Question | null =
        ok && subject && unit && topic
          ? {
              id: qid,
              code: '',
              subjectId: subject.id,
              unitId: unit.id,
              topicId: topic.id,
              type,
              difficulty,
              body_en: r.body_en.trim(),
              body_ar: r.body_ar.trim(),
              image: null,
              options: (type === 'fill_blank' ? opts.filter((o) => o.l === correct) : opts).map((o, k) => ({ id: `${qid}_${k}`, text_en: o.en, text_ar: o.ar, correct: o.l === correct })),
              explanation_en: r.explanation_en.trim(),
              explanation_ar: r.explanation_ar.trim(),
              tags: r.tags.split(/[;|]/).map((x) => x.trim()).filter(Boolean),
              source: r.source.trim() || 'EDUWAY Original',
              year: r.year.trim() ? Number(r.year) : null,
              status: 'draft',
              authorId: admin?.id ?? 'adm_1',
              reviewerId: null,
              usageCount: 0,
              accuracy: 0,
              duplicateOf: null,
              reviewComment: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : null;
      return { index: i + 2, raw: r, errors, question };
    });

  const downloadTemplate = () => {
    downloadFile(toCsv(SAMPLE.slice(0, 3) as unknown as Record<string, unknown>[], COLUMNS.map((c) => ({ key: c, header: c }))), 'eduway-question-import-template.csv');
    toast.success(t('questions.import.templateDownloaded'));
    if (step === 1) setStep(2);
  };

  const load = async (raws: Raw[], name: string) => {
    setParsing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRows(validate(raws));
    setFileName(name);
    setFilter('all');
    setResult(null);
    setParsing(false);
    setStep(3);
  };

  const onFile = async (file: File) => {
    if (/\.xlsx?$/i.test(file.name)) {
      // XLSX parsing is mocked in this build — the sample rows stand in for the sheet contents.
      toast(t('questions.import.xlsxMock'), { icon: '📊' });
      await load(SAMPLE, file.name);
      return;
    }
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      toast.error(t('questions.import.emptyFile'));
      return;
    }
    const header = table[0].map((h) => h.trim().toLowerCase());
    const missing = COLUMNS.filter((c) => !header.includes(c));
    if (missing.length > 4) {
      toast.error(t('questions.import.badHeader', { cols: missing.slice(0, 4).join(', ') }));
      return;
    }
    const raws = table.slice(1).map((cells) => row(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])) as Partial<Raw>));
    await load(raws, file.name);
  };

  const valid = rows.filter((r) => r.question);
  const invalid = rows.length - valid.length;

  const doImport = () => {
    const pool = [...all];
    valid.forEach((r) => {
      const q = r.question!;
      const subj = subjects.find((s) => s.id === q.subjectId);
      const unit = units.find((u) => u.id === q.unitId);
      const created = { ...q, code: nextQuestionCode(pool, subj?.key ?? '', unit?.name_en ?? '') };
      pool.push(created);
      addQ(created, { silent: true });
    });
    logAudit({ action: 'question.bulk_import', entity: 'question', entityId: `${valid.length} records`, summary: `Imported ${valid.length} questions from ${fileName} (${invalid} rows skipped)`, after: { imported: valid.length, skipped: invalid, file: fileName } });
    setResult({ imported: valid.length, skipped: invalid });
    setStep(4);
    toast.success(t('questions.import.imported', { count: valid.length }));
  };

  const reset = () => {
    setRows([]);
    setFileName('');
    setResult(null);
    setStep(2);
  };

  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'valid' ? !!r.question : !r.question));

  const errCell = (r: Parsed, ...keys: (Col | 'duplicate')[]) => keys.some((k) => r.errors[k]);
  const cellCls = (bad: boolean) => cn('rounded px-1.5 py-0.5', bad && 'bg-danger/10 text-danger ring-1 ring-danger/30');

  const columns = useMemo<ColumnDef<Parsed, unknown>[]>(
    () => [
      { id: 'row', accessorKey: 'index', header: t('questions.import.row'), meta: { className: 'w-14' }, cell: ({ row: r }) => <span className="text-xs text-muted num">#{r.original.index}</span> },
      {
        id: 'ok',
        accessorFn: (r) => (r.question ? 1 : 0),
        header: t('common.status'),
        cell: ({ row: r }) =>
          r.original.question ? (
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
          const s = subjects.find((x) => x.key === r.original.raw.subject.toLowerCase());
          return <span className={cellCls(errCell(r.original, 'subject'))}>{s ? L(s, 'name') : r.original.raw.subject || '∅'}</span>;
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
          const e = Object.values(r.original.errors);
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
    [t, L, subjects],
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
            <Badge tone="neutral">{t('questions.import.rowsTotal', { count: rows.length })}</Badge>
            <Badge tone="success">{t('questions.import.rowsValid', { count: valid.length })}</Badge>
            {invalid > 0 && <Badge tone="danger">{t('questions.import.rowsInvalid', { count: invalid })}</Badge>}
            <div className="ms-auto flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
                {t('questions.import.chooseAnother')}
              </Button>
              <Button size="sm" icon={<Upload className="h-4 w-4" />} disabled={!valid.length} onClick={doImport}>
                {t('questions.import.importValid', { count: valid.length })}
              </Button>
            </div>
          </div>
          <DataTable
            data={shown}
            columns={columns}
            getRowId={(r) => String(r.index)}
            hideSearch
            pageSize={25}
            rowClassName={(r) => (r.question ? undefined : 'bg-danger/[0.03]')}
            toolbar={
              <Segmented
                size="sm"
                aria-label={t('actions.filter')}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: `${t('common.all')} (${rows.length})` },
                  { value: 'valid', label: `${t('questions.import.valid')} (${valid.length})` },
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
              <FileUpload accept=".csv,.xlsx,.xls" maxSizeMb={10} onFile={(f) => onFile(f)} hint={t('questions.import.formats')} disabled={parsing} />
              {parsing && <p className="animate-pulse text-center text-sm text-muted">{t('questions.import.parsing')}</p>}
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                {t('questions.import.or')}
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="outline" className="w-full" icon={<FlaskConical className="h-4 w-4" />} loading={parsing} onClick={() => load(SAMPLE, 'sample-ministerial-batch.csv')}>
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
