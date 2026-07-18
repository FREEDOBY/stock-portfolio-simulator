# 배포 가이드 — 프론트(Vercel) + 백엔드(Render), 둘 다 무료

이 프로젝트는 **프론트엔드는 Vercel**, **백엔드(FastAPI)는 Render** 로 분리 배포한다.
Render 무료 플랜은 함수 실행 시간 제한이 없어 `yfinance`/`pykrx` 백테스트가 타임아웃 없이 동작한다.

## 실제 배포 주소

| 구분 | URL |
|------|-----|
| 프론트엔드 (Vercel) | https://stock-portfolio-simulator-six.vercel.app |
| 백엔드 (Render) | https://stock-portfolio-simulator-api.onrender.com |
| 백엔드 API 문서 | https://stock-portfolio-simulator-api.onrender.com/docs |

## 아키텍처

```
사용자 → Vercel (frontend/ 를 Vite로 빌드한 정적 파일)
          │  axios baseURL = VITE_API_URL = https://<render>.onrender.com/api
          ▼
        Render (FastAPI: /api/etf, /api/backtest, /api/macro)
```

- 프론트 API 클라이언트: `frontend/src/api/*.ts` (`VITE_API_URL || '/api'`)
- 백엔드 라우터 prefix: `/api/etf`, `/api/backtest`, `/api/macro`
- CORS: `backend/app/main.py`의 `allow_origin_regex`가 `*.vercel.app`를 허용

---

## 1단계. 백엔드 배포 (Render)

1. https://render.com 가입 — **GitHub 로그인 권장** (구글로 가입하면 GitHub 연결을 따로 해줘야 함:
   Account Settings → Git Deployment Credentials → Add credential → GitHub → `FREEDOBY`로 Authorize)
2. **New → Blueprint** → 레포(`FREEDOBY/stock-portfolio-simulator`) 선택 → 루트 `render.yaml` 자동 인식
3. **환경변수 설정** (Render → 서비스 → Environment 탭):
   | Key | Value | 설명 |
   |-----|-------|------|
   | `FRED_API_KEY` | (로컬 `.env`의 값 복사) | **필수** — 없으면 경제(FRED) 데이터가 "데이터 부족"으로 나옴 |
   | `FRONTEND_URL` | `https://stock-portfolio-simulator-six.vercel.app` | CORS용 (regex로도 커버되지만 명시 권장) |
   | `PYTHON_VERSION` | `3.12.8` | `render.yaml`에 이미 지정됨 |
4. 배포 완료 후 `.../health` 접속 → `{"status":"healthy"}` 나오면 성공

> ⚠️ `.env`는 `.gitignore`에 걸려 git/클라우드로 안 올라간다. `FRED_API_KEY`는 반드시 Render 대시보드에 **직접** 넣어야 한다.
> ⚠️ 무료 플랜은 15분 미사용 시 잠들며, 다음 첫 요청에 ~50초 콜드스타트가 있다.

## 2단계. 프론트엔드 배포 (Vercel)

**핵심: Vercel이 루트 `requirements.txt`를 보고 프로젝트를 Python으로 오인식하므로, Root Directory를 `frontend`로 지정해 프론트만 보게 해야 한다.**

1. Vercel 프로젝트 → **Settings → Build and Deployment**:
   | 항목 | 값 |
   |------|-----|
   | **Framework Preset** | `Vite` |
   | **Root Directory** | `frontend` |
   | **Build / Output / Install Command** | 오버라이드 **전부 OFF** (Vite 기본값 사용) |
2. **Settings → Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://stock-portfolio-simulator-api.onrender.com/api` (끝에 `/api` 필수) |
   > `VITE_API_URL`은 **빌드 시점에 코드에 박히므로**, 값 변경 후 반드시 재배포해야 반영된다.
3. **Settings → Deployment Protection** → Vercel Authentication **Off** (전체 공개용)
4. **Deployments → ⋯ → Redeploy** (Build Cache 체크 해제 권장)

- SPA 라우팅 설정은 `frontend/vercel.json`에 있다 (모든 경로 → `/index.html`).
- Git 연동돼 있어 `main`에 push하면 자동 재배포된다.

---

## 로컬 개발

```bash
# 백엔드 (터미널 1) — repo 루트에서
uvicorn backend.app.main:app --reload --port 8000

# 프론트 (터미널 2)
cd frontend && npm run dev
```

- `.env`에 `FRED_API_KEY`가 있어야 경제 데이터가 나온다 (`.env.example` 참고).
- `VITE_API_URL`을 비워두면 `/api` 요청이 `vite.config.ts`의 프록시로 `localhost:8000`에 전달된다.

## 테스트

```bash
# 백엔드
python -m pytest backend/tests -q          # 213 passed

# 프론트
cd frontend && npm run test:run            # 82 passed
```

---

## 트러블슈팅 (실제 겪은 이슈)

| 증상 | 원인 | 해결 |
|------|------|------|
| Render `ModuleNotFoundError: httpx` | 루트 `requirements.txt`에 httpx 누락 | httpx 추가 (해결됨) |
| Vercel에서 백엔드 JSON이 뜸 | `api/index.py`가 Python 함수로 자동 배포됨 | `api/` 폴더 제거 (해결됨) |
| Vercel `No FastAPI entrypoint found` | 프로젝트를 Python으로 오인식 | Framework=`Vite` + Root Directory=`frontend` |
| Vercel `cd frontend ... exited with 1` | Root=frontend인데 빌드 명령에 `cd frontend` 중복 | Build Command 오버라이드 OFF |
| 프론트 "no data available" | Render에 `FRED_API_KEY` 미설정 | Render Environment에 키 추가 |
