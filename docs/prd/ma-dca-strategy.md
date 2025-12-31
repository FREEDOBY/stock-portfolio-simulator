# PRD: 이동평균 기반 적립식 투자 전략 (MA-DCA)

## 1. 개요 (Overview)

### 목적
- 기존 거치식/적립식 외에 **이동평균 기반 적립식** 전략 추가
- 시장 상황에 따라 매수 금액을 자동 조절하여 저가 매수 효과 극대화

### 범위
- 백엔드: 새로운 투자 전략 로직 구현
- 프론트엔드: MA-DCA 설정 UI 추가
- 테스트: 단위 테스트 추가

### 성공 기준
- 모든 테스트 통과
- UI에서 MA-DCA 전략 선택 및 설정 가능
- 벤치마크도 동일한 MA-DCA 로직 적용

---

## 2. 기능 명세 (Functional Specifications)

### 2.1 사용자 스토리
- As a 투자자, I want 이동평균선 기준으로 매수 금액을 조절하는 전략을 사용하고 싶다, so that 저가일 때 더 많이 매수할 수 있다.

### 2.2 수락 기준 (Acceptance Criteria)
- [x] Given MA-DCA 전략 선택, When 현재가 < 120일 이동평균, Then 적립금 × 2배 매수
- [x] Given MA-DCA 전략 선택, When 현재가 ≥ 120일 이동평균, Then 기본 적립금 매수
- [x] Given MA-DCA 전략 선택, When 초기에 MA 계산 불가, Then 기본 적립금으로 매수
- [x] Given 설정 UI, When 사용자가 MA-DCA 선택, Then MA 기간/배수 설정 표시

### 2.3 기능 상세
| 기능 ID | 설명 | 우선순위 |
|---------|------|----------|
| F-001 | InvestmentType에 ma_dca 추가 | P1 |
| F-002 | MADCASettings 스키마 정의 | P1 |
| F-003 | 이동평균 계산 메서드 | P1 |
| F-004 | MA-DCA 포트폴리오 계산 메서드 | P1 |
| F-005 | run_backtest() 분기 추가 | P1 |
| F-006 | 프론트엔드 라디오버튼 추가 | P1 |
| F-007 | MA-DCA 설정 UI | P1 |

---

## 3. 기술 명세 (Technical Specifications)

### 3.1 아키텍처
```
사용자 입력 (MA-DCA 설정)
    ↓
POST /api/backtest (investment_type: ma_dca)
    ↓
run_backtest() → _calculate_portfolio_values_ma_dca()
    ↓
이동평균 계산 → 매수 금액 결정 → 포트폴리오 가치 계산
    ↓
응답 반환
```

### 3.2 데이터 모델

**MADCASettings (Backend)**
```python
class MADCASettings(BaseModel):
    frequency: DCAFrequency  # 투자 주기
    amount: float            # 기본 투자 금액
    ma_period: int = 120     # 이동평균 기간 (일)
    multiplier: float = 2.0  # 저가 매수 배수
```

**MADCASettings (Frontend)**
```typescript
interface MADCASettings {
  frequency: DCAFrequency;
  amount: number;
  ma_period: number;
  multiplier: number;
}
```

---

## 4. 테스트 계획 (Test Plan)

### 4.1 테스트 범위
- 단위 테스트: 이동평균 계산, MA-DCA 로직
- 통합 테스트: run_backtest() MA-DCA 모드

### 4.2 테스트 케이스 개요
| TC-ID | 설명 | 타입 |
|-------|------|------|
| TC-001 | 이동평균 계산 정확성 | Unit |
| TC-002 | MA-DCA 기본 흐름 | Integration |
| TC-003 | 저가 매수 배수 적용 | Unit |
| TC-004 | 데이터 부족 시 기본 금액 적용 | Unit |
| TC-005 | 벤치마크 MA-DCA 적용 | Integration |
| TC-006 | MA-DCA 설정 누락 시 에러 | Unit |

---

## 5. 엣지 케이스 & 오류 처리

### 5.1 엣지 케이스
- MA 계산에 충분한 데이터 없음 → 기본 적립금으로 매수
- MA 기간 > 백테스트 기간 → 전체 기간 기본 적립금

### 5.2 오류 시나리오
- ma_dca_settings 없이 investment_type="ma_dca" → 400 에러
- ma_period < 5 또는 > 365 → 유효성 검증 에러

---

## 6. 구현 체크리스트

- [x] Phase 3: 테스트 작성 완료 (8개 테스트 케이스)
- [x] Phase 4: 구현 완료
- [x] Phase 5: 모든 테스트 통과 (31개 전체)
- [x] Phase 6: 코드 리뷰 통과
- [x] Phase 7: 문서화 완료

## 7. 구현 완료 요약

### 수정된 파일
| 파일 | 변경 내용 |
|------|----------|
| `backend/app/models/schemas.py` | InvestmentType.MA_DCA, MADCASettings 추가 |
| `backend/app/services/backtest_engine.py` | calculate_moving_average(), _calculate_portfolio_values_ma_dca(), _calculate_single_asset_values_ma_dca() 추가 |
| `backend/app/routers/backtest.py` | MA-DCA 유효성 검증 및 설정 전달 |
| `frontend/src/types/index.ts` | MADCASettings 인터페이스 추가 |
| `frontend/src/components/SimulationSettings.tsx` | MA-DCA 라디오버튼 및 설정 UI |
| `frontend/src/App.tsx` | 기본값 및 API 호출 수정 |
| `backend/tests/test_backtest_engine.py` | TestMADCAInvestment 클래스 추가 (8개 테스트) |

### 메트릭
- 테스트: 31개 (모두 통과)
- LOOPBACK: 0회
- 보안 이슈: 0개
