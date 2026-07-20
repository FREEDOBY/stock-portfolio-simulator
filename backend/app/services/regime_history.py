"""반도체 레짐 판정 이력 (로컬 축적) — 리드타임 검증·배점 튜닝용

판정 자체에는 영향 없음. 일별 스코어·국면·신호 상태를 backend/data/에
upsert해 두면, 다음 변곡에서 "경고가 고점보다 며칠 앞섰나"를 실측할 수 있다.
로컬 전용 (Render 무료 플랜은 디스크 휘발).
"""
import json
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

_FILE = Path(__file__).resolve().parents[2] / "data" / "regime_score_history.json"
_MAX_DAYS = 730


def append_daily(entry: dict) -> list[dict]:
    """오늘 날짜로 판정 스냅샷을 upsert하고 전체 이력 반환"""
    try:
        history = json.loads(_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        history = []
    row = {"date": datetime.now().strftime("%Y-%m-%d"), **entry}
    if history and history[-1].get("date") == row["date"]:
        history[-1] = row
    else:
        history.append(row)
    history = history[-_MAX_DAYS:]
    try:
        _FILE.parent.mkdir(parents=True, exist_ok=True)
        _FILE.write_text(json.dumps(history, ensure_ascii=False), encoding="utf-8")
    except OSError as e:
        logger.warning("regime history save failed: %s", e)
    return history
