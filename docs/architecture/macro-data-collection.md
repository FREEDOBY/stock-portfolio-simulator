# 아키텍처 설계: Macro Data Collection

## 메타데이터
- 작성일: 2026-03-21
- 상태: Draft

## 1. 설계 개요
- 접근법: Pragmatic
- FRED REST API를 httpx로 직접 호출 (fredapi 라이브러리 불필요)
- 기존 data_fetcher.py 패턴을 따름 (싱글톤, 캐싱)

## 2. 파일 구조

### 생성할 파일
- `backend/app/services/fred_service.py` - FRED API 클라이언트 + 캐싱
- `backend/app/services/macro_data_fetcher.py` - 매크로 데이터 통합 수집
- `backend/app/models/macro_schemas.py` - Pydantic 스키마

### 수정할 파일
- `requirements.txt` - httpx 이미 있으므로 변경 없음

## 3. 컴포넌트 설계

### FREDService
```python
class FREDService:
    FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

    def __init__(self):
        self._api_key: str  # from env
        self._cache: dict[str, CachedData]
        self._http_client: httpx.Client

    def get_series(self, series_id: str, months_back: int) -> pd.DataFrame
    def get_multiple_series(self, series_configs: list[dict]) -> dict[str, pd.DataFrame]
```

### MacroDataFetcher
```python
class MacroDataFetcher:
    def __init__(self):
        self.fred: FREDService
        # yfinance 직접 사용 (기존 패턴)

    def fetch_all(self) -> MacroRawData
    def fetch_category(self, category: str) -> dict
    def fetch_nasdaq_weekly(self) -> pd.DataFrame
    def fetch_vix(self) -> pd.DataFrame
    def fetch_dxy(self) -> pd.DataFrame
```

### 캐싱 전략
```python
@dataclass
class CachedData:
    data: pd.DataFrame
    fetched_at: float  # timestamp
    ttl: int           # seconds
    is_stale: bool     # TTL 초과 여부
```

## 4. 데이터 흐름
```
FREDService.get_series(series_id, months_back)
  → 캐시 확인 (TTL 내이면 캐시 반환)
  → FRED REST API 호출
  → JSON → pd.DataFrame 변환
  → 캐시 저장
  → 반환

MacroDataFetcher.fetch_all()
  → FREDService.get_multiple_series(18개)
  → yfinance ^IXIC, ^VIX, DX-Y.NYB
  → MacroRawData 조합
```

## 5. FRED API 호출 형식
```
GET https://api.stlouisfed.org/fred/series/observations
  ?series_id=NAPM
  &api_key={key}
  &file_type=json
  &observation_start=2024-01-01
  &observation_end=2026-03-21
```
