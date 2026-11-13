# Attendance Hours Tracker — Design

Date: 2026-11-12
Status: Draft, awaiting approval

## Why

The user's employer records attendance in **Decibel HRMS** (`https://bpo.mydecibel.com/login.aspx`). The user can download a timesheet PDF for a date range by hand, but has to do it repeatedly to find out whether their hours are short.

Decibel's own "Short Hours" column does not answer that question. In the October 2026 sample it equals the "Late Arrival" value on every day, even on days worked past 9 hours (e.g. Oct 22: 9:41 worked, "short" 0:57). The user needs their **real monthly hours balance**, calculated with the rules below, and without having to fetch it by hand.

## Goals

1. Fetch the current month's timesheet from Decibel automatically on this PC, with no clicks.
2. Calculate the month's hours balance using the user's rules.
3. Show the balance and what's needed to clear a deficit on one local web page.
4. Let the user browse earlier months.

## Non-goals

- Changing anything in Decibel (no leave requests, no corrections). Read-only.
- Tracking lateness. Arriving late is not "short" by the user's rules.
- Access from other devices, hosting, or multiple users. This PC only, one user.
- Notifications (not requested).

## Anti-goals (failure even if it "works")

- The tool's balance disagrees with a hand calculation from the same PDF.
- The Decibel password ends up in source code, logs, the UI, or anything that gets shared.
- A failed fetch is shown as if the data were current. Staleness must be visible.

## Balance rules (decided by the user)

- **Per month**, starting at 0:00 on the 1st. No carry-over between months.
- **Each working day with attendance requires 9:00.** The day contributes `actual − required`, so it can be positive or negative.
- **Surplus offsets deficit** within the month. 8h one day and 10h the next nets to zero.
- **Weekend / off-day work counts fully as extra.** The day contributes `+actual`.
- **Absent days are left out.** No requirement, contributes 0.
- The user is **short** only if the month-end balance is negative.

Check against the sample (`AT_EmpTimeSheet (16).pdf`, Oct 2026): 20 attended weekdays × 9:00 = 180:00 required; weekday actual 169:55; Saturday Oct 24 +7:38; **balance −2:27**. Decibel's own total "Actual Work Hours" of 177:33 matches. This is the acceptance test for the calculation.

### Calls I made (not confirmed by the user)

- **Required hours per day come from Decibel's "Standard Work Hours" column** when it has a value (09:00 on normal days). A day with no standard value but with attendance (e.g. weekend) has 0:00 required. Reason: if Decibel ever shows a different standard (a half day, a short day), the tracker follows it automatically. In the sample this gives exactly the user's 9:00 rule.
- **Leave days (casual, sick, annual, etc.)** are treated like absent days: no requirement, contribute 0. There are no half-day leaves (user confirmed).
- **Public holidays** are off days (user confirmed). No requirement, and any hours worked on a holiday count fully as extra, the same as weekend work (that last part is my call).
- **Today, while in progress** (time in but no time out), is left out of the balance. It is used only for the "leave by" time.
- **Missing time-out on a past day** (forgot to check out) is shown as a flagged day, left out of the balance, and listed as a warning on the page.

## Data source

- Decibel offers the timesheet only as the PDF shown in the sample (user confirmed: no Excel/CSV).
- PDF layout: a header block (company, date range, employee details), then one row per date with columns `Date In | Time In | Time Out | Standard Work Hours | Actual Work Hours | Late Arrival | Early Departure | Excess Hours | Short Hours | Remarks`, a totals row, and a summary block (Present/Absent/Off days, leave counts). Rows continue across pages, and the column header repeats at the bottom of the last page.
- Remarks values seen: `Late-Overtime`, `Early Going-Late`, `Off Saturday`, `Sunday`, `Absent`, `Off Saturday OverTime`. Other values (leave types, holidays) are expected but not yet seen. The parser must keep unknown remarks and not crash on them.
- Plain line-by-line text extraction mis-aligns rows, because blank cells collapse and values land on the wrong date. The parser must group text by its position on the page (row y-coordinate, column x-ranges taken from the header) and must check its October output against the hand-checked values below.
- Only the date, time in, time out, standard hours, actual hours and remarks columns are used. The tool uses Decibel's Actual Work Hours as given and does not recalculate it from in/out.

## Automation (decided by the user)

- **Fully hands-off.** A script on this PC signs in to Decibel on a schedule, requests the timesheet for the 1st of the month through today, downloads the PDF, parses it, and stores the result.
- **Credentials** live only in a local env file (e.g. `.env.local`) that the user fills in. The file is ignored by any version control and never logged or shown. The assistant does not handle the password.
- The exact click path in Decibel from login to the PDF download is **not yet known**. It must be recorded once, with the user signed in themselves, before the fetch script is written.
- **Sign-in needs only User ID and password** (user confirmed: no one-time code or CAPTCHA). Session limits and lockout policy are unknown, so the script must **not retry a failed sign-in automatically**. After one failure it stops scheduled fetches until the user clicks "Fetch now" or updates the env file, so a wrong password cannot lock the account.
- **Today's check-in is not available from Decibel the same day** (user: attendance is by fingerprint and does not show up immediately). So:
  - The page has a **"Today's check-in" time field** the user types in (pre-filled if Decibel ever does return today's time-in). "Leave by" is calculated from it. It is stored locally for today only.
  - **Schedule (my call):** fetch when the app starts and once a day at 09:30 on weekdays, plus the "Fetch now" button. An hourly schedule would add sign-ins without adding data.
- On the 1st of a month, also fetch the previous month once more, so late corrections in Decibel are captured.
- On failure (bad password, Decibel down, page layout changed, PDF unreadable), keep the last good data and show the error and time of the last success on the page.
- Downloaded PDFs are kept in a local folder for checking.

## Tech (decided by the user: Next.js)

- One Next.js app, run locally on this Windows PC only, bound to localhost.
- Left to the builder: browser automation library for the fetch, PDF text extraction library, scheduler mechanism (in-process vs Windows Task Scheduler), how the app starts with Windows, storage format (one JSON file per month is fine), styling.

## Screen (user chose layout B)

- **Top left, month balance:** large, red when negative and green when zero or positive. Subtext: worked vs required, days counted, weekend days worked.
- **Top right, "To clear it":** includes the "Today's check-in" time field. If the balance is negative and a check-in time is known, show "leave by HH:MM today", worked out as time-in + 9:00 + deficit. Also show the extra minutes per remaining working day (Mon–Fri left in the month, after today), assuming 9:00 is otherwise worked. When the balance is ≥ 0, show the surplus instead.
- **Calendar:** Mon–Sun grid for the month. Each attended day shows its contribution (e.g. `−0:33`, `+7:38`), shaded red or green by size. Absent, off and leave days are greyed and labelled. Today is highlighted. Flagged days are marked.
- **Clicking a day** shows time in, time out, standard, actual and Decibel's remark.
- **Month navigation:** previous and next arrows, defaulting to the current month.
- **Footer:** last successful fetch time, last error if any, and a "Fetch now" button.

## Open items

- Record the Decibel click path to the PDF (needs the user signed in once).
