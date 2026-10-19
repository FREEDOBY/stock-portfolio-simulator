"""올림픽훼밀리타운 실거래가 API.

backend/realestate/의 검증된 Python 파이프라인(fetcher·cycle·region_analysis)을
FastAPI 라우터로 직결한다. 데이터는 backend/realestate/deals.db (SQLite).

원본 프로젝트: C:\\AutomationTool\\RealEstate (Flask 버전, 독립 동작 유지)
"""
import json
import sys
import threading
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Body
from fastapi.concurrency import run_in_threadpool

# fetcher/cycle/region_analysis는 평면(flat) import를 쓰는 독립 모듈이라
# 패키지로 옮기지 않고 경로만 추가한다 (CLI 사용법도 그대로 유지됨).
RE_DIR = Path(__file__).resolve().parents[2] / "realestate"
if str(RE_DIR) not in sys.path:
    sys.path.insert(0, str(RE_DIR))

import auto_bands  # noqa: E402
import cycle as cycle_model  # noqa: E402
import fetcher  # noqa: E402
import listing_history  # noqa: E402
import listings  # noqa: E402
import profiles  # noqa: E402
import region_analysis  # noqa: E402
import wave_engine as wave_model  # noqa: E402

router = APIRouter(prefix="/api/realestate", tags=["RealEstate"])

# 갱신 동시 실행 방지 (페이지 자동 갱신과 버튼 클릭이 겹칠 때)
_refresh_lock = threading.Lock()

# 파도 판정은 3개 구 전체 스캔이라 10분 캐시 (갱신 후에는 _refresh가 비움)
_wave_cache: dict = {"at": 0.0, "data": None}
_WAVE_TTL = 10 * 60

# 새 구(지역) 실거래 백필 — 백그라운드 스레드, 상태는 /backfill-status 폴링
_backfill: dict = {"running": False, "lawdCd": None, "done": 0, "total": 0, "error": ""}


def _run_backfill(lawd_cd: str):
    cfg = fetcher.load_config()
    months = fetcher.month_range(cfg.get("start_ym", "200601"), fetcher.current_ym())
    _backfill.update(running=True, lawdCd=lawd_cd, done=0, total=len(months), error="")
    try:
        fetcher.sync_months(
            months, lambda d, t, ym, c: _backfill.update(done=d, total=t), lawd_cd)
        # 수집 완료 후 단지명 ↔ 국토부 apt_nm 매칭 키워드 재해석
        prof = profiles.get_active()
        if prof["lawdCd"] == lawd_cd:
            prof["aptKeyword"] = profiles.resolve_keyword(prof["name"], lawd_cd)
            profiles.set_active(prof)
    except Exception as e:  # noqa: BLE001
        _backfill["error"] = str(e)
    finally:
        _backfill["running"] = False


# 가용자금은 전용 파일 — UI 편집(PUT /funds)과 손 편집 모두 지원, 요청마다 재읽음
FUNDS_PATH = RE_DIR / "funds.json"


