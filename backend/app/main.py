"""FastAPI 메인 애플리케이션"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import etf, backtest
from .services.korean_stock_service import korean_stock_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 생명주기 관리"""
    # 시작 시: 한국 주식 캐시 백그라운드 로드
    asyncio.create_task(asyncio.to_thread(korean_stock_service._load_all_tickers))
    yield
    # 종료 시: 정리 작업 (필요 시)

app = FastAPI(
    title="주식 포트폴리오 시뮬레이터 API",
    description="ETF 포트폴리오 백테스트 시뮬레이터",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite 개발 서버
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
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
