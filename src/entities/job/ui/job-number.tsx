import { cn } from 'cn'

/** The job number exactly as the API returns it (the tenant's prefix is already in it). */
export function JobNumber({ number, className }: { number: string; className?: string }) {
  return (
    <span className={cn('font-mono text-xs text-muted-foreground tabular-nums', className)}>
      {number}
    </span>
  )
}
