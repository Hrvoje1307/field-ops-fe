import { useTranslation } from 'react-i18next'

import { CustomFieldValuesFor } from '@/entities/custom-field'
import type { Job } from '@/entities/job'
import { AccessCodes, AccessNotes, MapsLink } from '@/entities/location'

import { Fact, Facts, Section } from './section'

/**
 * Where the job is: the address from the job (always there, "street, city"), maps,
 * access notes, access codes (masked until revealed; the API leaves them out for
 * viewers who may not see them) and the location's own fields, read-only.
 */
export function LocationSection({ job }: { job: Job }) {
  const { t } = useTranslation()
  const place = { address: job.location.address, lat: job.location.lat, lng: job.location.lng }
  const location = job.locationDetail
  const hasNotes = Boolean(location?.accessNotes?.trim())
  const hasCodes = Boolean(location?.accessCodes?.trim()) || location?.hasAccessCodes === true

  return (
    <Section title={t('job.detail.location')}>
      <div className="space-y-1">
        {location?.label && <p className="text-sm text-muted-foreground">{location.label}</p>}
        <p className="font-medium">{job.location.address}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <MapsLink place={place} />
          <MapsLink place={place} directions />
        </div>
      </div>
      {location && (hasNotes || hasCodes) && (
        <Facts>
          {hasNotes && (
            <Fact label={t('location.accessNotes')}>
              <AccessNotes notes={location.accessNotes} />
            </Fact>
          )}
          {hasCodes && (
            <Fact label={t('location.accessCodes')}>
              <AccessCodes location={location} />
            </Fact>
          )}
        </Facts>
      )}
      {location && (
        <CustomFieldValuesFor scope={{ entity: 'location' }} values={location.customFields} />
      )}
    </Section>
  )
}
