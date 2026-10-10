/** 부동산 실거래가 대시보드 타입 (/api/realestate/* 응답 스키마) */

export interface Deal {
  date: string;      // YYYY-MM-DD
  ym: string;        // YYYYMM
  apt: string;
  ar: number;        // 전용면적 ㎡
  amt: number;       // 만원
  fl: number;
  dong: string;
  gbn: string;       // 중개거래/직거래
  cdeal: string;     // '해제' | ''
  cdealDay: string;
  rgst: string;
  umd: string;
}

export interface DealsResponse {
  deals: Deal[];
  lastFetched: string | null;
  fetchedMonths: number;
}

export interface BandDef {
  band1: [number, number];
  band2: [number, number];
  avoid: number;
  note?: string;
}

export interface BuyBands {
  as_of: string;
  note: string;
  bands: Record<string, BandDef>;
}

export interface MacroIndicator {
  name: string;
  value: string;
  trend: 'up' | 'down' | 'flat';
  signal: string;
  note?: string;
}

export interface MacroConfig {
  as_of: string;
  phase: string;
  phase_pos: number;
  summary: string[] | string;
  indicators: MacroIndicator[];
}

export interface FundsItem {
  name: string;
  amount: number;   // 억
  when: string;     // 즉시 | 2027-01 | 잔금 | 등기 후 …
  rate?: number;        // 연 이자율 % (대출성 항목만)
  term_years?: number;  // 원리금균등 만기(년) — 있으면 월 부담을 원리금으로 계산
  link?: string;        // 항목명 클릭 시 열 외부 링크
  note?: string;
}

export interface Funds {
  as_of: string;
  costs_note?: string;
  items: FundsItem[];
}

export interface ComplexProfile {
  complexNo: number;
  name: string;
  aptKeyword: string;
  lawdCd: string;
  regionName: string;
}

export interface ComplexSearchResult {
  complexNo: number;
  name: string;
  lawdCd: string;
  address: string;
  households: number;
  type: string;
}

export interface BackfillStatus {
  running: boolean;
  lawdCd: string | null;
  done: number;
  total: number;
  error: string;
}

export interface REConfig {
  hasKey: boolean;
  aptKeyword: string;
  regionName: string;
  areaLabels: Record<string, string>;
  events: { date: string; label: string }[];
  macro: MacroConfig | null;
  buyBands: BuyBands | null;
  funds: Funds | null;
  complex?: ComplexProfile | null;
  backfill?: BackfillStatus;
}

export interface CycleRow {
  ym: string;
  phase: string;
  price: number;
  mom3: number;
  mom12: number;
  dd: number;
  rate: number;
  hiking: boolean;
  vol_ratio: number;
  pending?: string | null;
}

/** 구 단위 파도 판정 (/api/realestate/wave) */
export interface WaveRow {
  ym: string;
  phase: string;         // 상승 | 고점 | 하락 | 저점
  sub: string;           // 파도 내 위치 (초입/본파동/말기 등)
  pending?: string | null;
  idx: number;
  mom3: number;
  mom12: number;
  dd: number;
  rate: number;
  hiking: boolean;
  vol_ratio: number;
  deals: number;
  provisional: boolean;  // 신고기한 미경과 — 잠정
  pos: number;           // 사이클 곡선 위 좌표 (0=저점 … 0.5=고점 … 1=저점)
}

export interface WaveRegion {
  sgg: string;
  name: string;
  ym: string;
  phase: string;
  sub: string;
  pending?: string | null;
  dd: number;
  mom12: number;
  vol_ratio: number;
  provisional: boolean;
}

export interface WaveResponse {
  ok: boolean;
  msg?: string;
  primary: string;
  primaryName: string;
  rows: WaveRow[];
  regions: WaveRegion[];
}

export interface RegionRow {
  sgg: string;
  name: string;
  asof: string;   // YYYYMM
  peak: string;
  yoy: number | null;
}

export interface ListingArticle {
  price: number;      // 억 — 동일매물 묶음 내 최저 호가
  repPrice?: number;  // 억 — 대표매물 호가 (참고)
  realtors?: number;  // 묶음 내 중개사 수
  dong: string;
  floor: string;      // "저/14" 또는 "7/14" 형식
  space: number;      // 전용 ㎡
  desc: string;       // 매물 특징 설명
  confirmed: string;  // 확인일자
  articleNo: string;  // 네이버 매물 번호
}

export interface HistoryEvent {
  at: string;
  type: string;        // 등장 | 가격변동 | 소멸 | 재출현 | 거래추정
  old: number | null;  // 억
  new: number | null;  // 억
  note: string;
}

export interface ListingHistory {
  articleNo: string;
  g: number;
  dong: string;
  floor: string;
  space: number;
  firstSeen: string;
  lastSeen: string;
  status: 'active' | 'gone';
  goneAt: string | null;
  firstPrice: number | null;
  lastPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  fav: boolean;
  matchedDeal: { date: string; amt: number; floor: number; dong: string } | null;
  prevArticleNo?: string | null;                              // 이 매물이 재등록이면 이전 매물번호
  successor?: { articleNo: string; price: number | null } | null;  // 소멸 후 재등록된 새 매물
  events: HistoryEvent[];
}

export interface HistoryResponse {
  ok: boolean;
  msg?: string;
  listings: Record<string, ListingHistory>;
}

export interface AgentInfo {
  ok: boolean;
  msg?: string;
  articleNo?: string;
  name?: string;      // 중개사무소 상호
  ceo?: string;       // 대표자
  phone?: string;     // 대표 전화
  cell?: string;      // 휴대전화
  address?: string;   // 소재지
}

export interface ListingTypeStat {
  count: number;
  min: number;      // 억
  median: number;   // 억
  lows: { price: number; floor: string; dong: string; space: number }[];
  articles: ListingArticle[];
}

export interface ListingsResponse {
  ok: boolean;
  msg?: string;
  asof?: string;
  total?: number;
  types?: Record<string, ListingTypeStat>;
}

export interface PricePoint {
  x: number;   // 소수 연도
  y: number;   // 억원
  ym: string;
}

export interface Pivot extends PricePoint {
  type: 'H' | 'L';
  open?: boolean;
  pct: number | null;
}

export interface LineSeries {
  g: number;
  label: string;
  color: string;
  avgs: PricePoint[];
  pivots: Pivot[];
}
