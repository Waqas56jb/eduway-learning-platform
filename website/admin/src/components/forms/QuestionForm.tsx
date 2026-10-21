import { Fragment, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Bold, CheckCircle2, Circle, Italic, Plus, Sigma, Trash2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { Difficulty, Lang, Question, QuestionOption, QuestionStatus, QuestionType } from '@/types';
import { cn } from '@/utils/cn';
import { uid } from '@/utils/id';
import { useSubjects, useTopics, useUnits } from '@/store/core';
import { useLocalize } from '@/hooks/useLocale';
import { Badge, Button, Field, Img, Input, Latex, Select, Textarea, type Tone } from '@/components/ui';

// ─── Rendering ───────────────────────────────────────────────────────────────

/** Renders question text: `$..$` LaTeX plus lightweight **bold** / *italic* markup. */
export function QuestionText({ text, className, block }: { text: string; className?: string; block?: boolean }) {
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  const Tag = block ? 'div' : 'span';
  return (
    <Tag className={cn('leading-relaxed', className)}>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith('$') && p.endsWith('$')) return <Latex key={i} text={p} />;
        return (
          <Fragment key={i}>
            {p.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\n)/g).map((s, j) => {
              if (s === '\n') return <br key={j} />;
              if (s.startsWith('**') && s.endsWith('**') && s.length > 4) return <strong key={j}>{s.slice(2, -2)}</strong>;
              if (s.startsWith('*') && s.endsWith('*') && s.length > 2) return <em key={j}>{s.slice(1, -1)}</em>;
              return <Fragment key={j}>{s}</Fragment>;
            })}
          </Fragment>
        );
      })}
    </Tag>
  );
}

export const DIFFICULTY_TONE: Record<Difficulty, Tone> = { easy: 'success', medium: 'warning', hard: 'danger' };

export function DifficultyBadge({ value }: { value: Difficulty }) {
  const { t } = useTranslation();
  return (
    <Badge tone={DIFFICULTY_TONE[value]} dot>
      {t(`difficulty.${value}`)}
    </Badge>
  );
}

/** Ordered question workflow (Draft → Review → Approved → Published → Archived). */
export const QUESTION_FLOW: QuestionStatus[] = ['draft', 'in_review', 'approved', 'published', 'archived'];

