# Attendance Hours Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Next.js app that downloads the user's Decibel HRMS timesheet PDF on a schedule, works out the monthly hours balance with the user's rules, and shows it as a balance card, a "to clear it" card and a colour-coded calendar.

**Architecture:** Pure TypeScript modules in `lib/` do the work: PDF parsing (pdfjs text with x/y positions), the balance calculation, the "clear it" maths, JSON file storage, and the Playwright downloader. A fetch job ties them together and is triggered by an in-process cron started from Next.js `instrumentation.ts`, by app start, and by a "Fetch now" API route. The page is a server component that reads one view model.

**Tech Stack:** Next.js (App Router, TypeScript, via `create-next-app@latest`), Vitest, `pdfjs-dist`, `playwright` (Chromium), `node-cron`. Check each library's current docs for exact import paths and config option names before relying on the ones written here. Notes below say where I'm not certain.

**Spec:** `docs/superpowers/specs/2026-11-12-attendance-tracker-design.md`

## Global Constraints

- Runs only on this Windows PC, bound to `127.0.0.1` (`next start -H 127.0.0.1 -p 3000`).
- Read-only toward Decibel: never submit anything other than the login form and the report request.
- Credentials come only from `.env.local` keys `DECIBEL_USER_ID` and `DECIBEL_PASSWORD`. They are never logged, returned by an API, rendered or written to `data/`. `.env.local` is git-ignored. Only `.env.example` (empty values) is committed.
- No automatic retry after a failed sign-in. Scheduled fetches stop until a manual "Fetch now".
- All times are minutes (integers) internally. Display uses `H:MM` with a true minus sign `−` (U+2212) for negatives and `+` for positives.
- Balance acceptance test: the Oct 2026 fixture gives balance **−147 min (−2:27)**, worked 10653 min (177:33), required 10800 min (180:00).
- Local data lives in `data/` (git-ignored): `data/months/YYYY-MM.json`, `data/state.json`, `data/checkin.json`, `data/pdfs/`. The directory can be overridden with `DATA_DIR` (used by tests).
- The folder is not a git repo yet. Task 1 runs `git init`. It stays local, with no remote.

## Review Focus

1. **Today's row in the PDF with no times and a remark like "Absent"** (the fingerprint hasn't synced) must show as "today", not absent. Test in Task 3 `today-without-sync`.
2. **Sign-in fails** (wrong password or the page changed): last good data stays, the error and last success time show, and scheduled runs don't retry. Tests in Task 7 `auth-failure-blocks-schedule` and `manual-fetch-clears-block`.
3. **First run, or viewing a month never fetched:** the page shows "No data for this month yet", not a crash. Test in Task 5 `view-empty-month`.
4. **Bad check-in input** (`9.5`, `25:00`, empty): rejected with HTTP 400, nothing stored. Tests in Task 1 `isValidHHMM` and Task 7 `checkin-route-rejects`.
5. **Fetch on the 1st of the month:** fetches the 1st only for the new month and re-fetches the whole previous month. Test in Task 7 `first-of-month-refetches-previous`.

---

## Shared Types (`lib/types.ts`, created in Task 1)

```ts
export type DayRow = {
  date: string;            // 'YYYY-MM-DD'
  timeIn: string | null;   // 'HH:MM'
  timeOut: string | null;
  standardMin: number | null;
  actualMin: number | null;
  remark: string;          // '' if none
};
export type DayKind = 'work' | 'extra' | 'absent' | 'leave' | 'off' | 'flagged' | 'today' | 'future';
export type DayResult = DayRow & { kind: DayKind; requiredMin: number; contributionMin: number; runningMin: number };
export type MonthSummary = {
  month: string;           // 'YYYY-MM'
  days: DayResult[];
  balanceMin: number; workedMin: number; requiredMin: number;
  countedDays: number;     // kind 'work'
  extraDays: number;       // kind 'extra'
  flaggedDates: string[];
};
export type ClearIt = { leaveBy: string | null; perDayMin: number | null; remainingDays: number; surplusMin: number | null };
export type FetchState = { lastSuccessAt: string | null; lastError: string | null; lastErrorAt: string | null; authBlocked: boolean };
export type MonthView =
  | { empty: true; month: string; state: FetchState }
  | { empty: false; month: string; summary: MonthSummary; clearIt: ClearIt | null; checkIn: string | null; state: FetchState };
```

