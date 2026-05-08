import type { NotificationType } from './types';

const TOAST_TYPES = new Set<string>([
  'publish_success',
  'publish_failure',
  'retry_scheduled',
  'retry_failed',
  'scheduling_conflict',
  'media_processing_issue',
  'role_change',
  'system_warning',
]);

export function shouldToastNotificationType(type: NotificationType): boolean {
  return TOAST_TYPES.has(String(type));
}

export function toastVariantForType(type: NotificationType): 'success' | 'error' | 'warning' | 'info' {
  const t = String(type);
  if (t.includes('success') || t === 'publish_success') return 'success';
  if (t.includes('fail') || t.includes('failure') || t === 'publish_failure') return 'error';
  if (t.includes('conflict') || t.includes('issue') || t === 'media_processing_issue') return 'warning';
  return 'info';
}
