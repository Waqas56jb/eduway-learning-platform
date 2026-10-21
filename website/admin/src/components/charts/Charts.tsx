import { useId, type ReactNode } from 'react';
import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/utils/cn';
import { fmtCompact, fmtNumber } from '@/utils/format';
import { useElementSize } from '@/hooks/useMisc';
import { useIsRtl } from '@/hooks/useLocale';
import { useUi } from '@/store/ui';
import { Skeleton } from '@/components/ui/Feedback';

export interface Series {
  key: string;
  label: string;
  color: string;
}

/** Brand categorical palette for charts. */
export const CHART_COLORS = ['#0B1F3A', '#C9A24A', '#2563EB', '#059669', '#DB2777', '#7C3AED', '#EA580C', '#64748B'];

function useChartTheme() {
  const dark = useUi((s) => s.theme === 'dark');
  return {
    grid: dark ? '#1f2c44' : '#ece8df',
    axis: dark ? '#7d8aa3' : '#8b8f98',
    tooltipBg: dark ? '#111a2b' : '#ffffff',
    tooltipBorder: dark ? '#243148' : '#e5e1d8',
    ink: dark ? '#e5e9f0' : '#111827',
    /** Navy series are invisible on dark backgrounds — swap for a light navy. */
    fix: (c: string) => (dark && c.toUpperCase() === '#0B1F3A' ? '#9DB4D9' : c),
  };
}

/** Measures the container and renders the chart only once it has a width. */
function Frame({ height, loading, children, className }: { height: number; loading?: boolean; className?: string; children: (w: number) => ReactNode }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  return (
    <div ref={ref} className={cn('w-full min-w-0', className)} style={{ height }}>
      {loading ? <Skeleton className="h-full w-full rounded-lg" /> : size.width > 0 ? children(size.width) : null}
    </div>
  );
}

type Fmt = (v: number) => string;

