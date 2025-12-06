# PRD: 주식 포트폴리오 시뮬레이터 기능 업데이트 v2

## 1. 개요 (Overview)

### 1.1 목적
- 애플리케이션 이름을 한글화하여 사용자 친화성 향상
- 포트폴리오 저장/로드 기능으로 사용자 편의성 개선
- 파이 차트로 포트폴리오 구성 시각화
- 변동성 계산 정확성 검증 및 개선

### 1.2 범위
- **포함**: 이름 변경, 저장/로드 UI, 파이 차트, 변동성 계산 검증
- **제외**: 백엔드 저장소 변경 (localStorage 유지), 새로운 지표 추가

### 1.3 성공 기준
- [ ] 모든 "Portfolio Backtester" 텍스트가 "주식 포트폴리오 시뮬레이터"로 변경됨
- [ ] 사용자가 포트폴리오를 이름으로 저장하고 불러올 수 있음
- [ ] 포트폴리오 비중이 파이 차트로 시각화됨
- [ ] 변동성 계산이 업계 표준과 일치함

---

## 2. 기능 명세 (Functional Specifications)

### 2.1 사용자 스토리

| ID | 스토리 | 우선순위 |
|----|--------|----------|
| US-001 | 사용자로서, 애플리케이션 이름이 한글로 표시되길 원한다 | P1 |
| US-002 | 사용자로서, 현재 포트폴리오를 이름을 지정해 저장하고 싶다 | P1 |
| US-003 | 사용자로서, 저장된 포트폴리오 목록에서 선택해 불러오고 싶다 | P1 |
| US-004 | 사용자로서, 저장된 포트폴리오를 삭제하고 싶다 | P2 |
| US-005 | 사용자로서, 포트폴리오 비중을 파이 차트로 보고 싶다 | P1 |
| US-006 | 사용자로서, 정확한 변동성 지표를 확인하고 싶다 | P1 |

### 2.2 수락 기준 (Acceptance Criteria)

#### F-001: 이름 변경
- [x] Given 사용자가 앱에 접속하면, When 페이지가 로드될 때, Then 헤더에 "주식 포트폴리오 시뮬레이터"가 표시된다
- [x] Given 브라우저 탭, When 페이지가 로드될 때, Then 탭 제목이 "주식 포트폴리오 시뮬레이터"이다
- [x] Given API 문서, When /docs 접속 시, Then API 제목이 "주식 포트폴리오 시뮬레이터 API"이다

#### F-002: 포트폴리오 저장/로드
- [ ] Given 포트폴리오가 구성됨, When "저장" 클릭 시, Then 이름 입력 모달이 표시된다
- [ ] Given 이름 입력 후, When "확인" 클릭 시, Then localStorage에 저장되고 목록에 추가된다
- [ ] Given 저장된 포트폴리오가 있음, When 목록에서 선택 시, Then 해당 포트폴리오가 로드된다
- [ ] Given 저장된 포트폴리오가 있음, When 삭제 버튼 클릭 시, Then 해당 항목이 삭제된다

#### F-003: 파이 차트
- [ ] Given 포트폴리오에 ETF가 추가됨, When 화면 렌더링 시, Then 비중이 파이 차트로 표시된다
- [ ] Given 파이 차트, When 마우스 호버 시, Then 해당 ETF의 심볼과 비중이 툴팁으로 표시된다

#### F-004: 변동성 계산
- [ ] Given 백테스트 실행, When 결과 표시 시, Then 변동성이 퍼센트(%)로 표시된다
- [ ] Given 변동성 계산, When 연간화 적용 시, Then 표본 표준편차 * sqrt(252) 공식 사용

### 2.3 기능 상세

| 기능 ID | 설명 | 우선순위 | 상태 |
|---------|------|----------|------|
| F-001 | 앱 이름 "주식 포트폴리오 시뮬레이터"로 변경 | P1 | Todo |
| F-002 | 포트폴리오 저장/로드/삭제 기능 | P1 | Todo |
| F-003 | 포트폴리오 비중 파이 차트 | P1 | Todo |
| F-004 | 변동성 계산 검증 및 표시 형식 수정 | P1 | Todo |

---

