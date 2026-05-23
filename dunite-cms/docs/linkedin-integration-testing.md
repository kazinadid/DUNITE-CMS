# LinkedIn Integration - Testing Guide

## 📋 Overview

This guide covers end-to-end testing of the LinkedIn integration for DUNITE CMS.

**Integration Status**: Backend 100% complete, UI complete  
**Architecture**: Matches Facebook integration patterns exactly  
**Components**: OAuth, Publishing, Scheduling, Media Uploads, Calendar UI

---

## 🔧 Pre-Testing Setup

### 1. Environment Variables

Ensure these are set in `.env.local`:

```bash
# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/integrations/linkedin/callback

# Token Encryption (reuse existing)
SOCIAL_TOKEN_ENCRYPTION_KEY=your_32_char_encryption_key_here

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Database Migration

Run the LinkedIn migration:

```bash
cd dunite-cms
npx supabase db push
```

**Expected**: Migration `0028_linkedin_social_accounts.sql` applies successfully

**Verify**:
```sql
-- Check new columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'social_accounts' 
AND column_name IN ('organization_urn', 'linkedin_member_id');

-- Expected: Both columns should appear
```

### 3. LinkedIn App Configuration

In [LinkedIn Developer Portal](https://developer.linkedin.com/):

1. Create app (or use existing)
2. Configure redirect URL: `http://localhost:3000/api/integrations/linkedin/callback`
3. Enable these products:
   - **Share on LinkedIn** (w_member_social)
   - **Sign In with LinkedIn using OpenID Connect** (openid, profile, email)
   - **Marketing Developer Platform** (r_organization_social, rw_organization_admin)
4. Note your Client ID and Client Secret

---

## 🧪 Test Suite

### Test 1: OAuth Connect Flow

**Objective**: Verify user can connect LinkedIn account

**Steps**:
1. Start dev server: `npm run dev`
2. Navigate to: `http://localhost:3000/dashboard/integrations`
3. Click **"Connect LinkedIn"** button
4. Verify redirect to LinkedIn authorization page
5. Login and grant permissions
6. Verify redirect back to `/dashboard/integrations/select-organizations?state=...`

**Expected Results**:
- ✅ State parameter present in URL
- ✅ LinkedIn organizations displayed with logos
- ✅ Organization names match your LinkedIn admin access
- ✅ Already-connected orgs show "Connected" badge

**Database Verification**:
```sql
-- Check OAuth state was created
SELECT * FROM oauth_states 
WHERE platform = 'linkedin' 
ORDER BY created_at DESC LIMIT 1;

-- Verify metadata contains organizations
SELECT metadata->'organizations' FROM oauth_states 
WHERE platform = 'linkedin' 
ORDER BY created_at DESC LIMIT 1;
```

---

### Test 2: Organization Selection

**Objective**: Verify organizations save correctly

**Steps**:
1. From organization selection page, select 1-2 organizations
2. Click "Connect X Organization(s)"
3. Verify redirect to `/dashboard/integrations`
4. Verify success toast appears

**Expected Results**:
- ✅ LinkedIn Organizations section appears
- ✅ Connected organizations displayed as cards
- ✅ Health status shows "healthy"
- ✅ Organization name and logo visible

**Database Verification**:
```sql
-- Check social accounts created
SELECT 
  id,
  platform,
  external_id,
  organization_urn,
  linkedin_member_id,
  health_status,
  created_at
FROM social_accounts
WHERE platform = 'linkedin'
ORDER BY created_at DESC;

-- Verify token is encrypted (should NOT be plaintext)
SELECT encrypted_page_token FROM social_accounts
WHERE platform = 'linkedin' LIMIT 1;
-- Should look like: "v1:abcdef1234..." NOT a raw token
```

---

### Test 3: Text Post Publishing (Publish Now)

**Objective**: Verify immediate text post publishing

**Steps**:
1. Navigate to calendar or posts page
2. Create new post
3. Select LinkedIn as platform
4. Enter text content: "Test post from DUNITE CMS 🚀"
5. Click "Publish Now"

