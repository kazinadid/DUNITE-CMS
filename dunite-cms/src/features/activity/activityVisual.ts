import {
  CalendarClock,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Shield,
  Trash2,
  User,
  type LucideIcon,
} from 'lucide-react';

export type ActivityVisualTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const TONE_RING: Record<ActivityVisualTone, string> = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200/80',
  info:    'bg-sky-50 text-sky-800 ring-sky-200/70',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200/70',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200/75',
  danger:  'bg-red-50 text-red-800 ring-red-200/80',
  accent:  'bg-[#7A0000]/10 text-[#5A0000] ring-[#7A0000]/25',
};

export function activityToneClasses(tone: ActivityVisualTone) {
  return TONE_RING[tone];
}

export function activityActionTone(actionType: string): ActivityVisualTone {
  const a = actionType.toLowerCase();
  if (a.includes('deleted') || a.includes('failed') || a.includes('error')) return 'danger';
  if (a.includes('retry') || a.includes('warning') || a.includes('warn')) return 'warning';
  if (a.includes('published') || a.includes('success') || a.includes('succeeded')) return 'success';
  if (a.includes('role') || a.includes('user.')) return 'accent';
  if (a.startsWith('publishing.') || a.startsWith('publishing.worker')) return 'info';
  if (a.includes('schedule') || a.includes('platform')) return 'info';
  if (a.includes('media') || a.includes('upload')) return 'info';
  return 'neutral';
}

export function activityActionIcon(actionType: string): LucideIcon {
  const a = actionType.toLowerCase();
  if (a.includes('deleted')) return Trash2;
  if (a.includes('media') || a.includes('upload')) return ImageIcon;
  if (a.includes('schedule')) return CalendarClock;
  if (a.includes('role') || a.includes('user.')) return Shield;
  if (a.includes('retry')) return RefreshCw;
  if (a.includes('content') || a.includes('post.created')) return FileText;
  return FileText;
}

export function formatActivityActionLabel(actionType: string) {
  return actionType.replace(/\./g, ' · ');
}
