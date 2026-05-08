'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FolderInput,
  Grid3x3,
  LayoutList,
  Loader2,
  RefreshCw,
  Search,
  UploadCloud,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ReadOnlyBanner } from '@/features/dashboard';
import type { Role } from '@/features/auth';
import { canUploadMedia, canWrite, isViewer } from '@/lib/rbac';
import { cn } from '@/lib/utils';

import { MEDIA_PAGE_SIZE } from '../constants';
import {
  bulkDeleteLibraryMedia,
  bulkUpdateMediaCategory,
  deleteLibraryMedia,
  fetchMediaCategories,
  fetchMediaUploaderOptions,
  getDefaultMediaFilter,
  listUserMediaPage,
  updateMediaCategory,
  uploadLibraryAsset,
} from '../services/mediaLibraryService';
import type {
  LibraryMediaRow,
  MediaCategory,
  MediaListFilter,
  MediaSort,
  MediaUploaderFilter,
  MediaUploaderOption,
} from '../types';
import {
  bulkCanSelectLibraryRow,
  canBulkMediaActions,
  canDeleteLibraryRow,
  canModifyLibraryRow,
  canPickTeamUploader,
  canReuseInComposer,
} from '../lib/mediaPermissions';
import { enqueueComposerMediaReuse } from '../lib/composerReuseQueue';

import { MediaBulkBar } from './MediaBulkBar';
import { MediaLibraryAssetCard } from './MediaLibraryAssetCard';
import { MediaPreviewModal } from './MediaPreviewModal';

function reusePayload(row: LibraryMediaRow) {
  return {
    id:              row.id,
    file_url:        row.file_url,
    file_type:       row.file_type,
    file_name:       row.file_name,
    mime_type:       row.mime_type,
    size:            row.size,
    storage_path:    row.storage_path,
    thumbnail_url:   row.thumbnail_url,
    thumbnail_path:  row.thumbnail_path,
  };
}

function formatOwnerParam(u: MediaUploaderFilter): string {
  if (u.kind === 'all') return 'all';
  if (u.kind === 'mine') return 'mine';
  return u.userId;
}

function parseOwnerParam(raw: string | null, role: Role): MediaUploaderFilter | null {
  if (!raw) return null;
  if (raw === 'all') return { kind: 'all' };
  if (raw === 'mine') return { kind: 'mine' };
  if (canPickTeamUploader(role) && /^[0-9a-f-]{36}$/i.test(raw)) {
    return { kind: 'user', userId: raw };
  }
  return null;
}

const URL_SORT_VALUES: MediaSort[] = [
  'newest',
  'oldest',
  'name_asc',
  'name_desc',
  'size_desc',
  'size_asc',
  'recent_used',
];

function SkeletonGrid() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface MediaLibraryPageClientProps {
  userId: string;
  role: Role;
}

