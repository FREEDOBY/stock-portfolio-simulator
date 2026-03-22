# Macro Dashboard Implementation Plan

## Overview

`Macro_dashboard.md` 요구사항을 6개 단계(Phase)로 분할하여 각 Phase를 독립적인 Agentic Workflow로 실행합니다. 각 Phase는 이전 Phase에 의존하며, 순차적으로 실행합니다.

---

## Dependency Graph

```
Phase 1: FRED API 서비스 + 데이터 수집
    │
    ▼
Phase 2: 파생 지표 계산 엔진
    │
    ▼
Phase 3: 매매 시그널 판정 엔진 (6개 시그널 + 종합 점수)
    │
    ▼
Phase 4: Backend API 엔드포인트 통합
    │
    ▼
Phase 5: Frontend 매크로 대시보드 메인 페이지
    │
    ▼
Phase 6: Frontend 상세 분석 페이지 (5개 탭)
```

---

## Phase 1: FRED API 서비스 + 데이터 수집

### 목표
FRED API와 Yahoo Finance에서 매크로 데이터를 수집하는 백엔드 서비스 구현

### 생성 파일
```
backend/app/services/fred_service.py        # FRED API 클라이언트
backend/app/services/macro_data_fetcher.py  # 매크로 데이터 통합 수집
backend/app/models/macro_schemas.py         # 매크로 Pydantic 스키마
backend/tests/test_fred_service.py          # Unit Test
```

### 상세 범위
- FRED API 클라이언트 (`fredapi` 또는 직접 HTTP)
  - 18개 시리즈 ID 수집 (USALOLITOAASTSAM, NAPM, T10Y2Y 등)
  - API 키 환경변수 관리
  - 에러 핸들링 + 마지막 성공 데이터 캐싱
- Yahoo Finance 매크로 데이터 수집
  - ^IXIC (나스닥 주봉/일봉), ^VIX, DX-Y.NYB
- Pydantic 스키마 정의
  - MacroDataResponse, FREDSeries, YahooSeries 등

### 의존성
- `fredapi` 또는 `httpx` (FRED REST API 직접 호출)
- 기존 `yfinance` 재사용

### 예상 테스트
- FRED API 호출 mock 테스트
- Yahoo Finance 매크로 데이터 수집 테스트
- 에러 핸들링 (API 실패 시 캐시 유지)

---

## Phase 2: 파생 지표 계산 엔진

### 목표
수집된 원시 데이터로부터 14개 파생 지표를 계산하는 엔진 구현

### 생성 파일
```
backend/app/services/macro_calculator.py    # 파생 지표 계산
backend/tests/test_macro_calculator.py      # Unit Test
```

### 상세 범위

| 지표 | 계산 방법 |
|------|----------|
| OECD CLI MoM% | (CLI[t] - CLI[t-1]) / CLI[t-1] × 100 |
| CLI MoM% 가속도 | MoM%[t] - MoM%[t-1] |
| M2 YoY% | (M2[t] - M2[t-12]) / M2[t-12] × 100 |
| 200주 SMA | 주봉 종가 200주 단순이동평균 |
| 50주 SMA | 주봉 종가 50주 단순이동평균 |
| MACD선 | EMA(12주) - EMA(26주) |
| MACD 시그널선 | EMA(MACD선, 9주) |
| MACD 히스토그램 | MACD선 - 시그널선 |
| RSI (14주) | 14주간 상승평균 / (상승평균+하락평균) × 100 |
| 200주선 대비 거리% | (현재가 - SMA200) / SMA200 × 100 |
| Drawdown% | (현재가 - 52주최고가) / 52주최고가 × 100 |
| 버핏지표% | WILSHIRE / GDP × 100 |
| ISM PMI 트렌드 | 3개월 이동평균 방향 |
| 재고/출하비율 트렌드 | 3개월 이동평균 방향 |

### 의존성
- Phase 1 (데이터 수집 서비스)
- `pandas`, `numpy` (기존 의존성)

### 예상 테스트
- 각 지표별 계산 정확성 (고정 입력 → 예상 출력)
- 엣지 케이스 (데이터 부족, NaN 처리)

---

## Phase 3: 매매 시그널 판정 엔진

### 목표
6개 매매 시그널 + 종합 점수 계산 엔진 구현

### 생성 파일
```
backend/app/services/signal_engine.py       # 시그널 판정 로직
backend/app/models/signal_schemas.py        # 시그널 스키마
backend/tests/test_signal_engine.py         # Unit Test
```

### 상세 범위

| 시그널 | 로직 |
|--------|------|
| 시그널 1 | 적립식 매수 (항상 ON, +1) |
| 시그널 2 | OECD CLI MoM% 3개월 연속 패턴 |
| 시그널 3 | 키친사이클 4단계 (PMI 트렌드 + 재고/출하) + CLI 교차검증 |
| 시그널 4-매수 | 200주선 접근 거리% 기반 |
| 시그널 4-매도 | MACD 3쌍봉 하락다이버전스 + 엘리엇(수동) |
| 시그널 5 | MACD 쌍바닥 상승다이버전스 + RSI |
| 시그널 6 | 계단식법 (Drawdown 기반, 하락기 전용) |

종합 점수: 가중합산 → 5단계 판정 (적극매수/매수/관망/주의/매도)
시그널 히스토리 로그 (상태 변경 이력 저장)

### 의존성
- Phase 2 (파생 지표 계산)

### 예상 테스트
- 각 시그널별 매수/매도/대기 판정 테스트
- 종합 점수 가중합산 테스트
- 키친사이클 Phase 판별 테스트
- MACD 다이버전스 감지 테스트
- 시그널 히스토리 기록 테스트

