declare global {
  var __trackerScheduled: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || globalThis.__trackerScheduled) return;
  globalThis.__trackerScheduled = true;

  const [{ default: cron }, { runFetch }] = await Promise.all([import('node-cron'), import('./lib/fetch-job')]);
  const run = () => runFetch({ manual: false }).catch((e) => console.error('[tracker] fetch failed:', e?.message));

  // register() must finish before the server is ready, so the first fetch runs in the background.
  void run();
  cron.schedule('30 9 * * 1-5', run);
}
