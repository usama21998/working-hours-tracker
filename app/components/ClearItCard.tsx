'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatHHMM } from '@/lib/time';
import type { ClearIt } from '@/lib/types';

export function ClearItCard({ clearIt, checkIn, compact = false }: { clearIt: ClearIt; checkIn: string | null; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(checkIn ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ time: value }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? 'Could not save');
      return;
    }
    router.refresh();
  }

  return (
    <section className={`flex-1 rounded-xl bg-neutral-500/10 ${compact ? 'p-3' : 'p-5'}`} aria-label="To clear it">
      <div className="text-sm opacity-70">{clearIt.surplusMin !== null ? 'You are ahead' : 'To clear it'}</div>

      {clearIt.surplusMin !== null ? (
        <div className={`${compact ? 'text-lg' : 'text-2xl'} font-semibold`}>{formatHHMM(clearIt.surplusMin)} ahead</div>
      ) : (
        <>
          <div className={`${compact ? 'text-lg' : 'text-2xl'} font-semibold`}>
            {clearIt.leaveBy ? `Leave by ${clearIt.leaveBy} today` : "Enter today's check-in to see your leave time"}
          </div>
          {clearIt.perDayMin !== null && (
            <div className="mt-1 text-sm opacity-80">
              or +{clearIt.perDayMin} min/day for the {clearIt.remainingDays} remaining weekdays
            </div>
          )}
        </>
      )}

      <form onSubmit={save} className={`${compact ? 'mt-2' : 'mt-4'} flex items-center gap-2 text-sm`}>
        <label htmlFor="checkin">Today&apos;s check-in</label>
        <input
          id="checkin"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="09:45"
          inputMode="numeric"
          className="w-20 rounded border border-neutral-400 bg-transparent px-2 py-1 tabular-nums"
        />
        <button type="submit" disabled={saving} className="rounded bg-neutral-800 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-200 dark:text-black">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </section>
  );
}
