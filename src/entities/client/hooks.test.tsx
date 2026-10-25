import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '@/shared/api/api-fetch'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  clientKeys,
  createClient,
  getClient,
  listClients,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from './api'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('dispecer@alarmko.test')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function seedCache(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  queryClient.setQueryData(['jobs', 'list', { page: 1 }], { items: [] })
  queryClient.setQueryData(['job-types'], [])
}

/** A stored client as the body of an unchanged save. */
async function firstClient() {
  const page = await listClients({ pageSize: 1 })
  const id = page.items[0]?.id
  if (!id) throw new Error('Seed needs a client')
  const client = await getClient(id)
  return {
    client,
    body: {
      type: client.type,
      name: client.name,
      contacts: client.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        isPrimary: contact.isPrimary,
        receivesSms: contact.receivesSms,
      })),
      customFields: client.customFields,
      version: client.version,
    },
  }
}

/** Values for the tenant's required client fields, whatever they are. */
async function requiredCustomFields() {
  const definitions = await apiFetch<
    { key: string; type: string; required: boolean; options?: { value: string }[] | null }[]
  >('/custom-fields', { query: { entity: 'client' } })
  return Object.fromEntries(
    definitions
      .filter((definition) => definition.required)
      .map((definition) => [
        definition.key,
        definition.type === 'select' ? (definition.options?.[0]?.value ?? '') : 'x',
      ]),
  )
}

const newClientBody = async (name: string) => ({
  type: 'person' as const,
  name,
  contacts: [{ name, isPrimary: true }],
  customFields: await requiredCustomFields(),
})

describe('useUpdateClient', () => {
  it('caches the saved client and refreshes job data (jobs show client names)', async () => {
    const { client, body } = await firstClient()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient)
    const { result } = renderHook(() => useUpdateClient(), { wrapper })

    await act(() =>
      result.current.mutateAsync({ id: client.id, body: { ...body, name: 'Novo ime' } }),
    )

    expect(queryClient.getQueryData(clientKeys.detail(client.id))).toMatchObject({
      name: 'Novo ime',
      version: client.version + 1,
    })
    expect(isInvalidated(queryClient, ['jobs', 'list', { page: 1 }])).toBe(true)
    expect(isInvalidated(queryClient, ['job-types'])).toBe(false)
  })

  it('409 (stale version): tells the user and refetches client data', async () => {
    const warning = vi.spyOn(toast, 'warning')
    const { client, body } = await firstClient()
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(clientKeys.detail(client.id), client)
    const { result } = renderHook(() => useUpdateClient(), { wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({ id: client.id, body: { ...body, version: client.version - 1 } })
        .catch(() => undefined)
    })

    expect(warning).toHaveBeenCalledWith(
      'Klijent je u međuvremenu promijenjen. Prikazani su najnoviji podaci.',
    )
    expect(isInvalidated(queryClient, clientKeys.detail(client.id))).toBe(true)
  })

  it('other errors are left to the caller (no conflict message)', async () => {
    const warning = vi.spyOn(toast, 'warning')
    server.use(
      http.put(`${API}/clients/:id`, () =>
        HttpResponse.json({ status: 400, title: 'Validation' }, { status: 400 }),
      ),
    )
    const { client, body } = await firstClient()
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useUpdateClient(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: client.id, body }).catch(() => undefined)
    })
    expect(warning).not.toHaveBeenCalled()
  })
})

describe('useCreateClient', () => {
  it('caches the new client under its detail key and refreshes client lists', async () => {
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(clientKeys.list({ page: 1 }), { items: [] })
    const { result } = renderHook(() => useCreateClient(), { wrapper })

    const body = await newClientBody('Marina Novak')
    let created: Awaited<ReturnType<typeof createClient>> | undefined
    await act(async () => {
      created = await result.current.mutateAsync(body)
    })
    if (!created) throw new Error('Not created')

    expect(queryClient.getQueryData(clientKeys.detail(created.id))).toMatchObject({
      id: created.id,
      name: 'Marina Novak',
    })
    expect(isInvalidated(queryClient, clientKeys.list({ page: 1 }))).toBe(true)
  })
})

describe('useDeleteClient', () => {
  it('drops the client from the cache; open jobs refuse with 409 and change nothing', async () => {
    // The client with the most open jobs
    const page = await listClients({ pageSize: 200 })
    const busiest = [...page.items].sort((a, b) => b.openJobsCount - a.openJobsCount)[0]
    if (!busiest || busiest.openJobsCount === 0)
      throw new Error('Seed needs a client with open jobs')
    const client = await getClient(busiest.id)
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(clientKeys.detail(client.id), client)
    const { result } = renderHook(() => useDeleteClient(), { wrapper })

    // The first seeded client has open jobs: the API refuses
    const refused = await act(async () =>
      result.current.mutateAsync(client.id).catch((e: unknown) => e),
    )
    expect(refused).toMatchObject({ status: 409 })
    expect(queryClient.getQueryData(clientKeys.detail(client.id))).toBeDefined()

    // A fresh client has none
    const fresh = await createClient(await newClientBody('Za brisanje'))
    queryClient.setQueryData(clientKeys.detail(fresh.id), fresh)
    await act(() => result.current.mutateAsync(fresh.id))
    expect(queryClient.getQueryData(clientKeys.detail(fresh.id))).toBeUndefined()
  })
})
