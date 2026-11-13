import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DecibelCreds } from './decibel';
import { dataDir, writeAtomic } from './store';

export type Cipher = { encrypt(plain: string): Promise<string>; decrypt(enc: string): Promise<string> };

// UTF-8 both ways and no trailing newline keep the round trip exact. The secret goes in on stdin,
// never as an argument, so it can't be seen in the process list.
// Stop on errors: otherwise a failed ConvertTo-SecureString is non-fatal and the script prints ''.
const UTF8 = "$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8;";
const ENCRYPT = `${UTF8} $s=[Console]::In.ReadToEnd(); [Console]::Out.Write((ConvertTo-SecureString $s -AsPlainText -Force | ConvertFrom-SecureString))`;
const DECRYPT = `${UTF8} $e=[Console]::In.ReadToEnd().Trim(); [Console]::Out.Write([System.Net.NetworkCredential]::new('', (ConvertTo-SecureString $e)).Password)`;

function powershell(script: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    const out: Buffer[] = [];
    ps.stdout.on('data', (b: Buffer) => out.push(b));
    ps.on('error', reject);
    ps.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
      else reject(new Error(`PowerShell exited with code ${code}`));
    });
    ps.stdin.end(Buffer.from(input, 'utf8'));
  });
}

/** Windows DPAPI, current-user scope: only this Windows user on this PC can decrypt. */
export const dpapi: Cipher = {
  encrypt: (plain) => powershell(ENCRYPT, plain),
  decrypt: (enc) => powershell(DECRYPT, enc),
};

type Stored = { userId: string; password: string };

const file = () => path.join(dataDir(), 'credentials.json');

async function readStored(): Promise<Stored | null> {
  try {
    const s = JSON.parse(await readFile(file(), 'utf8')) as Partial<Stored>;
    return typeof s.userId === 'string' && s.userId && typeof s.password === 'string' && s.password
      ? { userId: s.userId, password: s.password }
      : null;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: DecibelCreds, cipher: Cipher = dpapi): Promise<void> {
  const encrypted = await cipher.encrypt(creds.password);
  if (!encrypted) throw new Error('Could not encrypt the password');
  const stored: Stored = { userId: creds.userId, password: encrypted };
  await writeAtomic(file(), JSON.stringify(stored, null, 2));
}

/** The saved login, or null if there is none or it can't be decrypted (e.g. copied from another PC). */
export async function loadCredentials(cipher: Cipher = dpapi): Promise<DecibelCreds | null> {
  const s = await readStored();
  if (!s) return null;
  try {
    const password = await cipher.decrypt(s.password);
    return password ? { userId: s.userId, password } : null;
  } catch {
    return null;
  }
}

/** Cheap check for pages: is a login saved? Does not decrypt. */
export async function hasCredentials(): Promise<boolean> {
  return (await readStored()) !== null;
}

export async function loadUserId(): Promise<string | null> {
  return (await readStored())?.userId ?? null;
}
