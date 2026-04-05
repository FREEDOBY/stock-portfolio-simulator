# Requirements: 키친사이클 트렌드 판별 로직 고도화 v2

## 메타데이터
- 문서 ID: REQ-kitchin-v2
- 버전: 1.0
- 작성일: 2026-04-05
- 상태: Approved

## 1. 기능 요구사항 (Functional Requirements)

| REQ-ID | 요구사항 | 우선순위 | 수락 기준 |
|--------|----------|----------|-----------|
| REQ-001 | MA 교차 기반 트렌드 판별 | P1 | MA3 vs MA12 교차로 rising/falling 판정 |
| REQ-002 | 트렌드 강도(strength) 산출 | P1 | MA spread 기반 0~1 연속값 반환 |
| REQ-003 | 복합 트렌드 강도 가중합산 | P1 | 개별 지표 강도를 가중 합산하여 최종 트렌드+강도 반환 |
| REQ-004 | OI Ratio proxy 계산 | P1 | DGORDER YoY / BUSINV YoY 비율 산출 |
| REQ-005 | Phase 전환 완충 (이중확인) | P1 | OI Ratio 방향 + MA 교차 불일치 시 transitioning 상태 |
| REQ-006 | BUSINV 데이터 추가 수집 | P1 | FRED_SERIES_CONFIG에 BUSINV 추가, macro_service에서 활용 |
| REQ-007 | 키친사이클 시그널 고도화 | P1 | strength 반영한 점수 산출 + transitioning 상태 처리 |
| REQ-008 | 프론트엔드 강도 표시 | P2 | CycleDiagram에 confidence 바 또는 텍스트 표시 |
| REQ-009 | 카테고리 요약에 강도 포함 | P2 | business_cycle key_values에 strength, oi_ratio 추가 |

### REQ-001: MA 교차 기반 트렌드 판별
- **설명**: `trend_direction()` 메서드를 MA3 vs MA12 교차 방식으로 변경. 단기 MA(3개월)가 장기 MA(12개월) 위이면 rising, 아래이면 falling.
- **현재**: MA3의 현재값 vs 3개월 전 값 2점 비교 (임계값 없음)
- **수락 기준**:
  - Given 12개월 이상의 시계열 데이터, When trend_direction_v2() 호출, Then MA3 > MA12이면 "rising", MA3 < MA12이면 "falling" 반환
  - Given 데이터 부족 (12개월 미만), When 호출, Then None 반환

### REQ-002: 트렌드 강도(strength) 산출
- **설명**: MA3와 MA12의 spread(거리)를 정규화하여 0~1 강도값 산출
- **수락 기준**:
  - Given rising 트렌드, When strength 계산, Then spread / 평균값으로 정규화된 0~1 값 반환
  - Given MA3 ≈ MA12 (교차 직후), When 계산, Then 낮은 strength (0에 가까움)

### REQ-003: 복합 트렌드 강도 가중합산
- **설명**: `composite_trend()` 를 개선. 각 지표의 방향 + 강도를 가중 합산하여 최종 방향과 strength 반환
- **수락 기준**:
  - Given 5개 지표 중 3개 rising(강도 높음) + 2개 falling(강도 낮음), When 합산, Then rising + 높은 strength
  - Given 모든 지표 strength < 0.15, When 합산, Then None (횡보)

### REQ-004: OI Ratio proxy 계산
- **설명**: ISM OI Ratio 대체로 DGORDER YoY% / BUSINV YoY% 비율 계산
- **수락 기준**:
  - Given DGORDER, BUSINV 시계열, When oi_ratio_proxy() 호출, Then YoY 변화율 비율 반환
  - Given 데이터 부족, When 호출, Then None 반환

