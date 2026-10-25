import { cn } from 'cn'
import type { ReactNode } from 'react'

/** The head of a settings list: what it is, a line about it, and the button that adds. */
export function ConfigListHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Rows of a settings list. */
export function ConfigList({
  children,
  label,
  className,
}: {
  children: ReactNode
  /** Names the list for screen readers. */
  label: string
  className?: string
}) {
  return (
    <ul aria-label={label} className={cn('divide-y rounded-xl border', className)}>
      {children}
    </ul>
  )
}

/** One row: what it is, a line of detail, and its actions on the right. */
export function ConfigListItem({
  title,
  meta,
  leading,
  actions,
}: {
  title: ReactNode
  meta?: ReactNode
  /** Before the title (a colour dot). */
  leading?: ReactNode
  actions?: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  )
}

/** A list with nothing in it yet. */
export function ConfigListEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
