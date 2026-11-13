import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCheckIn, loadMonth, loadState, saveCheckIn, saveMonth, saveState } from '@/lib/store';
import type { DayRow } from '@/lib/types';

beforeEach(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'tracker-'));
});

const rows: DayRow[] = [{ date: '2026-11-02', timeIn: '09:50', timeOut: '19:00', standardMin: 540, actualMin: 550, remark: 'Late' }];

describe('store', () => {
  it('round-trips month rows', async () => {
    await saveMonth('2026-11', rows);
    expect(await loadMonth('2026-11')).toEqual(rows);
  });

  it('returns null for a month never saved', async () => {
    expect(await loadMonth('2026-09')).toBeNull();
  });

  it('defaults state when nothing saved, then round-trips', async () => {
    expect(await loadState()).toEqual({ lastSuccessAt: null, lastError: null, lastErrorAt: null, authBlocked: false });
    const s = { lastSuccessAt: '2026-11-12T04:30:00.000Z', lastError: 'x', lastErrorAt: null, authBlocked: true };
    await saveState(s);
    expect(await loadState()).toEqual(s);
  });

  it('keeps check-in only for its own date', async () => {
    await saveCheckIn('2026-11-12', '09:45');
    expect(await loadCheckIn('2026-11-12')).toBe('09:45');
    expect(await loadCheckIn('2026-11-13')).toBeNull();
  });
});
