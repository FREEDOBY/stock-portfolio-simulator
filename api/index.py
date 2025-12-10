"""Vercel Serverless Function 진입점"""
from mangum import Mangum
from app.main import app

# Mangum: ASGI -> AWS Lambda/Vercel 어댑터
handler = Mangum(app, lifespan="off")
