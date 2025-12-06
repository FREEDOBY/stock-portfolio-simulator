# PRD: 성과 차트 개선 (Performance Chart Enhancement)

## 1. 개요 (Overview)

### 1.1 목적
- 성과 차트를 더 풍부하고 인사이트 있게 개선
- QQQ/SPY 대비 포트폴리오 underperformance 구간을 시각적으로 표시
- 사용자가 투자 성과를 다각도로 분석할 수 있도록 지원

### 1.2 범위
- **포함**:
  - Underperformance 구간 시각화 (음영 영역)
  - 누적 수익률 뷰 (% 기반)
  - 상대 성과 차트
  - 차트 UI/UX 개선
- **제외**:
  - 백엔드 변경
  - 새로운 지표 계산

### 1.3 성공 기준
- [x] 벤치마크 대비 underperformance 구간이 빨간색 음영으로 표시됨
- [x] 절대 금액 / 누적 수익률 뷰 전환 가능
- [x] 상대 성과(초과/미달 수익률) 차트 표시
- [x] 개선된 툴팁으로 상세 정보 제공

---

## 2. 기능 명세 (Functional Specifications)

### 2.1 사용자 스토리

| ID | 스토리 | 우선순위 |
|----|--------|----------|
| US-001 | 사용자로서, 내 포트폴리오가 벤치마크보다 성과가 낮은 구간을 한눈에 보고 싶다 | P1 |
| US-002 | 사용자로서, 절대 금액뿐 아니라 % 수익률로도 성과를 비교하고 싶다 | P1 |
| US-003 | 사용자로서, 벤치마크 대비 초과/미달 수익률을 별도로 확인하고 싶다 | P2 |
| US-004 | 사용자로서, 차트에서 특정 시점의 상세 정보를 툴팁으로 보고 싶다 | P1 |

### 2.2 수락 기준 (Acceptance Criteria)

#### F-001: Underperformance 구간 시각화
- [x] Given 벤치마크(QQQ/SPY)가 선택됨, When 포트폴리오 성과가 벤치마크보다 낮은 구간, Then 해당 구간이 빨간색/분홍색 음영으로 표시된다
- [x] Given 여러 벤치마크 선택됨, When 사용자가 특정 벤치마크 토글, Then 해당 벤치마크의 underperformance만 표시된다
- [x] Given underperformance 구간, When 마우스 호버 시, Then "이 기간 SPY 대비 -X% 저조" 같은 정보 표시

#### F-002: 누적 수익률 뷰
- [x] Given 성과 차트, When "수익률 %" 뷰 선택 시, Then Y축이 % 단위로 변경된다
- [x] Given 수익률 뷰, When 차트 렌더링 시, Then 시작점이 0%로 정규화된다
- [x] Given 뷰 전환 버튼, When 클릭 시, Then 금액/수익률 뷰가 토글된다

#### F-003: 상대 성과 차트
- [x] Given 벤치마크 선택됨, When 차트 영역 아래 확인 시, Then 초과/미달 수익률 막대 차트 표시
- [x] Given 초과 수익률, When 양수일 때, Then 녹색 막대로 표시
- [x] Given 미달 수익률, When 음수일 때, Then 빨간색 막대로 표시

#### F-004: 차트 개선
- [x] Given 차트 위 마우스 호버, When 특정 날짜에 위치, Then 모든 데이터 포인트 정보가 툴팁에 표시
- [x] Given 툴팁, When 렌더링 시, Then 포트폴리오 값, 벤치마크 값, 차이(금액/%) 표시

### 2.3 기능 상세

| 기능 ID | 설명 | 우선순위 | 상태 |
|---------|------|----------|------|
| F-001 | Underperformance 구간 음영 표시 | P1 | Done |
| F-002 | 금액/수익률(%) 뷰 전환 | P1 | Done |
| F-003 | 상대 성과 차트 (초과/미달 수익률) | P2 | Done |
| F-004 | 개선된 커스텀 툴팁 | P1 | Done |

---

## 3. 기술 명세 (Technical Specifications)

### 3.1 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    PerformanceChart.tsx                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Chart Controls (뷰 전환, 벤치마크 토글)             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Main Chart (ComposedChart)                          │   │
│  │  - LineChart: 포트폴리오, 벤치마크 라인              │   │
│  │  - ReferenceArea: Underperformance 음영              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Relative Performance Chart (선택적)                 │   │
│  │  - BarChart: 초과/미달 수익률                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CustomTooltip (커스텀 툴팁 컴포넌트)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 데이터 흐름

```typescript
// 기존 데이터
interface ChartDataPoint {
  date: string;
  포트폴리오: number;
  QQQ?: number;
  SPY?: number;
}

// 확장 데이터
interface EnhancedChartDataPoint extends ChartDataPoint {
  // 수익률 (%)
  portfolioReturn: number;
  QQQReturn?: number;
  SPYReturn?: number;

  // 상대 성과 (초과/미달 수익률)
  excessReturnQQQ?: number;
  excessReturnSPY?: number;

  // Underperformance 플래그
  underperformQQQ?: boolean;
  underperformSPY?: boolean;
}
```

### 3.3 컴포넌트 설계

#### PerformanceChart.tsx (수정)
```typescript
// 새로운 Props
interface Props {
  result: BacktestResult;
  selectedBenchmarks: BenchmarkType[];
  onBenchmarkChange: (benchmarks: BenchmarkType[]) => void;
}

// 새로운 State
type ViewMode = 'absolute' | 'returns';
const [viewMode, setViewMode] = useState<ViewMode>('absolute');
const [showRelativeChart, setShowRelativeChart] = useState(false);
```

