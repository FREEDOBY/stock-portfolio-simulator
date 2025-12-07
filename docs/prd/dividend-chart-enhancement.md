# PRD: 배당 차트 개선

## 1. 개요 (Overview)

### 목적
배당 통계 차트의 시각적 표현을 개선하여 사용자가 월별 배당 패턴을 더 명확하게 파악할 수 있도록 함

### 범위
- 포함: DividendSection 컴포넌트 차트 개선
- 제외: 백엔드 로직 변경, 다른 컴포넌트

### 성공 기준
- 연도별 탭 선택 시 12개월 전체 표시 (배당 0원 월 포함)
- 여러 종목 시 각 ETF가 다른 색상으로 명확히 구분
- 기존 테스트 모두 통과

## 2. 기능 명세 (Functional Specifications)

### 2.1 사용자 스토리
- As a 투자자, I want 12개월 전체 배당 차트를 보고 싶다, so that 배당 없는 달도 패턴 파악 가능
- As a 투자자, I want 여러 종목의 배당을 색상으로 구분, so that 종목별 기여도 확인 가능

### 2.2 수락 기준 (Acceptance Criteria)
- [ ] Given 특정 연도 선택, When 차트 렌더링, Then 1월~12월 전체 표시
- [ ] Given 배당 0원인 월, When 차트 렌더링, Then 해당 월도 0으로 표시
- [ ] Given 여러 ETF 포트폴리오, When 막대 차트 표시, Then 각 ETF별 다른 색상

### 2.3 기능 상세

| 기능 ID | 설명 | 우선순위 | 상태 |
|---------|------|----------|------|
| F-001 | 12개월 전체 월 표시 (1월~12월) | P1 | Todo |
| F-002 | 배당 0원 월 포함 표시 | P1 | Todo |
| F-003 | ETF별 색상 구분 (stacked bar) | P1 | Done |

## 3. 기술 명세 (Technical Specifications)

### 3.1 변경 파일
- `frontend/src/components/DividendSection.tsx`

### 3.2 구현 전략

#### 12개월 전체 표시 로직
```typescript
// chartData 생성 시 12개월 전체 생성
const generateFullYearData = (year: string, monthlyData: MonthlyDividend[], etfList: string[]) => {
  const allMonths = ['01','02','03','04','05','06','07','08','09','10','11','12'];

  return allMonths.map(month => {
    const fullMonth = `${year}-${month}`;
    const existing = monthlyData.find(d => d.month === fullMonth);

    if (existing) {
      return {
        month,
        fullMonth,
        amount: existing.amount,
        ...existing.by_etf
      };
    }

    // 배당 없는 월은 0으로 채움
    const emptyByEtf = Object.fromEntries(etfList.map(etf => [etf, 0]));
    return {
      month,
      fullMonth,
      amount: 0,
      ...emptyByEtf
    };
  });
};
```

### 3.3 색상 시스템
기존 ETF_COLORS 활용 (이미 구현됨):
- SCHD: #3b82f6 (파랑)
- VYM: #22c55e (초록)
- VIG: #f59e0b (노랑)
- DVY: #ef4444 (빨강)
- SPY: #8b5cf6 (보라)
- QQQ: #ec4899 (핑크)
- 기타: #6b7280 (회색)

## 4. 테스트 계획 (Test Plan)

### 4.1 테스트 케이스

| TC-ID | 설명 | 타입 | 우선순위 |
|-------|------|------|----------|
| TC-ENH-001 | 12개월 전체 데이터 생성 | Unit | P1 |
| TC-ENH-002 | 배당 없는 월 0 처리 | Unit | P1 |
| TC-ENH-003 | 연도 탭 전환 시 12개월 표시 | Unit | P1 |

## 5. 엣지 케이스 & 오류 처리

### 5.1 엣지 케이스
- 연도 중간부터 시작: 해당 연도 전체 12개월 표시
- 전체(all) 탭: 기존처럼 실제 데이터만 표시
- 1년 미만 데이터: 해당 연도 12개월 전체 표시

## 6. 구현 체크리스트

- [x] Phase 3: 테스트 작성 완료
  - `frontend/src/utils/dividendChartUtils.test.ts` (9개 테스트)
- [x] Phase 4: 구현 완료
  - `frontend/src/utils/dividendChartUtils.ts` - 12개월 데이터 생성 유틸리티
  - `frontend/src/components/DividendSection.tsx` - 차트 데이터 생성 로직 수정
- [x] Phase 5: 모든 테스트 통과 (66개)
  - 프론트엔드: 31개 통과
  - 백엔드: 35개 통과
- [x] Phase 6: 코드 리뷰 통과
- [x] Phase 7: 문서화 완료

## 7. 완료 정보

- **완료일**: 2025-12-07
- **신규 테스트**: 9개 추가
- **전체 테스트**: 66개 통과
- **빌드 상태**: 성공
- **LOOPBACK 횟수**: 0회