**Expected Results**:
- ✅ Post status changes to "publishing" briefly
- ✅ Post status changes to "published"
- ✅ External post ID populated (LinkedIn URN)
- ✅ Activity log entry created
- ✅ Post appears on LinkedIn organization page

**Database Verification**:
```sql
-- Check post status
SELECT 
  id,
  status,
  external_post_id,
  published_at,
  last_publish_error
FROM posts
WHERE platforms @> 'linkedin'
ORDER BY created_at DESC LIMIT 1;

-- Check publishing job
SELECT 
  id,
  post_id,
  platform,
  status,
  started_at,
  completed_at
FROM publishing_jobs
WHERE platform = 'linkedin'
ORDER BY created_at DESC LIMIT 1;

-- Check activity log
SELECT 
  action_type,
  message,
  metadata
FROM activity_logs
WHERE action_type LIKE '%publish%'
ORDER BY created_at DESC LIMIT 5;
```

**LinkedIn Verification**:
- Visit your LinkedIn organization page
- Verify post appears with correct text
- Check post timestamp matches publish time

---

### Test 4: Image Post Publishing

**Objective**: Verify multipart media upload flow

**Steps**:
1. Create new post
2. Select LinkedIn platform
3. Add text: "Test image post 📸"
4. Upload an image (JPG or PNG, < 8MB)
5. Click "Publish Now"

**Expected Results**:
- ✅ Post status: "publishing" → "published"
- ✅ Image appears on LinkedIn post
- ✅ Media asset URN stored in metadata
- ✅ No upload errors in logs

**Console Logs to Watch**:
```
[LinkedIn] Upload registered: urn:li:image:C-xxxxx
[LinkedIn] Image downloaded: 245KB image/jpeg
[LinkedIn] Binary upload complete
[LinkedIn] Asset status: READY
[LinkedIn] Post published: urn:li:ugcPost:xxxxx
```

**Database Verification**:
```sql
-- Check post has media metadata
SELECT metadata->'media' FROM posts
WHERE platforms @> 'linkedin' AND metadata->'media' IS NOT NULL
ORDER BY created_at DESC LIMIT 1;
```

---

### Test 5: Scheduled Publishing

**Objective**: Verify timezone-safe scheduled publishing

**Steps**:
1. Create new post
2. Select LinkedIn platform
3. Set schedule time: 5 minutes from now
4. Verify local time displays correctly
5. Click "Schedule"

**Expected Results**:
- ✅ Post status: "scheduled"
- ✅ `scheduled_at` stored in UTC
- ✅ Calendar shows post at correct time
- ✅ Cron worker publishes at exact scheduled time
- ✅ Post status updates to "published" automatically

**Database Verification**:
```sql
-- Check scheduled_at is UTC
SELECT 
  scheduled_at,
  status,
  published_at
FROM posts
WHERE platforms @> 'linkedin' AND status = 'scheduled'
ORDER BY scheduled_at ASC LIMIT 1;

-- Example expected: scheduled_at = '2024-01-15 14:30:00+00' (UTC)
-- If user timezone is Asia/Dhaka (+6), should publish at 8:30 PM local
```

**Cron Worker Verification**:
```bash
# Manually trigger cron (for testing)
curl http://localhost:3000/api/cron/publish-scheduled?secret=YOUR_CRON_SECRET

# Expected response:
{
  "ok": true,
  "facebook": { "processed": 0, "errors": [] },
  "linkedin": { "processed": 1, "errors": [] }
}
```

---

### Test 6: Retry Flow

**Objective**: Verify failed posts retry automatically

**Steps**:
1. Create post and publish
2. Manually mark as failed in database:
```sql
UPDATE posts 
SET status = 'failed', 
    last_publish_error = 'Test failure for retry'
WHERE id = 'your-post-id';

UPDATE publishing_jobs
SET status = 'failed',
    retry_count = 0
WHERE post_id = 'your-post-id';
```
3. Wait for cron tick OR manually trigger:
```bash
curl http://localhost:3000/api/social/linkedin/retry?secret=YOUR_CRON_SECRET
```

