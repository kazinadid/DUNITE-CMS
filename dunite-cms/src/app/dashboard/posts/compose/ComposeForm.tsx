'use client';

import {
  ArrowLeft,
  CalendarClock,
  ImageIcon,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AppDialog, AppToast, useFeedback } from '@/features/feedback';
import type { Post, PostStatus } from '@/features/posts';
import { supabase } from '@/lib/supabaseClient';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CHARS = 500;
/** Minimum lead time for a scheduled post — 5 minutes from now. */
const MIN_LEAD_MS = 5 * 60 * 1000;

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook',     color: '#1877F2' },
  { id: 'twitter',  label: 'Twitter / X',  color: '#000000' },
  { id: 'linkedin', label: 'LinkedIn',     color: '#0A66C2' },
] as const;

type PlatformId   = (typeof PLATFORMS)[number]['id'];
type ScheduleMode = 'now' | 'schedule';
type SubmitAction = 'publish' | 'draft';
type LoadingAction = SubmitAction | null;

interface ComposeFormProps {
  /** When provided, the form acts as an editor (UPDATE) instead of a creator (INSERT). */
  initialPost?: Post;
}

// ── Error helpers ────────────────────────────────────────────────────────────
//
// Supabase / Postgrest errors are notoriously hard to log:
//   1. `Error.message` is non-enumerable, so `JSON.stringify(err)` returns `{}`.
//   2. Some failure modes (missing tables, network glitches, schema cache
//      misses) return a literally-empty object as the `error` field.
//   3. Next.js Turbopack's error overlay collapses object args to `{}`.
//
// The helpers below defeat all three problems: we walk the prototype chain to
// pick up inherited fields, format a flat single-string summary so overlays
// show it verbatim, and produce a friendly "run the migrations" message when
// the error is empty (the most common dev-time cause).

interface NormalisedError {
  message?: string;
  code?:    string;
  details?: string;
  hint?:    string;
  status?:  number;
  name?:    string;
  /** Every own + inherited string/number/boolean property on the original. */
  extra:    Record<string, unknown>;
  /** `err.constructor.name` — useful when the error is a custom class. */
  className?: string;
  /** True when we couldn't extract any useful field. */
  isEmpty: boolean;
}

function serializeAnyError(err: unknown): NormalisedError {
  const out: NormalisedError = { extra: {}, isEmpty: false };

  if (err === null || err === undefined) {
    out.message = String(err);
    out.isEmpty = true;
    return out;
  }
  if (typeof err !== 'object') {
    out.message = String(err);
    return out;
  }

  // Walk the prototype chain so we catch non-enumerable Error.* properties.
  const seen   = new Set<string>();
  const SKIP   = new Set(['constructor', 'toString', 'toJSON', '__proto__']);
  let current: object | null = err;
  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (SKIP.has(key) || seen.has(key)) continue;
      seen.add(key);
      try {
        const value = (err as Record<string, unknown>)[key];
        if (value === undefined || typeof value === 'function') continue;

        // Pull the well-known fields out of `extra` for direct access.
        if (key === 'message' && typeof value === 'string') out.message = value;
        else if (key === 'code'    && typeof value === 'string') out.code    = value;
        else if (key === 'details' && typeof value === 'string') out.details = value;
        else if (key === 'hint'    && typeof value === 'string') out.hint    = value;
        else if (key === 'status'  && typeof value === 'number') out.status  = value;
        else if (key === 'name'    && typeof value === 'string') out.name    = value;
        else                                                     out.extra[key] = value;
      } catch {
        /* ignore accessor errors */
      }
    }
    current = Object.getPrototypeOf(current);
  }

  out.className = (err as { constructor?: { name?: string } }).constructor?.name;

  out.isEmpty =
    !out.message &&
    !out.code &&
    !out.details &&
    !out.hint &&
    out.status === undefined &&
    Object.keys(out.extra).length === 0;

  return out;
}

/** Build a flat human-readable summary string. */
function formatErrorSummary(n: NormalisedError): string {
  const parts: string[] = [];
  if (n.message) parts.push(n.message);
  if (n.code)    parts.push(`code=${n.code}`);
  if (n.status)  parts.push(`status=${n.status}`);
  if (n.details) parts.push(`details=${n.details}`);
  if (n.hint)    parts.push(`hint=${n.hint}`);
  if (parts.length === 0) {
    if (n.className) parts.push(`<${n.className} with no readable fields>`);
    else             parts.push('<empty error>');
  }
  return parts.join(' | ');
}

