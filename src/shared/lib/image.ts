/** Longest side of a photo sent to the API; a phone camera's 12 MP is far more than a report needs. */
export const PHOTO_MAX_EDGE = 2000
const PHOTO_QUALITY = 0.82

/** The size an image shrinks to so its longest side is at most `maxEdge` (never larger). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Where a photo is too large to be sent as it is (the API takes up to 20 MB). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/**
 * A photo shrunk for upload: JPEG, longest side at most `maxEdge`. The original is
 * returned when the browser cannot decode it (a format it does not know) or when
 * shrinking would not make it smaller. Never throws.
 */
export async function shrinkPhoto(file: Blob, maxEdge: number = PHOTO_MAX_EDGE): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY)
    })
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
