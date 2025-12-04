@echo off
echo Starting Backend Server...
cd /d "%~dp0backend"
pip install -r requirements.txt
uvicorn app.main:app --reload
pause
