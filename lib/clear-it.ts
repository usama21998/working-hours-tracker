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

/**
 * What it takes to bring a negative month balance back to zero. Works from the balance before today,
 * so today's live hours (still at work) are not counted twice.
 */
export function computeClearIt(summary: MonthSummary, today: string, checkIn: string | null): ClearIt {
  const remainingDays = weekdaysAfter(today);
  const todayDay = summary.days.find((d) => d.date === today);
  const beforeToday = summary.balanceMin - (todayDay?.kind === 'today' ? todayDay.contributionMin : 0);
  if (beforeToday >= 0) {
    return { leaveBy: null, perDayMin: null, remainingDays, surplusMin: beforeToday };
  }
  const deficit = -beforeToday;
  const todayRequired = todayDay?.standardMin ?? DEFAULT_DAY_MIN;
  return {
    leaveBy: checkIn ? minToClock(clockToMin(checkIn) + todayRequired + deficit) : null,
    perDayMin: remainingDays > 0 ? Math.ceil(deficit / remainingDays) : null,
    remainingDays,
    surplusMin: null,
  };
}
