# RTM: Kitchin Cycle Simplification

## Metadata
- Created: 2026-04-05
- Last Updated: 2026-04-05
- Version: 1.4
- Status: Verified

## Traceability Matrix

| REQ-ID | Requirement | Priority | Unit TC | Integration TC | E2E TC | Impl Location | Result | Review | Status |
|--------|-------------|----------|---------|----------------|--------|---------------|--------|--------|--------|
| REQ-001 | IPMAN 단일 지표로 수요 트렌드 | P1 | UT-KS001~KS003 | - | - | macro_service.py:169~173 | PASS | PASS | Verified |
| REQ-002 | ISRATIO 단일 지표로 재고 트렌드 | P1 | UT-KS004~KS006 | - | - | macro_service.py:175~179 | PASS | PASS | Verified |
| REQ-003 | IPMAN×ISRATIO → 4단계 매핑 | P1 | UT-KS007~KS011 | - | - | signal_engine.py:161~190 | PASS | MAJOR→FIXED | Verified |
| REQ-004 | 5개 수요지표 복합투표 제거 | P1 | UT-KS013 | - | - | macro_service.py:168~173 | PASS | PASS | Verified |
| REQ-005 | BUSINV 재고 복합 제거 | P1 | UT-KS013 | - | - | macro_service.py:175~179 | PASS | PASS | Verified |
| REQ-006 | OI Ratio 이중확인 제거 | P1 | UT-KS012 | - | - | signal_engine.py:161 | PASS | PASS | Verified |
| REQ-007 | FE BusinessCycleTab 단순화 | P1 | - | - | - | BusinessCycleTab.tsx:40~55 | PASS | MAJOR→FIXED | Verified |
| REQ-008 | signal_3 인터페이스 하위호환 | P2 | UT-KS007~KS012 | - | - | signal_engine.py:161~166 | PASS | PASS | Verified |
| EDGE-001 | IPMAN 없음 → 판별 불가 | P2 | UT-KS003, KS011 | - | - | macro_service.py:170~171 | PASS | PASS | Verified |
| EDGE-002 | ISRATIO 없음 → 판별 불가 | P2 | UT-KS006, KS011 | - | - | macro_service.py:176~177 | PASS | PASS | Verified |

## Coverage Summary
- Total requirements: 10 (8 REQ + 2 EDGE)
- TC mapped: 9 (90%)
- Implementation complete: 10 (100%)
- Tests passing: 10 (100%)

## Update History
| Date | Phase | Changes |
|------|-------|---------|
| 2026-04-05 | P1 | RTM 초기화, 10개 요구사항 등록 |
| 2026-04-05 | P4 | Unit TC 매핑: UT-KS001~KS013 |
| 2026-04-05 | P5 | 구현 완료, 기존 테스트 수정 |
| 2026-04-05 | P7 | 전체 298 tests ALL PASS |
| 2026-04-05 | P8 | 리뷰: strength 곱→평균(FIXED), FE calcTrend 인덱스(FIXED) |
