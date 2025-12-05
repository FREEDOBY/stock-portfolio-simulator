@echo off
echo ============================================
echo   Stopping existing backend processes...
echo ============================================

:: 포트 8000 사용하는 프로세스 강제 종료
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo.
echo ============================================
echo   Starting Backend Server...
echo   URL: http://localhost:8000
echo ============================================
echo.

cd /d "%~dp0backend"
pip install -r requirements.txt -q
uvicorn app.main:app --reload --port 8000
pause
