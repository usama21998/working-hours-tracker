# Hours Tracker

Shows your monthly hours balance from Decibel timesheets, and what time to leave to clear a deficit. Runs only on your PC.

## Setup (once)

1. Install [Node.js](https://nodejs.org) (LTS).
2. Double-click `setup.cmd`.

## Use

- **Start:** double-click `start-tracker.cmd`, then log in with your Decibel User ID and password.
- **Stop:** double-click `stop-tracker.cmd`.
- **Desktop window at login (optional):** run once
  `powershell -ExecutionPolicy Bypass -File scripts\install-widget-startup.ps1`

It fetches your timesheet at start-up and at 09:30 on weekdays. Click **Fetch now** at any time.

## How the balance works

- Each working day needs 9:00. More adds to your balance, less takes from it.
- Weekend and holiday work counts as extra.
- Leave, absent and off days are skipped.
- Every month starts at 0:00.

Your password is stored encrypted, so only your Windows account can read it. Don't share the `data` folder.
