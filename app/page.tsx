import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { hasCredentials } from '@/lib/credentials';
import { Suspense } from 'react';
import { getMonthView } from '@/lib/view';
import { localDateISO } from '@/lib/time';
import { BalanceCard } from './components/BalanceCard';
import { Calendar } from './components/Calendar';
import { ClearItCard } from './components/ClearItCard';
import { FetchProvider } from './components/FetchContext';
import { FetchFooter } from './components/FetchFooter';
import { MonthNav } from './components/MonthNav';

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

async function Tracker({ searchParams }: { searchParams: PageProps<'/'>['searchParams'] }) {
  const sp = await searchParams;
  await connection(); // "today" must be computed per request, never prerendered
  const today = localDateISO(new Date());
  const month = typeof sp.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const view = await getMonthView(month, today);
  if (!(await hasCredentials()) || view.state.authBlocked) redirect('/login?next=/');

  const title = monthName(month);

  return (
    <FetchProvider>
      <MonthNav title={title} prevHref={`/?month=${shiftMonth(month, -1)}`} nextHref={`/?month=${shiftMonth(month, 1)}`} />

      {view.empty ? (
        <p className="rounded-xl bg-neutral-500/10 p-6 text-center">No data for this month yet.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <BalanceCard summary={view.summary} />
            {view.clearIt && <ClearItCard clearIt={view.clearIt} checkIn={view.checkIn} />}
          </div>
          <Calendar month={month} days={view.summary.days} today={today} />
          {view.summary.flaggedDates.length > 0 && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              No check-out recorded: {view.summary.flaggedDates.join(', ')}
            </p>
          )}
        </>
      )}

      <FetchFooter state={view.state} month={month} monthTitle={title} />
    </FetchProvider>
  );
}

export default function Page({ searchParams }: PageProps<'/'>) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Suspense fallback={<p className="opacity-60">Loading…</p>}>
        <Tracker searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
