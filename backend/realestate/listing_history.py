"""매물 히스토리 추적.

네이버 매물 수집(listings.fetch_articles)이 성공할 때마다 스냅샷을 deals.db에 적재하고,
매물번호(articleNo) 단위로 등장/가격변동/소멸 이벤트를 기록한다.
소멸된 매물은 국토부 실거래 신고와 매칭해 '거래추정'으로 연결한다.

판정 규칙:
  - 소멸: 2회 연속 수집에서 미출현 (일시 누락 오탐 방지).
    단 미출현 카운트는 6시간에 1회만 — 몇 분 간격 연속 수집이 2회로 집계되는 오탐 방지.
  - 거래추정: 소멸 전후(-30일~+90일) 같은 동·같은 평형·호가 ±3% 실거래 신고 존재
  - 재등록: 중개사가 재등록하면 매물번호가 바뀌어 이력이 끊긴다. 신규 매물이
    30일 내 소멸된 같은 동·층·평형·호가 ±8% 매물과 일치하면 prev_article_no로
    연결하고 '재등록' 이벤트(이전 호가 → 새 호가)를 남겨 가격 이력을 잇는다.
"""

import json
from datetime import datetime, timedelta

import fetcher


def _conn():
    conn = fetcher.get_conn()
    # 수집 직후 다른 API가 deals.db를 읽는 중일 수 있으므로 락 대기 시간을 넉넉히
    conn.execute("PRAGMA busy_timeout=15000")
    conn.execute("""CREATE TABLE IF NOT EXISTS listing (
        article_no TEXT PRIMARY KEY,
        g INTEGER, dong TEXT, floor TEXT, space REAL,
        first_seen TEXT, last_seen TEXT,
        status TEXT DEFAULT 'active',      -- active | gone
        gone_at TEXT,
        first_price REAL, last_price REAL, min_price REAL, max_price REAL,
        miss INTEGER DEFAULT 0,
        fav INTEGER DEFAULT 0,
        matched_deal TEXT                  -- 거래추정 시 실거래 JSON
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS listing_snapshot (
        fetched_at TEXT, article_no TEXT, price REAL,
        dong TEXT, floor TEXT, space REAL, g INTEGER, desc TEXT, confirmed TEXT
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS listing_event (
        article_no TEXT, at TEXT, type TEXT,
        old_price REAL, new_price REAL, note TEXT
    )""")
    # 마이그레이션: 재등록 연결(prev_article_no) + 미출현 카운트 시각(miss_at)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(listing)")]
    if "prev_article_no" not in cols:
        conn.execute("ALTER TABLE listing ADD COLUMN prev_article_no TEXT")
    if "miss_at" not in cols:
        conn.execute("ALTER TABLE listing ADD COLUMN miss_at TEXT")
    # 다단지 지원: 단지 번호로 스코프 (기존 데이터는 올훼 610)
    if "complex_no" not in cols:
        conn.execute("ALTER TABLE listing ADD COLUMN complex_no TEXT DEFAULT '610'")
    snap_cols = [r[1] for r in conn.execute("PRAGMA table_info(listing_snapshot)")]
    if "complex_no" not in snap_cols:
        conn.execute("ALTER TABLE listing_snapshot ADD COLUMN complex_no TEXT DEFAULT '610'")
    conn.commit()
    return conn


def _ev(conn, no, at, type_, old=None, new=None, note=""):
    conn.execute("INSERT INTO listing_event VALUES (?,?,?,?,?,?)",
                 (no, at, type_, old, new, note))


