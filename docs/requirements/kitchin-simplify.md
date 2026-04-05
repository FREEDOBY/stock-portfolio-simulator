# Requirements: Kitchin Cycle Simplification (키친사이클 핵심 단순화)

## 1. Functional Requirements

| REQ-ID | Requirement | Priority | Acceptance Criteria |
|--------|-------------|----------|---------------------|
| REQ-001 | IPMAN(산업생산지수) 단일 지표로 수요/생산 트렌드 판정 | P1 | trend_direction_v2(IPMAN) → rising/falling |
| REQ-002 | ISRATIO(재고/출하비율) 단일 지표로 재고 트렌드 판정 | P1 | trend_direction_v2(ISRATIO) → rising/falling |
| REQ-003 | IPMAN×ISRATIO → 4단계 Phase 매핑 | P1 | IPMAN↑+ISRATIO↓=P1, ↑↑=P2, ↓↑=P3, ↓↓=P4 |
| REQ-004 | 기존 5개 수요지표 복합투표 제거 (DGORDER,NEWORDER,ACDGNO,PERMIT) | P1 | composite_trend_v2 호출 제거, IPMAN만 사용 |
| REQ-005 | 기존 BUSINV 재고 복합 제거 | P1 | ISRATIO만 사용, BUSINV 제거 |
| REQ-006 | OI Ratio 이중확인 제거 | P1 | signal_3에서 oi_ratio 파라미터 제거 |
| REQ-007 | FE BusinessCycleTab Phase 판정 단순화 | P1 | IPMAN + ISRATIO 2개로 Phase 계산 |
| REQ-008 | 기존 signal_3 인터페이스 하위호환 | P2 | pmi_trend/inventory_trend 파라미터명 유지 |

## 2. Non-Functional Requirements

| NFR-ID | Category | Requirement | Measurement |
|--------|----------|-------------|-------------|
| NFR-001 | 정확성 | 기존 4단계 Phase 매핑 로직 유지 | rising/falling → Phase 1~4 동일 |
| NFR-002 | 성능 | 불필요한 FRED 시리즈 fetch 감소 | 수요 5개 → 1개, 재고 2개 → 1개 |

## 3. Edge Cases

| EDGE-ID | Scenario | Expected Behavior | Related REQ |
|---------|----------|-------------------|-------------|
| EDGE-001 | IPMAN 데이터 없음 | pmi_trend=None, Phase 판별 불가 | REQ-001 |
| EDGE-002 | ISRATIO 데이터 없음 | inventory_trend=None, Phase 판별 불가 | REQ-002 |

## 4. Constraints (검증된 제약)

- IPMAN, ISRATIO 모두 기존 FRED_SERIES_CONFIG에 이미 존재 — 추가 등록 불필요
- signal_3_kitchen_cycle()은 다른 시그널에서 호출되지 않음 (macro_service만 사용)
- FE BusinessCycleTab은 차트 데이터에서 직접 Phase를 계산 — 백엔드 API에 의존하지 않음

## 5. Decisions (자동 결정)

- IPMAN 선택 이유: 키친사이클 원전에서 "산업 생산"이 수요 측 핵심. 나머지는 선행지표
- ISRATIO 선택 이유: "재고/출하 비율"이 재고 순환의 정의 그 자체
- composite_trend_v2는 삭제하지 않음 — 다른 곳에서 사용 가능성. 호출만 제거
- OI Ratio proxy 계산 코드 제거 (호출부만, calc 메서드 자체는 유지)
