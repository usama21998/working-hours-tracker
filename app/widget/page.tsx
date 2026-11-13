import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasCredentials } from '@/lib/credentials';
import { Suspense } from 'react';
import { getMonthView } from '@/lib/view';
import { localDateISO, minutesOfDay } from '@/lib/time';
import { AutoRefresh } from '../components/AutoRefresh';
import { BalanceCard } from '../components/BalanceCard';
import { Calendar } from '../components/Calendar';
import { ClearItCard } from '../components/ClearItCard';
import { FetchProvider } from '../components/FetchContext';
import { FetchFooter } from '../components/FetchFooter';

export const metadata: Metadata = { title: 'Hours' };

/** Compact view of the current month for the small desktop window (scripts/start-widget.ps1). */
async function Widget() {
  await connection(); // "today" must be computed per request, never prerendered
  const now = new Date();
  const today = localDateISO(now);
  const month = today.slice(0, 7);
  const view = await getMonthView(month, today, minutesOfDay(now));
  if (!(await hasCredentials()) || view.state.authBlocked) redirect('/login?next=/widget');
  const title = new Date(`${month}-01T00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <FetchProvider>
      <AutoRefresh minutes={1} />
      <header className="mb-2 flex items-center justify-between">
        <h1 className="font-semibold">{title}</h1>
        <a href="/" target="_blank" rel="noreferrer" className="text-xs opacity-60 hover:opacity-100">
          Full view ↗
        </a>
      </header>

      {view.empty ? (
        <p className="rounded-xl bg-neutral-500/10 p-4 text-center text-sm">No data for this month yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <BalanceCard summary={view.summary} compact />
          {view.clearIt && <ClearItCard clearIt={view.clearIt} checkIn={view.checkIn} compact />}
          <Calendar month={month} days={view.summary.days} today={today} compact />
        </div>
      )}

      <FetchFooter state={view.state} month={month} monthTitle={title} />
    </FetchProvider>
  );
}

export default function WidgetPage() {
  return (
    <main className="w-full px-3 py-3 text-sm">
      <Suspense fallback={<p className="opacity-60">Loading…</p>}>
        <Widget />
      </Suspense>
    </main>
  );
}
