import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, Response } from 'playwright';
import { dataDir } from './store';

/** Thrown when Decibel rejects the User ID / password. Scheduled fetches stop after this. */
export class DecibelAuthError extends Error {
  constructor(message = 'Decibel sign-in was rejected') {
    super(message);
    this.name = 'DecibelAuthError';
  }
}

/** Decibel is down, unreachable or too slow. Not the user's fault, so scheduled fetches carry on. */
export class DecibelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecibelUnavailableError';
  }
}

export const UNAVAILABLE = {
  unreachable: "Couldn't reach Decibel. It may be down, or this PC is offline. Try again later.",
  slow: "Decibel didn't respond in time. It may be down or very slow. Try again later.",
  signIn: "Decibel didn't finish signing you in. It may be down or very slow. Try again later.",
  noReport: "Decibel didn't send the timesheet within 2 minutes. It may be down or busy. Try again later.",
  serverError: (status: number) => `Decibel had a server error (HTTP ${status}). Try again later.`,
  loginLimit: "Signing in to Decibel took longer than 90 seconds. It may be down or very slow. Try again later.",
  fetchLimit: "Fetching from Decibel took longer than 3 minutes. It may be down or very slow. Try again later.",
};

/** Hard limits for a whole sign-in check and for one timesheet download. */
const LOGIN_MAX = 90_000;
const FETCH_MAX = 180_000;

/** Reject with DecibelUnavailableError(message) if `work` isn't done within `ms`; `onTimeout` cleans up. */
export function withDeadline<T>(work: Promise<T>, ms: number, message: string, onTimeout?: () => unknown): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new DecibelUnavailableError(message));
      void Promise.resolve(onTimeout?.()).catch(() => null);
    }, ms);
  });
  work.catch(() => null); // a late failure after the deadline must not become an unhandled rejection
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** Turn a Playwright/network error into a message a person can act on (no call logs). */
export function friendlyError(e: unknown): Error {
  if (e instanceof DecibelAuthError || e instanceof DecibelUnavailableError) return e;
  const message = e instanceof Error ? e.message : String(e);
  if (/net::ERR_|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN/.test(message)) return new DecibelUnavailableError(UNAVAILABLE.unreachable);
  if ((e instanceof Error && e.name === 'TimeoutError') || /Timeout \d+ms exceeded/.test(message)) {
    return new DecibelUnavailableError(UNAVAILABLE.slow);
  }
  return new Error(message.split('\n')[0]);
}

export type DecibelCreds = { userId: string; password: string };