---

### Task 1: Scaffold and time utilities

**Files:**
- Create: the Next.js app in the project root (`create-next-app`: TypeScript, App Router, no `src/` dir, ESLint yes, Tailwind yes), `vitest.config.ts`, `.env.example`, `.gitignore` additions, `lib/types.ts`, `lib/time.ts`
- Create: `tests/fixtures/oct-2026.pdf` (copy of `AT_EmpTimeSheet (16).pdf`)
- Test: `tests/time.test.ts`

**Interfaces:**
- Produces: `parseHHMM(s: string): number | null` (`'08:27'`→507, `'180:0'`→10800, `''`→null), `formatSigned(min: number): string` (−147→`'−2:27'`, 458→`'+7:38'`, 0→`'0:00'`), `formatHHMM(min: number): string` (507→`'8:27'`), `clockToMin(hhmm: string): number`, `minToClock(min: number): string` (1167→`'19:27'`), `isValidHHMM(s: string): boolean`; all types in `lib/types.ts`.

- [ ] **Step 1:** `git init` in the project folder. The folder already has files, so scaffold the Next.js app in a temp folder and move it in, or use whatever `create-next-app` allows. Don't delete `AT_EmpTimeSheet (16).pdf`, `docs/` or `.superpowers/`. Add `vitest`, then a `test` script `vitest run`.
- [ ] **Step 2:** Append to `.gitignore`: `.env.local`, `data/`, `.superpowers/`. Create `.env.example` with `DECIBEL_USER_ID=` and `DECIBEL_PASSWORD=`. Copy the sample PDF to `tests/fixtures/oct-2026.pdf`.
- [ ] **Step 3: Write failing tests** in `tests/time.test.ts`. Cover each example in the Interfaces line, plus `isValidHHMM`: `'09:52'` true, `'9:52'` true, `'9.5'` false, `'25:00'` false, `'09:60'` false, `''` false.
- [ ] **Step 4:** `npm test`. Expected: FAIL (module not found).
- [ ] **Step 5:** Implement `lib/types.ts` (verbatim from Shared Types) and `lib/time.ts`.
- [ ] **Step 6:** `npm test`. Expected: PASS. Also `npm run build` succeeds.
- [ ] **Step 7:** Commit: `chore: scaffold Next.js app and time utilities`.

### Task 2: Timesheet PDF parser

**Files:**
- Create: `lib/parse-timesheet.ts`
- Test: `tests/parse-timesheet.test.ts`

**Interfaces:**
- Consumes: `parseHHMM`, `DayRow`.
- Produces: `parseTimesheet(pdf: Uint8Array): Promise<{ from: string; to: string; rows: DayRow[] }>`. `from` and `to` are `'YYYY-MM-DD'`, taken from the header text `Oct 01, 2026 to Oct 31, 2026`.

