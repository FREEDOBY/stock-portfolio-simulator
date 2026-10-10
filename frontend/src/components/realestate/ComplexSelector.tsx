/** 단지 검색·전환 — 아파트명 입력 → 네이버 단지 검색 → 선택 시 프로필 전환.
 *  새 지역(구)이면 국토부 실거래 백필(~5분)이 백그라운드로 돌고 진행률을 표시한다. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackfillStatus, ComplexProfile, ComplexSearchResult } from '../../lib/realestate/types';

interface Props {
  current: ComplexProfile | null | undefined;
  backfill?: BackfillStatus;
  onSwitched: () => void | Promise<void>;  // 전환/백필 완료 후 데이터 리로드
}

export function ComplexSelector({ current, backfill: initialBackfill, onSwitched }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ComplexSearchResult[]>([]);
  const [msg, setMsg] = useState('');
  const [backfill, setBackfill] = useState<BackfillStatus | null>(initialBackfill ?? null);
  const pollRef = useRef<number | null>(null);
  const acRef = useRef<number | null>(null);   // 자동완성 디바운스
  const acSeq = useRef(0);                      // 늦게 도착한 응답 무시용

  const stopPoll = () => {
    if (pollRef.current != null) { window.clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPoll = useCallback(() => {
    stopPoll();
    pollRef.current = window.setInterval(async () => {
      try {
        const s: BackfillStatus = await fetch('/api/realestate/backfill-status').then((r) => r.json());
        setBackfill(s);
        if (!s.running) {
          stopPoll();
          setMsg(s.error ? `백필 실패: ${s.error}` : '수집 완료 — 데이터 반영 중…');
          await onSwitched();
          setMsg('');
          setBackfill(null);
        }
      } catch { /* 다음 틱에 재시도 */ }
    }, 4000);
  }, [onSwitched]);

  // 페이지 로드 시 이미 백필이 돌고 있으면 이어서 폴링
  useEffect(() => {
    if (initialBackfill?.running) { setBackfill(initialBackfill); startPoll(); }
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 자동완성: 타이핑 중엔 로컬 DB(수집된 지역)만 조회 — 빠르고 호출 제한 없음.
     네이버 전체 검색은 Enter/버튼으로. */
  const onType = (v: string) => {
    setQ(v);
    if (acRef.current != null) window.clearTimeout(acRef.current);
    if (v.trim().length < 2) { setOpen(false); return; }
    const seq = ++acSeq.current;
    acRef.current = window.setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/realestate/search?mode=local&q=${encodeURIComponent(v.trim())}`
        ).then((x) => x.json());
        if (seq !== acSeq.current) return;  // 더 최신 입력이 있음
        if (r.ok && r.results.length) { setResults(r.results); setOpen(true); }
        else setOpen(false);
      } catch { /* 자동완성 실패는 조용히 무시 */ }
    }, 300);
  };

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setMsg('');
    try {
      const r = await fetch(`/api/realestate/search?q=${encodeURIComponent(q.trim())}`)
        .then((x) => x.json());
      if (r.ok) {
        setResults(r.results);
        setOpen(true);
        setMsg(r.results.length ? (r.msg || '') : '검색 결과 없음');
      } else setMsg(r.msg || '검색 실패');
    } catch (e) {
      setMsg(String(e));
    }
    setSearching(false);
  };

  const pick = async (c: ComplexSearchResult) => {
    setOpen(false);
    setMsg(`${c.name} 전환 중…`);
    try {
      const r = await fetch('/api/realestate/complex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      }).then((x) => x.json());
      if (!r.ok) { setMsg(r.msg || '전환 실패'); return; }
      if (r.backfill) {
        setMsg('새 지역 — 실거래 20년치 수집 중 (약 5분)…');
        startPoll();
      } else {
        setMsg('');
        await onSwitched();
      }
      setQ('');
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={q}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder={`단지 검색 (현재: ${current?.name ?? '올림픽훼밀리타운'})`}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-[13px] text-slate-100 w-64 placeholder:text-slate-500"
        />
        <button
          onClick={search}
          disabled={searching || !!backfill?.running}
          className="border border-gray-700 rounded-lg px-3 py-1.5 text-[13px] text-slate-200 hover:bg-gray-800 disabled:opacity-40"
        >
          {searching ? '검색 중…' : '단지 검색'}
        </button>
        {backfill?.running && (
          <span className="text-xs text-amber-400">
            📥 {backfill.lawdCd} 실거래 수집 {backfill.done}/{backfill.total}개월
            ({backfill.total ? Math.round((backfill.done / backfill.total) * 100) : 0}%)
          </span>
        )}
        {msg && !backfill?.running && <span className="text-xs text-slate-400">{msg}</span>}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-[420px] max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
          {results.map((c) => (
            <button
              key={c.complexNo}
              onClick={() => pick(c)}
              className="w-full text-left px-3 py-2 hover:bg-gray-800 border-b border-gray-800 last:border-0"
            >
              <span className="text-[13px] text-slate-100 font-semibold">{c.name}</span>
              <span className="ml-2 text-xs text-slate-400">
                {c.address} {c.households ? `· ${c.households}세대` : ''} {c.type && `· ${c.type}`}
              </span>
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="w-full text-center px-3 py-1.5 text-xs text-slate-500 hover:bg-gray-800"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
