@echo off
chcp 65001 >nul
setlocal
title Ascenda Dev Launcher
cd /d "%~dp0"

echo ============================================
echo   Ascenda 개발 서버 재시작
echo   backend  http://localhost:8000
echo   frontend http://localhost:5173
echo ============================================
echo.

rem ── 1) 기존 프로세스 정리 ────────────────────────────────
rem netstat+findstr 대신 Get-NetTCPConnection 사용 — ":8000"이 ":58000"이나
rem PID 숫자에 잘못 걸려 엉뚱한 프로세스를 죽이는 사고를 막는다.
echo [1/4] 기존 프로세스 정리 (8000, 5173)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "foreach ($p in 8000,5173) { $ids = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($ids) { foreach ($id in $ids) { try { $n = (Get-Process -Id $id -ErrorAction Stop).ProcessName; Stop-Process -Id $id -Force -ErrorAction Stop; Write-Host ('      포트 ' + $p + ' 종료: ' + $n + ' (PID ' + $id + ')') } catch {} } } else { Write-Host ('      포트 ' + $p + ' 사용 중인 프로세스 없음') } }"

rem ── 2) 의존성 설치 (옵션) ────────────────────────────────
rem 매번 돌리면 기동이 느려서 기본은 건너뛴다.  install 인자를 주면 설치.
if /i "%~1"=="install" (
    echo [2/4] 의존성 설치 중...
    pushd "%~dp0backend" && pip install -r requirements.txt -q & popd
    pushd "%~dp0frontend" && call npm install & popd
) else (
    echo [2/4] 의존성 설치 건너뜀  ^(설치하려면: start-agent.bat install^)
)

rem ── 3) 서버 기동 (각각 별도 창 — 로그 확인 + 한쪽이 죽어도 다른 쪽 유지) ──
echo [3/4] 서버 기동
start "Ascenda Backend"  /D "%~dp0backend"  cmd /k python -m uvicorn app.main:app --reload --port 8000
start "Ascenda Frontend" /D "%~dp0frontend" cmd /k npm run dev

rem ── 4) 기동 확인 후 브라우저 열기 ───────────────────────
echo [4/4] 기동 대기...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$end = (Get-Date).AddSeconds(60); $b = $false; $f = $false; while ((Get-Date) -lt $end -and -not ($b -and $f)) { Start-Sleep -Seconds 2; if (-not $b) { $b = [bool](Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) }; if (-not $f) { $f = [bool](Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) } }; Write-Host ('      backend: ' + $(if ($b) {'OK'} else {'실패'}) + ' / frontend: ' + $(if ($f) {'OK'} else {'실패'})); if ($b -and $f) { Start-Process 'http://localhost:5173' } else { Write-Host '      기동 실패 — 각 서버 창의 오류 메시지를 확인하세요' }"

echo.
echo 두 서버는 별도 창에서 계속 실행됩니다. 종료하려면 각 창을 닫으세요.
echo 이 창은 아무 키나 누르면 닫힙니다.
pause >nul
