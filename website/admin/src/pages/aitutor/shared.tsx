import { useTranslation } from 'react-i18next';
import type { AiFlagReason, AiSeverity } from '@/api/aiTutor';
import { Badge, type Tone } from '@/components/ui/Badge';

export const SEVERITY_TONE: Record<AiSeverity, Tone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};

export const REASON_TONE: Record<AiFlagReason, Tone> = {
  off_topic: 'slate',
  abuse: 'warning',
  cheating: 'danger',
  prompt_injection: 'purple',
  self_harm: 'danger',
};

export function SeverityBadge({ severity }: { severity: AiSeverity }) {
  const { t } = useTranslation();
  return (
    <Badge tone={SEVERITY_TONE[severity]} dot>
      {t(`aitutor.severity.${severity}`)}
    </Badge>
  );
}

export function ReasonBadge({ reason }: { reason: AiFlagReason }) {
  const { t } = useTranslation();
  return <Badge tone={REASON_TONE[reason]}>{t(`aitutor.reasons.${reason}`)}</Badge>;
}
