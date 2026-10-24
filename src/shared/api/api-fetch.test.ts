import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { ApiError } from './api-error'
import { apiFetch, toQueryString } from './api-fetch'
import { server } from './mocks/node'

const API = 'http://localhost/api/v1'

describe('toQueryString', () => {
  it('comma-joins arrays, leaves out unset values', () => {
    expect(
      toQueryString({
        status: ['new', 'scheduled'],
        q: 'ilica 5',
        page: 2,
        unscheduled: false,
        priority: undefined,
        to: null,
        empty: [],
      }),
    ).toBe('?status=new%2Cscheduled&q=ilica+5&page=2&unscheduled=false')
    expect(toQueryString({})).toBe('')
    expect(toQueryString(undefined)).toBe('')
  })
})

describe('apiFetch', () => {
  it('GETs the path with the query and returns the JSON body', async () => {
    let url = ''
    server.use(
      http.get(`${API}/jobs`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ items: [] })
      }),
    )
    await expect(apiFetch('/jobs', { query: { status: ['new'], page: 1 } })).resolves.toEqual({
      items: [],
    })
    expect(url).toBe(`${API}/jobs?status=new&page=1`)
  })

  it('sends a JSON body with its content type and the given idempotency key', async () => {
    let seen: { body: unknown; type: string | null; key: string | null } | null = null
    server.use(
      http.post(`${API}/jobs/j1/transition`, async ({ request }) => {
        seen = {
          body: await request.json(),
          type: request.headers.get('Content-Type'),
          key: request.headers.get('Idempotency-Key'),
        }
        return HttpResponse.json({ id: 'j1' })
      }),
    )
    await apiFetch('/jobs/j1/transition', {
      method: 'POST',
      json: { to: 'confirmed', version: 3 },
      idempotencyKey: 'key-1',
    })
    expect(seen).toEqual({
      body: { to: 'confirmed', version: 3 },
      type: 'application/json',
      key: 'key-1',
    })
  })

  it('throws ApiError with the problem details', async () => {
    server.use(
      http.get(`${API}/jobs/missing`, () =>
        HttpResponse.json({ status: 404, title: 'Not found' }, { status: 404 }),
      ),
    )
    const error = await apiFetch('/jobs/missing').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, problem: { title: 'Not found' } })
  })
})