function describeError(step: string, err: unknown): string {
  if (err instanceof StepError) return err.userMessage;
  const n = serializeAnyError(err);

  // Friendly hints for the most common deployment problems.
  if (n.code === '42P01' || (n.message && n.message.includes('does not exist'))) {
    return (
      `${step} failed: a required database table is missing. ` +
      `Apply the latest migrations (supabase/migrations/0002_posts_extras.sql) and try again.`
    );
  }
  if (n.code === '42501' || (n.message && n.message.toLowerCase().includes('row-level security'))) {
    return `${step} failed: permission denied by row-level security. Verify your role and table policies.`;
  }
  if (n.isEmpty) {
    return (
      `${step} failed silently — the database returned an empty error. ` +
      `This usually means a required table or storage bucket is missing. ` +
      `Apply supabase/migrations/0002_posts_extras.sql and refresh.`
    );
  }
  return `${step} failed: ${formatErrorSummary(n)}`;
}

function getSafeErrorMessage(step: string): string {
  switch (step) {
    case 'Saving post':
    case 'Updating post':
      return 'Something went wrong while saving your post. Please try again.';
    case 'Clearing previous platforms':
    case 'Saving platforms':
      return 'Something went wrong while saving the selected platforms.';
    case 'Uploading media':
      return 'The media upload did not complete. Please try uploading the file again.';
    case 'Saving media record':
      return 'Something went wrong while saving media.';
    case 'Orphan post cleanup':
      return 'The post could not be cleaned up automatically. Please refresh and review your posts.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function getActionErrorTitle(action: SubmitAction, scheduleMode: ScheduleMode): string {
  if (action === 'draft') return 'Draft was not saved';
  if (scheduleMode === 'schedule') return 'Post was not scheduled';
  return 'Post was not published';
}

function logError(step: string, err: unknown) {
  const n = serializeAnyError(err);

  // 1. Single-string log so even Turbopack's collapsed overlay shows the cause.
  console.error(`[compose] ${step} failed → ${formatErrorSummary(n)}`);

  // 2. Structured object for full inspection in real DevTools.
  console.error(`[compose] ${step} details:`, {
    message:   n.message,
    code:      n.code,
    status:    n.status,
    details:   n.details,
    hint:      n.hint,
    name:      n.name,
    className: n.className,
    extra:     n.extra,
    raw:       err,
  });
}

/** Custom Error wrapper that carries a step label and the original cause. */
class StepError extends Error {
  step: string;
  userMessage: string;
  cause: unknown;
  constructor(step: string, cause: unknown) {
    const message = describeError(step, cause);
    super(message);
    this.name = 'StepError';
    this.step = step;
    this.userMessage = message;
    this.cause = cause;
  }
}

// Convert an ISO string to the `datetime-local` input format (YYYY-MM-DDTHH:mm)
// in the user's local timezone.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

interface MediaInsertPayload {
  post_id: string;
  user_id: string;
  file_url: string;
  file_type: string;
  file_name: string;
  mime_type: string;
  size: number;
  storage_path: string;
}

function getFileType(file: File): string {
  return file.type.split('/')[0] || 'unknown';
}

function buildStoragePath(userId: string, file: File): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${userId}/${Date.now()}-${safeName}`;
}

async function savePostMedia({
  postId,
  userId,
  file,
}: {
  postId: string;
  userId: string;
  file: File;
}) {
  const BUCKET = 'media';
  const uploadPath = buildStoragePath(userId, file);
  const mimeType = file.type || 'application/octet-stream';

  console.log('[compose] storage upload — bucket:', BUCKET);
  console.log('[compose] storage upload — path:', uploadPath);
  console.log('[compose] storage upload — file:', file.name, `(${file.size} bytes)`);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(uploadPath, file, {
      upsert: false,
      contentType: mimeType,
    });

  console.log('[compose] storage upload result:', uploadData);

  if (uploadError) {
    console.error('[compose] storage upload error:', uploadError);
    throw new StepError('Uploading media', uploadError);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(uploadPath);

  console.log('[compose] storage public URL:', publicUrl);

  const mediaPayload: MediaInsertPayload = {
    post_id: postId,
    user_id: userId,
    file_url: publicUrl,
    file_type: getFileType(file),
    file_name: file.name,
    mime_type: mimeType,
    size: file.size,
    storage_path: uploadPath,
  };

  console.log('[compose] media insert payload:', mediaPayload);

  const { data: mediaData, error: mediaError } = await supabase
    .from('media')
    .insert(mediaPayload)
    .select('id')
    .single();

  console.log('[compose] media insert result:', mediaData);

  if (mediaError) {
    console.error('[compose] media insert error:', mediaError);

    // The file made it to Storage but the metadata row failed. Remove the
    // orphaned object so retrying the compose flow stays clean.
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove([uploadPath]);

    if (removeError) {
      logError('Cleaning uploaded media after failed metadata insert', removeError);
    }

    throw new StepError('Saving media record', mediaError);
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function ComposeForm({ initialPost }: ComposeFormProps) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    dialog,
    success: showSuccess,
    error: showError,
    setDialogOpen,
  } = useFeedback();

  const isEdit = Boolean(initialPost);

  const [userId,       setUserId]       = useState<string | null>(initialPost?.user_id ?? null);
  const [content,      setContent]      = useState(initialPost?.content ?? '');
  const [platforms,    setPlatforms]    = useState<PlatformId[]>(
    (initialPost?.platforms ?? []) as PlatformId[],
  );
  const [file,         setFile]         = useState<File | null>(null);
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    initialPost?.status === 'scheduled' ? 'schedule' : 'now',
  );
  const [scheduledAt,  setScheduledAt]  = useState(isoToLocalInput(initialPost?.scheduled_at ?? null));
  const [loading,      setLoading]      = useState(false);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  // ── Resolve current user (only needed for create flow) ───────────────────
  useEffect(() => {
    if (userId) return;
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error('[compose] getUser error:', error.message);
        showError({
          title: 'Session could not be loaded',
          description: 'Please refresh the page and try again.',
        });
        return;
      }
      if (!data.user) { router.push('/login'); return; }
      setUserId(data.user.id);
    });
  }, [router, showError, userId]);

  // ── Platform toggle ──────────────────────────────────────────────────────
  function togglePlatform(id: PlatformId) {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  // ── File handling ────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    clearFile();
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function resetForm() {
    setContent('');
    setPlatforms([]);
    clearFile();
    setScheduleMode('now');
    setScheduledAt('');
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(action: SubmitAction): string | null {
    if (content.trim() === '')
      return 'Post content cannot be empty.';
    if (content.length > MAX_CHARS)
      return `Content exceeds ${MAX_CHARS} characters.`;

    if (action === 'publish' && platforms.length === 0)
      return 'Select at least one platform before publishing.';

    if (action === 'publish' && scheduleMode === 'schedule') {
      if (!scheduledAt) return 'Pick a date and time to schedule.';
      const t = new Date(scheduledAt).getTime();
      if (Number.isNaN(t)) return 'Invalid date.';
      if (t <= Date.now() + MIN_LEAD_MS - 1)
        return 'Scheduled time must be at least 5 minutes in the future.';
    }

    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(action: SubmitAction) {
    console.log('[compose] handleSubmit', { action, isEdit, content, platforms, userId });

    if (!userId) {
      showError({
        title: 'Session is not ready',
        description: 'Please wait a moment and try again.',
      });
      return;
    }
    if (loading) return;

    const validationError = validate(action);
    if (validationError) {
      showError({
        title: 'Check your post',
        description: validationError,
      });
      return;
    }

    setLoading(true);
    setLoadingAction(action);

    // Track partial state so we can roll back a freshly-created post if a
    // follow-up step fails.  Edit-mode never sets `createdNewPost = true`
    // because we're updating an existing row.
    let postId: string | null = null;
    let createdNewPost = false;

    try {
      const postStatus: PostStatus =
        action === 'draft'
          ? 'draft'
          : scheduleMode === 'schedule'
          ? 'scheduled'
          : 'published';

      const scheduledIso =
        action !== 'draft' && scheduleMode === 'schedule'
          ? new Date(scheduledAt).toISOString()
          : null;

      // ── 1. Create or update the post row ───────────────────────────────
      if (isEdit && initialPost) {
        const { data, error } = await supabase
          .from('posts')
          .update({
            content:      content.trim(),
            status:       postStatus,
            scheduled_at: scheduledIso,
          })
          .eq('id', initialPost.id)
          .select('id')
          .single();
        if (error) throw new StepError('Updating post', error);
        postId = data.id;

        // Clear existing platforms so we can re-insert the current set.
        const { error: delErr } = await supabase
          .from('post_platforms')
          .delete()
          .eq('post_id', postId);
        if (delErr) throw new StepError('Clearing previous platforms', delErr);
      } else {
        const { data, error } = await supabase
          .from('posts')
          .insert({
            user_id:      userId,
            content:      content.trim(),
            status:       postStatus,
            scheduled_at: scheduledIso,
          })
          .select('id')
          .single();
        if (error) throw new StepError('Saving post', error);
        postId = data.id;
        createdNewPost = true;
      }

      console.log('[compose] post saved with id:', postId);

      // ── 2. Insert platforms ───────────────────────────────────────────
      if (platforms.length > 0) {
        const { error } = await supabase
          .from('post_platforms')
          .insert(platforms.map((p) => ({ post_id: postId!, platform: p })));
        if (error) throw new StepError('Saving platforms', error);
      }

      // ── 3. Upload + record media ──────────────────────────────────────
      if (file) {
        if (!postId) {
          throw new StepError('Saving media record', 'Post was not saved before media upload.');
        }

        await savePostMedia({
          postId,
          userId,
          file,
        });

        showSuccess({
          title: 'Media uploaded',
          description: 'Your media file was attached to the post.',
        });
      }

      // ── 4. Success ────────────────────────────────────────────────────
      const messages: Record<PostStatus, string> = {
        published: isEdit ? 'Post updated and published.'                           : 'Post published successfully!',
        scheduled: `Post scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
        draft:     isEdit ? 'Draft updated.'                                        : 'Draft saved.',
      };
      showSuccess({
        title: messages[postStatus],
        description:
          postStatus === 'scheduled'
            ? 'It will appear in your scheduled posts feed.'
            : 'Your posts feed is now up to date.',
      });

      if (isEdit) {
        setTimeout(() => router.push('/dashboard/posts'), 900);
      } else {
        resetForm();
      }
    } catch (err) {
      // ── Detailed structured logging ──────────────────────────────────
      const step  = err instanceof StepError ? err.step : 'submit';
      const cause = err instanceof StepError ? err.cause : err;
      logError(step, cause);

      // ── Roll back orphan post on partial failure ─────────────────────
      // (Only when we created a fresh post in this call.  Edit mode is left
      //  alone because the row existed before the user touched it.)
      if (createdNewPost && postId) {
        console.warn('[compose] rolling back orphan post', postId);
        const { error: cleanupError } = await supabase
          .from('posts')
          .delete()
          .eq('id', postId);
        if (cleanupError) {
          logError('Orphan post cleanup', cleanupError);
        }
      }

      console.error('[compose] user-safe error:', describeError(step, cause));
      showError({
        title: getActionErrorTitle(action, scheduleMode),
        description: getSafeErrorMessage(step),
      });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const charsLeft = MAX_CHARS - content.length;
  const overLimit = charsLeft < 0;
  const nearLimit = charsLeft >= 0 && charsLeft <= 50;
  const canDraft  = !loading && content.trim() !== '';

  const minDatetime = new Date(Date.now() + MIN_LEAD_MS)
    .toISOString()
    .slice(0, 16);

  const heading    = isEdit ? 'Edit Post' : 'Create Post';
  const subheading = isEdit
    ? 'Update content, platforms, or scheduling.'
    : 'Compose and schedule content across platforms.';
  const isScheduling = scheduleMode === 'schedule';
  const primaryLoading = loading && loadingAction === 'publish';
  const draftLoading = loading && loadingAction === 'draft';
  const primaryLabel =
    primaryLoading
      ? (isScheduling ? 'Scheduling…' : isEdit ? 'Saving…' : 'Publishing…')
      : isScheduling
      ? (isEdit ? 'Save & schedule' : 'Schedule post')
      : (isEdit ? 'Save & publish' : 'Publish');
  const draftLabel = draftLoading
    ? 'Saving draft…'
    : isEdit ? 'Save as draft' : 'Save Draft';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <AppToast />
      <AppDialog state={dialog} onOpenChange={setDialogOpen} />

    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/posts"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
          aria-label="Back to Posts"
        >
          <ArrowLeft size={16} aria-hidden />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            {heading}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">{subheading}</p>
        </div>
      </div>

      {/* Content */}
      <FormSection title="Content">
        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
            }}
            placeholder="What do you want to share?"
            rows={6}
            disabled={loading}
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 pr-16 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100 disabled:opacity-60"
          />
          <span
            aria-live="polite"
            className={[
              'absolute bottom-3 right-3 text-xs select-none tabular-nums',
              overLimit  ? 'text-red-500 font-semibold'
              : nearLimit ? 'text-amber-500'
              : 'text-gray-400',
            ].join(' ')}
          >
            {content.length}&thinsp;/&thinsp;{MAX_CHARS}
          </span>
        </div>
      </FormSection>

      {/* Platforms */}
      <FormSection title="Platforms">
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(({ id, label, color }) => {
            const active = platforms.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => togglePlatform(id)}
                disabled={loading}
                className={[
                  'flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all duration-150',
                  active
                    ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: active ? 'white' : color }}
                />
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400">
          Select at least one platform to publish.
        </p>
      </FormSection>

      {/* Media */}
      <FormSection title="Media">
        {previewUrl ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Upload preview"
              className="h-40 w-auto max-w-full rounded-xl border border-gray-200 object-cover shadow-sm"
            />
            <button
              type="button"
              onClick={clearFile}
              disabled={loading}
              aria-label="Remove image"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white shadow-md transition-colors hover:bg-gray-700"
            >
              <X size={12} aria-hidden />
            </button>
            <p className="mt-2 max-w-xs truncate text-xs text-gray-400">
              {file?.name}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-sm text-gray-500 transition-all duration-150 hover:border-gray-300 hover:bg-gray-100"
          >
            <ImageIcon size={22} className="text-gray-400" aria-hidden />
            <span className="font-medium">Click to upload an image</span>
            <span className="text-xs text-gray-400">PNG, JPG, WEBP — up to 10 MB</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </FormSection>

      {/* Scheduling */}
      <FormSection title="Scheduling">
        <div className="flex gap-2">
          {(['now', 'schedule'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setScheduleMode(mode)}
              disabled={loading}
              className={[
                'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all duration-150',
                scheduleMode === mode
                  ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              {mode === 'schedule' && <CalendarClock size={14} aria-hidden />}
              {mode === 'now' ? 'Post now' : 'Schedule'}
            </button>
          ))}
        </div>

        {scheduleMode === 'schedule' && (
          <div className="mt-3">
            <label
              htmlFor="schedule-datetime"
              className="mb-1.5 block text-xs text-gray-500"
            >
              Date &amp; time
            </label>
            <input
              id="schedule-datetime"
              type="datetime-local"
              value={scheduledAt}
              min={minDatetime}
              disabled={loading}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100 disabled:opacity-60 sm:w-auto"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Must be at least 5 minutes from now.
            </p>
          </div>
        )}
      </FormSection>

      {/* Actions */}
      <div className="flex flex-col gap-2 pb-8 pt-1 sm:flex-row">
        {/* Publish / Schedule (primary) */}
        <button
          type="button"
          onClick={() => handleSubmit('publish')}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {primaryLoading ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <Send size={15} aria-hidden />
          )}
          {primaryLabel}
        </button>

        {/* Save draft */}
        <button
          type="button"
          onClick={() => handleSubmit('draft')}
          disabled={!canDraft}
          className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {draftLoading && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {draftLabel}
        </button>

        {/* Cancel */}
        <Link
          href="/dashboard/posts"
          className="flex items-center justify-center rounded-xl px-4 py-2.5 text-sm text-gray-400 transition-colors duration-150 hover:text-gray-700"
        >
          Cancel
        </Link>
      </div>
    </div>
    </>
  );
}

// ── Local sub-components ──────────────────────────────────────────────────────

function FormSection({
  title,
  children,
}: {
  title:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  );
}
