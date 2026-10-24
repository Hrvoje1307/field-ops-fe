import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { ApiError } from '@/shared/api/api-error'
import type { TokenResponse } from '@/shared/api/generated/model'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'

import { signInErrorMessage } from '../lib/sign-in-error'
import { useSignIn } from '../model/use-sign-in'

interface SignInFormProps {
  onSignedIn: (tokens: TokenResponse) => void
}

export function SignInForm({ onSignedIn }: SignInFormProps) {
  const { t } = useTranslation()
  const signIn = useSignIn()
  const [formError, setFormError] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .min(1, t('auth.signIn.errors.emailRequired'))
          .pipe(z.email(t('auth.signIn.errors.emailInvalid'))),
        password: z.string().min(1, t('auth.signIn.errors.passwordRequired')),
      }),
    [t],
  )
  type Values = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      onSignedIn(await signIn.mutateAsync(values))
    } catch (error) {
      // 400: messages go next to the fields they belong to
      const fieldErrors = error instanceof ApiError && error.status === 400 ? error.fieldErrors : {}
      const fields = (['email', 'password'] as const).filter((name) => fieldErrors[name]?.length)
      for (const name of fields) setError(name, { message: fieldErrors[name]?.join(' ') })
      if (fields.length === 0) setFormError(signInErrorMessage(error, t))
    }
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <FieldGroup>
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="sign-in-email">{t('auth.signIn.email')}</FieldLabel>
          <Input
            id="sign-in-email"
            type="email"
            autoComplete="username"
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="sign-in-password">{t('auth.signIn.password')}</FieldLabel>
          <Input
            id="sign-in-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('auth.signIn.submitting') : t('auth.signIn.submit')}
        </Button>
      </FieldGroup>
    </form>
  )
}
