import { useId, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { fmtNumber } from '@/utils/format';
import { Skeleton } from './Feedback';

interface KpiTrendProps {
  delta: number; // percent change
  /** When true, a decrease is good (e.g. refunds, errors). */
  inverse?: boolean;
  className?: string;
}

/** Up/down percentage chip. */
export function KpiTrend({ delta, inverse, className }: KpiTrendProps) {
  const flat = Math.abs(delta) < 0.05;
  const up = delta > 0;
  const good = flat ? null : inverse ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold num',
        good === null ? 'bg-ink/5 text-muted' : good ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {fmtNumber(Math.abs(delta), { maximumFractionDigits: 1 })}%
    </span>
  );
}

interface SparklineProps {
  data: number[];
  color?: string;
  className?: string;
  height?: number;
}

/** Dependency-free SVG sparkline (scales to its container width). */
export function Sparkline({ data, color = '#C9A24A', className, height = 36 }: SparklineProps) {
  const id = 'spk' + useId().replace(/[^a-zA-Z0-9]/g, '');
  if (data.length < 2) return null;
  const w = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn('w-full rtl:-scale-x-100', className)} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  delta?: number;
  inverse?: boolean;
  icon?: ReactNode;
  trend?: number[];
  color?: string;
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, delta, inverse, icon, trend, color = '#C9A24A', hint, loading, className, onClick }: StatCardProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className={cn('card p-4', className)} aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-28" />
        <Skeleton className="mt-4 h-8 w-full" />
      </div>
    );
  }
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'card group relative overflow-hidden p-4 text-start transition-all duration-200',
        onClick && 'hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-soft',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4" style={{ background: `${color}1A`, color }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="kpi-num text-[1.65rem] leading-tight text-primary">{value}</span>
        {delta !== undefined && <KpiTrend delta={delta} inverse={inverse} />}
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{hint ?? (delta !== undefined ? t('common.vsPrevious') : ' ')}</p>
      {trend && <Sparkline data={trend} color={color} className="mt-2" />}
    </Comp>
  );
}
