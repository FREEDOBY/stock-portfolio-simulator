import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { PortfolioItem } from '../types';

interface Props {
  portfolio: PortfolioItem[];
}

const COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#84CC16', // lime-500
  '#F97316', // orange-500
  '#6366F1', // indigo-500
];

export function PortfolioPieChart({ portfolio }: Props) {
  if (portfolio.length === 0) {
    return null;
  }

  const data = portfolio.map((item) => ({
    name: item.symbol,
    value: item.weight,
    fullName: item.name,
  }));

  const totalWeight = portfolio.reduce((sum, item) => sum + item.weight, 0);

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">포트폴리오 구성</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ name, value }) => `${name} ${((value / totalWeight) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`${((value / totalWeight) * 100).toFixed(1)}%`, '비중']}
              labelFormatter={(name) => {
                const item = data.find((d) => d.name === name);
                return item ? `${item.name} (${item.fullName})` : name;
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
