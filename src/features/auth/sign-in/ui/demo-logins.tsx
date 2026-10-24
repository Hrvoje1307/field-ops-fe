import { useTranslation } from 'react-i18next'

import { demoAccountGroups, DEMO_PASSWORD } from '@/shared/api/mocks/demo-accounts'
import type { TokenResponse } from '@/shared/api/generated/model'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

import { useSignIn } from '../model/use-sign-in'

const groups = demoAccountGroups()

/** One-click sign-in as any seeded user. Only bundled when VITE_API_MOCK=true. */
export function DemoLogins({ onSignedIn }: { onSignedIn: (tokens: TokenResponse) => void }) {
  const { t } = useTranslation()
  const signIn = useSignIn()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.demo.title')}</CardTitle>
        <CardDescription>{t('auth.demo.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <section key={group.tenantName ?? 'shared'} className="space-y-2">
            <h3 className="text-sm font-medium">
              {group.tenantName ?? t('auth.demo.bothTenants')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {group.accounts.map((account) => (
                <Button
                  key={account.email}
                  variant="outline"
                  size="sm"
                  disabled={signIn.isPending}
                  onClick={() => {
                    signIn.mutate(
                      { email: account.email, password: DEMO_PASSWORD },
                      { onSuccess: onSignedIn },
                    )
                  }}
                >
                  {account.fullName} · {t(`roles.${account.role}`)}
                </Button>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  )
}
