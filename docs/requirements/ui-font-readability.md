# 요구사항 문서: UI 글자 크기 개선 및 텍스트 잘림 수정

## 메타데이터
- 문서 ID: REQ-ui-font-001
- 버전: 1.0
- 작성일: 2026-03-22
- 상태: Approved

## 1. 기능 요구사항 (Functional Requirements)

| REQ-ID | 요구사항 | 우선순위 | 수락 기준 |
|--------|----------|----------|-----------|
| REQ-001 | 사이드바 메뉴 글자 크기 확대 | P1 | 메뉴 라벨 text-sm(14px), 배지 text-[11px], 사이드바 w-[220px] |
| REQ-002 | 레이아웃 헤더 글자 크기 확대 | P1 | 타이틀 text-base(16px), 세션 상태 text-sm(14px) |
| REQ-003 | 상태바 글자 크기 확대 | P2 | 모든 텍스트 text-sm(14px) 이상 |
| REQ-004 | 테이블 헤더/데이터 글자 크기 확대 | P1 | MetricsTable 헤더 text-sm(14px) |
| REQ-005 | 버튼/라벨 글자 크기 확대 | P1 | SimulationSettings, SavedPortfolioList, ETFSearch 버튼 text-sm(14px) |
| REQ-006 | 차트 축/범례 폰트 통일 | P1 | PerformanceChart, DividendSection, PieChart 최소 11px |
| REQ-007 | 텍스트 잘림(truncate) 개선 | P1 | PortfolioBuilder ETF명, SavedPortfolioList 포트폴리오명 가독성 확보 |

### REQ-001: 사이드바 메뉴 글자 크기 확대
- **설명**: Sidebar.tsx의 메뉴 라벨, 배지, 브랜드 텍스트 크기 확대 + 사이드바 너비 확대
- **우선순위**: P1
- **수락 기준**:
  - [ ] Given 사이드바가 펼쳐진 상태, When 메뉴를 보면, Then 라벨이 14px(text-sm)로 표시
  - [ ] Given 사이드바 배지, When NEW/SOON 배지를 보면, Then 11px 이상으로 표시
  - [ ] Given 사이드바 너비, When 펼쳐진 상태, Then 220px로 확대

### REQ-002: 레이아웃 헤더 글자 크기 확대
- **설명**: Layout.tsx 상단 헤더의 메뉴명과 세션 상태 글자 크기 확대
- **우선순위**: P1
- **수락 기준**:
  - [ ] Given 헤더 영역, When 활성 메뉴명을 보면, Then text-base(16px)로 표시
  - [ ] Given 헤더 우측, When SESSION/DATA 상태를 보면, Then text-sm(14px)로 표시

### REQ-003: 상태바 글자 크기 확대
- **설명**: StatusBar.tsx의 ONLINE, 날짜, 버전 텍스트 크기 확대
- **우선순위**: P2
- **수락 기준**:
  - [ ] Given 사이드바 하단, When 상태 정보를 보면, Then text-sm(14px)로 표시

### REQ-004: 테이블 헤더/데이터 글자 크기 확대
- **설명**: MetricsTable.tsx 테이블 헤더 글자 크기 확대
- **우선순위**: P1
- **수락 기준**:
  - [ ] Given 메트릭스 테이블, When 헤더(METRIC, PORTFOLIO 등)를 보면, Then text-sm(14px)

### REQ-005: 버튼/라벨 글자 크기 확대
- **설명**: SimulationSettings, SavedPortfolioList, ETFSearch의 버튼 텍스트 크기 확대
- **우선순위**: P1
- **수락 기준**:
  - [ ] Given 전략 선택 버튼, When 버튼 텍스트를 보면, Then text-sm(14px)로 표시
  - [ ] Given LOAD/DEL 버튼, When 버튼을 보면, Then text-sm(14px)로 가독성 확보
  - [ ] Given ADD 버튼, When ETF 검색 결과에서, Then 텍스트가 잘리지 않음

### REQ-006: 차트 축/범례 폰트 통일
- **설명**: 모든 차트의 축 라벨과 범례 폰트 크기를 최소 11px 이상으로 통일
- **우선순위**: P1
- **수락 기준**:
  - [ ] Given PerformanceChart, When 축 라벨을 보면, Then fontSize 12px
  - [ ] Given 상대성과 차트, When 축 라벨을 보면, Then fontSize 11px
  - [ ] Given DividendSection 차트, When 축 라벨을 보면, Then fontSize 12px
  - [ ] Given PortfolioPieChart, When 범례를 보면, Then fontSize 13px

### REQ-007: 텍스트 잘림(truncate) 개선
- **설명**: truncate로 인해 정보가 손실되는 부분을 개선
- **우선순위**: P1
- **수락 기준**:
  - [ ] Given PortfolioBuilder, When ETF 이름이 길 때, Then 툴팁 또는 줄바꿈으로 전체 표시
  - [ ] Given SavedPortfolioList, When 포트폴리오명이 길 때, Then 최소 너비 확보 또는 툴팁

## 2. 비기능 요구사항 (Non-Functional Requirements)

| NFR-ID | 카테고리 | 요구사항 | 측정 기준 |
|--------|----------|----------|-----------|
| NFR-001 | 일관성 | 동일 계층의 텍스트는 동일 크기 | 시각적 확인 |
| NFR-002 | 반응형 | 모바일에서도 읽기 가능 | 320px 이상 |
| NFR-003 | 호환성 | 기존 레이아웃 깨지지 않음 | 시각적 확인 |

## 3. 엣지 케이스

| EDGE-ID | 시나리오 | 예상 동작 | 관련 REQ |
|---------|----------|-----------|----------|
| EDGE-001 | 매우 긴 ETF 이름 (30자+) | 툴팁으로 전체 표시 | REQ-007 |
| EDGE-002 | 사이드바 접힌 상태 | 아이콘만 표시, 영향 없음 | REQ-001 |
| EDGE-003 | 모바일 화면(320px) | 레이아웃 깨지지 않음 | NFR-002 |

## 4. 제약 조건
- Tailwind CSS 클래스만 사용 (커스텀 CSS 최소화)
- 기존 다크 터미널 테마 유지
- 레이아웃 구조 변경 없음 (글자 크기/너비만 수정)
