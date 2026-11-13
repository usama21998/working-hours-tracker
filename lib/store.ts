import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DayRow, FetchState } from './types';

export function dataDir(): string {
  return process.env.DATA_DIR ?? 'data';
}

export async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

const monthFile = (month: string) => path.join(dataDir(), 'months', `${month}.json`);
const stateFile = () => path.join(dataDir(), 'state.json');
const checkInFile = () => path.join(dataDir(), 'checkin.json');

export async function saveMonth(month: string, rows: DayRow[]): Promise<void> {
  await writeAtomic(monthFile(month), JSON.stringify(rows, null, 2));
}

export async function loadMonth(month: string): Promise<DayRow[] | null> {
  return readJson<DayRow[]>(monthFile(month));
}

export async function savePdf(name: string, pdf: Uint8Array): Promise<void> {
  await writeAtomic(path.join(dataDir(), 'pdfs', name), pdf);
}

const EMPTY_STATE: FetchState = { lastSuccessAt: null, lastError: null, lastErrorAt: null, authBlocked: false };

export async function loadState(): Promise<FetchState> {
  return { ...EMPTY_STATE, ...((await readJson<FetchState>(stateFile())) ?? {}) };
}

export async function saveState(s: FetchState): Promise<void> {
  await writeAtomic(stateFile(), JSON.stringify(s, null, 2));
}

export async function saveCheckIn(date: string, time: string): Promise<void> {
  await writeAtomic(checkInFile(), JSON.stringify({ date, time }));
}

export async function loadCheckIn(date: string): Promise<string | null> {
  const c = await readJson<{ date: string; time: string }>(checkInFile());
  return c && c.date === date ? c.time : null;
}
