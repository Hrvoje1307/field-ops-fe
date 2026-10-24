import type { TokenResponse } from '@/shared/api/generated/model'
import { Link, useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { type LoginReason, roleHome, safeRedirect } from '@/entities/auth'
import { DemoLogins, SignInForm } from '@/features/auth/sign-in'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

interface LoginPageProps {
  redirect?: string
  reason?: LoginReason
}

export function LoginPage({ redirect, reason }: LoginPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Back to where the user was going; role guards send them home if it isn't theirs
  const onSignedIn = (tokens: TokenResponse) => {
    void navigate({ href: safeRedirect(redirect) ?? roleHome(tokens.role), replace: true })
  }

  return (
    <main className="flex min-h-svh items-start justify-center bg-muted/40 px-4 py-12 sm:items-center">
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-sm font-medium tracking-wide text-muted-foreground">
          {t('common.appName')}
        </p>
        {reason && (
          <Alert variant={reason === 'access_revoked' ? 'destructive' : 'default'} role="status">
            <AlertDescription>{t(`auth.signIn.reasons.${reason}`)}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>{t('auth.signIn.title')}</h1>
            </CardTitle>
            <CardDescription>{t('auth.signIn.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SignInForm onSignedIn={onSignedIn} />
            <Link
              to="/forgot-password"
              className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t('auth.signIn.forgotPassword')}
            </Link>
          </CardContent>
        </Card>
        {DemoLogins && (
          <Suspense fallback={null}>
            <DemoLogins onSignedIn={onSignedIn} />
          </Suspense>
        )}
      </div>
    </main>
  )
}
