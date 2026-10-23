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
  /** live | sandbox | mock | disabled (PUB-09). `mock` = dev MockGateway; live/sandbox = the gateway's hosted page. */
  mode?: PaymentMethodDto['mode'];
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
    mode: dto.mode,
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

/** Dev MockGateway (simulated in-app form) vs a real gateway that hosts its own payment page (live or sandbox). */
export const isSimulatedMethod = (m: Pick<PaymentMethod, 'flow' | 'mode'>) => m.flow === 'mock' || m.mode === 'mock';

/** Only gateways the server can take a payment with: switched on by the admin and not `disabled`. */
export const isSelectableMethod = (dto: Pick<PaymentMethodDto, 'enabled' | 'mode'>) => dto.enabled && dto.mode !== 'disabled';

/** Arabic-Indic (U+0660–9) / Persian (U+06F0–9) digit → ASCII; anything else unchanged. */
const asciiDigit = (c: string) => {
  const k = c.charCodeAt(0);
  if (k >= 0x0660 && k <= 0x0669) return String(k - 0x0660);
  if (k >= 0x06f0 && k <= 0x06f9) return String(k - 0x06f0);
  return c;
};

/**
 * Iraqi mobile-wallet number (ZainCash / FastPay / AsiaHawala are Iraqi-only) in any common form —
 * 07XXXXXXXXX, 7XXXXXXXXX, 9647…, +964 7…, 00964…, spaces / dashes, Arabic-Indic digits — → "07XXXXXXXXX",
 * or null when it isn't one. The server applies the same rule.
 */
export function iraqiWalletLocal(input: string | null | undefined): string | null {
  const d = Array.from(input ?? '', asciiDigit).join('').replace(/\D/g, '');
  const intl = d.startsWith('00964') ? d.slice(2) : d.startsWith('964') ? d : d.startsWith('07') && d.length === 11 ? `964${d.slice(1)}` : d.startsWith('7') && d.length === 10 ? `964${d}` : d;
  return /^9647\d{9}$/.test(intl) ? `0${intl.slice(3)}` : null;
}

/** Customer test wallets published by ZainCash for its UAT sandbox (docs.zaincash.iq → Test Credentials; PIN 1111, OTP 111111). */
export const SANDBOX_TEST_WALLETS: Record<string, string[]> = {
  zaincash: ['07802999569', '07829744432', '07829744464', '07829744474'],
};
