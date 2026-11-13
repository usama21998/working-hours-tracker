import { clockToMin } from './time';
import type { DayKind, DayResult, DayRow, MonthSummary } from './types';

const DEFAULT_DAY_MIN = 540;

/** Today's check-in and the current local time, so today's hours count live until the real check-out arrives. */
export type LiveToday = { checkIn: string | null; nowMin: number };

type Classified = { kind: DayKind; requiredMin: number; contributionMin: number; timeIn: string | null; actualMin: number | null };

function classify(r: DayRow, today: string, live?: LiveToday): Classified {
  const none = (kind: DayKind): Classified => ({ kind, requiredMin: 0, contributionMin: 0, timeIn: r.timeIn, actualMin: r.actualMin });
  if (r.date > today) return none('future');
  if (r.date === today && r.timeOut === null) {
    if (!live?.checkIn) return none('today');
    // Still at work: treat "now" as the check-out time.
    const actualMin = Math.max(0, live.nowMin - clockToMin(live.checkIn));
    const requiredMin = r.standardMin ?? 0;
    return { kind: 'today', requiredMin, contributionMin: actualMin - requiredMin, timeIn: live.checkIn, actualMin };
  }
  if (r.timeIn !== null && r.timeOut === null) return none('flagged');
  if (r.actualMin !== null) {
    const requiredMin = r.standardMin ?? 0;
    return { kind: requiredMin > 0 ? 'work' : 'extra', requiredMin, contributionMin: r.actualMin - requiredMin, timeIn: r.timeIn, actualMin: r.actualMin };
  }
  if (/leave/i.test(r.remark)) return none('leave');
  if (/absent/i.test(r.remark)) return none('absent');
  return none('off');
}

/** A placeholder row for today when Decibel has nothing yet (e.g. it is down) but a check-in is known. */
function todayRow(today: string): DayRow {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const weekday = dow !== 0 && dow !== 6;
  return { date: today, timeIn: null, timeOut: null, standardMin: weekday ? DEFAULT_DAY_MIN : null, actualMin: null, remark: '' };
}

/**
 * Monthly balance with the user's rules: each attended working day needs its standard hours (9:00),
 * surplus offsets deficit, off-day work counts fully, absent/leave/off days are left out.
 * With `live`, today (no check-out yet) counts from check-in until now.
 */
export function computeMonth(month: string, rows: DayRow[], today: string, live?: LiveToday): MonthSummary {
  const days: DayResult[] = [];
  let running = 0;
  let workedMin = 0;
  let requiredMin = 0;
  let countedDays = 0;
  let extraDays = 0;
  const flaggedDates: string[] = [];

  const inMonth = rows.filter((r) => r.date.startsWith(`${month}-`));
  if (live?.checkIn && today.startsWith(`${month}-`) && !inMonth.some((r) => r.date === today)) inMonth.push(todayRow(today));
  inMonth.sort((a, b) => a.date.localeCompare(b.date));

  for (const r of inMonth) {
    const c = classify(r, today, live);
    running += c.contributionMin;
    const counts = c.kind === 'work' || c.kind === 'extra' || (c.kind === 'today' && c.actualMin !== null);
    if (counts) {
      workedMin += c.actualMin ?? 0;
      if (c.requiredMin > 0) {
        countedDays++;
        requiredMin += c.requiredMin;
      } else {
        extraDays++;
      }
    }
    if (c.kind === 'flagged') flaggedDates.push(r.date);
    days.push({ ...r, ...c, runningMin: running });
  }

  return { month, days, balanceMin: running, workedMin, requiredMin, countedDays, extraDays, flaggedDates };
}
