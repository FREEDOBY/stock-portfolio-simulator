# RTM: Recession Warning System

## 메타데이터
- 생성일: 2026-03-22
- 버전: 1.0
- 상태: Complete

## 추적성 매트릭스

| REQ-ID | 요구사항 | 우선순위 | Unit TC | 구현 위치 | 결과 | 상태 |
|--------|----------|----------|---------|-----------|------|------|
| REQ-001 | RecessionWarningEngine 8개 지표 체크 | P1 | UT-001~012 | recession_warning.py | ✅ PASS | Verified |
| REQ-002 | 가중 합산 → 확률(%) 계산 | P1 | UT-013~017 | recession_warning.py:calculate_warning_level | ✅ PASS | Verified |
| REQ-003 | Level 0~3 판정 | P1 | UT-013~016 | recession_warning.py:WarningLevel | ✅ PASS | Verified |
| REQ-004 | 개별 지표 발동 상세 목록 반환 | P1 | UT-001~012 | recession_warning.py:evaluate | ✅ PASS | Verified |
| REQ-005 | dashboard에 recession_warning 포함 | P1 | - | macro_service.py | ✅ | Implemented |
| REQ-006 | FE 침체 경고 배너 | P1 | - | RecessionWarningBanner.tsx | ✅ | Implemented |
| REQ-007 | FE 개별 지표 체크리스트 표시 | P1 | - | RecessionWarningBanner.tsx | ✅ | Implemented |

## 결정 사항
- 수익률 곡선 재양전: T10Y2Y가 과거 12개월 내 음수였다가 현재 양수 → 발동
- 임시직 감소: TEMPHELPS 3개월 이동평균이 직전 3개월 대비 하락 → 발동
- 신용카드 연체율: DRCCLACBS 최근 4분기 연속 상승 → 발동

## 업데이트 이력
| 날짜 | Phase | 변경 내용 |
|------|-------|----------|
| 2026-03-22 | Phase 1 | RTM 초기화 |
