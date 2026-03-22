# RTM: Crisis Overlay (경제위기 오버레이)

## 메타데이터
- 생성일: 2026-03-22
- 버전: 1.0
- 상태: Complete

## 추적성 매트릭스

| REQ-ID | 요구사항 | 우선순위 | Unit TC | 구현 위치 | 결과 | 상태 |
|--------|----------|----------|---------|-----------|------|------|
| REQ-001 | NBER 경기침체 구간 데이터 정의 | P1 | UT-001, UT-005 | crisisOverlayConfig.ts | ✅ PASS | Verified |
| REQ-002 | 비공식 조정장 구간 데이터 정의 | P1 | UT-002, UT-006 | crisisOverlayConfig.ts | ✅ PASS | Verified |
| REQ-003 | MacroLineChart에 ReferenceArea 음영 렌더링 | P1 | - | MacroLineChart.tsx | ✅ | Implemented |
| REQ-004 | 모든 탭 차트에 자동 적용 | P1 | - | 5개 탭 모두 crisisOverlays 전달 | ✅ | Implemented |
| REQ-005 | 음영 토글 on/off | P1 | - | DetailedAnalysis.tsx | ✅ | Implemented |
| REQ-006 | 시그널 발동 시점 마커 (매수/매도) | P1 | - | MacroLineChart.tsx (Scatter+SignalDot) | ✅ | Implemented |
| REQ-007 | 기간 선택에 따른 오버레이 필터링 | P1 | UT-003, UT-004 | crisisOverlayConfig.ts | ✅ PASS | Verified |

## 결정 사항
- NBER 침체: 하드코딩 (빈도 낮음, API 불필요)
- 비공식 조정장: 나스닥 -15% 이상 하락 구간 기준
- 시그널 마커: 백엔드 signal_history에서 가져옴 (기존 API 활용)
- 음영 색상: NBER=회색(#64748b20), 조정장=빨강(#ef444415)

## 업데이트 이력
| 날짜 | Phase | 변경 내용 |
|------|-------|----------|
| 2026-03-22 | Phase 1 | RTM 초기화, REQ-001~007 등록 |
