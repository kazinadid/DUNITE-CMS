/**
 * Best-effort pixel dimensions for media library metadata.
 * Non-blocking; failures return nulls.
 */
export async function probeImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width;
    const h = bitmap.height;
    bitmap.close();
    if (!w || !h) return null;
    return { width: w, height: h };
  } catch {
    return null;
  }
}

export async function probeVideoDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('video/')) return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    const done = (out: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      resolve(out);
    };
    v.onloadedmetadata = () => {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (w > 0 && h > 0) done({ width: w, height: h });
      else done(null);
    };
    v.onerror = () => done(null);
    v.src = url;
  });
}
