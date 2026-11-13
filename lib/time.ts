const MINUS = '−';

/** 'H:MM' / 'HH:MM' / '180:0' -> minutes. Empty or malformed -> null. */
export function parseHHMM(s: string): number | null {
  const m = /^\s*(\d+):(\d{1,2})\s*$/.exec(s ?? '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes -> 'H:MM' (absolute value). */
export function formatHHMM(min: number): string {
  const a = Math.abs(Math.round(min));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** Minutes -> '−2:27', '+7:38', '0:00'. */
export function formatSigned(min: number): string {
  if (min === 0) return '0:00';
  return `${min < 0 ? MINUS : '+'}${formatHHMM(min)}`;
}

/** Valid 24h clock time 'H:MM' or 'HH:MM'. */
export function isValidHHMM(s: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Local calendar date as 'YYYY-MM-DD'. */
export function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function clockToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight -> 'HH:MM'. Values past 24h are shown as-is (e.g. '24:10'). */
export function minToClock(min: number): string {
  const h = Math.floor(min / 60);
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 'HH:MM' (24h) or minutes since midnight -> '7:05 PM'. Times past midnight wrap ('24:10' -> '12:10 AM'). */
export function formatClock12(t: string | number): string {
  const min = typeof t === 'number' ? t : clockToMin(t);
  const h24 = Math.floor(min / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(min % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** Minutes since local midnight for a Date. */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
