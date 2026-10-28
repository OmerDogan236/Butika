'use client';

import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrendPoint {
  day: string;
  total: number;
  unique: number;
}

export function SearchTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
          <CartesianGrid stroke="#E5E2DD" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fill: '#9A9A9A', fontSize: 11, letterSpacing: 1 }}
            tickFormatter={(d) => format(parseISO(d), 'd MMM', { locale: tr })}
            axisLine={{ stroke: '#E5E2DD' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9A9A9A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#F8F5F0',
              border: '1px solid #E5E2DD',
              borderRadius: 6,
              fontFamily: 'Inter',
              fontSize: 12,
            }}
            labelFormatter={(d) => format(parseISO(d as string), 'd MMMM EEEE', { locale: tr })}
            formatter={(v: number, name) => [v, name === 'total' ? 'Toplam' : 'Benzersiz']}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#9B7E5C"
            strokeWidth={2}
            dot={{ fill: '#9B7E5C', r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="unique"
            stroke="#0A0A0A"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
