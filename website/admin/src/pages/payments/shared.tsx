import { useTranslation } from 'react-i18next';
import type { TxnStatus } from '@/types';
import type { GatewayId } from '@/api/payments';
import { cn } from '@/utils/cn';

export const GATEWAYS: GatewayId[] = ['zaincash', 'fastpay', 'qicard', 'asiahawala', 'visa'];

/** Brand-ish colours per gateway (display only — fee rates live in Settings → Payments). */
export const GATEWAY_COLOR: Record<GatewayId, string> = {
  zaincash: '#E0115F',
  fastpay: '#E5481B',
  qicard: '#0E7C3A',
  asiahawala: '#D21F3C',
  visa: '#1A1F71',
  mock: '#64748B',
};

const GATEWAY_MARK: Record<GatewayId, string> = { zaincash: 'ZC', fastpay: 'FP', qicard: 'Qi', asiahawala: 'AH', visa: 'V', mock: 'M' };

export function GatewayChip({ gateway, className }: { gateway: GatewayId; className?: string }) {
  const { t } = useTranslation();
  const c = GATEWAY_COLOR[gateway] ?? '#64748B';
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink/80', className)}>
      <span className="grid h-5 min-w-5 place-items-center rounded px-1 text-[9px] font-bold text-white" style={{ background: c }} aria-hidden>
        {GATEWAY_MARK[gateway] ?? gateway.slice(0, 2).toUpperCase()}
      </span>
      {t(`payments.gateways.${gateway}`, { defaultValue: gateway })}
    </span>
  );
}

/** Statuses counted as money actually captured. */
export const CAPTURED: TxnStatus[] = ['paid', 'refunded', 'partially_refunded'];
