# Requirements: Kostolany Egg Model (코스톨라니 달걀모델)

## 1. Functional Requirements

| REQ-ID | Requirement | Priority | Acceptance Criteria |
|--------|-------------|----------|---------------------|
| REQ-001 | FEDFUNDS 6개월 변화로 금리 방향(cutting/hiking/flat) 판정 | P1 | -0.25%p 이하=cutting, +0.25%p 이상=hiking, 사이=flat |
| REQ-002 | VIX 수준으로 심리(fear/neutral/greed) 판정 | P1 | >25=fear, 16~25=neutral, <16=greed |
| REQ-003 | 금리 방향 × 심리 → 6단계(A1~B3) 매핑 | P1 | 9가지 조합이 올바른 Phase로 매핑됨 |
| REQ-004 | 각 Phase에 name/desc/action/color 메타데이터 포함 | P2 | 6개 Phase 모두 필수 필드 존재 |
| REQ-005 | Dashboard API 응답에 kostolany 필드 포함 | P1 | GET /api/macro/dashboard → kostolany 객체 존재 |
| REQ-006 | 프론트엔드 달걀형 SVG 다이어그램 렌더링 | P1 | 6개 도트 + 현재 위치 하이라이트 + 펄스 애니메이션 |
| REQ-007 | 판정 근거(금리 방향, VIX, 6M 변화량) 표시 | P2 | inputs 객체에 fed_rate_direction, vix, sentiment 포함 |
| REQ-008 | MacroDashboard 페이지에 달걀모델 배치 | P1 | Verdict/Recession 배너 아래, Category 카드 위 |

## 2. Non-Functional Requirements

| NFR-ID | Category | Requirement | Measurement |
|--------|----------|-------------|-------------|
| NFR-001 | 성능 | 기존 dashboard 응답 시간 증가 < 50ms | FEDFUNDS 시리즈 재사용 (추가 API 호출 없음) |
| NFR-002 | 정확성 | 데이터 부재 시 안전한 기본값 반환 | VIX=None 또는 FEDFUNDS < 6개월 → "A2" 기본값 |

## 3. Edge Cases

| EDGE-ID | Scenario | Expected Behavior | Related REQ |
|---------|----------|-------------------|-------------|
| EDGE-001 | FEDFUNDS 데이터 6개월 미만 | rate_direction="flat", rate_change=0.0 | REQ-001 |
| EDGE-002 | VIX 데이터 없음 (None) | sentiment="neutral" | REQ-002 |
| EDGE-003 | 금리 변화 정확히 ±0.25 경계값 | flat (exclusive boundary) | REQ-001 |
| EDGE-004 | kostolany 데이터 null일 때 FE | 컴포넌트 렌더링 안 함 (조건부) | REQ-008 |

## 4. Constraints (검증된 제약)

- FEDFUNDS: FRED API에서 수집 중 (macro_data_fetcher.py, FREDService)
- VIX: Yahoo Finance에서 수집 중 (macro_data_fetcher.py, yfinance)
- 추가 외부 API 호출 불필요 — 기존 `fetch_all()` 데이터 재사용

## 5. Decisions (자동 결정)

- 금리 방향 판정: 6개월 변화 사용 (3개월은 노이즈, 12개월은 지연)
- VIX 임계값: 25/16 (학술적 표준: 20/15이나, 최근 시장 환경 반영하여 약간 조정)
- flat 상태 매핑: fear→B3, neutral→A2, greed→A3 (보수적 접근)
