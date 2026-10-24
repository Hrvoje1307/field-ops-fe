import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { forgotPassword as requestPasswordReset } from '@/entities/auth'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'

/** Always shows the same confirmation: the API never tells whether the account exists. */
export function ForgotPasswordForm() {
  const { t } = useTranslation()
  const forgotPassword = useMutation({ mutationFn: requestPasswordReset })
  const [sentTo, setSentTo] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .min(1, t('auth.signIn.errors.emailRequired'))
          .pipe(z.email(t('auth.signIn.errors.emailInvalid'))),
      }),
    [t],
  )
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const onSubmit = handleSubmit(async ({ email }) => {
    await forgotPassword.mutateAsync({ email }).then(
      () => {
        setSentTo(email)
      },
      () => undefined, // shown via forgotPassword.isError
    )
  })

  if (sentTo) {
    return (
      <Alert role="status">
        <AlertDescription>{t('auth.forgotPassword.sent', { email: sentTo })}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {forgotPassword.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t('auth.forgotPassword.failed')}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="forgot-email">{t('auth.signIn.email')}</FieldLabel>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="username"
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
        </Button>
      </FieldGroup>
    </form>
  )
}
