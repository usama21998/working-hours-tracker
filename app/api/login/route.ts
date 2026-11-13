import { saveCredentials } from '@/lib/credentials';
import { DecibelAuthError, DecibelUnavailableError, verifyLogin } from '@/lib/decibel';
import { runFetch } from '@/lib/fetch-job';
import { loadState, saveState } from '@/lib/store';

/** POST /api/login {userId, password} — check the login with Decibel, then save it encrypted. */
export async function POST(req: Request): Promise<Response> {
  let userId = '';
  let password = '';
  try {
    const body = await req.json();
    userId = String(body?.userId ?? '').trim();
    password = String(body?.password ?? '');
  } catch {
    // fall through to validation
  }
  if (!userId || !password) {
    return Response.json({ ok: false, error: 'Enter your Decibel User ID and password.' }, { status: 400 });
  }

  try {
    await verifyLogin({ userId, password });
  } catch (e) {
    if (e instanceof DecibelAuthError) return Response.json({ ok: false, error: e.message }, { status: 401 });
    if (e instanceof DecibelUnavailableError) return Response.json({ ok: false, error: e.message }, { status: 503 });
    const raw = e instanceof Error ? e.message : String(e);
    const message = raw.split(password).join('***').split(userId).join('***');
    return Response.json({ ok: false, error: `Could not reach Decibel: ${message}` }, { status: 502 });
  }

  await saveCredentials({ userId, password });
  await saveState({ ...(await loadState()), lastError: null, lastErrorAt: null, authBlocked: false });
  // Fetch before answering so the tracker opens with data. A failed fetch still logs you in:
  // its error is saved in state and shown on the page.
  await runFetch({ manual: true }).catch(() => null);
  return Response.json({ ok: true });
}
