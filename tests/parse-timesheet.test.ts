import { beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_PDF, hasFixture } from './fixture';
import { readFile } from 'node:fs/promises';
import { parseTimesheet } from '@/lib/parse-timesheet';
import type { DayRow } from '@/lib/types';

let result: Awaited<ReturnType<typeof parseTimesheet>>;
const row = (date: string): DayRow => result.rows.find((r) => r.date === date)!;

beforeAll(async () => {
  if (!hasFixture) return;
  const bytes = await readFile(FIXTURE_PDF);
  result = await parseTimesheet(new Uint8Array(bytes));
});

describe.skipIf(!hasFixture)('parseTimesheet (Oct 2026 fixture)', () => {
  it('reads the report range from the header', () => {
    expect(result.from).toBe('2026-10-01');
    expect(result.to).toBe('2026-10-31');
  });

  it('returns 31 consecutive rows', () => {
    expect(result.rows).toHaveLength(31);
    result.rows.forEach((r, i) => expect(r.date).toBe(`2026-10-${String(i + 1).padStart(2, '0')}`));
  });

  it('reads a normal working day', () => {
    expect(row('2026-10-01')).toEqual({
      date: '2026-10-01', timeIn: '09:52', timeOut: '18:19', standardMin: 540, actualMin: 507, remark: 'Late-Overtime',
    });
  });

  it('joins a multi-word remark', () => {
    expect(row('2026-10-02').actualMin).toBe(391);
    expect(row('2026-10-02').remark).toBe('Early Going-Late');
  });

  it('keeps blank rows aligned to their own dates', () => {
    expect(row('2026-10-03')).toMatchObject({ timeIn: null, actualMin: null, remark: 'Off Saturday' });
    expect(row('2026-10-04')).toMatchObject({ timeIn: null, remark: 'Sunday' });
    expect(row('2026-10-05').remark).toBe('Absent');
    expect(row('2026-10-11').remark).toBe('Sunday');
    expect(row('2026-10-18').remark).toBe('Sunday');
  });

  it('reads weekend overtime with no standard hours', () => {
    expect(row('2026-10-24')).toMatchObject({
      timeIn: '10:51', standardMin: null, actualMin: 458, remark: 'Off Saturday OverTime',
    });
  });

  it('reads the second page and totals match Decibel', () => {
    expect(row('2026-10-30').actualMin).toBe(529);
    const total = result.rows.reduce((s, r) => s + (r.actualMin ?? 0), 0);
    expect(total).toBe(10653);
  });
});
