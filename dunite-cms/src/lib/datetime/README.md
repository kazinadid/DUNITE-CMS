# Datetime Architecture

Enterprise-grade, timezone-safe datetime utilities for DUNITE CMS.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ datetime-    │  │ Calendar     │  │ Format display   │  │
│  │ local input  │  │ drag-drop    │  │ (Intl)           │  │
│  └──────┬───────┘  └──────┬───────┘  └────────▲─────────┘  │
│         │                 │                    │            │
└─────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                    │
          ▼                 ▼                    │
┌─────────────────────────────────────────────┐ │
│           CONVERSION LAYER (dayjs)          │ │
│  ┌──────────────────────────────────────┐   │ │
│  │ utcIsoFromWallInZone()               │   │ │
│  │ wallPartsFromUtcIso()                │   │ │
│  │ utcIsoToDatetimeLocalValue()         │   │ │
│  └──────────────────────────────────────┘   │ │
│         ▲                                    │ │
│         │                                    │ │
│  ┌──────────────────────────────────────┐   │ │
│  │ FullCalendar (Luxon - required)      │   │ │
│  │ fcEventStartToUtcIso()               │   │ │
│  └──────────────────────────────────────┘   │ │
└─────────┼───────────────────────────────────┘ │
          │                                     │
          ▼                                     │
┌───────────────────────────────────────────────┼─────────────┐
│              STORAGE (PostgreSQL)             │             │
│                                               │             │
│  scheduled_at  TIMESTAMPTZ  ← UTC ONLY       │             │
│  created_at    TIMESTAMPTZ  ← UTC ONLY       │             │
│  updated_at    TIMESTAMPTZ  ← UTC ONLY       │             │
│                                               │             │
└───────────────────────────────────────────────┼─────────────┘
                                                │
                                                │
┌───────────────────────────────────────────────┼─────────────┐
│           WORKER / CRON LAYER                 │             │
│                                               │             │
│  now() ← PostgreSQL UTC                       │             │
│  scheduled_for <= now() ← UTC comparison      │             │
│                                               │             │
└─────────────────────────────────────────────────────────────┘
```

## Key Principles

### 1. **UTC Storage Only**
- All timestamps stored as UTC ISO 8601 (`2026-05-21T08:30:00.000Z`)
- PostgreSQL `timestamptz` columns handle timezone automatically
- **Never** store local time without timezone information

### 2. **Local Display Only**
- All UI rendering converts UTC → local timezone
- Uses `Intl.DateTimeFormat` with explicit `timeZone` option
- Workspace zone: `NEXT_PUBLIC_WORKSPACE_TIME_ZONE` or browser zone

### 3. **DST-Safe Conversions**
- All conversions use `dayjs` + `timezone` plugin
- FullCalendar uses `luxon` (unavoidable dependency)
- Both libraries handle DST transitions correctly

### 4. **Explicit Timezone Resolution**
```typescript
resolveLocalTimeZone()
  ↓
1. NEXT_PUBLIC_WORKSPACE_TIME_ZONE (if set and valid)
2. Browser/OS timezone (if valid and not UTC)
3. Fallback: 'Asia/Dhaka'
```

## Usage Guide

### Converting User Input to UTC

```typescript
import { utcIsoFromWallInZone, resolveLocalTimeZone } from '@/lib/datetime';

// User picks "2026-05-21 14:30" in datetime-local input
const wallParts = {
  year: 2026,
  month: 5,
  day: 21,
  hour: 14,
  minute: 30,
};

const zone = resolveLocalTimeZone(); // e.g., 'Asia/Dhaka'
const utcIso = utcIsoFromWallInZone(wallParts, zone);
// → "2026-05-21T08:30:00.000Z" (6 hours behind Dhaka)
```

### Converting UTC to Display

```typescript
import { formatLocalDateTime } from '@/lib/date';

