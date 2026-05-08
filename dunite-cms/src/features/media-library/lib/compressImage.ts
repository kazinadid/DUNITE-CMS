'use client';

import imageCompression from 'browser-image-compression';

import { FULL_IMAGE_QUALITY, MAX_IMAGE_UPLOAD_EDGE_PX } from '../constants';

export async function compressImageForUpload(file: File): Promise<File> {
  const options = {
    maxWidthOrHeight: MAX_IMAGE_UPLOAD_EDGE_PX,
    useWebWorker:     true,
    maxSizeMB:        4,
    initialQuality:   FULL_IMAGE_QUALITY,
    fileType:         file.type as 'image/jpeg' | 'image/png' | 'image/webp',
  };

  try {
    return await imageCompression(file, options);
  } catch {
    return file;
  }
}
