import axios from 'axios';
import type { ETFInfo, BacktestRequest, BacktestResult } from '../types';

const API_BASE = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

export const searchETF = async (query: string): Promise<ETFInfo[]> => {
  const response = await api.get(`/etf/search?q=${encodeURIComponent(query)}`);
  return response.data.results;
};

export const getETFInfo = async (symbol: string): Promise<ETFInfo> => {
  const response = await api.get(`/etf/${symbol}`);
  return response.data;
};

export const validateSymbol = async (symbol: string): Promise<ETFInfo | null> => {
  try {
    const response = await api.get(`/etf/${symbol}`);
    return response.data;
  } catch {
    return null;
  }
};

export const runBacktest = async (request: BacktestRequest): Promise<BacktestResult> => {
  const response = await api.post('/backtest', request);
  return response.data;
};
