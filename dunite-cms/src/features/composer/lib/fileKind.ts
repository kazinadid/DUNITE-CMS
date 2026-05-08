import type { FileKind } from '../types';

export function fileKind(mime: string): FileKind {
  const top = mime.split('/')[0]?.toLowerCase();
  if (top === 'image') return 'image';
  if (top === 'video') return 'video';
  if (top === 'audio') return 'audio';
  return 'other';
}
