import { FacebookServiceError } from '@/features/integrations/server/facebook.service';

export class FacebookInsightsError extends FacebookServiceError {
  constructor(
    code: string,
    message: string,
    opts?: {
      graphCode?: number;
      graphSubcode?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(code, message, {
      graphCode: opts?.graphCode,
      graphSubcode: opts?.graphSubcode,
      retryable: opts?.retryable,
    });
    this.name = 'FacebookInsightsError';
  }
}
