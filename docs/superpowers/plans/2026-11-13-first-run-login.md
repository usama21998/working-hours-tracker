# First-run Decibel Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `.env.local` credentials with a `/login` page that verifies Decibel credentials and stores them DPAPI-encrypted in `data/credentials.json`.

**Architecture:** `lib/credentials.ts` owns the file and encryption (PowerShell DPAPI via stdin, injectable cipher for tests). `POST /api/login` verifies with a sign-in-only Playwright run, saves, and kicks off a fetch. `/` and `/widget` redirect to `/login` when not signed in or after a rejected sign-in.

**Tech Stack:** Next.js 16.4 (App Router, `redirect` from `next/navigation`), TypeScript, Playwright, Vitest, Windows PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-11-13-first-run-login-design.md`

## Global Constraints

- Password is never passed as a process argument, logged, put in an error message, or written to `data/state.json`.
- Encryption is DPAPI current-user: `ConvertTo-SecureString` / `ConvertFrom-SecureString` with no `-Key`.
- No code reads `DECIBEL_USER_ID` / `DECIBEL_PASSWORD` or `.env.local` after this plan.
- Read `node_modules/next/dist/docs/` for any Next API before using it (AGENTS.md).

## Review Focus

1. Passwords with quotes, `$`, backticks, spaces, non-ASCII (`p@ss "w'rd" $x ` + "`" + `ü`) must round-trip exactly → Task 1 DPAPI test.
2. `credentials.json` that can't be decrypted (copied from another PC/user, or corrupted) → treated as not signed in, user lands on `/login`, no crash → Task 1 + Task 2 tests.
3. User ID typed with surrounding spaces → trimmed before verify and save → Task 3 test.
4. Decibel unreachable / timeout during login (not a rejection) → 502 with a message, nothing saved, password scrubbed from the message → Task 3 test.
5. Login opened from the widget returns to `/widget`, not the full page; `next` accepts only `/` or `/widget` → Task 4 manual check.

---

### Task 1: Encrypted credential store

**Files:**
- Create: `lib/credentials.ts`
- Test: `tests/credentials.test.ts`

**Interfaces:**
- Consumes: `dataDir()` from `lib/store.ts`; `DecibelCreds` from `lib/decibel.ts`.
- Produces:
  - `type Cipher = { encrypt(plain: string): Promise<string>; decrypt(enc: string): Promise<string> }`
  - `const dpapi: Cipher`
  - `saveCredentials(creds: DecibelCreds, cipher?: Cipher): Promise<void>` — writes `data/credentials.json` as `{ "userId": string, "password": <encrypted string> }` (atomic write like `store.ts`).
  - `loadCredentials(cipher?: Cipher): Promise<DecibelCreds | null>` — `null` when the file is missing, unparsable, or decrypt throws.
  - `hasCredentials(): Promise<boolean>` — file exists with a non-empty `userId` and `password`; does **not** decrypt (pages call it on every render).
  - `loadUserId(): Promise<string | null>` — for pre-filling the login form.

- [ ] **Step 1: Write the failing tests** in `tests/credentials.test.ts` (fresh `DATA_DIR` per test as in `tests/store.test.ts`; `fake: Cipher = { encrypt: async (s) => 'enc:' + s, decrypt: async (s) => { if (!s.startsWith('enc:')) throw new Error('bad'); return s.slice(4); } }`):
  - `round-trips with a cipher`: save `{userId:'u1', password:'p1'}` with `fake` → `loadCredentials(fake)` equals it; raw file JSON has `password === 'enc:p1'`.
  - `missing file`: `loadCredentials(fake)` → `null`, `hasCredentials()` → `false`, `loadUserId()` → `null`.
  - `undecryptable file is not signed in`: write `{"userId":"u1","password":"garbage"}` → `loadCredentials(fake)` → `null`.
  - `corrupt json`: write `not json` → `loadCredentials(fake)` → `null`, `hasCredentials()` → `false`.
  - `it.runIf(process.platform === 'win32')('dpapi round-trips awkward passwords', ...)` with timeout 20 000 ms: for `p@ss "w'rd" $x ` + '`' + `ü` and `simple`: `await dpapi.decrypt(await dpapi.encrypt(p))` === `p`, and the encrypted text does not contain `p`.

- [ ] **Step 2: Run** `npx vitest run tests/credentials.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/credentials.ts`.** `dpapi` spawns `powershell.exe` with `['-NoProfile', '-NonInteractive', '-Command', SCRIPT]` via `node:child_process` `spawn`, writes the secret to stdin and ends it, collects stdout (utf8), rejects on non-zero exit with a message that does **not** include stdin. Scripts (exact — UTF-8 both ways and no trailing newline are what make the round trip exact):

