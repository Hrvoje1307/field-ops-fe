import { cn } from 'cn'
import { StarIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { AssignedTechnician, TechnicianBrief } from '@/shared/api/generated/model'
import { readableTextColor } from '@/shared/lib/color'
import { initials } from '@/shared/lib/initials'

interface TechnicianChipProps {
  technician: TechnicianBrief & { isLead?: boolean }
  /** Initials only; the name stays available to screen readers and as a tooltip. */
  compact?: boolean
  className?: string
}

/** Initials in the technician's colour, the name, and a star for the crew lead. */
export function TechnicianChip({ technician, compact = false, className }: TechnicianChipProps) {
  const { t } = useTranslation()
  const { fullName, color, isLead } = technician
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm', className)}
      title={compact ? fullName : undefined}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold"
        style={{ backgroundColor: color, color: readableTextColor(color) }}
      >
        {initials(fullName)}
      </span>
      <span className={compact ? 'sr-only' : undefined}>{fullName}</span>
      {isLead && (
        <>
          <StarIcon aria-hidden="true" className="size-3.5 fill-amber-400 text-amber-500" />
          <span className="sr-only">{t('technician.lead')}</span>
        </>
      )}
    </span>
  )
}

/** Assigned crew, lead first. */
export function TechnicianChips({
  technicians,
  compact = false,
  className,
}: {
  technicians: AssignedTechnician[]
  compact?: boolean
  className?: string
}) {
  const ordered = [...technicians].sort((a, b) => Number(b.isLead) - Number(a.isLead))
  return (
    <ul
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', compact && 'gap-x-1', className)}
    >
      {ordered.map((technician) => (
        <li key={technician.id}>
          <TechnicianChip technician={technician} compact={compact} />
        </li>
      ))}
    </ul>
  )
}
