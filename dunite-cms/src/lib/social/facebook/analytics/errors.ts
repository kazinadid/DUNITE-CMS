import 'server-only';

/** Stable provider-agnostic analytics sync failure codes */
export type AnalyticsSyncErrorCode =
  | 'GRAPH_RATE_LIMIT'
  | 'GRAPH_TOKEN_EXPIRED'
  | 'GRAPH_PERMISSION_DENIED'
  | 'GRAPH_TRANSIENT'
  | 'GRAPH_FATAL'
  | 'ORG_MISMATCH'
  | 'MISSING_LINKAGE'
  | 'RATE_BUDGET_EXHAUSTED'
  | 'UNKNOWN';

export class AnalyticsSyncEngineError extends Error {
  readonly code: AnalyticsSyncErrorCode;
  readonly retryable: boolean;
  readonly httpStatusApprox?: number;

  constructor(
    code: AnalyticsSyncErrorCode,
    message: string,
    opts?: { retryable?: boolean; httpStatusApprox?: number; cause?: unknown },
  ) {
    super(message, { cause: opts?.cause });
    this.name = 'AnalyticsSyncEngineError';
    this.code = code;
    this.retryable =
      opts?.retryable ??
      (code === 'GRAPH_TRANSIENT' || code === 'GRAPH_RATE_LIMIT');
    this.httpStatusApprox = opts?.httpStatusApprox;
  }
}
