import type { PublishingJobExecutionContext } from './types';

/**
 * Pluggable execution boundary for future OAuth-backed publishers.
 * Implementations run server-side only (Edge worker, Node queue, etc.).
 */
export type PublishingWorker = (ctx: PublishingJobExecutionContext) => Promise<void>;
