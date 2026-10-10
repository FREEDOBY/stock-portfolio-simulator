"""네이버부동산(fin.land.naver.com) 현재 매물 호가 수집.

비공식 front-api를 사용한다. python requests의 TLS 지문은 WAF에 차단되므로
Windows 내장 curl.exe를 서브프로세스로 호출한다 (개인 로컬 용도).

- 단지: 올림픽훼밀리타운 complexNumber=610 (config.json naver_complex_no로 재정의 가능)
- 매매(A1) 전체 매물을 페이지네이션으로 수집, 전용면적 내림값(84/117/136/158/192)별
  최저·중앙 호가와 건수를 집계한다. 동일매물 묶음(duplicatedArticleInfo) 단위로 수집하며,
  호가는 묶음 내 중개사별 호가 중 **최저가** 기준 — 대표매물가만 보면 같은 집을 더 싸게
  올린 중개사 호가를 놓친다 (대표가와 다르면 repPrice에 대표가 보존).
- 레이트리밋(429) 대비: 호출 간 간격 + 지수 백오프, 결과는 30분 메모리 캐시.
"""

import json
import statistics
import subprocess
import time
from datetime import datetime
from pathlib import Path

import fetcher

API = "https://fin.land.naver.com/front-api/v1/complex/article/list"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")

# 네이버 IP 평판 보호: 수집은 하루 1회면 충분 (호가 변동 추적도 일 단위면 됨).
# 즉시 재수집이 필요하면 갱신 버튼(force=1)으로 명시적으로만.
CACHE_TTL = 24 * 3600
FAIL_COOLDOWN = 6 * 3600  # 수집 실패(차단) 후 이 시간 동안은 재시도하지 않는다
BASE = Path(__file__).resolve().parent
_caches: dict = {}   # str(complex_no) -> {"at": float, "data": dict}
_fails: dict = {}    # str(complex_no) -> 마지막 실패 시각


def _cache_file(no):
    return BASE / f"listings_cache_{no}.json"


def _get_cache(no):
    key = str(no)
    if key not in _caches:
        _caches[key] = {"at": 0.0, "data": None}
        # 디스크 보존본 로드 (구버전 단일 파일은 610 캐시로 승계)
        path = _cache_file(key)
        legacy = BASE / "listings_cache.json"
        if not path.exists() and key == "610" and legacy.exists():
            path = legacy
        try:
            saved = json.loads(path.read_text(encoding="utf-8"))
            _caches[key].update(at=saved["at"], data=saved["data"])
        except Exception:  # noqa: BLE001 - 파일 없음/손상 시 무시
            pass
    return _caches[key]


