import { describe, expect, it } from 'vitest';
import { computeClearIt } from '@/lib/clear-it';
import type { DayResult, MonthSummary } from '@/lib/types';

const summary = (balanceMin: number, days: DayResult[] = []): MonthSummary => ({
  month: '2026-11', days, balanceMin, workedMin: 0, requiredMin: 0, countedDays: 0, extraDays: 0, flaggedDates: [],
});

describe('computeClearIt', () => {
  it('deficit with check-in: leave time and per-day catch-up', () => {
    // 09:45 + 9:00 + 2:27 = 21:12; weekdays after Thu Nov 12: 13, 16-20, 23-27, 30 = 12; ceil(147/12) = 13
    expect(computeClearIt(summary(-147), '2026-11-12', '09:45')).toEqual({
      leaveBy: '21:12', perDayMin: 13, remainingDays: 12, surplusMin: null,
    });
  });

  it('deficit without check-in: no leave time, still per-day', () => {
    expect(computeClearIt(summary(-147), '2026-11-12', null)).toEqual({
      leaveBy: null, perDayMin: 13, remainingDays: 12, surplusMin: null,
    });
  });

  it('uses today\'s standard hours when Decibel has them', () => {
    const today: DayResult = {
      date: '2026-11-12', timeIn: null, timeOut: null, standardMin: 480, actualMin: null, remark: '',
      kind: 'today', requiredMin: 0, contributionMin: 0, runningMin: -60,
    };
    expect(computeClearIt(summary(-60, [today]), '2026-11-12', '09:00').leaveBy).toBe('18:00');
  });

  it('surplus: shows how far ahead', () => {
    expect(computeClearIt(summary(30), '2026-11-12', '09:45')).toEqual({
      leaveBy: null, perDayMin: null, remainingDays: 12, surplusMin: 30,
    });
  });

  it('last weekday of the month: no per-day figure', () => {
    expect(computeClearIt(summary(-147), '2026-11-30', null)).toMatchObject({ remainingDays: 0, perDayMin: null });
  });
});

describe('computeClearIt with live today', () => {
  it('works from the balance before today so live hours are not counted twice', () => {
    const today: DayResult = {
      date: '2026-11-12', timeIn: '09:00', timeOut: null, standardMin: 540, actualMin: 300, remark: '',
      kind: 'today', requiredMin: 540, contributionMin: -240, runningMin: -300,
    };
    // before today −1:00 -> 09:00 + 9:00 + 1:00 = 19:00, whatever the live count says
    expect(computeClearIt(summary(-300, [today]), '2026-11-12', '09:00')).toMatchObject({ leaveBy: '19:00', perDayMin: 5 });
  });
});
