"""Vercel Serverless Function 진입점"""
import sys
from pathlib import Path

# backend 디렉토리를 Python 경로에 추가
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.main import app

# Vercel이 인식하는 handler
handler = app