export function WorkflowSteps({ status }: { status: QuestionStatus }) {
  const { t } = useTranslation();
  const idx = QUESTION_FLOW.indexOf(status);
  return (
    <ol className="flex items-center gap-1">
      {QUESTION_FLOW.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            <span className={cn('h-0.5 flex-1 rounded', i === 0 ? 'opacity-0' : i <= idx ? 'bg-accent' : 'bg-line')} />
            <span
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ring-2',
                i < idx ? 'bg-accent text-white ring-accent' : i === idx ? 'bg-surface text-accent ring-accent' : 'bg-surface text-muted ring-line',
              )}
            >
              {i + 1}
            </span>
            <span className={cn('h-0.5 flex-1 rounded', i === QUESTION_FLOW.length - 1 ? 'opacity-0' : i < idx ? 'bg-accent' : 'bg-line')} />
          </div>
          <span className={cn('truncate text-[10px] font-medium', i === idx ? 'text-primary' : 'text-muted')}>{t(`status.${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}

// ─── Rich text field ─────────────────────────────────────────────────────────

const SNIPPETS: { label: string; insert: string; title: string }[] = [
  { label: 'a/b', insert: '$\\frac{a}{b}$', title: 'Fraction' },
  { label: '√', insert: '$\\sqrt{x}$', title: 'Square root' },
  { label: 'xⁿ', insert: '$x^{n}$', title: 'Power' },
  { label: 'xₙ', insert: '$x_{n}$', title: 'Subscript' },
  { label: '∫', insert: '$\\int_{a}^{b} f(x)\\,dx$', title: 'Integral' },
  { label: 'θ', insert: '$\\theta$', title: 'Theta' },
  { label: 'μ', insert: '$\\mu$', title: 'Mu' },
  { label: '⇌', insert: '$\\rightleftharpoons$', title: 'Equilibrium arrow' },
];

interface RichTextFieldProps {
  value: string;
  onChange: (v: string) => void;
  label?: ReactNode;
  error?: string;
  dir?: 'ltr' | 'rtl';
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  allowBlank?: boolean;
  required?: boolean;
  id?: string;
}

/** Textarea with a formatting toolbar (bold, italic, LaTeX snippets) and live rendered preview. */
export function RichTextField({ value, onChange, label, error, dir = 'ltr', rows = 4, placeholder, disabled, allowBlank, required, id }: RichTextFieldProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (before: string, after = '', fallback = '') => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || fallback;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = s + before.length + sel.length + after.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const tb = 'grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs font-semibold text-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-40';

  return (
    <Field label={label} error={error} required={required} htmlFor={id}>
      <div className={cn('overflow-hidden rounded-lg border bg-surface transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15', error ? 'border-danger' : 'border-line')}>
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2 px-1.5 py-1" role="toolbar" aria-label={t('questions.editor.toolbar')}>
          <button type="button" className={tb} disabled={disabled} onClick={() => apply('**', '**', 'bold')} title={t('questions.editor.bold')} aria-label={t('questions.editor.bold')}>
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={tb} disabled={disabled} onClick={() => apply('*', '*', 'italic')} title={t('questions.editor.italic')} aria-label={t('questions.editor.italic')}>
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={tb} disabled={disabled} onClick={() => apply('$', '$', 'x')} title={t('questions.editor.inlineMath')} aria-label={t('questions.editor.inlineMath')}>
            <Sigma className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-line" />
          {SNIPPETS.map((s) => (
            <button key={s.label} type="button" className={cn(tb, 'font-mono')} disabled={disabled} onClick={() => apply(s.insert)} title={s.title} dir="ltr">
              {s.label}
            </button>
          ))}
          {allowBlank && (
            <>
              <span className="mx-1 h-4 w-px bg-line" />
              <button type="button" className={cn(tb, 'px-2')} disabled={disabled} onClick={() => apply('______')}>
                {t('questions.editor.insertBlank')}
              </button>
            </>
          )}
        </div>
        <textarea
          id={id}
          ref={ref}
          dir={dir}
          rows={rows}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink outline-none placeholder:font-sans placeholder:text-muted/70 disabled:opacity-60"
        />
        {value.trim() && (
          <div dir={dir} className="border-t border-dashed border-line bg-surface-2/60 px-3 py-2 text-sm text-ink">
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">{t('common.preview')}</span>
            <QuestionText text={value} />
          </div>
        )}
      </div>
    </Field>
  );
}

// ─── Curriculum cascade ──────────────────────────────────────────────────────

interface CurriculumValue {
  subjectId: string;
  unitId: string;
  topicId: string;
}

export function CurriculumSelects({
  value,
  onChange,
  errors,
  disabled,
  layout = 'stack',
}: {
  value: CurriculumValue;
  onChange: (v: CurriculumValue) => void;
  errors?: Partial<Record<keyof CurriculumValue, string>>;
  disabled?: boolean;
  layout?: 'stack' | 'row';
}) {
  const { t } = useTranslation();
  const L = useLocalize();
  const subjects = useSubjects((s) => s.items);
  const units = useUnits((s) => s.items);
  const topics = useTopics((s) => s.items);
  const unitOpts = units.filter((u) => u.subjectId === value.subjectId).sort((a, b) => a.order - b.order);
  const topicOpts = topics.filter((tp) => tp.unitId === value.unitId).sort((a, b) => a.order - b.order);

  return (
    <div className={cn('grid gap-3', layout === 'row' && 'sm:grid-cols-3')}>
      <Field label={t('common.subject')} error={errors?.subjectId} required>
        <Select
          value={value.subjectId}
          disabled={disabled}
          invalid={!!errors?.subjectId}
          placeholder={t('questions.editor.selectSubject')}
          options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))}
          onChange={(e) => onChange({ subjectId: e.target.value, unitId: '', topicId: '' })}
        />
      </Field>
      <Field label={t('common.unit')} error={errors?.unitId} required>
        <Select
          value={value.unitId}
          disabled={disabled || !value.subjectId}
          invalid={!!errors?.unitId}
          placeholder={t('questions.editor.selectUnit')}
          options={unitOpts.map((u) => ({ value: u.id, label: `${u.order}. ${L(u, 'name')}` }))}
          onChange={(e) => onChange({ ...value, unitId: e.target.value, topicId: '' })}
        />
      </Field>
      <Field label={t('common.topic')} error={errors?.topicId} required>
        <Select
          value={value.topicId}
          disabled={disabled || !value.unitId}
          invalid={!!errors?.topicId}
          placeholder={t('questions.editor.selectTopic')}
          options={topicOpts.map((tp) => ({ value: tp.id, label: L(tp, 'name') }))}
          onChange={(e) => onChange({ ...value, topicId: e.target.value })}
        />
      </Field>
    </div>
  );
}

// ─── Options editor ──────────────────────────────────────────────────────────

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function defaultOptions(type: QuestionType, lang?: { trueEn: string; trueAr: string; falseEn: string; falseAr: string }): QuestionOption[] {
  if (type === 'true_false') {
    return [
      { id: uid('opt'), text_en: lang?.trueEn ?? 'True', text_ar: lang?.trueAr ?? 'صح', correct: true },
      { id: uid('opt'), text_en: lang?.falseEn ?? 'False', text_ar: lang?.falseAr ?? 'خطأ', correct: false },
    ];
  }
  if (type === 'fill_blank') return [{ id: uid('opt'), text_en: '', text_ar: '', correct: true }];
  return Array.from({ length: 4 }, (_, i) => ({ id: uid('opt'), text_en: '', text_ar: '', correct: i === 0 }));
}

export function OptionsEditor({
  type,
  options,
  onChange,
  error,
  disabled,
}: {
  type: QuestionType;
  options: QuestionOption[];
  onChange: (o: QuestionOption[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const set = (id: string, patch: Partial<QuestionOption>) => onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const markCorrect = (id: string) => onChange(options.map((o) => ({ ...o, correct: o.id === id })));
  const move = (i: number, d: -1 | 1) => {
    const next = [...options];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  if (type === 'fill_blank') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">{t('questions.editor.fillBlankHint')}</p>
        {options.map((o, i) => (
          <div key={o.id} className="grid gap-2 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={o.text_en} disabled={disabled} placeholder={t('questions.editor.acceptedAnswerEn')} aria-label={t('questions.editor.acceptedAnswerEn')} onChange={(e) => set(o.id, { text_en: e.target.value, correct: true })} />
            <Input dir="rtl" value={o.text_ar} disabled={disabled} placeholder={t('questions.editor.acceptedAnswerAr')} aria-label={t('questions.editor.acceptedAnswerAr')} onChange={(e) => set(o.id, { text_ar: e.target.value, correct: true })} />
            <Button variant="ghost" size="icon" disabled={disabled || options.length <= 1} onClick={() => onChange(options.filter((x) => x.id !== o.id))} aria-label={`${t('actions.remove')} ${i + 1}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" disabled={disabled || options.length >= 4} icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...options, { id: uid('opt'), text_en: '', text_ar: '', correct: true }])}>
          {t('questions.editor.addAccepted')}
        </Button>
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
    );
  }

  const fixed = type === 'true_false';
  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label={t('questions.editor.correctAnswer')} className="space-y-2.5">
        {options.map((o, i) => (
          <div key={o.id} className={cn('rounded-xl border p-3 transition-colors', o.correct ? 'border-success/50 bg-success/[0.05]' : 'border-line bg-surface')}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="radio"
                aria-checked={o.correct}
                disabled={disabled}
                onClick={() => markCorrect(o.id)}
                className={cn('mt-1 flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold transition', o.correct ? 'text-success' : 'text-muted hover:text-ink')}
                title={t('questions.editor.markCorrect')}
              >
                {o.correct ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                <span className="grid h-6 w-6 place-items-center rounded-md bg-ink/5 text-ink">{LETTERS[i]}</span>
              </button>
              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
                <Input value={o.text_en} disabled={disabled || fixed} placeholder={t('questions.editor.optionEn')} aria-label={`${t('questions.editor.optionEn')} ${LETTERS[i]}`} onChange={(e) => set(o.id, { text_en: e.target.value })} />
                <Input dir="rtl" value={o.text_ar} disabled={disabled || fixed} placeholder={t('questions.editor.optionAr')} aria-label={`${t('questions.editor.optionAr')} ${LETTERS[i]}`} onChange={(e) => set(o.id, { text_ar: e.target.value })} />
              </div>
              {!fixed && (
                <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
                  <Button variant="ghost" size="icon-sm" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={t('questions.editor.moveUp')}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={disabled || i === options.length - 1} onClick={() => move(i, 1)} aria-label={t('questions.editor.moveDown')}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled || options.length <= 2}
                    onClick={() => {
                      const next = options.filter((x) => x.id !== o.id);
                      if (o.correct && next.length) next[0] = { ...next[0], correct: true };
                      onChange(next);
                    }}
                    aria-label={`${t('actions.remove')} ${LETTERS[i]}`}
                    className="hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {(o.text_en.includes('$') || o.text_ar.includes('$')) && (
              <div className="mt-2 ps-[5.5rem] text-sm text-ink/80">
                <QuestionText text={o.text_en} />
              </div>
            )}
          </div>
        ))}
      </div>
      {!fixed && (
        <Button variant="secondary" size="sm" disabled={disabled || options.length >= 6} icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...options, { id: uid('opt'), text_en: '', text_ar: '', correct: false }])}>
          {t('questions.editor.addOption')}
        </Button>
      )}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

