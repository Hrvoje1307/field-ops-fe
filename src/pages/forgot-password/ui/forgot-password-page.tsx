import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ForgotPasswordForm } from '@/features/auth/forgot-password'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-svh items-start justify-center bg-muted/40 px-4 py-12 sm:items-center">
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-sm font-medium tracking-wide text-muted-foreground">
          {t('common.appName')}
        </p>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>{t('auth.forgotPassword.title')}</h1>
            </CardTitle>
            <CardDescription>{t('auth.forgotPassword.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ForgotPasswordForm />
            <Link
              to="/login"
              className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t('auth.forgotPassword.backToSignIn')}
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
