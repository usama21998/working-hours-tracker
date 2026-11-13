'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useFetching } from './FetchContext';

/** Re-reads the page data every `minutes` (skipped while a fetch is running), so a long-open window stays current. */
export function AutoRefresh({ minutes }: { minutes: number }) {
  const router = useRouter();
  const { fetching } = useFetching();

  useEffect(() => {
    if (fetching) return;
    const id = setInterval(() => router.refresh(), minutes * 60_000);
    return () => clearInterval(id);
  }, [router, minutes, fetching]);

  return null;
}