def _load_funds():
    try:
        return json.loads(FUNDS_PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - 파일 없음/손상: 구버전 config.json 폴백
        return fetcher.load_config().get("funds")


def _save_funds(data: dict):
    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("items 배열이 비어 있습니다")
    clean = []
    for it in items:
        name = str(it.get("name", "")).strip()
        if not name:
            raise ValueError("항목명이 비어 있는 행이 있습니다")
        try:
            # 음수 허용 — 성공보수·양도세는 가용자금에서 빠지는 항목으로 음수로 적는다
            amount = round(float(it.get("amount", 0)), 4)
        except (TypeError, ValueError):
            raise ValueError(f"'{name}'의 금액이 숫자가 아닙니다")
        row = {"name": name, "amount": amount,
               "when": str(it.get("when", "")).strip()}
        for k in ("rate", "term_years"):
            v = it.get(k)
            if v not in (None, ""):
                try:
                    v = float(v)
                except (TypeError, ValueError):
                    raise ValueError(f"'{name}'의 {k}가 숫자가 아닙니다")
                if v > 0:
                    row[k] = v
        for k in ("link", "note", "owner", "stage"):
            if it.get(k):
                row[k] = str(it[k])
        # 불리언 플래그 — flex(끝자리 쪼개기 허용) / off(합계·대금구조에서 제외)
        for k in ("flex", "off"):
            if it.get(k):
                row[k] = True
        clean.append(row)
    # 경고 문구는 UI 편집 대상이 아니므로 기존 값을 보존한다
    warnings = data.get("warnings")
    if warnings is None:
        warnings = (_load_funds() or {}).get("warnings", [])
    out = {"as_of": date.today().isoformat(),
           "costs_note": data.get("costs_note", ""),
           "warnings": warnings, "items": clean}
    FUNDS_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
    return out


def _safe_auto_bands(prof):
    try:
        return auto_bands.build(prof.get("aptKeyword", ""), prof.get("lawdCd", ""))
    except Exception:  # noqa: BLE001 - 밴드는 부가 정보, 실패해도 대시보드는 뜬다
        return None


def _config():
    cfg = fetcher.load_config()
    prof = profiles.get_active()
    is_olhwe = str(prof["complexNo"]) == "610"
    return {
        "hasKey": bool(fetcher.get_service_key(cfg)),
        "aptKeyword": prof.get("aptKeyword", ""),
        "regionName": prof.get("regionName", ""),
        "areaLabels": cfg.get("area_labels", {}) if is_olhwe else {},
        "events": cfg.get("events", []),
        "macro": cfg.get("macro"),
        # 매수밴드: 올훼 = 수기(실전 자산) · 그 외 단지 = 실거래 분포로 자동 생성
        "buyBands": cfg.get("buy_bands") if is_olhwe
                    else _safe_auto_bands(prof),
        "funds": _load_funds(),
        "complex": prof,
        "backfill": dict(_backfill),
    }


def _deals():
    prof = profiles.get_active()
    clause, params = profiles.name_clause(prof.get("aptKeyword", ""))
    conn = fetcher.get_conn()
    try:
        rows = conn.execute(
            f"""SELECT deal_date, deal_ymd, apt_nm, exclu_ar, amount, floor,
                       apt_dong, dealing_gbn, cdeal_type, cdeal_day, rgst_date, umd_nm
                FROM deals WHERE sgg = ? AND {clause}
                ORDER BY deal_date""",
            (prof["lawdCd"], *params),
        ).fetchall()
        log = conn.execute(
            "SELECT MAX(fetched_at), COUNT(*) FROM fetch_log WHERE sgg = ?",
            (prof["lawdCd"],),
        ).fetchone()
    finally:
        conn.close()
    deals = [
        {
            "date": r[0], "ym": r[1], "apt": r[2], "ar": r[3], "amt": r[4],
            "fl": r[5], "dong": r[6], "gbn": r[7], "cdeal": r[8],
            "cdealDay": r[9], "rgst": r[10], "umd": r[11],
        }
        for r in rows
    ]
    return {"deals": deals, "lastFetched": log[0], "fetchedMonths": log[1]}


def _cycle():
    prof = profiles.get_active()
    return {"ok": True, "rows": cycle_model.compute_phases(prof.get("aptKeyword", ""))}


def _wave():
    """파도 판정 — 기준은 강남3구(서초·강남·송파) 통합 지수, 구별 현재 국면 병기."""
    import time
    now = time.time()
    if _wave_cache["data"] and now - _wave_cache["at"] < _WAVE_TTL:
        return _wave_cache["data"]
    primary_rows = wave_model.compute_waves(wave_model.GN3)
    for r in primary_rows:
        r["pos"] = wave_model.phase_position(r)
    latest = primary_rows[-1]["ym"] if primary_rows else ""
    regions = []
    for sgg, name in wave_model.REGIONS.items():
        try:
            rows = wave_model.compute_waves(sgg)
        except Exception:  # noqa: BLE001 - 수집이 덜 된 구는 건너뜀
            continue
        # 수집이 진행 중인 구(이력이 기준 지수보다 2개월 이상 짧음)는 제외
        ymi = lambda ym: int(ym[:4]) * 12 + int(ym[4:])  # noqa: E731
        if not rows or (latest and ymi(latest) - ymi(rows[-1]["ym"]) > 2):
            continue
        last = rows[-1]
        regions.append({
            "sgg": sgg, "name": name, "ym": last["ym"],
            "phase": last["phase"], "sub": last["sub"],
            "pending": last["pending"], "dd": last["dd"],
            "mom12": last["mom12"], "vol_ratio": last["vol_ratio"],
            "provisional": last["provisional"],
        })
    data = {"ok": True, "primary": wave_model.GN3,
            "primaryName": wave_model.GN3_NAME,
            "rows": primary_rows, "regions": regions}
    _wave_cache.update(at=now, data=data)
    return data


def _region():
    out = []
    for sgg, name in region_analysis.REGIONS.items():
        months, idx, _ = region_analysis.build_index(sgg)
        base = months[-2]  # 최근월은 신고 미완이라 한 달 전 기준
        y = region_analysis.yoy(idx, months, base)
        peak = max((ym for ym in months if idx[ym]), key=lambda m: idx[m])
        out.append({"sgg": sgg, "name": name, "asof": base, "peak": peak,
                    "yoy": round(y, 1) if y is not None else None})
    return {"ok": True, "regions": out}


def _refresh():
    """3개 구 재수집. 기본 최근 6개월, 오래 꺼져 있었다면 빠진 달까지 전부 채운다."""
    cfg = fetcher.load_config()
    regions = list(dict.fromkeys(
        [cfg["lawd_cd"], *cfg.get("compare_regions", {}),
         profiles.get_active()["lawdCd"]]))
    all_months = fetcher.month_range(cfg["start_ym"], fetcher.current_ym())
    conn = fetcher.get_conn()
    need = 6
    for lawd in regions:
        last = conn.execute(
            "SELECT MAX(deal_ymd) FROM fetch_log WHERE sgg = ?", (lawd,)
        ).fetchone()[0]
        if last:
            gap = sum(1 for m in all_months if m > last)
            need = max(need, gap + 6)  # 빠진 달 + 재신고 여유 6개월
    conn.close()
    months = all_months[-need:]
    for lawd in regions:
        fetcher.sync_months(months, lawd_cd=lawd)
    _wave_cache["at"] = 0.0  # 새 데이터로 파도 재계산
    return {"ok": True, "months": len(months)}


@router.get("/config")
async def get_config():
    return await run_in_threadpool(_config)


@router.get("/deals")
async def get_deals():
    return await run_in_threadpool(_deals)


@router.get("/cycle")
async def get_cycle():
    try:
        return await run_in_threadpool(_cycle)
    except Exception as e:  # noqa: BLE001 - 프론트에 그대로 노출
        return {"ok": False, "msg": str(e), "rows": []}


def _local_search(q: str):
    """이미 수집된 구(deals.db)에서 단지 검색 — 네이버 없이도 즉시 전환 가능.
    네이버 단지번호가 없으므로 합성 음수 번호를 부여하고 매물 기능은 비활성."""
    import zlib
    kw = q.replace(" ", "")
    conn = fetcher.get_conn()
    try:
        rows = conn.execute(
            """SELECT apt_nm, sgg, MAX(umd_nm), COUNT(*) FROM deals
               WHERE REPLACE(apt_nm, ' ', '') LIKE ?
               GROUP BY apt_nm, sgg ORDER BY 4 DESC LIMIT 12""",
            (f"%{kw}%",)).fetchall()
    finally:
        conn.close()
    gu = {"11650": "서초구", "11680": "강남구", "11710": "송파구", "11350": "노원구"}
    return [{
        "complexNo": -(zlib.crc32(f"{r[0]}|{r[1]}".encode()) % 1_000_000 + 1),
        "name": r[0], "lawdCd": r[1],
        "address": f"서울 {gu.get(r[1], r[1])} {r[2] or ''}".strip(),
        "households": 0,
        "type": f"실거래 {r[3]:,}건 · 매물 기능 없음",
    } for r in rows]


@router.get("/complexes")
async def list_complexes():
    """등록된 관심 단지 목록 + 활성 단지 (상단 카드용)."""
    data = await run_in_threadpool(profiles.load)
    return {"ok": True, "active": data["active"],
            "complexes": list(data["complexes"].values())}


@router.get("/search")
async def search_complex(q: str, mode: str = "full"):
    """아파트명 단지 검색.
    mode=local: 수집된 지역 DB만 (자동완성용 — 빠르고 호출 제한 없음)
    mode=full : 네이버(new.land) 우선, 호출 제한 시 로컬 폴백"""
    if mode == "local":
        return {"ok": True, "results": await run_in_threadpool(_local_search, q)}
    try:
        results = await run_in_threadpool(listings.search_complexes, q)
        return {"ok": True, "results": results}
    except Exception as e:  # noqa: BLE001 - 레이트리밋 등 → 수집된 지역 내 검색
        local = await run_in_threadpool(_local_search, q)
        return {"ok": True, "results": local,
                "msg": f"네이버 검색 불가({e}) — 수집된 지역(서초·강남·송파·노원) 결과"}


@router.post("/complex")
async def set_complex(payload: dict = Body(...)):
    """단지 전환 — 프로필 저장 + 해당 구 실거래가 없으면 전체 백필 시작."""
    try:
        no = int(payload["complexNo"])
        name = str(payload.get("name", "")).strip()
        lawd = str(payload.get("lawdCd", "")).strip()[:5]
        if not (name and len(lawd) == 5):
            return {"ok": False, "msg": "단지명과 지역코드가 필요합니다"}

        def work():
            conn = fetcher.get_conn()
            try:
                n = conn.execute("SELECT COUNT(*) FROM fetch_log WHERE sgg = ?",
                                 (lawd,)).fetchone()[0]
            finally:
                conn.close()
            # 임시번호(로컬 검색 전환)면 네이버 단지번호를 한 번 더 찾아본다 —
            # 검색 차단 때문에 임시로 등록됐을 수 있고, 번호가 붙어야 매물이 수집된다
            real_no = no
            if no <= 0:
                try:
                    for c in listings.search_complexes(name):
                        if c["lawdCd"] == lawd and c["name"].replace(" ", "") == name.replace(" ", ""):
                            real_no = int(c["complexNo"])
                            break
                except Exception:  # noqa: BLE001 - 여전히 차단: 임시번호 유지
                    pass

            # 이미 등록된 단지는 저장된 키워드를 보존 (수동 보정이 덮이지 않게)
            registered = profiles.load()["complexes"]
            saved = registered.get(str(real_no)) or registered.get(str(no))
            if saved and saved.get("aptKeyword"):
                kw = saved["aptKeyword"]
            else:
                kw = profiles.resolve_keyword(name, lawd) if n else name
            prof = profiles.set_active({
                "complexNo": real_no, "name": name, "aptKeyword": kw,
                "lawdCd": lawd, "regionName": str(payload.get("address", ""))})
            if n == 0 and not _backfill["running"]:
                threading.Thread(target=_run_backfill, args=(lawd,), daemon=True).start()
            return {"ok": True, "complex": prof,
                    "backfill": n == 0 or _backfill["running"]}
        return await run_in_threadpool(work)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e)}


