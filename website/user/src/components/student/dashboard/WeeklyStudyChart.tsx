import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import type { WeeklyStudyDto } from '@/api/types';
import { useLang } from '@/hooks/useLang';

const HEIGHT = 260;

interface Point {
  day: string;
  minutes: number;
  questions: number;
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t } = useTranslation();
  const p = payload?.[0]?.payload as Point | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-primary/5 bg-white px-3.5 py-2.5 text-start shadow-lift">
      <p className="text-xs font-semibold text-muted">{p.day}</p>
      <p className="mt-0.5 text-base font-bold text-primary num">{t('common.minutes', { count: p.minutes })}</p>
      <p className="text-xs text-accent num">{t('common.questions', { count: p.questions })}</p>
    </div>
  );
}

/** Area chart of minutes studied per day this week (RTL-aware axes). */
export function WeeklyStudyChart({ days }: { days: WeeklyStudyDto['days'] }) {
  const { l, isRtl } = useLang();
  const gid = `wk-${useId().replace(/:/g, '')}`;
  const data = useMemo<Point[]>(
    () => days.map((d) => ({ day: l(d.day), minutes: d.minutes, questions: d.questions })),
    [l, days],
  );

  return (
    <div className="h-[260px] w-full min-w-0" dir="ltr">
      <ResponsiveContainer width="100%" height={HEIGHT} minWidth={0} initialDimension={{ width: 600, height: HEIGHT }}>
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A24A" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#C9A24A" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(11,31,58,0.06)" />
          <XAxis
            dataKey="day"
            reversed={isRtl}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#6B7280', fontSize: 12 }}
            tickFormatter={(v: string) => (isRtl ? v : v.slice(0, 3))}
            interval="preserveStartEnd"
            minTickGap={4}
            padding={{ left: 18, right: 18 }}
            dy={8}
          />
          <YAxis
            orientation={isRtl ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            width={36}
            tick={{ fill: '#6B7280', fontSize: 12 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#C9A24A', strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="minutes"
            stroke="#0B1F3A"
            strokeWidth={2.5}
            fill={`url(#${gid})`}
            activeDot={{ r: 6, fill: '#C9A24A', stroke: '#fff', strokeWidth: 3 }}
            dot={{ r: 3, fill: '#0B1F3A', strokeWidth: 0 }}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
