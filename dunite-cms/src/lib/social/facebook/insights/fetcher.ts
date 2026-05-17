import 'server-only';

import { decryptToken } from '@/features/integrations/lib/encryption';
import {
  facebookGraphGet,
  FacebookServiceError,
} from '@/features/integrations/server/facebook.service';
import { fetchEncryptedTokens } from '@/features/integrations/server/socialAccountsRepository';

import { FacebookInsightsError } from './errors';
import type { RawInsightsBundle } from './transformer';
import {
  coerceReactionsBreakdown,
  normalizeFacebookPageInsights,
  normalizeFacebookPostInsights,
} from './transformer';
import type { NormalizedPostMetrics } from './transformer';
import {
  facebookInsightsEnvelopeSchema,
  facebookPostSummarySchema,
} from './validator';

/** Metrics requested via Insights API — tolerant of partial Graph responses. */
const POST_INSIGHT_METRICS = [
  'post_impressions',
  'post_impressions_unique',
  'post_impressions_paid_unique',
  'post_engagements',
  'post_engaged_users',
  'post_clicked',
  'post_clicks',
  'post_link_clicks',
  'post_comments',
  'post_reactions_by_type_total',
  'post_engagements_by_type_share',
  'post_video_views',
  'post_engagements_comments',
].join(',');

const PAGE_INSIGHT_METRICS = [
  'page_impressions',
  'page_impressions_unique',
  'page_engaged_users',
  'page_post_engagements',
  'page_video_views',
  'page_clicks_by_link_clicks_logged_out_unique',
].join(',');

async function decryptPageAccessToken(accountId: string): Promise<string> {
  try {
    const encrypted = await fetchEncryptedTokens(accountId);
    const raw = encrypted.encrypted_page_token ?? encrypted.encrypted_user_token;
    if (!raw) throw new FacebookInsightsError('facebook_missing_token_cipher', 'No Page token.', {});
    return decryptToken(raw);
  } catch (e) {
    if (e instanceof FacebookInsightsError) throw e;
    throw new FacebookInsightsError(
      'facebook_token_decrypt_failed',
      'Unable to decrypt the Facebook Page token.',
      {},
    );
  }
}

export async function fetchPostInsightsBundle(opts: {
  socialAccountId: string;
  externalPostId: string;
}): Promise<NormalizedPostMetrics> {
  const token = await decryptPageAccessToken(opts.socialAccountId);
  const id = encodeURIComponent(opts.externalPostId);
  try {
    const insightUrl = `/${id}/insights?metric=${encodeURIComponent(
      POST_INSIGHT_METRICS,
    )}&period=lifetime`;
    const rawInsightsUnknown = await facebookGraphGet(
      insightUrl,
      token,
      'post_insights_lifetime',
    );
    const insightParsed = facebookInsightsEnvelopeSchema.safeParse(rawInsightsUnknown);
    const insightsRows = insightParsed.success ? insightParsed.data.data : [];

    const fields =
      'shares,comments.summary(true),reactions.summary(true),likes.summary(true)';
    const summaryUnknown = await facebookGraphGet(`/${id}?fields=${fields}`, token, 'post_summary');
    const summaryParsed = facebookPostSummarySchema.safeParse(summaryUnknown);
    const s = summaryParsed.success ? summaryParsed.data : {};

    const shares = typeof s.shares?.count === 'number' ? s.shares.count : 0;
    const commentsFromSummary =
      typeof s.comments?.summary?.total_count === 'number'
        ? s.comments.summary.total_count
        : 0;
    const reactionsTotalRaw =
      s.reactions?.summary?.total_count ?? s.likes?.summary?.total_count ?? 0;
    const reactionsTotal =
      typeof reactionsTotalRaw === 'number' ? reactionsTotalRaw : 0;

    let reactionsObj: import('./types').ReactionBreakdown = {};
    /** Some Graph payloads attach reaction-type counts only on insights metric */
    try {
      const reactionMetric = insightsRows.find((m) =>
        ['post_reactions_by_type_total', 'post_story_adds_by_type'].includes(m.name),
      );
      const last =
        reactionMetric?.values?.[reactionMetric.values.length - 1]?.value ??
        reactionMetric?.values?.[0]?.value;
      if (typeof last === 'object' && last) {
        reactionsObj = coerceReactionsBreakdown(last);
      }
    } catch {
      reactionsObj = {};
    }

    const bundle: RawInsightsBundle = {
      insights: insightsRows,
      shares,
      commentsFromSummary,
      reactionsTotal,
      reactionsByType: reactionsObj,
      rawInsights:
        insightParsed.success
          ? (rawInsightsUnknown as Record<string, unknown>)
          : { parse_error: true },
      rawSummary: summaryParsed.success
        ? (summaryUnknown as Record<string, unknown>)
        : { parse_error: true },
    };

    return normalizeFacebookPostInsights(bundle);
  } catch (e: unknown) {
    if (e instanceof FacebookInsightsError) throw e;
    if (e instanceof FacebookServiceError) {
      throw new FacebookInsightsError(e.code, e.message, {
        graphCode: e.graphCode,
        graphSubcode: e.graphSubcode,
        retryable: e.retryable,
      });
    }
    throw e;
  }
}

export async function fetchPageInsightsBundle(opts: {
  socialAccountId: string;
  pageExternalId: string;
}): Promise<{ metrics: NormalizedPostMetrics; raw: Record<string, unknown> }> {
  const token = await decryptPageAccessToken(opts.socialAccountId);
  const pid = encodeURIComponent(opts.pageExternalId);
  const url = `/${pid}/insights?metric=${encodeURIComponent(
    PAGE_INSIGHT_METRICS,
  )}&period=day`;

  try {
    const rawUnknown = await facebookGraphGet(url, token, 'page_insights_day');
    const parsed = facebookInsightsEnvelopeSchema.safeParse(rawUnknown);
    const rows = parsed.success ? parsed.data.data : [];

    const bundle: RawInsightsBundle = {
      insights: rows,
      shares:                  0,
      commentsFromSummary:     0,
      reactionsTotal:          0,
      reactionsByType:        {},
      rawInsights:
        parsed.success ? (rawUnknown as Record<string, unknown>) : { parse_error: true },
      rawSummary: {},
    };
    const norm = normalizeFacebookPageInsights(bundle);
    return {
      metrics: norm,
      raw: parsed.success ? (rawUnknown as Record<string, unknown>) : {},
    };
  } catch (e: unknown) {
    if (e instanceof FacebookInsightsError) throw e;
    if (e instanceof FacebookServiceError) {
      throw new FacebookInsightsError(e.code, e.message, {
        graphCode: e.graphCode,
        graphSubcode: e.graphSubcode,
        retryable: e.retryable,
      });
    }
    throw e;
  }
}