def _complex_no_from_map(raw: str):
    """네이버 지도 URL의 layer 파라미터에서 단지번호를 꺼낸다.

    단지를 클릭해도 주소는 /map?... 인 채로 남고, 선택된 단지는 layer에
    lz-string(compressToEncodedURIComponent)으로 압축된 JSON으로 들어간다:
        [{"id":"complex_detail","params":{"complexId":154}, ...}]
    사용자가 주소창을 그대로 복사해 붙여도 연결되도록 여기서 풀어준다.
    """
    import re
    m = re.search(r"[?&]layer=([^&]+)", raw)
    if not m:
        return None
    try:
        import lzstring
        decoded = lzstring.LZString().decompressFromEncodedURIComponent(m.group(1))
    except Exception:  # noqa: BLE001 - 라이브러리 없음·포맷 변경 → 수동 입력으로 폴백
        return None
    if not decoded:
        return None
    hit = re.search(r'"complexId"\s*:\s*(\d+)', decoded)
    return int(hit.group(1)) if hit else None


@router.post("/complex/link")
async def link_complex(payload: dict = Body(...)):
    """활성 단지에 네이버 단지번호를 수동 연결 — 검색이 차단돼도 매물을 켤 수 있다.
    입력: {"value": "111515"} 또는 네이버 단지 URL(.../complexes/111515?...)."""
    import re
    raw = str(payload.get("value", "")).strip()
    m = (re.search(r"complexes?/(\d+)", raw)          # fin/new.land 단지 상세
         or re.search(r"[?&]complexNo=(\d+)", raw)    # 지도에서 단지 선택 시 쿼리
         or re.fullmatch(r"(\d{2,9})", raw))          # 번호만 입력
    new_no = int(m.group(1)) if m else _complex_no_from_map(raw)
    if not new_no:
        return {"ok": False,
                "msg": "단지번호를 찾을 수 없습니다 — 네이버 단지 URL이나 지도 URL, 또는 번호를 넣으세요"}

    def work():
        data = profiles.load()
        cur = data["complexes"][data["active"]]
        old_key = str(cur["complexNo"])
        prof = {**cur, "complexNo": new_no}
        if old_key != str(new_no):
            data["complexes"].pop(old_key, None)   # 임시번호 프로필 정리
            data["complexes"][str(new_no)] = prof
            data["active"] = str(new_no)
            profiles.save(data)
        # 연결 즉시 매물 수집 (캐시 비어 있으므로 바로 네이버 호출)
        stats = listings.get_listing_stats(force=True, complex_no=new_no)
        return {"ok": True, "complex": prof, "total": stats.get("total", 0)}

    try:
        return await run_in_threadpool(work)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": f"연결했지만 매물 수집 실패: {e}"}


