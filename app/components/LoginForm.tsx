'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function LoginForm({ defaultUserId, next }: { defaultUserId: string; next: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState(defaultUserId);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let result: { ok: boolean; error?: string };
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      result = await res.json();
    } catch {
      result = { ok: false, error: 'Could not reach the tracker server.' };
    }
    if (result.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    setError(result.error ?? 'Sign-in failed.');
    setPassword('');
    setBusy(false);
  }

  const input = 'w-full rounded border border-neutral-500/40 bg-transparent px-3 py-2';

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          User ID
          <input
            className={input}
            name="userId"
            autoComplete="username"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={busy}
            required
            autoFocus={!defaultUserId}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            className={input}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
            autoFocus={!!defaultUserId}
          />
        </label>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-neutral-800 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-200 dark:text-black"
        >
          Log in
        </button>
      </form>

      {busy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-8 py-6 text-center shadow-lg dark:bg-neutral-900">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-800 dark:border-neutral-700 dark:border-t-neutral-100" />
            <p className="font-medium">Signing in and fetching your timesheet…</p>
            <p className="text-sm opacity-60">This can take a couple of minutes.</p>
          </div>
        </div>
      )}
    </>
  );
}
