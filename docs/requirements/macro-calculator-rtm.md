# RTM: Macro Calculator

## 메타데이터
- 생성일: 2026-03-21
- 최종 업데이트: 2026-03-21
- 버전: 1.0
- 상태: Complete

## 추적성 매트릭스

| REQ-ID | 요구사항 | 우선순위 | Unit TC | 구현 위치 | 결과 | 상태 |
|--------|----------|----------|---------|-----------|------|------|
| REQ-001 | CLI MoM% | P1 | UT-001 | macro_calculator.py:18 | ✅ PASS | Verified |
| REQ-002 | CLI 가속도 | P1 | UT-002 | macro_calculator.py:26 | ✅ PASS | Verified |
| REQ-003 | M2 YoY% | P1 | UT-004 | macro_calculator.py:33 | ✅ PASS | Verified |
| REQ-004 | 200주 SMA | P1 | UT-006 | macro_calculator.py:41 | ✅ PASS | Verified |
| REQ-005 | 50주 SMA | P1 | UT-007 | macro_calculator.py:41 | ✅ PASS | Verified |
| REQ-006 | MACD | P1 | UT-009, UT-010 | macro_calculator.py:55 | ✅ PASS | Verified |
| REQ-007 | RSI | P1 | UT-011, UT-012 | macro_calculator.py:73 | ✅ PASS | Verified |
| REQ-008 | 200주선 거리% | P1 | UT-008 | macro_calculator.py:47 | ✅ PASS | Verified |
| REQ-009 | Drawdown% | P1 | UT-013, UT-014 | macro_calculator.py:93 | ✅ PASS | Verified |
| REQ-010 | 버핏지표% | P1 | UT-015, UT-016 | macro_calculator.py:107 | ✅ PASS | Verified |
| REQ-011 | PMI 트렌드 | P1 | UT-017 | macro_calculator.py:117 | ✅ PASS | Verified |
| REQ-012 | 재고/출하 트렌드 | P1 | UT-018 | macro_calculator.py:117 | ✅ PASS | Verified |
| REQ-013 | CPI/PCE YoY% | P1 | UT-020 | macro_calculator.py:33 | ✅ PASS | Verified |
| REQ-014 | NaN 안전 처리 | P1 | UT-003,005,010,016,019 | 전체 | ✅ PASS | Verified |

## 커버리지 요약
- 총 요구사항: 14개
- TC 매핑: 14개 (100%)
- 구현 완료: 14개 (100%)
- 테스트 통과: 14개 (100%)

## 업데이트 이력
| 날짜 | Phase | 변경 내용 |
|------|-------|----------|
| 2026-03-21 | Phase 1 | RTM 초기화, REQ-001~014 등록 |
