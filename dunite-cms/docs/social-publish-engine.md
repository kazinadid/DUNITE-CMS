## Social Publish Engine — environment

```
CRON_SECRET=                          # Bearer for /api/cron/publish-scan, /api/cron/publish-scheduled, and /api/cron/sync-facebook-analytics

FACEBOOK_GRAPH_API_VERSION=v19.0       # Overrides Graph REST version (fallback: FACEBOOK_GRAPH_VERSION in code)

FACEBOOK_API_TIMEOUT=25000             # Graph POST timeout in ms

FACEBOOK_MAX_RETRY_ATTEMPTS=5           # Matches publishing_jobs defaults / retry ladder

FACEBOOK_RATE_LIMIT_PER_HOUR=200        # Org-level in-process hourly budget (approximate guard)
```

## Middleware vs cron (critical)

`/api/cron/*` must **never** redirect to `/login`. Vercel Cron and scripted `curl` calls send **only** `Authorization: Bearer CRON_SECRET` — there is **no** Supabase session cookie. The Next.js `middleware` (`src/middleware.ts`) calls **`updateSession`** in **`src/lib/supabase/proxy.ts`**: paths starting with **`/api/cron`** are treated as **`bypassAuthGate`** routes so execution reaches `route.ts`; each cron handler still validates **`CRON_SECRET`**.

Symptom before fix: **`GET /api/cron/publish-scheduled`** without cookies returned **`302` → `/login?next=...`**; scheduled jobs never transitioned.

## Published row cleanup

On successful Meta publish, **`posts.scheduled_at`** is cleared to **`NULL`** alongside **`status: published`** so calendar/list UIs do not reuse the old slot once live.

---

## Manual QA checklist

1. Migrate `0022_facebook_publish_engine.sql` locally; restart app.
2. Connect a Page; compose a draft with platform Facebook; publish/save draft then open Edit.
3. In **Facebook publishing** panel, pick Page → **Publish to Facebook** (admin user).
4. Verify `posts.external_post_id` populated; timeline `post_publish_events` shows success row.
5. Schedule a Facebook post (`/api/social/facebook/schedule` via UI tooling or Thunder Client) → confirm `publishing_jobs` queued. Sanity: `GET /api/cron/publish-scheduled` **without cookies** must return **`401` JSON**, not **`302`** to `/login`; then **`GET`** with **`Authorization: Bearer <CRON_SECRET>`** should run the worker (**`processed` / `errors`** in JSON).
6. Force failure (revoke Page token); confirm status `failed`, activity log `publish_failed`.
7. **Retry** button / API restores queued job exponential backoff RPC.
8. Cross-org denial: mutate `organization_id` on a post fixture and repeat publish → rejected.
