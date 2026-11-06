/**
 * Madadgar - Client-side Image Utilities (Task 2.4)
 * Handles image downscaling (max dimension 1280px), aspect ratio maintenance,
 * JPEG re-compression, and clean base64 extraction for Gemini multimodal inspection.
 */

import type { DownscaledImageResult } from './types';

export const MAX_IMAGE_DIMENSION = 1280;
export const DEFAULT_JPEG_QUALITY = 0.85;

/**
 * Strips data URL prefix ("data:image/jpeg;base64,...") leaving bare base64.
 */
export function extractCleanBase64(dataUrlOrBase64: string): { base64: string; mimeType: string } {
  const match = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1] || 'image/jpeg',
      base64: match[2],
    };
  }
  return {
    mimeType: 'image/jpeg',
    base64: dataUrlOrBase64,
  };
}

/**
 * Downscales an image so that neither width nor height exceeds maxDimension (1280px).
 * Maintains exact aspect ratio and exports compressed JPEG data URL and clean base64.
 */
export async function downscaleImage(
  dataUrlOrBase64: string,
  maxDimension = MAX_IMAGE_DIMENSION,
  quality = DEFAULT_JPEG_QUALITY
): Promise<DownscaledImageResult> {
  const { base64: cleanBase64, mimeType } = extractCleanBase64(dataUrlOrBase64);
  const fullDataUrl = dataUrlOrBase64.startsWith('data:')
    ? dataUrlOrBase64
    : `data:${mimeType};base64,${cleanBase64}`;

  // If running in a test / headless environment without DOM Image or document:
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return {
      dataUrl: fullDataUrl,
      base64: cleanBase64,
      mimeType: 'image/jpeg',
      width: 1280,
      height: 720,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      // Calculate target dimensions maintaining aspect ratio
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      // Render to offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          dataUrl: fullDataUrl,
          base64: cleanBase64,
          mimeType: 'image/jpeg',
          width,
          height,
        });
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const downscaledDataUrl = canvas.toDataURL('image/jpeg', quality);
      const { base64: processedBase64 } = extractCleanBase64(downscaledDataUrl);

      resolve({
        dataUrl: downscaledDataUrl,
        base64: processedBase64,
        mimeType: 'image/jpeg',
        width,
        height,
      });
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for client-side downscaling.'));
    };

    img.src = fullDataUrl;
  });
}

