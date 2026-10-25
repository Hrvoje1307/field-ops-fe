import { cn } from 'cn'
import { type ReactNode, useId } from 'react'

/** A titled block of a long form or settings page; the title names the region. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={cn('space-y-4 rounded-xl border p-4 md:p-6', className)}
    >
      <div className="space-y-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
