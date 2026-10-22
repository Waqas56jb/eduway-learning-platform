import { AlertTriangle, Database, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLocale';
import {
  useKnowledgeBase,
  useReindexKnowledgeBase,
  type KbRunStatus,
  type KbSourceType,
} from '@/api/aiTutor';
import { fmtDateTime, fmtNumber, fmtRelative } from '@/utils/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
  SkeletonCard,
  useConfirm,
} from '@/components/ui';
import { QueryError } from '@/components/ui/QueryError';

const TYPES: KbSourceType[] = ['lesson', 'unit', 'topic', 'question_explanation', 'faq'];
const STATUS_TONE: Record<KbRunStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  queued: 'neutral',
  running: 'info',
  completed: 'success',
  failed: 'danger',
  skipped: 'warning',
};

/** AI settings → Knowledge base (RAG index): status, per-type counts, last run + "Reindex" (ADM-AI-16/17). */
export function KnowledgeBaseCard({ editable }: { editable: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const confirm = useConfirm();
  const kbQ = useKnowledgeBase();
  const reindex = useReindexKnowledgeBase();
  const kb = kbQ.data;
  const run = kb?.lastRun ?? null;
  const busy = !!kb?.running || reindex.isPending;

  const onForce = async () => {
    const ok = await confirm({
      title: t('aitutor.kb.confirmForceTitle'),
      body: t('aitutor.kb.confirmForceBody'),
      confirmText: t('aitutor.kb.forceReindex'),
    });
    if (ok) reindex.mutate(true);
  };

  if (kbQ.isLoading) return <SkeletonCard lines={5} className="xl:col-span-2" />;
  if (!kb) {
    return (
      <div className="xl:col-span-2">
        <QueryError error={kbQ.error} onRetry={() => kbQ.refetch()} />
      </div>
    );
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title={t('aitutor.kb.title')}
        subtitle={t('aitutor.kb.subtitle')}
        icon={<Database className="h-4 w-4" />}
        action={
          editable ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || !kb.available}
                onClick={onForce}
              >
                {t('aitutor.kb.forceReindex')}
              </Button>
              <Button
                size="sm"
                icon={<RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
                disabled={busy || !kb.available}
                loading={reindex.isPending}
                onClick={() => reindex.mutate(false)}
              >
                {busy ? t('aitutor.kb.reindexing') : t('aitutor.kb.reindex')}
              </Button>
            </>
          ) : undefined
        }
      />
      <CardBody className="space-y-5">
        {!kb.available && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-ink/80">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            {t('aitutor.kb.unavailable')}
          </p>
        )}
        {kb.available && !kb.realEmbeddings && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            {t('aitutor.kb.mockEmbeddings')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: t('aitutor.kb.sources'), value: fmtNumber(kb.totals.sources) },
            { label: t('aitutor.kb.chunks'), value: fmtNumber(kb.totals.chunks) },
            { label: t('aitutor.kb.tokens'), value: fmtNumber(kb.totals.tokens) },
            {
              label: t('aitutor.kb.lastIndexed'),
              value: kb.lastIndexedAt ? fmtRelative(kb.lastIndexedAt) : t('aitutor.kb.never'),
              title: kb.lastIndexedAt ? fmtDateTime(kb.lastIndexedAt) : undefined,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-line px-3 py-2.5" title={s.title}>
              <div className="text-[11px] text-muted">{s.label}</div>
              <div className="num mt-0.5 truncate text-base font-semibold">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <Badge key={type} tone="neutral">
              {t(`aitutor.kb.types.${type}`)}:{' '}
              <span className="num ms-1">{fmtNumber(kb.totals.byType[type]?.sources ?? 0)}</span>
            </Badge>
          ))}
          <Badge tone="slate">
            {t('aitutor.kb.model')}: <span className="ms-1" dir="ltr">{kb.embeddingModel}</span>
          </Badge>
        </div>

        {run && (
          <div className="space-y-2 rounded-lg border border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">{t('aitutor.kb.lastRun')}</span>
              <Badge tone={STATUS_TONE[run.status]} dot>
                {t(`aitutor.kb.runStatus.${run.status}`)}
              </Badge>
              <span className="text-muted">{t(`aitutor.kb.trigger.${run.trigger}`)}</span>
              {run.requestedBy && (
                <span className="text-muted">
                  {t('aitutor.kb.by', { name: run.requestedBy.name[lang] || run.requestedBy.name.en })}
                </span>
              )}
              <span className="ms-auto text-muted" title={fmtDateTime(run.createdAt)}>
                {fmtRelative(run.finishedAt ?? run.createdAt)}
              </span>
            </div>
            {(run.status === 'running' || run.status === 'queued') && (
              <ProgressBar value={run.progressPct} label={t('aitutor.kb.reindexing')} />
            )}
            <p className="num text-xs text-muted">
              {t('aitutor.kb.runSummary', {
                embedded: fmtNumber(run.chunksEmbedded),
                unchanged: fmtNumber(run.chunksUnchanged),
                deleted: fmtNumber(run.chunksDeleted),
              })}
              {' · '}
              {t('aitutor.kb.tokens')}: {fmtNumber(run.tokens)} · {t('aitutor.kb.cost')}: $
              {fmtNumber(run.costUsd, { maximumFractionDigits: 4 })}
            </p>
            {run.error && (
              <p className="text-xs text-danger" dir="ltr">
                {run.error}
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-muted">{t('aitutor.kb.autoNote')}</p>
      </CardBody>
    </Card>
  );
}
