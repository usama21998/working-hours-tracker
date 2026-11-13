'use client';

import Link from 'next/link';
import { useFetching } from './FetchContext';

const arrow = 'px-2 opacity-70 hover:opacity-100';

/** Previous / next month links; disabled while a fetch is running so the month can't change mid-fetch. */
export function MonthNav({ title, prevHref, nextHref }: { title: string; prevHref: string; nextHref: string }) {
  const { fetching } = useFetching();

  const link = (href: string, label: string, glyph: string) =>
    fetching ? (
      <span className="cursor-not-allowed px-2 opacity-30" aria-label={label} aria-disabled="true">
        {glyph}
      </span>
    ) : (
      <Link href={href} className={arrow} aria-label={label}>
        {glyph}
      </Link>
    );

  return (
    <nav className="mb-4 flex items-center justify-between">
      {link(prevHref, 'Previous month', '‹')}
      <h1 className="text-xl font-semibold">{title}</h1>
      {link(nextHref, 'Next month', '›')}
    </nav>
  );
}
