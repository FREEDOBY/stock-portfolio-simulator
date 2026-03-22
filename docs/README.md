# Stock Portfolio Simulator - Product Overview

## 1. Overview

ETF/주식 포트폴리오를 구성하고 과거 데이터로 백테스트하여 QQQ, SPY와 성과를 비교하는 풀스택 웹 애플리케이션입니다. 한국(KOSPI/KOSDAQ) 및 해외(US) 종목을 모두 지원하며, 거치식/적립식/이동평균 적립식 투자 전략을 시뮬레이션합니다.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (Production)                      │
│  ┌──────────────────────┐    ┌────────────────────────────────┐ │
│  │  Frontend (Static)   │    │  API (Serverless Python)       │ │
│  │  React + Vite        │───▶│  FastAPI                       │ │
│  │  /frontend/dist      │    │  /api/index.py                 │ │
│  └──────────────────────┘    └──────────┬─────────────────────┘ │
└─────────────────────────────────────────┼───────────────────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    ┌──────────┐   ┌──────────┐   ┌──────────┐
                    │ yfinance │   │  pykrx   │   │ FMP API  │
                    │ (US ETF) │   │ (KR 종목) │   │ (Search) │
                    └──────────┘   └──────────┘   └──────────┘
```

### Request Flow

```
Browser → Frontend (React)
           │
           ├─ GET  /api/etf/search?q=SPY     → ETF 검색
           ├─ GET  /api/etf/{symbol}          → 종목 정보 조회
           └─ POST /api/backtest              → 백테스트 실행
                    │
                    ▼
              FastAPI Router
                    │
                    ├─ DataFetcher.get_price_history()   → yfinance
                    ├─ DataFetcher.get_dividends()       → yfinance
                    ├─ KoreanStockService.search()       → pykrx
                    ├─ ExchangeRateService.convert()     → USD/KRW 환율
                    └─ BacktestEngine.run_backtest()     → 시뮬레이션
                         │
                         ▼
                    BacktestResponse (JSON)
                    ├─ portfolio_values[]    (일별 포트폴리오 가치)
                    ├─ benchmarks{}         (QQQ, SPY 벤치마크)
                    ├─ metrics{}            (CAGR, MDD, Sharpe, Vol)
                    ├─ benchmark_metrics{}  (벤치마크 지표)
                    ├─ total_invested       (총 투자 원금)
                    └─ dividend_stats{}     (배당 통계)
```

## 3. Tech Stack

### Frontend

| 기술 | 버전 | 용도 |
|------|------|------|
| React | 19.2 | UI 프레임워크 |
| TypeScript | 5.9 | 타입 안전성 |
| Vite | 7.2 | 빌드 도구 + HMR 개발 서버 |
| Tailwind CSS | 4.1 | 유틸리티 기반 스타일링 |
| Recharts | 3.5 | 차트 시각화 (Line, Bar, Pie, Area) |
| Axios | 1.13 | HTTP 클라이언트 |
| Vitest | 4.0 | 테스트 프레임워크 |
| Testing Library | 16.3 | 컴포넌트 테스트 유틸리티 |

### Backend

| 기술 | 버전 | 용도 |
|------|------|------|
| Python | 3.11+ | 런타임 |
| FastAPI | 0.104+ | API 프레임워크 |
| Pydantic | 2.5+ | 요청/응답 스키마 검증 |
| yfinance | 0.2.33+ | US 주가/배당 데이터 수집 |
| pykrx | 1.0.51+ | 한국 주식 데이터 (KOSPI/KOSDAQ) |
| Pandas | 2.1+ | 데이터 처리 |
| NumPy | 1.26+ | 수치 계산 (CAGR, MDD, Sharpe 등) |
| httpx | - | FMP API 호출 |

### Deployment

| 기술 | 용도 |
|------|------|
| Vercel | 호스팅 (Frontend: Static Build, Backend: Serverless Function) |
| vercel.json | 라우팅 규칙 (/api/* → Python, /* → Frontend) |

## 4. Project Structure

```
stock-portfolio-simulator/
│
├── frontend/                          # React 프론트엔드
│   ├── src/
│   │   ├── App.tsx                    # Layout 렌더링 (진입점)
│   │   ├── main.tsx                   # React DOM 마운트
│   │   ├── index.css                  # 글로벌 스타일 (다크 테마)
│   │   │
│   │   ├── config/
│   │   │   └── menuItems.ts           # 사이드바 메뉴 설정 (확장 포인트)
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts               # 도메인 타입 (Portfolio, Backtest)
│   │   │   └── navigation.ts          # 네비게이션 타입 (MenuItem, SidebarProps)
│   │   │
│   │   ├── components/
│   │   │   ├── Layout.tsx             # 전체 레이아웃 (Sidebar + Content)
│   │   │   ├── Sidebar.tsx            # 좌측 네비게이션 (접힘/펼침)
│   │   │   ├── StatusBar.tsx          # 사이드바 하단 상태 표시
│   │   │   ├── ComingSoon.tsx         # 미구현 기능 플레이스홀더
│   │   │   │
│   │   │   ├── PortfolioSimulator.tsx # 메인 시뮬레이터 뷰
│   │   │   ├── PortfolioBuilder.tsx   # 포트폴리오 종목 구성
│   │   │   ├── ETFSearch.tsx          # ETF/주식 검색 + 직접 추가
│   │   │   ├── SimulationSettings.tsx # 시뮬레이션 파라미터 설정
│   │   │   ├── PerformanceChart.tsx   # 성과 차트 (줌, 벤치마크 비교)
│   │   │   ├── MetricsTable.tsx       # 성과 지표 테이블 (CAGR, MDD 등)
│   │   │   ├── PortfolioPieChart.tsx  # 포트폴리오 비중 도넛 차트
│   │   │   ├── SavedPortfolioList.tsx # 포트폴리오 저장/불러오기
│   │   │   └── DividendSection.tsx    # 배당 통계 및 월별 차트
│   │   │
│   │   ├── api/
│   │   │   └── index.ts              # API 호출 함수 (axios)
│   │   │
│   │   └── utils/
│   │       ├── chartUtils.ts          # 차트 데이터 변환
│   │       ├── dividendChartUtils.ts  # 배당 차트 유틸
│   │       └── stockUtils.ts          # 한국 종목 판별
│   │
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── tsconfig.json
│
├── backend/                           # Python 백엔드
│   ├── app/
│   │   ├── main.py                    # FastAPI 앱 (CORS, 라우터 등록)
│   │   │
│   │   ├── models/
│   │   │   └── schemas.py             # Pydantic 스키마 (Request/Response)
│   │   │
│   │   ├── routers/
│   │   │   ├── etf.py                 # GET /api/etf/search, GET /api/etf/{symbol}
│   │   │   └── backtest.py            # POST /api/backtest
│   │   │
│   │   └── services/
│   │       ├── data_fetcher.py        # 주가/배당 데이터 수집 (yfinance, FMP)
│   │       ├── backtest_engine.py     # 백테스트 시뮬레이션 엔진
│   │       ├── korean_stock_service.py # 한국 종목 검색 (pykrx)
│   │       └── exchange_rate.py       # USD/KRW 환율 변환
│   │
│   └── tests/
│       ├── test_backtest_engine.py
│       └── test_dividend.py
│
├── api/
│   ├── index.py                       # Vercel Serverless 진입점
│   └── requirements.txt               # Vercel Python 의존성
│
├── vercel.json                        # Vercel 배포 설정
├── requirements.txt                   # Python 의존성
│
└── docs/
    ├── README.md                      # 이 문서
    ├── requirements/                  # 요구사항 문서
    └── architecture/                  # 아키텍처 설계 문서
