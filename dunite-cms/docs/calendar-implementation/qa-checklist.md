# Calendar Production QA Checklist

## 🌍 Timezone & DST Testing

### US Eastern Time (America/New_York)
- [ ] Schedule post for `2025-03-09 02:30` (DST gap - doesn't exist)
  - Expected: System adjusts to 03:30 or shows validation error
- [ ] Schedule post for `2025-11-02 01:30` (DST ambiguity - occurs twice)
  - Expected: System uses first occurrence (EDT)
- [ ] Schedule post for `2025-06-15 12:00` (normal summer time)
  - Expected: Displays correctly in calendar
- [ ] View calendar during DST transition week
  - Expected: All times shift correctly

### European Time (Europe/Berlin)
- [ ] Schedule post for `2025-03-30 02:30` (EU DST gap)
  - Expected: System handles gracefully
- [ ] Schedule post for `2025-10-26 02:30` (EU fall back)
  - Expected: No duplicate posts

### No-DST Timezone (Asia/Dhaka)
- [ ] Schedule posts across US DST transition dates
  - Expected: Bangladesh time remains constant (UTC+6)
- [ ] Verify UTC storage is correct
  - Expected: `scheduled_at` stores proper UTC ISO 8601

### Cross-Timezone Scenarios
- [ ] User in New York schedules for 9 AM ET
  - Berlin user sees 3 PM CET (or 2 PM during DST mismatch)
- [ ] User changes workspace timezone
  - Existing posts retain correct UTC times
  - Calendar view adjusts to new timezone

## 📅 Calendar View Testing

### Month View
- [ ] Displays 6 weeks (including partial weeks)
- [ ] Current day highlighted
- [ ] Events render in correct time slots
- [ ] Overflow indicator for days with >5 events
- [ ] Navigation (prev/next month) works smoothly

### Week View
- [ ] Time grid shows 00:00 - 23:59
- [ ] Current time indicator (red line) visible
- [ ] Events positioned correctly by time
- [ ] Multi-day events span correctly
- [ ] Scroll behavior smooth

### Day View
- [ ] Hour-by-hour breakdown
- [ ] Events don't overlap incorrectly
- [ ] Click on empty slot opens composer
- [ ] Drag to create event (if enabled)

### List View
- [ ] Chronological ordering
- [ ] Grouped by date
- [ ] Shows post status badges
- [ ] Platform icons visible
- [ ] Pagination/infinite scroll works

## 🔧 API Testing

### GET /api/calendar/posts
- [ ] Returns correct posts for date range
- [ ] Respects platform filter
- [ ] Respects status filter
- [ ] Respects user filter
- [ ] Pagination works (page/pageSize)
- [ ] Cursor-based pagination works
- [ ] Response includes Cache-Control headers
- [ ] X-Total-Count header accurate
- [ ] Large date range (>6 months) returns 400 error

### POST /api/calendar/create
- [ ] Creates draft post
- [ ] Creates scheduled post
- [ ] Validates scheduled_at not in past
- [ ] Validates organization isolation
- [ ] Returns created post with ID
- [ ] Cache-busting headers present

### POST /api/calendar/reschedule
- [ ] Updates scheduled_at correctly
- [ ] Validates optimistic concurrency (expectedUpdatedAt)
- [ ] Returns 409 on stale update
- [ ] Syncs publishing pipeline
- [ ] Returns updated post

### POST /api/calendar/resize
- [ ] Changes both start and end times
- [ ] Validates duration
- [ ] Returns updated post

### DELETE /api/calendar/bulk-delete
- [ ] Deletes multiple posts (up to 100)
- [ ] Returns partial success if some fail
- [ ] Respects organization isolation
- [ ] Returns deleted/failed arrays

### POST /api/calendar/duplicate
- [ ] Creates copy with same content
- [ ] Copies all platforms
- [ ] Sets status to draft
- [ ] Syncs publishing pipeline
- [ ] Returns new post ID

## 🚀 Performance Testing

### Dataset Sizes
- [ ] 100 posts - response time < 200ms
- [ ] 500 posts - response time < 500ms
- [ ] 1000 posts - response time < 1000ms
- [ ] 2500 posts - response time < 1500ms
- [ ] 5000 posts - response time < 2000ms

### Run Load Test
```bash
cd dunite-cms
npx tsx scripts/load-test-calendar.ts
```

- [ ] All tests pass within thresholds
- [ ] No memory leaks detected
- [ ] Database indexes utilized (check EXPLAIN ANALYZE)

### Realtime Subscription
- [ ] Only triggers for scheduled posts
- [ ] Only triggers for posts in visible range
- [ ] Debounce prevents refetch storms
- [ ] Reconnects after network failure
- [ ] No memory leaks on unmount

## 🛡️ Security Testing

### RBAC Enforcement
- [ ] Non-admin cannot access other org's posts
- [ ] Admin can view all org posts
- [ ] User filter only works for admins
- [ ] Service role key required for mutations

### Input Validation
- [ ] SQL injection attempts blocked
- [ ] XSS in post content sanitized
- [ ] Malformed dates return 400
- [ ] Invalid UUIDs return 400
- [ ] Oversized payloads rejected

### Rate Limiting
- [ ] Too many requests return 429
- [ ] Headers present (X-RateLimit-*)
- [ ] Legitimate traffic not blocked

## 🔄 Worker & Publishing

### Import Worker
- [ ] Processes queue items
- [ ] Metrics tracked in observability module
- [ ] Errors logged to activity_logs
- [ ] Retries on failure
- [ ] Heartbeat updates regularly

### Publishing Worker
- [ ] Publishes Facebook posts on time
- [ ] Handles API rate limits
- [ ] Retries failed publishes
- [ ] Updates post status correctly
- [ ] Error messages stored

### Worker Health API
```bash
curl http://localhost:3000/api/admin/worker-health
```
- [ ] Returns metrics snapshot
- [ ] Shows queue depth
- [ ] Lists recent failures
- [ ] Health status accurate
- [ ] Requires admin role

## 📱 Mobile & Responsive

### Touch Devices
- [ ] Calendar views usable on phone
- [ ] Touch events work (tap, swipe)
- [ ] Modal dialogs fit screen
- [ ] Composer accessible

### Tablet
- [ ] Split view works
- [ ] Sidebar collapsible
- [ ] Touch targets large enough

## ♿ Accessibility

### Keyboard Navigation
- [ ] Tab through calendar grid
- [ ] Arrow keys navigate dates
- [ ] Enter opens event details
- [ ] Escape closes modals

### Screen Readers
- [ ] ARIA labels present
- [ ] Date announcements clear
- [ ] Status changes announced
- [ ] Focus management correct

### Color Contrast
- [ ] Text readable on all backgrounds
- [ ] Status badges distinguishable
- [ ] WCAG AA compliant

## 🐛 Edge Cases

### Empty States
- [ ] No posts shows friendly message
- [ ] No social accounts connected
- [ ] First-time user experience

### Error States
- [ ] Network failure shows retry option
- [ ] API errors display user-friendly messages
- [ ] Form validation errors clear
- [ ] Optimistic updates rollback on failure

### Boundary Conditions
- [ ] Schedule for exactly now
- [ ] Schedule for 1 year in future
- [ ] Delete post being edited by another user
- [ ] Reschedule to DST transition time
- [ ] Duplicate post with 10 platforms

### Concurrent Operations
- [ ] Two users edit same post
  - Expected: Last write wins with optimistic concurrency
- [ ] Rapid reschedule operations
  - Expected: All processed in order
- [ ] Delete while publishing
  - Expected: Publishing job cancelled

## 📊 Monitoring & Observability

### Metrics Dashboard
- [ ] Worker health endpoint accessible
- [ ] Queue depth visible
- [ ] Error rates tracked
- [ ] Response times monitored

### Logging
- [ ] All mutations logged to activity_logs
- [ ] Worker cycles logged
- [ ] Errors include stack traces
- [ ] User actions auditable

### Alerts (Future)
- [ ] High error rate alerts
- [ ] Queue depth thresholds
- [ ] Worker offline detection
- [ ] API response time degradation

## ✅ Final Checklist

### Pre-Deployment
- [ ] All database migrations applied
- [ ] Environment variables set
- [ ] CORS configured correctly
- [ ] SSL/TLS enabled
- [ ] Backups scheduled

### Post-Deployment
- [ ] Smoke test all API endpoints
- [ ] Verify realtime subscriptions work
- [ ] Test worker processes running
- [ ] Monitor error logs for 24 hours
- [ ] Check database index usage

### Documentation
- [ ] API documentation updated
- [ ] Runbook for common issues
- [ ] On-call procedures defined
- [ ] Incident response plan

---

## 🎯 Acceptance Criteria

**Calendar is production-ready when:**
- ✅ All timezone tests pass (US, EU, Asia)
- ✅ Response times < 2s for 5000 posts
- ✅ Zero security vulnerabilities
- ✅ All RBAC rules enforced
- ✅ Worker observability operational
- ✅ DST transitions handled correctly
- ✅ Mobile responsive
- ✅ Accessibility compliant (WCAG AA)
- ✅ Monitoring in place
- ✅ Load tests pass

**Estimated QA Time:** 4-6 hours for comprehensive testing
