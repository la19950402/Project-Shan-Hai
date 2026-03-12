@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py serve_local.py
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python serve_local.py
  goto :eof
)
echo 找不到 Python，請先安裝 Python，或把本資料夾部署到 Firebase Hosting / 靜態主機後再開啟 index.html。
pause
