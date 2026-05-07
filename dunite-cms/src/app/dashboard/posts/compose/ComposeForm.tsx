'use client';

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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
type PageStatus   = 'idle' | 'success' | 'error';

interface ComposeFormProps {
  /** When provided, the form acts as an editor (UPDATE) instead of a creator (INSERT). */
  initialPost?: Post;
}

// Convert an ISO string to the `datetime-local` input format (YYYY-MM-DDTHH:mm)
// in the user's local timezone.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// ── Component ────────────────────────────────────────────────────────────────

export function ComposeForm({ initialPost }: ComposeFormProps) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

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
  const [pageStatus,   setPageStatus]   = useState<PageStatus>('idle');
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null);

  // ── Resolve current user (only needed for create flow) ───────────────────
  useEffect(() => {
    if (userId) return;
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error('[compose] getUser error:', error.message);
        setErrorMsg('Failed to load user session. Please refresh.');
        setPageStatus('error');
        return;
      }
      if (!data.user) { router.push('/login'); return; }
      setUserId(data.user.id);
    });
  }, [router, userId]);

  // ── Platform toggle ──────────────────────────────────────────────────────
  function togglePlatform(id: PlatformId) {
    setErrorMsg(null);
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
      setErrorMsg('Session not ready. Please wait a moment and try again.');
      setPageStatus('error');
      return;
    }
    if (loading) return;

    const validationError = validate(action);
    if (validationError) {
      setErrorMsg(validationError);
      setPageStatus('error');
      return;
    }

    setLoading(true);
    setPageStatus('idle');
    setErrorMsg(null);
    setSuccessMsg(null);

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

      let postId: string;

      if (isEdit && initialPost) {
        // ── UPDATE existing post ───────────────────────────────────────────
        const { data, error: updateError } = await supabase
          .from('posts')
          .update({
            content:      content.trim(),
            status:       postStatus,
            scheduled_at: scheduledIso,
          })
          .eq('id', initialPost.id)
          .select('id')
          .single();

        console.log('[compose] update result:', { data, updateError });
        if (updateError) throw updateError;
        postId = data.id;

        // Replace platforms (delete + insert) so set semantics are correct
        const { error: delErr } = await supabase
          .from('post_platforms')
          .delete()
          .eq('post_id', postId);
        if (delErr) throw delErr;
      } else {
        // ── INSERT new post ────────────────────────────────────────────────
        const { data, error: insertError } = await supabase
          .from('posts')
          .insert({
            user_id:      userId,
            content:      content.trim(),
            status:       postStatus,
            scheduled_at: scheduledIso,
          })
          .select('id')
          .single();

        console.log('[compose] insert result:', { data, insertError });
        if (insertError) throw insertError;
        postId = data.id;
      }

      // ── Platforms ────────────────────────────────────────────────────────
      if (platforms.length > 0) {
        const { error: platformError } = await supabase
          .from('post_platforms')
          .insert(platforms.map((p) => ({ post_id: postId, platform: p })));
        if (platformError) throw platformError;
      }

      // ── Media (only for new uploads; replacing media is a future TODO) ──
      if (file) {
        const ext  = file.name.split('.').pop() ?? 'jpg';
        const path = `${userId}/${postId}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('posts')
          .getPublicUrl(path);

        const { error: mediaError } = await supabase
          .from('media')
          .insert({ post_id: postId, url: publicUrl });
        if (mediaError) throw mediaError;
      }

      // ── Success ──────────────────────────────────────────────────────────
      const messages: Record<PostStatus, string> = {
        published: isEdit ? 'Post updated and published.'                           : 'Post published successfully!',
        scheduled: `Post scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
        draft:     isEdit ? 'Draft updated.'                                        : 'Draft saved.',
      };
      setSuccessMsg(messages[postStatus]);
      setPageStatus('success');

      if (isEdit) {
        // Edit flow: bounce back to the feed shortly
        setTimeout(() => router.push('/dashboard/posts'), 900);
      } else {
        resetForm();
      }
    } catch (err) {
      console.error('[compose] submit error:', err);
      setPageStatus('error');
      setErrorMsg(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
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
  const primaryLabel =
    loading
      ? (isEdit ? 'Saving…' : 'Publishing…')
      : scheduleMode === 'schedule'
      ? (isEdit ? 'Save & schedule' : 'Schedule post')
      : (isEdit ? 'Save & publish' : 'Publish');

  // ── Render ───────────────────────────────────────────────────────────────

  return (
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

      {/* Feedback banners */}
      {pageStatus === 'success' && successMsg && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          <CheckCircle2 size={15} className="shrink-0" aria-hidden />
          {successMsg}
        </div>
      )}

      {pageStatus === 'error' && errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <X size={15} className="mt-0.5 shrink-0" aria-hidden />
          {errorMsg}
        </div>
      )}

      {/* Content */}
      <FormSection title="Content">
        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setErrorMsg(null);
              if (pageStatus === 'error') setPageStatus('idle');
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
              onChange={(e) => { setScheduledAt(e.target.value); setErrorMsg(null); }}
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
          {loading ? (
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
          {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {isEdit ? 'Save as draft' : 'Save Draft'}
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
