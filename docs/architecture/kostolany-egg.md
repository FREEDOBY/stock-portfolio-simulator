# Architecture: Kostolany Egg Model

## 1. Design Overview

코스톨라니 달걀모델은 2개 축(금리 방향 + 심리)으로 시장의 6단계 순환 위치를 판정한다.
기존 macro_service.py의 get_dashboard() 파이프라인에 통합되어 추가 API 호출 없이 동작한다.

## 2. File Structure

### 수정 파일
- `backend/app/services/macro_service.py` — `_kostolany_egg()` 메서드 (이미 구현)
- `frontend/src/types/macro.ts` — `KostolanyData` 타입 (이미 구현)
- `frontend/src/components/macro/MacroDashboard.tsx` — 배치 (이미 구현)

### 신규 파일
- `frontend/src/components/macro/charts/KostolanyEgg.tsx` — SVG 다이어그램 (이미 구현)
- `backend/tests/test_kostolany_egg.py` — Unit Test (P4에서 작성)
- `backend/tests/test_kostolany_integration.py` — Integration Test (P6에서 작성)
- `frontend/src/components/macro/charts/__tests__/KostolanyEgg.test.tsx` — FE Test (P4에서 작성)

## 3. Interface Contract

### Backend: `MacroService._kostolany_egg(raw, indicators) -> dict`

```python
def _kostolany_egg(self, raw: MacroRawData, indicators: dict) -> dict:
    """
    Input:
      raw.fred_series["FEDFUNDS"] — FRED 시리즈 (pd.Series)
      indicators["vix_value"]     — float | None

    Output:
      {
        "phase": "A1"|"A2"|"A3"|"B1"|"B2"|"B3",
        "name": str,          # 한글 Phase명
        "desc": str,          # 설명
        "action": str,        # 투자 행동
        "color": str,         # hex color
        "inputs": {
          "fed_rate_direction": "cutting"|"hiking"|"flat",
          "fed_rate_change_6m": float,
          "vix": float | None,
          "sentiment": "fear"|"neutral"|"greed",
        }
      }
    """
```

### Frontend: `KostolanyEgg` Component

```tsx
interface KostolanyData {
  phase: 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';
  name: string;
  desc: string;
  action: string;
  color: string;
  inputs: {
    fed_rate_direction: 'cutting' | 'hiking' | 'flat';
    fed_rate_change_6m: number;
    vix: number | null;
    sentiment: 'fear' | 'neutral' | 'greed';
  };
}

// Props
interface Props { data: KostolanyData; }
```

## 4. Data Flow

```
FRED API (FEDFUNDS) ──┐
                      ├── MacroDataFetcher.fetch_all()
Yahoo (VIX) ──────────┘
                              │
                              ▼
                     MacroService.get_dashboard()
                              │
                     _kostolany_egg(raw, indicators)
                              │
                     ┌────────┴────────┐
                     │ FEDFUNDS[-1]    │ VIX value
                     │ FEDFUNDS[-6]    │
                     └────────┬────────┘
                              │
                     rate_direction + sentiment
                              │
                     phase_map[(dir, sent)] → Phase
                              │
                              ▼
                     Dashboard API Response
                     { ..., "kostolany": {...} }
                              │
                              ▼
                     MacroDashboard.tsx
                     → KostolanyEgg.tsx (SVG)
```

## 5. Integration Points

- `get_dashboard()` 리턴 dict에 `"kostolany"` 키 추가 — 기존 필드 변경 없음
- `DashboardData` 타입에 `kostolany?: KostolanyData` 추가 — optional, 하위호환
- `MacroDashboard.tsx`에서 `{data.kostolany && <KostolanyEgg>}` — null 안전
