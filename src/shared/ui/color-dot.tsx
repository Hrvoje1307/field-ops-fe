import { cn } from 'cn'

/** A small dot in a configured colour (job type, technician). Decorative. */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="color-dot"
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
    />
  )
}
