@echo off
rem Starts the Hours Tracker on http://127.0.0.1:21999 (this PC only).
cd /d "%~dp0"
rem Already running (e.g. started at login by the desktop window)? Just open the page.
netstat -ano | findstr /r /c:"127.0.0.1:21999 .*LISTENING" >nul && (
  start "" "http://127.0.0.1:21999"
  exit /b 0
)
if not exist ".next\BUILD_ID" (
  echo Building the tracker for the first time...
  call npm run build || exit /b 1
)
start "" "http://127.0.0.1:21999"
call npm start
