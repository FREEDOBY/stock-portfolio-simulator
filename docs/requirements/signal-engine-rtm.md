# RTM: Signal Engine

## 메타데이터
- 생성일: 2026-03-21
- 최종 업데이트: 2026-03-21
- 버전: 1.1
- 상태: Complete (1 Deferred)

## 추적성 매트릭스

| REQ-ID | 요구사항 | 우선순위 | Unit TC | 구현 위치 | 결과 | 상태 |
|--------|----------|----------|---------|-----------|------|------|
| REQ-001 | 시그널1 적립식 | P1 | UT-001 | signal_engine.py:38 | ✅ PASS | Verified |
| REQ-002 | 시그널2 CLI MoM% | P1 | UT-002~005 | signal_engine.py:46 | ✅ PASS | Verified |
| REQ-003 | 시그널3 키친사이클 | P1 | UT-006~010 | signal_engine.py:92 | ✅ PASS | Verified |
| REQ-004 | 시그널3 CLI 교차검증 (6상태) | P1 | - | - | - | **Deferred** |
| REQ-005 | 시그널4-매수 200주선 | P1 | UT-011~014 | signal_engine.py:117 | ✅ PASS | Verified |
| REQ-006 | 시그널4-매도 MACD 다이버전스 | P1 | UT-015~018 | signal_engine.py:144 | ✅ PASS | Verified |
| REQ-007 | 시그널5 쌍바닥+RSI | P1 | UT-019~022 | signal_engine.py:185 | ✅ PASS | Verified |
| REQ-008 | 시그널6 계단식법 | P1 | UT-023~026 | signal_engine.py:214 | ✅ PASS | Verified |
| REQ-009 | 종합 점수 | P1 | UT-027~028 | signal_engine.py:248 | ✅ PASS | Verified |
| REQ-010 | 시그널 히스토리 | P1 | UT-030 | signal_schemas.py:33 | ✅ PASS | Verified |
| REQ-011 | 시그널 스키마 | P1 | UT-029 | signal_schemas.py | ✅ PASS | Verified |
| REQ-012 | 엘리엇 수동 입력 | P2 | UT-017 | signal_engine.py:163 | ✅ PASS | Verified |

## 커버리지 요약
- 총 요구사항: 12개
- 구현+검증 완료: 11개 (92%)
- Deferred: 1개 (REQ-004)

## REQ-004 Deferred 사유
CLI 교차검증 6상태(상승가속/상승감속/하락시작/하락가속/하락감속/회복시작) 판별 로직은
현재 `macro_service.py`에서 `cli_value`, `cli_mom`, `cli_acceleration`을 계산하여
카테고리 요약에 활용하고 있으나, signal_engine 내 독립 함수로는 미구현.
키친사이클(REQ-003)이 주 시그널이며 CLI 교차검증은 보조 판정이므로 후순위 처리.

## 업데이트 이력
| 날짜 | Phase | 변경 내용 |
|------|-------|----------|
| 2026-03-21 | Phase 1 | RTM 초기화, REQ-001~012 등록 |
| 2026-03-21 | Phase 3 | 11/12 구현 + 30/30 Unit Test PASS |
| 2026-03-21 | RTM 검증 | REQ-004 Deferred 사유 명시 |
