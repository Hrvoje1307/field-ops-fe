import { PhoneIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Contact } from '@/shared/api/generated/model'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Button } from '@/shared/ui/button'

/**
 * A big `tel:` button for a contact (phone screens): their name and number in the
 * tenant's format. Renders nothing when the contact has no phone.
 */
export function CallButton({ contact }: { contact: Pick<Contact, 'name' | 'phone'> }) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  if (!contact.phone) return null
  return (
    <Button asChild variant="outline" size="lg" className="h-12 w-full justify-start gap-3">
      <a href={`tel:${contact.phone}`} aria-label={t('field.day.call', { name: contact.name })}>
        <PhoneIcon aria-hidden="true" />
        <span className="min-w-0 text-left">
          <span className="block truncate font-medium">{contact.name}</span>
          <span className="block text-sm font-normal text-muted-foreground">
            {formatPhone(contact.phone)}
          </span>
        </span>
      </a>
    </Button>
  )
}
