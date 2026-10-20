# Roadmap

Each step follows the workflow in `CLAUDE.md`: plan first, wait for OK, then build with lint, typecheck, tests and build green.

## Done

- [x] **Step 1: scaffold (phase F0)**
  - Vite + React + TypeScript with Feature-Sliced Design layers and boundary lint rules.
  - TanStack Router and Query, Tailwind v4 + shadcn/ui (Radix), Orval client, react-i18next (Croatian).
  - MSW wiring, Vitest, Playwright, Vercel SPA rewrite.
  - Branch `chore/f0-scaffold`.
- [x] **Step 2: API fetcher and session**
  - `shared/api/fetcher.ts`: bearer token, refresh on 401 (one at a time per tab, coordinated across tabs with Web Locks, 15 s timeout), `Idempotency-Key`, `ApiError` with `fieldErrors`.
  - `entities/session`: tokens and tenant, refresh token in localStorage, kept in sync across tabs.
  - Generated client committed; CI checks it for drift (`npm run api:check`).
  - Branch `feat/fetcher-session`.
- [x] **Step 3: mock API**
  - MSW mock of Auth, Tenant, Technicians, Clients, Locations, Assets, Jobs, `/me/jobs` and Configuration (job types, custom fields).
  - Two fictional tenants from different industries; behaviour follows the contract.
  - Tenant-aware date/time and phone helpers.
  - Every mocked response is validated against the OpenAPI spec.
  - Open contract questions: `docs/backend-questions.md`.
  - Branch `feat/mock-api`.

## Next (candidates from `CLAUDE.md`, not yet planned or ordered)

- **Sign in / sign out** (`pages/login`, `features/auth`), with route guards by role: office vs `/field`.
- **Office:** jobs list, job detail, quick job entry, assign, status changes; clients list and detail; day overview.
- **Field (technician, phone-first):** field day, field job.
- **Generic custom-field renderer** for inputs and read-only display.
- **Remaining mock endpoints:** each comes with the screen that needs it, as `CLAUDE.md` requires. Not mocked yet:
  - invite/accept and password reset;
  - client import;
  - catalog items, message templates and checklist templates;
  - the rest of Field (report, materials, checklist, signature, complete);
  - Dispatch, Attachments, Messages, Public and Reports.
- **Later phase:** PWA / offline.
