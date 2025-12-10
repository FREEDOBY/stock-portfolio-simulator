"""Vercel Serverless Function 진입점"""
from app.main import app

# Vercel이 인식하는 handler
handler = app
