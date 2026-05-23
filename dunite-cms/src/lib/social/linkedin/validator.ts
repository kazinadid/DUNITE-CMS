import 'server-only';

import { z } from 'zod';
import { decryptToken } from '@/features/integrations/lib/encryption';
import { LinkedInTokenError, LinkedInTransientError } from './errors';

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

// ── Zod schemas for API route validation ──────────────────────────────────────

export const linkedInPublishBodySchema = z.object({
  postId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
});

export const linkedInScheduleBodySchema = z.object({
  postId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
});

export const linkedInRetryBodySchema = z.object({
  postId: z.string().uuid(),
});

export const linkedInCancelBodySchema = z.object({
  postId: z.string().uuid(),
});

export type LinkedInPublishBody = z.infer<typeof linkedInPublishBodySchema>;
export type LinkedInScheduleBody = z.infer<typeof linkedInScheduleBodySchema>;
export type LinkedInRetryBody = z.infer<typeof linkedInRetryBodySchema>;
export type LinkedInCancelBody = z.infer<typeof linkedInCancelBodySchema>;

export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  return `Validation failed: ${issues.join(', ')}`;
}

export interface LinkedInTokenHealthCheck {
  isValid: boolean;
  expiresAt: string | null;
  error: string | null;
}

/**
 * Validate a LinkedIn access token by calling the /v2/me endpoint.
 * Returns health status without throwing errors.
 */
export async function validateLinkedInToken(
  encryptedToken: string,
): Promise<LinkedInTokenHealthCheck> {
  let accessToken: string;
  try {
    accessToken = decryptToken(encryptedToken);
  } catch {
    return {
      isValid: false,
      expiresAt: null,
      error: 'Token decryption failed',
    };
  }

  try {
    const url = `${LINKEDIN_API_BASE}/me`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = (errorData.message as string) || `HTTP ${response.status}`;

      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          expiresAt: null,
          error: `Token expired or revoked: ${message}`,
        };
      }

      if (response.status === 429) {
        return {
          isValid: true,
          expiresAt: null,
          error: `Rate limited: ${message}`,
        };
      }

      return {
        isValid: false,
        expiresAt: null,
        error: message,
      };
    }

    // Token is valid
    return {
      isValid: true,
      expiresAt: null, // LinkedIn doesn't return expiry in /me
      error: null,
    };
  } catch (err) {
    return {
      isValid: false,
      expiresAt: null,
      error: err instanceof Error ? err.message : 'Unknown validation error',
    };
  } finally {
    accessToken = '';
  }
}
