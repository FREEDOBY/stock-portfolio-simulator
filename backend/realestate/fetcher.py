"""국토교통부 아파트 매매 실거래가 수집기.

공공데이터포털 '아파트 매매 실거래가 상세 자료' API에서 지역코드(LAWD_CD) 단위로
월별 거래를 받아 SQLite(deals.db)에 저장한다. 아파트 필터링은 조회 시점에 하므로
DB에는 해당 구의 전체 거래가 쌓인다.

사용법:
    python fetcher.py init          # start_ym부터 이번 달까지 전체 수집
    python fetcher.py update        # 최근 refresh_months개월 재수집
    python fetcher.py update 12     # 최근 12개월 재수집
"""

import json
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
DB_PATH = BASE_DIR / "deals.db"
API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
NUM_OF_ROWS = 1000


def load_config():
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS deals (
            deal_ymd TEXT NOT NULL,
            deal_date TEXT NOT NULL,
            apt_nm TEXT NOT NULL,
            umd_nm TEXT,
            jibun TEXT,
            exclu_ar REAL,
            amount INTEGER,
            floor INTEGER,
            apt_dong TEXT,
            build_year TEXT,
            dealing_gbn TEXT,
            cdeal_type TEXT,
            cdeal_day TEXT,
            rgst_date TEXT,
            buyer_gbn TEXT,
            sler_gbn TEXT
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_deals_ymd ON deals(deal_ymd)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_deals_apt ON deals(apt_nm)")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS fetch_log (
            deal_ymd TEXT,
            sgg TEXT DEFAULT '11710',
            fetched_at TEXT,
            row_count INTEGER,
            PRIMARY KEY (deal_ymd, sgg)
        )"""
    )
    # 다지역 지원 마이그레이션: 기존 단일 지역(송파) DB에 sgg 컬럼 추가
    cols = [r[1] for r in conn.execute("PRAGMA table_info(deals)")]
    if "sgg" not in cols:
        conn.execute("ALTER TABLE deals ADD COLUMN sgg TEXT DEFAULT '11710'")
    log_cols = [r[1] for r in conn.execute("PRAGMA table_info(fetch_log)")]
    if "sgg" not in log_cols:
        conn.execute("ALTER TABLE fetch_log RENAME TO fetch_log_old")
        conn.execute(
            """CREATE TABLE fetch_log (
                deal_ymd TEXT, sgg TEXT DEFAULT '11710',
                fetched_at TEXT, row_count INTEGER,
                PRIMARY KEY (deal_ymd, sgg))"""
        )
        conn.execute(
            "INSERT INTO fetch_log SELECT deal_ymd, '11710', fetched_at, row_count FROM fetch_log_old"
        )
        conn.execute("DROP TABLE fetch_log_old")
    conn.commit()
    return conn


def month_range(start_ym, end_ym):
    """'200601' ~ '202609' 사이 모든 YYYYMM 문자열."""
    y, m = int(start_ym[:4]), int(start_ym[4:])
    ey, em = int(end_ym[:4]), int(end_ym[4:])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def current_ym():
    t = date.today()
    return f"{t.year}{t.month:02d}"


def _text(item, tag):
    el = item.find(tag)
    return el.text.strip() if el is not None and el.text else ""


def _parse_items(root):
    rows = []
    for item in root.iter("item"):
        raw_amt = _text(item, "dealAmount").replace(",", "")
        try:
            amount = int(raw_amt)
        except ValueError:
            continue
        year = _text(item, "dealYear")
        month = _text(item, "dealMonth").zfill(2)
        day = _text(item, "dealDay").zfill(2)
        try:
            exclu = float(_text(item, "excluUseAr"))
        except ValueError:
            exclu = 0.0
        try:
            floor = int(_text(item, "floor"))
        except ValueError:
            floor = 0
        rows.append(
            (
                f"{year}{month}",
                f"{year}-{month}-{day}",
                _text(item, "aptNm"),
                _text(item, "umdNm"),
                _text(item, "jibun"),
                exclu,
                amount,
                floor,
                _text(item, "aptDong"),
                _text(item, "buildYear"),
                _text(item, "dealingGbn"),
                _text(item, "cdealType"),
                _text(item, "cdealDay"),
                _text(item, "rgstDate"),
                _text(item, "buyerGbn"),
                _text(item, "slerGbn"),
            )
        )
    return rows


def fetch_month(service_key, lawd_cd, ym, session=None):
    """한 달치 전체 페이지를 받아 파싱된 행 리스트를 반환."""
    sess = session or requests
    rows, page = [], 1
    while True:
        resp = sess.get(
            API_URL,
            params={
                "serviceKey": service_key,
                "LAWD_CD": lawd_cd,
                "DEAL_YMD": ym,
                "numOfRows": NUM_OF_ROWS,
                "pageNo": page,
            },
            timeout=30,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        code = (root.findtext(".//resultCode") or "").strip()
        msg = (root.findtext(".//resultMsg") or "").strip()
        if code not in ("00", "000"):
            raise RuntimeError(f"API 오류 [{code}] {msg} (DEAL_YMD={ym})")
        rows.extend(_parse_items(root))
        total = int(root.findtext(".//totalCount") or 0)
        if page * NUM_OF_ROWS >= total:
            break
        page += 1
    return rows


def save_month(conn, ym, rows, sgg):
    conn.execute("DELETE FROM deals WHERE deal_ymd = ? AND sgg = ?", (ym, sgg))
    conn.executemany(
        "INSERT INTO deals VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [r + (sgg,) for r in rows],
    )
    conn.execute(
        "INSERT OR REPLACE INTO fetch_log VALUES (?, ?, datetime('now','localtime'), ?)",
        (ym, sgg, len(rows)),
    )
    conn.commit()


def sync_months(months, progress_cb=None, lawd_cd=None):
    """지정한 월 목록을 순서대로 수집. progress_cb(done, total, ym, count)."""
    cfg = load_config()
    key = cfg.get("service_key", "").strip()
    if not key:
        raise RuntimeError("config.json의 service_key가 비어 있습니다.")
    lawd = lawd_cd or cfg["lawd_cd"]
    conn = get_conn()
    sess = requests.Session()
    total = len(months)
    try:
        for i, ym in enumerate(months, 1):
            for attempt in range(3):
                try:
                    rows = fetch_month(key, lawd, ym, sess)
                    break
                except (requests.RequestException, ET.ParseError):
                    if attempt == 2:
                        raise
                    time.sleep(2 * (attempt + 1))
            save_month(conn, ym, rows, lawd)
            if progress_cb:
                progress_cb(i, total, ym, len(rows))
            time.sleep(0.15)
    finally:
        conn.close()


def months_for_init():
    cfg = load_config()
    return month_range(cfg["start_ym"], current_ym())


def months_for_update(n=None):
    cfg = load_config()
    n = n or int(cfg.get("refresh_months", 6))
    all_months = month_range(cfg["start_ym"], current_ym())
    return all_months[-n:]


def _cli_progress(done, total, ym, count):
    print(f"[{done}/{total}] {ym}: {count}건")


if __name__ == "__main__":
    # 사용법: python fetcher.py init [지역코드] / python fetcher.py update [개월수] [지역코드]
    cmd = sys.argv[1] if len(sys.argv) > 1 else "update"
    lawd = None
    if cmd == "init":
        target = months_for_init()
        lawd = sys.argv[2] if len(sys.argv) > 2 else None
    elif cmd == "update":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else None
        target = months_for_update(n)
        lawd = sys.argv[3] if len(sys.argv) > 3 else None
    else:
        print(__doc__)
        sys.exit(1)
    print(f"{target[0]} ~ {target[-1]} ({len(target)}개월) 수집 시작 (지역 {lawd or '기본'})")
    sync_months(target, _cli_progress, lawd)
    print("완료")
