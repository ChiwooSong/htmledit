@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 or newer is required. See README.md.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 goto fail
)
call npm run build
if errorlevel 1 goto fail
call npm start
goto end
:fail
echo HTMLEdit could not start. See the error above.
pause
:end
