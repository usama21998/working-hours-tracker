import { beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_PDF, hasFixture } from './fixture';
import { readFile } from 'node:fs/promises';
import { computeMonth } from '@/lib/balance';
import { parseTimesheet } from '@/lib/parse-timesheet';
import type { DayRow, MonthSummary } from '@/lib/types';

const row = (date: string, over: Partial<DayRow> = {}): DayRow => ({
  date, timeIn: null, timeOut: null, standardMin: null, actualMin: null, remark: '', ...over,
});
const worked = (date: string, actualMin: number, standardMin: number | null = 540, remark = 'Late-Overtime') =>
  row(date, { timeIn: '10:00', timeOut: '19:00', standardMin, actualMin, remark });

describe.skipIf(!hasFixture)('october-acceptance', () => {
  let oct: MonthSummary;
  const day = (d: string) => oct.days.find((x) => x.date === `2026-10-${d}`)!;

  beforeAll(async () => {
    const bytes = await readFile(FIXTURE_PDF);
    const { rows } = await parseTimesheet(new Uint8Array(bytes));
    oct = computeMonth('2026-10', rows, '2026-11-12');
  });

  it('matches the hand-checked month totals', () => {
    expect(oct).toMatchObject({
      month: '2026-10', balanceMin: -147, workedMin: 10653, requiredMin: 10800,
      countedDays: 20, extraDays: 1, flaggedDates: [],
    });
  });

  it('tracks the running balance day by day', () => {
    expect(day('01').runningMin).toBe(-33);
    expect(day('02').runningMin).toBe(-182);
    expect(day('22').runningMin).toBe(-553);
    expect(day('24').runningMin).toBe(-52);
    expect(day('30').runningMin).toBe(-147);
  });

  it('counts Saturday overtime fully as extra', () => {
    expect(day('24')).toMatchObject({ kind: 'extra', requiredMin: 0, contributionMin: 458 });
  });

  it('leaves absent and off days out', () => {
    expect(day('05')).toMatchObject({ kind: 'absent', contributionMin: 0, requiredMin: 0 });
    expect(day('03')).toMatchObject({ kind: 'off', contributionMin: 0 });
  });
});

describe('today and edge cases', () => {
  it('today-without-sync: today with no times is "today", not absent', () => {
    const s = computeMonth('2026-11', [worked('2026-11-11', 500), row('2026-11-12', { remark: 'Absent' })], '2026-11-12');
    expect(s.days[1].kind).toBe('today');
    expect(s.balanceMin).toBe(-40);
  });

  it('flagged-day: past day with check-in but no check-out', () => {
    const s = computeMonth('2026-11', [row('2026-11-10', { timeIn: '09:30', remark: 'Late' }), worked('2026-11-11', 560)], '2026-11-12');
    expect(s.days[0]).toMatchObject({ kind: 'flagged', contributionMin: 0 });
    expect(s.flaggedDates).toEqual(['2026-11-10']);
    expect(s.balanceMin).toBe(20);
  });

  it('leave-and-holiday', () => {
    const s = computeMonth('2026-11', [
      row('2026-11-02', { remark: 'Casual Leave', standardMin: 540 }),
      row('2026-11-03', { remark: 'Public Holiday' }),
      worked('2026-11-04', 240, null, 'Public Holiday'),
    ], '2026-11-12');
    expect(s.days.map((d) => d.kind)).toEqual(['leave', 'off', 'extra']);
    expect(s.days[2].contributionMin).toBe(240);
    expect(s.balanceMin).toBe(240);
  });

  it('future: rows after today contribute nothing', () => {
    const s = computeMonth('2026-11', [worked('2026-11-13', 300)], '2026-11-12');
    expect(s.days[0]).toMatchObject({ kind: 'future', contributionMin: 0 });
    expect(s.balanceMin).toBe(0);
  });

  it('only includes rows from the requested month, sorted', () => {
    const s = computeMonth('2026-11', [worked('2026-11-05', 540), worked('2026-10-30', 100), worked('2026-11-03', 600)], '2026-11-12');
    expect(s.days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-05']);
  });
});
