import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { POST } from '@/app/api/checkin/route';
import { loadCheckIn } from '@/lib/store';
import { localDateISO } from '@/lib/time';

beforeEach(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'tracker-'));
});

const post = (body: unknown) =>
  POST(new Request('http://127.0.0.1/api/checkin', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/checkin', () => {
  it.each(['25:00', '9.5', '', 'abc'])('checkin-route-rejects %j', async (time) => {
    const res = await post({ time });
    expect(res.status).toBe(400);
    expect(await loadCheckIn(localDateISO(new Date()))).toBeNull();
  });

  it('stores a valid time for today, zero-padded', async () => {
    const res = await post({ time: '9:45' });
    expect(res.status).toBe(200);
    expect(await loadCheckIn(localDateISO(new Date()))).toBe('09:45');
  });
});