const LOGIN_URL = 'https://bpo.mydecibel.com/login.aspx';
const REPORT_URL = 'https://hrms1.mydecibel.com/TMS/EmpAttendanceReport.aspx';
const SEL = {
  userId: '#tb_UserId',
  password: '#tb_Password',
  language: '#ddl_Language',
  signIn: '#pb_SignIn',
  from: '#tb_FromDate',
  to: '#tb_ToDate',
  getReport: '#ContentPlaceHolder1_pb_GetReport',
};
const SIGN_IN_TIMEOUT = 45_000;
const REPORT_TIMEOUT = 120_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM-DD' -> 'November 01,2026' (the report page's date picker format 'MM dd,yyyy'). */
export function formatDecibelDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} ${d},${y}`;
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF';
}

const onLoginPage = (page: Page) => /\/login\.aspx/i.test(new URL(page.url()).pathname);

async function signIn(page: Page, creds: DecibelCreds): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  // The language dropdown posts the page back on change, which wipes the password box.
  // Only touch it if English isn't already selected, and do it before filling anything.
  const language = await page.locator(SEL.language).evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex]?.text.trim());
  if (language !== 'English') {
    await Promise.all([page.waitForLoadState('load'), page.waitForEvent('framenavigated'), page.selectOption(SEL.language, { label: 'English' })]);
  }
  await page.fill(SEL.userId, creds.userId);
  await page.fill(SEL.password, creds.password);
  await page.click(SEL.signIn);
  // Success = we leave login.aspx (Decibel goes bpo -> hrms1 login.aspx -> Dashboard).
  const left = await page
    .waitForURL((u) => !/\/login\.aspx/i.test(u.pathname), { timeout: SIGN_IN_TIMEOUT })
    .then(() => true)
    .catch(() => false);
  if (!left) {
    await saveDebugScreenshot(page);
    const shown = await page
      .locator('.alert, .error, [id*="lbl_Msg" i], [id*="Error" i], [class*="error" i]')
      .allInnerTexts()
      .catch(() => [] as string[]);
    const message = shown.map((s) => s.trim()).filter(Boolean).join(' | ').slice(0, 200);
    // Only a message from Decibel means the login was rejected; a page that just hangs means Decibel is struggling.
    if (!message) throw new DecibelUnavailableError(UNAVAILABLE.signIn);
    throw new DecibelAuthError(`Decibel sign-in was rejected: ${message}`);
  }
}

async function setDate(page: Page, selector: string, iso: string): Promise<void> {
  const text = formatDecibelDate(iso);
  await page.fill(selector, text);
  // Let the page's jQuery datepicker (if any) parse the typed value, then close it.
  await page.evaluate(
    ([sel]) => {
      const $ = (window as unknown as { jQuery?: (s: string) => { datepicker?: (cmd: string) => void; trigger: (e: string) => void } }).jQuery;
      const el = $?.(sel);
      try {
        el?.datepicker?.('update');
      } catch {
        /* not a datepicker */
      }
      el?.trigger('change');
    },
    [selector],
  );
  await page.keyboard.press('Escape');
}

/** Wait for the PDF however Decibel delivers it: a download, a new tab, or an inline PDF response. */
function waitForPdf(page: Page): { pdf: Promise<Uint8Array>; dispose: () => void } {
  const context = page.context();
  let resolvePdf!: (b: Uint8Array) => void;
  const pdf = new Promise<Uint8Array>((res) => (resolvePdf = res));

  const onResponse = async (r: Response) => {
    if (!(r.headers()['content-type'] ?? '').toLowerCase().includes('pdf')) return;
    try {
      const body = new Uint8Array(await r.body());
      if (isPdf(body)) resolvePdf(body);
    } catch {
      /* attachment responses are handled by the download listener */
    }
  };
  const onDownload = async (d: import('playwright').Download) => {
    const file = await d.path().catch(() => null);
    if (!file) return;
    const body = new Uint8Array(await readFile(file));
    if (isPdf(body)) resolvePdf(body);
  };
  const watchPage = (p: Page) => p.on('download', onDownload);

  context.on('response', onResponse);
  context.on('page', watchPage);
  watchPage(page);
  return {
    pdf,
    dispose: () => {
      context.off('response', onResponse);
      context.off('page', watchPage);
    },
  };
}

async function saveDebugScreenshot(page: Page): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true });
    await page.screenshot({ path: path.join(dataDir(), 'last-fetch-error.png'), fullPage: true });
  } catch {
    /* best effort */
  }
}

type Browser = import('playwright').Browser;

/** Run `work` in a fresh headless browser, within `max` ms, always closing the browser. Errors come out friendly. */
async function withBrowser<T>(max: number, limitMessage: string, work: (browser: Browser) => Promise<T>): Promise<T> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    return await withDeadline(work(browser), max, limitMessage, () => browser.close());
  } catch (e) {
    throw friendlyError(e);
  } finally {
    await browser.close().catch(() => null);
  }
}

/** Sign in to Decibel and nothing else. Throws DecibelAuthError if the credentials are rejected. */
export async function verifyLogin(creds: DecibelCreds): Promise<void> {
  await withBrowser(LOGIN_MAX, UNAVAILABLE.loginLimit, async (browser) => {
    const page = await (await browser.newContext()).newPage();
    page.setDefaultTimeout(60_000);
    await signIn(page, creds);
  });
}

/** Download the AT_EmpTimeSheet PDF for `from`..`to` ('YYYY-MM-DD'). Read-only toward Decibel. */
export async function downloadTimesheet(from: string, to: string, creds: DecibelCreds): Promise<Uint8Array> {
  return withBrowser(FETCH_MAX, UNAVAILABLE.fetchLimit, async (browser) => {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);

    await signIn(page, creds);

    await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });
    if (onLoginPage(page)) throw new Error('Decibel sent the report page back to sign-in');
    await setDate(page, SEL.from, from);
    await setDate(page, SEL.to, to);

    const watcher = waitForPdf(page);
    let timer: NodeJS.Timeout | undefined;
    let failNow!: (e: Error) => void;
    const failed = new Promise<never>((_, rej) => (failNow = rej));
    page.on('response', (r) => {
      if (r.url().startsWith(REPORT_URL) && r.request().method() === 'POST' && r.status() >= 500) {
        failNow(new DecibelUnavailableError(UNAVAILABLE.serverError(r.status())));
      }
    });
    try {
      // Don't await the click: it waits for the post-back navigation, which never "finishes" when Decibel
      // answers with a PDF or hangs. The PDF watcher and REPORT_TIMEOUT decide instead.
      page.click(SEL.getReport).catch(() => null);
      const timeout = new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new DecibelUnavailableError(UNAVAILABLE.noReport)), REPORT_TIMEOUT);
      });
      return await Promise.race([watcher.pdf, timeout, failed]);
    } catch (e) {
      await saveDebugScreenshot(page);
      throw e;
    } finally {
      clearTimeout(timer);
      watcher.dispose();
    }
  });
}
