# 배포 가이드 — 프론트(Vercel) + 백엔드(Render), 둘 다 무료

이 프로젝트는 **프론트엔드는 Vercel**, **백엔드(FastAPI)는 Render** 로 분리 배포한다.
Render 무료 플랜은 함수 실행 시간 제한이 없어 `yfinance`/`pykrx` 백테스트가 타임아웃 없이 동작한다.

## 아키텍처

```
사용자 → Vercel (프론트 정적 파일)
          │  axios baseURL = VITE_API_URL = https://<render>.onrender.com/api
          ▼
        Render (FastAPI: /api/etf, /api/backtest, /api/macro)
```

---

## 1단계. 백엔드 배포 (Render)

1. https://render.com 가입 (GitHub 계정 연동)
2. **New → Blueprint** 선택 → 이 레포(`FREEDOBY/stock-portfolio-simulator`) 연결
   - 저장소 루트의 `render.yaml`을 자동으로 읽어 설정됨
   - (Blueprint 대신 수동으로 할 경우 New → Web Service:
     - Runtime: Python, Plan: Free
     - Build: `pip install -r requirements.txt`
     - Start: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`)
3. 배포 완료 후 백엔드 주소 확인 (예: `https://stock-portfolio-simulator-api.onrender.com`)
4. 브라우저로 `.../health` 접속 → `{"status":"healthy"}` 나오면 성공

> 참고: 무료 플랜은 15분 미사용 시 잠들며, 다음 첫 요청에 ~50초 콜드스타트가 있다.

## 2단계. 프론트엔드 배포 (Vercel)

1. https://vercel.com → 프로젝트(이미 연결돼 있음) → **Settings → Environment Variables**
2. 환경변수 추가:
   - `VITE_API_URL` = `https://<render 백엔드 주소>/api`
     (반드시 끝에 `/api` 포함 — 백엔드 라우터 prefix가 `/api`)
3. **Settings → Deployment Protection** → Vercel Authentication **Off** (전체 공개용)
4. **Deployments → Redeploy** (환경변수 반영을 위해 재배포)

## 3단계. 백엔드에 프론트 주소 등록 (CORS)

1. Render → 해당 서비스 → **Environment** 탭
2. `FRONTEND_URL` = Vercel 프로덕션 주소 (예: `https://stock-portfolio-simulator.vercel.app`)
3. 저장하면 자동 재배포됨

> `*.vercel.app` 프리뷰 도메인은 `main.py`의 `allow_origin_regex`로 이미 허용되어 있다.

---

## 로컬 개발

```bash
# 백엔드 (터미널 1)
uvicorn backend.app.main:app --reload --port 8000

# 프론트 (터미널 2)
cd frontend && npm run dev
```

로컬에서는 `VITE_API_URL`을 비워두면 `/api` 요청이 `vite.config.ts`의 프록시를 통해
`localhost:8000`으로 전달된다 (`.env.example` 참고).
