import axios from 'axios';
import type { DashboardData, KospiBottomData, NasdaqBottomData } from '../types/macro';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 콜드 캐시 첫 수집(외부 API 병렬 호출)이 느린 날 대비 여유

});

/**
 * KST 06:00 기준 일간 인메모리 캐시
 * 백엔드도 동일 기준으로 캐시하지만, 프론트에서도 캐시하여
 * 페이지 전환 시 불필요한 네트워크 요청을 제거
 */
interface CacheEntry<T> {
  data: T;
  cachedAt: number; // timestamp ms
}

const cache: {
  dashboard: CacheEntry<DashboardData> | null;
  categories: Record<string, CacheEntry<Record<string, unknown>>>;
  signalHistory: CacheEntry<unknown[]> | null;
  kospiBottom: CacheEntry<KospiBottomData> | null;
  nasdaqBottom: CacheEntry<NasdaqBottomData> | null;
} = {
  dashboard: null,
  categories: {},
  signalHistory: null,
  kospiBottom: null,
  nasdaqBottom: null,
};

function getResetBoundary(): number {
  const now = new Date();
  // KST = UTC+9
  const kstHour = (now.getUTCHours() + 9) % 24;
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const reset = new Date(kstDate);
  reset.setUTCHours(6 - 9, 0, 0, 0); // 06:00 KST = 21:00 UTC (prev day)
  if (kstHour < 6) {
    reset.setUTCDate(reset.getUTCDate() - 1);
  }
  return reset.getTime();
}

function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) return false;
  return entry.cachedAt >= getResetBoundary();
}

export const fetchDashboard = async (): Promise<DashboardData> => {
  if (isCacheValid(cache.dashboard)) return cache.dashboard.data;

  const response = await api.get('/macro/dashboard');
  cache.dashboard = { data: response.data, cachedAt: Date.now() };
  return response.data;
};

export const fetchCategoryDetail = async (category: string): Promise<Record<string, unknown>> => {
  const entry = cache.categories[category];
  if (isCacheValid(entry)) return entry.data;

  const response = await api.get(`/macro/category/${category}`);
  cache.categories[category] = { data: response.data, cachedAt: Date.now() };
  return response.data;
};

export const fetchSignalHistory = async () => {
  if (isCacheValid(cache.signalHistory)) return cache.signalHistory.data;

  const response = await api.get('/macro/signals/history');
  cache.signalHistory = { data: response.data, cachedAt: Date.now() };
  return response.data;
};

export const setElliottCount = async (count: number) => {
  const response = await api.post('/macro/elliott', { count });
  return response.data;
};

export const setCapexCompany = async (
  company: string,
  status: 'up' | 'flat' | 'down',
) => {
  const response = await api.post('/macro/capex/company', { company, status });
  cache.dashboard = null; // 캐시 무효화 → 다음 fetch에서 갱신
  return response.data;
};

export const setDram = async (yoy: number, momentum: 'accel' | 'decel') => {
  const response = await api.post('/macro/capex/dram', { yoy, momentum });
  cache.dashboard = null;
  return response.data;
};

export const fetchKospiBottom = async (force = false): Promise<KospiBottomData> => {
  if (!force && isCacheValid(cache.kospiBottom)) return cache.kospiBottom.data;
  const response = await api.get('/macro/kospi-bottom', {
    params: force ? { refresh: true } : undefined,
  });
  cache.kospiBottom = { data: response.data, cachedAt: Date.now() };
  return response.data;
};

export const fetchNasdaqBottom = async (): Promise<NasdaqBottomData> => {
  if (isCacheValid(cache.nasdaqBottom)) return cache.nasdaqBottom.data;
  const response = await api.get('/macro/nasdaq-bottom');
  cache.nasdaqBottom = { data: response.data, cachedAt: Date.now() };
  return response.data;
};

export const setKospiManual = async (
  credit: 'rising' | 'falling' | 'stalling',
  forced: 'spike' | 'normal' | 'easing',
) => {
  const response = await api.post('/macro/kospi/manual', { credit, forced });
  cache.kospiBottom = null;
  return response.data;
};
