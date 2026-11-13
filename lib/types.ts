export type DayRow = {
  date: string;            // 'YYYY-MM-DD'
  timeIn: string | null;   // 'HH:MM'
  timeOut: string | null;
  standardMin: number | null;
  actualMin: number | null;
  remark: string;          // '' if none
};
export type DayKind = 'work' | 'extra' | 'absent' | 'leave' | 'off' | 'flagged' | 'today' | 'future';
export type DayResult = DayRow & { kind: DayKind; requiredMin: number; contributionMin: number; runningMin: number };
export type MonthSummary = {
  month: string;           // 'YYYY-MM'
  days: DayResult[];
  balanceMin: number; workedMin: number; requiredMin: number;
  countedDays: number;     // kind 'work'
  extraDays: number;       // kind 'extra'
  flaggedDates: string[];
};
export type ClearIt = { leaveBy: string | null; perDayMin: number | null; remainingDays: number; surplusMin: number | null };
export type FetchState = { lastSuccessAt: string | null; lastError: string | null; lastErrorAt: string | null; authBlocked: boolean };
export type MonthView =
  | { empty: true; month: string; state: FetchState }
  | { empty: false; month: string; summary: MonthSummary; clearIt: ClearIt | null; checkIn: string | null; state: FetchState };