```

## 5. Features

### 5.1 Portfolio Management
- ETF/주식 검색 (자동완성, 한국+해외)
- 종목 직접 추가 (심볼 입력)
- 비중 설정 (0~100%) + 100% 자동 정규화
- 포트폴리오 저장/불러오기 (localStorage)
- 비중 도넛 차트 시각화

### 5.2 Investment Strategies
| 전략 | 설명 |
|------|------|
| Lump Sum (거치식) | 초기 금액 일시 투자 |
| DCA (적립식) | 일/주/격주/월 정기 투자 |
| MA-DCA (이동평균 적립식) | 가격 < 이동평균 시 배수 매수 |

### 5.3 Backtest Results
- 성과 차트 (금액/수익률 뷰, 마우스 휠 줌)
- 벤치마크 비교 (QQQ, SPY 토글)
- 저조 구간 시각화 (Underperformance shading)
- 상대 성과 차트 (초과/미달 수익률)
- 성과 지표 비교 (CAGR, MDD, Sharpe Ratio, Volatility)
- 투자 요약 (투자 원금, 최종 자산, P&L)
- 배당 통계 (총 배당, 수익률, 월별 차트, ETF별 분리)

### 5.4 UI/UX
- 금융 터미널 다크 테마 (Bloomberg-inspired)
- 접힘/펼침 사이드바 네비게이션
- 모바일 반응형 (햄버거 메뉴)
- 확장 가능한 메뉴 구조 (config 기반)

## 6. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/etf/search?q={query}` | ETF/주식 검색 (한국+해외) |
| GET | `/api/etf/{symbol}` | 개별 종목 정보 조회 |
| POST | `/api/backtest` | 백테스트 실행 |
| GET | `/health` | 헬스 체크 |

### POST /api/backtest Request Body
```json
{
  "portfolio": [
    { "symbol": "SPY", "weight": 0.6 },
    { "symbol": "QQQ", "weight": 0.4 }
  ],
  "start_date": "2020-01-01",
  "end_date": "2025-01-01",
  "initial_amount": 10000,
  "rebalance": "quarterly",
  "investment_type": "lump_sum",
  "dca_settings": null,
  "ma_dca_settings": null
}
```

## 7. Backend Services

| Service | File | 역할 |
|---------|------|------|
| DataFetcher | `data_fetcher.py` | yfinance/FMP로 주가/배당 데이터 수집, ETF 검색 |
| BacktestEngine | `backtest_engine.py` | 포트폴리오 시뮬레이션, 지표 계산 (CAGR, MDD, Sharpe, Vol) |
| KoreanStockService | `korean_stock_service.py` | pykrx로 KOSPI/KOSDAQ 전체 종목 검색 |
| ExchangeRateService | `exchange_rate.py` | USD/KRW 환율 조회 및 원화→달러 변환 |

### Data Sources
| Source | 용도 | 비고 |
|--------|------|------|
| yfinance | US 주가, 배당, 환율 | 무료, 실시간 |
| pykrx | 한국 종목명/코드 검색 | 무료, 로컬 전용 (Vercel 미지원) |
| FMP API | ETF 확장 검색 | API Key 필요 (선택) |

## 8. Development

### Local Setup
```bash
# Backend
pip install -r requirements.txt
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

### Environment Variables
| 변수 | 필수 | 설명 |
|------|------|------|
| `VITE_API_URL` | N | 프론트엔드 API Base URL (기본: `/api`) |
| `FMP_API_KEY` | N | Financial Modeling Prep API 키 |
| `VERCEL` | Auto | Vercel 환경 자동 감지 |
| `FRONTEND_URL` | N | CORS 허용 URL |

### Testing
```bash
# Frontend tests (49 tests)
cd frontend && npm run test:run

# Backend tests
cd backend && pytest
```
