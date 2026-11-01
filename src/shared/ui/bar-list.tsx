import { cn } from 'cn'
import type { ReactNode } from 'react'

export interface BarItem {
  key: string
  label: ReactNode
  /** The length of the bar; the longest bar in the list is the full width. */
  value: number
  /** Written next to the label (the figure itself, already formatted). */
  text: ReactNode
  /** A part of `value` drawn darker (the won part of the created). */
  part?: number
}

/**
 * Horizontal bars for a short list of figures. The figures are written out as text, the bars
 * only show how they compare, so the list reads the same without them.
 */
export function BarList({
  items,
  label,
  className,
}: {
  items: readonly BarItem[]
  label: string
  className?: string
}) {
  const max = Math.max(0, ...items.map((item) => item.value))
  const width = (value: number) => (max > 0 ? `${String((value / max) * 100)}%` : '0%')
  return (
    <ul aria-label={label} className={cn('space-y-3', className)}>
      {items.map((item) => (
        <li key={item.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{item.text}</span>
          </div>
          <div aria-hidden="true" className="h-2 rounded-full bg-muted">
            <div
              className="relative h-full rounded-full bg-primary/40"
              style={{ width: width(item.value) }}
            >
              {item.part !== undefined && item.value > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: `${String((item.part / item.value) * 100)}%` }}
                />
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
