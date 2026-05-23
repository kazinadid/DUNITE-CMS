import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/features/integrations/lib/encryption';
import { fetchEncryptedTokens } from '@/features/integrations/server/socialAccountsRepository';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import type { OrgPublishGate } from '@/lib/org/publishGate';
import type { PublishResult, PublishFacebookFormat } from '../shared/types';
import { allowFacebookGraphCall } from '../shared/orgFacebookRateLimit';
import {
  LinkedInPermanentError,
  LinkedInTokenError,
  LinkedInTransientError,
} from './errors';
import { uploadLinkedInImage } from './media';

function sanitizeMessage(msg: string, max = 3000): string {
  const s = msg.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith('image/'));
}

function classifyLinkedInFailure(err: unknown): Error {
  if (err instanceof LinkedInPermanentError || err instanceof LinkedInTransientError || err instanceof LinkedInTokenError) {
    return err;
  }
  return err instanceof Error ? err : new Error('unknown_linkedin_publish_error');
}

export interface LinkedInPublishContext {
  postId: string;
  socialAccountId: string;
  gate: OrgPublishGate;
}

/**
 * Executes a single LinkedIn outbound publish using the stored organization token.
 * Server-only; never logs raw tokens or decrypted secrets.
 */
export async function publishLinkedInPost(
  ctx: LinkedInPublishContext,
): Promise<PublishResult> {
  const admin = createSupabaseAdminClient();

  // TODO: Implement LinkedIn-specific rate limiting
  // For now, reuse Facebook rate limit check (will be separated later)
  if (!allowFacebookGraphCall(ctx.gate.organizationId)) {
    throw new LinkedInPermanentError(
      'linkedin_org_rate_limit',
      'Publishing temporarily blocked due to hourly API budget for this workspace.',
    );
  }

  // Fetch post
  const { data: post, error: pe } = await admin
    .from('posts')
    .select(
      'id, organization_id, user_id, content, status, publish_attempt_count, external_post_id, social_account_id, publish_metadata',
    )
    .eq('id', ctx.postId)
    .maybeSingle();

  if (pe) throw pe;
  if (!post?.id) throw new LinkedInPermanentError('post_not_found', 'Post not found.');

  if (!post.organization_id) {
    await admin
      .from('posts')
      .update({ organization_id: ctx.gate.organizationId })
      .eq('id', ctx.postId);
    post.organization_id = ctx.gate.organizationId;
  }

  if (post.organization_id !== ctx.gate.organizationId) {
    throw new LinkedInPermanentError(
      'org_mismatch',
      'Post belongs to another organization.',
    );
  }

  // Fetch and validate account
  const { data: account, error: ae } = await admin
    .from('social_accounts')
    .select('id, organization_id, external_id, organization_urn, status, health_status, platform')
    .eq('id', ctx.socialAccountId)
    .maybeSingle();

  if (ae) throw ae;
  if (
    !account?.external_id ||
    account.organization_id !== ctx.gate.organizationId ||
    account.platform !== 'linkedin'
  ) {
    throw new LinkedInPermanentError(
      'invalid_account',
      'LinkedIn account is invalid for this workspace.',
    );
  }
  if (account.status !== 'active' || account.health_status === 'permission_error') {
    throw new LinkedInTokenError(
      'linkedin_account_not_active',
      'LinkedIn connection is inactive or unhealthy.',
    );
  }

  if (post.external_post_id) {
    throw new LinkedInPermanentError(
      'already_published_linkedin',
      'This post was already sent to LinkedIn.',
    );
  }

  // Fetch media
  const { data: media } = await admin
    .from('media')
    .select('file_url, mime_type, order_index')
    .eq('post_id', ctx.postId)
    .not('file_url', 'is', null)
    .order('order_index', { ascending: true });

  const first = media?.[0] ?? null;
  let format: 'text' | 'image' = 'text';

  // Decrypt token
  let accessToken: string;
  try {
    const encrypted = await fetchEncryptedTokens(account.id as string);
    const raw = encrypted.encrypted_page_token ?? encrypted.encrypted_user_token;
    if (!raw) {
      throw new LinkedInTokenError(
        'linkedin_missing_token_cipher',
        'No encrypted token stored for this account.',
      );
    }
    accessToken = decryptToken(raw);
  } catch {
    throw new LinkedInTokenError(
      'linkedin_token_decrypt_failed',
      'Unable to decrypt the LinkedIn token.',
    );
  }

  // Log start
  await insertPostPublishActivityLog({
    userId: ctx.gate.userId,
    postId: ctx.postId,
    actionType: 'publish_started',
    message: 'LinkedIn publish started.',
    metadata: {
      organization_id: ctx.gate.organizationId,
      social_account_id: ctx.socialAccountId,
    },
  });

  // Mark as publishing
  await admin
    .from('posts')
    .update({ status: 'publishing', updated_at: new Date().toISOString() })
    .eq('id', ctx.postId);

  try {
    const organizationUrn = account.organization_urn || account.external_id;
    const message = sanitizeMessage(post.content as string);

    let externalId: string | null = null;

    if (first?.file_url && isImageMime(first.mime_type)) {
      // Image post
      format = 'image';
      const mediaUrn = await uploadLinkedInImage(
        accessToken,
        first.file_url as string,
        organizationUrn,
      );

      externalId = await publishLinkedInImagePost(
        accessToken,
        organizationUrn,
        message,
        mediaUrn,
      );
    } else {
      // Text-only post
      format = 'text';
      externalId = await publishLinkedInTextPost(
        accessToken,
        organizationUrn,
        message,
      );
    }

    accessToken = ''; // Clear from memory

    // Update post on success
    const existingMeta =
      post.publish_metadata &&
      typeof post.publish_metadata === 'object' &&
      !Array.isArray(post.publish_metadata)
        ? (post.publish_metadata as Record<string, unknown>)
        : {};

    const successAt = new Date().toISOString();
    await admin.from('posts').update({
      status:                  'published',
      published_at:            successAt,
      scheduled_at:            null,
      external_post_id:        externalId,
      social_account_id:       account.id,
      published_by:            ctx.gate.userId,
      last_publish_error:      null,
      last_publish_attempt_at: successAt,
      publish_attempt_count:   (post.publish_attempt_count ?? 0) + 1,
      publish_locked_at:       null,
      publish_locked_by:       null,
      updated_at:              successAt,
      publish_metadata:        {
        ...existingMeta,
        linkedin: {
          external_post_id: externalId,
          published_at: successAt,
          format,
        },
      },
    }).eq('id', ctx.postId);

    await admin.from('post_publish_events').insert({
      post_id: ctx.postId,
      kind:    'success',
      message: `Published to LinkedIn (${format}).`,
    });

    await admin.from('publishing_jobs')
      .update({
        status:       'succeeded',
        completed_at: new Date().toISOString(),
        last_error:   null,
        updated_at:   new Date().toISOString(),
      })
      .eq('post_id', ctx.postId)
      .eq('platform', 'linkedin');

    await insertPostPublishActivityLog({
      userId: ctx.gate.userId,
      postId: ctx.postId,
      actionType: 'publish_succeeded',
      message: 'LinkedIn publish completed.',
      metadata: {
        organization_id: ctx.gate.organizationId,
        social_account_id: ctx.socialAccountId,
        linkedin_format: format,
        ...(externalId ? { external_post_id: externalId } : {}),
      },
    });

    return { externalPostId: externalId, format: format as PublishFacebookFormat };
  } catch (e) {
    const mapped = classifyLinkedInFailure(e);
    const brief = mapped.message;

    const failureAt = new Date().toISOString();
    await admin.from('posts').update({
      status:                  'failed',
      last_publish_error:      sanitizeMessage(brief, 2048),
      last_publish_attempt_at: failureAt,
      publish_attempt_count:   (post.publish_attempt_count ?? 0) + 1,
      publish_locked_at:       null,
      publish_locked_by:       null,
      updated_at:              failureAt,
    }).eq('id', ctx.postId);

    await admin.from('post_publish_events').insert({
      post_id: ctx.postId,
      kind:    'error',
      message: sanitizeMessage(brief, 1024),
    });

    await admin.from('publishing_jobs')
      .update({
        status:     'failed',
        last_error: sanitizeMessage(brief, 4096),
        updated_at: new Date().toISOString(),
      })
      .eq('post_id', ctx.postId)
      .eq('platform', 'linkedin');

    await insertPostPublishActivityLog({
      userId: ctx.gate.userId,
      postId: ctx.postId,
      actionType: 'publish_failed',
      message: 'LinkedIn publish failed.',
      metadata: {
        organization_id: ctx.gate.organizationId,
        social_account_id: ctx.socialAccountId,
        failure: brief.slice(0, 500),
      },
    });

    if (mapped instanceof LinkedInTokenError) {
      await insertPostPublishActivityLog({
        userId: ctx.gate.userId,
        postId: ctx.postId,
        actionType: 'token_expired',
        message: 'LinkedIn rejected the stored token.',
        metadata: {
          organization_id: ctx.gate.organizationId,
        },
      });
    }

    throw mapped;
  }
}

