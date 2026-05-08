import type { ComposerMedia } from '../types';

export async function probeImageDimsFromBlob(file: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img    = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => reject(new Error('Could not read image dimensions'));
      img.src      = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function probeVideoMetaFromBlob(
  file: Blob,
): Promise<{ width: number; height: number; durationSeconds: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const v                       = document.createElement('video');
      v.preload                       = 'metadata';
      v.muted                         = true;
      v.playsInline                   = true;
      v.onloadedmetadata = () => {
        resolve({
          width:           v.videoWidth,
          height:          v.videoHeight,
          durationSeconds: Number.isFinite(v.duration) ? v.duration : 0,
        });
      };
      v.onerror           = () => reject(new Error('Could not read video metadata'));
      v.src               = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function probeComposerPendingMedia(item: ComposerMedia): Promise<
  | { width: number; height: number; durationSeconds?: number }
  | null
> {
  if (item.kind !== 'pending') return null;
  if (item.fileType === 'image') {
    const { width, height } = await probeImageDimsFromBlob(item.file);
    return { width, height };
  }
  if (item.fileType === 'video') {
    const { width, height, durationSeconds } = await probeVideoMetaFromBlob(item.file);
    return { width, height, durationSeconds };
  }
  return null;
}
