import { useTranslation } from 'react-i18next'

import { ContactLine } from '@/entities/client'
import type { Job } from '@/entities/job'

import { Section } from './section'

/** The client and how to reach them, primary contact first. */
export function ClientSection({ job }: { job: Job }) {
  const { t } = useTranslation()
  const contacts = [...(job.clientDetail?.contacts ?? [])].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
  )

  return (
    <Section title={t('job.detail.client')}>
      <p className="font-medium">{job.client.name}</p>
      {contacts.length > 0 ? (
        <ul className="space-y-2">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <ContactLine contact={contact} />
              {contact.isPrimary && contacts.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  {t('job.detail.primaryContact')}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('job.detail.noContacts')}</p>
      )}
    </Section>
  )
}
