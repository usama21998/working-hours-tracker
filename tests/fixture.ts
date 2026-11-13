import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * A real Decibel timesheet (Oct 2026). It holds personal data, so it is git-ignored and not in the
 * repo: tests that parse it are skipped unless you put your own copy at this path.
 */
export const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'oct-2026.pdf');
export const hasFixture = existsSync(FIXTURE_PDF);
