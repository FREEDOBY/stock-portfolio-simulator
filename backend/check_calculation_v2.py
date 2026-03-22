"""투자 방식별 계산 검증 스크립트 v2 - 3년 기간 + 엔진 비교"""
import sys
sys.path.insert(0, 'C:/AutomationTool/6_Ascenda/stock-portfolio-simulator/backend')

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import date, timedelta
from app.services.backtest_engine import BacktestEngine

# 3년 기간으로 테스트
end_date = date.today()
start_date = end_date - timedelta(days=365*3)

print("=== QLD 데이터 가져오는 중 (3년)... ===")
qld = yf.Ticker('QLD')
df = qld.history(start=start_date.isoformat(), end=end_date.isoformat())

print(f'\n=== QLD 3년 데이터 ===')
print(f'기간: {df.index[0].date()} ~ {df.index[-1].date()}')
print(f'거래일 수: {len(df)}')
print(f'시작가: ${df.iloc[0]["Close"]:.2f}')
print(f'종가: ${df.iloc[-1]["Close"]:.2f}')

# 월별 첫 거래일 찾기
monthly_dates = []
current_month = None
for idx in df.index:
    month_key = (idx.year, idx.month)
    if current_month != month_key:
        monthly_dates.append(idx)
        current_month = month_key

print(f'월별 투자일 수: {len(monthly_dates)}')

# 설정
initial_amount = 10000
dca_amount = 1000
ma_period = 120
multiplier = 2.0

print(f'\n{"="*70}')
print(f'설정: 초기투자 ${initial_amount}, 월 적립 ${dca_amount}')
print(f'MA 기간: {ma_period}일, 배수: {multiplier}')
print(f'{"="*70}')

# 1. 거치식 수동 계산
print(f'\n[1] 거치식 (Lump Sum) 수동 계산')
first_price = df.iloc[0]["Close"]
shares_lump = initial_amount / first_price
final_value_lump = shares_lump * df.iloc[-1]["Close"]
print(f'  - 투자원금: ${initial_amount:.2f}')
print(f'  - 최종 가치: ${final_value_lump:.2f}')
print(f'  - 수익률: {((final_value_lump / initial_amount) - 1) * 100:.2f}%')

# 2. 적립식(DCA) 수동 계산
print(f'\n[2] 적립식 (DCA) 수동 계산')
shares_dca = 0
total_invested_dca = 0

for i, d in enumerate(monthly_dates):
    price = df.loc[d, "Close"]
    if i == 0:
        investment = initial_amount
    else:
        investment = dca_amount

    shares_bought = investment / price
    shares_dca += shares_bought
    total_invested_dca += investment

final_value_dca = shares_dca * df.iloc[-1]["Close"]
print(f'  - 총 투자원금: ${total_invested_dca:.2f}')
print(f'  - 최종 가치: ${final_value_dca:.2f}')
print(f'  - 수익률: {((final_value_dca / total_invested_dca) - 1) * 100:.2f}%')

# 3. 이동평균 적립식(MA-DCA) 수동 계산
print(f'\n[3] 이동평균 적립식 (MA-DCA) 수동 계산')
shares_ma_dca = 0
total_invested_ma_dca = 0
multiplier_applied_count = 0
normal_count = 0
insufficient_data_count = 0

for i, d in enumerate(monthly_dates):
    price = df.loc[d, "Close"]

    # MA 계산
    d_idx = df.index.get_loc(d)
    if d_idx >= ma_period:
        ma = df.iloc[d_idx - ma_period:d_idx]["Close"].mean()
    else:
        ma = None

    if i == 0:
        investment = initial_amount
    else:
        if ma is not None and price < ma:
            investment = dca_amount * multiplier
            multiplier_applied_count += 1
        else:
            investment = dca_amount
            if ma is None:
                insufficient_data_count += 1
            else:
                normal_count += 1

    shares_bought = investment / price
    shares_ma_dca += shares_bought
    total_invested_ma_dca += investment

final_value_ma_dca = shares_ma_dca * df.iloc[-1]["Close"]
print(f'  - 총 투자원금: ${total_invested_ma_dca:.2f}')
print(f'  - 최종 가치: ${final_value_ma_dca:.2f}')
print(f'  - 수익률: {((final_value_ma_dca / total_invested_ma_dca) - 1) * 100:.2f}%')
print(f'  - 배수 적용 횟수 (가격<MA): {multiplier_applied_count}회')
print(f'  - 일반 적용 횟수 (가격>=MA): {normal_count}회')
print(f'  - MA 데이터 부족: {insufficient_data_count}회')

