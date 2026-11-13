import { parseHHMM } from './time';
import type { DayRow } from './types';

type Item = { str: string; x: number; y: number; cx: number };
type ColKey = 'date' | 'timeIn' | 'timeOut' | 'standard' | 'actual' | 'late' | 'early' | 'excess' | 'short' | 'remarks';
type Column = { key: ColKey; cx: number };

const HEADER_LABELS: [string, ColKey][] = [
  ['date in', 'date'], ['time in', 'timeIn'], ['time out', 'timeOut'], ['standard', 'standard'],
  ['actual', 'actual'], ['late', 'late'], ['early', 'early'], ['excess', 'excess'], ['short', 'short'], ['remarks', 'remarks'],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_RE = /^([A-Z][a-z]{2}) (\d{2}), (\d{4})$/;
const Y_TOLERANCE = 2;

/** 'Oct 01, 2026' -> '2026-10-01', or null if it isn't a date. */
function toIsoDate(s: string): string | null {
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[2]}`;
}

/** Group items into lines by y (top to bottom), each line sorted by x. */
function toLines(items: Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) <= Y_TOLERANCE);
    if (line) line.push(it);
    else lines.push([it]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x));
}

function headerColumns(line: Item[]): Column[] | null {
  const text = line.map((i) => i.str.toLowerCase()).join(' ');
  if (!text.includes('date in') || !text.includes('remarks')) return null;
  const cols: Column[] = [];
  for (const it of line) {
    const label = it.str.trim().toLowerCase();
    const hit = HEADER_LABELS.find(([prefix]) => label.startsWith(prefix));
    if (hit && !cols.some((c) => c.key === hit[1])) cols.push({ key: hit[1], cx: it.cx });
  }
  return cols.some((c) => c.key === 'date') ? cols : null;
}

function nearest(cols: Column[], cx: number): ColKey {
  return cols.reduce((best, c) => (Math.abs(c.cx - cx) < Math.abs(best.cx - cx) ? c : best)).key;
}

/**
 * Parse a Decibel "AT_EmpTimeSheet" PDF. Values are placed into columns by their x position
 * (not by reading order), because blank cells make line-by-line text extraction misalign rows.
 */
export async function parseTimesheet(pdf: Uint8Array): Promise<{ from: string; to: string; rows: DayRow[] }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdfjs may take ownership of the buffer, so give it a copy.
  const doc = await getDocument({ data: pdf.slice(), useSystemFonts: false, isEvalSupported: false }).promise;
  let from = '';
  let to = '';
  let cols: Column[] | null = null;
  const rows: DayRow[] = [];

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const raw of content.items) {
        if (!('str' in raw) || !raw.str.trim()) continue;
        const x = raw.transform[4];
        items.push({ str: raw.str.trim(), x, y: raw.transform[5], cx: x + raw.width / 2 });
      }

      for (const line of toLines(items)) {
        const text = line.map((i) => i.str).join(' ');
        const range = /([A-Z][a-z]{2} \d{2}, \d{4}) to ([A-Z][a-z]{2} \d{2}, \d{4})/.exec(text);
        if (range && !from) {
          from = toIsoDate(range[1]) ?? '';
          to = toIsoDate(range[2]) ?? '';
          continue;
        }
        const header = headerColumns(line);
        if (header) {
          cols = header;
          continue;
        }
        if (!cols) continue;

        const cells: Partial<Record<ColKey, string[]>> = {};
        for (const it of line) (cells[nearest(cols, it.cx)] ??= []).push(it.str);
        const date = toIsoDate((cells.date ?? []).join(' '));
        if (!date) continue; // totals, summary, footer lines

        const one = (k: ColKey) => (cells[k] ?? []).join(' ').trim() || null;
        rows.push({
          date,
          timeIn: one('timeIn'),
          timeOut: one('timeOut'),
          standardMin: parseHHMM(one('standard') ?? ''),
          actualMin: parseHHMM(one('actual') ?? ''),
          remark: (cells.remarks ?? []).join(' ').trim(),
        });
      }
    }
  } finally {
    await doc.destroy();
  }

  if (!cols) throw new Error('Timesheet PDF: column header not found');
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { from, to, rows };
}
