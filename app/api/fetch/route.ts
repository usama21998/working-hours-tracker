import { runFetch } from '@/lib/fetch-job';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** POST /api/fetch[?month=YYYY-MM] — fetch the default ranges, or one specific month. */
export async function POST(request: Request): Promise<Response> {
  const month = new URL(request.url).searchParams.get('month');
  if (month !== null && !MONTH.test(month)) {
    return Response.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  return Response.json(await runFetch({ manual: true, month: month ?? undefined }));
}
