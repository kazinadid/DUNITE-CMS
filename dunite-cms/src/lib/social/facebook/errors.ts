import type { FailureType } from '../shared/types';

export class FacebookPublishError extends Error {
  readonly error_code: string;
  readonly error_subcode: number | null;
  readonly is_retryable: boolean;
  readonly requires_reconnect: boolean;
  readonly failure_type: FailureType;
  readonly user_facing_message: string;

  constructor(
    error_code: string,
    message: string,
    opts: {
      error_subcode?: number | null;
      is_retryable: boolean;
      requires_reconnect: boolean;
      failure_type: FailureType;
      user_facing_message: string;
    },
  ) {
    super(message);
    this.name = 'FacebookPublishError';
    this.error_code = error_code;
    this.error_subcode = opts.error_subcode ?? null;
    this.is_retryable = opts.is_retryable;
    this.requires_reconnect = opts.requires_reconnect;
    this.failure_type = opts.failure_type;
    this.user_facing_message = opts.user_facing_message;
  }
}

export class FacebookTransientError extends FacebookPublishError {
  constructor(code: string, message: string, sub?: number | null) {
    super(code, message, {
      error_subcode: sub,
      is_retryable: true,
      requires_reconnect: false,
      failure_type: 'retryable',
      user_facing_message:
        'Facebook is temporarily unavailable. We will retry automatically.',
    });
  }
}

export class FacebookPermanentError extends FacebookPublishError {
  constructor(
    code: string,
    message: string,
    opts?: { subcode?: number | null },
  ) {
    super(code, message, {
      error_subcode: opts?.subcode ?? null,
      is_retryable: false,
      requires_reconnect: false,
      failure_type: 'permanent',
      user_facing_message:
        'This post could not be published. Review the message and permission settings.',
    });
  }
}

export class FacebookTokenError extends FacebookPublishError {
  constructor(code: string, message: string) {
    super(code, message, {
      is_retryable: false,
      requires_reconnect: true,
      failure_type: 'token',
      user_facing_message:
        'The Facebook Page connection expired. Reconnect Facebook in Integrations.',
    });
  }
}
