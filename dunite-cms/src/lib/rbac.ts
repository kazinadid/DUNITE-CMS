import type { Role } from '@/features/auth/types';

/**
 * Single source of truth for "who can do what".
 * Add new permissions here and the rest of the codebase picks them up
 * automatically via the helper functions below.
 *
 * IMPORTANT: this file is the *frontend* gate.  The DB is the actual
 * security boundary — see `supabase/policies.sql`.  Never trust these
 * functions for data access on their own.
 *
 * Permission notes:
 *   - posts.manage  : create/edit/delete posts (drafts + scheduled)
 *   - posts.publish : *directly* push a post to "published" (now). Editors
 *                     can compose and schedule but never bypass review.
 */

const PERMISSIONS = {
  admin:  ['posts.manage', 'posts.publish', 'media.upload', 'users.manage', 'social.manage', 'imports.manage'],
  editor: ['posts.manage',                  'media.upload', 'imports.manage'],
  viewer: [],
} as const satisfies Record<Role, readonly string[]>;

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS][number];

// ── Role checks ───────────────────────────────────────────────────────────────

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin';
}

export function isEditor(role: Role | null | undefined): boolean {
  return role === 'editor';
}

export function isViewer(role: Role | null | undefined): boolean {
  return role === 'viewer';
}

// ── Generic permission lookup ─────────────────────────────────────────────────

export function hasPermission(
  role: Role | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return (PERMISSIONS[role] as readonly string[]).includes(permission);
}

// ── Capability helpers (named for readability at call sites) ─────────────────

export const canCreatePost     = (r: Role | null | undefined) => hasPermission(r, 'posts.manage');
export const canEditPost       = (r: Role | null | undefined) => hasPermission(r, 'posts.manage');
export const canDeletePost     = (r: Role | null | undefined) => hasPermission(r, 'posts.manage');
/** Direct publish (skip schedule, push to "published" right now). Admin only. */
export const canPublishPost    = (r: Role | null | undefined) => hasPermission(r, 'posts.publish');
export const canUploadMedia    = (r: Role | null | undefined) => hasPermission(r, 'media.upload');
/** Batch campaign file parsing / staged import (editors + admins). */
export const canRunBatchImport = (r: Role | null | undefined) => hasPermission(r, 'imports.manage');
/** Queuing import jobs / staging rows — frontend gate mirrors parse today; tighten independently later. */
export const canStageBatchImport = canRunBatchImport;
export const canManageUsers    = (r: Role | null | undefined) => hasPermission(r, 'users.manage');
export const canManageSocial   = (r: Role | null | undefined) => hasPermission(r, 'social.manage');

/** Generic write capability: editor or admin. */
export const canWrite = (r: Role | null | undefined) =>
  hasPermission(r, 'posts.manage');
