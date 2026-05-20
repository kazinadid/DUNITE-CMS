# Timezone & scheduling — production model

## Rules

1. **Storage**: Postgres `timestamptz` and API payloads use **UTC ISO-8601** strings with `Z` (or offsets normalized server-side).
2. **Workers & SQL**: Comparisons such as `scheduled_for <= now()` operate on **UTC instants** only.
3. **Dashboard UI**: A single **display + edit** timezone per deployment:
   - If `NEXT_PUBLIC_WORKSPACE_TIME_ZONE` is set (e.g. `Asia/Dhaka`), labels **and**
     `<input type="datetime-local">` both use that IANA zone.
   - If unset, both use the **browser/OS** zone (`Intl`), with `Asia/Dhaka` only as fallback when Intl is unusable (`resolveLocalTimeZone()`).

Wall ↔ UTC conversions use **`dayjs` + `utc` + `timezone`** in `src/lib/time/workspaceTime.ts` so DST transitions follow the bundled tz database.

## Rollout checklist

1. Set `NEXT_PUBLIC_WORKSPACE_TIME_ZONE` to your org clock (recommended for mixed regions).
2. Restart Next after env changes (`next dev` / redeploy).
3. Smoke-test: schedule in composer → Post details modal shows **same** time as picker header.
4. Optional: TZ debug ingest (`DUNITE_TZ_DEBUG` / ingest route) stays dev-only tooling.

## Not in this refactor

- **FOR UPDATE SKIP LOCKED** worker claiming (would need new RPC migration and coordinated deploy).
- **Full removal of Luxon** where FullCalendar’s `@fullcalendar/luxon3` still requires it; calendar drag-drop already uses workspace `resolveLocalTimeZone()` for wall parsing.

## Regression tests

Run `npm test` — executes Vitest files under `src/lib/time/**/*.test.ts`.

Legacy suites under `src/features/imports/**` use Node's built-in `node:test` runner — invoke separately with:

`node --test src/features/imports/lib/dates.test.ts` (etc.).
