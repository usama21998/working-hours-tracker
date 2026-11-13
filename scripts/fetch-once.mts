// Manual test of the Decibel download: npx tsx scripts/fetch-once.mts
// Uses the login saved by the tracker's login page (data/credentials.json). Never prints it.
import { loadCredentials } from '../lib/credentials';
import { downloadTimesheet } from '../lib/decibel';
import { parseTimesheet } from '../lib/parse-timesheet';
import { savePdf } from '../lib/store';
import { localDateISO } from '../lib/time';

const creds = await loadCredentials();
if (!creds) {
  console.error('Not signed in. Start the tracker and log in first.');
  process.exit(1);
}

const now = new Date();
const from = localDateISO(new Date(now.getFullYear(), now.getMonth(), 1));
const to = localDateISO(now);
console.log(`Downloading ${from} .. ${to} ...`);
try {
  const pdf = await downloadTimesheet(from, to, creds);
  await savePdf('manual-test.pdf', pdf);
  const { rows } = await parseTimesheet(pdf);
  console.log(`OK: ${pdf.length} bytes, ${rows.length} rows (${rows[0]?.date} .. ${rows.at(-1)?.date}). Saved data/pdfs/manual-test.pdf`);
} catch (e) {
  const msg = (e instanceof Error ? e.message : String(e)).split(creds.password).join('***');
  console.error(`FAILED: ${(e as Error)?.name ?? 'Error'}: ${msg}`);
  console.error('If a screenshot was taken it is at data/last-fetch-error.png');
  process.exit(1);
}