#### CustomTooltip 컴포넌트
```typescript
interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  viewMode: ViewMode;
  selectedBenchmarks: BenchmarkType[];
}
```

### 3.4 Recharts 컴포넌트 사용

```typescript
import {
  ComposedChart,  // Line + Area 조합
  Line,
  Area,           // Underperformance 영역
  Bar,            // 상대 성과
  ReferenceArea,  // 음영 영역 (대안)
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,  // 0% 기준선
} from 'recharts';
```

### 3.5 핵심 로직

#### Underperformance 구간 계산
```typescript
function calculateUnderperformanceRanges(
  data: EnhancedChartDataPoint[],
  benchmark: BenchmarkType
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let currentRange: { start: number; end: number } | null = null;

  data.forEach((point, index) => {
    const isUnderperforming =
      point[`excessReturn${benchmark}`] !== undefined &&
      point[`excessReturn${benchmark}`]! < 0;

    if (isUnderperforming && !currentRange) {
      currentRange = { start: index, end: index };
    } else if (isUnderperforming && currentRange) {
      currentRange.end = index;
    } else if (!isUnderperforming && currentRange) {
      ranges.push(currentRange);
      currentRange = null;
    }
  });

  if (currentRange) ranges.push(currentRange);
  return ranges;
}
```

#### 수익률 계산
```typescript
function calculateReturns(values: PortfolioValue[]): number[] {
  if (values.length === 0) return [];
  const initial = values[0].value;
  return values.map(v => ((v.value - initial) / initial) * 100);
}
```

### 3.6 의존성
- 기존: `recharts` (이미 설치됨)
- 추가 없음

---

## 4. 테스트 계획 (Test Plan)

### 4.1 테스트 범위

| 타입 | 대상 | 도구 |
|------|------|------|
| Unit | 수익률 계산 함수 | Vitest |
| Unit | Underperformance 구간 계산 | Vitest |
| Unit | 차트 데이터 변환 | Vitest |
| Integration | 차트 렌더링 | 수동 |

### 4.2 테스트 케이스 개요

| TC-ID | 설명 | 타입 | 우선순위 |
|-------|------|------|----------|
| TC-001 | 수익률 계산 정확성 (양수/음수) | Unit | P1 |
| TC-002 | 초기값 0에서의 수익률 처리 | Unit | P1 |
| TC-003 | Underperformance 구간 식별 | Unit | P1 |
| TC-004 | 연속/비연속 underperformance 구간 | Unit | P1 |
| TC-005 | 빈 데이터 처리 | Unit | P1 |
| TC-006 | 차트 데이터 변환 정확성 | Unit | P2 |

---

## 5. 엣지 케이스 & 오류 처리

### 5.1 엣지 케이스
- 데이터 포인트가 1개일 때 → 수익률 0% 표시
- 벤치마크 미선택 시 → underperformance 영역 숨김
- 포트폴리오와 벤치마크가 동일할 때 → 0% 차이 표시

### 5.2 오류 시나리오
- 벤치마크 데이터 누락 → 해당 벤치마크 라인 숨김
- 날짜 불일치 → 공통 날짜만 사용 (이미 백엔드에서 처리)

---

## 6. UI/UX 명세

### 6.1 색상 팔레트

| 요소 | 색상 | Hex |
|------|------|-----|
| 포트폴리오 라인 | 파란색 | #3b82f6 |
| QQQ 라인 | 빨간색 | #ef4444 |
| SPY 라인 | 녹색 | #22c55e |
| Underperformance 영역 (QQQ) | 연한 빨간색 | rgba(239, 68, 68, 0.1) |
| Underperformance 영역 (SPY) | 연한 녹색 | rgba(34, 197, 94, 0.1) |
| 초과 수익률 막대 | 녹색 | #22c55e |
| 미달 수익률 막대 | 빨간색 | #ef4444 |

### 6.2 레이아웃

```
┌───────────────────────────────────────────────────────────┐
│  성과 차트                    [금액 | %] [QQQ] [SPY]      │
├───────────────────────────────────────────────────────────┤
│                                                           │
│   ████████████████████████████████████████████████████   │
│   █                                          ▄▄▄▄▄▄▄▄ █   │
│   █                                    ▄▄▄▄▄█████████ █   │
│   █                              ▄▄▄▄▄██████░░░░░░░░█ █   │
│   █                        ▄▄▄▄▄█████░░░░░░░░░░░░░░░█ █   │
│   █   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█████░░░░░░░░░░░░░░░░░░░░█ █   │
│   █ ▄█████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░█ █   │
│   ████████████████████████████████████████████████████   │
│                                                           │
│   ░░░ = Underperformance 영역 (음영)                      │
│                                                           │
├───────────────────────────────────────────────────────────┤
│  ☑ 상대 성과 표시                                         │
├───────────────────────────────────────────────────────────┤
│   ▓▓▓                                                     │
│   ▓▓▓              ▓▓▓         ▓▓▓                        │
│  ─────────────────────────────────────── 0%               │
│              ░░░         ░░░         ░░░                  │
│              ░░░                     ░░░                  │
└───────────────────────────────────────────────────────────┘
```

---

## 7. 구현 체크리스트

- [ ] Phase 3: 테스트 작성 완료
- [ ] Phase 4: 구현 완료
- [ ] Phase 5: 모든 테스트 통과
- [ ] Phase 6: 코드 리뷰 통과
- [ ] Phase 7: 문서화 완료

---

## 8. 변경 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| frontend/src/components/PerformanceChart.tsx | 수정 | 차트 전면 개선 |
| frontend/src/utils/chartUtils.ts | 신규 | 차트 유틸리티 함수 |
| frontend/src/utils/chartUtils.test.ts | 신규 | 유틸리티 테스트 |