def record_snapshot(arts, complex_no=610):
    """수집 성공 시 호출. arts = listings.fetch_articles() 결과 (price는 만원).
    단지(complex_no) 범위 안에서만 등장/소멸을 판정한다."""
    cx = str(complex_no)
    now = datetime.now().isoformat(timespec="seconds")
    conn = _conn()
    try:
        current = {a["articleNo"]: a for a in arts if a.get("articleNo")}
        rows = {r[0]: r for r in conn.execute(
            "SELECT article_no, status, last_price, miss, miss_at FROM listing "
            "WHERE complex_no = ?", (cx,))}

        for no, a in current.items():
            g = int(a["space"])
            conn.execute(
                """INSERT INTO listing_snapshot
                   (fetched_at, article_no, price, dong, floor, space, g, desc,
                    confirmed, complex_no) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (now, no, a["price"], a["dong"], a["floor"], a["space"], g,
                 a.get("desc", ""), a.get("confirmed", ""), cx))
            if no not in rows:
                conn.execute(
                    """INSERT INTO listing (article_no, g, dong, floor, space,
                       first_seen, last_seen, status, first_price, last_price,
                       min_price, max_price, miss, complex_no)
                       VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,0,?)""",
                    (no, g, a["dong"], a["floor"], a["space"], now, now,
                     a["price"], a["price"], a["price"], a["price"], cx))
                # 재등록 연결은 소멸 처리까지 끝난 뒤 link_relisted()가 일괄 수행
                _ev(conn, no, now, "등장", new=a["price"])
            else:
                _, status, last_price, _, _ = rows[no]
                if status == "gone":  # 소멸 처리됐다가 다시 나타남
                    conn.execute(
                        "UPDATE listing SET status='active', gone_at=NULL, matched_deal=NULL WHERE article_no=?",
                        (no,))
                    _ev(conn, no, now, "재출현", new=a["price"])
                if last_price is not None and abs(a["price"] - last_price) >= 1:
                    _ev(conn, no, now, "가격변동", old=last_price, new=a["price"])
                conn.execute(
                    """UPDATE listing SET last_seen=?, last_price=?, miss=0, miss_at=NULL,
                       min_price=MIN(min_price,?), max_price=MAX(max_price,?),
                       dong=?, floor=? WHERE article_no=?""",
                    (now, a["price"], a["price"], a["price"],
                     a["dong"], a["floor"], no))

        # 미출현 처리: miss 증가, 2회 연속이면 소멸 확정.
        # 단 몇 분 간격 중복 수집이 2회로 집계되지 않게 6시간에 1회만 센다.
        for no, (_, status, last_price, miss, miss_at) in rows.items():
            if no in current or status != "active":
                continue
            if miss_at and datetime.now() - datetime.fromisoformat(miss_at) < timedelta(hours=6):
                continue
            miss += 1
            if miss >= 2:
                conn.execute(
                    "UPDATE listing SET status='gone', gone_at=?, miss=?, miss_at=? WHERE article_no=?",
                    (now, miss, now, no))
                _ev(conn, no, now, "소멸", old=last_price)
            else:
                conn.execute("UPDATE listing SET miss=?, miss_at=? WHERE article_no=?",
                             (miss, now, no))

        conn.commit()
        link_relisted(conn, cx)
        match_sold(conn, cx)
    finally:
        conn.close()


def _floor_range(floor_txt):
    """'8/15' → (8,8), '저/15' → (1,5), '중/15' → (6,10), '고/15' → (11,15)"""
    if not floor_txt or "/" not in floor_txt:
        return None
    top_s = floor_txt.split("/")[1]
    lo_s = floor_txt.split("/")[0]
    try:
        top = int(top_s)
    except ValueError:
        return None
    if lo_s.isdigit():
        f = int(lo_s)
        return (f, f)
    third = max(1, top // 3)
    return {"저": (1, third), "중": (third + 1, 2 * third),
            "고": (2 * third + 1, top)}.get(lo_s)


def link_relisted(conn=None, complex_no=610):
    """재등록 연결: 매물번호가 바뀐 같은 집을 이전 매물과 잇는다.

    최근 등장한(3일 내) 미연결 활성 매물에 대해, 30일 내 소멸된 같은 동·층·평형
    ·호가 ±8% 매물을 찾아 prev_article_no로 연결하고 '재등록' 이벤트
    (이전 호가 → 새 호가)를 남긴다. 소멸 매물 하나는 후속 매물 하나에만 연결."""
    own = conn is None
    if own:
        conn = _conn()
    cx = str(complex_no)
    try:
        new_ones = conn.execute(
            """SELECT article_no, g, dong, floor, last_price, first_seen FROM listing
               WHERE complex_no=? AND status='active' AND prev_article_no IS NULL
                 AND first_seen >= ? ORDER BY first_seen""",
            (cx, (datetime.now() - timedelta(days=3)).isoformat())).fetchall()
        for no, g, dong, floor, price, first_seen in new_ones:
            # 후보: 소멸 확정분 + "이번 수집에서 사라진" 매물(miss>=1).
            # 호가를 내리며 재등록하면 소멸 확정(2회 미출현)보다 먼저 새 번호가
            # 등장하므로, gone만 보면 인하를 '신규 매물'로 놓친다.
            old = conn.execute(
                """SELECT article_no, last_price FROM listing
                   WHERE complex_no=? AND g=? AND dong=? AND floor=?
                     AND article_no != ? AND last_seen < ?
                     AND (status='gone' OR miss >= 1)
                     AND COALESCE(gone_at, last_seen) >= ?
                     AND ABS(last_price-?) <= ?*0.08
                     AND article_no NOT IN
                         (SELECT prev_article_no FROM listing
                          WHERE prev_article_no IS NOT NULL)
                   ORDER BY ABS(last_price-?), COALESCE(gone_at, last_seen) DESC
                   LIMIT 1""",
                (cx, g, dong, floor, no, first_seen,
                 (datetime.now() - timedelta(days=30)).isoformat(),
                 price, price, price)).fetchone()
            if not old:
                continue
            old_no, old_price = old
            conn.execute("UPDATE listing SET prev_article_no=? WHERE article_no=?",
                         (old_no, no))
            diff = price - old_price
            note = f"이전 매물 {old_no}"
            if abs(diff) >= 1:
                note += f" ({'인하' if diff < 0 else '인상'} {abs(diff)/10000:.1f}억)"
            _ev(conn, no, first_seen, "재등록", old=old_price, new=price, note=note)
        conn.commit()
    finally:
        if own:
            conn.close()


def match_sold(conn=None, complex_no=610):
    """소멸 매물을 실거래 신고와 매칭 → matched_deal 기록 + '거래추정' 이벤트."""
    own = conn is None
    if own:
        conn = _conn()
    cx = str(complex_no)
    try:
        import profiles
        data = profiles.load()
        prof = data["complexes"].get(cx) or profiles.get_active()
        kw = prof.get("aptKeyword") or prof.get("name", "")
        # 재등록으로 이어진 매물(후속 매물의 prev)은 팔린 게 아니므로 제외
        gone = conn.execute(
            """SELECT article_no, g, dong, floor, last_price, gone_at
               FROM listing WHERE complex_no=? AND status='gone'
                 AND matched_deal IS NULL
                 AND article_no NOT IN
                     (SELECT prev_article_no FROM listing
                      WHERE prev_article_no IS NOT NULL)""", (cx,)).fetchall()
        for no, g, dong, floor, price, gone_at in gone:
            d0 = (datetime.fromisoformat(gone_at) - timedelta(days=30)).date().isoformat()
            d1 = (datetime.fromisoformat(gone_at) + timedelta(days=90)).date().isoformat()
            clause, param = profiles.name_clause(kw)
            cands = conn.execute(
                f"""SELECT deal_date, amount, floor, apt_dong FROM deals
                    WHERE {clause} AND CAST(exclu_ar AS INT) = ?
                      AND deal_date BETWEEN ? AND ?
                      AND (cdeal_type IS NULL OR cdeal_type != '해제')
                      AND ABS(amount - ?) <= ? * 0.03""",
                (param, g, d0, d1, price, price)).fetchall()
            fr = _floor_range(floor)
            best = None
            for dd, amt, fl, ddong in cands:
                if dong and ddong and dong != ddong:
                    continue
                if fr and fl and not (fr[0] <= fl <= fr[1]):
                    continue
                if best is None or abs(amt - price) < abs(best[1] - price):
                    best = (dd, amt, fl, ddong)
            if best:
                mj = json.dumps({"date": best[0], "amt": best[1],
                                 "floor": best[2], "dong": best[3]}, ensure_ascii=False)
                conn.execute("UPDATE listing SET matched_deal=? WHERE article_no=?",
                             (mj, no))
                _ev(conn, no, datetime.now().isoformat(timespec="seconds"),
                    "거래추정", old=price, new=best[1],
                    note=f"실거래 {best[1]/10000:.1f}억 ({best[0]}, {best[2]}층)")
        conn.commit()
    finally:
        if own:
            conn.close()


def get_history(complex_no=None):
    """프론트용 요약: 매물별 상태·가격이력·이벤트 (활성 단지 범위)."""
    if complex_no is None:
        import profiles
        complex_no = profiles.get_active()["complexNo"]
    cx = str(complex_no)
    conn = _conn()
    try:
        link_relisted(conn, cx)
        match_sold(conn, cx)
        out = {}
        for r in conn.execute(
            """SELECT article_no, g, dong, floor, space, first_seen, last_seen,
                      status, gone_at, first_price, last_price, min_price, max_price,
                      fav, matched_deal, prev_article_no FROM listing
               WHERE complex_no=?""", (cx,)):
            out[r[0]] = {
                "articleNo": r[0], "g": r[1], "dong": r[2], "floor": r[3],
                "space": r[4], "firstSeen": r[5], "lastSeen": r[6],
                "status": r[7], "goneAt": r[8],
                "firstPrice": r[9] / 10000 if r[9] else None,
                "lastPrice": r[10] / 10000 if r[10] else None,
                "minPrice": r[11] / 10000 if r[11] else None,
                "maxPrice": r[12] / 10000 if r[12] else None,
                "fav": bool(r[13]),
                "matchedDeal": json.loads(r[14]) if r[14] else None,
                "prevArticleNo": r[15],
                "successor": None,  # 소멸 매물이 재등록됐으면 아래에서 채움
                "events": [],
            }
        for h in out.values():
            prev = h["prevArticleNo"]
            if prev and prev in out:
                out[prev]["successor"] = {
                    "articleNo": h["articleNo"], "price": h["lastPrice"],
                }
        for no, at, type_, old, new, note in conn.execute(
                "SELECT article_no, at, type, old_price, new_price, note "
                "FROM listing_event ORDER BY at"):
            if no in out:
                out[no]["events"].append({
                    "at": at, "type": type_,
                    "old": old / 10000 if old else None,
                    "new": new / 10000 if new else None,
                    "note": note or "",
                })
        return {"ok": True, "listings": out}
    finally:
        conn.close()


def toggle_fav(article_no: str):
    conn = _conn()
    try:
        cur = conn.execute("SELECT fav FROM listing WHERE article_no=?",
                           (article_no,)).fetchone()
        if not cur:
            return {"ok": False, "msg": "매물 없음"}
        nv = 0 if cur[0] else 1
        conn.execute("UPDATE listing SET fav=? WHERE article_no=?", (nv, article_no))
        conn.commit()
        return {"ok": True, "fav": bool(nv)}
    finally:
        conn.close()
