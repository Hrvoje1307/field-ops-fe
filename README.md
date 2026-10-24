# field-ops-fe

React frontend for FieldOps. See `CLAUDE.md` for the rules and architecture.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173, mock API (MSW) on by default
```

Copy `.env.example` to `.env.local` to point at a real API (`VITE_API_MOCK=false`).

## Mock API

With `VITE_API_MOCK=true` (the default in development) MSW serves the API from `src/shared/api/mocks`, following `openapi/openapi.json`. Data lives in `localStorage` (`fieldops.mockdb.v1`) and is reseeded every day, with dates relative to today. Run `window.__fieldopsResetMock()` in the browser console to reseed now; this also clears sessions and login locks.

Two fictional tenants, password `demo` for everyone:

| Tenant                                     | Owner                  | Dispatcher              | Technicians                            |
| ------------------------------------------ | ---------------------- | ----------------------- | -------------------------------------- |
| Alarmko d.o.o. (alarm installer, Zagreb)   | `vlasnik@alarmko.test` | `dispecer@alarmko.test` | `ivan@`, `luka@`, `petra@alarmko.test` |
| Bura klima d.o.o. (HVAC / plumbing, Split) | `vlasnik@bura.test`    | `dispecer@bura.test`    | `ante@`, `mia@bura.test`               |

`ana@demo.test` is a dispatcher in both tenants (for tenant switching). Open questions about the contract are in `docs/backend-questions.md`.

Developer previews (mock mode only, sign in first). They are registered in `src/app/mock-routes.ts`, not as file routes, so builds without the mock API contain none of their code or strings:

- `/dev/custom-fields`: the active tenant's custom fields for each entity and asset type, in edit and read mode, starting from real mock values. Nothing is sent.

## Scripts

| script                 | what it does                                                 |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Vite dev server                                              |
| `npm run build`        | typecheck + production build to `dist/`                      |
| `npm run lint`         | ESLint (incl. FSD boundaries) + Prettier check               |
| `npm run typecheck`    | `tsc -b`                                                     |
| `npm test`             | Vitest unit/component tests                                  |
| `npm run test:e2e`     | Playwright (run `npx playwright install chromium` once)      |
| `npm run api:generate` | regenerate the client from `openapi/openapi.json` via Orval  |
| `npm run api:check`    | fail if the committed client differs from a fresh generation |

The generated client (`src/shared/api/generated`) is committed. After changing `openapi/openapi.json`, run `npm run api:generate` and commit the result; CI runs `npm run api:check` and fails on drift.