const utcIso = '2026-05-21T08:30:00.000Z';
const display = formatLocalDateTime(utcIso);
// → "May 21, 2026, 2:30 PM" (in workspace timezone)
```

### Calendar Drag-Drop

```typescript
import { fcEventStartToUtcIso, resolveLocalTimeZone } from '@/lib/datetime';

// FullCalendar emits naive string after drag
const startStr = '2026-05-21T14:30:00'; // No timezone info
const startDate = new Date('2026-05-21T14:30:00');

const zone = resolveLocalTimeZone();
const { iso, meta } = fcEventStartToUtcIso(startStr, startDate, zone);
// → iso: "2026-05-21T08:30:00.000Z"
```

### Calendar Viewport Range

```typescript
import { getCalendarViewportRangeUtc } from '@/lib/datetime';

// Get UTC range for current month + 2 months ahead
const { startIso, endIso } = getCalendarViewportRangeUtc();
// → { startIso: "2026-05-01T00:00:00.000Z", endIso: "2026-07-01T00:00:00.000Z" }

// Use in API query
const posts = await fetch(`/api/calendar/posts?start=${startIso}&end=${endIso}`);
```

### Validation

```typescript
import { isUtcScheduleTooSoon } from '@/lib/datetime';

const scheduledIso = '2026-05-21T08:35:00.000Z';
const minLeadMs = 5 * 60 * 1000; // 5 minutes

if (isUtcScheduleTooSoon(scheduledIso, minLeadMs)) {
  throw new Error('Schedule must be at least 5 minutes in the future.');
}
```

## Library Responsibilities

### dayjs (Primary)
- ✅ Wall ↔ UTC conversions
- ✅ Datetime-local input parsing
- ✅ UTC millisecond extraction
- ✅ Timezone-aware formatting

### luxon (FullCalendar Only)
- ✅ FullCalendar timezone plugin
- ✅ Event start string parsing
- ✅ Calendar viewport range calculation
- ❌ **DO NOT** use for general conversions (use dayjs instead)

### Intl.DateTimeFormat (Display Only)
- ✅ Human-readable formatting
- ✅ Locale-aware output
- ✅ Explicit timezone support
- ❌ **DO NOT** use for conversions (no parsing support)

## Common Pitfalls

### ❌ WRONG: Using `new Date()` with local time
```typescript
// BAD: Uses browser zone, not workspace zone
const date = new Date(2026, 4, 21, 14, 30);
```

### ✅ CORRECT: Use workspace-zone-aware helpers
```typescript
// GOOD: Explicitly uses workspace timezone
const { startIso, endIso } = getCalendarViewportRangeUtc();
```

### ❌ WRONG: Storing local time without timezone
```typescript
// BAD: Ambiguous, breaks for remote users
const scheduledAt = '2026-05-21T14:30:00'; // No timezone!
```

### ✅ CORRECT: Always store UTC
```typescript
// GOOD: Explicit UTC
const scheduledAt = '2026-05-21T08:30:00.000Z';
```

### ❌ WRONG: Mixing datetime libraries
```typescript
// BAD: Don't mix dayjs and luxon arbitrarily
const d1 = dayjs(utcIso);
const d2 = DateTime.fromISO(utcIso);
```

### ✅ CORRECT: Use appropriate library for context
```typescript
// GOOD: dayjs for general conversions
const utcIso = utcIsoFromWallInZone(parts, zone);

