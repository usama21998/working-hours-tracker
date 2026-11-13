import { describe, expect, it, vi } from 'vitest';
import { errors } from 'playwright';
import {
  DecibelAuthError,
  DecibelUnavailableError,
  formatDecibelDate,
  friendlyError,
  isPdf,
  UNAVAILABLE,
  withDeadline,
} from '@/lib/decibel';

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

describe('withDeadline', () => {
  it('returns the result when the work finishes in time', async () => {
    await expect(withDeadline(Promise.resolve(7), 1000, 'too slow')).resolves.toBe(7);
  });

  it('gives up after the limit with a friendly error and runs the cleanup', async () => {
    const cleanup = vi.fn();
    const late = new Promise((_, rej) => setTimeout(() => rej(new Error('closed')), 50));
    const p = withDeadline(late, 10, 'Decibel took too long.', cleanup);
    await expect(p).rejects.toThrow(new DecibelUnavailableError('Decibel took too long.'));
    expect(cleanup).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 60)); // the late rejection must not surface as unhandled
  });
});

describe('friendlyError', () => {
  it('keeps sign-in and unavailable errors as they are', () => {
    const auth = new DecibelAuthError('Decibel sign-in was rejected: invalid username or password');
    expect(friendlyError(auth)).toBe(auth);
    const down = new DecibelUnavailableError('x');
    expect(friendlyError(down)).toBe(down);
  });

  it('network failures mean Decibel cannot be reached', () => {
    const e = friendlyError(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://bpo.mydecibel.com/login.aspx'));
    expect(e).toBeInstanceOf(DecibelUnavailableError);
    expect(e.message).toBe(UNAVAILABLE.unreachable);
  });

  it('Playwright timeouts mean Decibel did not respond, without the call log', () => {
    const e = friendlyError(new errors.TimeoutError('page.click: Timeout 60000ms exceeded.\nCall log:\n  - waiting for scheduled navigations'));
    expect(e).toBeInstanceOf(DecibelUnavailableError);
    expect(e.message).toBe(UNAVAILABLE.slow);
  });

  it('other errors keep only their first line', () => {
    const e = friendlyError(new Error('Something odd\nCall log:\n  - details'));
    expect(e).not.toBeInstanceOf(DecibelUnavailableError);
    expect(e.message).toBe('Something odd');
  });
});
