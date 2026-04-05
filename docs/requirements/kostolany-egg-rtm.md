# RTM: Kostolany Egg Model

## Metadata
- Created: 2026-04-05
- Last Updated: 2026-04-05
- Version: 1.5
- Status: Verified

## Traceability Matrix

| REQ-ID | Requirement | Priority | Unit TC | Integration TC | E2E TC | Impl Location | Result | Review | Status |
|--------|-------------|----------|---------|----------------|--------|---------------|--------|--------|--------|
| REQ-001 | FEDFUNDS 6M 변화 → 금리 방향 판정 | P1 | UT-K001~K005 | - | - | macro_service.py:665~675 | PASS | MINOR | Verified |
| REQ-002 | VIX 수준 → 심리 판정 | P1 | UT-K006~K009 | - | - | macro_service.py:678~683 | PASS | PASS | Verified |
| REQ-003 | 금리×심리 → 6단계 매핑 | P1 | UT-K010~K018 | IT-K001(b,c) | - | macro_service.py:686~699 | PASS | MINOR | Verified |
| REQ-004 | Phase 메타데이터(name/desc/action/color) | P2 | UT-K019, UT-K027~K028 | - | - | macro_service.py:701~713 | PASS | PASS | Verified |
| REQ-005 | Dashboard API에 kostolany 필드 | P1 | - | IT-K001(a) | E2E-K001 | macro_service.py:82 | PASS | PASS | Verified |
| REQ-006 | SVG 달걀 다이어그램 렌더링 | P1 | UT-K021~K022, UT-K028 | - | - | KostolanyEgg.tsx:24~120 | PASS | MINOR | Verified |
| REQ-007 | 판정 근거(inputs) 표시 | P2 | UT-K020, UT-K023~K026 | - | - | KostolanyEgg.tsx:108~130 | PASS | MAJOR→FIXED | Verified |
| REQ-008 | MacroDashboard에 배치 | P1 | - | - | E2E-K001 | MacroDashboard.tsx:86 | PASS | PASS | Verified |
| EDGE-001 | FEDFUNDS < 6개월 → flat 기본값 | P2 | UT-K004~K005 | - | - | macro_service.py:666~668 | PASS | MAJOR→FIXED | Verified |
| EDGE-002 | VIX None → neutral 기본값 | P2 | UT-K009 | - | - | macro_service.py:678~680 | PASS | PASS | Verified |
| EDGE-003 | ±0.25 경계값 → flat | P2 | UT-K003 | - | - | macro_service.py:671~675 | PASS | PASS | Verified |
| EDGE-004 | kostolany null → 미렌더링 | P2 | - | - | - | MacroDashboard.tsx:86 | PASS | PASS | Verified |

## Coverage Summary
- Total requirements: 12 (8 REQ + 4 EDGE)
- TC mapped: 11 (92%)
- Implementation complete: 12 (100%)
- Tests passing: 12 (100%)

## Update History
| Date | Phase | Changes |
|------|-------|---------|
| 2026-04-05 | P1 | RTM 초기화, 12개 요구사항 등록 |
| 2026-04-05 | P4 | Unit TC 매핑: UT-K001~K028 (BE 25 + FE 11) |
| 2026-04-05 | P5 | 구현 위치 매핑: 모든 REQ Implemented |
| 2026-04-05 | P6 | Integration TC: IT-K001(a,b,c), E2E TC: E2E-K001 |
| 2026-04-05 | P7 | 테스트 실행: 40/40 PASS. 전체 Verified |
| 2026-04-05 | P8 | 코드 리뷰 ×3: vix falsy→is not None(FIXED), len>=6→>=7(FIXED), flat 근거 주석(FIXED) |
