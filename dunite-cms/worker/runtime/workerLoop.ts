import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { runWorkerTick } from '@/features/imports/server/execution/workerExecutor';
import { logWorkerError, logWorkerInfo } from '@/features/imports/server/execution/logger';
import { recordImportCycle, logWorkerEvent } from '@/lib/publishing/worker-observability';

import type { ImportWorkerConfig } from './workerConfig';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function runImportWorkerLoop(config: ImportWorkerConfig): Promise<void> {
  const admin = createSupabaseAdminClient();
  let keepRunning = true;
  let ticks = 0;

  const stop = () => {
    keepRunning = false;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  logWorkerInfo('worker.loop.start', {
    worker_id: config.workerId,
    queue_name: config.queueName,
    chunk_size: config.chunkSize,
  });

  while (keepRunning) {
    if (config.maxTicks > 0 && ticks >= config.maxTicks) break;
    ticks += 1;

    try {
      const tickStart = Date.now();
      const result = await runWorkerTick({
        supabase: admin,
        workerId: config.workerId,
        queueName: config.queueName,
        chunkSize: config.chunkSize,
      });
      const tickDuration = Date.now() - tickStart;

      if (!result.ok) {
        recordImportCycle(0, 0, 1, tickDuration);
        await logWorkerEvent(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            type: 'error',
            details: { worker_id: config.workerId, message: result.message },
            severity: 'error',
          },
        );
        await sleep(config.errorSleepMs);
        continue;
      }

      if (result.processedThisChunk <= 0) {
        recordImportCycle(0, 0, 0, tickDuration);
        await sleep(config.idleSleepMs);
      } else {
        recordImportCycle(1, result.processedThisChunk, 0, tickDuration);
        await logWorkerEvent(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            type: 'import_cycle',
            details: {
              worker_id: config.workerId,
              processed: result.processedThisChunk,
              duration_ms: tickDuration,
            },
          },
        );
        await sleep(Math.max(100, Math.floor(config.heartbeatMs / 3)));
      }
    } catch (e) {
      logWorkerError('worker.loop.tick_exception', {
        worker_id: config.workerId,
        message: e instanceof Error ? e.message : String(e),
      });
      await sleep(config.errorSleepMs);
    }
  }

  logWorkerInfo('worker.loop.stop', {
    worker_id: config.workerId,
    ticks,
  });
}
