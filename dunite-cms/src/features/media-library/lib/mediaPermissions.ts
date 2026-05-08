import type { Role } from '@/features/auth';
import {
  canUploadMedia,
  isAdmin,
  isViewer,
  canWrite,
} from '@/lib/rbac';

import type { LibraryMediaRow } from '../types';

/** Viewers are read-only everywhere in the media workspace. */
export function isMediaViewer(role: Role): boolean {
  return isViewer(role);
}

export function canBulkMediaActions(role: Role): boolean {
  return canWrite(role); // editor + admin only
}

/** Upload to central library (stored with is_library = true). */
export function canUploadToLibrary(role: Role): boolean {
  return canUploadMedia(role);
}

export function canReuseInComposer(role: Role): boolean {
  return canWrite(role); // editors + admins compose
}

/** Selection eligibility for bulk library actions (viewer: none). */
export function bulkCanSelectLibraryRow(
  role: Role,
  row: Pick<LibraryMediaRow, 'user_id' | 'is_library'>,
  currentUserId: string,
): boolean {
  if (!row.is_library || isViewer(role)) return false;
  if (isAdmin(role)) return true;
  return row.user_id === currentUserId;
}

/**
 * Library row: admin can change anything; editor only own `user_id`; viewer never.
 */
export function canModifyLibraryRow(
  role: Role,
  row: Pick<LibraryMediaRow, 'user_id' | 'is_library'>,
  currentUserId: string,
): boolean {
  if (isViewer(role)) return false;
  if (!row.is_library) return false;
  if (isAdmin(role)) return true;
  return row.user_id === currentUserId;
}

/** Delete library asset — RLS is authoritative; mirrors policy intent. */
export function canDeleteLibraryRow(
  role: Role,
  row: Pick<LibraryMediaRow, 'user_id' | 'is_library'>,
  currentUserId: string,
): boolean {
  return canModifyLibraryRow(role, row, currentUserId);
}

export function canPickTeamUploader(role: Role): boolean {
  return isAdmin(role);
}
