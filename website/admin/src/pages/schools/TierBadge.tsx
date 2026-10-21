import { GraduationCap } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui';

export const TIER_TONE: Record<string, Tone> = { Bronze: 'accent', Silver: 'slate', Gold: 'warning', Platinum: 'purple' };

export function TierBadge({ tier }: { tier: string }) {
  return (
    <Badge tone={TIER_TONE[tier] ?? 'neutral'} icon={<GraduationCap className="h-3 w-3" />}>
      {tier}
    </Badge>
  );
}