- [ ] **Step 1: Write failing tests** that load the fixture and assert:
  - `from === '2026-10-01'`, `to === '2026-10-31'`, `rows.length === 31`, dates consecutive.
  - `2026-10-01`: `{timeIn:'09:52', timeOut:'18:19', standardMin:540, actualMin:507, remark:'Late-Overtime'}`.
  - `2026-10-02`: actualMin 391, remark `'Early Going-Late'`.
  - `2026-10-03`: timeIn null, actualMin null, remark `'Off Saturday'`. `2026-10-04`: remark `'Sunday'`, timeIn null (the line-order bug put times here). `2026-10-05`: remark `'Absent'`.
  - `2026-10-11` and `2026-10-18` remark `'Sunday'`.
  - `2026-10-24`: timeIn `'10:51'`, standardMin null, actualMin 458, remark `'Off Saturday OverTime'`.
  - `2026-10-30`: actualMin 529. Sum of all `actualMin` = 10653.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** with `pdfjs-dist` `getTextContent()`. Each item has `str` and `transform` (x = `transform[4]`, y = `transform[5]`). The Node import path for the legacy build is likely `pdfjs-dist/legacy/build/pdf.mjs`; verify it for the installed version. Algorithm, by position and not line order:
  1. Per page, group items into lines by y (tolerance ±2).
  2. Find the column header line (contains `Date In` and `Remarks`). Each header label's x-centre defines a column, so later items go to the nearest column centre. Headers may be split across items (`Standard` / `Work Hours`), so merge items within one header cell by x-gap.
  3. A data line is one whose Date-column text matches `/^[A-Z][a-z]{2} \d{2}, \d{4}$/`. Its other items go to the nearest column. Join multiple items in Remarks with a space.
  4. Ignore totals, summary and repeated header lines.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: parse Decibel timesheet PDF by text position`.

### Task 3: Balance calculation

**Files:**
- Create: `lib/balance.ts`
- Test: `tests/balance.test.ts`

**Interfaces:**
- Consumes: `DayRow`, `DayResult`, `MonthSummary`, `parseTimesheet` (fixture only).
- Produces: `computeMonth(month: string, rows: DayRow[], today: string): MonthSummary`. Days are sorted by date. `runningMin` is the cumulative balance after that day.

Classification (the first matching rule wins):
1. `date > today` → `future`, contributes 0.
2. `date === today` and `timeOut === null` → `today`, contributes 0, whatever the remark says.
3. `timeIn !== null && timeOut === null` → `flagged`, contributes 0, added to `flaggedDates`.
4. `actualMin !== null` → `requiredMin = standardMin ?? 0`. Kind is `work` if `requiredMin > 0`, else `extra`. `contributionMin = actualMin − requiredMin`.
5. No times: remark `/leave/i` → `leave`; remark `/absent/i` → `absent`; otherwise → `off` (covers Saturday, Sunday and holidays). Contributes 0.

`workedMin` sums actualMin over `work` and `extra`. `requiredMin` sums over `work`.

- [ ] **Step 1: Write failing tests:**
  - `october-acceptance`: fixture with today `'2026-11-12'` → balanceMin −147, workedMin 10653, requiredMin 10800, countedDays 20, extraDays 1, flaggedDates `[]`.
  - Running values: Oct 01 −33, Oct 02 −182, Oct 22 −553, Oct 24 −52 (Oct 24 kind `extra`, contribution 458), Oct 30 −147.
  - Oct 05 kind `absent`, Oct 03 kind `off`.
  - `today-without-sync`: rows with today `'2026-11-12'` having no times and remark `'Absent'` → kind `today`, balance unaffected.
  - `flagged-day`: past row `timeIn '09:30', timeOut null` → `flagged`, in `flaggedDates`, contributes 0.
  - `leave-and-holiday`: remark `'Casual Leave'` with no times → `leave`. Remark `'Public Holiday'` with no times → `off`. Remark `'Public Holiday'` with actualMin 240 and standardMin null → `extra` +240.
  - `future`: a row after today → `future`.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `computeMonth`.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: monthly balance calculation`.

### Task 4: "To clear it" calculation

**Files:**
- Create: `lib/clear-it.ts`
- Test: `tests/clear-it.test.ts`

**Interfaces:**
- Consumes: `MonthSummary`, `ClearIt`, `clockToMin`, `minToClock`.
- Produces: `computeClearIt(summary: MonthSummary, today: string, checkIn: string | null): ClearIt`.

