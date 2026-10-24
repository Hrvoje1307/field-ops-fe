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
      // Plain request functions, no React Query hooks: queries and mutations are
      // written in features with the entity request functions (entities/<area>/api.ts)
      client: 'fetch',
      // Wipes generated/ on every run; fetcher.ts lives outside it
      clean: true,
      formatter: 'prettier',
      // Keeps the optional Idempotency-Key header in the function signatures
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
      },
    },
  },
})