### REQ-005: Phase 전환 완충
- **설명**: MA 교차 방향과 OI Ratio 방향이 불일치하면 "transitioning" 상태로 판정. 확신도 낮은 점수 부여.
- **수락 기준**:
  - Given MA 교차 = rising + OI Ratio > 1.0, When Phase 판정, Then 정상 Phase (높은 확신)
  - Given MA 교차 = rising + OI Ratio < 1.0, When 판정, Then transitioning (낮은 확신, 점수 감쇠)

### REQ-006: BUSINV 데이터 추가
- **설명**: FRED_SERIES_CONFIG에 BUSINV(Total Business Inventories) 추가. macro_service에서 재고 트렌드 판별에 ISRATIO + BUSINV 병행 사용.
- **수락 기준**:
  - Given FRED API 호출, When fetch_all(), Then BUSINV 데이터 포함
  - Given macro_service 실행, When 재고 트렌드 판별, Then ISRATIO + BUSINV 복합 판단

### REQ-007: 키친사이클 시그널 고도화
- **설명**: signal_3_kitchen_cycle()이 strength를 반영한 점수 산출. transitioning이면 score 감쇠.
- **수락 기준**:
  - Given Phase 1 + strength 0.8, When 시그널 생성, Then score = 2.0 * 0.8 = 1.6
  - Given transitioning 상태, When 시그널 생성, Then status = WAIT, score = 0.0

### REQ-008: 프론트엔드 강도 표시
- **설명**: CycleDiagram 컴포넌트에 confidence/strength 정보 표시
- **수락 기준**:
  - Given strength 0.85, When 렌더링, Then "확신도: 85%" 또는 프로그레스 바 표시

### REQ-009: 카테고리 요약에 강도 포함
- **설명**: _build_category_summary()의 business_cycle.key_values에 strength, oi_ratio 추가
- **수락 기준**:
  - Given 분석 완료, When 요약 생성, Then key_values에 strength(float), oi_ratio(float) 포함

## 2. 비기능 요구사항 (Non-Functional Requirements)

| NFR-ID | 카테고리 | 요구사항 | 측정 기준 |
|--------|----------|----------|-----------|
| NFR-001 | 하위호환 | 기존 API 응답 구조 유지 | 기존 필드 삭제 없음, 추가만 |
| NFR-002 | 성능 | 추가 계산 오버헤드 최소화 | 전체 분석 < 기존 대비 10% 이내 |

## 3. 엣지 케이스

| EDGE-ID | 시나리오 | 예상 동작 | 관련 REQ |
|---------|----------|-----------|----------|
| EDGE-001 | BUSINV 데이터 없음 (FRED 에러) | ISRATIO만으로 fallback | REQ-006 |
| EDGE-002 | 모든 지표 횡보 (strength < 0.15) | Phase = None, transitioning | REQ-003, REQ-005 |
| EDGE-003 | 데이터 12개월 미만 | 기존 trend_direction 로직으로 fallback | REQ-001 |
| EDGE-004 | OI Ratio 계산 불가 (BUSINV 없음) | MA 교차만으로 판정 (완충 없이) | REQ-004, REQ-005 |

## 4. 제약 조건 (검증된 제약)
- FRED API 무료 사용 — BUSINV는 FRED에서 무료 제공 확인 필요 (시리즈 ID: BUSINV)
- ISM PMI 직접 데이터 불가 — FRED에서 삭제됨. 기존 proxy 지표(DGORDER 등) 유지
- 기존 시그널 엔진 가중치 체계(WEIGHTS) 유지 — 키친사이클 가중치 2.0 유지

## 5. 결정 사항 (자동 결정)
- MA 윈도우: 단기 3개월, 장기 12개월 (리서치 기반 가장 실용적인 조합)
- strength 정규화: MA spread / 평균값 방식 (단순하고 해석 가능)
- 횡보 임계값: strength < 0.15일 때 None 반환
- OI Ratio proxy: DGORDER YoY / BUSINV YoY (ISM OI Ratio 대체)
- transitioning 점수: score = 0.0 (WAIT)