// ─── Student preview ─────────────────────────────────────────────────────────

type PreviewQuestion = Pick<Question, 'type' | 'body_en' | 'body_ar' | 'options' | 'image' | 'explanation_en' | 'explanation_ar' | 'subjectId'>;

/** Student-facing rendering of a question. Interactive unless `reveal` is set. */
export function QuestionPreview({ question, lang, reveal, compact }: { question: PreviewQuestion; lang: Lang; reveal?: boolean; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const tl = i18n.getFixedT(lang);
  const subjects = useSubjects((s) => s.items);
  const subject = subjects.find((s) => s.id === question.subjectId);
  const [selected, setSelected] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const body = lang === 'ar' ? question.body_ar : question.body_en;
  const text = (o: QuestionOption) => (lang === 'ar' ? o.text_ar || o.text_en : o.text_en || o.text_ar);
  const showResult = reveal || checked;

  const correctFill = useMemo(
    () => question.options.some((o) => [o.text_en, o.text_ar].some((x) => x.trim() && x.trim().toLowerCase() === typed.trim().toLowerCase())),
    [question.options, typed],
  );

  const reset = () => {
    setSelected(null);
    setTyped('');
    setChecked(false);
  };

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className={cn('overflow-hidden rounded-2xl border border-line bg-surface-2', lang === 'ar' && 'font-[Tajawal]')}>
      <div className="h-1" style={{ background: subject?.color ?? '#C9A24A' }} />
      <div className={cn('space-y-4', compact ? 'p-4' : 'p-5')}>
        <div className="flex items-center justify-between text-[11px] font-semibold text-muted">
          <span>{subject ? (lang === 'ar' ? subject.name_ar : subject.name_en) : ''}</span>
          <span>{tl('questions.preview.questionOf', { n: 1, total: 10 })}</span>
        </div>
        <div className="text-[15px] font-medium text-ink">{body.trim() ? <QuestionText text={body} block /> : <span className="text-muted">{tl('questions.preview.empty')}</span>}</div>
        {question.image && <Img src={question.image} alt="" className="h-40 w-full rounded-xl" />}

        {question.type === 'fill_blank' ? (
          <div className="space-y-2">
            <input
              value={reveal ? text(question.options[0] ?? { id: '', text_en: '', text_ar: '', correct: true }) : typed}
              readOnly={reveal}
              onChange={(e) => {
                setTyped(e.target.value);
                setChecked(false);
              }}
              placeholder={tl('questions.preview.typeAnswer')}
              aria-label={tl('questions.preview.typeAnswer')}
              className={cn('field', checked && (correctFill ? 'border-success' : 'border-danger'))}
            />
          </div>
        ) : (
          <div className={cn('grid gap-2', question.type === 'true_false' && 'grid-cols-2')}>
            {question.options.map((o, i) => {
              const isSel = selected === o.id;
              const state = showResult ? (o.correct ? 'correct' : isSel ? 'wrong' : 'idle') : isSel ? 'selected' : 'idle';
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={reveal}
                  onClick={() => {
                    setSelected(o.id);
                    setChecked(false);
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition',
                    state === 'correct' && 'border-success bg-success/10',
                    state === 'wrong' && 'border-danger bg-danger/10',
                    state === 'selected' && 'border-accent bg-accent/10',
                    state === 'idle' && 'border-line bg-surface hover:border-accent/50',
                    reveal && 'cursor-default',
                  )}
                >
                  <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', state === 'correct' ? 'bg-success text-white' : state === 'wrong' ? 'bg-danger text-white' : state === 'selected' ? 'bg-accent text-white' : 'bg-ink/5 text-muted')}>
                    {state === 'correct' ? <CheckCircle2 className="h-4 w-4" /> : state === 'wrong' ? <XCircle className="h-4 w-4" /> : LETTERS[i]}
                  </span>
                  <span className="min-w-0 flex-1">{text(o) ? <QuestionText text={text(o)} /> : <span className="text-muted">—</span>}</span>
                </button>
              );
            })}
          </div>
        )}

        {!reveal && (
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={question.type === 'fill_blank' ? !typed.trim() : !selected} onClick={() => setChecked(true)}>
              {tl('questions.preview.check')}
            </Button>
            {(checked || selected || typed) && (
              <Button size="sm" variant="ghost" onClick={reset}>
                {tl('actions.reset')}
              </Button>
            )}
            {checked && (
              <span className={cn('ms-auto text-xs font-semibold', (question.type === 'fill_blank' ? correctFill : question.options.find((o) => o.id === selected)?.correct) ? 'text-success' : 'text-danger')}>
                {(question.type === 'fill_blank' ? correctFill : question.options.find((o) => o.id === selected)?.correct) ? tl('questions.preview.correct') : tl('questions.preview.incorrect')}
              </span>
            )}
          </div>
        )}

        {showResult && (lang === 'ar' ? question.explanation_ar : question.explanation_en).trim() && (
          <div className="rounded-xl border border-info/20 bg-info/[0.06] p-3 text-sm text-ink/90">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-info">{tl('questions.fields.explanation')}</div>
            <QuestionText text={lang === 'ar' ? question.explanation_ar : question.explanation_en} />
          </div>
        )}
      </div>
      <span className="sr-only">{t('common.preview')}</span>
    </div>
  );
}

