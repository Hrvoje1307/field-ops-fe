import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Client } from '@/shared/api/generated/model'
import { useTenantFormat } from '@/shared/lib/tenant-format'

/** A client found by phone or name: name, primary contact, where they are. */
export function ClientMatch({
  client,
  action,
  className,
}: {
  client: Pick<Client, 'name' | 'type' | 'contacts' | 'locations'>
  /** E.g. the button that picks this client. */
  action?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  const contact = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0]
  const addresses = client.locations.map((location) => location.address).filter(Boolean)

  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3',
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium">
          {client.name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t(`client.type.${client.type}`)}
          </span>
        </p>
        {contact && (
          <p className="text-muted-foreground">
            {contact.name}
            {contact.phone && ` · ${formatPhone(contact.phone)}`}
          </p>
        )}
        {addresses.length > 0 && (
          <p className="text-muted-foreground">
            {addresses[0]}
            {addresses.length > 1 && ` · ${t('client.locationCount', { count: addresses.length })}`}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
