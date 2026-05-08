'use client';

import { ArrowLeft, CalendarClock, Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CharacterCounter,
  ComposerEditor,
  type ComposerEditorHandle,
  ComposerToolbar,
  ComposerValidationPanel,
  classifyAttachmentMessages,
  dimensionProbeMessages,
  fileKind,
  insertAtCursor,
  MediaUploader,
  type MediaUploaderHandle,
  PlatformPreview,
  PlatformSelector,
  PLATFORMS,
  probeComposerPendingMedia,
  validatePost,
  type ClientAttachmentMsg,
  type ComposerMedia,
  type PlatformId,
} from '@/features/composer';
import { AppDialog, AppToast, useFeedback } from '@/features/feedback';
import type { Post, PostMedia, WritablePostStatus } from '@/features/posts';
import { syncPublishingPipeline } from '@/features/posts/services/postsService';
import type { Role } from '@/features/auth';
import { canPublishPost } from '@/lib/rbac';
import { supabase } from '@/lib/supabaseClient';

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum lead time for a scheduled post — 5 minutes from now. */
const MIN_LEAD_MS = 5 * 60 * 1000;

const STORAGE_BUCKET = 'media';

type ScheduleMode  = 'now' | 'schedule';
type SubmitAction  = 'publish' | 'schedule' | 'draft';
type LoadingAction = SubmitAction | null;

interface ComposeFormProps {
  /** When provided, the form acts as an editor (UPDATE) instead of a creator (INSERT). */
  initialPost?: Post;
  /** From server auth — editors may draft/schedule but never publish directly. */
  userRole: Role;
}

interface RemovedMedia {
  dbId:        string;
  storagePath: string;
}

// ── Error helpers (preserved verbatim from previous revision) ────────────────
//
// Supabase / Postgrest errors are notoriously hard to log:
//   1. `Error.message` is non-enumerable, so `JSON.stringify(err)` returns `{}`.
//   2. Some failure modes (missing tables, network glitches, schema cache
//      misses) return a literally-empty object as the `error` field.
//   3. Next.js Turbopack's error overlay collapses object args to `{}`.

interface NormalisedError {
  message?: string;
  code?:    string;
  details?: string;
  hint?:    string;
  status?:  number;
  name?:    string;
  extra:    Record<string, unknown>;
  className?: string;
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

  const seen = new Set<string>();
  const SKIP = new Set(['constructor', 'toString', 'toJSON', '__proto__']);
  let current: object | null = err;
  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (SKIP.has(key) || seen.has(key)) continue;
      seen.add(key);
      try {
        const value = (err as Record<string, unknown>)[key];
        if (value === undefined || typeof value === 'function') continue;
        if      (key === 'message' && typeof value === 'string') out.message = value;
        else if (key === 'code'    && typeof value === 'string') out.code    = value;
        else if (key === 'details' && typeof value === 'string') out.details = value;
        else if (key === 'hint'    && typeof value === 'string') out.hint    = value;
        else if (key === 'status'  && typeof value === 'number') out.status  = value;
        else if (key === 'name'    && typeof value === 'string') out.name    = value;
        else                                                     out.extra[key] = value;
      } catch { /* ignore accessor errors */ }
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