---

## Phase 4: Backend API 엔드포인트 통합

### 목표
매크로 데이터 + 시그널을 제공하는 API 엔드포인트 구현

### 생성 파일
```
backend/app/routers/macro.py               # 매크로 API 라우터
backend/tests/test_macro_router.py          # Integration Test
```

### 수정 파일
```
backend/app/main.py                         # 라우터 등록
requirements.txt                            # fredapi 의존성 추가
```

### API 엔드포인트

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/macro/dashboard` | 대시보드 요약 (종합 점수 + 5개 카테고리 + 6개 시그널) |
| GET | `/api/macro/category/{name}` | 카테고리별 상세 데이터 (차트용) |
| GET | `/api/macro/signals/history` | 시그널 상태 변경 이력 |
| POST | `/api/macro/elliott` | 엘리엇 파동 수동 입력 |

### 의존성
- Phase 3 (시그널 엔진)

### 예상 테스트
- 엔드포인트별 응답 스키마 검증
- 에러 핸들링 (FRED API 실패 등)

---

## Phase 5: Frontend 매크로 대시보드 메인 페이지

### 목표
사이드바 "매크로 대시보드" 메뉴 + 메인 페이지 UI 구현

### 생성 파일
```
frontend/src/components/macro/MacroDashboard.tsx     # 메인 대시보드
frontend/src/components/macro/VerdictBanner.tsx       # 종합 판정 영역
frontend/src/components/macro/CategoryCard.tsx        # 카테고리 요약 카드
frontend/src/components/macro/SignalTable.tsx          # 시그널 상태 테이블
frontend/src/components/macro/SignalHistory.tsx        # 시그널 히스토리 로그
frontend/src/api/macro.ts                             # 매크로 API 호출
frontend/src/types/macro.ts                           # 매크로 타입
```

### 수정 파일
```
frontend/src/config/menuItems.ts                      # 메뉴 2개 추가
```

### 상세 범위
- 종합 판정 배너 (5단계: 적극매수~매도, 점수, 업데이트 시간)
- 5개 카테고리 요약 카드 (카테고리명, 상태 색상, 핵심 수치)
- 카드 클릭 → 상세 분석 해당 탭 이동
- 6개 시그널 상태 테이블
- 시그널 히스토리 로그

### 의존성
- Phase 4 (API 엔드포인트)
- 기존 사이드바/레이아웃 구조

---

## Phase 6: Frontend 상세 분석 페이지 (5개 탭)

### 목표
상세 분석 페이지 + 5개 탭 + 모든 차트 구현

### 생성 파일
```
frontend/src/components/macro/DetailedAnalysis.tsx     # 상세 분석 메인
frontend/src/components/macro/tabs/BusinessCycleTab.tsx   # 탭1: 경기 사이클
frontend/src/components/macro/tabs/LiquidityTab.tsx       # 탭2: 유동성 & 금리
frontend/src/components/macro/tabs/TechnicalTab.tsx       # 탭3: 기술적 시그널
frontend/src/components/macro/tabs/SentimentTab.tsx        # 탭4: 시장 심리
frontend/src/components/macro/tabs/ValuationTab.tsx        # 탭5: 밸류에이션
frontend/src/components/macro/charts/CycleDiagram.tsx      # 키친사이클 원형 다이어그램
frontend/src/components/macro/charts/MacdChart.tsx         # MACD 차트 (다이버전스 마커)
frontend/src/components/macro/charts/GaugeChart.tsx        # 게이지 차트
```

### 상세 범위

| 탭 | 차트 수 |
|-----|---------|
| 경기 사이클 | 5개 (라인, 멀티라인, 영역, 라인+기준선, 사이클 다이어그램) |
| 유동성 & 금리 | 6개 (라인, 멀티라인, 바+라인 복합, 영역) |
| 기술적 시그널 | 5개 (멀티라인, MACD 복합, RSI, 게이지, 숫자) |
| 시장 심리 | 3개 (영역, 라인) |
| 밸류에이션 | 2개 (멀티라인, 라인+기준선) |

- 엘리엇 파동 수동 입력 필드 (탭3)
- MACD 다이버전스 마커 표시 (탭3)
- 키친사이클 원형 다이어그램 (탭1)

### 의존성
- Phase 5 (대시보드 메인)
- 기존 Recharts 라이브러리

---

## Summary

| Phase | 범위 | 예상 파일 수 | 의존성 |
|-------|------|-------------|--------|
| **Phase 1** | FRED API + 데이터 수집 | 4 | 없음 |
| **Phase 2** | 파생 지표 계산 | 2 | Phase 1 |
| **Phase 3** | 시그널 판정 엔진 | 3 | Phase 2 |
| **Phase 4** | API 엔드포인트 통합 | 2 (+수정 2) | Phase 3 |
| **Phase 5** | FE 대시보드 메인 | 7 (+수정 1) | Phase 4 |
| **Phase 6** | FE 상세 분석 5탭 | 9 | Phase 5 |

**총: 27+ 새 파일, 3 수정 파일**

---

## Execution

각 Phase를 `/agentic-workflow`로 실행:

```
/agentic-workflow Phase 1: FRED API 서비스 + 매크로 데이터 수집
/agentic-workflow Phase 2: 파생 지표 계산 엔진
/agentic-workflow Phase 3: 매매 시그널 판정 엔진
/agentic-workflow Phase 4: Backend API 엔드포인트 통합
/agentic-workflow Phase 5: Frontend 매크로 대시보드 메인
/agentic-workflow Phase 6: Frontend 상세 분석 5개 탭
```
