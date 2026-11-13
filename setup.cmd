@echo off
rem One-time setup for a new PC. Run this once, then use start-tracker.cmd.
rem Installs the packages, the browser used to download timesheets, and builds the app.
cd /d "%~dp0"

where node >nul 2>&1 || (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org, then run setup.cmd again.
  pause
  exit /b 1
)

echo [1/3] Installing packages...
call npm ci || goto :failed

echo [2/3] Installing the browser used to download timesheets...
call npx playwright install chromium || goto :failed

echo [3/3] Building the tracker...
call npm run build || goto :failed

echo.
echo Setup finished. Double-click start-tracker.cmd and log in with your Decibel account.
pause
exit /b 0

:failed
echo.
echo Setup failed. Check the messages above, then run setup.cmd again.
pause
exit /b 1