// ─── Validation & similarity ─────────────────────────────────────────────────

export type QuestionErrors = Partial<Record<'body_en' | 'body_ar' | 'subjectId' | 'unitId' | 'topicId' | 'options' | 'explanation_en' | 'explanation_ar' | 'year', string>>;

/** zod-backed validation; returns a field → message map (empty when valid). */
export function validateQuestion(q: Question, t: (k: string, o?: Record<string, unknown>) => string): QuestionErrors {
  const req = t('errors.required');
  const schema = z
    .object({
      body_en: z.string().trim().min(8, t('questions.validation.bodyShort')),
      body_ar: z.string().trim().min(5, t('questions.validation.bodyShort')),
      subjectId: z.string().min(1, req),
      unitId: z.string().min(1, req),
      topicId: z.string().min(1, req),
      explanation_en: z.string().trim().min(5, req),
      explanation_ar: z.string().trim().min(5, req),
      year: z.number().int().min(2000, t('errors.min', { min: 2000 })).max(2027, t('errors.max', { max: 2027 })).nullable(),
      type: z.enum(['mcq', 'true_false', 'fill_blank']),
      options: z.array(z.object({ text_en: z.string(), text_ar: z.string(), correct: z.boolean() })),
    })
    .superRefine((v, ctx) => {
      const opts = v.options;
      if (v.type === 'fill_blank') {
        if (!opts.some((o) => o.text_en.trim())) ctx.addIssue({ code: 'custom', path: ['options'], message: t('questions.validation.acceptedRequired') });
        return;
      }
      if (opts.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: t('questions.validation.minOptions') });
      if (opts.some((o) => !o.text_en.trim() || !o.text_ar.trim())) ctx.addIssue({ code: 'custom', path: ['options'], message: t('questions.validation.emptyOption') });
      if (opts.filter((o) => o.correct).length !== 1) ctx.addIssue({ code: 'custom', path: ['options'], message: t('questions.validation.oneCorrect') });
      const texts = opts.map((o) => o.text_en.trim().toLowerCase()).filter(Boolean);
      if (new Set(texts).size !== texts.length) ctx.addIssue({ code: 'custom', path: ['options'], message: t('questions.validation.duplicateOption') });
    });
  const res = schema.safeParse(q);
  if (res.success) return {};
  const out: QuestionErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path[0] as keyof QuestionErrors;
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/\$[^$]*\$/g, ' ').split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length > 2));

