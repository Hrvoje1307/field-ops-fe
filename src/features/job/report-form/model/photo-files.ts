import { MAX_UPLOAD_BYTES } from '@/shared/lib/image'

/** Types the API takes for photos. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const

export type PhotoProblem = 'unsupported' | 'tooLarge'

/**
 * Whether a chosen file can be sent as a photo. HEIC (iPhones) has no `type` in some
 * browsers, so the extension decides there.
 */
export function mimeOf(file: Pick<File, 'type' | 'name'>): (typeof PHOTO_TYPES)[number] | null {
  const type = file.type.toLowerCase()
  if (type === 'image/heif') return 'image/heic'
  if ((PHOTO_TYPES as readonly string[]).includes(type)) return type as (typeof PHOTO_TYPES)[number]
  if (type === '' && /\.(heic|heif)$/i.test(file.name)) return 'image/heic'
  return null
}

export function photoProblem(
  file: Pick<File, 'type' | 'name' | 'size'>,
  /** The size after shrinking, when known. */
  size: number = file.size,
): PhotoProblem | null {
  if (mimeOf(file) === null) return 'unsupported'
  return size > MAX_UPLOAD_BYTES ? 'tooLarge' : null
}
