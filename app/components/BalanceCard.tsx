import { formatHHMM, formatSigned } from '@/lib/time';
import type { MonthSummary } from '@/lib/types';

export function BalanceCard({ summary, compact = false }: { summary: MonthSummary; compact?: boolean }) {
  const negative = summary.balanceMin < 0;
  return (
    <section
      className={`flex-1 rounded-xl ${compact ? 'p-3' : 'p-5'} ${negative ? 'bg-red-500/10' : 'bg-green-500/10'}`}
      aria-label="Month balance"
    >
      <div className="text-sm opacity-70">Month balance</div>
      <div className={`${compact ? 'text-4xl' : 'text-5xl'} font-bold tabular-nums ${negative ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
        {formatSigned(summary.balanceMin)}
      </div>
      <div className="mt-2 text-sm opacity-80">
        Worked {formatHHMM(summary.workedMin)} of {formatHHMM(summary.requiredMin)} · {summary.countedDays} days ·{' '}
        {summary.extraDays} weekend/holiday {summary.extraDays === 1 ? 'day' : 'days'}
      </div>
    </section>
  );
}