  if (n.code === '42P01' || (n.message && n.message.includes('does not exist'))) {
    return (
      `${step} failed: a required database table is missing. ` +
      `Apply the latest migrations (supabase/migrations/0002…0004) and try again.`
    );
  }
  if (n.code === '42501' || (n.message && n.message.toLowerCase().includes('row-level security'))) {
    return `${step} failed: permission denied by row-level security. Verify your role and table policies.`;
  }
  if (n.isEmpty) {
    return (
      `${step} failed silently — the database returned an empty error. ` +
      `This usually means a required table or storage bucket is missing. ` +
      `Apply the latest Supabase migrations and refresh.`
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
      return 'A media upload did not complete. Please try uploading the file again.';
    case 'Saving media record':
      return 'Something went wrong while saving media metadata.';
    case 'Updating media order':
      return 'Could not save the new media order. Try again in a moment.';
    case 'Removing media':
      return 'Could not remove an existing media item. Try again in a moment.';
    case 'Orphan post cleanup':
      return 'The post could not be cleaned up automatically. Please refresh and review your posts.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function getActionErrorTitle(action: SubmitAction): string {
  if (action === 'draft')    return 'Draft was not saved';
  if (action === 'schedule') return 'Post was not scheduled';
  return 'Post was not published';
}

function logError(step: string, err: unknown) {
  const n = serializeAnyError(err);
  console.error(`[compose] ${step} failed → ${formatErrorSummary(n)}`);
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

// ── Datetime helpers ────────────────────────────────────────────────────────

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// ── Media helpers ───────────────────────────────────────────────────────────

interface MediaInsertPayload {
  post_id:      string;
  user_id:      string;
  file_url:     string;
  file_type:    string;
  file_name:    string;
  mime_type:    string;
  size:         number;
  storage_path: string;
  order_index:  number;
}

function buildStoragePath(userId: string, file: File, salt: string): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `${userId}/${Date.now()}-${salt}-${safeName}`;
}

type PendingPatch = Partial<
  Pick<Extract<ComposerMedia, { kind: 'pending' }>, 'status' | 'progress' | 'errorMessage'>
>;

/** Upload one new file + insert its `media` row. Used for pending items. */
async function uploadAndInsertMedia({
  postId,
  userId,
  file,
  orderIndex,
  pathSalt,
  onProgress,
}: {
  postId:     string;
  userId:     string;
  file:       File;
  orderIndex: number;
  /** Unique slug so parallel uploads never collide paths. */
  pathSalt:   string;
  onProgress?: (pct: number) => void;
}) {
  const path     = buildStoragePath(userId, file, pathSalt);
  const mime     = file.type || 'application/octet-stream';
  const fileType = fileKind(mime);

  onProgress?.(4);
  let tick           = 4;
  const progressTick = window.setInterval(() => {
    tick = Math.min(tick + 9, 90);
    onProgress?.(tick);
  }, 120);

  try {
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: false, contentType: mime });
    if (uploadError) throw new StepError('Uploading media', uploadError);

    onProgress?.(94);

    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    const payload: MediaInsertPayload = {
      post_id:      postId,
      user_id:      userId,
      file_url:     publicUrl,
      file_type:    fileType,
      file_name:    file.name,
      mime_type:    mime,
      size:         file.size,
      storage_path: path,
      order_index:  orderIndex,
    };

    const { error: insertError } = await supabase.from('media').insert(payload);
    if (insertError) {
      const { error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([path]);
      if (removeError)
        logError('Cleaning uploaded media after failed metadata insert', removeError);
      throw new StepError('Saving media record', insertError);
    }

    onProgress?.(100);
  } finally {
    window.clearInterval(progressTick);
  }
}

async function deleteSavedMedia({ dbId, storagePath }: RemovedMedia) {
  // Best-effort storage cleanup first; even if it fails, drop the DB row so
  // the post stops referencing a phantom file.
  if (storagePath) {
    const { error: rmError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);
    if (rmError) {
      logError('Removing media object', rmError);
    }
  }
  const { error: delError } = await supabase
    .from('media')
    .delete()
    .eq('id', dbId);
  if (delError) throw new StepError('Removing media', delError);
}

async function updateMediaOrder({
  dbId,
  orderIndex,
}: {
  dbId:       string;
  orderIndex: number;
}) {
  const { error } = await supabase
    .from('media')
    .update({ order_index: orderIndex })
    .eq('id', dbId);
  if (error) throw new StepError('Updating media order', error);
}

/**
 * Reconcile the media list with the database.  Runs in the order chosen
 * by the user so freshly-inserted rows naturally land with the correct
 * `order_index`. Existing rows just have their order updated.
 */
async function syncPostMedia({
  postId,
  userId,
  items,
  removed,
  onPendingPatch,
}: {
  postId:  string;
  userId:  string;
  items:   ComposerMedia[];
  removed: RemovedMedia[];
  /** Live feedback while files upload to Supabase. */
  onPendingPatch?: (uid: string, patch: PendingPatch) => void;
}) {
  for (const r of removed) {
    await deleteSavedMedia(r);
  }
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx]!;
    if (item.kind === 'pending') {
      onPendingPatch?.(item.uid, { status: 'uploading', progress: 0, errorMessage: undefined });
      try {
        await uploadAndInsertMedia({
          postId,
          userId,
          file: item.file,
          orderIndex: idx,
          pathSalt: item.uid.slice(0, 12),
          onProgress: (pct) =>
            onPendingPatch?.(item.uid, { status: 'uploading', progress: pct }),
        });
      } catch (err) {
        onPendingPatch?.(item.uid, {
          status:       'failed',
          progress:     0,
          errorMessage: 'Upload failed',
        });
        throw err;
      }
    } else {
      await updateMediaOrder({ dbId: item.dbId, orderIndex: idx });
    }
  }
}

