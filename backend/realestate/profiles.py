"""단지 프로필 관리 — 대시보드가 추적하는 아파트 단지의 전환/저장.

profiles.json 구조:
  { "active": "610",
    "complexes": { "610": { "complexNo": 610, "name": "올림픽훼밀리타운",
                             "aptKeyword": "올림픽훼밀리", "lawdCd": "11710",
                             "regionName": "서울 송파구" }, ... } }

파일이 없으면 config.json의 올훼 설정으로 시드한다. 가용자금(funds.json)·매수밴드
(config.json, 올훼 전용 수기)는 프로필과 무관하게 유지 — 밴드는 올훼에서만 표시된다.
"""

import json
from pathlib import Path

import fetcher

PATH = Path(__file__).resolve().parent / "profiles.json"


def _seed():
    cfg = fetcher.load_config()
    no = str(cfg.get("naver_complex_no", 610))
    return {
        "active": no,
        "complexes": {
            no: {
                "complexNo": int(no),
                "name": "올림픽훼밀리타운",
                "aptKeyword": cfg.get("apt_keyword", "올림픽훼밀리"),
                "lawdCd": cfg.get("lawd_cd", "11710"),
                "regionName": cfg.get("region_name", "서울 송파구"),
            }
        },
    }


def load():
    try:
        return json.loads(PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - 최초 실행: 올훼로 시드
        data = _seed()
        save(data)
        return data


def save(data):
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def get_active():
    """활성 단지 프로필. active가 가리키는 프로필이 사라졌으면 첫 단지로 되돌린다
    (프로필을 직접 편집·삭제했을 때 대시보드 전체가 죽지 않도록)."""
    data = load()
    prof = data["complexes"].get(data.get("active", ""))
    if prof is None:
        if not data["complexes"]:
            data = _seed()
        data["active"] = next(iter(data["complexes"]))
        save(data)
        prof = data["complexes"][data["active"]]
    return prof


def set_active(profile: dict):
    """프로필 추가/갱신 + 활성 전환. profile은 _seed와 같은 키 구성."""
    data = load()
    no = str(profile["complexNo"])
    data["complexes"][no] = profile
    data["active"] = no
    save(data)
    return profile


def resolve_keyword(name: str, lawd_cd: str) -> str:
    """네이버 단지명 → 국토부 apt_nm 매칭 키워드.

    표기가 달라서(괄호·공백·차수·마을명) 접두사를 줄여가며 거래가 잡히는 키워드를
    찾되, 그 키워드로 여러 단지가 걸리면(예: '상록' → 상록마을 우성/임광/라이프)
    후보 중 네이버 이름과 글자가 가장 많이 겹치는 단지명을 키워드로 쓴다."""
    conn = fetcher.get_conn()
    try:
        base = name.replace(" ", "")
        for end in range(len(base), 1, -1):
            kw = base[:end]
            rows = conn.execute(
                """SELECT REPLACE(apt_nm,' ',''), COUNT(*) FROM deals
                   WHERE sgg = ? AND REPLACE(apt_nm,' ','') LIKE ?
                   GROUP BY 1 ORDER BY 2 DESC""",
                (lawd_cd, f"%{kw}%")).fetchall()
            if not rows:
                continue
            if len(rows) == 1:
                return kw
            # 여러 단지가 걸림 → 네이버 이름과 겹치는 글자가 가장 많은 단지로 좁힌다
            chars = set(base)
            best = max(rows, key=lambda r: (len(chars & set(r[0])), r[1]))
            return best[0]
        return base
    finally:
        conn.close()
