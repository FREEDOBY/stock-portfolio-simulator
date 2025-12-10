"""Vercel Serverless Function 진입점"""
import sys
import os

# api/ 폴더를 Python 경로에 추가 (Vercel에서 /var/task/api/)
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from app.main import app
