# Facebook analytics & insights

Production wiring for **post-level** and **workspace-level** Facebook metrics. All Graph calls run on the server with encrypted Page tokens — nothing sensitive is returned to the browser.

## Database

Apply `supabase/migrations/0024_facebook_analytics.sql`. It adds:

- `facebook_post_analytics` — daily snapshots per CMS post (`UNIQUE (post_id, metric_date)`).
- `facebook_page_analytics` — optional Page-level rollups from `/page/insights`.
- `analytics_sync_logs` — durable cron/manual sync traces (service role writes).
- `posts.fb_analytics_last_synced_at` / `fb_analytics_sync_status` — UI + worker coordination.
- `activity_logs` policy branch for `entity_type = 'organization'` (audit entries).

## Environment

- Reuse existing Facebook + Supabase variables from the publish engine.
- Optional: `FACEBOOK_ANALYTICS_CACHE_MS` (default `120000`) — short-lived in-process dashboard cache TTL.

## Cron

Schedule an HTTP GET every hour (or as needed):

`GET /api/cron/sync-facebook-analytics`  
Header: `Authorization: Bearer <CRON_SECRET>`

## User-facing surfaces

- `/dashboard/analytics` — workspace KPIs, charts, top posts, failures, CSV/JSON export (RBAC gated).
- Post editor — “Facebook insights” panel when `external_post_id` exists.

## API map

| Route | Purpose |
|-------|---------|
| `GET /api/social/facebook/analytics/dashboard` | Filtered dashboard payload + capabilities |
| `GET /api/social/facebook/analytics/post/:id` | Single-post insight history |
| `POST /api/social/facebook/analytics/sync` | Org admin/owner/manual targeted or batch refresh |
| `GET /api/social/facebook/analytics/export?format=` | CSV / JSON snapshots (scoped) |

## Testing notes

- **`npm run build`** — ensure TypeScript + Next compile clean.
- **Org isolation**: attempt accessing another org’s post id → 404/403 from API routes.
- **Viewer vs admin**: editors/viewers see dashboard metrics; workspace **Sync now** / exports require org admin/owner (or CMS admin / super-admin).
- **Rate limiting**: cron + sync respect `FACEBOOK_RATE_LIMIT_PER_HOUR` guard before each Graph hop.
- **Permission gaps**: if Meta rejects insight metrics, sync marks `fb_analytics_sync_status=failed` and surfaces a safe error string (no tokens).

## Future platforms

Table names are Facebook-prefixed so parallel `instagram_*` analytics can follow the same repository + RLS pattern without touching OAuth storage.