// GOOD: luxon ONLY for FullCalendar
const { iso } = fcEventStartToUtcIso(startStr, startDate, zone);
```

## Timezone Configuration

### Environment Variables

```bash
# Set workspace timezone (optional)
NEXT_PUBLIC_WORKSPACE_TIME_ZONE=Asia/Dhaka
```

### Resolution Order

1. **`NEXT_PUBLIC_WORKSPACE_TIME_ZONE`** (if set and valid)
   - Used for org-wide consistency
   - All users see same timezone

2. **Browser/OS timezone** (if valid and not UTC)
   - Used when no workspace zone configured
   - Per-user localization

3. **Fallback: `Asia/Dhaka`**
   - Default for DUNITE CMS
   - Ensures predictable behavior

## Testing Timezone Code

### Test Cases to Cover

1. **DST Transition** (US/EU timezones)
   - Schedule before DST change
   - Schedule after DST change
   - Schedule during DST transition (ambiguous hour)

2. **Remote Editors**
   - Editor in US, workspace in Asia
   - Browser zone ≠ workspace zone
   - Verify UTC storage is correct

3. **Calendar Drag-Drop**
   - Drag across DST boundary
   - Resize event
   - Verify local time stays consistent

4. **Cron Execution**
   - Worker runs in UTC
   - SQL `now()` returns UTC
   - Verify `scheduled_for <= now()` works correctly

### Example Test

```typescript
import { utcIsoFromWallInZone, wallPartsFromUtcIso } from '@/lib/datetime';

test('DST transition in US/Eastern', () => {
  const zone = 'America/New_York';

  // Before DST (EST, UTC-5)
  const winter = utcIsoFromWallInZone(
    { year: 2026, month: 1, day: 15, hour: 14, minute: 0 },
    zone,
  );
  expect(winter).toBe('2026-01-15T19:00:00.000Z');

  // After DST (EDT, UTC-4)
  const summer = utcIsoFromWallInZone(
    { year: 2026, month: 7, day: 15, hour: 14, minute: 0 },
    zone,
  );
  expect(summer).toBe('2026-07-15T18:00:00.000Z');
});
```

## Migration Guide

### From Old Code

```typescript
// OLD: Mixed libraries, inconsistent conversions
import { DateTime } from 'luxon';
const utc = DateTime.fromISO(local).toUTC().toISO();

// NEW: Standardized utilities
import { utcIsoFromWallInZone, resolveLocalTimeZone } from '@/lib/datetime';
const utc = utcIsoFromWallInZone(parts, resolveLocalTimeZone());
```

### Updating Components

1. Replace direct `luxon` imports with `@/lib/datetime`
2. Use `resolveLocalTimeZone()` instead of hardcoded zones
3. Use `formatLocalDateTime()` instead of manual `Intl` calls
4. Use `getCalendarViewportRangeUtc()` instead of `new Date()` math

## Performance Considerations

1. **Memoize timezone resolution**
   ```typescript
   const zone = useMemo(() => resolveLocalTimeZone(), []);
   ```

2. **Cache expensive conversions**
   ```typescript
   const wallParts = useMemo(
     () => wallPartsFromUtcIso(iso, zone),
     [iso, zone],
   );
   ```

3. **Avoid re-parsing in loops**
   ```typescript
   // BAD: Re-parses zone every iteration
   events.map(e => formatInZone(e.iso));

   // GOOD: Resolve zone once
   const zone = resolveLocalTimeZone();
   events.map(e => formatInZone(e.iso, {}, zone));
   ```

## API Reference

See `calendar.ts` for full function signatures and JSDoc comments.

### Core Functions
- `resolveLocalTimeZone()` - Get workspace/browser timezone
- `utcIsoFromWallInZone()` - Wall time → UTC
- `wallPartsFromUtcIso()` - UTC → wall time
- `formatLocalDateTime()` - UTC → formatted string
- `isUtcScheduleTooSoon()` - Validation guard
- `fcEventStartToUtcIso()` - FullCalendar drag conversion
- `getCalendarViewportRangeUtc()` - Calendar date range

### Utility Functions
- `snapToGrid()` - Snap to time interval
- `addDuration()` - Add duration to timestamp
- `durationBetween()` - Calculate duration
- `formatInZone()` - Format in specific timezone
- `formatRelativeTime()` - Relative time string
- `isSameCalendarDay()` - Compare calendar days
- `getDayRangeInZone()` - Get day start/end in UTC
