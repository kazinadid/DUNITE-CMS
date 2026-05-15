export interface ImportWorkerConfig {
  workerId: string;
  queueName: string;
  chunkSize: number;
  idleSleepMs: number;
  errorSleepMs: number;
  heartbeatMs: number;
  maxTicks: number;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveImportWorkerConfig(): ImportWorkerConfig {
  const workerId =
    process.env.IMPORT_WORKER_ID ??
    `import-worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    workerId,
    queueName: process.env.IMPORT_QUEUE_NAME ?? 'default',
    chunkSize: intEnv('IMPORT_EXEC_CHUNK_SIZE', 75),
    idleSleepMs: intEnv('IMPORT_WORKER_IDLE_SLEEP_MS', 1800),
    errorSleepMs: intEnv('IMPORT_WORKER_ERROR_SLEEP_MS', 5000),
    heartbeatMs: intEnv('IMPORT_WORKER_HEARTBEAT_MS', 9000),
    maxTicks: intEnv('IMPORT_WORKER_MAX_TICKS', 0),
  };
}
