# 아키텍처 설계: UI 글자 크기 개선 및 텍스트 잘림 수정

## 메타데이터
- 작성일: 2026-03-22
- 상태: Approved

## 1. 설계 개요
- 선택한 접근법: Minimal (최소 변경)
- 선택 근거: Tailwind 클래스 교체만으로 해결 가능, 구조 변경 불필요

## 2. 변경 계획

### 수정할 파일 (11개)

| 파일 | 변경 내용 |
|------|----------|
| Sidebar.tsx:19 | w-[200px] → w-[220px] |
| Sidebar.tsx:31 | text-xs → text-sm (브랜드) |
| Sidebar.tsx:83 | text-xs → text-sm (메뉴 라벨) |
| Sidebar.tsx:87 | text-[9px] → text-[11px] (배지) |
| Layout.tsx:125 | text-sm → text-base (헤더 타이틀) |
| Layout.tsx:130 | text-xs → text-sm (세션 상태) |
| StatusBar.tsx:34,38,41 | text-xs → text-sm |
| MetricsTable.tsx:87,90,94,99 | text-xs → text-sm (테이블 헤더) |
| SimulationSettings.tsx:25 | labelClass text-xs → text-sm |
| SimulationSettings.tsx:84 | text-xs → text-sm (전략 버튼) |
| SavedPortfolioList.tsx:71,141,147 | text-xs → text-sm (SAVE/LOAD/DEL 버튼) |
| SavedPortfolioList.tsx:133 | truncate → truncate + title 속성 추가 |
| PortfolioBuilder.tsx:71 | truncate → truncate + title 속성 추가 |
| PortfolioBuilder.tsx:112 | text-xs → text-sm (NORMALIZE 버튼) |
| ETFSearch.tsx:118 | text-xs → text-sm (ADD 버튼) |
| PerformanceChart.tsx:534,541 | fontSize: 10 → 12 |
| PerformanceChart.tsx:563 | fontSize: '11px' → '13px' (범례) |
| PerformanceChart.tsx:669,676 | fontSize: 9 → 11 |
| PerformanceChart.tsx:693 | fontSize: '11px' → '13px' (툴팁) |
| DividendSection.tsx:242,248 | fontSize: 10 → 12 |
| DividendSection.tsx:264 | fontSize: '11px' → '13px' (툴팁) |
| DividendSection.tsx:272 | fontSize: '10px' → '12px' (범례) |
| PortfolioPieChart.tsx:76 | fontSize: '11px' → '13px' (툴팁) |
| PortfolioPieChart.tsx:83 | fontSize: '11px' → '13px' (범례) |

### 생성할 파일
- 없음 (기존 파일 수정만)

## 3. 글자 크기 계층 (수정 후)

| 용도 | 크기 | Tailwind |
|------|------|----------|
| 섹션 제목 | 14px | text-sm |
| 헤더 타이틀 | 16px | text-base |
| 본문/라벨 | 14px | text-sm |
| 배지 | 11px | text-[11px] |
| 차트 축 (메인) | 12px | fontSize: 12 |
| 차트 축 (하위) | 11px | fontSize: 11 |
| 차트 범례/툴팁 | 13px | fontSize: '13px' |
| 카드 수치 | 18px | text-lg |

## 4. truncate 개선 전략
- truncate는 유지하되, title 속성을 추가하여 마우스 호버 시 전체 텍스트 표시
- 구조 변경 없이 접근성 개선

## 5. 리스크
- 글자 크기 증가로 인한 줄바꿈 가능성 → 사이드바 너비 확대(220px)로 대응
- 차트 축 라벨 겹침 → recharts 자동 간격 조절에 의존
