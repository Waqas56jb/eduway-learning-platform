import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/api/client';
import { cn } from '@/utils/cn';
import { Button } from './Button';
import { EmptyState } from './Feedback';

/** Load-error state for cards/pages driven by react-query (tables use DataTable's `error`/`onRetry`). */
export function QueryError({ error, onRetry, compact, className }: { error: unknown; onRetry?: () => void; compact?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn(!compact && 'card', className)}>
      <EmptyState
        compact={compact}
        icon={<AlertTriangle className="h-6 w-6 text-danger" />}
        title={t('api.loadFailed')}
        hint={errorMessage(error)}
        action={
          onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('api.retry')}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
