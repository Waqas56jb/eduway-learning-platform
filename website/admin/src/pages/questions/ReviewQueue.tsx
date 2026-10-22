import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Copy, ExternalLink, Inbox, Keyboard, ShieldAlert, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Lang } from '@/types';
import { cn } from '@/utils/cn';
import { fmtNumber, fmtRelative } from '@/utils/format';
import { useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/store/auth';
import { useLang, useLocalize } from '@/hooks/useLocale';
import { errorMessage } from '@/api/client';
import { useApiQuery } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useLookups } from '@/api/lookups';
import { questionsApi, type QuestionVM } from '@/api/questions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, FilterSelect, Segmented, Skeleton, StatCard, Textarea } from '@/components/ui';
import { DifficultyBadge, QuestionPreview, QuestionText } from '@/components/forms/QuestionForm';

export default function ReviewQueue() {
  const { t } = useTranslation();
  const L = useLocalize();
  const can = useCan();
  const uiLang = useLang();
  const qc = useQueryClient();
  const subjects = useLookups().subjects;
  const canApprove = can('questions', 'approve');

  const [subject, setSubject] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const [session, setSession] = useState({ approved: 0, rejected: 0 });
  const listRef = useRef<HTMLUListElement>(null);
  const [deciding, setDeciding] = useState(false);
  const queueKey = qk.questions.sub('review-queue', subject);
  const queueQ = useApiQuery(queueKey, () => questionsApi.reviewQueue({ subjectId: subject || undefined }));
  const loading = queueQ.isLoading;
  const pendingTotal = useApiQuery(qk.questions.sub('stats'), questionsApi.stats).data?.inReview;

  const queue = useMemo<QuestionVM[]>(() => [...(queueQ.data?.items ?? [])].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)), [queueQ.data]);
  const current = queue.find((q) => q.id === selectedId) ?? queue[0];
  const currentIdx = current ? queue.indexOf(current) : -1;
  const duplicateOf = current?.duplicateOf
    ? { code: current.duplicateCode ?? '', body_en: current.similar?.body.en ?? '', body_ar: current.similar?.body.ar ?? '' }
    : current?.similar
      ? { code: current.similar.code, body_en: current.similar.body.en, body_ar: current.similar.body.ar }
      : undefined;

  useEffect(() => {
    setComment('');
    setCommentError(false);
  }, [current?.id]);

  const nameOf = (q: QuestionVM) => (q.author ? q.author.name[uiLang] : '—');

  const goto = (i: number) => {
    const next = queue[Math.max(0, Math.min(queue.length - 1, i))];
    if (next) {
      setSelectedId(next.id);
      listRef.current?.querySelector<HTMLElement>(`[data-qid="${next.id}"]`)?.focus();
    }
  };

  const decide = async (approve: boolean) => {
    if (!current || !canApprove || deciding) return;
    if (!approve && comment.trim().length < 5) {
      setCommentError(true);
      toast.error(t('questions.review.commentRequired'));
      return;
    }
    const nextId = queue[currentIdx + 1]?.id ?? queue[currentIdx - 1]?.id ?? null;
    setDeciding(true);
    try {
      await questionsApi.transition(current.id, {
        to: approve ? 'approved' : 'draft',
        action: approve ? 'approve' : 'reject',
        comment: comment.trim() || undefined,
      });
      // Optimistically drop it from the queue, then resync.
      qc.setQueryData(queueKey, (old: typeof queueQ.data) => (old ? { ...old, items: old.items.filter((x) => x.id !== current.id) } : old));
      setSession((s) => (approve ? { ...s, approved: s.approved + 1 } : { ...s, rejected: s.rejected + 1 }));
      toast.success(approve ? t('questions.toast.approved') : t('questions.toast.rejected'));
      setSelectedId(nextId);
      qc.invalidateQueries({ queryKey: qk.questions.all });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeciding(false);
    }
  };

  // Keyboard shortcuts: J/K or arrows to move, A approve, R reject (focus comment).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        goto(currentIdx + 1);
      } else if (k === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        goto(currentIdx - 1);
      } else if (k === 'a') {
        e.preventDefault();
        decide(true);
      } else if (k === 'r') {
        e.preventDefault();
        document.getElementById('review-comment')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <PageHeader title={t('questions.review.title')} subtitle={t('questions.review.subtitle')} />

      {!canApprove && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm text-ink">
          <ShieldAlert className="h-4 w-4 text-warning" /> {t('questions.review.noPermission')}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard loading={loading} label={t('questions.review.pending')} value={fmtNumber(pendingTotal ?? queueQ.data?.meta.total ?? queue.length)} icon={<Inbox />} color="#F59E0B" hint={t('questions.review.pendingHint')} />
        <StatCard loading={loading} label={t('questions.review.approvedSession')} value={fmtNumber(session.approved)} icon={<CheckCircle2 />} color="#16A34A" hint={t('questions.review.thisSession')} />
        <StatCard loading={loading} label={t('questions.review.rejectedSession')} value={fmtNumber(session.rejected)} icon={<XCircle />} color="#DC2626" hint={t('questions.review.thisSession')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        {/* Queue */}
        <Card className="flex max-h-[calc(100vh-14rem)] min-h-[24rem] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">
              {t('questions.review.queue')} <span className="text-muted num">({queue.length})</span>
            </span>
            <FilterSelect label={t('common.subject')} value={subject} onChange={setSubject} options={subjects.map((s) => ({ value: s.id, label: L(s, 'name') }))} />
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : queueQ.isError ? (
            <EmptyState title={t('api.loadFailed')} hint={errorMessage(queueQ.error)} action={<Button size="sm" variant="secondary" onClick={() => queueQ.refetch()}>{t('api.retry')}</Button>} />
          ) : queue.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-12 w-12 text-success" />} title={t('questions.review.emptyTitle')} hint={t('questions.review.emptyHint')} />
          ) : (
            <ul ref={listRef} className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2" aria-label={t('questions.review.queue')}>
              {queue.map((q) => {
                const s = q.subject;
                const active = q.id === current?.id;
                return (
                  <li key={q.id}>
                    <button
                      data-qid={q.id}
                      onClick={() => setSelectedId(q.id)}
                      aria-current={active || undefined}
                      className={cn('w-full rounded-lg border px-3 py-2.5 text-start transition', active ? 'border-accent/60 bg-accent/[0.07]' : 'border-transparent hover:bg-ink/[0.03]')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-primary" dir="ltr">
                          {q.code}
                        </span>
                        <span className="text-[10px] text-muted">{fmtRelative(q.updatedAt)}</span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[13px] text-ink">
                        <QuestionText text={L(q, 'body')} />
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s?.color }} />
                        {s?.name[uiLang]} · {nameOf(q)}
                        {(q.duplicateOf || q.similar) && (
                          <Badge tone="warning" className="ms-auto">
                            {t('questions.review.dup')}
                          </Badge>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-muted">
            <Keyboard className="h-3.5 w-3.5" /> {t('questions.review.shortcuts')}
          </div>
        </Card>

        {/* Detail */}
        {loading ? (
          <Skeleton className="h-[32rem] rounded-xl" />
        ) : !current ? (
          <Card>
            <EmptyState icon={<CheckCircle2 className="h-12 w-12 text-success" />} title={t('questions.review.allDone')} hint={t('questions.review.allDoneHint')} />
          </Card>
        ) : (
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono" dir="ltr">
                      {current.code}
                    </span>
                    <DifficultyBadge value={current.difficulty} />
                    <Badge tone="navy">{t(`questions.types.${current.type}`)}</Badge>
                  </span>
                }
                subtitle={`${current.subject?.name[uiLang] ?? ''} › ${current.topic?.name[uiLang] ?? ''}`}
                action={
                  <>
                    <Segmented size="sm" aria-label={t('common.language')} value={lang} onChange={setLang} options={[{ value: 'en', label: 'EN' }, { value: 'ar', label: 'ع' }]} />
                    <Link to={`/questions/${current.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" aria-label={t('questions.review.openEditor')} title={t('questions.review.openEditor')}>
                      <ExternalLink className="h-4 w-4 flip-rtl" />
                    </Link>
                  </>
                }
              />
              <CardBody className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_14rem]">
                <QuestionPreview key={`${current.id}-${lang}`} question={current} lang={lang} reveal />
                <dl className="space-y-3 text-xs">
                  <div>
                    <dt className="text-muted">{t('questions.fields.author')}</dt>
                    <dd className="mt-1 flex items-center gap-2 font-medium text-ink">
                      <Avatar name={nameOf(current)} src={current.author?.avatarUrl ?? undefined} size="xs" />
                      {nameOf(current)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('questions.review.submitted')}</dt>
                    <dd className="mt-1 font-medium text-ink">{fmtRelative(current.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('questions.fields.source')}</dt>
                    <dd className="mt-1 font-medium text-ink">
                      {t(`questions.sources.${current.source.replace(/\s+/g, '')}`, { defaultValue: current.source })}
                      {current.year ? ` · ${current.year}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('questions.fields.tags')}</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {current.tags.map((tag) => (
                        <span key={tag} className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium" dir="ltr">
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>

            {duplicateOf && (
              <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/[0.06] p-4 text-sm">
                <Copy className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{t('questions.review.duplicateWarning', { code: duplicateOf.code })}</div>
                  <div className="mt-1 line-clamp-2 text-ink/75">
                    <QuestionText text={L(duplicateOf, 'body')} />
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardBody className="space-y-4">
                <Field label={t('questions.review.comment')} hint={t('questions.review.commentHint')} error={commentError ? t('questions.review.commentRequired') : undefined} htmlFor="review-comment">
                  <Textarea
                    id="review-comment"
                    rows={3}
                    value={comment}
                    disabled={!canApprove}
                    invalid={commentError}
                    placeholder={t('questions.review.commentPlaceholder')}
                    onChange={(e) => {
                      setComment(e.target.value);
                      setCommentError(false);
                    }}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="success" loading={deciding} icon={<CheckCircle2 className="h-4 w-4" />} disabled={!canApprove} onClick={() => decide(true)}>
                    {t('actions.approve')} <kbd className="ms-1 rounded bg-white/20 px-1 text-[10px]">A</kbd>
                  </Button>
                  <Button variant="secondary" disabled={!canApprove || deciding} icon={<XCircle className="h-4 w-4 text-danger" />} onClick={() => decide(false)}>
                    {t('actions.reject')}
                  </Button>
                  <span className="ms-auto text-xs text-muted num">{t('questions.review.position', { n: currentIdx + 1, total: queue.length })}</span>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
