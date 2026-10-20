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

- [x] **Step 4: login, session and app shell**
  - `features/auth`: sign-in (zod form; 401, 429 with the wait time, 400 next to the fields), sign-out, switch-tenant, forgot-password.
  - `entities/session`: `useMe()`, `/me` and `/tenant` queries; tenant timezone, locale, currency and country provided to the `shared/lib` formatters.
  - Routes: `/login` (keeps the redirect target), signed-in layout loading `/me`, office and `/field` areas with role guards both ways; revoked access ends on `/login` with a message.
  - `widgets/app-shell`: office rail and mobile top bar (Danas, Nalozi, Klijenti, user menu with tenant switcher), field header. The screens themselves are placeholders.
  - Sign-out and tenant switches follow across tabs.
  - Demo logins in mock mode.
  - Playwright covers both mock tenants.
  - Branch `feat/auth-shell`.

## Next (candidates from `CLAUDE.md`, not yet planned or ordered)

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
