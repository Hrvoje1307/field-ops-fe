import { cn } from 'cn'
import { MailIcon, PhoneIcon } from 'lucide-react'

import type { Contact } from '@/shared/api/generated/model'
import { useTenantFormat } from '@/shared/lib/tenant-format'

const linkClass =
  'inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline [&>svg]:size-3.5 [&>svg]:text-muted-foreground'

/** Contact name with a phone (tenant format, `tel:` link) and email (`mailto:` link). */
export function ContactLine({
  contact,
  className,
}: {
  contact: Pick<Contact, 'name' | 'phone' | 'email'>
  className?: string
}) {
  const { formatPhone } = useTenantFormat()
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
      <span className="font-medium">{contact.name}</span>
      {contact.phone && (
        <a href={`tel:${contact.phone}`} className={linkClass}>
          <PhoneIcon aria-hidden="true" />
          {formatPhone(contact.phone)}
        </a>
      )}
      {contact.email && (
        <a href={`mailto:${contact.email}`} className={linkClass}>
          <MailIcon aria-hidden="true" />
          {contact.email}
        </a>
      )}
    </div>
  )
}