**Expected Results**:
- ✅ Post status: "failed" → "retrying" → "publishing" → "published"
- ✅ `publish_attempt_count` incremented
- ✅ Activity log shows retry attempt
- ✅ Post publishes successfully on retry

**Database Verification**:
```sql
-- Check retry metrics
SELECT 
  publish_attempt_count,
  status,
  last_publish_error
FROM posts
WHERE id = 'your-post-id';

-- Check activity logs for retry
SELECT 
  action_type,
  message,
  created_at
FROM activity_logs
WHERE post_id = 'your-post-id'
ORDER BY created_at DESC;
```

---

### Test 7: Duplicate Prevention (Idempotency)

**Objective**: Verify posts cannot be published twice

**Steps**:
1. Publish a post successfully
2. Try to publish again (via retry endpoint or manual trigger)

**Expected Results**:
- ✅ Second publish attempt blocked
- ✅ Returns 409 Conflict or skips silently
- ✅ No duplicate post on LinkedIn
- ✅ Activity log shows "already published" message

**Console Logs**:
```
[LinkedIn] Post already has external_post_id, skipping
```

---

### Test 8: Token Expiry Handling

**Objective**: Verify expired tokens handled gracefully

**Steps**:
1. Manually set token expiry to past:
```sql
UPDATE social_accounts
SET token_expires_at = NOW() - INTERVAL '1 day',
    health_status = 'expired'
WHERE platform = 'linkedin' LIMIT 1;
```
2. Try to publish a post

**Expected Results**:
- ✅ Publish fails gracefully
- ✅ Error message: "LinkedIn token expired"
- ✅ UI shows "Reconnect" button
- ✅ Health status: "expired"
- ✅ Activity log shows token failure

**Database Verification**:
```sql
SELECT health_status, token_expires_at
FROM social_accounts
WHERE platform = 'linkedin' LIMIT 1;
```

---

### Test 9: Disconnect Flow

**Objective**: Verify safe account disconnection

**Steps**:
1. Go to `/dashboard/integrations`
2. Click "Disconnect" on a LinkedIn organization
3. Confirm disconnection

**Expected Results**:
- ✅ Account removed from social_accounts
- ✅ Historical posts preserved (not deleted)
- ✅ Success toast shown
- ✅ Cannot publish to disconnected account

**Database Verification**:
```sql
-- Verify account removed
SELECT COUNT(*) FROM social_accounts
WHERE platform = 'linkedin' AND id = 'disconnected-id';
-- Expected: 0

-- Verify posts still exist
SELECT COUNT(*) FROM posts
WHERE social_account_id = 'disconnected-id';
-- Expected: > 0 (posts preserved)
```

---

### Test 10: Multi-Organization Support

**Objective**: Verify multiple orgs work independently

**Steps**:
1. Connect 2 LinkedIn organizations
2. Create post for Organization A
3. Create post for Organization B
4. Publish both

**Expected Results**:
- ✅ Each post publishes to correct organization
- ✅ No cross-org data leakage
- ✅ Activity logs show correct org_id
- ✅ RLS policies enforce isolation

**Database Verification**:
```sql
-- Check org isolation
SELECT 
  sa.organization_urn,
  p.id as post_id,
  p.external_post_id,
  p.organization_id
FROM posts p
JOIN social_accounts sa ON p.social_account_id = sa.id
WHERE sa.platform = 'linkedin'
ORDER BY sa.organization_urn, p.created_at;
```

---

### Test 11: Calendar Integration

**Objective**: Verify LinkedIn posts display correctly in calendar

**Steps**:
1. Create several LinkedIn posts (scheduled + published)
2. Navigate to calendar view
3. Check different views (month, week, day)

**Expected Results**:
- ✅ LinkedIn posts show LinkedIn icon
- ✅ Left border color: `#0A66C2` (LinkedIn blue)
- ✅ Platform badge displays correctly
- ✅ Status pills show correct state
- ✅ Posts filterable by LinkedIn platform

