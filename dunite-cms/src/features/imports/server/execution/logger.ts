import 'server-only';

type Level = 'info' | 'warn' | 'error';

function write(level: Level, event: string, payload: Record<string, unknown>) {
  const msg = `[imports:worker] ${event}`;
  if (level === 'warn') {
    console.warn(msg, payload);
    return;
  }
  if (level === 'error') {
    console.error(msg, payload);
    return;
  }
  console.info(msg, payload);
}

export function logWorkerInfo(event: string, payload: Record<string, unknown>) {
  write('info', event, payload);
}

export function logWorkerWarn(event: string, payload: Record<string, unknown>) {
  write('warn', event, payload);
}

export function logWorkerError(event: string, payload: Record<string, unknown>) {
  write('error', event, payload);
}