```powershell
# ENCRYPT
[Console]::InputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8
$s=[Console]::In.ReadToEnd(); [Console]::Out.Write((ConvertTo-SecureString $s -AsPlainText -Force | ConvertFrom-SecureString))
# DECRYPT
[Console]::InputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8
$e=[Console]::In.ReadToEnd().Trim(); [Console]::Out.Write([System.Net.NetworkCredential]::new('', (ConvertTo-SecureString $e)).Password)
```

  Write stdin as `Buffer.from(secret, 'utf8')`. Move `writeAtomic` from `lib/store.ts` to an export (no behaviour change) and reuse it.

- [ ] **Step 4: Run** `npx vitest run tests/credentials.test.ts` → PASS (5 tests on Windows).

- [ ] **Step 5: Commit** `feat: DPAPI-encrypted Decibel credential store`

---

### Task 2: Fetch job reads the saved credentials

**Files:**
- Modify: `lib/fetch-job.ts:7-8,50`
- Test: `tests/fetch-job.test.ts`

**Interfaces:**
- Consumes: `loadCredentials()` from Task 1.
- Produces: exported constants `AUTH_MESSAGE = 'Decibel sign-in failed. Log in again with your Decibel account.'` and `NOT_SIGNED_IN = 'Not signed in. Open the tracker and log in with your Decibel account.'`

- [ ] **Step 1: Update tests.** Change the expected string in `auth-failure-blocks-schedule` to `AUTH_MESSAGE`. Add `not signed in`: with no `creds` option and no credentials file, `runFetch({ manual: true, now: NOW, download })` → `download` not called, `lastError === NOT_SIGNED_IN`, `authBlocked === true`.
- [ ] **Step 2: Run** `npx vitest run tests/fetch-job.test.ts` → the two changed tests FAIL.
- [ ] **Step 3: Implement:** `const creds = opts.creds ?? (await loadCredentials());` and when `!creds?.userId || !creds.password` save `NOT_SIGNED_IN` with `authBlocked: true`. Remove `MISSING_CREDS` and all `process.env.DECIBEL_*`.
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat: fetch uses the saved login instead of .env.local`

---

### Task 3: Sign-in check and `POST /api/login`

**Files:**
- Modify: `lib/decibel.ts` (add `verifyLogin`)
- Create: `app/api/login/route.ts`
- Test: `tests/login-route.test.ts`

**Interfaces:**
- Consumes: `saveCredentials` (Task 1), `runFetch` / `loadState` / `saveState`, `DecibelAuthError`.
- Produces:
  - `verifyLogin(creds: DecibelCreds): Promise<void>` in `lib/decibel.ts` — launches headless Chromium, runs the existing `signIn`, closes the browser in `finally`. Throws `DecibelAuthError` on rejection.
  - `POST /api/login`, body `{ userId: string, password: string }`, responses:
    - `400 { ok: false, error: 'Enter your Decibel User ID and password.' }` — either field empty after trimming `userId` (password is **not** trimmed).
    - `401 { ok: false, error: <DecibelAuthError message> }` — nothing saved.
    - `502 { ok: false, error: 'Could not reach Decibel: <message with password and userId replaced by ***>' }` — nothing saved.
    - `200 { ok: true }` — credentials saved, state saved with `authBlocked: false, lastError: null, lastErrorAt: null` (keep `lastSuccessAt`), then `void runFetch({ manual: true })` (not awaited).

- [ ] **Step 1: Write the failing tests** (pattern from `tests/checkin-route.test.ts`). `vi.mock('@/lib/decibel', ...)` keeping the real `DecibelAuthError` and replacing `verifyLogin` with a `vi.fn()`; `vi.mock('@/lib/fetch-job', () => ({ runFetch: vi.fn().mockResolvedValue({}) }))`; `vi.mock('@/lib/credentials', ...)` wrapping the real `saveCredentials`/`loadCredentials` with the fake cipher from Task 1. Tests:
  - `rejects empty fields`: `{userId:'  ', password:'x'}` and `{userId:'u', password:''}` → 400; `verifyLogin` not called.
  - `rejected sign-in saves nothing`: `verifyLogin` rejects `new DecibelAuthError('Decibel sign-in was rejected: Invalid password')` → 401 with that error; `hasCredentials()` false.
  - `network error is 502 and scrubbed`: `verifyLogin` rejects `new Error('timeout for secret-pw')` with password `secret-pw` → 502, body error contains `***`, not `secret-pw`; nothing saved.
  - `success saves trimmed id and unblocks`: pre-save state `{ authBlocked: true, lastError: 'x', ... }`; post `{userId:' u1 ', password:' p 1 '}` → 200; `verifyLogin` called with `{userId:'u1', password:' p 1 '}`; `loadCredentials(fake)` equals that; `loadState()` has `authBlocked: false, lastError: null`; `runFetch` called with `{ manual: true }`.
- [ ] **Step 2: Run** `npx vitest run tests/login-route.test.ts` → FAIL.
- [ ] **Step 3: Implement** `verifyLogin` and the route.
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat: /api/login verifies Decibel credentials and saves them`

