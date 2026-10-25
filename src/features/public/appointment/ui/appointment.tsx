import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarCheckIcon, CalendarClockIcon, PhoneIcon } from 'lucide-react'
import { type CSSProperties, useMemo, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  buildRescheduleSchema,
  emptyReschedule,
  linkProblem,
  type PublicJob,
  RESCHEDULE_NOTE_MAX,
  type RescheduleFormValues,
  toRescheduleBody,
  useConfirmPublicJob,
  useGetPublicJob,
  useRequestPublicReschedule,
} from '@/entities/public-job'
import { isConflict } from '@/shared/api/api-error'
import { readableTextColor } from '@/shared/lib/color'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field'
import { Skeleton } from '@/shared/ui/skeleton'
import { Spinner } from '@/shared/ui/spinner'
import { Textarea } from '@/shared/ui/textarea'
import { TextField } from '@/shared/ui/text-field'

/**
 * The page a client opens from the link in a message: their appointment, with the two
 * things they can do about it. No sign-in; the link is the access.
 */
export function Appointment({ token }: { token: string }) {
  const { t } = useTranslation()
  const job = useGetPublicJob(token)

  if (job.data) return <AppointmentPage token={token} job={job.data} />

  return (
    <Shell>
      {job.isError ? (
        <LinkProblem
          problem={linkProblem(job.error)}
          onRetry={() => {
            void job.refetch()
          }}
        />
      ) : (
        <div className="space-y-3" role="status" aria-label={t('common.loading')}>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      )}
    </Shell>
  )
}

/** The page's frame: a narrow column on a quiet background, nothing of the office. */
function Shell({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return (
    <main className="min-h-svh bg-muted/40 px-4 py-8" style={style}>
      <div className="mx-auto w-full max-w-md space-y-4">{children}</div>
    </main>
  )
}

function LinkProblem({
  problem,
  onRetry,
}: {
  problem: 'not_found' | 'gone' | null
  onRetry: () => void
}) {
  const { t } = useTranslation()
  if (!problem) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>{t('public.loadFailed.title')}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{t('public.loadFailed.description')}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{t(`public.${problem}.title`)}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        {t(`public.${problem}.description`)}
      </CardContent>
    </Card>
  )
}

