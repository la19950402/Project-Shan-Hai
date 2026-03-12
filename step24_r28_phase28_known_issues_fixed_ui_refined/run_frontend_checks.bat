@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\check_frontend_integrity.py
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python tools\check_frontend_integrity.py
  goto :eof
)
echo 找不到 Python，無法執行前端完整性檢查。
pause
