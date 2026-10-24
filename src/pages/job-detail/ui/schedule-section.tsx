import { useTranslation } from 'react-i18next'

import type { Job } from '@/entities/job'
import { TechnicianChips } from '@/entities/technician'
import { useTenantFormat } from '@/shared/lib/tenant-format'

import { Fact, Facts, Section } from './section'

export function ScheduleSection({ job }: { job: Job }) {
  const { t } = useTranslation()
  const { formatDate, formatDuration, formatRelativeDay, formatTime } = useTenantFormat()
  const dayAndDate = (date: string) => `${formatRelativeDay(date)} · ${formatDate(date)}`

  return (
    <Section title={t('job.detail.schedule')}>
      <Facts>
        <Fact label={t('job.detail.date')}>
          {job.scheduledDate ? (
            dayAndDate(job.scheduledDate)
          ) : (
            <span className="text-muted-foreground">{t('job.detail.notScheduled')}</span>
          )}
        </Fact>
        {job.scheduledStart && (
          <Fact label={t('job.detail.start')}>{formatTime(job.scheduledStart)}</Fact>
        )}
        {!job.scheduledDate && job.preferredDate && (
          <Fact label={t('job.detail.preferredDate')}>{dayAndDate(job.preferredDate)}</Fact>
        )}
        {job.windowStart && job.windowEnd && (
          <Fact label={t('job.detail.window')}>{`${job.windowStart}–${job.windowEnd}`}</Fact>
        )}
        <Fact label={t('job.detail.duration')}>{formatDuration(job.durationMin)}</Fact>
        <Fact label={t('job.detail.people')}>{job.requiredPeople}</Fact>
        <Fact label={t('job.detail.technicians')}>
          {job.technicians.length > 0 ? (
            <TechnicianChips technicians={job.technicians} />
          ) : (
            <span className="text-muted-foreground">{t('job.detail.unassigned')}</span>
          )}
        </Fact>
      </Facts>
    </Section>
  )
}
