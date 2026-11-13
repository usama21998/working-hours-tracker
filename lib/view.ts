import { computeMonth } from './balance';
import { computeClearIt } from './clear-it';
import { loadCheckIn, loadMonth, loadState } from './store';
import type { MonthView } from './types';

/** Everything the page needs for one month. `today` is 'YYYY-MM-DD' in local time. */
export async function getMonthView(month: string, today: string): Promise<MonthView> {
  const [rows, state] = await Promise.all([loadMonth(month), loadState()]);
  if (!rows) return { empty: true, month, state };

  const summary = computeMonth(month, rows, today);
  if (!today.startsWith(`${month}-`)) return { empty: false, month, summary, clearIt: null, checkIn: null, state };

  const checkIn = (await loadCheckIn(today)) ?? rows.find((r) => r.date === today)?.timeIn ?? null;
  return { empty: false, month, summary, clearIt: computeClearIt(summary, today, checkIn), checkIn, state };
}
