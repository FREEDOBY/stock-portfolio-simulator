import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { PortfolioItem } from '../types';
import { isKoreanSymbol } from '../utils/stockUtils';

interface Props {
  portfolio: PortfolioItem[];
}

const COLORS = [
  '#00d4aa', // emerald
  '#f97316', // orange
  '#a78bfa', // violet
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#ec4899', // pink
  '#84cc16', // lime
  '#3b82f6', // blue
  '#14b8a6', // teal
];

export function PortfolioPieChart({ portfolio }: Props) {
  if (portfolio.length === 0) {
    return null;
  }

  const data = portfolio.map((item) => ({
    name: isKoreanSymbol(item.symbol) ? item.name : item.symbol,
    value: item.weight,
    fullName: item.name,
    symbol: item.symbol,
  }));

  const totalWeight = portfolio.reduce((sum, item) => sum + item.weight, 0);

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400"></div>
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Allocation</h3>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={2}
              dataKey="value"
              stroke="#111827"
              strokeWidth={2}
              label={({ name, value }) => `${name} ${((value / totalWeight) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`${((value / totalWeight) * 100).toFixed(1)}%`, 'Weight']}
              labelFormatter={(name) => {
                const item = data.find((d) => d.name === name);
                if (!item) return name;
                return isKoreanSymbol(item.symbol)
                  ? `${item.name} (${item.symbol})`
                  : `${item.name} (${item.fullName})`;
              }}
              contentStyle={{
                backgroundColor: '#1a1f2e',
                border: '1px solid rgba(100, 116, 139, 0.3)',
                borderRadius: '4px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                color: '#e2e8f0',
              }}
            />
            <Legend
              wrapperStyle={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
              }}
              formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
