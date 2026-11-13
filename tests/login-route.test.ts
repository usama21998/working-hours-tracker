import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

vi.mock('@/lib/decibel', async (orig) => ({ ...(await orig<typeof import('@/lib/decibel')>()), verifyLogin: vi.fn() }));
vi.mock('@/lib/fetch-job', () => ({ runFetch: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/credentials', async (orig) => {
  const m = await orig<typeof import('@/lib/credentials')>();
  const fake = { encrypt: async (s: string) => 'enc:' + s, decrypt: async (s: string) => s.slice(4) };
  return {
    ...m,
    saveCredentials: (c: { userId: string; password: string }) => m.saveCredentials(c, fake),
    loadCredentials: () => m.loadCredentials(fake),
  };
});

import { POST } from '@/app/api/login/route';
import { hasCredentials, loadCredentials } from '@/lib/credentials';
import { DecibelAuthError, DecibelUnavailableError, verifyLogin } from '@/lib/decibel';
import { runFetch } from '@/lib/fetch-job';
import { loadState, saveState } from '@/lib/store';

const verify = vi.mocked(verifyLogin);

beforeEach(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'tracker-'));
  vi.clearAllMocks();
});

const post = (body: unknown) =>
  POST(new Request('http://127.0.0.1/api/login', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/login', () => {
  it.each([
    { userId: '  ', password: 'x' },
    { userId: 'u', password: '' },
  ])('rejects empty fields %j', async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Enter your Decibel User ID and password.' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejected sign-in saves nothing', async () => {
    verify.mockRejectedValue(new DecibelAuthError('Decibel sign-in was rejected: Invalid password'));
    const res = await post({ userId: 'u1', password: 'p1' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'Decibel sign-in was rejected: Invalid password' });
    expect(await hasCredentials()).toBe(false);
  });

  it('Decibel down is 503 with a plain message', async () => {
    verify.mockRejectedValue(new DecibelUnavailableError('Decibel is down.'));
    const res = await post({ userId: 'u1', password: 'p1' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'Decibel is down.' });
    expect(await hasCredentials()).toBe(false);
  });

  it('network error is 502 and scrubbed', async () => {
    verify.mockRejectedValue(new Error('timeout for secret-pw'));
    const res = await post({ userId: 'u1', password: 'secret-pw' });
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toContain('Could not reach Decibel:');
    expect(error).toContain('***');
    expect(error).not.toContain('secret-pw');
    expect(await hasCredentials()).toBe(false);
  });

  it('success saves trimmed id and unblocks', async () => {
    await saveState({ lastSuccessAt: '2026-11-01T00:00:00.000Z', lastError: 'x', lastErrorAt: 'y', authBlocked: true });
    verify.mockResolvedValue(undefined);
    const res = await post({ userId: ' u1 ', password: ' p 1 ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith({ userId: 'u1', password: ' p 1 ' });
    expect(await loadCredentials()).toEqual({ userId: 'u1', password: ' p 1 ' });
    expect(await loadState()).toEqual({
      lastSuccessAt: '2026-11-01T00:00:00.000Z',
      lastError: null,
      lastErrorAt: null,
      authBlocked: false,
    });
    expect(runFetch).toHaveBeenCalledWith({ manual: true });
  });

  it('waits for the first fetch before answering', async () => {
    verify.mockResolvedValue(undefined);
    let finish!: () => void;
    vi.mocked(runFetch).mockReturnValueOnce(new Promise((res) => (finish = () => res({} as never))));
    let answered = false;
    const res = post({ userId: 'u1', password: 'p1' }).then((r) => ((answered = true), r));
    await vi.waitFor(() => expect(runFetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(answered).toBe(false);
    finish();
    expect((await res).status).toBe(200);
  });

  it('a failed first fetch still logs you in', async () => {
    verify.mockResolvedValue(undefined);
    vi.mocked(runFetch).mockRejectedValueOnce(new Error('Decibel did not return a PDF'));
    const res = await post({ userId: 'u1', password: 'p1' });
    expect(res.status).toBe(200);
    expect(await hasCredentials()).toBe(true);
  });
});