export function MediaLibraryPageClient({ userId, role }: MediaLibraryPageClientProps) {
  const pathname     = usePathname();
  const router       = useRouter();
  const searchParams = useSearchParams();

  const allowUpload  = canUploadMedia(role);
  const allowWrites  = canWrite(role);
  const viewerRole   = isViewer(role);

  const [categories, setCategories] = useState<MediaCategory[]>([]);
  const [teamUploaders, setTeamUploaders] = useState<MediaUploaderOption[]>([]);
  const [previewRow, setPreviewRow] = useState<LibraryMediaRow | null>(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>());
  const [bulkBusy, setBulkBusy]       = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [filter, setFilter] = useState<MediaListFilter>(() => ({
    ...getDefaultMediaFilter(),
  }));
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LibraryMediaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<
    { name: string; progress: number; error?: string } | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const allowBulkChrome = useMemo(
    () => canBulkMediaActions(role) && filter.libraryScope === 'library',
    [role, filter.libraryScope],
  );

  const bulkBarrierMessage = useMemo(() => {
    if (!allowBulkChrome) return 'Bulk tools appear when browsing central library rows.';
    if (!allowWrites || viewerRole) return 'Your role cannot modify assets.';
    for (const id of selectedIds) {
      const r = rows.find((x) => x.id === id);
      if (!r || !bulkCanSelectLibraryRow(role, r, userId)) {
        return 'Selection contains assets outside your ownership.';
      }
    }
    return null;
  }, [allowBulkChrome, allowWrites, viewerRole, selectedIds, rows, role, userId]);

  const selectableOnPage = useMemo(
    () =>
      rows.filter((r) => bulkCanSelectLibraryRow(role, r, userId)).map((r) => r.id),
    [rows, role, userId],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cats = await fetchMediaCategories();
        if (!cancelled) setCategories(cats);
      } catch {
        //
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canPickTeamUploader(role)) return;
      try {
        const opts = await fetchMediaUploaderOptions();
        if (!cancelled) setTeamUploaders(opts);
      } catch {
        //
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    const ownerParsed = parseOwnerParam(searchParams.get('owner'), role);
    const qRaw        = searchParams.get('q');
    const pageRaw     = Number(searchParams.get('page'));
    const viewRaw     = searchParams.get('view');
    const typeRaw     = searchParams.get('type');
    const catRaw      = searchParams.get('cat');
    const scopeRaw    = searchParams.get('scope');
    const sortRaw     = searchParams.get('sort');
    const fromRaw     = searchParams.get('from');
    const toRaw       = searchParams.get('to');

    queueMicrotask(() => {
      setFilter((f) => ({
        ...f,
        ...(ownerParsed ? { uploader: ownerParsed } : {}),
        ...(typeRaw === 'image' || typeRaw === 'video' ? { fileType: typeRaw } : {}),
        ...(catRaw ? { categorySlug: catRaw } : {}),
        ...(scopeRaw === 'library' || scopeRaw === 'post' || scopeRaw === 'all'
          ? { libraryScope: scopeRaw }
          : {}),
        ...(sortRaw && URL_SORT_VALUES.includes(sortRaw as MediaSort)
          ? { sort: sortRaw as MediaSort }
          : {}),
        ...(fromRaw ? { uploadedFrom: fromRaw } : {}),
        ...(toRaw ? { uploadedTo: toRaw } : {}),
      }));
      if (qRaw) {
        setSearchInput(qRaw);
        setDebouncedSearch(qRaw);
      }
      if (Number.isFinite(pageRaw) && pageRaw >= 1) setPage(pageRaw);
      if (viewRaw === 'list' || viewRaw === 'grid') setView(viewRaw);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial hydrate from incoming URL snapshot
  }, []);

  const filterWithSearch = useMemo(
    (): MediaListFilter => ({
      ...filter,
      search: debouncedSearch.trim(),
    }),
    [debouncedSearch, filter],
  );

  const load = useCallback(
    async (options?: { silent?: boolean; preserveSelection?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError(null);
      try {
        const res = await listUserMediaPage({
          requestingUserId: userId,
          page,
          filter: filterWithSearch,
        });
        setRows(res.rows);
        setTotal(res.total);
        if (!options?.preserveSelection) setSelectedIds(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load media');
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [userId, page, filterWithSearch],
  );

  const reloadList = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ silent: true, preserveSelection: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async list sync via load()
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE));

  const defaultCategoryId = useMemo(() => {
    if (filter.categorySlug === 'all' || filter.categorySlug === 'uncategorized') return null;
    const c = categories.find((x) => x.slug === filter.categorySlug);
    return c?.id ?? null;
  }, [categories, filter.categorySlug]);

  const runUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!allowUpload) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      for (const file of list) {
        setUploadState({ name: file.name, progress: 0 });
        try {
          await uploadLibraryAsset(userId, file, defaultCategoryId, (p) =>
            setUploadState({ name: file.name, progress: p }),
          );
        } catch (e) {
          setUploadState({
            name: file.name,
            progress: 0,
            error: e instanceof Error ? e.message : 'Upload failed',
          });
          return;
        }
      }
      setUploadState(null);
      setPage(1);
      await load();
    },
    [allowUpload, defaultCategoryId, load, userId],
  );

  const handleMove = useCallback(
    async (id: string, categoryId: string | null) => {
      setBusyId(id);
      try {
        await updateMediaCategory(id, categoryId);
        await load();
      } catch {
        setError('Could not update folder');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('Remove this file from the library? Storage objects will be deleted.')) {
        return;
      }
      setBusyId(id);
      try {
        await deleteLibraryMedia(id);
        setPreviewRow(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleBulkMove = useCallback(
    async (categoryId: string | null) => {
      if (bulkBarrierMessage || selectedIds.size === 0 || bulkBusy) return;
      setBulkBusy(true);
      try {
        await bulkUpdateMediaCategory(Array.from(selectedIds), categoryId);
        setSelectedIds(new Set());
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Bulk folder update failed');
      } finally {
        setBulkBusy(false);
      }
    },
    [bulkBarrierMessage, bulkBusy, load, selectedIds],
  );

  const handleBulkDelete = useCallback(async () => {
    if (bulkBarrierMessage || selectedIds.size === 0 || bulkBusy) return;
    if (
      !window.confirm(
        `Delete ${selectedIds.size} asset(s) from the library? Storage objects will be removed.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await bulkDeleteLibraryMedia(Array.from(selectedIds));
      setPreviewRow(null);
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBarrierMessage, bulkBusy, load, selectedIds]);

  const handleCopyUrl = useCallback(async (row: LibraryMediaRow) => {
    try {
      await navigator.clipboard.writeText(row.file_url);
    } catch {
      setError('Could not copy URL to clipboard.');
    }
  }, []);

  const handleSelectAllPage = useCallback(() => {
    setSelectedIds(new Set(selectableOnPage));
  }, [selectableOnPage]);

  const handleBulkReuseComposer = useCallback(() => {
    if (bulkBarrierMessage || viewerRole) return;
    const payloads = rows
      .filter((r) => selectedIds.has(r.id) && r.is_library)
      .map(reusePayload);
    if (payloads.length === 0) return;
    enqueueComposerMediaReuse(payloads);
    router.push('/dashboard/posts/compose');
  }, [bulkBarrierMessage, viewerRole, rows, selectedIds, router]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    const owner = formatOwnerParam(filter.uploader);
    if (owner !== 'all') params.set('owner', owner);
    if (filter.fileType !== 'all') params.set('type', filter.fileType);
    if (filter.categorySlug !== 'all') params.set('cat', filter.categorySlug);
    if (filter.libraryScope !== 'library') params.set('scope', filter.libraryScope);
    if (filter.sort !== 'newest') params.set('sort', filter.sort);
    if (filter.uploadedFrom) params.set('from', filter.uploadedFrom);
    if (filter.uploadedTo) params.set('to', filter.uploadedTo);
    if (page > 1) params.set('page', String(page));
    if (view !== 'grid') params.set('view', view);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    pathname,
    router,
    debouncedSearch,
    filter.categorySlug,
    filter.fileType,
    filter.libraryScope,
    filter.sort,
    filter.uploader,
    filter.uploadedFrom,
    filter.uploadedTo,
    page,
    view,
  ]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-[#7A0000] uppercase">
            Asset library
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">
            Media
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Enterprise-ready storage — deduplicated reuse, thumbnails, workspace visibility, Composer hand-off.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || refreshing}
          onClick={() => void reloadList()}
          className="gap-2 self-start"
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          <RefreshCw size={14} aria-hidden />
          Refresh catalog
        </Button>
      </header>

      {viewerRole ? <ReadOnlyBanner /> : null}

      {allowBulkChrome && (
        <MediaBulkBar
          count={selectedIds.size}
          categories={categories}
          busy={bulkBusy}
          bulkDisabledReason={
            bulkBarrierMessage && selectedIds.size > 0 ? bulkBarrierMessage : undefined
          }
          onClear={() => setSelectedIds(new Set())}
          onMoveFolder={(cid) => void handleBulkMove(cid)}
          onDelete={() => void handleBulkDelete()}
          onReuseDraft={
            canReuseInComposer(role) && !viewerRole ? () => void handleBulkReuseComposer() : undefined
          }
        />
      )}

      <div
        onDragOver={(e) => {
          if (!allowUpload) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!allowUpload) return;
          e.preventDefault();
          setDragOver(false);
          void runUpload(e.dataTransfer.files);
        }}
        className={cn(
          'rounded-2xl border-2 border-dashed p-5 transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted bg-muted/20',
          !allowUpload && 'pointer-events-none opacity-60',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border">
              <UploadCloud className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium">Upload to library</p>
              <p className="text-xs text-muted-foreground">
                Drag & drop or browse. Images are compressed client-side; thumbnails are generated for
                images.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void runUpload(e.target.files ?? []);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={!allowUpload}
              onClick={() => fileRef.current?.click()}
            >
              Browse files
            </Button>
          </div>
        </div>
        {uploadState && (
          <div className="mt-4 rounded-lg border bg-background px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{uploadState.name}</span>
              {uploadState.error ? (
                <span className="text-destructive">{uploadState.error}</span>
              ) : (
                <span className="tabular-nums text-muted-foreground">{uploadState.progress}%</span>
              )}
            </div>
            {!uploadState.error && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="Search filename…"
              className="h-9 pl-8"
            />
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Type
            <select
              value={filter.fileType}
              onChange={(e) => {
                setFilter((f) => ({
                  ...f,
                  fileType: e.target.value as MediaListFilter['fileType'],
                }));
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Folder
            <select
              value={filter.categorySlug}
              onChange={(e) => {
                setFilter((f) => ({ ...f, categorySlug: e.target.value }));
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All folders</option>
              <option value="uncategorized">Uncategorized</option>
              {categories
                .filter((c) => c.slug !== 'uncategorized')
                .map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Scope
            <select
              value={filter.libraryScope}
              onChange={(e) => {
                setFilter((f) => ({
                  ...f,
                  libraryScope: e.target.value as MediaListFilter['libraryScope'],
                }));
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="library">Library only</option>
              <option value="post">Post attachments</option>
              <option value="all">Everything</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Sort
            <select
              value={filter.sort}
              onChange={(e) => {
                setFilter((f) => ({
                  ...f,
                  sort: e.target.value as MediaListFilter['sort'],
                }));
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="size_desc">Largest first</option>
              <option value="size_asc">Smallest first</option>
              <option value="recent_used">Recently used (soon)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Uploaded by
            <select
              value={formatOwnerParam(filter.uploader)}
              onChange={(e) => {
                const v = e.target.value;
                let uploader: MediaUploaderFilter = { kind: 'all' };
                if (v === 'mine') uploader = { kind: 'mine' };
                else if (canPickTeamUploader(role) && /^[0-9a-f-]{36}$/i.test(v)) {
                  uploader = { kind: 'user', userId: v };
                }
                setFilter((f) => ({ ...f, uploader }));
                setPage(1);
              }}
              disabled={viewerRole}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70"
            >
              <option value="all">Everyone</option>
              <option value="mine">Mine</option>
              {canPickTeamUploader(role) &&
                teamUploaders.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name?.trim() || u.email || 'Team member'}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Uploaded from
            <Input
              type="date"
              value={filter.uploadedFrom ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                setFilter((f) => ({ ...f, uploadedFrom: v }));
                setPage(1);
              }}
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Uploaded to
            <Input
              type="date"
              value={filter.uploadedTo ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                setFilter((f) => ({ ...f, uploadedTo: v }));
                setPage(1);
              }}
              className="h-9"
            />
          </label>
          <div className="flex items-end sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground"
              onClick={() => {
                setFilter((f) => ({ ...f, uploadedFrom: null, uploadedTo: null }));
                setPage(1);
              }}
            >
              Clear dates
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {allowBulkChrome && filter.libraryScope === 'library' && rows.length > 0 && !loading ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={selectableOnPage.length === 0}
              onClick={handleSelectAllPage}
            >
              Select page ({selectableOnPage.length})
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex gap-1 rounded-lg border p-0.5 sm:ml-auto">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium',
              view === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
            aria-pressed={view === 'grid'}
          >
            <Grid3x3 className="size-3.5" aria-hidden />
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium',
              view === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
            aria-pressed={view === 'list'}
          >
            <LayoutList className="size-3.5" aria-hidden />
            List
          </button>
        </div>
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span className="min-w-0 flex-1">{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void reloadList()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-20 text-center">
          <FolderInput className="size-12 text-muted-foreground opacity-50" aria-hidden />
          <div>
            <p className="text-sm font-medium">No media yet</p>
            <p className="text-xs text-muted-foreground">
              Upload assets or widen your filters — post attachments may be under “Post attachments”.
            </p>
          </div>
          {allowUpload ? (
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>
              Upload to library
            </Button>
          ) : null}
        </div>
      ) : (
        <ul
          className={cn(
            view === 'grid'
              ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
              : 'flex flex-col gap-2',
          )}
        >
          {rows.map((row) => {
            const selectable =
              allowBulkChrome &&
              filter.libraryScope === 'library' &&
              bulkCanSelectLibraryRow(role, row, userId);
            const showMove =
              canModifyLibraryRow(role, row, userId) && row.is_library && !viewerRole;
            const showDelete =
              canDeleteLibraryRow(role, row, userId) && row.is_library && !viewerRole;
            return (
              <MediaLibraryAssetCard
                key={row.id}
                row={row}
                categories={categories}
                view={view}
                bulkEnabled={allowBulkChrome && filter.libraryScope === 'library'}
                selected={selectedIds.has(row.id)}
                onToggleSelected={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(row.id)) {
                      next.delete(row.id);
                      return next;
                    }
                    if (selectable) next.add(row.id);
                    return next;
                  });
                }}
                onOpenPreview={() => {
                  setPreviewRow(row);
                }}
                onCopyUrl={() => void handleCopyUrl(row)}
                onMoveToCategory={(categoryId) => void handleMove(row.id, categoryId)}
                onDelete={() => void handleDelete(row.id)}
                showComposerAction={canReuseInComposer(role) && row.is_library}
                showMoveAction={showMove}
                showDeleteAction={showDelete}
                onUseInComposer={
                  canReuseInComposer(role) && row.is_library
                    ? () => {
                        enqueueComposerMediaReuse([reusePayload(row)]);
                        router.push('/dashboard/posts/compose');
                      }
                    : undefined
                }
              />
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} items
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <MediaPreviewModal
        open={previewRow !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewRow(null);
        }}
        row={previewRow}
        categories={categories}
        role={role}
        currentUserId={userId}
        busy={Boolean(previewRow && busyId === previewRow.id)}
        onDelete={handleDelete}
        onMoveCategory={handleMove}
      />
    </div>
  );
}
