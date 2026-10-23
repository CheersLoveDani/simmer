/** Longest side a recipe photo is kept at: sharp on any screen, a fraction of a camera's size. */
export const PHOTO_MAX = 1600;

export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Shrink a photo before it is stored on the device. A phone photo can be
 * 10 MB; this keeps it to a few hundred KB. Anything that cannot be read as
 * an image is passed through untouched.
 */
export async function shrinkPhoto(blob: Blob, max = PHOTO_MAX): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = fitWithin(bitmap.width, bitmap.height, max);
    if (size.width === bitmap.width && blob.size < 1_000_000) {
      bitmap.close();
      return blob;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const smaller = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return smaller && smaller.size > 0 ? smaller : blob;
  } catch {
    return blob;
  }
}
