import type { IconName } from '@/components/icons';
import type { PaymentMethodDto } from '@/api/types';
import type { Localized } from '@/types';

/** Gateway id from the server (`zaincash | fastpay | qicard | asiahawala | visa | mock`). */
export type PaymentMethodId = string;
export type PaymentMethodKind = 'wallet' | 'card';

export interface PaymentMethod {
  id: PaymentMethodId;
  kind: PaymentMethodKind;
  icon: IconName;
  /** Brand tint used for the method badge. */
  color: string;
  /** Short monogram shown inside the badge (Latin brand initials, rendered LTR). */
  mark: string;
  /** Server display name / hint (PUB-09); i18n `methods.<id>` is used when absent. */
  name?: Localized;
  hint?: Localized;
  /** Wallet MSISDN is collected by our UI (never PINs or card numbers). */
  requiresPhone?: boolean;
  flow?: PaymentMethodDto['flow'];
  /** Gateway runs in its official test environment (no real money) — shows the "Sandbox / test mode" badge. */
  sandbox?: boolean;
}

/** Brand presentation per gateway id (visual only — the list itself comes from the server). */
const VISUALS: Record<string, Pick<PaymentMethod, 'icon' | 'color' | 'mark'>> = {
  zaincash: { icon: 'wallet', color: '#C2185B', mark: 'ZC' },
  fastpay: { icon: 'wallet', color: '#E53935', mark: 'FP' },
  asiahawala: { icon: 'wallet', color: '#0F766E', mark: 'AH' },
  qicard: { icon: 'card', color: '#1D4ED8', mark: 'Qi' },
  visa: { icon: 'card', color: '#1A1F71', mark: 'VISA' },
  mock: { icon: 'card', color: '#0B1F3A', mark: 'DEV' },
};

/** PaymentMethodDto (PUB-09 / PAY-11) → card model. */
export function toPaymentMethod(dto: PaymentMethodDto): PaymentMethod {
  const visual = VISUALS[dto.id] ?? {
    icon: dto.kind === 'card' ? 'card' : 'wallet',
    color: dto.color || '#0B1F3A',
    mark: dto.id.slice(0, 2).toUpperCase(),
  };
  return {
    id: dto.id,
    kind: dto.kind,
    ...visual,
    color: VISUALS[dto.id]?.color ?? dto.color ?? visual.color,
    name: dto.name,
    hint: dto.hint,
    requiresPhone: dto.requiresPhone,
    flow: dto.flow,
    sandbox: dto.sandbox === true,
  };
}

/** Minimal model for a gateway id when only the id is known (e.g. receipt screen). */
export function methodFromId(id: string | undefined): PaymentMethod | undefined {
  if (!id) return undefined;
  const v = VISUALS[id];
  return v ? { id, kind: v.icon === 'wallet' ? 'wallet' : 'card', ...v } : undefined;
}

/** Display name: server name when known, else the i18n label. */
export function methodLabel(method: PaymentMethod, t: (k: string) => string, L: (v: Localized) => string): string {
  const name = method.name ? L(method.name) : '';
  return name || t(`methods.${method.id}`);
}

/** Yearly saving vs. paying monthly for 12 months (rounded %). */
export function yearlySavingPercent(priceMonthly: number, priceYearly: number): number {
  const full = priceMonthly * 12;
  return full > 0 ? Math.round(((full - priceYearly) / full) * 100) : 0;
}
