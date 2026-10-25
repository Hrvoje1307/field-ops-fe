import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useMe } from '@/entities/auth'
import { channel, useRealtimeStatus } from '@/entities/realtime'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'

import { noticeFor } from '../model/notice-text'

/** How long live updates may be down before the screen says so. */
export const DOWN_NOTICE_DELAY_MS = 10_000

/** One notice per this many ms, however many changes arrive. */
export const NOTICE_THROTTLE_MS = 3000

/**
 * Live updates seen from the screen: a technician is told when the office changes their
 * schedule, and everyone is told when updates have been down for a while (the data on
 * screen may be behind). Mounted by the shells; the connection itself is `useRealtime`.
 */
export function LiveUpdates({
  downNoticeDelay = DOWN_NOTICE_DELAY_MS,
}: {
  /** How long updates may be down before the screen says so. */
  downNoticeDelay?: number
}) {
  return (
    <>
      <ConnectionNotice delay={downNoticeDelay} />
      <ScheduleNotices />
    </>
  )
}

function ConnectionNotice({ delay }: { delay: number }) {
  const status = useRealtimeStatus()
  const downSince = channel.getDownSince()
  if (status === 'connected' || downSince === null) return null
  // A new outage is a new notice, with its own wait
  return <DownNotice key={downSince} since={downSince} delay={delay} />
}

function DownNotice({ since, delay }: { since: number; delay: number }) {
  const { t } = useTranslation()
  const [late, setLate] = useState(() => Date.now() - since >= delay)

  useEffect(() => {
    if (late) return
    const timer = setTimeout(
      () => {
        setLate(true)
      },
      Math.max(0, delay - (Date.now() - since)),
    )
    return () => {
      clearTimeout(timer)
    }
  }, [late, since, delay])

  if (!late) return null
  return (
    <Alert role="status" data-testid="live-down" className="mb-4">
      <AlertDescription>{t('live.down')}</AlertDescription>
    </Alert>
  )
}

function ScheduleNotices() {
  const { t } = useTranslation()
  const me = useMe()
  const { formatDate } = useTenantFormat()
  const last = useRef(0)
  const isTechnician = me.role === 'technician'

  useEffect(() => {
    if (!isTechnician) return
    return channel.subscribeEvents((event) => {
      const notice = noticeFor(event)
      if (!notice) return
      const now = Date.now()
      if (now - last.current < NOTICE_THROTTLE_MS) return
      last.current = now
      toast.info(
        notice.key === 'live.planPublished'
          ? t(notice.key, {
              date: formatDate(notice.date, { weekday: 'long', day: 'numeric', month: 'long' }),
            })
          : t(notice.key),
      )
    })
  }, [isTechnician, t, formatDate])

  return null
}
