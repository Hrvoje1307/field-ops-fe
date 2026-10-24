/**
 * Downloads the backend's OpenAPI document into openapi/openapi.json.
 *
 *   OPENAPI_URL=https://…/openapi.json npm run api:pull
 *
 * The file is written as JSON.stringify(spec, null, 2), so pulling an unchanged
 * spec gives no diff. `npm run api:pull` regenerates the client afterwards.
 */
import { writeFile } from 'node:fs/promises'

const url = process.env.OPENAPI_URL
if (!url) {
  console.error(
    'Set OPENAPI_URL, e.g. OPENAPI_URL=https://example.com/openapi.json npm run api:pull',
  )
  process.exit(1)
}

const response = await fetch(url, { headers: { Accept: 'application/json' } })
if (!response.ok) {
  console.error(`GET ${url} failed: ${String(response.status)} ${response.statusText}`)
  process.exit(1)
}

const spec = (await response.json()) as {
  openapi?: unknown
  info?: { version?: unknown }
  paths?: unknown
}
if (
  typeof spec.openapi !== 'string' ||
  !spec.openapi.startsWith('3.') ||
  typeof spec.paths !== 'object'
) {
  console.error(`${url} does not look like an OpenAPI 3 document`)
  process.exit(1)
}

const target = new URL('../openapi/openapi.json', import.meta.url)
await writeFile(target, JSON.stringify(spec, null, 2))
console.log(
  `openapi/openapi.json ← ${url} (OpenAPI ${spec.openapi}, API ${String(spec.info?.version)})`,
)
