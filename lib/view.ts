import { computeMonth } from './balance';
import { computeClearIt } from './clear-it';
import { loadCheckIn, loadMonth, loadState } from './store';
import type { MonthView } from './types';

/**
 * Everything the page needs for one month. `today` is 'YYYY-MM-DD' in local time; `nowMin` (minutes since
 * local midnight) makes today's hours count live from check-in until Decibel has the real check-out.
 */
export async function getMonthView(month: string, today: string, nowMin?: number): Promise<MonthView> {
  const [rows, state] = await Promise.all([loadMonth(month), loadState()]);
  if (!rows) return { empty: true, month, state };

  if (!today.startsWith(`${month}-`)) {
    return { empty: false, month, summary: computeMonth(month, rows, today), clearIt: null, checkIn: null, state };
  }

  const checkIn = (await loadCheckIn(today)) ?? rows.find((r) => r.date === today)?.timeIn ?? null;
  const summary = computeMonth(month, rows, today, nowMin === undefined ? undefined : { checkIn, nowMin });
  return { empty: false, month, summary, clearIt: computeClearIt(summary, today, checkIn), checkIn, state };
}
