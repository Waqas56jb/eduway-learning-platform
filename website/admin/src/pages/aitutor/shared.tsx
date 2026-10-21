import { useTranslation } from 'react-i18next';
import type { AiFlaggedConversation } from '@/types';
import { Badge, type Tone } from '@/components/ui/Badge';

export const SEVERITY_TONE: Record<AiFlaggedConversation['severity'], Tone> = { low: 'neutral', medium: 'warning', high: 'danger' };

export const REASON_TONE: Record<AiFlaggedConversation['reason'], Tone> = {
  off_topic: 'slate',
  abuse: 'warning',
  cheating: 'danger',
  prompt_injection: 'purple',
  self_harm: 'danger',
};

export function SeverityBadge({ severity }: { severity: AiFlaggedConversation['severity'] }) {
  const { t } = useTranslation();
  return (
    <Badge tone={SEVERITY_TONE[severity]} dot>
      {t(`aitutor.severity.${severity}`)}
    </Badge>
  );
}

export function ReasonBadge({ reason }: { reason: AiFlaggedConversation['reason'] }) {
  const { t } = useTranslation();
  return <Badge tone={REASON_TONE[reason]}>{t(`aitutor.reasons.${reason}`)}</Badge>;
}

/** Subject id → subject key (for `subjects.*` labels and colours). */
export const SUBJECT_KEY: Record<string, 'math' | 'physics' | 'chemistry' | 'biology' | 'english'> = {
  sub_math: 'math',
  sub_phys: 'physics',
  sub_chem: 'chemistry',
  sub_bio: 'biology',
  sub_eng: 'english',
};
