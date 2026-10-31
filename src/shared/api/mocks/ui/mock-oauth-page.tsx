import { useState } from 'react'

import { env } from '@/shared/config/env'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

const PROVIDERS: Record<string, string> = { gmail: 'Google', microsoft: 'Microsoft' }

/**
 * Stand-in for the provider's consent page, only with the mock API (`authorizeUrl` points
 * here). A browser navigation is not seen by the mock worker, so the page finishes the way
 * the provider would: it calls the callback and goes where the callback redirects to. The
 * account the "user" signed in with is typed here (`code=mock:<address>`).
 * Not part of the product: nothing in the app links to it except the mock's `authorizeUrl`.
 */
export function MockOAuthPage({ provider, state }: { provider: string; state: string }) {
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const name = PROVIDERS[provider] ?? provider

  async function finish(params: Record<string, string>) {
    setBusy(true)
    const query = new URLSearchParams({ state, ...params })
    const response = await fetch(`${env.apiUrl}/sales/mailboxes/oauth/callback?${query.toString()}`)
    window.location.assign(response.url)
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-xl font-semibold">{name}: odobrenje pristupa (mock)</h1>
      <p className="text-sm text-muted-foreground">
        Ovo je zamjena za stranicu davatelja usluge. FieldOps traži čitanje, pisanje nacrta i slanje
        pošte.
      </p>
      <div className="space-y-1">
        <Label htmlFor="mock-account">Račun s kojim se prijavljujete</Label>
        <Input
          id="mock-account"
          type="email"
          autoComplete="off"
          value={account}
          onChange={(event) => {
            setAccount(event.target.value)
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={busy || !account.trim()}
          onClick={() => void finish({ code: `mock:${account.trim()}` })}
        >
          Dopusti pristup
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void finish({ error: 'access_denied' })}
        >
          Odbij
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void finish({ error: 'server_error' })}
        >
          Greška davatelja
        </Button>
      </div>
    </main>
  )
}