// ── Save workflow ───────────────────────────────────────────────────────────

interface SavePostWorkflowInput {
  isEdit:        boolean;
  initialPostId?: string;
  userId:        string;
  content:       string;
  status:        WritablePostStatus;
  scheduledIso:  string | null;
  platforms:     PlatformId[];
  media:         ComposerMedia[];
  removedMedia:  RemovedMedia[];
  onMediaPendingPatch?: (uid: string, patch: PendingPatch) => void;
}

async function savePostWithAssets({
  isEdit,
  initialPostId,
  userId,
  content,
  status,
  scheduledIso,
  platforms,
  media,
  removedMedia,
  onMediaPendingPatch,
}: SavePostWorkflowInput): Promise<string> {
  let postId: string | null = null;
  let createdNewPost = false;

  // Stamp `published_at` only when the user is publishing right now.
  const publishedAtIso = status === 'published' ? new Date().toISOString() : null;

  try {
    if (isEdit && initialPostId) {
      const { data, error } = await supabase
        .from('posts')
        .update({
          content:      content.trim(),
          status,
          scheduled_at: scheduledIso,
          published_at: publishedAtIso,
        })
        .eq('id', initialPostId)
        .select('id')
        .single();
      if (error) throw new StepError('Updating post', error);
      postId = data.id;

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
          status,
          scheduled_at: scheduledIso,
          published_at: publishedAtIso,
        })
        .select('id')
        .single();
      if (error) throw new StepError('Saving post', error);
      postId = data.id;
      createdNewPost = true;
    }

    if (platforms.length > 0) {
      const { error } = await supabase
        .from('post_platforms')
        .insert(platforms.map((p) => ({ post_id: postId!, platform: p })));
      if (error) throw new StepError('Saving platforms', error);
    }

    await syncPostMedia({
      postId: postId!,
      userId,
      items: media,
      removed: removedMedia,
      onPendingPatch: onMediaPendingPatch,
    });
  } catch (err) {
    if (createdNewPost && postId) {
      console.warn('[compose] rolling back orphan post', postId);
      const { error: cleanupError } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);
      if (cleanupError) logError('Orphan post cleanup', cleanupError);
    }
    throw err;
  }

  return postId!;
}

