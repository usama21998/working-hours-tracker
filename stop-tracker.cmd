@echo off
rem Stops the Hours Tracker running on http://127.0.0.1:21999, however it was started
rem (start-tracker.cmd or the desktop window's hidden server).
setlocal
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127.0.0.1:21999 .*LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%p /T /F >nul 2>&1
)
if defined FOUND (
  echo Hours Tracker stopped.
) else (
  echo Hours Tracker is not running.
)
rem Keep the message on screen for a few seconds when double-clicked.
ping -n 4 127.0.0.1 >nul
