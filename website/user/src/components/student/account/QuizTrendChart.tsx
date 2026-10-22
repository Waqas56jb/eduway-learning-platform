import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ScoreTrendDto, SubjectRef } from '@/api/types';
import { useLang } from '@/hooks/useLang';
import { cn } from '@/lib/utils';
import type { SubjectId } from '@/types';

type Row = { week: number; label: string } & Record<string, number | string | null>;

interface TipProps {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string; payload?: Row }[];
}

function TrendTooltip({ active, payload, subjects }: TipProps & { subjects: SubjectRef[] }) {
  const { t } = useTranslation();
  const { l } = useLang();
  if (!active || !payload?.length) return null;
  const week = payload[0].payload?.week ?? 0;
  const rows = [...payload].filter((p) => p.value !== null && p.value !== undefined).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="min-w-[180px] rounded-xl border border-white/10 bg-primary px-3.5 py-3 text-xs text-white shadow-lift">
      <p className="mb-2 font-semibold text-accent-light">{t('account.progress.week', { n: week })}</p>
      <ul className="space-y-1.5">
        {rows.map((p) => {
          const s = subjects.find((x) => x.slug === p.dataKey);
          return (
            <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                {l(s?.name)}
              </span>
              <span className="font-semibold num">{p.value}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Weekly quiz averages per subject (PRG-07) with toggleable series. */
export function QuizTrendChart({ trend }: { trend: ScoreTrendDto }) {
  const { t } = useTranslation();
  const { l, isRtl } = useLang();
  const [hidden, setHidden] = useState<SubjectId[]>([]);
  const subjects = trend.subjects.map((s) => ({ ...s, id: s.slug }));
  const data: Row[] = trend.weeks.map((w) => ({ week: w.week, label: l(w.label) || t('account.progress.weekShort', { n: w.week }), ...w.scores }));
  const values = trend.weeks.flatMap((w) => Object.values(w.scores)).filter((v): v is number => typeof v === 'number');
  const floor = values.length ? Math.max(0, Math.min(50, Math.floor((Math.min(...values) - 5) / 10) * 10)) : 50;
  const ticks = Array.from({ length: Math.round((100 - floor) / 10) + 1 }, (_, i) => floor + i * 10);

  const toggle = (id: SubjectId) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : h.length >= subjects.length - 1 ? h : [...h, id]));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap gap-2">
        {subjects.map((s) => {
          const on = !hidden.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                on ? 'bg-white shadow-sm' : 'border-dashed border-primary/15 bg-transparent text-muted opacity-70',
              )}
              style={on ? { borderColor: `${s.color}55`, color: s.color } : undefined}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: on ? s.color : 'transparent', boxShadow: `inset 0 0 0 2px ${s.color}` }}
                aria-hidden
              />
              {l(s.name)}
            </button>
          );
        })}
      </div>
      <div className="h-72 w-full lg:h-auto lg:min-h-[18rem] lg:flex-1" role="img" aria-label={t('account.progress.chartLabel')} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
            <CartesianGrid stroke="rgba(11,31,58,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              reversed={isRtl}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
              tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                <text x={x} y={y} dy={16} textAnchor="middle" fill="#6B7280" fontSize={12} direction={isRtl ? 'rtl' : 'ltr'}>
                  {payload.value}
                </text>
              )}
            />
            <YAxis
              orientation={isRtl ? 'right' : 'left'}
              domain={[floor, 100]}
              ticks={ticks}
              tickLine={false}
              axisLine={false}
              width={36}
              tick={{ fill: '#6B7280', fontSize: 12 }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip content={<TrendTooltip subjects={trend.subjects} />} cursor={{ stroke: 'rgba(201,162,74,0.5)', strokeDasharray: '4 4' }} />
            {subjects.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                stroke={s.color}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                hide={hidden.includes(s.id)}
                animationDuration={900}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
