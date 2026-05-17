import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/features/integrations/lib/encryption';
import { fetchEncryptedTokens } from '@/features/integrations/server/socialAccountsRepository';
import {
  FacebookServiceError,
  facebookGraphPostForm,
} from '@/features/integrations/server/facebook.service';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import type { OrgPublishGate } from '@/lib/org/publishGate';
import type { PublishFacebookFormat, PublishResult } from '../shared/types';
import { allowFacebookGraphCall } from '../shared/orgFacebookRateLimit';
import { FacebookPermanentError, FacebookTokenError } from './errors';

function sanitizeMessage(msg: string, max = 63206): string {
  const s = msg.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith('image/'));
}

function classifyGraphFailure(err: unknown): Error {
  if (err instanceof FacebookServiceError) {
    const gc = err.graphCode;
    const tokenish =
      gc === 190 ||
      gc === 102 ||
      gc === 104 ||
      gc === 463 ||
      /token|session|oauth/i.test(String(err.code));
    if (tokenish) {
      return new FacebookTokenError(err.code, err.message);
    }
    return new FacebookPermanentError(err.code, err.message, {
      subcode: err.graphSubcode,
    });
  }
  return err instanceof Error ? err : new Error('unknown_publish_error');
}

export interface FacebookPublishContext {
  postId: string;
  socialAccountId: string;
  gate: OrgPublishGate;
}

/**
 * Executes a single Facebook outbound publish using the stored Page token.
 * Server-only; never logs raw tokens or decrypted secrets.
 */