---

### Task 4: Login page, redirect gate, "Change login" link

**Files:**
- Create: `app/login/page.tsx` (server), `app/components/LoginForm.tsx` (client)
- Modify: `app/page.tsx` (`Tracker`), `app/widget/page.tsx` (`Widget`), `app/components/FetchFooter.tsx`

**Interfaces:**
- Consumes: `hasCredentials`, `loadUserId` (Task 1); `POST /api/login` (Task 3); `redirect` from `next/navigation` (read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`).
- Produces: route `/login?next=/|/widget`.

- [ ] **Step 1: Gate.** In `Tracker` and `Widget`, after `connection()` and `getMonthView`: `if (!(await hasCredentials()) || view.state.authBlocked) redirect('/login?next=/')` (widget: `next=/widget`). Call `redirect` outside any try/catch.
- [ ] **Step 2: Login page.** `app/login/page.tsx` reads `searchParams.next`, allows only `'/'` or `'/widget'` (else `'/'`), awaits `connection()`, passes `defaultUserId = await loadUserId()` and `next` to `<LoginForm>`. Metadata title `'Log in'`. Copy: heading "Log in with your Decibel account", note "Your password is stored encrypted on this PC for your Windows account only."
- [ ] **Step 3: `LoginForm`.** Fields `userId` (autocomplete `username`, pre-filled) and `password` (type `password`, autocomplete `current-password`), submit "Log in". On submit: disable the form, show the same full-screen spinner style as `FetchFooter` with text "Signing in to Decibel…" / "This can take up to a minute.", `POST /api/login` JSON; on `ok` → `router.replace(next)` then `router.refresh()`; otherwise show `error` in a `role="alert"` line and re-enable (keep the user ID, clear the password). Network failure → "Could not reach the tracker server."
- [ ] **Step 4: Footer link.** In `FetchFooter`, add a `Change login` link (small, `opacity-70`) to `/login?next=<usePathname()>`.
- [ ] **Step 5: Verify.** `npx tsc --noEmit` and `npm run lint` clean; `npx vitest run` PASS; `npm run build` succeeds. Then with the server stopped (`stop-tracker.cmd`), rename `data/credentials.json` away if present, `npm start`, and check in a browser: `/` → `/login?next=/`; `/widget` → `/login?next=/widget`; a wrong password shows Decibel's error and stays; correct login lands on `next` and a fetch starts; "Change login" pre-fills the User ID.
- [ ] **Step 6: Commit** `feat: first-run login page with redirect gate`

---

### Task 5: Remove env-file setup

**Files:**
- Delete: `.env.example`
- Modify: `scripts/fetch-once.mts`, `README.md` ("One-time setup" step 2, "Running" bullet about `.env.local`, any other `.env` mention)

- [ ] **Step 1:** `scripts/fetch-once.mts`: drop `loadEnvFile`; `const creds = await loadCredentials()`; if `null` print `Not signed in. Start the tracker and log in first.` and exit 1. Keep scrubbing the password from errors. Update the header comment.
- [ ] **Step 2:** README: setup step 2 becomes "Start the tracker and log in with your Decibel User ID and password. They're checked with Decibel, then stored encrypted for your Windows account in `data/credentials.json`." Sign-in-failure bullet becomes "…you're sent back to the login page." Add "Change login" to the Running section.
- [ ] **Step 3: Verify** `git grep -n -i -E "env\.local|DECIBEL_USER_ID|DECIBEL_PASSWORD|loadEnvFile"` → no matches outside `docs/`. `npx vitest run` PASS.
- [ ] **Step 4: Commit** `chore: remove .env credential setup`
- [ ] **Step 5 (with the user, not automated):** after the user has logged in through `/login` and a fetch succeeded, ask before deleting `.env.local`, then delete it.
