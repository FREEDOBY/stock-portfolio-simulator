# 아키텍처 설계: Sidebar Navigation

## 메타데이터
- 작성일: 2026-03-21
- 상태: Draft

## 1. 설계 개요
- 선택한 접근법: Pragmatic (실용적 균형)
- 선택 근거: 라우터 없이 상태 기반 네비게이션으로 최소 변경, 확장성 확보

## 2. 파일 구조

### 생성할 파일
- `src/components/Sidebar.tsx` - 사이드바 컴포넌트 (메뉴 렌더링, 토글)
- `src/components/Layout.tsx` - 전체 레이아웃 (사이드바 + 메인 콘텐츠)
- `src/components/StatusBar.tsx` - 하단 상태바
- `src/components/PortfolioSimulator.tsx` - 기존 포트폴리오 시뮬레이터 뷰 (App.tsx에서 추출)
- `src/config/menuItems.ts` - 메뉴 구성 config
- `src/types/navigation.ts` - 네비게이션 관련 타입

### 수정할 파일
- `src/App.tsx` - Layout 래퍼 사용, 기존 로직을 PortfolioSimulator로 이동
- `src/main.tsx` - 변경 없음

## 3. 컴포넌트 설계

### Layout
```
┌──────────┬──────────────────────────────┐
│ Sidebar  │  Main Content Area           │
│          │  (activeView에 따라 전환)      │
│  ┌────┐  │                              │
│  │Menu│  │  <PortfolioSimulator />       │
│  │Item│  │  또는                         │
│  │    │  │  <ComingSoon />               │
│  └────┘  │                              │
│          │                              │
│ StatusBar│                              │
└──────────┴──────────────────────────────┘
```

### Sidebar
- 책임: 메뉴 렌더링, 접힘/펼침 토글, 활성 메뉴 표시, 모바일 대응
- Props: `activeMenu`, `onMenuChange`, `collapsed`, `onToggle`
- 상태: `collapsed` (boolean) - localStorage 저장

### Layout
- 책임: 사이드바 + 메인 콘텐츠 조합, 전역 레이아웃
- Props: 없음 (자체 상태 관리)
- 상태: `activeMenu` (string), `sidebarCollapsed` (boolean)

### PortfolioSimulator
- 책임: 기존 App.tsx의 포트폴리오 시뮬레이터 로직 전체
- Props: 없음 (자체 상태 관리)
- 기존 App.tsx의 로직을 그대로 이동

### menuItems config
```typescript
interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  component: React.ComponentType;
  description?: string;
  badge?: string; // "NEW", "BETA" 등
  disabled?: boolean;
}
```

## 4. 데이터 흐름
```
Layout (activeMenu, sidebarCollapsed)
├── Sidebar (메뉴 표시, 클릭 이벤트 → onMenuChange)
├── Main Content Area
│   └── menuItems[activeMenu].component 렌더링
└── StatusBar (시스템 정보)
```

## 5. 통합 포인트
- App.tsx → Layout으로 대체 (App.tsx는 Layout만 렌더링)
- 기존 포트폴리오 로직 → PortfolioSimulator.tsx로 추출
- 기존 하위 컴포넌트 (PortfolioBuilder, SimulationSettings 등) → 변경 없음
