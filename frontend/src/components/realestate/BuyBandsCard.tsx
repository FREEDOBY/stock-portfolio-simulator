/** 평형별 매수 밴드 카드 — config.json buy_bands 기준.
 *  상태 판정 = 매물 최저 호가(지금 살 수 있는 가격) 우선, 호가 없으면 최근 3개월 체결 중앙값. */

import { useMemo } from 'react';
import type { BuyBands, Deal, ListingsResponse } from '../../lib/realestate/types';
import { median } from '../../lib/realestate/utils';

interface Props {
  buyBands: BuyBands | null;
  all: Deal[];
  gLabel: (g: number) => string;
  listings?: ListingsResponse | null;
}

export function BuyBandsCard({ buyBands, all, gLabel, listings }: Props) {
  const rows = useMemo(() => {
    if (!buyBands || !buyBands.bands || !all.length) return [];
    // 최근 3개월 컷오프: 데이터상 마지막 계약일 기준
    const last = all[all.length - 1].date;
    const cut = new Date(+last.slice(0, 4), +last.slice(5, 7) - 4, 1);
    const cutStr = `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-01`;
    const rangeTxt = (b: [number, number]) => `${b[0]}~${b[1]}억`;

    return Object.keys(buyBands.bands).map(Number).sort((a, b) => a - b).map((g) => {
      const band = buyBands.bands[g];
      // 직거래(가족 간 저가 이전 등)와 해제거래는 시세 신호가 아니므로 제외
      const deals = all.filter(
        (d) => d.cdeal !== '해제' && d.gbn !== '직거래' && Math.floor(d.ar) === g
      );
      if (!deals.length) return null;
      let amts = deals.filter((d) => d.date >= cutStr).map((d) => d.amt / 10000);
      const med0 = amts.length ? median(amts) : null;
      amts = med0 != null ? amts.filter((a) => a > med0 * 0.6) : []; // 지분/특수거래 제외
      const med3 = amts.length ? median(amts) : null;
      const nIn = amts.filter((a) => a <= band.band1[1]).length; // 1차 밴드 이하 급매 건수

      // 상태 판정: 지금 살 수 있는 가격 = 매물 최저 호가 기준 (호가 없으면 체결 중앙값)
      const ls = listings?.ok && listings.types ? listings.types[g] : undefined;
      const basis = ls ? ls.min : med3;
      const basisLabel = ls ? '최저 호가' : '체결 중앙';

      let stTxt = '거래 없음';
      let stColor = 'text-slate-500';
      if (basis != null) {
        if (basis <= band.band2[1]) { stTxt = '2차 밴드 진입'; stColor = 'text-red-400'; }
        else if (basis <= band.band1[1]) { stTxt = '1차 밴드 진입'; stColor = 'text-red-400'; }
        else if (basis >= band.avoid) { stTxt = '추격 금지권'; stColor = 'text-emerald-400'; }
        else { stTxt = '대기'; stColor = 'text-slate-200'; }
        stTxt = `${stTxt} (${basisLabel} ${+basis.toFixed(1)}억)`;
        if (nIn) stTxt += ` · 밴드내 체결 ${nIn}건`;
      }
      const recent = amts.length
        ? `${+Math.min(...amts).toFixed(2)}~${+Math.max(...amts).toFixed(2)}억 (${amts.length}건)`
        : '거래 없음';
      return {
        g, label: gLabel(g), recent,
        band1: rangeTxt(band.band1), band2: rangeTxt(band.band2),
        avoid: `${band.avoid}억+`, stTxt, stColor, note: band.note || '',
      };
    }).filter(Boolean) as {
      g: number; label: string; recent: string; band1: string; band2: string;
      avoid: string; stTxt: string; stColor: string; note: string;
    }[];
  }, [buyBands, all, gLabel, listings]);

  if (!rows.length) return null;

  const th = 'px-2.5 py-1.5 border-b border-gray-800 whitespace-nowrap font-medium';
  const td = 'px-2.5 py-1.5 border-b border-gray-800 whitespace-nowrap';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-[18px] mt-4">
      <h2 className="text-[15px] font-semibold mb-1 text-slate-100">평형별 매수 밴드</h2>
      <p className="text-xs text-slate-400 mb-3">
        기준 {buyBands!.as_of} · {buyBands!.note} · 상태는 매물 최저 호가 기준 판정
        (호가 없으면 최근 3개월 체결 중앙값 · 직거래·해제·지분거래 제외)
        {listings?.ok && listings.asof && (
          <> · 호가 = 네이버부동산 매물 {listings.total}건 ({listings.asof.slice(5, 16).replace('T', ' ')} 수집)</>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-slate-400">
              <th className={`${th} text-left`}>평형</th>
              <th className={`${th} text-right`}>최근 3개월 체결</th>
              <th className={`${th} text-right`}>1차 밴드</th>
              <th className={`${th} text-right`}>2차 밴드</th>
              <th className={`${th} text-right`}>추격 금지</th>
              <th className={`${th} text-right`}>매물 최저 호가</th>
              <th className={`${th} text-left`}>상태</th>
              <th className={`${th} text-left`}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ls = listings?.ok && listings.types ? listings.types[r.g] : undefined;
              const band = buyBands!.bands[r.g];
              const inBand1 = ls && band ? ls.min <= band.band1[1] : false;
              return (
              <tr key={r.g}>
                <td className={td}>{r.label}</td>
                <td className={`${td} text-right tabular-nums`}>{r.recent}</td>
                <td className={`${td} text-right tabular-nums`}>{r.band1}</td>
                <td className={`${td} text-right tabular-nums`}>{r.band2}</td>
                <td className={`${td} text-right tabular-nums`}>{r.avoid}</td>
                <td
                  className={`${td} text-right tabular-nums ${
                    ls ? (inBand1 ? 'text-red-400 font-semibold' : 'text-slate-200') : 'text-slate-500'
                  }`}
                  title={ls?.lows?.length
                    ? '최저가 매물: ' + ls.lows.map((l) =>
                        `${l.price}억 ${l.dong ? l.dong + '동 ' : ''}${l.floor}`).join(' · ')
                    : undefined}
                >
                  {ls ? `${ls.min}억 (${ls.count}건)` : '-'}
                </td>
                <td className={`${td} font-semibold ${r.stColor}`}>{r.stTxt}</td>
                <td className="px-2.5 py-1.5 border-b border-gray-800 text-slate-400 text-xs min-w-[220px]">{r.note}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
