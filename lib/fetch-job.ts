import { loadCredentials } from './credentials';
import { DecibelAuthError, downloadTimesheet, type DecibelCreds } from './decibel';
import { parseTimesheet } from './parse-timesheet';
import { loadState, saveMonth, savePdf, saveState } from './store';
import { localDateISO } from './time';
import type { DayRow, FetchState } from './types';

export const AUTH_MESSAGE = 'Decibel sign-in failed. Log in again with your Decibel account.';
export const NOT_SIGNED_IN = 'Not signed in. Open the tracker and log in with your Decibel account.';

type Options = {
  manual: boolean;
  /** YYYY-MM to fetch instead of the default ranges (the page's "Fetch now" sends the month on screen). */
  month?: string;
  now?: Date;
  download?: typeof downloadTimesheet;
  creds?: DecibelCreds;
};

let running: Promise<FetchState> | null = null;

/** Date ranges to request: 1st of this month..today, plus the whole previous month on the 1st. */
function rangesFor(now: Date): [string, string][] {
  const today = localDateISO(now);
  const first = localDateISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const ranges: [string, string][] = [[first, today]];
  if (now.getDate() === 1) {
    ranges.push([
      localDateISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      localDateISO(new Date(now.getFullYear(), now.getMonth(), 0)),
    ]);
  }
  return ranges;
}

/** Range for one requested month: the whole month if past, 1st..today if current, null if it hasn't started. */
function rangeForMonth(month: string, now: Date): [string, string] | null {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  if (first > now) return null;
  const last = new Date(y, m, 0);
  return [localDateISO(first), localDateISO(last < now ? last : now)];
}

async function doFetch(opts: Options): Promise<FetchState> {
  const now = opts.now ?? new Date();
  const stamp = now.toISOString();
  const state = await loadState();
  if (!opts.manual && state.authBlocked) return state;

  const creds = opts.creds ?? (await loadCredentials());
  if (!creds?.userId || !creds.password) {
    const s: FetchState = { ...state, lastError: NOT_SIGNED_IN, lastErrorAt: stamp, authBlocked: true };
    await saveState(s);
    return s;
  }

  let ranges = rangesFor(now);
  if (opts.month) {
    const range = rangeForMonth(opts.month, now);
    if (!range) {
      const s: FetchState = { ...state, lastError: `Cannot fetch ${opts.month}: it has not started yet.`, lastErrorAt: stamp };
      await saveState(s);
      return s;
    }
    ranges = [range];
  }

  const download = opts.download ?? downloadTimesheet;
  try {
    for (const [from, to] of ranges) {
      const pdf = await download(from, to, creds);
      const { rows } = await parseTimesheet(pdf);
      const byMonth = new Map<string, DayRow[]>();
      for (const r of rows) {
        const m = r.date.slice(0, 7);
        byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
      }
      for (const [month, monthRows] of byMonth) await saveMonth(month, monthRows);
      await savePdf(`${from.slice(0, 7)}.pdf`, pdf);
    }
    const s: FetchState = { lastSuccessAt: stamp, lastError: null, lastErrorAt: null, authBlocked: false };
    await saveState(s);
    return s;
  } catch (e) {
    const auth = e instanceof DecibelAuthError;
    const raw = auth ? AUTH_MESSAGE : e instanceof Error ? e.message : String(e);
    const message = raw.split(creds.password).join('***').split(creds.userId).join('***');
    const s: FetchState = { ...state, lastError: message, lastErrorAt: stamp, authBlocked: auth ? true : state.authBlocked };
    await saveState(s);
    return s;
  }
}

/** Fetch from Decibel, parse, store. Concurrent calls share the run in progress. */
export function runFetch(opts: Options): Promise<FetchState> {
  if (!running) running = doFetch(opts).finally(() => (running = null));
  return running;
}