function ChartTooltip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color: string; payload: Record<string, unknown> }[]; label?: string; fmt: Fmt; labelFmt?: (l: string) => string }) {
  const th = useChartTheme();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lift" style={{ background: th.tooltipBg, borderColor: th.tooltipBorder, color: th.ink }}>
      {label !== undefined && <div className="mb-1 font-semibold">{labelFmt ? labelFmt(String(label)) : label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="opacity-70">{p.name}</span>
          <span className="ms-auto ps-4 font-semibold num">{fmt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

interface CartesianProps<T> {
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  height?: number;
  loading?: boolean;
  valueFormat?: Fmt;
  xFormat?: (v: string) => string;
  stacked?: boolean;
  legend?: boolean;
  className?: string;
}

const axisProps = (color: string) => ({ tick: { fill: color, fontSize: 11 }, tickLine: false, axisLine: false });

export function AreaChart<T>({ data, xKey, series, height = 280, loading, valueFormat = fmtCompact, xFormat, stacked, legend = true, className }: CartesianProps<T>) {
  const th = useChartTheme();
  const rtl = useIsRtl();
  const uid = 'a' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Frame height={height} loading={loading} className={className}>
      {(w) => (
        <RAreaChart width={w} height={height} data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={th.fix(s.color)} stopOpacity={0.28} />
                <stop offset="100%" stopColor={th.fix(s.color)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={th.grid} vertical={false} />
          <XAxis dataKey={xKey} reversed={rtl} tickFormatter={xFormat} {...axisProps(th.axis)} minTickGap={16} />
          <YAxis orientation={rtl ? 'right' : 'left'} tickFormatter={valueFormat} {...axisProps(th.axis)} width={52} />
          <Tooltip content={<ChartTooltip fmt={valueFormat} labelFmt={xFormat} />} cursor={{ stroke: th.axis, strokeDasharray: '4 4' }} />
          {legend && series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: th.axis }} />}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={th.fix(s.color)}
              strokeWidth={2}
              fill={`url(#${uid}${s.key})`}
              stackId={stacked ? '1' : undefined}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </RAreaChart>
      )}
    </Frame>
  );
}

export function LineChart<T>({ data, xKey, series, height = 280, loading, valueFormat = fmtCompact, xFormat, legend = true, className }: CartesianProps<T>) {
  const th = useChartTheme();
  const rtl = useIsRtl();
  return (
    <Frame height={height} loading={loading} className={className}>
      {(w) => (
        <RLineChart width={w} height={height} data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={th.grid} vertical={false} />
          <XAxis dataKey={xKey} reversed={rtl} tickFormatter={xFormat} {...axisProps(th.axis)} minTickGap={16} />
          <YAxis orientation={rtl ? 'right' : 'left'} tickFormatter={valueFormat} {...axisProps(th.axis)} width={48} />
          <Tooltip content={<ChartTooltip fmt={valueFormat} labelFmt={xFormat} />} cursor={{ stroke: th.axis, strokeDasharray: '4 4' }} />
          {legend && series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: th.axis }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={th.fix(s.color)}
              strokeWidth={2}
              strokeDasharray={i > 0 && s.key.startsWith('prev') ? '5 4' : undefined}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      )}
    </Frame>
  );
}

interface BarProps<T> extends CartesianProps<T> {
  horizontal?: boolean;
  /** Color each bar from its row's `color` field (single-series only). */
  colorByRow?: boolean;
  categoryWidth?: number;
}

export function BarChart<T>({ data, xKey, series, height = 280, loading, valueFormat = fmtCompact, xFormat, stacked, legend = true, horizontal, colorByRow, categoryWidth = 110, className }: BarProps<T>) {
  const th = useChartTheme();
  const rtl = useIsRtl();
  return (
    <Frame height={height} loading={loading} className={className}>
      {(w) => (
        <RBarChart width={w} height={height} data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: 8, bottom: 0 }} barCategoryGap={horizontal ? 6 : '22%'}>
          <CartesianGrid stroke={th.grid} vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" reversed={rtl} tickFormatter={valueFormat} {...axisProps(th.axis)} />
              <YAxis type="category" dataKey={xKey} orientation={rtl ? 'right' : 'left'} width={categoryWidth} tickFormatter={xFormat} {...axisProps(th.axis)} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} reversed={rtl} tickFormatter={xFormat} {...axisProps(th.axis)} interval={0} minTickGap={4} />
              <YAxis orientation={rtl ? 'right' : 'left'} tickFormatter={valueFormat} {...axisProps(th.axis)} width={48} />
            </>
          )}
          <Tooltip content={<ChartTooltip fmt={valueFormat} labelFmt={xFormat} />} cursor={{ fill: th.grid, opacity: 0.5 }} />
          {legend && series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: th.axis }} />}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={th.fix(s.color)}
              stackId={stacked ? '1' : undefined}
              radius={horizontal ? (rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]) : [4, 4, 0, 0]}
              maxBarSize={horizontal ? 18 : 36}
              isAnimationActive={false}
            >
              {colorByRow && data.map((row, i) => <Cell key={i} fill={th.fix(String((row as Record<string, unknown>).color ?? s.color))} />)}
            </Bar>
          ))}
        </RBarChart>
      )}
    </Frame>
  );
}

interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutDatum[];
  height?: number;
  loading?: boolean;
  centerLabel?: ReactNode;
  centerValue?: ReactNode;
  valueFormat?: Fmt;
  className?: string;
  showLegend?: boolean;
}

export function DonutChart({ data, height = 220, loading, centerLabel, centerValue, valueFormat = (v) => fmtNumber(v), className, showLegend = true }: DonutProps) {
  const th = useChartTheme();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className={cn('flex flex-col items-center gap-4 sm:flex-row', className)}>
      <div className="relative w-full max-w-[220px] shrink-0">
        <Frame height={height} loading={loading}>
          {(w) => (
            <PieChart width={w} height={height}>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.name} fill={th.fix(d.color)} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip fmt={valueFormat} />} />
            </PieChart>
          )}
        </Frame>
        {!loading && (centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="kpi-num text-2xl text-primary">{centerValue}</div>
              <div className="text-[11px] text-muted">{centerLabel}</div>
            </div>
          </div>
        )}
      </div>
      {showLegend && (
        <ul className="w-full min-w-0 flex-1 space-y-2">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: th.fix(d.color) }} />
              <span className="min-w-0 flex-1 truncate text-ink/80">{d.name}</span>
              <span className="font-semibold num text-ink">{valueFormat(d.value)}</span>
              <span className="w-10 text-end text-xs text-muted num">{Math.round((d.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
