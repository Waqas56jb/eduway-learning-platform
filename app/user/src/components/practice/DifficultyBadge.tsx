import { memo } from 'react';
import { Badge } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { Difficulty } from '@/types';

const TONE: Record<Difficulty, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

export const DifficultyBadge = memo(function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const { t } = useI18n('practice');
  return <Badge label={t(`common:difficulty.${difficulty}`)} tone={TONE[difficulty]} size="sm" />;
});

export const difficultyTone = TONE;
