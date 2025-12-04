# Portfolio Backtester

ETF 포트폴리오를 구성하고 백테스트를 통해 QQQ, SPY 벤치마크와 성과를 비교하는 웹 애플리케이션입니다.

## 기능

- ETF 검색 및 포트폴리오 구성
- 백테스트 시뮬레이션 (기간, 초기 투자금, 리밸런싱 주기 설정)
- QQQ, SPY 벤치마크 대비 성과 비교
- 성과 지표: CAGR, MDD, Sharpe Ratio, Volatility
- 라인 차트 시각화
- localStorage 기반 포트폴리오 저장

## 기술 스택

### Backend
- FastAPI
- yfinance (Yahoo Finance 데이터)
- pandas, numpy

### Frontend
- React + Vite + TypeScript
- Recharts (차트)
- Tailwind CSS

## 설치 및 실행

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend 서버: http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend 서버: http://localhost:5173

## API 엔드포인트

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/etf/search?q={query} | ETF 검색 |
| GET | /api/etf/{symbol} | ETF 정보 조회 |
| POST | /api/backtest | 백테스트 실행 |

## 테스트

```bash
cd backend
pytest tests/ -v
```

## 프로젝트 구조

```
stock-portfolio-simulator/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 앱
│   │   ├── routers/             # API 라우터
│   │   ├── services/            # 비즈니스 로직
│   │   └── models/              # Pydantic 스키마
│   ├── tests/                   # 테스트
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/          # React 컴포넌트
│   │   ├── api/                 # API 클라이언트
│   │   └── types/               # TypeScript 타입
│   └── package.json
│
└── docs/
    └── prd/                     # PRD 문서
```

## 라이선스

MIT License
