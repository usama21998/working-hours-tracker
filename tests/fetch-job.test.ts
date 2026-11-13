import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_PDF, hasFixture } from './fixture';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DecibelAuthError } from '@/lib/decibel';
import { AUTH_MESSAGE, NOT_SIGNED_IN, runFetch } from '@/lib/fetch-job';
import { loadMonth, loadState, saveMonth } from '@/lib/store';

let octPdf: Uint8Array;
const creds = { userId: 'test-user', password: 'test-pass' };
const NOW = new Date(2026, 10, 12, 9, 30); // 12 Nov 2026 09:30 local

beforeAll(async () => {
  if (hasFixture) octPdf = new Uint8Array(await readFile(FIXTURE_PDF));
});
beforeEach(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'tracker-'));
});

describe('runFetch', () => {
  it.skipIf(!hasFixture)('saves parsed months and records success', async () => {
    const download = vi.fn().mockResolvedValue(octPdf);
    const s = await runFetch({ manual: false, now: NOW, download, creds });
    expect(download).toHaveBeenCalledWith('2026-11-01', '2026-11-12', creds);
    expect(await loadMonth('2026-10')).toHaveLength(31);
    expect(s).toMatchObject({ lastSuccessAt: NOW.toISOString(), lastError: null, authBlocked: false });
  });

  it('auth-failure-blocks-schedule', async () => {
    const bad = vi.fn().mockRejectedValue(new DecibelAuthError());
    const s = await runFetch({ manual: false, now: NOW, download: bad, creds });
    expect(s.authBlocked).toBe(true);
    expect(s.lastError).toBe(AUTH_MESSAGE);
    expect(AUTH_MESSAGE).toBe('Decibel sign-in failed. Log in again with your Decibel account.');

    const next = vi.fn().mockResolvedValue(octPdf);
    await runFetch({ manual: false, now: NOW, download: next, creds });
    expect(next).not.toHaveBeenCalled();
  });

  it.skipIf(!hasFixture)('manual-fetch-clears-block', async () => {
    await runFetch({ manual: false, now: NOW, download: vi.fn().mockRejectedValue(new DecibelAuthError()), creds });
    const ok = vi.fn().mockResolvedValue(octPdf);
    const s = await runFetch({ manual: true, now: NOW, download: ok, creds });
    expect(ok).toHaveBeenCalled();
    expect(s.authBlocked).toBe(false);
  });

  it('other errors keep previous data and do not block', async () => {
    await saveMonth('2026-11', []);
    const s = await runFetch({ manual: false, now: NOW, download: vi.fn().mockRejectedValue(new Error('timeout')), creds });
    expect(s).toMatchObject({ lastError: 'timeout', authBlocked: false, lastErrorAt: NOW.toISOString() });
    expect(await loadMonth('2026-11')).toEqual([]);
  });

  it('missing credentials block without calling Decibel', async () => {
    const download = vi.fn();
    const s = await runFetch({ manual: false, now: NOW, download, creds: { userId: '', password: '' } });
    expect(download).not.toHaveBeenCalled();
    expect(s).toMatchObject({ authBlocked: true, lastError: NOT_SIGNED_IN });
  });

  it('not signed in', async () => {
    const download = vi.fn();
    const s = await runFetch({ manual: true, now: NOW, download });
    expect(download).not.toHaveBeenCalled();
    expect(s).toMatchObject({ authBlocked: true, lastError: NOT_SIGNED_IN });
    expect(NOT_SIGNED_IN).toBe('Not signed in. Open the tracker and log in with your Decibel account.');
  });

  it.skipIf(!hasFixture)('first-of-month-refetches-previous', async () => {
    const download = vi.fn().mockResolvedValue(octPdf);
    await runFetch({ manual: false, now: new Date(2026, 11, 1, 9, 30), download, creds });
    expect(download).toHaveBeenCalledWith('2026-12-01', '2026-12-01', creds);
    expect(download).toHaveBeenCalledWith('2026-11-01', '2026-11-30', creds);
  });

  it.skipIf(!hasFixture)('fetches a whole past month when one is requested', async () => {
    const download = vi.fn().mockResolvedValue(octPdf);
    await runFetch({ manual: true, now: NOW, download, creds, month: '2026-09' });
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith('2026-09-01', '2026-09-30', creds);
  });

  it.skipIf(!hasFixture)('requesting the current month fetches up to today', async () => {
    const download = vi.fn().mockResolvedValue(octPdf);
    await runFetch({ manual: true, now: NOW, download, creds, month: '2026-11' });
    expect(download).toHaveBeenCalledWith('2026-11-01', '2026-11-12', creds);
  });

  it('refuses a future month without calling Decibel', async () => {
    const download = vi.fn();
    const s = await runFetch({ manual: true, now: NOW, download, creds, month: '2026-12' });
    expect(download).not.toHaveBeenCalled();
    expect(s.lastError).toBe('Cannot fetch 2026-12: it has not started yet.');
  });

  it('never stores the password', async () => {
    await runFetch({ manual: false, now: NOW, download: vi.fn().mockRejectedValue(new Error('fill("test-pass") timed out')), creds });
    const saved = JSON.stringify(await loadState());
    expect(saved).not.toContain('test-pass');
    expect(saved).toContain('timed out');
  });
});
