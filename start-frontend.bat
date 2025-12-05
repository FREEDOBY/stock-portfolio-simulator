@echo off
echo ============================================
echo   Stopping existing frontend processes...
echo ============================================

:: 포트 5173 사용하는 프로세스 강제 종료
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo.
echo ============================================
echo   Starting Frontend Server...
echo   URL: http://localhost:5173
echo ============================================
echo.

cd /d "%~dp0frontend"
npm run dev
