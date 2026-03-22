# RTM: UI 글자 크기 개선 및 텍스트 잘림 수정

## 메타데이터
- 생성일: 2026-03-22
- 최종 업데이트: 2026-03-22
- 버전: 1.3
- 상태: Verified

## 추적성 매트릭스

| REQ-ID | 요구사항 | 우선순위 | Unit TC | Integration TC | E2E TC | 구현 위치 | 결과 | 상태 |
|--------|----------|----------|---------|----------------|--------|-----------|------|------|
| REQ-001 | 사이드바 메뉴 글자 크기 확대 | P1 | UT-001~004 | IT-002 (기존) | - | Sidebar.tsx:19,31,83,87 | ✅ PASS | Verified |
| REQ-002 | 레이아웃 헤더 글자 크기 확대 | P1 | UT-005~006 | IT-001 (기존) | - | Layout.tsx:125,130 | ✅ PASS | Verified |
| REQ-003 | 상태바 글자 크기 확대 | P2 | - | - | - | StatusBar.tsx:34,38,41 | ✅ IMPL | Implemented |
| REQ-004 | 테이블 헤더 글자 크기 확대 | P1 | - | - | - | MetricsTable.tsx:87,90,94,99 | ✅ IMPL | Implemented |
| REQ-005 | 버튼/라벨 글자 크기 확대 | P1 | - | - | - | SimulationSettings.tsx:25,84 / SavedPortfolioList.tsx:71,141,147 / ETFSearch.tsx:118 / PortfolioBuilder.tsx:112 | ✅ IMPL | Implemented |
| REQ-006 | 차트 축/범례 폰트 통일 | P1 | - | - | - | PerformanceChart.tsx:534,541,563,669,676,693 / DividendSection.tsx:242,248,264,272 / PortfolioPieChart.tsx:76,83 | ✅ IMPL | Implemented |
| REQ-007 | 텍스트 잘림 개선 | P1 | - | - | - | PortfolioBuilder.tsx:71 / SavedPortfolioList.tsx:133 | ✅ IMPL | Implemented |

## 커버리지 요약
- 총 요구사항: 7개
- TC 매핑: 2개 (29%) - UI 스타일링 변경이므로 핵심 REQ만 TC 작성
- 구현 완료: 7개 (100%)
- 테스트 통과: 67/67 (100%)

## 업데이트 이력
| 날짜 | Phase | 변경 내용 |
|------|-------|----------|
| 2026-03-22 | Phase 1 | RTM 초기화, REQ-001~007 등록 |
| 2026-03-22 | Phase 4 | Unit TC (UT-001~006) 매핑, REQ-001~002 |
| 2026-03-22 | Phase 5 | 전체 구현 위치 매핑, 기존 테스트 업데이트 (w-[200px]→w-[220px]) |
| 2026-03-22 | Phase 7 | 전체 테스트 67/67 PASS |
