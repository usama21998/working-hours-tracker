import type { DayKind, DayResult, DayRow, MonthSummary } from './types';

function classify(r: DayRow, today: string): { kind: DayKind; requiredMin: number; contributionMin: number } {
  const none = (kind: DayKind) => ({ kind, requiredMin: 0, contributionMin: 0 });
  if (r.date > today) return none('future');
  if (r.date === today && r.timeOut === null) return none('today');
  if (r.timeIn !== null && r.timeOut === null) return none('flagged');
  if (r.actualMin !== null) {
    const requiredMin = r.standardMin ?? 0;
    return { kind: requiredMin > 0 ? 'work' : 'extra', requiredMin, contributionMin: r.actualMin - requiredMin };
  }
  if (/leave/i.test(r.remark)) return none('leave');
  if (/absent/i.test(r.remark)) return none('absent');
  return none('off');
}

/**
 * Monthly balance with the user's rules: each attended working day needs its standard hours (9:00),
 * surplus offsets deficit, off-day work counts fully, absent/leave/off days are left out.
 */
export function computeMonth(month: string, rows: DayRow[], today: string): MonthSummary {
  const days: DayResult[] = [];
  let running = 0;
  let workedMin = 0;
  let requiredMin = 0;
  let countedDays = 0;
  let extraDays = 0;
  const flaggedDates: string[] = [];

  const inMonth = rows.filter((r) => r.date.startsWith(`${month}-`)).sort((a, b) => a.date.localeCompare(b.date));
  for (const r of inMonth) {
    const c = classify(r, today);
    running += c.contributionMin;
    if (c.kind === 'work') {
      countedDays++;
      requiredMin += c.requiredMin;
    }
    if (c.kind === 'extra') extraDays++;
    if (c.kind === 'work' || c.kind === 'extra') workedMin += r.actualMin ?? 0;
    if (c.kind === 'flagged') flaggedDates.push(r.date);
    days.push({ ...r, ...c, runningMin: running });
  }

  return { month, days, balanceMin: running, workedMin, requiredMin, countedDays, extraDays, flaggedDates };
}
