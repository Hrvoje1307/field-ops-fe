import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import type { JobStatus } from '@/shared/api/generated/model'
import { Badge } from '@/shared/ui/badge'

/** One colour per platform-wide status (the same for every tenant). */
const STATUS_CLASS: Record<JobStatus, string> = {
  new: 'bg-slate-100 text-slate-800',
  scheduled: 'bg-sky-100 text-sky-900',
  confirmed: 'bg-blue-100 text-blue-900',
  en_route: 'bg-amber-100 text-amber-900',
  on_site: 'bg-violet-100 text-violet-900',
  on_hold: 'bg-orange-100 text-orange-900',
  completed: 'bg-green-100 text-green-900',
  invoiced: 'bg-emerald-50 text-emerald-800',
  cancelled: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge data-status={status} className={cn(STATUS_CLASS[status], className)}>
      {t(`job.status.${status}`)}
    </Badge>
  )
}
