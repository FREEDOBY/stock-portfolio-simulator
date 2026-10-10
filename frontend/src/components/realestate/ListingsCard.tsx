/** 네이버부동산 현재 매물 리스트 — 평형 선택, 호가 오름차순.
 *  - 부동산 열 클릭 → 중개사 정보(상호·전화·위치) 온디맨드 조회 + 매물 히스토리 타임라인
 *  - 히스토리: 🆕 신규 / ▼▲ 가격변동 뱃지, ⭐ 관심 매물, 사라진 매물(거래추정 매칭) 섹션
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  AgentInfo, BuyBands, HistoryResponse, ListingHistory, ListingsResponse,
} from '../../lib/realestate/types';

interface Props {
  listings: ListingsResponse | null;
  gLabel: (g: number) => string;
  buyBands: BuyBands | null;
}

const DAY = 24 * 3600 * 1000;

function lastPriceChange(h?: ListingHistory) {
  if (!h) return null;
  // 같은 매물번호의 가격변동 + 재등록(번호가 바뀌며 호가가 달라진 경우) 모두 변동으로 취급
  const evs = h.events.filter((e) =>
    (e.type === '가격변동' || e.type === '재등록') &&
    e.old != null && e.new != null && Math.abs(e.new - e.old) >= 0.05);
  return evs.length ? evs[evs.length - 1] : null;
}

export function ListingsCard({ listings, gLabel, buyBands }: Props) {
  const types = listings?.ok && listings.types ? listings.types : null;
  const groups = types ? Object.keys(types).map(Number).sort((a, b) => a - b) : [];
  const [sel, setSel] = useState<number | null>(null);
  const [openNo, setOpenNo] = useState<string | null>(null);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [loadingNo, setLoadingNo] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, ListingHistory>>({});
  const [showGone, setShowGone] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const h: HistoryResponse = await fetch('/api/realestate/history').then((r) => r.json());
      if (h.ok) setHistory(h.listings);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (groups.length && (sel == null || !groups.includes(sel))) {
      setSel(groups.includes(117) ? 117 : groups[0]);
    }
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings]);

  if (!types || sel == null) return null;
  const stat = types[sel];
  const band = buyBands?.bands?.[sel];
  const arts = (stat?.articles ?? []).slice().sort((a, b) => a.price - b.price);
  const gone = Object.values(history)
    .filter((h) => h.status === 'gone' && h.g === sel)
    .sort((a, b) => (b.goneAt || '').localeCompare(a.goneAt || ''));
  // 관심 매물 중 최근 14일 내 변동(가격변동·소멸·거래추정) 알림
  const favAlerts = Object.values(history).filter((h) =>
    h.fav && h.events.some((e) =>
      ['가격변동', '재등록', '소멸', '거래추정'].includes(e.type) &&
      Date.now() - new Date(e.at).getTime() < 14 * DAY));

  const toggleAgent = async (no: string) => {
    if (!no) return;
    if (openNo === no) { setOpenNo(null); return; }
    setOpenNo(no);
    if (!agents[no]) {
      setLoadingNo(no);
      try {
        const r: AgentInfo = await fetch(`/api/realestate/agent/${no}`).then((x) => x.json());
        setAgents((p) => ({ ...p, [no]: r }));
      } catch (e) {
        setAgents((p) => ({ ...p, [no]: { ok: false, msg: String(e) } }));
      }
      setLoadingNo(null);
    }
  };

  const toggleFav = async (no: string) => {
    if (!no) return;
    try {
      const r = await fetch(`/api/realestate/fav/${no}`, { method: 'POST' }).then((x) => x.json());
      if (r.ok) setHistory((p) => ({ ...p, [no]: { ...p[no], fav: r.fav } }));
    } catch { /* ignore */ }
  };

  const td = 'px-2.5 py-1.5 border-b border-gray-800 whitespace-nowrap';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-[18px] mt-4">
      <h2 className="text-[15px] font-semibold mb-1 text-slate-100">현재 매물 (네이버부동산)</h2>
      <p className="text-xs text-slate-400 mb-3">
        호가 오름차순 · 동일매물 묶음 내 <b className="text-slate-300">최저 호가</b> 기준 (×N = 등록 중개사 수)
        {listings?.asof && <> · {listings.asof.slice(5, 16).replace('T', ' ')} 수집</>}
        {band && (
          <> · <span className="text-slate-300">{gLabel(sel)} 1차 밴드 {band.band1[0]}~{band.band1[1]}억</span>
          {' '}(밴드 내 호가는 <span className="text-red-400">빨간색</span>)</>
        )}
        {' '}· 부동산 열 클릭 = 연락처·히스토리 · ⭐ = 관심 매물 추적
      </p>

      {favAlerts.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-amber-700 bg-amber-900/20 text-xs text-amber-300">
          ⭐ 관심 매물 변동: {favAlerts.map((h) => {
            const ev = h.events[h.events.length - 1];
            return `${h.dong}동 ${h.floor} — ${ev.type}${
              ev.type === '가격변동' ? ` ${ev.old}→${ev.new}억` :
              ev.type === '거래추정' ? ` (${ev.note})` : ''}`;
          }).join(' · ')}
        </div>
      )}

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="inline-flex border border-gray-700 rounded-lg overflow-hidden">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => { setSel(g); setOpenNo(null); }}
              className={`px-3 py-1.5 text-[13px] ${
                sel === g ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-gray-800'
              }`}
            >
              {gLabel(g).split(' ')[0]} ({types[g].count})
            </button>
          ))}
        </div>
        {gone.length > 0 && (
          <button
            onClick={() => setShowGone((v) => !v)}
            className={`border rounded-lg px-3 py-1.5 text-[13px] ${
              showGone ? 'border-blue-500 text-blue-400' : 'border-gray-700 text-slate-400 hover:bg-gray-800'
            }`}
          >
            사라진 매물 {gone.length}건 {showGone ? '숨기기' : '보기'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-slate-400">
              <th className={`${td} text-left font-medium`}>⭐</th>
              <th className={`${td} text-left font-medium`}>동</th>
              <th className={`${td} text-left font-medium`}>층</th>
              <th className={`${td} text-right font-medium`}>호가</th>
              <th className={`${td} text-left font-medium`}>변동</th>
              <th className={`${td} text-right font-medium`}>전용</th>
              <th className={`${td} text-left font-medium`}>설명</th>
              <th className={`${td} text-left font-medium`}>확인일</th>
              <th className={`${td} text-left font-medium`}>부동산</th>
            </tr>
          </thead>
          <tbody>
            {arts.map((a, i) => {
              const inBand = band ? a.price <= band.band1[1] : false;
              const open = openNo === a.articleNo;
              const ag = agents[a.articleNo];
              const h = history[a.articleNo];
              const isRelist = !!h?.prevArticleNo; // 번호만 바뀐 재등록은 신규가 아니다
              const isNew = h && !isRelist && Date.now() - new Date(h.firstSeen).getTime() < 7 * DAY;
              const pc = lastPriceChange(h);
              return [
                <tr key={a.articleNo || i} className={open ? 'bg-gray-800/40' : ''}>
                  <td className={td}>
                    <button
                      onClick={() => toggleFav(a.articleNo)}
                      disabled={!a.articleNo || !h}
                      title={h ? '관심 매물 토글' : '다음 수집 후 사용 가능'}
                      className={`text-base leading-none ${h?.fav ? '' : 'opacity-30 grayscale'} disabled:opacity-20`}
                    >
                      ⭐
                    </button>
                  </td>
                  <td className={td}>{a.dong ? `${a.dong}동` : '-'}</td>
                  <td className={td}>{a.floor || '-'}</td>
                  <td className={`${td} text-right tabular-nums font-semibold ${
                    inBand ? 'text-red-400' : 'text-slate-100'
                  }`}>
                    {a.price}억
                    {(a.realtors ?? 1) > 1 && (
                      <span
                        className="ml-1 text-[11px] font-normal text-slate-500"
                        title={`같은 매물을 ${a.realtors}개 중개사가 등록 — 묶음 내 최저 호가 기준${
                          a.repPrice && a.repPrice !== a.price ? ` (대표매물가 ${a.repPrice}억)` : ''}`}
                      >
                        ×{a.realtors}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-xs`}>
                    {isNew && <span className="text-cyan-400 mr-1">🆕</span>}
                    {isRelist && (
                      <span className="text-slate-400 mr-1"
                            title={`재등록 — 이전 매물 ${h?.prevArticleNo}`}>↻</span>
                    )}
                    {pc && pc.old != null && pc.new != null && (
                      <span className={pc.new < pc.old ? 'text-red-400' : 'text-emerald-400'}>
                        {pc.new < pc.old ? '▼' : '▲'}{Math.abs(pc.new - pc.old).toFixed(1)}
                        <span className="text-slate-500"> ({pc.old}→{pc.new})</span>
                      </span>
                    )}
                    {!isNew && !isRelist && !pc && <span className="text-slate-600">—</span>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{a.space}㎡</td>
                  <td className="px-2.5 py-1.5 border-b border-gray-800 text-slate-300 text-xs max-w-[380px]">
                    {a.desc || '-'}
                  </td>
                  <td className={`${td} text-slate-400`}>{a.confirmed || '-'}</td>
                  <td className={td}>
                    <button
                      onClick={() => toggleAgent(a.articleNo)}
                      disabled={!a.articleNo}
                      className={`border rounded px-2 py-0.5 text-xs ${
                        open
                          ? 'border-blue-500 text-blue-400'
                          : 'border-gray-700 text-slate-300 hover:bg-gray-800'
                      } disabled:opacity-40`}
                    >
                      {loadingNo === a.articleNo ? '조회 중…' : open ? '닫기' : '정보'}
                    </button>
                  </td>
                </tr>,
                open && (
                  <tr key={(a.articleNo || i) + '-detail'} className="bg-gray-800/40">
                    <td colSpan={9} className="px-4 py-2.5 border-b border-gray-800 text-xs">
                      <div className="flex flex-wrap gap-x-5 gap-y-1 items-center">
                        {loadingNo === a.articleNo && <span className="text-slate-400">중개사 정보 조회 중…</span>}
                        {ag && ag.ok && (
                          <>
                            <b className="text-slate-100 text-[13px]">{ag.name}</b>
                            {ag.ceo && <span className="text-slate-400">대표 {ag.ceo}</span>}
                            {ag.phone && (
                              <a href={`tel:${ag.phone}`} className="text-blue-400 font-semibold tabular-nums">
                                ☎ {ag.phone}
                              </a>
                            )}
                            {ag.cell && (
                              <a href={`tel:${ag.cell}`} className="text-blue-400 tabular-nums">
                                📱 {ag.cell}
                              </a>
                            )}
                            {ag.address && <span className="text-slate-400">{ag.address}</span>}
                            {(ag.name || ag.address) && (
                              <a
                                href={`https://map.naver.com/p/search/${encodeURIComponent(ag.name || ag.address || '')}`}
                                target="_blank" rel="noreferrer"
                                className="text-emerald-400 underline underline-offset-2"
                              >
                                지도에서 위치 보기
                              </a>
                            )}
                          </>
                        )}
                        {ag && !ag.ok && (
                          <span className="text-amber-400">{ag.msg || '중개사 조회 실패'}</span>
                        )}
                        <a
                          href={`https://fin.land.naver.com/articles/${a.articleNo}`}
                          target="_blank" rel="noreferrer"
                          className="text-slate-400 underline underline-offset-2"
                        >
                          네이버 매물 페이지 ↗
                        </a>
                      </div>
                      {h && h.events.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-800 text-slate-400">
                          <b className="text-slate-300">히스토리</b>{' '}
                          {h.events.map((e, j) => (
                            <span key={j} className="mr-3 whitespace-nowrap">
                              {e.at.slice(5, 10)} {e.type}
                              {e.type === '가격변동' && ` ${e.old}→${e.new}억`}
                              {e.type === '등장' && e.new != null && ` ${e.new}억`}
                              {e.note && ` (${e.note})`}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
            {!arts.length && (
              <tr><td colSpan={9} className={`${td} text-slate-500`}>해당 평형 매물 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showGone && gone.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13.5px] font-semibold text-slate-200 mb-1.5">
            사라진 매물 ({gLabel(sel)})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-slate-400">
                  <th className={`${td} text-left font-medium`}>동</th>
                  <th className={`${td} text-left font-medium`}>층</th>
                  <th className={`${td} text-right font-medium`}>마지막 호가</th>
                  <th className={`${td} text-left font-medium`}>등장~소멸</th>
                  <th className={`${td} text-left font-medium`}>결과</th>
                </tr>
              </thead>
              <tbody>
                {gone.map((h) => (
                  <tr key={h.articleNo}>
                    <td className={td}>{h.dong ? `${h.dong}동` : '-'}</td>
                    <td className={td}>{h.floor || '-'}</td>
                    <td className={`${td} text-right tabular-nums`}>{h.lastPrice}억</td>
                    <td className={`${td} text-slate-400`}>
                      {h.firstSeen.slice(5, 10)} ~ {(h.goneAt || '').slice(5, 10)}
                    </td>
                    <td className={td}>
                      {h.matchedDeal ? (
                        <span className="text-emerald-400 font-semibold">
                          거래 추정 — 실거래 {(h.matchedDeal.amt / 10000).toFixed(1)}억
                          ({h.matchedDeal.date}, {h.matchedDeal.floor}층)
                        </span>
                      ) : h.successor ? (
                        h.successor.price != null && h.lastPrice != null
                          && Math.abs(h.successor.price - h.lastPrice) >= 0.05 ? (
                          <span className={`font-semibold ${
                            h.successor.price < h.lastPrice ? 'text-red-400' : 'text-emerald-400'}`}>
                            재등록 — 호가 {h.lastPrice}억 → {h.successor.price}억
                            ({h.successor.price < h.lastPrice ? '▼' : '▲'}
                            {Math.abs(h.successor.price - h.lastPrice).toFixed(1)}억)
                          </span>
                        ) : (
                          <span className="text-slate-300">재등록 — 같은 호가 (새 매물번호)</span>
                        )
                      ) : (
                        <span className="text-slate-500">철회/숨김 추정</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