Rules:
- `remainingDays` = Mon–Fri dates in the month strictly after `today`.
- If `balanceMin >= 0`: `surplusMin = balanceMin`, `leaveBy = null`, `perDayMin = null`.
- Else, with deficit `D = −balanceMin`:
  - `leaveBy = minToClock(clockToMin(checkIn) + todayRequired + D)` when `checkIn` is set, where `todayRequired` is today's row `standardMin`, else 540. Otherwise null.
  - `perDayMin = ceil(D / remainingDays)` when `remainingDays > 0`, else null.
  - `surplusMin = null`.

- [ ] **Step 1: Write failing tests:**
  - Balance −147, today `'2026-11-12'` (a Thursday), checkIn `'09:45'` → leaveBy `'21:12'` (585 + 540 + 147 = 1272 → 21:12). remainingDays = 12 (Nov 13, 16–20, 23–27, 30), perDayMin = 13.
  - Balance −147, checkIn null → leaveBy null, perDayMin 13.
  - Balance +30 → surplusMin 30, leaveBy null.
  - Today is the last weekday of the month with a deficit → remainingDays 0, perDayMin null.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: leave-by and per-day catch-up calculation`.

### Task 5: Local storage and month view model

**Files:**
- Create: `lib/store.ts`, `lib/view.ts`
- Test: `tests/store.test.ts`, `tests/view.test.ts`

**Interfaces:**
- Consumes: `computeMonth`, `computeClearIt`, types.
- Produces:
  - `store.ts`: `dataDir(): string` (`process.env.DATA_DIR ?? 'data'`), `saveMonth(month: string, rows: DayRow[]): Promise<void>`, `loadMonth(month: string): Promise<DayRow[] | null>`, `savePdf(name: string, pdf: Uint8Array): Promise<void>`, `loadState(): Promise<FetchState>` (defaults all null/false), `saveState(s: FetchState): Promise<void>`, `saveCheckIn(date: string, time: string): Promise<void>`, `loadCheckIn(date: string): Promise<string | null>` (returns null when the stored date ≠ `date`). Writes go to a temp file first, then a rename.
  - `view.ts`: `getMonthView(month: string, today: string): Promise<MonthView>`. `clearIt` and `checkIn` are filled only when `month` is today's month. If no check-in is stored and today's row has a `timeIn`, use that.

- [ ] **Step 1: Write failing tests** with `DATA_DIR` set to a fresh temp dir per test:
  - Round-trips for month rows, state and check-in. `loadCheckIn('2026-11-13')` after saving for `'2026-11-12'` → null.
  - `view-empty-month`: `getMonthView('2026-09', '2026-11-12')` with nothing stored → `{empty:true}`.
  - The October fixture rows saved, then `getMonthView('2026-10', '2026-11-12')` → `summary.balanceMin` −147 and `clearIt` null (not the current month).
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: JSON storage and month view model`.

### Task 6: Decibel downloader (needs the user once)

**Files:**
- Create: `lib/decibel.ts`, `scripts/fetch-once.ts` (run via `npx tsx scripts/fetch-once.ts`), `docs/decibel-click-path.md`

**Interfaces:**
- Produces: `class DecibelAuthError extends Error`; `downloadTimesheet(from: string, to: string, creds: { userId: string; password: string }): Promise<Uint8Array>`. Throws `DecibelAuthError` when sign-in is rejected, and a plain `Error` with a short message for anything else (selector timeout, no download).