function saveDraft(input: Omit<SavePostWorkflowInput, 'status' | 'scheduledIso'>) {
  return savePostWithAssets({
    ...input,
    status: 'draft',
    scheduledIso: null,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function mergeAttachmentMsgs(
  prev: ClientAttachmentMsg[] | undefined,
  next: ClientAttachmentMsg[],
): ClientAttachmentMsg[] {
  const merged = [...(prev ?? [])];
  for (const n of next) {
    if (!merged.some((m) => m.level === n.level && m.message === n.message)) merged.push(n);
  }
  return merged;
}

function savedItemsFromPost(media: PostMedia[]): ComposerMedia[] {
  return media.map((m) => ({
    kind:        'saved',
    uid:         m.id,
    dbId:        m.id,
    fileUrl:     m.file_url,
    storagePath: m.storage_path,
    mimeType:    m.mime_type,
    size:        0,
    name:        m.file_name,
    fileType:    fileKind(m.mime_type || m.file_type),
  }));
}

// ── Component ────────────────────────────────────────────────────────────────

export function ComposeForm({ initialPost, userRole }: ComposeFormProps) {
  const router = useRouter();
  const editorRef   = useRef<ComposerEditorHandle>(null);
  const uploaderRef = useRef<MediaUploaderHandle>(null);
  const probedAttachmentRef = useRef<Set<string>>(new Set());

  const {
    dialog,
    success: showSuccess,
    successDialog: showSuccessDialog,
    error: showError,
    setDialogOpen,
  } = useFeedback();

  const allowDirectPublish = canPublishPost(userRole);

  const isEdit = Boolean(initialPost);

  // ── State ─────────────────────────────────────────────────────────────────
  const [userId,       setUserId]       = useState<string | null>(initialPost?.user_id ?? null);
  const [authorName,   setAuthorName]   = useState<string | null>(initialPost?.author?.name ?? null);
  const [authorEmail,  setAuthorEmail]  = useState<string | null>(initialPost?.author?.email ?? null);

  const [content,      setContent]      = useState(initialPost?.content ?? '');
  const [platforms,    setPlatforms]    = useState<PlatformId[]>(
    (initialPost?.platforms ?? []).filter((p): p is PlatformId =>
      p === 'twitter' || p === 'instagram' || p === 'linkedin' || p === 'facebook',
    ),
  );
  const [items,        setItems]        = useState<ComposerMedia[]>(
    initialPost?.media ? savedItemsFromPost(initialPost.media) : [],
  );
  const [removed,      setRemoved]      = useState<RemovedMedia[]>([]);

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    initialPost?.status === 'scheduled' ? 'schedule' : 'now',
  );
  const [scheduledAt,  setScheduledAt]  = useState(
    isoToLocalInput(initialPost?.scheduled_at ?? null),
  );

  const [loading,        setLoading]        = useState(false);
  const [loadingAction,  setLoadingAction]  = useState<LoadingAction>(null);

  /** Earliest `<input type="datetime-local">` value (5 min lead); updated outside render for ESLint purity. */
  const [scheduleMinInput, setScheduleMinInput] = useState<string | null>(null);

  // ── Auth + author profile ────────────────────────────────────────────────
  useEffect(() => {
    if (userId && authorName !== null) return;

    let cancelled = false;
    (async () => {
      const { data: auth, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) {
        console.error('[compose] getUser error:', error.message);
        showError({
          title: 'Session could not be loaded',
          description: 'Please refresh the page and try again.',
        });
        return;
      }
      if (!auth.user) {
        router.push('/login');
        return;
      }
      setUserId(auth.user.id);
      if (!authorEmail) setAuthorEmail(auth.user.email ?? null);

      // Fetch the public profile to get the canonical display name.
      const { data: profile } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', auth.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile) {
        if (profile.name) setAuthorName(profile.name);
        if (profile.email) setAuthorEmail(profile.email);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorEmail, authorName, router, showError, userId]);

  // ── Cleanup blob URLs on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      items.forEach((m) => {
        if (m.kind === 'pending') URL.revokeObjectURL(m.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Minimum schedule time ticks every minute so long-open tabs stay valid.
  useEffect(() => {
    const refresh = () => {
      setScheduleMinInput(new Date(Date.now() + MIN_LEAD_MS).toISOString().slice(0, 16));
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const effectiveScheduleMode: ScheduleMode = allowDirectPublish ? scheduleMode : 'schedule';
  const isScheduling = effectiveScheduleMode === 'schedule';

  const tightestMediaCap = useMemo(() => {
    if (platforms.length === 0) return undefined;
    return Math.min(...platforms.map((p) => PLATFORMS[p].maxMedia));
  }, [platforms]);

  const validation = useMemo(() => {
    return validatePost(
      { content, platforms, media: items },
      {
        action:        isScheduling ? 'schedule' : 'publish',
        scheduledIso:
          isScheduling && scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null,
        minLeadMs:     MIN_LEAD_MS,
      },
    );
  }, [content, platforms, items, isScheduling, scheduledAt]);

  /** Draft saves stay permissive, but honor per-channel hard caps segment-by-segment for X threads. */
  const draftBlockedByChars = useMemo(() => {
    if (platforms.length === 0) return false;
    return platforms.some((pid) => {
      if (pid === 'twitter') {
        const segments =
          validation.twitterSegments.length > 0
            ? validation.twitterSegments
            : content.trim().length > 0
              ? [content]
              : [];
        const lim = PLATFORMS.twitter.hardLimit;
        return segments.some((segment) => segment.length > lim);
      }
      return content.length > PLATFORMS[pid].hardLimit;
    });
  }, [content, platforms, validation.twitterSegments]);

  const mediaAccept = useMemo(() => {
    const parts = ['image/*', 'video/*'];
    if (platforms.includes('linkedin')) parts.push('application/pdf', '.pdf');
    return parts.join(',');
  }, [platforms]);

  useEffect(() => {
    items.forEach((m) => {
      if (m.kind !== 'pending') return;
      if (m.fileType !== 'image' && m.fileType !== 'video') return;
      if (typeof m.width === 'number' && typeof m.height === 'number') return;
      if (m.mediaProbe === 'loading' || m.mediaProbe === 'failed' || m.mediaProbe === 'ready')
        return;
      if (probedAttachmentRef.current.has(m.uid)) return;
      probedAttachmentRef.current.add(m.uid);

      setItems((cur) =>
        cur.map((x) =>
          x.uid === m.uid && x.kind === 'pending'
            ? { ...x, mediaProbe: 'loading' as const }
            : x,
        ),
      );

      void probeComposerPendingMedia(m)
        .then((meta) => {
          if (!meta) {
            setItems((cur) =>
              cur.map((x) =>
                x.uid === m.uid && x.kind === 'pending'
                  ? { ...x, mediaProbe: 'failed' as const }
                  : x,
              ),
            );
            return;
          }
          const dimMsgs = dimensionProbeMessages({
            platforms,
            fileType: m.fileType,
            width:    meta.width,
            height:   meta.height,
            durationSeconds: meta.durationSeconds,
          });

          setItems((cur) =>
            cur.map((x) => {
              if (x.uid !== m.uid || x.kind !== 'pending') return x;
              return {
                ...x,
                width:      meta.width,
                height:     meta.height,
                ...(typeof meta.durationSeconds === 'number'
                  ? { durationSeconds: meta.durationSeconds }
                  : {}),
                mediaProbe: 'ready' as const,
                clientAttachmentMsgs:
                  dimMsgs.length > 0
                    ? mergeAttachmentMsgs(x.clientAttachmentMsgs, dimMsgs)
                    : x.clientAttachmentMsgs,
              };
            }),
          );
        })
        .catch(() => {
          setItems((cur) =>
            cur.map((x) =>
              x.uid === m.uid && x.kind === 'pending'
                ? { ...x, mediaProbe: 'failed' as const }
                : x,
            ),
          );
        });
    });
  }, [items, platforms]);

  const primaryAction: SubmitAction = isScheduling ? 'schedule' : 'publish';
  const primaryLoading = loading && (loadingAction === 'publish' || loadingAction === 'schedule');
  const draftLoading   = loading && loadingAction === 'draft';

  const canPrimary = !loading && validation.canSubmit;
  const canDraft = !loading && !draftBlockedByChars;

  const heading    = isEdit ? 'Edit Post' : 'Create Post';
  const subheading = isEdit
    ? 'Update content, platforms, media, or scheduling.'
    : 'Compose once. Publish across every channel.';

  const primaryLabel = primaryLoading
    ? (isScheduling ? 'Scheduling…' : isEdit ? 'Saving…' : 'Publishing…')
    : isScheduling
    ? (isEdit ? 'Save & schedule' : 'Schedule post')
    : (isEdit ? 'Save & publish' : 'Publish');
  const draftLabel = draftLoading
    ? 'Saving draft…'
    : isEdit ? 'Save as draft' : 'Save Draft';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleInsertAtCursor = useCallback((text: string) => {
    const ta = editorRef.current?.textarea() ?? null;
    insertAtCursor(ta, text, setContent);
  }, []);

  const handleAddFiles = useCallback((files: File[]) => {
    setItems((prev) => {
      const next = [...prev];
      for (const file of files) {
        const mime = file.type || 'application/octet-stream';
        const fk   = fileKind(mime);
        const msgs = classifyAttachmentMessages(file, fk, platforms);
        next.push({
          kind:       'pending',
          uid:        uid(),
          file,
          previewUrl: URL.createObjectURL(file),
          mimeType:   mime,
          size:       file.size,
          name:       file.name,
          fileType:   fk,
          status:     'idle',
          ...(msgs.length > 0 ? { clientAttachmentMsgs: msgs } : {}),
          ...(fk === 'image' || fk === 'video' ? { mediaProbe: 'idle' as const } : {}),
        });
      }
      return next;
    });
  }, [platforms]);

  const handleReorder = useCallback((next: ComposerMedia[]) => {
    setItems(next);
  }, []);

  const handleRemoveItem = useCallback((targetUid: string) => {
    setItems((prev) => {
      const target = prev.find((m) => m.uid === targetUid);
      if (!target) return prev;
      if (target.kind === 'pending') {
        probedAttachmentRef.current.delete(target.uid);
        URL.revokeObjectURL(target.previewUrl);
      } else {
        // Defer deletion until save.
        setRemoved((r) => [...r, { dbId: target.dbId, storagePath: target.storagePath }]);
      }
      return prev.filter((m) => m.uid !== targetUid);
    });
  }, []);

  const handleAttachMedia = useCallback(() => {
    uploaderRef.current?.open();
  }, []);

  /** Live Supabase upload feedback for pending media tiles. */
  const patchMediaPending = useCallback((uid: string, patch: PendingPatch) => {
    setItems((prev) =>
      prev.map((m) =>
        m.kind === 'pending' && m.uid === uid ? { ...m, ...patch } : m,
      ),
    );
  }, []);

  function showModalFeedback({
    variant,
    title,
    description,
  }: {
    variant: 'success' | 'error';
    title: string;
    description: string;
  }) {
    if (variant === 'success') showSuccessDialog({ title, description });
    else                       showError({ title, description });
  }

  function resetForm() {
    probedAttachmentRef.current.clear();
    items.forEach((m) => {
      if (m.kind === 'pending') URL.revokeObjectURL(m.previewUrl);
    });
    setContent('');
    setPlatforms([]);
    setItems([]);
    setRemoved([]);
    setScheduleMode('now');
    setScheduledAt('');
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(action: SubmitAction) {
    if (!userId) {
      showModalFeedback({
        variant: 'error',
        title: 'Session is not ready',
        description: 'Please wait a moment and try again.',
      });
      return;
    }
    if (loading) return;

    if (action === 'publish' && !allowDirectPublish) {
      showError({
        title: 'Publishing restricted',
        description:
          'Editors do not have permission to publish directly. Schedule your post or ask an administrator to publish.',
      });
      return;
    }

    // Drafts are forgiving — only validate hard size cap.
    if (action !== 'draft' && !validation.canSubmit) {
      const first = validation.errors[0];
      showModalFeedback({
        variant: 'error',
        title: 'Check your post',
        description: first?.message ?? 'There are issues blocking publish. See the warnings panel.',
      });
      return;
    }

    setLoading(true);
    setLoadingAction(action);

    try {
      const status: WritablePostStatus =
        action === 'draft'    ? 'draft'
      : action === 'schedule' ? 'scheduled'
      :                          'published';

      const scheduledIso =
        action === 'schedule'
          ? new Date(scheduledAt).toISOString()
          : null;

      if (action === 'draft') {
        const postId = await saveDraft({
          isEdit,
          initialPostId: initialPost?.id,
          userId,
          content,
          platforms,
          media: items,
          removedMedia: removed,
          onMediaPendingPatch: patchMediaPending,
        });

        await syncPublishingPipeline(postId);

        showModalFeedback({
          variant: 'success',
          title: isEdit ? 'Draft updated' : 'Draft saved',
          description: 'Your draft is saved and will appear in Posts.',
        });

        if (isEdit) setTimeout(() => router.push('/dashboard/posts'), 900);
        else        resetForm();
        return;
      }

      const postId = await savePostWithAssets({
        isEdit,
        initialPostId: initialPost?.id,
        userId,
        content,
        status,
        scheduledIso,
        platforms,
        media: items,
        removedMedia: removed,
        onMediaPendingPatch: patchMediaPending,
      });

      await syncPublishingPipeline(postId);

      const title =
        action === 'schedule'
          ? `Post scheduled for ${new Date(scheduledAt).toLocaleString()}.`
          : isEdit ? 'Post updated and published.' : 'Post published successfully!';
      showSuccess({
        title,
        description:
          action === 'schedule'
            ? 'It will appear in your scheduled posts feed.'
            : 'Your posts feed is now up to date.',
      });

      if (isEdit) setTimeout(() => router.push('/dashboard/posts'), 900);
      else        resetForm();
    } catch (err) {
      const step  = err instanceof StepError ? err.step : 'submit';
      const cause = err instanceof StepError ? err.cause : err;
      logError(step, cause);
      console.error('[compose] user-safe error:', describeError(step, cause));

      showModalFeedback({
        variant: 'error',
        title: getActionErrorTitle(action),
        description: getSafeErrorMessage(step),
      });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const author = {
    name:  authorName,
    email: authorEmail,
    seed:  userId ?? authorEmail ?? 'me',
  };

  return (
    <>
      <AppToast />
      <AppDialog state={dialog} onOpenChange={setDialogOpen} />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/dashboard/posts"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
            aria-label="Back to Posts"
          >
            <ArrowLeft size={16} aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-900">
              {heading}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">{subheading}</p>
          </div>
        </div>

        {/* Two-column layout: editor + previews */}
        <div className="grid gap-6 xl:gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          {/* ── Editor column ────────────────────────────────────────────── */}
          <main className="space-y-5">
            <Section title="Platforms" hint="Select the channels for this post.">
              <PlatformSelector
                value={platforms}
                onChange={setPlatforms}
                disabled={loading}
              />
            </Section>

            <Section title="Content">
              <ComposerEditor
                ref={editorRef}
                value={content}
                onChange={setContent}
                disabled={loading}
              />
              <ComposerToolbar
                onInsert={handleInsertAtCursor}
                onAttachMedia={handleAttachMedia}
                disabled={loading}
                trailing={
                  <CharacterCounter
                    content={content}
                    platforms={platforms}
                    twitterThreadSegments={
                      platforms.includes('twitter') && validation.twitterSegments.length > 0
                        ? validation.twitterSegments
                        : undefined
                    }
                  />
                }
              />
            </Section>

            <Section title="Media" hint="Drag to reorder. The first item is the cover.">
              <MediaUploader
                ref={uploaderRef}
                items={items}
                onAdd={handleAddFiles}
                onReorder={handleReorder}
                onRemove={handleRemoveItem}
                maxItems={tightestMediaCap}
                disabled={loading}
                accept={mediaAccept}
              />
            </Section>

            <Section title="Scheduling">
              <div className="flex flex-wrap gap-2">
                {(allowDirectPublish ? (['now', 'schedule'] as const) : (['schedule'] as const)).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setScheduleMode(mode)}
                    disabled={loading}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all',
                      (allowDirectPublish ? scheduleMode === mode : mode === 'schedule')
                        ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    ].join(' ')}
                  >
                    {mode === 'schedule' && <CalendarClock size={14} aria-hidden />}
                    {mode === 'now' ? 'Post now' : 'Schedule'}
                  </button>
                ))}
              </div>

              {effectiveScheduleMode === 'schedule' && (
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
                    min={scheduleMinInput ?? undefined}
                    disabled={loading}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100 disabled:opacity-60 sm:w-auto"
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    Must be at least 5 minutes from now.
                  </p>
                </div>
              )}
            </Section>

            {/* Validation banner — also shown above actions on mobile */}
            <ComposerValidationPanel platforms={platforms} report={validation} className="lg:hidden" />

            {/* Actions */}
            <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-end md:-mx-6 md:px-6">
              <Link
                href="/dashboard/posts"
                className="order-3 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm text-gray-500 transition-colors duration-150 hover:text-gray-800 sm:order-1"
              >
                Cancel
              </Link>
              <button
                type="button"
                onClick={() => handleSubmit('draft')}
                disabled={!canDraft}
                className="order-2 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {draftLoading && <Loader2 size={15} className="animate-spin" aria-hidden />}
                {draftLabel}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(primaryAction)}
                disabled={!canPrimary}
                className="order-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#7A0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-[#5A0000] disabled:cursor-not-allowed disabled:opacity-50 sm:order-3"
              >
                {primaryLoading
                  ? <Loader2 size={15} className="animate-spin" aria-hidden />
                  : <Send size={15} aria-hidden />}
                {primaryLabel}
              </button>
            </div>
          </main>

          {/* ── Preview column ──────────────────────────────────────────── */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:self-start lg:pr-1">
            <ComposerValidationPanel platforms={platforms} report={validation} className="hidden lg:block" />
            <div className="pb-2">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Live preview
              </h2>
              <PlatformPreview
                platforms={platforms}
                content={content}
                media={items}
                author={author}
                twitterThreadSegments={
                  platforms.includes('twitter') ? validation.twitterSegments : undefined
                }
              />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

// ── Local sub-components ────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title:    string;
  hint?:    string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {hint && <p className="hidden text-[11px] text-gray-400 sm:block">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
