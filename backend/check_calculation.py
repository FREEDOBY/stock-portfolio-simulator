"""투자 방식별 계산 검증 스크립트"""
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import date, timedelta

# 최근 12개월 QLD 데이터 가져오기
end_date = date.today()
start_date = end_date - timedelta(days=365)

print("=== QLD 데이터 가져오는 중... ===")
qld = yf.Ticker('QLD')
df = qld.history(start=start_date.isoformat(), end=end_date.isoformat())

print(f'\n=== QLD 최근 12개월 데이터 ===')
print(f'기간: {df.index[0].date()} ~ {df.index[-1].date()}')
print(f'거래일 수: {len(df)}')
print(f'시작가: ${df.iloc[0]["Close"]:.2f}')
print(f'종가: ${df.iloc[-1]["Close"]:.2f}')

# 월별 첫 거래일 찾기
monthly_dates = []
current_month = None
for idx in df.index:
    if current_month != idx.month:
        monthly_dates.append(idx)
        current_month = idx.month

print(f'\n=== 월별 첫 거래일 가격 (DCA 투자일) ===')
for d in monthly_dates:
    print(f'{d.date()}: ${df.loc[d, "Close"]:.2f}')

# ===== 수동 계산 =====
initial_amount = 10000
dca_amount = 1000
ma_period = 120
multiplier = 2.0

print(f'\n{"="*60}')
print(f'설정: 초기투자 ${initial_amount}, 월 적립 ${dca_amount}')
print(f'MA 기간: {ma_period}일, 배수: {multiplier}')
print(f'{"="*60}')

# 1. 거치식 계산
print(f'\n[1] 거치식 (Lump Sum) 수동 계산')
first_price = df.iloc[0]["Close"]
shares_lump = initial_amount / first_price
final_value_lump = shares_lump * df.iloc[-1]["Close"]
print(f'  - 첫날 가격: ${first_price:.2f}')
print(f'  - 매수 주식수: {shares_lump:.4f}')
print(f'  - 최종 가치: ${final_value_lump:.2f}')
print(f'  - 수익률: {((final_value_lump / initial_amount) - 1) * 100:.2f}%')

# 2. 적립식(DCA) 계산
print(f'\n[2] 적립식 (DCA) 수동 계산')
shares_dca = 0
total_invested_dca = 0

for i, d in enumerate(monthly_dates):
    price = df.loc[d, "Close"]
    if i == 0:
        # 첫날은 초기투자금
        investment = initial_amount
    else:
        investment = dca_amount

    shares_bought = investment / price
    shares_dca += shares_bought
    total_invested_dca += investment
    print(f'  {d.date()}: 투자 ${investment:.0f}, 가격 ${price:.2f}, 매수 {shares_bought:.4f}주, 누적 {shares_dca:.4f}주')

final_value_dca = shares_dca * df.iloc[-1]["Close"]
print(f'  - 총 투자원금: ${total_invested_dca:.2f}')
print(f'  - 최종 가치: ${final_value_dca:.2f}')
print(f'  - 수익률: {((final_value_dca / total_invested_dca) - 1) * 100:.2f}%')

# 3. 이동평균 적립식(MA-DCA) 계산
print(f'\n[3] 이동평균 적립식 (MA-DCA) 수동 계산')
shares_ma_dca = 0
total_invested_ma_dca = 0

for i, d in enumerate(monthly_dates):
    price = df.loc[d, "Close"]

    # MA 계산
    d_idx = df.index.get_loc(d)
    if d_idx >= ma_period:
        ma = df.iloc[d_idx - ma_period:d_idx]["Close"].mean()
    else:
        ma = None

    if i == 0:
        # 첫날은 초기투자금
        investment = initial_amount
        ma_status = "-"
    else:
        # MA 비교
        if ma is not None and price < ma:
            investment = dca_amount * multiplier
            ma_status = f"가격 ${price:.2f} < MA ${ma:.2f} -> {multiplier}배"
        else:
            investment = dca_amount
            if ma is not None:
                ma_status = f"가격 ${price:.2f} >= MA ${ma:.2f} -> 1배"
            else:
                ma_status = "MA 데이터 부족 -> 1배"

    shares_bought = investment / price
    shares_ma_dca += shares_bought
    total_invested_ma_dca += investment
    print(f'  {d.date()}: 투자 ${investment:.0f}, {ma_status}')
    print(f'             가격 ${price:.2f}, 매수 {shares_bought:.4f}주, 누적 {shares_ma_dca:.4f}주')

final_value_ma_dca = shares_ma_dca * df.iloc[-1]["Close"]
print(f'  - 총 투자원금: ${total_invested_ma_dca:.2f}')
print(f'  - 최종 가치: ${final_value_ma_dca:.2f}')
print(f'  - 수익률: {((final_value_ma_dca / total_invested_ma_dca) - 1) * 100:.2f}%')

# 비교 요약
print(f'\n{"="*60}')
print(f'=== 투자 방식별 비교 요약 ===')
print(f'{"="*60}')
print(f'방식         | 투자원금      | 최종가치      | 수익률')
print(f'-' * 60)
print(f'거치식       | ${initial_amount:>10,.2f} | ${final_value_lump:>10,.2f} | {((final_value_lump / initial_amount) - 1) * 100:>6.2f}%')
print(f'적립식(DCA)  | ${total_invested_dca:>10,.2f} | ${final_value_dca:>10,.2f} | {((final_value_dca / total_invested_dca) - 1) * 100:>6.2f}%')
print(f'MA-DCA       | ${total_invested_ma_dca:>10,.2f} | ${final_value_ma_dca:>10,.2f} | {((final_value_ma_dca / total_invested_ma_dca) - 1) * 100:>6.2f}%')
