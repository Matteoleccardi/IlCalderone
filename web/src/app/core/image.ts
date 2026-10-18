import { AppError } from './i18n';

/**
 * Shrink a photo in the browser before upload (max side 1600 px, JPEG ~85%).
 * Doing it here means the server needs no image extension (GD), and EXIF data (e.g. GPS) is dropped.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('photo.browser_cannot');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new AppError('photo.convert_failed'))), 'image/jpeg', quality),
  );
}
