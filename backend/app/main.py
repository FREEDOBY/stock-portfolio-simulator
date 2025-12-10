"""FastAPI 메인 애플리케이션"""
import os
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import etf, backtest

# Vercel 서버리스 환경 체크
IS_VERCEL = os.getenv("VERCEL") is not None

if not IS_VERCEL:
    from .services.korean_stock_service import korean_stock_service

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """앱 생명주기 관리 (로컬 전용)"""
        asyncio.create_task(asyncio.to_thread(korean_stock_service._load_all_tickers))
        yield

    app = FastAPI(
        title="주식 포트폴리오 시뮬레이터 API",
        description="ETF 포트폴리오 백테스트 시뮬레이터",
        version="1.0.0",
        lifespan=lifespan
    )
else:
    app = FastAPI(
        title="주식 포트폴리오 시뮬레이터 API",
        description="ETF 포트폴리오 백테스트 시뮬레이터",
        version="1.0.0"
    )

# CORS 설정
allow_origins = [
    "http://localhost:5173",  # Vite 개발 서버
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

# Vercel 배포 URL 자동 추가
vercel_url = os.getenv("VERCEL_URL")
if vercel_url:
    allow_origins.append(f"https://{vercel_url}")

# 커스텀 프론트엔드 URL 추가
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allow_origins.append(frontend_url)

# 프로덕션 환경에서는 모든 origin 허용 (Vercel 서버리스 동일 도메인)
if os.getenv("VERCEL"):
    allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(etf.router)
app.include_router(backtest.router)


@app.get("/")
async def root():
    """API 루트"""
    return {
        "message": "Portfolio Backtester API",
        "docs": "/docs",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {"status": "healthy"}
