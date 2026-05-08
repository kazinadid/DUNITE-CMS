'use client';

import imageCompression from 'browser-image-compression';

import { THUMB_MAX_EDGE_PX, THUMB_QUALITY } from '../constants';

export async function makeImageThumbnailBlob(file: File): Promise<Blob> {
  return imageCompression(file, {
    maxWidthOrHeight: THUMB_MAX_EDGE_PX,
    useWebWorker:     true,
    maxSizeMB:        0.35,
    initialQuality:   THUMB_QUALITY,
    fileType:         'image/jpeg',
  });
}
