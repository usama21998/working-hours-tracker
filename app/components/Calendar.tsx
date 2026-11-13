'use client';

import { useState } from 'react';
import { formatHHMM, formatSigned } from '@/lib/time';
import type { DayResult } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CAP_MIN = 120;

function cellStyle(d: DayResult | undefined): React.CSSProperties {
  if (!d || (d.kind !== 'work' && d.kind !== 'extra')) return {};
  const strength = Math.min(Math.abs(d.contributionMin), CAP_MIN) / CAP_MIN;
  const alpha = d.contributionMin === 0 ? 0.08 : 0.15 + 0.5 * strength;
  const rgb = d.contributionMin < 0 ? '220, 38, 38' : '22, 163, 74';
  return { backgroundColor: `rgba(${rgb}, ${alpha})` };
}

function label(d: DayResult): string {
  switch (d.kind) {
    case 'work':
    case 'extra':
      return formatSigned(d.contributionMin);
    case 'today':
      return 'today';
    case 'flagged':
      return '⚠ no out';
    case 'future':
      return '';
    default:
      return d.remark || d.kind;
  }
}

export function Calendar({ month, days, today, compact = false }: { month: string; days: DayResult[]; today: string; compact?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const picked = selected ? byDate.get(selected) : undefined;

  return (
    <section aria-label="Calendar">
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 opacity-60">{w}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          const d = byDate.get(date);
          const muted = !d || ['absent', 'leave', 'off', 'future'].includes(d.kind);
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelected(date === selected ? null : date)}
              style={cellStyle(d)}
              className={`${compact ? 'min-h-10 text-[10px] leading-tight' : 'min-h-14'} rounded-md p-1 text-left ${muted ? 'opacity-50' : ''} ${
                date === today ? 'ring-2 ring-blue-500' : ''
              } ${date === selected ? 'outline outline-2 outline-neutral-500' : ''}`}
            >
              <div className="font-semibold">{i + 1}</div>
              <div className="truncate tabular-nums">{d ? label(d) : ''}</div>
            </button>
          );
        })}
      </div>

      {picked && (
        <div className="mt-3 rounded-lg bg-neutral-500/10 p-3 text-sm" aria-live="polite">
          <b>{picked.date}</b> · In {picked.timeIn ?? '—'} · Out {picked.timeOut ?? '—'} · Standard{' '}
          {picked.standardMin !== null ? formatHHMM(picked.standardMin) : '—'} · Actual{' '}
          {picked.actualMin !== null ? formatHHMM(picked.actualMin) : '—'} · {picked.remark || 'No remark'}
        </div>
      )}
    </section>
  );
}