export async function publishFacebookPost(
  ctx: FacebookPublishContext,
): Promise<PublishResult> {
  const admin = createSupabaseAdminClient();

  if (!allowFacebookGraphCall(ctx.gate.organizationId)) {
    throw new FacebookPermanentError(
      'facebook_org_rate_limit',
      'Publishing temporarily blocked due to hourly API budget for this workspace.',
      {},
    );
  }

  const { data: post, error: pe } = await admin
    .from('posts')
    .select(
      'id, organization_id, user_id, content, status, publish_attempt_count, external_post_id, social_account_id, publish_metadata',
    )
    .eq('id', ctx.postId)
    .maybeSingle();

  if (pe) throw pe;
  if (!post?.id) throw new FacebookPermanentError('post_not_found', 'Post not found.', {});

  if (!post.organization_id) {
    await admin
      .from('posts')
      .update({ organization_id: ctx.gate.organizationId })
      .eq('id', ctx.postId);
    post.organization_id = ctx.gate.organizationId;
  }

  if (post.organization_id !== ctx.gate.organizationId) {
    throw new FacebookPermanentError(
      'org_mismatch',
      'Post belongs to another organization.',
      {},
    );
  }

  const { data: account, error: ae } = await admin
    .from('social_accounts')
    .select('id, organization_id, external_id, status, health_status, platform')
    .eq('id', ctx.socialAccountId)
    .maybeSingle();

  if (ae) throw ae;
  if (
    !account?.external_id ||
    account.organization_id !== ctx.gate.organizationId ||
    account.platform !== 'facebook'
  ) {
    throw new FacebookPermanentError(
      'invalid_account',
      'Facebook Page account is invalid for this workspace.',
      {},
    );
  }
  if (account.status !== 'active' || account.health_status === 'permission_error') {
    throw new FacebookTokenError(
      'facebook_account_not_active',
      'Facebook Page connection is inactive or unhealthy.',
    );
  }

  if (post.external_post_id) {
    throw new FacebookPermanentError(
      'already_published_facebook',
      'This post was already sent to Facebook.',
      {},
    );
  }

  const { data: media } = await admin
    .from('media')
    .select('file_url, mime_type, order_index')
    .eq('post_id', ctx.postId)
    .not('file_url', 'is', null)
    .order('order_index', { ascending: true });

  const first = media?.[0] ?? null;
  let format: PublishFacebookFormat = 'text';

  let pageToken: string;
  try {
    const encrypted = await fetchEncryptedTokens(account.id as string);
    const raw =
      encrypted.encrypted_page_token ?? encrypted.encrypted_user_token;
    if (!raw) {
      throw new FacebookTokenError(
        'facebook_missing_token_cipher',
        'No encrypted Page token stored for this account.',
      );
    }
    pageToken = decryptToken(raw);
  } catch {
    throw new FacebookTokenError(
      'facebook_token_decrypt_failed',
      'Unable to decrypt the Facebook Page token.',
    );
  }

  await insertPostPublishActivityLog({
    userId: ctx.gate.userId,
    postId: ctx.postId,
    actionType: 'publish_started',
    message: 'Facebook publish started.',
    metadata: {
      organization_id: ctx.gate.organizationId,
      social_account_id: ctx.socialAccountId,
    },
  });

  try {
    const pageId = account.external_id as string;
    const message = sanitizeMessage(post.content as string);

    let externalId: string | null = null;

    if (first?.file_url && isImageMime(first.mime_type)) {
      format = 'photo';
      const form = new URLSearchParams({
        access_token: pageToken,
        url:          first.file_url as string,
        caption:      message,
        published:    'true',
      });
      const res = await facebookGraphPostForm<{ id?: string }>(
        `/${pageId}/photos`,
        form,
        'photo_publish',
      );
      externalId = res.id ?? null;
    } else if (first?.file_url) {
      format = 'link';
      const form = new URLSearchParams({
        access_token: pageToken,
        message,
        link:         first.file_url as string,
        published:    'true',
      });
      const res = await facebookGraphPostForm<{ id?: string }>(
        `/${pageId}/feed`,
        form,
        'link_publish',
      );
      externalId = res.id ?? null;
    } else {
      format = 'text';
      const form = new URLSearchParams({
        access_token: pageToken,
        message,
        published: 'true',
      });
      const res = await facebookGraphPostForm<{ id?: string }>(
        `/${pageId}/feed`,
        form,
        'feed_publish',
      );
      externalId = res.id ?? null;
    }

    pageToken = '';

    const existingMeta =
      post.publish_metadata &&
      typeof post.publish_metadata === 'object' &&
      !Array.isArray(post.publish_metadata)
        ? (post.publish_metadata as Record<string, unknown>)
        : {};

    await admin.from('posts').update({
      external_post_id:        externalId,
      social_account_id:       account.id,
      published_by:            ctx.gate.userId,
      last_publish_error:      null,
      last_publish_attempt_at: new Date().toISOString(),
      publish_attempt_count:   (post.publish_attempt_count ?? 0) + 1,
      publish_locked_at:       null,
      publish_locked_by:       null,
      publish_metadata:        {
        ...existingMeta,
        facebook: {
          external_post_id: externalId,
          published_at:       new Date().toISOString(),
          format,
        },
      },
    }).eq('id', ctx.postId);

    await admin.from('post_publish_events').insert({
      post_id: ctx.postId,
      kind:    'success',
      message: `Published to Facebook (${format}).`,
    });

    await admin.from('publishing_jobs')
      .update({
        status:       'succeeded',
        completed_at: new Date().toISOString(),
        last_error:   null,
        updated_at:   new Date().toISOString(),
      })
      .eq('post_id', ctx.postId)
      .eq('platform', 'facebook');

    await insertPostPublishActivityLog({
      userId: ctx.gate.userId,
      postId: ctx.postId,
      actionType: 'publish_succeeded',
      message: 'Facebook publish completed.',
      metadata: {
        organization_id: ctx.gate.organizationId,
        social_account_id: ctx.socialAccountId,
        facebook_format: format,
        ...(externalId ? { external_post_id: externalId } : {}),
      },
    });

    return { externalPostId: externalId, format };
  } catch (e) {
    const mapped = classifyGraphFailure(e);
    const brief =
      mapped instanceof FacebookPermanentError || mapped instanceof FacebookTokenError
        ? mapped.message
        : (e instanceof Error ? e.message : 'facebook_publish_failed');

    await admin.from('posts').update({
      last_publish_error:      sanitizeMessage(brief, 2048),
      last_publish_attempt_at: new Date().toISOString(),
      publish_attempt_count:   (post.publish_attempt_count ?? 0) + 1,
      publish_locked_at:       null,
      publish_locked_by:       null,
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
      .eq('platform', 'facebook');

    await insertPostPublishActivityLog({
      userId: ctx.gate.userId,
      postId: ctx.postId,
      actionType: 'publish_failed',
      message: 'Facebook publish failed.',
      metadata: {
        organization_id: ctx.gate.organizationId,
        social_account_id: ctx.socialAccountId,
        failure: brief.slice(0, 500),
      },
    });

    if (mapped instanceof FacebookTokenError) {
      await insertPostPublishActivityLog({
        userId: ctx.gate.userId,
        postId: ctx.postId,
        actionType: 'token_expired',
        message: 'Facebook rejected the stored token.',
        metadata: {
          organization_id: ctx.gate.organizationId,
        },
      });
    }

    throw mapped;
  }
}

/** Clears stale publish locks (>5 minutes). Worker/cron-safe. */
export async function cleanupStaleFacebookPublishLocks(): Promise<number> {
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
