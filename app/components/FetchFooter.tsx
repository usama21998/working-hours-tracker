'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { FetchState } from '@/lib/types';
import { useFetching } from './FetchContext';

function when(iso: string | null): string {
  // Fixed locale/options so server and browser render identical text (both run on this PC's time zone).
  return iso
    ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Never';
}

export function FetchFooter({ state, month, monthTitle }: { state: FetchState; month: string; monthTitle: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { fetching, setFetching } = useFetching();
  const [refreshing, startRefresh] = useTransition();
  const busy = fetching || refreshing;

  async function fetchNow() {
    setFetching(true);
    try {
      await fetch(`/api/fetch?month=${month}`, { method: 'POST' }).catch(() => null);
      // Keep the loader up until the refreshed data is on screen.
      startRefresh(() => router.refresh());
    } finally {
      setFetching(false);
    }
  }

  return (
    <>
      <footer className="mt-6 flex flex-wrap items-center gap-3 border-t border-neutral-500/30 pt-3 text-sm">
        <span className="opacity-70">Last fetched from Decibel: {when(state.lastSuccessAt)}</span>
        {state.lastError && (
          <span className="text-red-600 dark:text-red-400" role="alert">
            {state.lastError} ({when(state.lastErrorAt)})
          </span>
        )}
        <a href={`/login?next=${pathname}`} className="ml-auto text-xs opacity-70 hover:opacity-100">
          Change login
        </a>
        <button
          type="button"
          onClick={fetchNow}
          disabled={busy}
          className="rounded bg-neutral-800 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-200 dark:text-black"
        >
          {busy ? 'Fetching…' : 'Fetch now'}
        </button>
      </footer>

      {busy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-8 py-6 text-center shadow-lg dark:bg-neutral-900">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-800 dark:border-neutral-700 dark:border-t-neutral-100" />
            <p className="font-medium">Fetching {monthTitle} from Decibel…</p>
            <p className="text-sm opacity-60">This can take a minute or two.</p>
          </div>
        </div>
      )}
    </>
  );
}
