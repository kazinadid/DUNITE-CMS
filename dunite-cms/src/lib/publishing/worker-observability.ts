/**
 * Worker Observability Module
 * 
 * Provides metrics, health checks, and debugging capabilities
 * for the publishing and import worker loops.
 */

import { createClient } from '@supabase/supabase-js';

// In-memory metrics store (resets on worker restart)
interface WorkerMetrics {
  // Publishing metrics
  publishingJobsProcessed: number;
  publishingJobsSucceeded: number;
  publishingJobsFailed: number;
  publishingJobsRetrying: number;
  lastPublishingCycleAt: string | null;
  publishingCycleDurationMs: number | null;
  
  // Import metrics
  importBatchesProcessed: number;
  importRecordsSucceeded: number;
  importRecordsFailed: number;
  lastImportCycleAt: string | null;
  importCycleDurationMs: number | null;
  
  // Health
  workerStartedAt: string;
  lastHeartbeatAt: string;
  consecutiveErrors: number;
  maxConsecutiveErrors: number;
}

let metrics: WorkerMetrics = {
  publishingJobsProcessed: 0,
  publishingJobsSucceeded: 0,
  publishingJobsFailed: 0,
  publishingJobsRetrying: 0,
  lastPublishingCycleAt: null,
  publishingCycleDurationMs: null,
  importBatchesProcessed: 0,
  importRecordsSucceeded: 0,
  importRecordsFailed: 0,
  lastImportCycleAt: null,
  importCycleDurationMs: null,
  workerStartedAt: new Date().toISOString(),
  lastHeartbeatAt: new Date().toISOString(),
  consecutiveErrors: 0,
  maxConsecutiveErrors: 0,
};

/**
 * Record publishing job metrics
 */
export function recordPublishingCycle(
  processed: number,
  succeeded: number,
  failed: number,
  retrying: number,
  durationMs: number,
) {
  metrics.publishingJobsProcessed += processed;
  metrics.publishingJobsSucceeded += succeeded;
  metrics.publishingJobsFailed += failed;
  metrics.publishingJobsRetrying += retrying;
  metrics.lastPublishingCycleAt = new Date().toISOString();
  metrics.publishingCycleDurationMs = durationMs;
  metrics.lastHeartbeatAt = new Date().toISOString();
  
  if (failed === 0) {
    metrics.consecutiveErrors = 0;
  } else {
    metrics.consecutiveErrors += failed;
    metrics.maxConsecutiveErrors = Math.max(metrics.maxConsecutiveErrors, metrics.consecutiveErrors);
  }
}

/**
 * Record import batch metrics
 */
export function recordImportCycle(
  batchesProcessed: number,
  recordsSucceeded: number,
  recordsFailed: number,
  durationMs: number,
) {
  metrics.importBatchesProcessed += batchesProcessed;
  metrics.importRecordsSucceeded += recordsSucceeded;
  metrics.importRecordsFailed += recordsFailed;
  metrics.lastImportCycleAt = new Date().toISOString();
  metrics.importCycleDurationMs = durationMs;
  metrics.lastHeartbeatAt = new Date().toISOString();
}

/**
 * Get current worker health status
 */
export function getWorkerHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: string;
  metrics: WorkerMetrics;
  issues: string[];
} {
  const uptimeMs = Date.now() - new Date(metrics.workerStartedAt).getTime();
  const uptimeHours = uptimeMs / (1000 * 60 * 60);
  
  const issues: string[] = [];
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  // Check for consecutive errors
  if (metrics.consecutiveErrors > 10) {
    issues.push(`High consecutive error count: ${metrics.consecutiveErrors}`);
    status = 'unhealthy';
  } else if (metrics.consecutiveErrors > 3) {
    issues.push(`Elevated consecutive errors: ${metrics.consecutiveErrors}`);
    status = 'degraded';
  }
  
  // Check heartbeat freshness (worker should update every cycle)
  const heartbeatAgeMs = Date.now() - new Date(metrics.lastHeartbeatAt).getTime();
  const heartbeatAgeMinutes = heartbeatAgeMs / (1000 * 60);
  
  if (heartbeatAgeMinutes > 10) {
    issues.push(`Stale heartbeat: ${Math.round(heartbeatAgeMinutes)} minutes ago`);
    status = 'unhealthy';
  } else if (heartbeatAgeMinutes > 5) {
    issues.push(`Aging heartbeat: ${Math.round(heartbeatAgeMinutes)} minutes ago`);
    status = 'degraded';
  }
  
  // Check error rates
  if (metrics.publishingJobsProcessed > 0) {
    const errorRate = metrics.publishingJobsFailed / metrics.publishingJobsProcessed;
    if (errorRate > 0.2) {
      issues.push(`High publishing error rate: ${(errorRate * 100).toFixed(1)}%`);
      status = 'degraded';
    }
  }
  
  return {
    status,
    uptime: `${uptimeHours.toFixed(2)} hours`,
    metrics: { ...metrics },
    issues,
  };
}

/**
 * Get worker metrics snapshot for API response
 */
export function getMetricsSnapshot() {
  const health = getWorkerHealth();
  
  return {
    ...health.metrics,
    healthStatus: health.status,
    uptime: health.uptime,
    issues: health.issues,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset metrics (useful after worker restart or manual reset)
 */
export function resetMetrics() {
  metrics = {
    publishingJobsProcessed: 0,
    publishingJobsSucceeded: 0,
    publishingJobsFailed: 0,
    publishingJobsRetrying: 0,
    lastPublishingCycleAt: null,
    publishingCycleDurationMs: null,
    importBatchesProcessed: 0,
    importRecordsSucceeded: 0,
    importRecordsFailed: 0,
    lastImportCycleAt: null,
    importCycleDurationMs: null,
    workerStartedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    consecutiveErrors: 0,
    maxConsecutiveErrors: 0,
  };
}

/**
 * Get queue depth from database (real-time)
 */
export async function getQueueDepth(supabaseUrl: string, supabaseKey: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const [publishingQueue, importQueue] = await Promise.all([
    supabase
      .from('publishing_jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'retrying']),
    
    supabase
      .from('import_execution_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued'),
  ]);
  
  return {
    publishingJobsQueued: publishingQueue.count ?? 0,
    importBatchesQueued: importQueue.count ?? 0,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Diagnostic: Get recent failed jobs with error details
 */
export async function getRecentFailures(
  supabaseUrl: string,
  supabaseKey: string,
  limit: number = 20,
) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase
    .from('publishing_jobs')
    .select('id, post_id, platform, status, error_message, scheduled_for, attempt_count, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    throw new Error(`Failed to fetch recent failures: ${error.message}`);
  }
  
  return {
    failures: data ?? [],
    total: data?.length ?? 0,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log worker event to activity logs for audit trail
 */
export async function logWorkerEvent(
  supabaseUrl: string,
  supabaseKey: string,
  event: {
    type: 'publishing_cycle' | 'import_cycle' | 'error' | 'heartbeat';
    details: Record<string, unknown>;
    severity?: 'info' | 'warning' | 'error';
  },
) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    await supabase.from('activity_logs').insert({
      action: `worker:${event.type}`,
      entity_type: 'worker',
      entity_id: 'publishing-worker',
      details: {
        ...event.details,
        severity: event.severity ?? 'info',
        timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[worker-observability] Failed to log event:', e);
  }
}
