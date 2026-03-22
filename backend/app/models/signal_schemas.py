"""매매 시그널 Pydantic 스키마"""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class SignalStatus(str, Enum):
    BUY = "buy"
    SELL = "sell"
    WAIT = "wait"


class SignalVerdict(str, Enum):
    AGGRESSIVE_BUY = "aggressive_buy"  # 적극 매수
    BUY = "buy"                        # 매수
    HOLD = "hold"                      # 관망
    CAUTION = "caution"                # 주의
    SELL = "sell"                       # 매도


class SignalResult(BaseModel):
    """개별 시그널 결과"""
    signal_id: int
    name: str
    score: float = Field(..., ge=-2, le=2)
    weight: float
    status: SignalStatus
    reason: str = ""


class SignalHistoryEntry(BaseModel):
    """시그널 상태 변경 이력"""
    date: str
    signal_id: int
    prev_status: SignalStatus
    new_status: SignalStatus
    reason: str = ""


class OverallResult(BaseModel):
    """종합 판정 결과"""
    score: float
    verdict: SignalVerdict
    signals: list[SignalResult] = Field(default_factory=list)
    history: list[SignalHistoryEntry] = Field(default_factory=list)
    updated_at: Optional[str] = None
