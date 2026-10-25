import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { FieldJob } from '@/features/field/job'
import { FieldStatusBar } from '@/features/job/field-status'
import { Button } from '@/shared/ui/button'

/** A job on the phone: its information with the status action fixed at the bottom. */
export function FieldJobView({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  return (
    <FieldJob
      jobId={jobId}
      bottomBar={
        <FieldStatusBar
          jobId={jobId}
          finish={
            <Button asChild size="lg" className="h-14 flex-1 text-base">
              <Link to="/field/jobs/$jobId/report" params={{ jobId }}>
                {t('field.job.finish')}
              </Link>
            </Button>
          }
        />
      }
    />
  )
}
