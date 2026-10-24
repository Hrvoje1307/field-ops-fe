import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'

import type { Location, LocationInput } from '@/entities/location'
import { server } from '@/shared/api/mocks/node'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { Toaster } from '@/shared/ui/sonner'

import { LocationEditorButton } from './location-editor'

const API = 'http://localhost/api/v1'

afterEach(() => {
  toast.dismiss()
})

const location: Location = {
  id: 'l1',
  clientId: 'c1',
  label: null,
  street: 'Glavni trg 1',
  city: 'Ljubljana',
  postalCode: null,
  country: 'SI',
  lat: null,
  lng: null,
  geocodeStatus: 'ok',
  accessNotes: null,
  accessCodes: '1234#',
  hasAccessCodes: true,
  customFields: {},
  address: 'Glavni trg 1, Ljubljana',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
}

function renderEditor(onPut: (body: LocationInput) => void) {
  server.use(
    http.get(`${API}/custom-fields`, () => HttpResponse.json([])),
    http.put(`${API}/locations/:id`, async ({ request }) => {
      const body = (await request.json()) as LocationInput
      onPut(body)
      return HttpResponse.json({ ...location, ...body })
    }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <TenantFormatProvider
        settings={{ timeZone: 'Europe/Zagreb', locale: 'hr-HR', currency: 'EUR', country: 'HR' }}
      >
        <LocationEditorButton clientId="c1" location={location} />
      </TenantFormatProvider>
      <Toaster />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('LocationEditorButton', () => {
  it("editing keeps the location's own country and, unrevealed, its access codes", async () => {
    const sent: LocationInput[] = []
    const user = renderEditor((body) => sent.push(body))
    await user.click(screen.getByRole('button', { name: /^Uredi lokaciju/ }))
    await user.type(await screen.findByLabelText('Naziv lokacije'), 'Ured')
    await user.click(screen.getByRole('button', { name: 'Spremi lokaciju' }))

    await waitFor(() => {
      expect(sent).toHaveLength(1)
    })
    // The tenant is Croatian; this location isn't
    expect(sent[0]).toMatchObject({ country: 'SI', label: 'Ured', accessCodes: null })
  })
})
