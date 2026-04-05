# Architecture: 키친사이클 트렌드 판별 로직 고도화 v2

## 1. Design Overview
- 접근법: Pragmatic (기존 코드 최대 재사용 + 최소 새 추상화)
- 기존 `trend_direction()` → `trend_direction_v2()` 교체 (기존 메서드 유지, 새 메서드 추가 후 호출처 변경)
- 기존 `composite_trend()` → `composite_trend_v2()` 교체
- 반환 타입: `str` → `tuple[Optional[str], float]` (방향 + 강도)
- OI Ratio proxy는 `MacroCalculator`에 새 메서드 추가
- 시그널 엔진은 입력 타입만 변경 (tuple 수용)

## 2. File Structure

### 수정할 파일
- `backend/app/services/macro_calculator.py` — trend_direction_v2(), composite_trend_v2(), oi_ratio_proxy() 추가
- `backend/app/services/signal_engine.py` — signal_3_kitchen_cycle() 시그니처 변경
- `backend/app/services/macro_service.py` — v2 메서드 호출, BUSINV 활용, OI Ratio 계산
- `backend/app/models/macro_schemas.py` — BUSINV to FRED_SERIES_CONFIG
- `frontend/src/components/macro/charts/CycleDiagram.tsx` — strength prop 추가
- `frontend/src/components/macro/tabs/BusinessCycleTab.tsx` — strength 전달

### 생성할 파일
- `backend/tests/test_kitchin_cycle_v2.py` — Unit Test (P4)

## 3. Interface Contract

### MacroCalculator (macro_calculator.py)

```python
def trend_direction_v2(
    self,
    series: pd.Series,
    short_window: int = 3,
    long_window: int = 12,
) -> tuple[Optional[str], float]:
    """MA 교차 기반 트렌드 + 강도
    Returns: ("rising"/"falling"/None, strength 0~1)
    """

def composite_trend_v2(
    self,
    series_list: list[tuple[pd.Series, float]],
    short_window: int = 3,
    long_window: int = 12,
) -> tuple[Optional[str], float]:
    """가중 강도 합산
    Returns: ("rising"/"falling"/None, strength 0~1)
    """

def oi_ratio_proxy(
    self,
    demand_series: pd.Series,   # DGORDER
    inventory_series: pd.Series, # BUSINV
) -> Optional[float]:
    """OI Ratio proxy = demand YoY% / inventory YoY%
    Returns: ratio (>1 = 수요우위, <1 = 재고과잉) or None
    """
```

### SignalEngine (signal_engine.py)

```python
def signal_3_kitchen_cycle(
    self,
    pmi_trend: Optional[str],
    inventory_trend: Optional[str],
    pmi_strength: float = 1.0,
    inventory_strength: float = 1.0,
    oi_ratio: Optional[float] = None,
) -> SignalResult:
    """키친사이클 4단계 + 전환 완충 + 강도 반영"""
```

### CycleDiagram (CycleDiagram.tsx)

```typescript
interface Props {
  currentPhase: number;  // 1~4
  strength?: number;     // 0~1 (optional, 하위호환)
  transitioning?: boolean; // Phase 전환 중 여부
}
```

## 4. Data Flow

```
FRED API
  ├── DGORDER, NEWORDER, ACDGNO, IPMAN, PERMIT → composite_trend_v2() → (pmi_trend, pmi_strength)
  ├── ISRATIO, BUSINV → composite_trend_v2([ISRATIO, BUSINV]) → (inv_trend, inv_strength)
  ├── DGORDER + BUSINV → oi_ratio_proxy() → oi_ratio
  └── 결합:
      signal_3_kitchen_cycle(pmi_trend, inv_trend, pmi_strength, inv_strength, oi_ratio)
        ├── MA 방향 + OI 방향 일치 → 정상 Phase, score * combined_strength
        └── 불일치 → transitioning, score = 0.0 (WAIT)
```

## 5. Integration Points
- macro_service.py:115-135 — 기존 composite_inputs 그대로 유지, v2 메서드 호출만 변경
- macro_service.py:133-135 — ISRATIO + BUSINV 복합 재고 트렌드
- macro_service.py:216-234 — signal_3 호출 시 strength, oi_ratio 전달
- macro_service.py:302-330 — _build_category_summary��� strength, oi_ratio 추가
- FE: BusinessCycleTab에서 API 응답의 strength를 CycleDiagram에 전달