@router.get("/backfill-status")
async def backfill_status():
    """새 지역 실거래 백필 진행 상태."""
    return dict(_backfill)


@router.put("/funds")
async def put_funds(payload: dict = Body(...)):
    """가용자금 저장 — funds.json에 기록, 응답으로 저장본 반환 (UI 즉시 반영용)."""
    try:
        saved = await run_in_threadpool(_save_funds, payload)
        return {"ok": True, "funds": saved}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e)}


@router.get("/wave")
async def get_wave():
    """구 단위 파도(상승·하락 사이클) 판정 — wave_engine.py, 10분 캐시."""
    try:
        return await run_in_threadpool(_wave)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e), "rows": [], "regions": []}


@router.get("/region")
async def get_region():
    try:
        return await run_in_threadpool(_region)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e), "regions": []}


@router.get("/listings")
async def get_listings(force: bool = False):
    """네이버부동산(fin.land) 현재 매물 호가 — 평형별 최저/중앙 호가.
    24시간 캐시 (IP 평판 보호 — 수집은 하루 1회), ?force=1이면 즉시 재수집 (갱신 버튼)."""
    try:
        return await run_in_threadpool(listings.get_listing_stats, force)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e)}


@router.get("/history")
async def get_history():
    """매물 히스토리 — 매물별 등장/가격변동/소멸/거래추정 이벤트와 관심 표시."""
    try:
        return await run_in_threadpool(listing_history.get_history)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e), "listings": {}}


@router.post("/fav/{article_no}")
async def toggle_fav(article_no: str):
    """관심 매물 토글."""
    try:
        return await run_in_threadpool(listing_history.toggle_fav, article_no)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e)}


@router.get("/agent/{article_no}")
async def get_agent(article_no: str):
    """매물의 중개사무소 정보 (상호·대표·전화·주소) — 클릭 시 온디맨드 1건 조회."""
    try:
        return await run_in_threadpool(listings.get_agent, article_no)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e)}


@router.post("/refresh")
async def post_refresh():
    if not _refresh_lock.acquire(blocking=False):
        return {"ok": False, "msg": "이미 갱신이 진행 중입니다."}
    try:
        return await run_in_threadpool(_refresh)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "msg": str(e)}
    finally:
        _refresh_lock.release()
