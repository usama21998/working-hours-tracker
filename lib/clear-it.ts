import { clockToMin, minToClock } from './time';
import type { ClearIt, MonthSummary } from './types';

const DEFAULT_DAY_MIN = 540;

/** Mon–Fri dates in `today`'s month strictly after `today` (dates are 'YYYY-MM-DD'). */
function weekdaysAfter(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let day = d + 1; day <= lastDay; day++) {
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** What it takes to bring a negative month balance back to zero. */
export function computeClearIt(summary: MonthSummary, today: string, checkIn: string | null): ClearIt {
  const remainingDays = weekdaysAfter(today);
  if (summary.balanceMin >= 0) {
    return { leaveBy: null, perDayMin: null, remainingDays, surplusMin: summary.balanceMin };
  }
  const deficit = -summary.balanceMin;
  const todayRequired = summary.days.find((d) => d.date === today)?.standardMin ?? DEFAULT_DAY_MIN;
  return {
    leaveBy: checkIn ? minToClock(clockToMin(checkIn) + todayRequired + deficit) : null,
    perDayMin: remainingDays > 0 ? Math.ceil(deficit / remainingDays) : null,
    remainingDays,
    surplusMin: null,
  };
}