def _save_disk(no):
    c = _caches.get(str(no))
    if not c:
        return
    try:
        _cache_file(no).write_text(
            json.dumps({"at": c["at"], "data": c["data"]}, ensure_ascii=False),
            encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _curl_post(url: str, body: dict) -> dict:
    cmd = [
        "curl.exe", "-s", "--compressed", "--max-time", "30",
        "-H", f"User-Agent: {UA}",
        "-H", "Accept: application/json",
        "-H", "Accept-Language: ko-KR,ko;q=0.9",
        "-H", "Referer: https://fin.land.naver.com/complexes/610",
        "-H", "sec-fetch-site: same-origin",
        "-H", "sec-fetch-mode: cors",
        "-H", "sec-fetch-dest: empty",
        "-H", 'sec-ch-ua: "Chromium";v="130", "Google Chrome";v="130"',
        "-H", "sec-ch-ua-mobile: ?0",
        "-H", 'sec-ch-ua-platform: "Windows"',
        "-X", "POST", "-H", "Content-Type: application/json",
        "--data-raw", json.dumps(body, ensure_ascii=False),
        url,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True,
                         encoding="utf-8", errors="replace").stdout
    return json.loads(out.lstrip("﻿"))


def _fetch_page(complex_no: int, page: int, seed=None, last_info=None) -> dict:
    body = {
        "complexNumber": complex_no,
        "tradeTypes": ["A1"],
        "pyeongTypes": [],
        "dongNumbers": [],
        "userChannelType": "PC",
        "articleSortType": "RANKING_DESC",
        "page": page,
        "size": 20,
    }
    # 커서 기반 페이지네이션: 1페이지 응답의 seed/lastInfo를 다음 요청에 넘긴다
    if seed:
        body["seed"] = seed
    if last_info:
        body["lastInfo"] = last_info
    # 주의: 429 상태에서 재요청하면 차단이 연장되는 것으로 관찰됨 → 재시도 최소화
    for attempt in range(2):
        d = _curl_post(API, body)
        if d.get("isSuccess"):
            return d["result"]
        if d.get("detailCode") == "TOO_MANY_REQUESTS":
            if attempt == 0:
                time.sleep(15)
                continue
            raise RuntimeError("네이버 매물 API 레이트리밋 (잠시 후 재시도)")
        raise RuntimeError(f"네이버 매물 API 오류: {json.dumps(d, ensure_ascii=False)[:200]}")
    raise RuntimeError("네이버 매물 API 레이트리밋 지속 (잠시 후 재시도)")


def _find_str(obj, pred, depth=0):
    """중첩 dict에서 pred(key, value)를 만족하는 첫 문자열 값을 찾는다."""
    if depth > 4 or not isinstance(obj, dict):
        return None
    for k, v in obj.items():
        if isinstance(v, str) and v and pred(k.lower(), v):
            return v
    for v in obj.values():
        if isinstance(v, dict):
            r = _find_str(v, pred, depth + 1)
            if r:
                return r
    return None


def _desc(info: dict) -> str:
    return _find_str(info, lambda k, v: ("desc" in k or "feature" in k) and len(v) > 1) or ""


def _floor(info: dict) -> str:
    return _find_str(info, lambda k, v: "floor" in k and ("/" in v or v.isdigit())) or ""


def _confirmed(info: dict) -> str:
    v = _find_str(info, lambda k, v: ("confirm" in k or "exposure" in k or "verif" in k)
                  and any(c.isdigit() for c in v) and len(v) >= 8)
    return (v or "")[:10]


def _group_min(it: dict):
    """동일매물 묶음의 최저 매매호가 (만원) — 중개사마다 호가가 다를 수 있다."""
    try:
        v = it["duplicatedArticleInfo"]["representativePriceInfo"]["dealPrice"]["minPrice"]
    except (KeyError, TypeError):
        return None
    if isinstance(v, (int, float)) and v > 0:
        return v / 10000 if v >= 1e8 else v
    return None


def _walk_price(info: dict):
    """가격(만원) 추출 — priceInfo 안의 매매가 필드를 탐색. 원 단위면 만원으로 환산."""
    p = info.get("priceInfo") or {}
    for k in ("dealPrice", "price", "warrantPrice", "dealOrWarrantPrc"):
        v = p.get(k)
        if isinstance(v, str) and v.replace(",", "").isdigit():
            v = int(v.replace(",", ""))
        if isinstance(v, (int, float)) and v > 0:
            return v / 10000 if v >= 1e8 else v  # 26억 = 2.6e9원 → 26만(만원)
    return None


def fetch_articles(complex_no: int):
    """전체 매매 매물 (동일매물 묶음 단위, 호가는 묶음 최저가). articleNumber로 중복 제거."""
    arts, page, seen = [], 1, set()
    seed, last_info = None, None
    while True:
        res = _fetch_page(complex_no, page, seed, last_info)
        seed = res.get("seed") or seed
        last_info = res.get("lastInfo") or last_info
        new = 0
        for it in res.get("list", []):
            info = it.get("representativeArticleInfo") or it
            no = info.get("articleNumber")
            if no in seen:
                continue
            seen.add(no)
            space = (info.get("spaceInfo") or {}).get("exclusiveSpace")
            rep_price = _walk_price(info)
            if not space or not rep_price:
                continue
            # 호가 = 묶음 내 중개사별 호가 중 최저 (대표매물가가 최저가 아닐 수 있음)
            gmin = _group_min(it)
            price = min(rep_price, gmin) if gmin else rep_price
            realtors = (it.get("duplicatedArticleInfo") or {}).get("realtorCount") or 1
            new += 1
            arts.append({
                "space": float(space),
                "price": price,          # 만원 — 묶음 최저가
                "repPrice": rep_price,   # 만원 — 대표매물가 (참고용)
                "realtors": realtors,    # 묶음 내 중개사 수
                "dong": info.get("dongName") or "",
                "floor": _floor(info),
                "desc": _desc(info),
                "confirmed": _confirmed(info),
                "articleNo": str(no or ""),
            })
        total = res.get("totalCount") or 0
        # 페이지가 겹치기 시작하거나(커서 미지원) 다 모으면 중단.
        # 대단지(헬리오시티 9,510세대)는 매물이 수백 건 — 하루 1회 수집이라 50페이지까지 허용
        if not res.get("hasNextPage") or page >= 50 or new == 0 or len(seen) >= total:
            break
        page += 1
        time.sleep(2.5)
    return arts


def get_listing_stats(force: bool = False, complex_no=None):
    """평형별 호가 통계 (단지별 24시간 캐시 + 디스크 보존, force=True면 즉시 재수집).
    complex_no 생략 시 활성 프로필의 단지. 차단 중이면 마지막 수집본을 stale로 반환."""
    if complex_no is None:
        import profiles
        complex_no = int(profiles.get_active()["complexNo"])
    if int(complex_no) <= 0:  # 로컬 검색으로 전환한 단지 — 네이버 단지번호 미연결
        return {"ok": False,
                "msg": "이 단지는 네이버 단지번호가 연결되지 않아 매물 기능이 꺼져 있습니다 (실거래만 표시)"}
    now = time.time()
    _cache = _get_cache(complex_no)
    fail_at = _fails.get(str(complex_no), 0.0)
    if not force and _cache["data"] and now - _cache["at"] < CACHE_TTL:
        return _cache["data"]
    # 직전 수집이 차단당했다면 쿨다운 동안 시도 자체를 생략 (차단 연장 방지)
    if not force and _cache["data"] and now - fail_at < FAIL_COOLDOWN:
        return {**_cache["data"], "stale": True}

    try:
        arts = fetch_articles(complex_no)
        _fails[str(complex_no)] = 0.0
    except Exception:  # noqa: BLE001 - 레이트리밋 등: 이전 수집본으로 폴백
        _fails[str(complex_no)] = now
        if _cache["data"]:
            return {**_cache["data"], "stale": True}
        raise

    # 매물 히스토리 적재 (등장/가격변동/소멸/거래추정) — 실패해도 수집 결과는 반환
    try:
        import listing_history
        listing_history.record_snapshot(arts, complex_no)
    except Exception as e:  # noqa: BLE001
        print(f"[listings] 히스토리 적재 실패: {e!r}", flush=True)

    by_g = {}
    for a in arts:
        g = int(a["space"])
        by_g.setdefault(g, []).append(a)

    types = {}
    for g, items in sorted(by_g.items()):
        prices = sorted(x["price"] for x in items)
        ordered = sorted(items, key=lambda x: x["price"])
        types[str(g)] = {
            "count": len(items),
            "min": round(prices[0] / 10000, 2),                    # 억
            "median": round(statistics.median(prices) / 10000, 2), # 억
            "lows": [{"price": round(x["price"] / 10000, 2),
                      "floor": x["floor"], "dong": x["dong"],
                      "space": x["space"]} for x in ordered[:3]],
            "articles": [{"price": round(x["price"] / 10000, 2),
                          "repPrice": round(x.get("repPrice", x["price"]) / 10000, 2),
                          "realtors": x.get("realtors", 1),
                          "dong": x["dong"], "floor": x["floor"],
                          "space": x["space"], "desc": x["desc"],
                          "confirmed": x["confirmed"],
                          "articleNo": x["articleNo"]} for x in ordered],
        }

    data = {
        "ok": True,
        "asof": datetime.now().isoformat(timespec="seconds"),
        "complexNumber": complex_no,
        "total": len(arts),
        "types": types,
    }
    _cache.update(at=now, data=data)
    _save_disk(complex_no)
    return data


# ── 단지 검색 (new.land API — 호출 제한이 엄격해 24시간 캐시 + 디스크 보존) ──
SEARCH_API = "https://new.land.naver.com/api/search"
SEARCH_TTL = 24 * 3600
SEARCH_CACHE_FILE = BASE / "search_cache.json"
_search_cache: dict = {}  # keyword -> [at, results]


def _load_search_cache():
    if _search_cache:
        return
    try:
        _search_cache.update(json.loads(SEARCH_CACHE_FILE.read_text(encoding="utf-8")))
    except Exception:  # noqa: BLE001
        pass


def _save_search_cache():
    try:
        SEARCH_CACHE_FILE.write_text(
            json.dumps(_search_cache, ensure_ascii=False), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _curl_newland(url: str) -> dict:
    cmd = [
        "curl.exe", "-s", "--compressed", "--max-time", "20",
        "-H", f"User-Agent: {UA}",
        "-H", "Accept: application/json, text/plain, */*",
        "-H", "Accept-Language: ko-KR,ko;q=0.9",
        "-H", "Referer: https://new.land.naver.com/",
        url,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True,
                         encoding="utf-8", errors="replace").stdout
    try:
        return json.loads(out.lstrip("﻿"))
    except Exception:  # noqa: BLE001
        return {"code": "PARSE", "raw": out[:200]}


def search_complexes(keyword: str):
    """아파트명으로 단지 검색 → [{complexNo, name, lawdCd, address, households}]."""
    import urllib.parse
    keyword = keyword.strip()
    _load_search_cache()
    hit = _search_cache.get(keyword)
    if hit and time.time() - hit[0] < SEARCH_TTL:
        return hit[1]
    d = _curl_newland(f"{SEARCH_API}?keyword={urllib.parse.quote(keyword)}&page=1")
    if d.get("code") == "TOO_MANY_REQUESTS":
        raise RuntimeError("네이버 검색 호출 제한 — 1~2분 후 다시 시도하세요")
    out = []
    for c in d.get("complexes") or []:
        cortar = str(c.get("cortarNo") or "")
        out.append({
            "complexNo": c.get("complexNo"),
            "name": c.get("complexName") or "",
            "lawdCd": cortar[:5],
            "address": c.get("cortarAddress") or c.get("address") or "",
            "households": c.get("totalHouseholdCount") or 0,
            "type": c.get("realEstateTypeName") or "",
        })
    out = [c for c in out if c["complexNo"] and c["lawdCd"]]
    _search_cache[keyword] = [time.time(), out]
    _save_search_cache()
    return out


# ── 중개사(부동산) 정보: 클릭 시 1건씩 온디맨드 조회 ─────────────
AGENT_API = "https://fin.land.naver.com/front-api/v1/article/agent"
_agent_cache = {}  # articleNo → 정규화된 정보


def _collect_strings(obj, out, depth=0):
    if depth > 5:
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                _collect_strings(v, out, depth + 1)
            elif isinstance(v, (str, int, float)) and v != "":
                out.append((k.lower(), str(v)))
    elif isinstance(obj, list):
        for v in obj:
            _collect_strings(v, out, depth + 1)


def _normalize_agent(payload: dict) -> dict:
    """응답에서 상호/대표/전화/주소를 키 이름 기반으로 추출."""
    kv = []
    _collect_strings(payload, kv)
    def pick(*subs, pred=None):
        for k, v in kv:
            if any(s in k for s in subs) and (pred is None or pred(v)):
                return v
        return ""
    phone_pred = lambda v: sum(c.isdigit() for c in v) >= 8  # noqa: E731
    return {
        "name": pick("brokername", "officename", "realtorname", "companyname", "name"),
        "ceo": pick("representativename", "ceoname", "ownername"),
        "phone": pick("representativetelephone", "telephone", "phone", "tel",
                      pred=phone_pred),
        "cell": pick("cellphone", "mobile", pred=phone_pred),
        "address": pick("address", "addr"),
    }


def get_agent(article_no: str):
    """매물의 중개사무소 정보 (상호·대표·전화·주소). 매물당 1회 호출 후 캐시."""
    if article_no in _agent_cache:
        return _agent_cache[article_no]
    attempts = [
        lambda: _curl_post(AGENT_API, {"articleNumber": article_no}),
        lambda: _curl_get(f"{AGENT_API}?articleNumber={article_no}"),
    ]
    last = None
    for call in attempts:
        d = call()
        last = d
        if d.get("isSuccess") and d.get("result"):
            info = _normalize_agent(d["result"])
            info["ok"] = bool(info["name"] or info["phone"])
            info["articleNo"] = article_no
            if info["ok"]:
                _agent_cache[article_no] = info
            return info
        if d.get("detailCode") == "TOO_MANY_REQUESTS":
            return {"ok": False, "msg": "네이버 호출 제한 — 잠시 후 다시 시도하세요",
                    "articleNo": article_no}
    return {"ok": False, "msg": f"조회 실패: {json.dumps(last, ensure_ascii=False)[:150]}",
            "articleNo": article_no}


def _curl_get(url: str) -> dict:
    cmd = [
        "curl.exe", "-s", "--compressed", "--max-time", "30",
        "-H", f"User-Agent: {UA}",
        "-H", "Accept: application/json",
        "-H", "Accept-Language: ko-KR,ko;q=0.9",
        "-H", "Referer: https://fin.land.naver.com/complexes/610",
        "-H", "sec-fetch-site: same-origin",
        "-H", "sec-fetch-mode: cors",
        "-H", "sec-fetch-dest: empty",
        url,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True,
                         encoding="utf-8", errors="replace").stdout
    try:
        return json.loads(out.lstrip("﻿"))
    except Exception:  # noqa: BLE001
        return {"isSuccess": False, "detailCode": "PARSE", "raw": out[:200]}


if __name__ == "__main__":
    print(json.dumps(get_listing_stats(), ensure_ascii=False, indent=1))
