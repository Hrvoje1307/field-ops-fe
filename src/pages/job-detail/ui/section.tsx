import { cn } from 'cn'
import { type ReactNode, useId } from 'react'

/** A titled block of the job page. */
export function Section({
  title,
  children,
  className,
}: {
  title: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('space-y-3 rounded-xl border p-4', className)}>
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Label–value rows inside a section. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">{children}</dl>
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
