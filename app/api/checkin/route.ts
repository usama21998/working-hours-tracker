import { saveCheckIn } from '@/lib/store';
import { isValidHHMM, localDateISO } from '@/lib/time';

export async function POST(req: Request): Promise<Response> {
  let time = '';
  try {
    time = String((await req.json())?.time ?? '').trim();
  } catch {
    // fall through to validation
  }
  if (!isValidHHMM(time)) {
    return Response.json({ ok: false, error: 'Enter a time like 09:45' }, { status: 400 });
  }
  const [h, m] = time.split(':');
  await saveCheckIn(localDateISO(new Date()), `${h.padStart(2, '0')}:${m}`);
  return Response.json({ ok: true });
}
