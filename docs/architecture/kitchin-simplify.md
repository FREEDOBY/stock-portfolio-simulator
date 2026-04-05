# Architecture: Kitchin Cycle Simplification

## 1. Design Overview

키친사이클 판정을 2개 핵심 지표로 단순화:
- 수요/생산: IPMAN (산업생산지수) 단독
- 재고: ISRATIO (재고/출하 비율) 단독

기존 composite_trend_v2() 5개 투표 + OI Ratio 이중확인 제거.

## 2. File Structure (수정만, 신규 없음)

| 파일 | 변경 |
|------|------|
| `macro_service.py` | _compute_indicators: 5개 composite → IPMAN 단독, BUSINV → ISRATIO 단독, OI Ratio 제거 |
| `macro_service.py` | _evaluate_signals: oi_ratio 파라미터 제거 |
| `signal_engine.py` | signal_3_kitchen_cycle: oi_ratio 파라미터 제거 |
| `BusinessCycleTab.tsx` | Phase 계산: 5개 투표 → IPMAN+ISRATIO 2개 |

## 3. Interface Contract

### Before (복잡)
```python
# 수요: 5개 지표 가중 투표
composite_inputs = [(dgorder,2.0), (neworder,2.0), (acdgno,1.5), (ipman,1.0), (permit,1.0)]
pmi_trend, pmi_strength = self.calc.composite_trend_v2(composite_inputs)

# 재고: 2개 복합
inv_inputs = [(isratio, 1.5), (businv, 1.0)]
inv_trend, inv_strength = self.calc.composite_trend_v2(inv_inputs)

# + OI Ratio, strength 계산
```

### After (단순)
```python
# 수요: IPMAN 단독
pmi_trend, pmi_strength = self.calc.trend_direction_v2(ipman)

# 재고: ISRATIO 단독
inv_trend, inv_strength = self.calc.trend_direction_v2(isratio)

# OI Ratio 없음, strength = 개별 R²
```

### signal_3_kitchen_cycle (변경 후)
```python
def signal_3_kitchen_cycle(
    self,
    pmi_trend: Optional[str],        # 유지
    inventory_trend: Optional[str],   # 유지
    pmi_strength: float = 1.0,        # 유지
    inventory_strength: float = 1.0,  # 유지
    # oi_ratio 제거
) -> SignalResult:
```

### FE BusinessCycleTab (변경 후)
```tsx
// Before: 5개 투표 + calcTrend
// After:
const ipmanData = data['IPMAN']?.data || [];
const isratioData = data['ISRATIO']?.data || [];
// 3개월 MA 방향으로 rising/falling
```

## 4. Data Flow

```
FRED (IPMAN) ──→ trend_direction_v2() ──→ pmi_trend + strength
                                                 │
FRED (ISRATIO) ──→ trend_direction_v2() ──→ inv_trend + strength
                                                 │
                                    signal_3_kitchen_cycle()
                                         │
                                    Phase 1~4 판정
```

## 5. Integration Points

- _build_category_summary(): pmi_trend/inv_trend 키 유지 → 자동 호환
- debug_kitchin_cycle(): 5개 수요지표 개별 분석 유지 (디버그용), 최종 판정만 변경
- FE CategoryCard: backend 응답 구조 변경 없음
