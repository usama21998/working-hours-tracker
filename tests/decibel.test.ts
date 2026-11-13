import { describe, expect, it } from 'vitest';
import { formatDecibelDate, isPdf } from '@/lib/decibel';

describe('formatDecibelDate', () => {
  it('matches the report date picker format "MM dd,yyyy"', () => {
    expect(formatDecibelDate('2026-11-01')).toBe('November 01,2026');
    expect(formatDecibelDate('2026-02-28')).toBe('February 28,2026');
  });
});

describe('isPdf', () => {
  it('recognises PDF bytes', () => expect(isPdf(new TextEncoder().encode('%PDF-1.7\n...'))).toBe(true));
  it('rejects HTML', () => expect(isPdf(new TextEncoder().encode('<html>'))).toBe(false));
});