## 3. 기술 명세 (Technical Specifications)

### 3.1 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
├─────────────────────────────────────────────────────┤
│  App.tsx (이름 변경)                                 │
│  ├── PortfolioBuilder.tsx                           │
│  │   ├── PortfolioPieChart.tsx (NEW)               │
│  │   └── SavedPortfolioList.tsx (NEW)              │
│  ├── SimulationSettings.tsx                         │
│  └── MetricsTable.tsx (변동성 표시 형식)            │
├─────────────────────────────────────────────────────┤
│  localStorage                                        │
│  ├── portfolio-simulator (현재 포트폴리오)          │
│  └── saved-portfolios (저장된 포트폴리오 목록)      │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                    Backend                           │
├─────────────────────────────────────────────────────┤
│  main.py (API 제목 변경)                            │
│  backtest_engine.py (변동성 계산 검증)              │
└─────────────────────────────────────────────────────┘
```

### 3.2 데이터 모델

```typescript
// 저장된 포트폴리오 타입
interface SavedPortfolio {
  id: string;           // UUID
  name: string;         // 사용자 지정 이름
  portfolio: PortfolioItem[];
  createdAt: string;    // ISO 날짜
  updatedAt: string;    // ISO 날짜
}

// localStorage 구조
interface SavedPortfoliosStorage {
  portfolios: SavedPortfolio[];
}
```

### 3.3 컴포넌트 명세

#### PortfolioPieChart.tsx
- **Props**: `portfolio: PortfolioItem[]`
- **Library**: Recharts (PieChart)
- **Features**: 툴팁, 레이블, 색상 팔레트

#### SavedPortfolioList.tsx
- **Props**: `onLoad: (portfolio: PortfolioItem[]) => void`
- **Features**: 목록 표시, 삭제 버튼, 저장 버튼

### 3.4 의존성
- 기존: `recharts` (이미 설치됨)
- 추가 없음

---

## 4. 테스트 계획 (Test Plan)

### 4.1 테스트 범위

| 타입 | 대상 | 도구 |
|------|------|------|
| Unit | 변동성 계산 | pytest |
| Unit | 저장/로드 로직 | Vitest (필요시) |
| Integration | 파이 차트 렌더링 | 수동 |

### 4.2 테스트 케이스 개요

| TC-ID | 설명 | 타입 | 우선순위 |
|-------|------|------|----------|
| TC-001 | 변동성 계산 정확성 | Unit | P1 |
| TC-002 | 빈 포트폴리오 변동성 | Unit | P1 |
| TC-003 | 연간화 계산 검증 | Unit | P1 |

---

## 5. 엣지 케이스 & 오류 처리

### 5.1 엣지 케이스
- 빈 포트폴리오에서 저장 시도 → 저장 버튼 비활성화
- 중복 이름 저장 → 덮어쓰기 확인
- 저장된 포트폴리오 없음 → "저장된 포트폴리오가 없습니다" 메시지

### 5.2 오류 시나리오
- localStorage 접근 실패 → try/catch로 처리, 콘솔 로그
- 파이 차트 렌더링 실패 → 빈 포트폴리오일 때 차트 숨김

---

## 6. 구현 체크리스트

- [ ] Phase 3: 테스트 작성 완료
- [ ] Phase 4: 구현 완료
- [ ] Phase 5: 모든 테스트 통과
- [ ] Phase 6: 코드 리뷰 통과
- [ ] Phase 7: 문서화 완료

---

## 7. 변경 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| frontend/index.html | 수정 | title 변경 |
| frontend/src/App.tsx | 수정 | 헤더 텍스트 변경 |
| backend/app/main.py | 수정 | API 제목 변경 |
| frontend/src/components/PortfolioPieChart.tsx | 신규 | 파이 차트 컴포넌트 |
| frontend/src/components/SavedPortfolioList.tsx | 신규 | 저장/로드 컴포넌트 |
| frontend/src/components/PortfolioBuilder.tsx | 수정 | 파이 차트, 저장 버튼 통합 |
| frontend/src/components/MetricsTable.tsx | 수정 | 변동성 표시 형식 |
| backend/app/services/backtest_engine.py | 검증 | 변동성 계산 확인 |
