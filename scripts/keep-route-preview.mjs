import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ownsPreviewProcess, previewPaths, readPreviewState, stopPreviewProcesses } from './start-route-preview.mjs';

export async function keepRoutePreview({ statePath = process.env.ROUTE_PREVIEW_STATE_PATH || previewPaths().state } = {}) {
  const state = await readPreviewState(statePath);
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    console.log(`The temporary Routes backend is available until ${state.expiresAt}. Keep this workflow running during testing.`);
    while (!abort.signal.aborted && Date.now() < Date.parse(state.expiresAt)) {
      if (!await ownsPreviewProcess(state.serverPid, 'server', state) || !await ownsPreviewProcess(state.tunnelPid, 'tunnel', state)) {
        throw new Error('The temporary Routes backend or tunnel stopped. Re-run this deployment to restart the preview.');
      }
      await delay(Math.min(15_000, Math.max(1, Date.parse(state.expiresAt) - Date.now())), undefined, { signal: abort.signal });
    }
    console.log(abort.signal.aborted ? 'Temporary Routes preview stopped.' : 'The two-hour Routes preview has expired. Re-run deployment to test again.');
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await stopPreviewProcesses(state);
    await rm(statePath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await keepRoutePreview(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
