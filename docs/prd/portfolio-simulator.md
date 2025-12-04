# PRD: Portfolio Backtester

## 1. 개요 (Overview)

### 목적
사용자가 ETF로 포트폴리오를 구성하고, 과거 데이터를 기반으로 백테스트하여 QQQ, SPY 벤치마크와 성과를 비교하는 웹 애플리케이션

### 범위
- 포함: ETF 검색, 포트폴리오 구성, 백테스트 시뮬레이션, 성과 비교 차트
- 제외: 사용자 인증, 실시간 데이터, 주식(개별종목), 옵션/선물

### 성공 기준
- 백테스트 결과가 10초 내 응답
- CAGR, MDD, Sharpe Ratio, Volatility 지표 정확도 99% 이상
- 차트가 정상적으로 렌더링

---

## 2. 기능 명세 (Functional Specifications)

### 2.1 사용자 스토리

1. As a 투자자, I want ETF를 검색하여 포트폴리오에 추가, so that 원하는 자산 배분을 구성할 수 있다
2. As a 투자자, I want 각 ETF의 비중을 설정, so that 포트폴리오 비중을 조절할 수 있다
3. As a 투자자, I want 기간과 초기 투자금을 설정하여 백테스트 실행, so that 과거 성과를 확인할 수 있다
4. As a 투자자, I want QQQ, SPY와 성과 비교, so that 벤치마크 대비 성과를 평가할 수 있다

### 2.2 수락 기준 (Acceptance Criteria)

#### F-001: ETF 검색
- [x] Given ETF 심볼 또는 이름 입력, When 검색 실행, Then 매칭되는 ETF 목록 반환
- [x] Given 검색 결과, When ETF 선택, Then 포트폴리오에 추가

#### F-002: 포트폴리오 구성
- [x] Given 포트폴리오에 ETF 추가, When 비중 입력, Then 비중 반영
- [x] Given 포트폴리오 구성 완료, When 비중 합계, Then 100%여야 함 (경고 표시)
- [x] Given 포트폴리오, When 페이지 새로고침, Then localStorage에서 복원

#### F-003: 백테스트 실행
- [x] Given 포트폴리오와 설정, When 시뮬레이션 실행, Then 일별 포트폴리오 가치 계산
- [x] Given 리밸런싱 주기 설정, When 해당 주기 도래, Then 비중 재조정 반영

#### F-004: 성과 비교
- [x] Given 백테스트 완료, When 결과 표시, Then 라인 차트로 시각화
- [x] Given 백테스트 완료, When 지표 계산, Then CAGR, MDD, Sharpe, Volatility 표시

### 2.3 기능 상세

| 기능 ID | 설명 | 우선순위 | 상태 |
|---------|------|----------|------|
| F-001 | ETF 검색 API | P1 | Todo |
| F-002 | 포트폴리오 구성 UI | P1 | Todo |
| F-003 | 백테스트 엔진 | P1 | Todo |
| F-004 | 성과 비교 차트 | P1 | Todo |
| F-005 | 성과 지표 테이블 | P1 | Todo |
| F-006 | 시뮬레이션 설정 UI | P2 | Todo |

---

## 3. 기술 명세 (Technical Specifications)

### 3.1 아키텍처

```
┌─────────────┐     HTTP      ┌─────────────┐     yfinance    ┌─────────────┐
│   React     │ ──────────────│   FastAPI   │ ────────────────│   Yahoo     │
│  Frontend   │               │   Backend   │                 │  Finance    │
└─────────────┘               └─────────────┘                 └─────────────┘
      │                             │
      │ localStorage                │ pandas
      ▼                             ▼
┌─────────────┐               ┌─────────────┐
│  Portfolio  │               │  Backtest   │
│   Storage   │               │   Engine    │
└─────────────┘               └─────────────┘
```

### 3.2 데이터 모델

#### Backend (Pydantic)

