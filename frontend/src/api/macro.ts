import axios from 'axios';
import type { DashboardData } from '../types/macro';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 매크로 데이터는 시간이 걸릴 수 있음
});

export const fetchDashboard = async (): Promise<DashboardData> => {
  const response = await api.get('/macro/dashboard');
  return response.data;
};

export const fetchCategoryDetail = async (category: string): Promise<Record<string, unknown>> => {
  const response = await api.get(`/macro/category/${category}`);
  return response.data;
};

export const fetchSignalHistory = async () => {
  const response = await api.get('/macro/signals/history');
  return response.data;
};

export const setElliottCount = async (count: number) => {
  const response = await api.post('/macro/elliott', { count });
  return response.data;
};
