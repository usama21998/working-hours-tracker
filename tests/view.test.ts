import { beforeEach, describe, expect, it } from 'vitest';
import { FIXTURE_PDF, hasFixture } from './fixture';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseTimesheet } from '@/lib/parse-timesheet';
import { saveCheckIn, saveMonth } from '@/lib/store';
import { getMonthView } from '@/lib/view';

beforeEach(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'tracker-'));
});

describe('getMonthView', () => {
  it('view-empty-month: nothing stored', async () => {
    const v = await getMonthView('2026-09', '2026-11-12');
    expect(v.empty).toBe(true);
  });

  it.skipIf(!hasFixture)('past month: summary without clear-it', async () => {
    const bytes = await readFile(FIXTURE_PDF);
    await saveMonth('2026-10', (await parseTimesheet(new Uint8Array(bytes))).rows);
    const v = await getMonthView('2026-10', '2026-11-12');
    if (v.empty) throw new Error('expected data');
    expect(v.summary.balanceMin).toBe(-147);
    expect(v.clearIt).toBeNull();
  });

  it('current month: clear-it uses stored check-in', async () => {
    await saveMonth('2026-11', [
      { date: '2026-11-11', timeIn: '10:00', timeOut: '18:00', standardMin: 540, actualMin: 480, remark: '' },
    ]);
    await saveCheckIn('2026-11-12', '09:30');
    const v = await getMonthView('2026-11', '2026-11-12');
    if (v.empty) throw new Error('expected data');
    expect(v.checkIn).toBe('09:30');
    expect(v.clearIt?.leaveBy).toBe('19:30'); // 09:30 + 9:00 + 1:00
  });

  it('current month: falls back to today\'s time-in from Decibel', async () => {
    await saveMonth('2026-11', [
      { date: '2026-11-12', timeIn: '10:10', timeOut: null, standardMin: 540, actualMin: null, remark: '' },
    ]);
    const v = await getMonthView('2026-11', '2026-11-12');
    if (v.empty) throw new Error('expected data');
    expect(v.checkIn).toBe('10:10');
  });
});

describe('getMonthView live today', () => {
  it('counts today up to now from the saved check-in while Decibel has no check-out', async () => {
    await saveMonth('2026-11', [
      { date: '2026-11-11', timeIn: '10:00', timeOut: '18:00', standardMin: 540, actualMin: 480, remark: '' },
    ]);
    await saveCheckIn('2026-11-12', '09:30');
    const v = await getMonthView('2026-11', '2026-11-12', 16 * 60 + 30); // now 16:30 -> 7:00 worked
    if (v.empty) throw new Error('expected data');
    expect(v.summary.balanceMin).toBe(-60 - 120);
    expect(v.clearIt?.leaveBy).toBe('19:30');
  });
});