```python
class PortfolioItem(BaseModel):
    symbol: str
    weight: float  # 0.0 ~ 1.0

class BacktestRequest(BaseModel):
    portfolio: list[PortfolioItem]
    start_date: date
    end_date: date
    initial_amount: float = 10000
    rebalance: str = "quarterly"  # monthly, quarterly, yearly, none

class BacktestMetrics(BaseModel):
    cagr: float
    mdd: float
    sharpe_ratio: float
    volatility: float

class BacktestResponse(BaseModel):
    portfolio_values: list[dict]  # [{date, value}]
    benchmarks: dict  # {QQQ: [...], SPY: [...]}
    metrics: BacktestMetrics
    benchmark_metrics: dict  # {QQQ: BacktestMetrics, SPY: BacktestMetrics}
```

#### Frontend (TypeScript)

```typescript
interface PortfolioItem {
  symbol: string;
  name: string;
  weight: number;
}

interface BacktestResult {
  portfolioValues: { date: string; value: number }[];
  benchmarks: {
    QQQ: { date: string; value: number }[];
    SPY: { date: string; value: number }[];
  };
  metrics: {
    cagr: number;
    mdd: number;
    sharpeRatio: number;
    volatility: number;
  };
}
```

### 3.3 API 엔드포인트

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/etf/search?q={query} | ETF 검색 |
| GET | /api/etf/{symbol} | ETF 정보 조회 |
| POST | /api/backtest | 백테스트 실행 |

### 3.4 의존성

#### Backend
- fastapi, uvicorn: 웹 프레임워크
- yfinance: 주가 데이터
- pandas, numpy: 데이터 처리
- pydantic: 스키마 검증

#### Frontend
- react, vite: UI 프레임워크
- recharts: 차트
- tailwindcss: 스타일링
- axios: HTTP 클라이언트

---

## 4. 테스트 계획 (Test Plan)

### 4.1 테스트 범위

#### 단위 테스트 (Unit Tests)
- 백테스트 엔진: CAGR, MDD, Sharpe, Volatility 계산
- 리밸런싱 로직
- 데이터 정규화

#### 통합 테스트 (Integration Tests)
- ETF 검색 API
- 백테스트 API 전체 플로우

### 4.2 테스트 케이스 개요

| TC-ID | 설명 | 타입 | 우선순위 |
|-------|------|------|----------|
| TC-001 | CAGR 계산 정확도 | Unit | P1 |
| TC-002 | MDD 계산 정확도 | Unit | P1 |
| TC-003 | Sharpe Ratio 계산 | Unit | P1 |
| TC-004 | 리밸런싱 로직 (분기별) | Unit | P1 |
| TC-005 | 백테스트 API 응답 | Integration | P1 |
| TC-006 | ETF 검색 API | Integration | P2 |

---

## 5. 엣지 케이스 & 오류 처리

### 5.1 엣지 케이스

| 케이스 | 처리 방법 |
|--------|-----------|
| ETF 데이터 없음 | 에러 메시지 반환 |
| 비중 합계 != 100% | 경고 표시, 정규화 옵션 |
| 시작일 > 종료일 | 입력 검증 에러 |
| 너무 긴 기간 (10년+) | 정상 처리 (yfinance 제한 내) |

### 5.2 오류 시나리오

| 오류 | 복구 전략 |
|------|-----------|
| yfinance API 실패 | 재시도 (3회) 후 에러 반환 |
| 잘못된 심볼 | "Invalid symbol" 에러 |
| 네트워크 오류 | 프론트엔드에서 재시도 안내 |

---

## 6. 비기능적 요구사항

### 6.1 성능
- 백테스트 API 응답 시간: < 10초 (5년 데이터 기준)
- 프론트엔드 초기 로드: < 3초

### 6.2 보안
- CORS 설정 (허용된 origin만)
- 입력 검증 (Pydantic)

### 6.3 확장성
- ETF 목록 캐싱 가능
- 벤치마크 추가 용이

---

## 7. 구현 체크리스트

- [ ] Phase 3: 테스트 작성 완료
- [ ] Phase 4: 구현 완료
- [ ] Phase 5: 모든 테스트 통과
- [ ] Phase 6: 코드 리뷰 통과
- [ ] Phase 7: 문서화 완료
