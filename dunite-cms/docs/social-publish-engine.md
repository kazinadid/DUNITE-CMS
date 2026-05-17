## Social Publish Engine — environment

```
CRON_SECRET=                          # Bearer for /api/cron/publish-scan, /api/cron/publish-scheduled, and /api/cron/sync-facebook-analytics

FACEBOOK_GRAPH_API_VERSION=v19.0       # Overrides Graph REST version (fallback: FACEBOOK_GRAPH_VERSION in code)

FACEBOOK_API_TIMEOUT=25000             # Graph POST timeout in ms

FACEBOOK_MAX_RETRY_ATTEMPTS=5           # Matches publishing_jobs defaults / retry ladder

FACEBOOK_RATE_LIMIT_PER_HOUR=200        # Org-level in-process hourly budget (approximate guard)
```

## Manual QA checklist

1. Migrate `0022_facebook_publish_engine.sql` locally; restart app.
2. Connect a Page; compose a draft with platform Facebook; publish/save draft then open Edit.
3. In **Facebook publishing** panel, pick Page → **Publish to Facebook** (admin user).
4. Verify `posts.external_post_id` populated; timeline `post_publish_events` shows success row.
5. Schedule a Facebook post (`/api/social/facebook/schedule` via UI tooling or Thunder Client) → confirm `publishing_jobs` queued and cron run processes it (`GET /api/cron/publish-scheduled` Bearer secret).
6. Force failure (revoke Page token); confirm status `failed`, activity log `publish_failed`.
7. **Retry** button / API restores queued job exponential backoff RPC.
8. Cross-org denial: mutate `organization_id` on a post fixture and repeat publish → rejected.
