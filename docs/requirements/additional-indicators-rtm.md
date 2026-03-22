# RTM: Additional Indicators (추가 지표 10개 + 탭6)

## 메타데이터
- 생성일: 2026-03-22
- 버전: 1.0
- 상태: Complete

## 추적성 매트릭스

| REQ-ID | 요구사항 | 우선순위 | Unit TC | 구현 위치 | 결과 | 상태 |
|--------|----------|----------|---------|-----------|------|------|
| REQ-001 | FRED_SERIES_CONFIG에 10개 시리즈 추가 | P1 | - | macro_schemas.py | ✅ | Implemented |
| REQ-002 | category_map에 기존 탭 3개 시리즈 추가 | P1 | IT-003 수정 | macro_data_fetcher.py | ✅ PASS | Verified |
| REQ-003 | category_map에 labor_household 카테고리 추가 | P1 | - | macro_data_fetcher.py | ✅ | Implemented |
| REQ-004 | 탭1 경기사이클에 노동생산성 차트 추가 | P1 | - | BusinessCycleTab.tsx | ✅ | Implemented |
| REQ-005 | 탭2 유동성에 기업부채/GDP 차트 추가 | P1 | - | LiquidityTab.tsx | ✅ | Implemented |
| REQ-006 | 탭4 시장심리에 소비자심리지수 차트 추가 | P1 | - | SentimentTab.tsx | ✅ | Implemented |
| REQ-007 | 탭6 LaborHouseholdTab 신규 (7개 차트) | P1 | - | LaborHouseholdTab.tsx | ✅ | Implemented |
| REQ-008 | CATEGORY_CONFIG에 탭6 추가 | P1 | - | types/macro.ts | ✅ | Implemented |
| REQ-009 | DetailedAnalysis에 탭6 라우팅 | P1 | - | DetailedAnalysis.tsx | ✅ | Implemented |
| REQ-010 | 각 차트에 지표 설명 툴팁 | P1 | - | 10개 TabChartSection | ✅ | Implemented |

## 결정 사항
- 가계부채 Y축: 자동 (극단값 없음)
- 실업률 기준선: 4% (자연실업률)
- 경제활동참가율 Y축: 60~68% 고정 (변동 작음)
- 모든 시리즈 120개월 (10년)

## 업데이트 이력
| 날짜 | Phase | 변경 내용 |
|------|-------|----------|
| 2026-03-22 | Phase 1 | RTM 초기화, REQ-001~010 등록 |
