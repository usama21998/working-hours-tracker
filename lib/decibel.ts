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
    throw new DecibelAuthError(message ? `Decibel sign-in was rejected: ${message}` : undefined);
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

/** Sign in to Decibel and nothing else. Throws DecibelAuthError if the credentials are rejected. */
export async function verifyLogin(creds: DecibelCreds): Promise<void> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    page.setDefaultTimeout(60_000);
    await signIn(page, creds);
  } finally {
    await browser.close();
  }
}

/** Download the AT_EmpTimeSheet PDF for `from`..`to` ('YYYY-MM-DD'). Read-only toward Decibel. */
export async function downloadTimesheet(from: string, to: string, creds: DecibelCreds): Promise<Uint8Array> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);

    await signIn(page, creds);

    await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });
    if (onLoginPage(page)) throw new Error('Decibel sent the report page back to sign-in');
    await setDate(page, SEL.from, from);
    await setDate(page, SEL.to, to);

    const watcher = waitForPdf(page);
    let serverError: number | null = null;
    page.on('response', (r) => {
      if (r.url().startsWith(REPORT_URL) && r.request().method() === 'POST' && r.status() >= 500) serverError = r.status();
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      await page.click(SEL.getReport);
      const timeout = new Promise<never>((_, rej) => {
        timer = setTimeout(
          () => rej(new Error(serverError ? `Decibel report failed (HTTP ${serverError})` : 'Decibel did not return a PDF')),
          REPORT_TIMEOUT,
        );
      });
      return await Promise.race([watcher.pdf, timeout]);
    } catch (e) {
      await saveDebugScreenshot(page);
      throw e;
    } finally {
      clearTimeout(timer);
      watcher.dispose();
    }
  } finally {
    await browser.close();
  }
}