# 비교 요약
print(f'\n{"="*70}')
print(f'=== 수동 계산 비교 요약 ===')
print(f'{"="*70}')
print(f'방식         | 투자원금         | 최종가치         | 수익률')
print(f'-' * 70)
print(f'거치식       | ${initial_amount:>12,.2f} | ${final_value_lump:>12,.2f} | {((final_value_lump / initial_amount) - 1) * 100:>7.2f}%')
print(f'적립식(DCA)  | ${total_invested_dca:>12,.2f} | ${final_value_dca:>12,.2f} | {((final_value_dca / total_invested_dca) - 1) * 100:>7.2f}%')
print(f'MA-DCA       | ${total_invested_ma_dca:>12,.2f} | ${final_value_ma_dca:>12,.2f} | {((final_value_ma_dca / total_invested_ma_dca) - 1) * 100:>7.2f}%')

# ===== 백테스트 엔진 결과 비교 =====
print(f'\n{"="*70}')
print(f'=== 백테스트 엔진 결과 ===')
print(f'{"="*70}')

engine = BacktestEngine()
portfolio = [{"symbol": "QLD", "weight": 1.0}]

# 거치식
result_lump = engine.run_backtest(
    portfolio=portfolio,
    start_date=df.index[0].date(),
    end_date=df.index[-1].date(),
    initial_amount=initial_amount,
    rebalance="none",
    investment_type="lump_sum"
)

# 적립식
result_dca = engine.run_backtest(
    portfolio=portfolio,
    start_date=df.index[0].date(),
    end_date=df.index[-1].date(),
    initial_amount=initial_amount,
    rebalance="none",
    investment_type="dca",
    dca_settings={"amount": dca_amount, "frequency": "monthly"}
)

# MA-DCA
result_ma_dca = engine.run_backtest(
    portfolio=portfolio,
    start_date=df.index[0].date(),
    end_date=df.index[-1].date(),
    initial_amount=initial_amount,
    rebalance="none",
    investment_type="ma_dca",
    ma_dca_settings={
        "amount": dca_amount,
        "frequency": "monthly",
        "ma_period": ma_period,
        "multiplier": multiplier
    }
)

print(f'방식         | 투자원금         | 최종가치         | 수익률(CAGR)')
print(f'-' * 70)
engine_lump_final = result_lump["portfolio_values"][-1]["value"]
print(f'거치식       | ${result_lump["total_invested"]:>12,.2f} | ${engine_lump_final:>12,.2f} | {result_lump["metrics"]["cagr"]*100:>7.2f}%')

engine_dca_final = result_dca["portfolio_values"][-1]["value"]
print(f'적립식(DCA)  | ${result_dca["total_invested"]:>12,.2f} | ${engine_dca_final:>12,.2f} | {result_dca["metrics"]["cagr"]*100:>7.2f}%')

engine_ma_dca_final = result_ma_dca["portfolio_values"][-1]["value"]
print(f'MA-DCA       | ${result_ma_dca["total_invested"]:>12,.2f} | ${engine_ma_dca_final:>12,.2f} | {result_ma_dca["metrics"]["cagr"]*100:>7.2f}%')

# 수동 vs 엔진 비교
print(f'\n{"="*70}')
print(f'=== 수동 계산 vs 엔진 결과 비교 ===')
print(f'{"="*70}')
print(f'방식         | 수동 최종가치    | 엔진 최종가치    | 차이')
print(f'-' * 70)
diff_lump = abs(final_value_lump - engine_lump_final)
diff_dca = abs(final_value_dca - engine_dca_final)
diff_ma_dca = abs(final_value_ma_dca - engine_ma_dca_final)
print(f'거치식       | ${final_value_lump:>12,.2f} | ${engine_lump_final:>12,.2f} | ${diff_lump:>8,.2f}')
print(f'적립식(DCA)  | ${final_value_dca:>12,.2f} | ${engine_dca_final:>12,.2f} | ${diff_dca:>8,.2f}')
print(f'MA-DCA       | ${final_value_ma_dca:>12,.2f} | ${engine_ma_dca_final:>12,.2f} | ${diff_ma_dca:>8,.2f}')

# MA-DCA 상세 분석
print(f'\n{"="*70}')
print(f'=== MA-DCA 투자 상세 분석 ===')
print(f'{"="*70}')
print(f'날짜         | 가격    | MA       | 비교      | 투자금액  | 누적투자')
print(f'-' * 70)

cumulative = 0
for i, d in enumerate(monthly_dates):
    price = df.loc[d, "Close"]
    d_idx = df.index.get_loc(d)

    if d_idx >= ma_period:
        ma = df.iloc[d_idx - ma_period:d_idx]["Close"].mean()
        ma_str = f'${ma:>7.2f}'
    else:
        ma = None
        ma_str = '  N/A   '

    if i == 0:
        investment = initial_amount
        compare = '첫투자'
    else:
        if ma is not None and price < ma:
            investment = dca_amount * multiplier
            compare = f'가격<MA {multiplier}배'
        else:
            investment = dca_amount
            if ma is None:
                compare = '데이터부족'
            else:
                compare = '가격>=MA'

    cumulative += investment
    print(f'{d.date()} | ${price:>6.2f} | {ma_str} | {compare:<10} | ${investment:>7.0f} | ${cumulative:>9,.0f}')