function AppointmentPage({ token, job }: { token: string; job: PublicJob }) {
  const { t } = useTranslation()
  const { formatDate, formatPhone } = useTenantFormat()
  const confirm = useConfirmPublicJob(token)
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<'conflict' | 'failed' | null>(null)

  // The company's colour on the buttons, with text that can be read on it
  const accent = job.company.accentColor
  const style = accent
    ? ({
        '--primary': accent,
        '--primary-foreground': readableTextColor(accent),
      } as CSSProperties)
    : undefined

  const when = job.scheduledDate
    ? formatDate(job.scheduledDate, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null
  const window =
    job.arrivalWindowStart && job.arrivalWindowEnd
      ? t('public.job.window', { from: job.arrivalWindowStart, to: job.arrivalWindowEnd })
      : null

  return (
    <Shell style={style}>
      <header className="flex items-center gap-3">
        {job.company.logoUrl && (
          <img src={job.company.logoUrl} alt="" className="h-10 max-w-32 shrink-0 object-contain" />
        )}
        <p className="min-w-0 flex-1 truncate text-lg font-semibold" data-testid="public-company">
          {job.company.name}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">
              {job.clientFirstName
                ? t('public.greeting', { name: job.clientFirstName })
                : t('public.greetingPlain')}
            </h1>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('public.job.heading', { number: job.jobNumber, type: job.jobTypeName })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-2 text-base">
            <div>
              <dt className="text-sm text-muted-foreground">{t('public.job.when')}</dt>
              <dd className="font-medium" data-testid="public-when">
                {when ?? t('public.job.noDate')}
                {window && <span className="block font-normal">{window}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('public.job.where')}</dt>
              <dd className="font-medium">{job.addressShort}</dd>
            </div>
          </dl>

          <StatusNotice status={job.status} />

          {problem && (
            <Alert variant={problem === 'conflict' ? 'default' : 'destructive'} role="alert">
              <AlertDescription>{t(`public.problem.${problem}`)}</AlertDescription>
            </Alert>
          )}

          {job.canConfirm && (
            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={confirm.isPending}
              onClick={() => {
                setProblem(null)
                confirm.mutate(undefined, {
                  onError: (error) => {
                    setProblem(isConflict(error) ? 'conflict' : 'failed')
                  },
                })
              }}
            >
              {confirm.isPending ? <Spinner /> : <CalendarCheckIcon aria-hidden="true" />}
              {t('public.confirm')}
            </Button>
          )}

          {job.canRequestReschedule &&
            (asking ? (
              <RescheduleForm
                token={token}
                onCancel={() => {
                  setAsking(false)
                }}
              />
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full text-base"
                onClick={() => {
                  setProblem(null)
                  setAsking(true)
                }}
              >
                <CalendarClockIcon aria-hidden="true" />
                {t('public.reschedule.open')}
              </Button>
            ))}
        </CardContent>
      </Card>

      {job.company.phone && (
        <p className="text-center text-sm text-muted-foreground">
          {t('public.questions')}{' '}
          <a
            href={`tel:${job.company.phone}`}
            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
          >
            <PhoneIcon className="size-3.5" aria-hidden="true" />
            {formatPhone(job.company.phone)}
          </a>
        </p>
      )}
    </Shell>
  )
}

/** What has become of the appointment, in a line. */
function StatusNotice({ status }: { status: PublicJob['status'] }) {
  const { t } = useTranslation()
  const text = t(`public.status.${status}`)
  const quiet = status === 'scheduled'
  return (
    <p
      role="status"
      data-testid="public-status"
      data-status={status}
      className={
        quiet
          ? 'text-base text-muted-foreground'
          : 'rounded-lg border bg-muted/50 p-3 text-base font-medium'
      }
    >
      {text}
    </p>
  )
}

function RescheduleForm({ token, onCancel }: { token: string; onCancel: () => void }) {
  const { t } = useTranslation()
  const { today } = useTenantFormat()
  const ask = useRequestPublicReschedule(token)
  const [failed, setFailed] = useState(false)
  const schema = useMemo(() => buildRescheduleSchema(today()), [today])
  const form = useForm<RescheduleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyReschedule,
  })
  const note = useWatch({ control: form.control, name: 'note' })

  const submit = form.handleSubmit((values) => {
    setFailed(false)
    ask.mutate(toRescheduleBody(values), {
      onError: () => {
        setFailed(true)
      },
    })
  })

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="space-y-4 rounded-lg border p-4"
        aria-label={t('public.reschedule.open')}
      >
        <p className="text-sm text-muted-foreground">{t('public.reschedule.intro')}</p>
        <Field data-invalid={form.formState.errors.note ? true : undefined}>
          <FieldLabel htmlFor="reschedule-note">{t('public.reschedule.note')}</FieldLabel>
          <Textarea id="reschedule-note" rows={3} {...form.register('note')} />
          <FieldDescription>
            {t('public.reschedule.noteCount', { count: note.length, max: RESCHEDULE_NOTE_MAX })}
          </FieldDescription>
          {form.formState.errors.note && (
            <FieldError>{form.formState.errors.note.message}</FieldError>
          )}
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('public.reschedule.dates')}</legend>
          {[0, 1, 2].map((index) => (
            <TextField
              key={index}
              name={`dates.${String(index)}`}
              type="date"
              min={today()}
              label={t('public.reschedule.date', { number: index + 1 })}
            />
          ))}
        </fieldset>
        {failed && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('public.problem.failed')}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={ask.isPending}>
            {ask.isPending && <Spinner />}
            {t('public.reschedule.send')}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
