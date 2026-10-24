import { cn } from 'cn'
import { ArrowDownIcon, ArrowUpIcon, type LucideIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Priority } from '@/shared/api/generated/model'

const MARKS: Record<Exclude<Priority, 'normal'>, { icon: LucideIcon; className: string }> = {
  urgent: { icon: TriangleAlertIcon, className: 'text-red-700' },
  high: { icon: ArrowUpIcon, className: 'text-orange-700' },
  low: { icon: ArrowDownIcon, className: 'text-muted-foreground' },
}

/** Marks urgent, high and low priority; normal (most jobs) shows nothing. */
export function PriorityMark({
  priority,
  iconOnly = false,
  className,
}: {
  priority: Priority
  /** Icon with the label for screen readers only (dense lists). */
  iconOnly?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  if (priority === 'normal') return null
  const { icon: Icon, className: tone } = MARKS[priority]
  const label = t(`job.priority.${priority}`)
  return (
    <span
      data-priority={priority}
      title={iconOnly ? label : undefined}
      className={cn('inline-flex items-center gap-1 text-xs font-medium', tone, className)}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span className={iconOnly ? 'sr-only' : undefined}>{label}</span>
    </span>
  )
}
