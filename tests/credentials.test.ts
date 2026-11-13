import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dpapi, hasCredentials, loadCredentials, loadUserId, saveCredentials, type Cipher } from '@/lib/credentials';

const fake: Cipher = {
  encrypt: async (s) => 'enc:' + s,
  decrypt: async (s) => {
    if (!s.startsWith('enc:')) throw new Error('bad');
    return s.slice(4);
  },
};

const file = () => path.join(process.env.DATA_DIR!, 'credentials.json');

beforeEach(async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'tracker-'));
});

describe('credentials', () => {
  it('round-trips with a cipher', async () => {
    await saveCredentials({ userId: 'u1', password: 'p1' }, fake);
    expect(await loadCredentials(fake)).toEqual({ userId: 'u1', password: 'p1' });
    expect(JSON.parse(await readFile(file(), 'utf8')).password).toBe('enc:p1');
    expect(await hasCredentials()).toBe(true);
    expect(await loadUserId()).toBe('u1');
  });

  it('missing file', async () => {
    expect(await loadCredentials(fake)).toBeNull();
    expect(await hasCredentials()).toBe(false);
    expect(await loadUserId()).toBeNull();
  });

  it('undecryptable file is not signed in', async () => {
    await writeFile(file(), JSON.stringify({ userId: 'u1', password: 'garbage' }));
    expect(await loadCredentials(fake)).toBeNull();
  });

  it('corrupt json', async () => {
    await writeFile(file(), 'not json');
    expect(await loadCredentials(fake)).toBeNull();
    expect(await hasCredentials()).toBe(false);
  });

  it.runIf(process.platform === 'win32')(
    'dpapi round-trips awkward passwords',
    async () => {
      for (const p of [`p@ss "w'rd" $x \`ü`, 'simple']) {
        const enc = await dpapi.encrypt(p);
        expect(enc).not.toContain(p);
        expect(await dpapi.decrypt(enc)).toBe(p);
      }
    },
    20_000,
  );

  it.runIf(process.platform === 'win32')(
    'dpapi rejects text it cannot decrypt',
    async () => {
      await expect(dpapi.decrypt('garbage')).rejects.toThrow();
    },
    20_000,
  );

  it('empty decrypt result is not signed in', async () => {
    await saveCredentials({ userId: 'u1', password: 'p1' }, fake);
    expect(await loadCredentials({ ...fake, decrypt: async () => '' })).toBeNull();
  });

  it('refuses to save an empty encryption result', async () => {
    await expect(saveCredentials({ userId: 'u1', password: 'p1' }, { ...fake, encrypt: async () => '' })).rejects.toThrow();
    expect(await hasCredentials()).toBe(false);
  });
});
