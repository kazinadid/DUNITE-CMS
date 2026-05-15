import 'server-only';

import { resolveImportWorkerConfig } from './runtime/workerConfig';
import { runImportWorkerLoop } from './runtime/workerLoop';

async function main() {
  const config = resolveImportWorkerConfig();
  await runImportWorkerLoop(config);
}

void main().catch((e) => {
  console.error('[imports:worker] fatal', e);
  process.exitCode = 1;
});
