import { cn } from 'cn'
import { type ReactNode, useId } from 'react'

/** A titled block of the report form; the title names the region for screen readers. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode
  /** To the right of the title (a count, "obavezno"). */
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {aside && <span className="text-sm text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}
