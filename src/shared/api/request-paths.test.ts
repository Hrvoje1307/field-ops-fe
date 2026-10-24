import { describe, expect, it } from 'vitest'

import spec from '../../../openapi/openapi.json'

/**
 * Requests are written by hand in entities/<area>/api.ts (apiFetch + path), so nothing
 * generated keeps them in line with the contract. This reads every apiFetch call there
 * and checks that its method and path exist in openapi/openapi.json.
 */
const SOURCES = import.meta.glob<string>('../../entities/*/api.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const CALL = /apiFetch<[^>]*>\(\s*(?:path`([^`]*)`|'([^']*)')\s*(?:,\s*\{([^}]*)\})?\s*\)/g

/** `/jobs/${id}/history` and `/jobs/{id}/history` → `/jobs/{}/history`. */
const normalize = (path: string) => path.replace(/\$\{[^}]*\}|\{[^}]*\}/g, '{}')

const contract = new Set(
  Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.keys(operations)
      .filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
      .map((method) => `${method.toUpperCase()} ${normalize(path)}`),
  ),
)

function requestsIn(source: string): string[] {
  return [...source.matchAll(CALL)].map(([, template, literal, options]) => {
    const method = /method:\s*'([A-Z]+)'/.exec(options ?? '')?.[1] ?? 'GET'
    return `${method} ${normalize(template ?? literal ?? '')}`
  })
}

const files = Object.entries(SOURCES).map(([file, source]) => ({
  file: file.replace('../../entities/', ''),
  source,
}))

describe('entity request paths', () => {
  it('finds the requests (the pattern still matches how they are written)', () => {
    const all = files.flatMap(({ source }) => requestsIn(source))
    expect(all).toContain('GET /jobs/{}')
    expect(all).toContain('POST /jobs/{}/transition')
    expect(all.length).toBeGreaterThan(15)
  })

  it.each(files)('$file: every method and path is in the contract', ({ source }) => {
    expect(requestsIn(source).filter((request) => !contract.has(request))).toEqual([])
  })

  it('every apiFetch call in entities is one this test can read', () => {
    for (const { file, source } of files) {
      expect(requestsIn(source), file).toHaveLength(source.match(/apiFetch</g)?.length ?? 0)
    }
  })
})
