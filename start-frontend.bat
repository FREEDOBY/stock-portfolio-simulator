@echo off
echo Starting Frontend Server...
cd /d "%~dp0frontend"
npm install
npm run dev
pause