/** Token-overlap similarity (0–1) between two question stems, ignoring LaTeX. */
export function similarity(a: string, b: string) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => B.has(w) && inter++);
  return inter / (A.size + B.size - inter);
}

/** Questions in the same topic with a near-identical stem. */
export function findSimilar(q: Pick<Question, 'id' | 'topicId' | 'body_en'>, all: Question[], threshold = 0.72) {
  return all
    .filter((o) => o.id !== q.id && o.topicId === q.topicId)
    .map((o) => ({ q: o, score: similarity(q.body_en, o.body_en) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

export function emptyQuestion(authorId: string): Question {
  const now = new Date().toISOString();
  return {
    id: uid('q'),
    code: '',
    subjectId: '',
    unitId: '',
    topicId: '',
    type: 'mcq',
    difficulty: 'medium',
    body_en: '',
    body_ar: '',
    image: null,
    options: defaultOptions('mcq'),
    explanation_en: '',
    explanation_ar: '',
    tags: [],
    source: 'EDUWAY Original',
    year: null,
    status: 'draft',
    authorId,
    reviewerId: null,
    usageCount: 0,
    accuracy: 0,
    duplicateOf: null,
    reviewComment: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Next sequential code like `PHYS-CA-0151`. */
export function nextQuestionCode(all: Question[], subjectKey: string, unitName: string) {
  const SUBJ: Record<string, string> = { math: 'MATH', physics: 'PHYS', chemistry: 'CHEM', biology: 'BIO', english: 'ENG' };
  const words = unitName.split(/\s+/).filter((w) => !['&', 'and', 'of'].includes(w.toLowerCase()));
  const abbr = words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.map((w) => w[0]).join('').toUpperCase();
  const max = all.reduce((m, q) => Math.max(m, Number(q.code.split('-').pop()) || 0), 0);
  return `${SUBJ[subjectKey] ?? 'GEN'}-${abbr}-${String(max + 1).padStart(4, '0')}`;
}

export function TextareaField(props: ComponentProps<typeof Textarea> & { label: ReactNode; error?: string; required?: boolean }) {
  const { label, error, required, ...rest } = props;
  return (
    <Field label={label} error={error} required={required}>
      <Textarea invalid={!!error} {...rest} />
    </Field>
  );
}
