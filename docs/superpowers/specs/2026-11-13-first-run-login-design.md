# First-run Decibel login — design

## Why

Colleagues will each run their own copy of the tracker on their own PC. Today they would have to
create `.env.local` by hand with their Decibel User ID and password. Instead, the first time they
open the tracker it should ask for those credentials on a login page.

## Goals

- First visit with no saved credentials → `/login` page asking for Decibel User ID and password.
- Credentials are checked by a real Decibel sign-in before being saved.
- Saved password is encrypted with the Windows user's DPAPI key (only that Windows user on that PC
  can decrypt it).
- `.env.local` / `.env.example` and all `DECIBEL_*` env-var reading are removed.

## Non-goals

- Multiple users on one running copy (each colleague runs their own).
- Sessions, cookies, or asking for the password every visit. The server only listens on 127.0.0.1.

## Anti-goals

- The password must never appear in a command line, log, error message, or `data/state.json`.

## Approaches considered

1. **DPAPI-encrypted file (chosen).** `data/credentials.json` holds the User ID in plain text and
   the password encrypted via PowerShell `ConvertTo-SecureString` / `ConvertFrom-SecureString`
   (no `-Key`, so DPAPI current-user scope). Verified on this PC: round trip works; decrypting with
   another key fails.
2. Plain-text file: simplest, but readable by anything that can read `data/`. Rejected.
3. Ask every time: breaks the 09:30 scheduled fetch and the login-time widget. Rejected.

## Design

- **`lib/credentials.ts`**: `saveCredentials(creds)`, `loadCredentials(): DecibelCreds | null`,
  `clearCredentials()`. Encrypt/decrypt by spawning `powershell.exe -NoProfile -NonInteractive`
  with the secret passed on **stdin**, never as an argument. The encryption call is injectable so
  tests don't need PowerShell.
- **`lib/fetch-job.ts`**: creds come from `opts.creds ?? loadCredentials()`. No creds →
  `lastError: 'Not signed in. Open the tracker and log in with your Decibel account.'`, and
  scheduled fetches stay stopped. Auth failure message changes from "Check .env.local" to
  "Log in again".
- **`POST /api/login`**: validates the User ID and password are present, runs a Decibel sign-in only
  (new `verifyLogin(creds)` in `lib/decibel.ts`, reusing `signIn`), and on success saves the
  credentials, clears `authBlocked`, and starts a background fetch. On a rejected sign-in it
  returns 401 with Decibel's message, and nothing is saved.
- **`/login` page**: User ID + password form, a "Signing in to Decibel…" spinner (a sign-in can take
  up to ~45 s), and the error shown inline. On success it goes to `/`.
- **Gate**: `/` and `/widget` redirect to `/login` when there are no saved credentials, or when the
  last fetch failed sign-in (`authBlocked` after an auth error). In the widget, the redirect opens
  the login page in the same small window.
- **"Change login"** link in the footer → `/login`, which shows the saved User ID pre-filled.
- **`scripts/fetch-once.mts`** uses `loadCredentials()` instead of env vars.
- **Remove**: `.env.example` (tracked) and the README setup step for it. `.env.local` (untracked,
  holds your current password) is deleted only after you've logged in through the new page and a
  fetch has succeeded, so the tracker never sits without working credentials.
- **Tests**: credentials save/load/clear with a fake encryptor; login route (missing fields,
  rejected sign-in saves nothing, success saves and clears `authBlocked`); fetch-job "not signed in".

## Left to the builder

The exact login page styling (match the existing cards) and the error copy wording.
