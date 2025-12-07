# PRD: 월별 배당 통계 기능

## 1. 개요 (Overview)

### 목적
백테스트 결과에 포트폴리오의 월별 배당 통계를 추가하여 사용자가 배당 수익을 시각적으로 확인할 수 있도록 함

### 범위
- 포함: 백엔드 배당 데이터 계산, 프론트엔드 DividendSection 컴포넌트
- 제외: 배당 재투자 로직, 세금 계산, PerformanceChart 수정

### 성공 기준
- 백테스트 응답에 dividend_stats 필드 포함
- 월별 배당 막대 차트 표시
- 연도별 탭 전환 기능
- 기존 42개 테스트 모두 통과

## 2. 기능 명세 (Functional Specifications)

### 2.1 사용자 스토리
- As a 투자자, I want 포트폴리오의 월별 배당 통계를 보고 싶다, so that 배당 수익 패턴을 파악할 수 있다

### 2.2 수락 기준 (Acceptance Criteria)
- [x] Given 백테스트 실행, When 응답 수신, Then dividend_stats 필드 포함
- [x] Given 배당 데이터, When DividendSection 렌더링, Then 요약 카드 표시
- [x] Given 월별 데이터, When 차트 렌더링, Then 막대 차트 표시
- [x] Given 2년 이상 데이터, When 연도 탭 클릭, Then 해당 연도 데이터 표시
- [x] Given ETF별 배당, When 비중 표시, Then ETF별 색상으로 구분

### 2.3 기능 상세

| 기능 ID | 설명 | 우선순위 |
|---------|------|----------|
| F-001 | 배당 데이터 조회 (yfinance) | P1 |
| F-002 | 월별 배당 통계 계산 | P1 |
| F-003 | 요약 카드 (총 배당, 수익률, 평균) | P1 |
| F-004 | 월별 막대 차트 | P1 |
| F-005 | 연도별 탭 전환 | P2 |
| F-006 | ETF별 배당 비중 표시 | P2 |

## 3. 기술 명세 (Technical Specifications)

### 3.1 아키텍처

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API    │────▶│   yfinance      │
│ DividendSection │     │ /api/backtest    │     │ ticker.dividends│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### 3.2 데이터 모델

#### Backend (schemas.py)
```python
class MonthlyDividend(BaseModel):
    month: str              # "2023-01"
    amount: float           # 총 배당금
    by_etf: dict[str, float]  # ETF별 배당금

class DividendStats(BaseModel):
    total_dividends: float        # 총 배당금
    dividend_yield: float         # 배당 수익률 (%)
    monthly_average: float        # 월평균 배당
    monthly_data: list[MonthlyDividend]  # 월별 데이터
    by_etf: dict[str, float]      # ETF별 총 배당
```

#### Frontend (types/index.ts)
```typescript
interface MonthlyDividend {
  month: string;
  amount: number;
  by_etf: Record<string, number>;
}

interface DividendStats {
  total_dividends: number;
  dividend_yield: number;
  monthly_average: number;
  monthly_data: MonthlyDividend[];
  by_etf: Record<string, number>;
}
```

### 3.3 API 변경

#### BacktestResponse 수정
```python
class BacktestResponse(BaseModel):
    # ... 기존 필드 ...
    dividend_stats: Optional[DividendStats] = None  # 추가
```

### 3.4 컴포넌트 구조

```
DividendSection/
├── 요약 카드 (3개)
│   ├── 총 배당금
│   ├── 배당 수익률
│   └── 월평균 배당
├── 연도 탭
│   └── [2023] [2024] [전체]
└── 월별 차트 (BarChart)
    └── 스택형 막대 (ETF별 색상)
```

## 4. 테스트 계획 (Test Plan)

### 4.1 테스트 범위

| 레이어 | 테스트 유형 | 파일 |
|--------|------------|------|
| Backend | Unit | test_dividend.py |
| Frontend | Unit | DividendSection.test.tsx |

### 4.2 테스트 케이스

| TC-ID | 설명 | 타입 | 우선순위 |
|-------|------|------|----------|
| TC-DIV-001 | 배당 데이터 조회 | Unit | P1 |
| TC-DIV-002 | 월별 집계 계산 | Unit | P1 |
| TC-DIV-003 | 배당 수익률 계산 | Unit | P1 |
| TC-DIV-004 | 빈 배당 처리 | Unit | P1 |
| TC-DIV-005 | 연도 탭 전환 | Unit | P2 |
| TC-DIV-006 | 차트 렌더링 | Unit | P2 |

## 5. 엣지 케이스 & 오류 처리

### 5.1 엣지 케이스
- 배당 없는 ETF (QQQ 등): `dividend_stats.total_dividends = 0`
- 1년 미만 기간: 탭 없이 전체 표시
- 일부 ETF만 배당: 해당 ETF만 by_etf에 포함

### 5.2 오류 시나리오
- yfinance 배당 데이터 실패: 빈 배당 통계 반환 (에러 발생 안함)
- timezone 불일치: `tz_localize(None)`으로 처리

## 6. 구현 체크리스트

- [x] Phase 3: 테스트 작성 완료
  - [x] backend/tests/test_dividend.py (12개 테스트)
- [x] Phase 4: 구현 완료
  - [x] backend/app/services/data_fetcher.py - get_dividends, get_multiple_dividends 메서드
  - [x] backend/app/services/backtest_engine.py - calculate_dividend_stats 메서드
  - [x] backend/app/models/schemas.py - MonthlyDividend, DividendStats 모델
  - [x] backend/app/routers/backtest.py - dividend_stats 응답 추가
  - [x] frontend/src/types/index.ts - MonthlyDividend, DividendStats 타입
  - [x] frontend/src/components/DividendSection.tsx
  - [x] frontend/src/App.tsx - DividendSection 렌더링
- [x] Phase 5: 모든 테스트 통과 (35개)
- [x] Phase 6: 코드 리뷰 통과
- [x] Phase 7: 문서화 완료

## 7. 완료 정보

- **완료일**: 2025-12-07
- **백엔드 테스트**: 35개 통과 (기존 23개 + 신규 12개)
- **프론트엔드 빌드**: 성공
- **제약사항 준수**: PerformanceChart.tsx 미변경
