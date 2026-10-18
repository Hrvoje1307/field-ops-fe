import { defineConfig } from 'orval'

export default defineConfig({
  fieldops: {
    input: {
      target: './openapi/openapi.json',
    },
    output: {
      // One folder per OpenAPI tag: generated/<tag>/<tag>.ts
      mode: 'tags-split',
      target: './src/shared/api/generated',
      schemas: './src/shared/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      // Wipes generated/ on every run; fetcher.ts lives outside it
      clean: true,
      formatter: 'prettier',
      // Keeps the optional Idempotency-Key header in hook signatures
      headers: true,
      // The root tsconfig only holds references
      tsconfig: './tsconfig.app.json',
      override: {
        mutator: {
          path: './src/shared/api/fetcher.ts',
          name: 'customFetch',
        },
        // Return the body (T), not { data, status, headers }
        fetch: {
          includeHttpResponseReturnType: false,
        },
        query: {
          version: 5,
        },
      },
    },
  },
})