**Visual Checks**:
- Calendar event card has cyan-blue left border
- Platform icon shows LinkedIn logo
- Status pill shows: "Scheduled", "Published", or "Failed"

---

### Test 12: Error Classification

**Objective**: Verify different error types handled correctly

**Test Cases**:

| Error Type | Expected Behavior | Retry? |
|------------|------------------|--------|
| Network timeout | Transient error | ✅ Yes |
| 500 Server Error | Transient error | ✅ Yes |
| 429 Rate Limit | Rate limit error | ✅ Yes (with backoff) |
| Invalid token | Token error | ❌ No (reconnect) |
| Permission denied | Permanent error | ❌ No |
| Invalid media | Permanent error | ❌ No |

**How to Test**:
```sql
-- Simulate rate limit by setting metadata
UPDATE social_accounts
SET metadata = jsonb_set(metadata, '{rate_limited_until}', to_jsonb(NOW() + INTERVAL '1 hour'::interval))
WHERE platform = 'linkedin' LIMIT 1;

-- Try to publish, should queue for later
```

---

## 📊 Success Criteria Checklist

Use this checklist to verify production readiness:

### OAuth & Connection
- [ ] User can connect LinkedIn account
- [ ] Organizations load with correct metadata
- [ ] Multi-org selection works
- [ ] Tokens encrypted in database
- [ ] Reconnect flow works
- [ ] Disconnect preserves history
- [ ] No duplicate accounts created

### Publishing
- [ ] Text posts publish immediately
- [ ] Image posts publish with media
- [ ] Scheduled posts publish at correct time
- [ ] Timezone conversion accurate (test multiple timezones)
- [ ] Publish status updates in real-time
- [ ] Activity logs created for all actions

### Reliability
- [ ] Failed posts retry automatically
- [ ] Duplicate posts prevented
- [ ] Expired tokens detected
- [ ] Rate limits respected
- [ ] Network failures retried
- [ ] Stale locks cleaned up

