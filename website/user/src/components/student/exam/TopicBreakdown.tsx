import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLang } from '@/hooks/useLang';

export interface TopicStat {
  key: string;
  topic: string;
  correct: number;
  total: number;
  pct: number;
}

export const barColor = (pct: number) => (pct >= 75 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626');

const short = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Horizontal bar chart of % correct per topic (RTL-aware), with a screen-reader table. */
export function TopicBreakdown({ data }: { data: TopicStat[] }) {
  const { t } = useTranslation();
  const { isRtl } = useLang();
  const height = Math.max(200, data.length * 52 + 40);

  return (
    <div>
      <div aria-hidden className="w-full" dir="ltr">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 4 }} barCategoryGap={14}>
            <CartesianGrid horizontal={false} strokeDasharray="3 4" stroke="rgba(11,31,58,0.08)" />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              reversed={isRtl}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="topic"
              orientation={isRtl ? 'right' : 'left'}
              width={128}
              tickFormatter={(v: string) => short(v)}
              tick={{ fontSize: 12, fill: '#0B1F3A', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(201,162,74,0.08)' }}
              contentStyle={{ borderRadius: 12, border: '1px solid rgba(11,31,58,0.08)', boxShadow: '0 10px 30px -12px rgba(11,31,58,0.25)' }}
              formatter={(v: number, _n, item) => [
                `${v}% (${(item.payload as TopicStat).correct}/${(item.payload as TopicStat).total})`,
                t('practice.result.topics.accuracy'),
              ]}
            />
            <Bar dataKey="pct" radius={isRtl ? [6, 0, 0, 6] : [0, 6, 6, 0]} maxBarSize={22} background={{ fill: 'rgba(11,31,58,0.04)', radius: 6 }}>
              {data.map((d) => (
                <Cell key={d.key} fill={barColor(d.pct)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('practice.result.topics.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('practice.result.topics.topic')}</th>
            <th scope="col">{t('practice.result.topics.accuracy')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.topic}</th>
              <td>
                {d.pct}% ({d.correct}/{d.total})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" />
          {t('practice.result.topics.strong')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" />
          {t('practice.result.topics.fair')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]" />
          {t('practice.result.topics.weak')}
        </li>
      </ul>
    </div>
  );
}
