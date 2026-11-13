import { describe, expect, it } from 'vitest';
import { clockToMin, formatHHMM, formatSigned, isValidHHMM, localDateISO, minToClock, parseHHMM } from '@/lib/time';

describe('parseHHMM', () => {
  it('parses hours and minutes', () => expect(parseHHMM('08:27')).toBe(507));
  it('parses Decibel total format without padding', () => expect(parseHHMM('180:0')).toBe(10800));
  it('returns null for empty', () => expect(parseHHMM('')).toBeNull());
});

describe('formatSigned', () => {
  it('uses a true minus sign for negatives', () => expect(formatSigned(-147)).toBe('−2:27'));
  it('uses plus for positives', () => expect(formatSigned(458)).toBe('+7:38'));
  it('shows zero without sign', () => expect(formatSigned(0)).toBe('0:00'));
});

describe('formatHHMM', () => {
  it('formats minutes as H:MM', () => expect(formatHHMM(507)).toBe('8:27'));
});

describe('clock conversion', () => {
  it('clockToMin', () => expect(clockToMin('09:45')).toBe(585));
  it('minToClock', () => expect(minToClock(1167)).toBe('19:27'));
});

describe('localDateISO', () => {
  it('uses local calendar date', () => expect(localDateISO(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02'));
});

describe('isValidHHMM', () => {
  it.each([
    ['09:52', true], ['9:52', true], ['9.5', false], ['25:00', false], ['09:60', false], ['', false],
  ])('%s -> %s', (s, ok) => expect(isValidHHMM(s)).toBe(ok));
});