async function publishLinkedInTextPost(
  accessToken: string,
  organizationUrn: string,
  text: string,
): Promise<string> {
  const url = 'https://api.linkedin.com/v2/ugcPosts';

  const body = {
    author: `urn:li:organization:${extractOrganizationId(organizationUrn)}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: text || ' ',
        },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new LinkedInPermanentError(
      'linkedin_text_publish_failed',
      (errorData.message as string) || `HTTP ${response.status}`,
    );
  }

  const data = await response.json() as { id: string };
  return data.id;
}

async function publishLinkedInImagePost(
  accessToken: string,
  organizationUrn: string,
  text: string,
  mediaUrn: string,
): Promise<string> {
  const url = 'https://api.linkedin.com/v2/ugcPosts';

  const body = {
    author: `urn:li:organization:${extractOrganizationId(organizationUrn)}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: text || ' ',
        },
        shareMediaCategory: 'IMAGE',
        media: [
          {
            status: 'READY',
            description: {
              text: '',
            },
            media: mediaUrn,
            title: {
              text: '',
            },
          },
        ],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new LinkedInPermanentError(
      'linkedin_image_publish_failed',
      (errorData.message as string) || `HTTP ${response.status}`,
    );
  }

  const data = await response.json() as { id: string };
  return data.id;
}

function extractOrganizationId(urn: string): string {
  // urn:li:organization:123456 -> 123456
  const parts = urn.split(':');
  return parts[parts.length - 1] || urn;
}

/** Clears stale publish locks (>5 minutes). Worker/cron-safe. */
export async function cleanupStaleLinkedInPublishLocks(): Promise<number> {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('posts')
    .update({
      publish_locked_at: null,
      publish_locked_by: null,
    })
    .lt('publish_locked_at', cutoff)
    .not('publish_locked_at', 'is', null)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}
