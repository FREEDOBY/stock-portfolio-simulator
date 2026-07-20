/** 매크로 상세 차트 공용 유틸 */

/** 월별(YYYY-MM) 차트 행에 12개월 전 대비 YoY %를 추가.
 *  분기 시리즈도 12개월 시프트가 같은 분기 월에 떨어져 그대로 동작. */
export function addYoY<T extends { date: string }>(
  rows: T[],
  key: string,
): Array<T & { 'YoY%': number | null }> {
  const byDate = new Map<string, number>();
  rows.forEach((r) => {
    const v = (r as Record<string, unknown>)[key];
    if (typeof v === 'number') byDate.set(r.date, v);
  });
  const shift12 = (ym: string) => {
    const t = parseInt(ym.slice(0, 4), 10) * 12 + (parseInt(ym.slice(5, 7), 10) - 1) - 12;
    return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  return rows.map((r) => {
    const cur = (r as Record<string, unknown>)[key];
    const prev = byDate.get(shift12(r.date));
    const yoy =
      typeof cur === 'number' && prev != null && prev !== 0
        ? +(((cur / prev) - 1) * 100).toFixed(1)
        : null;
    return { ...r, 'YoY%': yoy };
  });
}

/** YoY 오버레이 시리즈 설정 (우측 축 · 주황) */
export const YOY_SERIES = {
  dataKey: 'YoY%',
  color: '#f59e0b',
  name: 'YoY%',
  yAxisId: 'right' as const,
};

/** 우측 축 0% 기준선 */
export const YOY_ZERO_LINE = { y: 0, color: '#475569', label: '0%', yAxisId: 'right' as const };

/** 우측 축 % 포맷터 */
export const yoyFormatter = (v: number) => `${v.toFixed(0)}%`;
