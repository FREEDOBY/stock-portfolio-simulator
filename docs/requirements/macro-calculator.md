# 요구사항 문서: Macro Calculator (파생 지표 계산 엔진)

## 메타데이터
- 문서 ID: REQ-MACRO-CALC-001
- 버전: 1.0
- 작성일: 2026-03-21
- 상태: Approved

## 1. 기능 요구사항

| REQ-ID | 요구사항 | 우선순위 | 수락 기준 |
|--------|----------|----------|-----------|
| REQ-001 | OECD CLI MoM% 계산 | P1 | (CLI[t]-CLI[t-1])/CLI[t-1]×100 |
| REQ-002 | CLI MoM% 가속도 계산 | P1 | MoM%[t] - MoM%[t-1] |
| REQ-003 | M2 YoY% 계산 | P1 | (M2[t]-M2[t-12])/M2[t-12]×100 |
| REQ-004 | 200주 SMA 계산 | P1 | 주봉 종가 200주 단순이동평균 |
| REQ-005 | 50주 SMA 계산 | P1 | 주봉 종가 50주 단순이동평균 |
| REQ-006 | MACD 계산 (선+시그널+히스토그램) | P1 | EMA(12)-EMA(26), EMA(MACD,9), MACD-Signal |
| REQ-007 | RSI (14주) 계산 | P1 | 14주 상승평균/(상승+하락평균)×100 |
| REQ-008 | 200주선 대비 거리% | P1 | (현재가-SMA200)/SMA200×100 |
| REQ-009 | Drawdown% 계산 | P1 | (현재가-52주최고가)/52주최고가×100 |
| REQ-010 | 버핏지표% 계산 | P1 | WILSHIRE/GDP×100 |
| REQ-011 | ISM PMI 트렌드 계산 | P1 | 3개월 이동평균 방향 (rising/falling) |
| REQ-012 | 재고/출하비율 트렌드 계산 | P1 | 3개월 이동평균 방향 (rising/falling) |
| REQ-013 | CPI/PCE YoY% 계산 | P1 | 전년 동월 대비 변화율 |
| REQ-014 | NaN/데이터 부족 안전 처리 | P1 | 데이터 부족 시 None 반환, 크래시 없음 |

## 2. 제약 조건
- Phase 1의 MacroRawData를 입력으로 사용
- pandas/numpy만 사용 (추가 라이브러리 없음)
- 모든 계산 함수는 순수 함수 (side-effect 없음)
