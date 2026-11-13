# Hours Tracker

A local web page that shows your **monthly hours balance** from Decibel HRMS timesheets, and what you need to clear any deficit. It runs only on this PC.

## Balance rules

- Each month starts at 0:00. Nothing carries over between months.
- Each working day with attendance needs its standard hours (9:00). More adds to the balance, less takes from it.
- Weekend and public-holiday work counts fully as extra.
- Absent days, leave days and off days are left out.
- Today is left out until it's finished. A past day with a check-in but no check-out is flagged and left out.
- Decibel's own "Short Hours" column is ignored, because it is really late arrival.

## One-time setup

1. Install [Node.js](https://nodejs.org) (LTS) if you don't have it.
2. Check that your company's IT policy allows automated sign-in to Decibel.
3. Double-click `setup.cmd`. It installs the packages and the browser used for the Decibel download, then builds the app. It takes a few minutes. Run it again after pulling new code.
4. Start the tracker (below) and log in with your Decibel User ID and password. They're checked with Decibel, then stored encrypted for your Windows account in `data/credentials.json`. Only your Windows account on this PC can decrypt them, so don't copy that file to anyone.

## Running

Double-click `start-tracker.cmd`. It builds the app the first time, starts it, and opens `http://127.0.0.1:21999`.

- It fetches from Decibel when it starts, and at 09:30 on weekdays while it's running. Use **Fetch now** at any time.
- Type your fingerprint check-in time in **Today's check-in** to see what time to leave.
- If a sign-in fails, scheduled fetches stop, so your account can't get locked by repeated retries. You're sent back to the login page; log in again to resume.
- To use a different account or a new password, click **Change login** at the bottom of the page.

If the tracker is already running, `start-tracker.cmd` just opens the page.

To stop it, double-click `stop-tracker.cmd`. It stops the server however it was started, including the hidden one the desktop window starts.

## Desktop window (opens at login)

A small "sticky note" window shows this month's balance, the clear-it card and a mini calendar. It's the page `http://127.0.0.1:21999/widget`, opened as a borderless Microsoft Edge app window in the top-right corner. It re-reads the data every 5 minutes.

- **Open it now:** right-click `scripts\start-widget.ps1` and choose **Run with PowerShell**. It starts the server in the background (no console window; output goes to `data\server.log`) if it isn't already running, then opens the window.
- **Open it at every login:** run this once:
  ```
  powershell -ExecutionPolicy Bypass -File scripts\install-widget-startup.ps1
  ```
  It puts a "Hours Tracker Widget" shortcut in your Startup folder. Add `-Uninstall` to remove it.
- **Stop the server:** double-click `stop-tracker.cmd`.
- After changing the code, run `npm run build` and restart the server, because it serves the last build.

## Where things are kept

- `data/months/YYYY-MM.json`: the parsed timesheet rows for each month
- `data/pdfs/`: the downloaded timesheet PDFs
- `data/state.json`: the last fetch time and last error
- `data/checkin.json`: today's check-in time

## Development

```
npm test        # unit tests (Vitest)
npm run dev     # dev server
```

The tests that parse a real timesheet need `tests/fixtures/oct-2026.pdf`, which is not in the repo because it holds personal data. Without it they are skipped.
