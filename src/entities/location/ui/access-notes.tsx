import { cn } from 'cn'

import type { Location } from '@/shared/api/generated/model'

/** Non-secret access notes (parking, entrance, pets); line breaks kept. */
export function AccessNotes({
  notes,
  className,
}: {
  notes: Location['accessNotes']
  className?: string
}) {
  if (!notes?.trim()) return null
  return <p className={cn('text-sm whitespace-pre-line', className)}>{notes}</p>
}