### UI/UX
- [ ] Integrations page shows LinkedIn section
- [ ] Connect button visible and working
- [ ] Organization cards display correctly
- [ ] Calendar shows LinkedIn color (#0A66C2)
- [ ] Platform icons render correctly
- [ ] Status pills show correct state
- [ ] Error messages actionable

### Security
- [ ] Tokens never exposed in frontend
- [ ] CSRF protection works (state validation)
- [ ] RLS policies enforce org isolation
- [ ] No token leakage in logs
- [ ] Encryption key properly secured

### Performance
- [ ] Publish response < 3 seconds
- [ ] Calendar loads < 2 seconds
- [ ] Cron processes batch in < 30 seconds
- [ ] No N+1 queries
- [ ] Indexes utilized correctly

---

## 🐛 Common Issues & Troubleshooting

### Issue: "Invalid redirect_uri"

**Cause**: LinkedIn app redirect URL doesn't match  
**Fix**: Update redirect URL in LinkedIn Developer Portal to exactly:
```
http://localhost:3000/api/integrations/linkedin/callback
```

### Issue: "No organizations found"

**Cause**: User doesn't have admin access to any LinkedIn organizations  
**Fix**: 
1. Go to LinkedIn Page
2. Settings → Page Roles
3. Add yourself as Admin
4. Retry OAuth flow

### Issue: "Token exchange failed"

**Cause**: Client ID or Secret incorrect  
**Fix**: Verify `.env.local` has correct credentials:
```bash
LINKEDIN_CLIENT_ID=your_actual_client_id
LINKEDIN_CLIENT_SECRET=your_actual_client_secret
```

### Issue: "Upload failed" for images

**Cause**: Image URL not accessible or too large  
**Fix**:
1. Ensure image is publicly accessible URL
2. Check file size < 8MB
3. Verify MIME type is image/jpeg or image/png
4. Check console logs for specific error

### Issue: Scheduled post didn't publish

**Cause**: Cron worker not running  
**Fix**:
1. Verify cron endpoint accessible:
```bash
curl http://localhost:3000/api/cron/publish-scheduled?secret=YOUR_SECRET
```
2. Check `scheduled_at` is in the past
3. Check job status in `publishing_jobs` table
4. Review activity logs for errors

### Issue: Calendar shows wrong time

**Cause**: Timezone mismatch  
**Fix**:
1. Check workspace timezone setting
2. Verify `scheduled_at` stored as UTC in database
3. Check browser timezone matches expected
4. Review calendar component timezone handling

---

## 📈 Load Testing (Optional)

### Simulate 100+ Scheduled Posts

```sql
-- Create test posts (run in Supabase SQL editor)
DO $$
BEGIN
  FOR i IN 1..100 LOOP
    INSERT INTO posts (
      user_id,
      organization_id,
      social_account_id,
      content,
      platforms,
      status,
      scheduled_at,
      created_at
    )
    SELECT
      'your-user-id',
      'your-org-id',
      (SELECT id FROM social_accounts WHERE platform = 'linkedin' LIMIT 1),
      'Load test post ' || i,
      ARRAY['linkedin'],
      'scheduled',
      NOW() + (i * INTERVAL '1 minute'),
      NOW();
  END LOOP;
END $$;
```

**Verify**:
- All 100 posts schedule without errors
- Cron processes them in batches (10 per tick)
- No duplicate publishes
- Queue completes within expected time
- No database deadlocks

---

## ✅ Final Verification

Run this comprehensive check:

```sql
-- Summary of LinkedIn integration health
SELECT 
  'Connected Accounts' as metric,
  COUNT(*)::text as value
FROM social_accounts
WHERE platform = 'linkedin'

UNION ALL

SELECT 
  'Published Posts',
  COUNT(*)::text
FROM posts
WHERE platforms @> 'linkedin' AND status = 'published'

UNION ALL

SELECT 
  'Scheduled Posts',
  COUNT(*)::text
FROM posts
WHERE platforms @> 'linkedin' AND status = 'scheduled'

UNION ALL

SELECT 
  'Failed Posts',
  COUNT(*)::text
FROM posts
WHERE platforms @> 'linkedin' AND status = 'failed'

UNION ALL

SELECT 
  'Active Publishing Jobs',
  COUNT(*)::text
FROM publishing_jobs
WHERE platform = 'linkedin' AND status IN ('queued', 'processing', 'retrying')

UNION ALL

SELECT 
  'Activity Log Entries',
  COUNT(*)::text
FROM activity_logs
WHERE metadata->>'platform' = 'linkedin';
```

---

## 🚀 Production Deployment Checklist

Before deploying to production:

- [ ] Set `LINKEDIN_REDIRECT_URI` to production URL
- [ ] Update LinkedIn app redirect URL
- [ ] Rotate `SOCIAL_TOKEN_ENCRYPTION_KEY`
- [ ] Enable cron job in Vercel/production
- [ ] Set up monitoring/alerting
- [ ] Test with production LinkedIn app
- [ ] Verify SSL/HTTPS on redirect
- [ ] Run full test suite
- [ ] Check RLS policies in production
- [ ] Verify rate limits appropriate for production

---

## 📞 Support

If tests fail:
1. Check console logs for error details
2. Review activity_logs table
3. Check publishing_jobs for stuck jobs
4. Verify environment variables
5. Test LinkedIn API directly via Postman

**Critical Files**:
- OAuth: `src/lib/social/linkedin/oauth.ts`
- Publisher: `src/lib/social/linkedin/publisher.ts`
- Media: `src/lib/social/linkedin/media.ts`
- Scheduler: `src/lib/social/linkedin/scheduler.ts`
- Routes: `src/app/api/social/linkedin/*/route.ts`

---

**Last Updated**: 2026-05-21  
**Integration Version**: 1.0.0  
**Architecture**: Facebook-pattern mirror