- [ ] **Step 1: Record the click path. This is a human step.** Ask the user to sign in to Decibel themselves in Chrome. The assistant must never type the credentials. Then, with the Chrome tools, read-only, record in `docs/decibel-click-path.md`: the menu path to the timesheet report, the date-range inputs and their date format, the button that produces the PDF, whether it downloads or opens in a new tab, and what a failed sign-in looks like (from the user's description, not by trying one). Don't save or download anything without asking.
- [ ] **Step 2: Implement** `downloadTimesheet` with Playwright Chromium (headless), following the recorded path. The login page is `https://bpo.mydecibel.com/login.aspx` (fields: User ID, Password, Language left as English). Use `page.waitForEvent('download')` if it downloads, or fetch the PDF URL with the page's request context if it opens in a tab. Close the browser in `finally`. Never pass credentials to `console.*` or put them in error messages.
- [ ] **Step 3:** Have `scripts/fetch-once.ts` read `.env.local` and download Nov 1 to today to `data/pdfs/manual-test.pdf`, then print the row count from `parseTimesheet`.
- [ ] **Step 4: Verify with the user present.** The user fills `.env.local` themselves and runs `npx tsx scripts/fetch-once.ts`. Expected: a row count equal to the days from Nov 1 to the report end date, and no password in the output. The assistant doesn't run this while it holds no credentials, and doesn't read `.env.local`.
- [ ] **Step 5:** Commit: `feat: Decibel timesheet downloader`.

### Task 7: Fetch job, scheduler and API routes

**Files:**
- Create: `lib/fetch-job.ts`, `instrumentation.ts`, `app/api/fetch/route.ts`, `app/api/checkin/route.ts`
- Modify: `next.config.ts`: mark `playwright` and `pdfjs-dist` as server-external packages. The option is `serverExternalPackages` in recent Next.js; verify against the installed version.
- Test: `tests/fetch-job.test.ts`, `tests/checkin-route.test.ts`

**Interfaces:**
- Consumes: `downloadTimesheet`, `DecibelAuthError`, `parseTimesheet`, store functions.
- Produces:
  - `runFetch(opts: { manual: boolean; now?: Date; download?: typeof downloadTimesheet; creds?: {userId:string;password:string} }): Promise<FetchState>`. `download` and `creds` are injectable for tests, and default to the real downloader and `process.env`. A module-level lock means a second call during a run returns the current state without fetching.
  - `POST /api/fetch` → runs `runFetch({manual:true})` and returns `FetchState` JSON.
  - `POST /api/checkin` with body `{time:'HH:MM'}` → 200 `{ok:true}`, or 400 when `!isValidHHMM`.
  - `instrumentation.ts` `register()`: only when `process.env.NEXT_RUNTIME === 'nodejs'`, dynamically import `node-cron` and `fetch-job`. Run `runFetch({manual:false})` once, and schedule `'30 9 * * 1-5'` with `runFetch({manual:false})`.

`runFetch` behaviour:
- If `!manual && state.authBlocked` → return the state unchanged, without calling `download`.
- If the creds are missing → `lastError = 'DECIBEL_USER_ID / DECIBEL_PASSWORD not set in .env.local'`, `authBlocked = true`.
- Download from the 1st of the current month to today. If today is the 1st, also download the whole previous month. Parse each, `saveMonth` per month in the result, and `savePdf('YYYY-MM.pdf')`.
- Success → `lastSuccessAt = now`, `lastError = null`, `authBlocked = false`.
- `DecibelAuthError` → `authBlocked = true`, `lastError = 'Decibel sign-in failed. Check .env.local, then click Fetch now.'`
- Other error → `lastError = <message>`, `authBlocked` unchanged, and previous data untouched.

- [ ] **Step 1: Write failing tests** with a fake `download` and a temp `DATA_DIR`:
  - Success saves `2026-11` rows from the fixture-derived PDF (the fake returns the fixture bytes) and sets `lastSuccessAt`.
  - `auth-failure-blocks-schedule`: download throws `DecibelAuthError` → `authBlocked` true. A following `runFetch({manual:false})` doesn't call `download`.
  - `manual-fetch-clears-block`: after that, `runFetch({manual:true})` calls `download`, and on success `authBlocked` is false.
  - Other error → previously saved month still loads, and `lastError` is set.
  - `first-of-month-refetches-previous`: `now = 2026-12-01` → `download` called with `('2026-12-01','2026-12-01')` and `('2026-11-01','2026-11-30')`.
  - `checkin-route-rejects`: call the route handler's `POST` with `{time:'25:00'}` → 400, and nothing stored. `{time:'09:45'}` → 200 and stored for today.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: PASS. `npm run build` succeeds.
- [ ] **Step 5:** Commit: `feat: scheduled fetch job and API routes`.

### Task 8: The page (layout B)

**Files:**
- Create/replace: `app/page.tsx`, `app/components/BalanceCard.tsx`, `app/components/ClearItCard.tsx` (client: check-in input posts to `/api/checkin`, then `router.refresh()`), `app/components/Calendar.tsx`, `app/components/DayDetail.tsx` (client: shown on day click), `app/components/FetchFooter.tsx` (client: "Fetch now" posts to `/api/fetch`, shows a spinner, then refreshes)

**Interfaces:**
- Consumes: `getMonthView`, `formatSigned`, `formatHHMM`.
- `app/page.tsx` reads `?month=YYYY-MM` (default: today's month in local time), calls `getMonthView`, and is dynamic, not statically cached.

Content (from the spec, layout B):
- **Balance card:** `formatSigned(balanceMin)`, large, red if < 0, green if ≥ 0. Subtext: `Worked {worked} of {required} · {countedDays} days · {extraDays} weekend/holiday days`.
- **Clear-it card:** a check-in time input. When in deficit, "Leave by {leaveBy} today" (or "Enter today's check-in to see your leave time"), and "or +{perDayMin} min/day for the {remainingDays} remaining weekdays". When ≥ 0: "{surplus} ahead". Shown only for the current month.
- **Calendar:** a Mon–Sun grid. `work`/`extra` cells show the contribution, shaded red or green, with intensity growing with |contribution| (cap at 2:00). `absent`/`leave`/`off` cells are grey with the remark. `today` is outlined. `flagged` gets a ⚠ and is listed under the calendar as "No check-out recorded: {dates}". `future` is plain.
- **Day detail:** time in, time out, standard, actual and remark.
- **Month arrows:** links to `?month=` previous and next.
- **Footer:** "Last fetched: {lastSuccessAt local time}" or "Never fetched", the `lastError` in red if set, and the Fetch now button.
- **Empty month:** "No data for this month yet", plus the footer.
- Must work in light and dark mode.

- [ ] **Step 1:** Implement the components.
- [ ] **Step 2:** Copy the fixture's parsed rows into `data/months/2026-10.json` (via a small test script or `saveMonth`), run `npm run dev`, and open `http://localhost:3000/?month=2026-10` in Chrome. Expected: −2:27 in red, Oct 24 green +7:38, Oct 5–6 grey "Absent", Oct 2 the darkest red (−2:29). Take a screenshot for the user.
- [ ] **Step 3:** Open `/` (November, no data). Expected: "No data for this month yet". Enter check-in `25:00` → error shown, nothing saved.
- [ ] **Step 4:** `npm run lint && npm test && npm run build`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: tracker page with balance, clear-it and calendar`.

### Task 9: Start-up script and README

**Files:**
- Create: `start-tracker.cmd`, `README.md`
- Modify: `package.json` script `start` → `next start -H 127.0.0.1 -p 3000`

- [ ] **Step 1:** `start-tracker.cmd` changes to the project folder, runs `npm run build` if `.next` is missing, then `npm start`.
- [ ] **Step 2:** The README covers filling `.env.local`, `npx playwright install chromium`, running `start-tracker.cmd`, adding it to Windows Startup **yourself** (Win+R → `shell:startup` → shortcut), what the balance rules are, and where data and PDFs are kept.
- [ ] **Step 3:** Run `start-tracker.cmd` and open `http://127.0.0.1:3000`. Expected: the page loads, and the footer shows a fetch result (success, or the "not set in .env.local" error).
- [ ] **Step 4:** Commit: `docs: start-up script and README`.
