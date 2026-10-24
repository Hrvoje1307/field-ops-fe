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

- [x] **Step 5: core entities and custom-field renderer**
  - `entities/job`: StatusBadge, PriorityMark, JobNumber, JobTypeTag, query options, `invalidateJobData`.
  - `entities/client`, `location` (API address, maps link, access notes, masked access codes), `technician` (chips in their colour), `job-type`, `asset`.
  - `entities/custom-field`: one input renderer and one read-only renderer for every field type, driven by `/custom-fields`; zod schema built at runtime; sensitive fields masked (unrevealed left out, revealed and cleared sends `null`); removed options kept with a warning until changed; 400 errors land on the right input.
  - `shared/lib`: relative day (Danas/Sutra/Jučer), duration and number in the tenant format.
  - Mock: each tenant uses every field type and a sensitive field; omitted sensitive fields keep their value.
  - Dev preview `/dev/custom-fields` (mock mode only), Playwright for both tenants.
  - Backend questions #22–#26.
  - Afterwards: the preview is left out of non-mock builds entirely; vendor chunks for react, tanstack and radix.
  - Branch `feat/core-entities`.

- [x] **Step 6: office jobs: list and detail, status changes**
  - `/jobs`: filters in the URL (status presets, scheduled date relative to the tenant's today, job type and technician from the API, priority, search, sort), paging, loading/empty/error states; table on desktop, cards on phones.
  - `/jobs/$jobId`: header, StatusTrack, schedule, client contacts, location (maps, access notes, access codes masked until revealed, location fields), equipment with its fields, the job's own fields read-only, status history.
  - `features/job/change-status`: menu from `allowedTransitions` (without `completed`, which goes through `/complete` in step 12); dialog with a required reason for cancel and on hold, confirmation for back to new and invoiced; 400 on the note next to it; any 409 refetches and keeps the dialog with the note; retries reuse the idempotency key.
  - `entities/job`: StatusTrack, note rule from the contract, one 409 handler for every job write.
  - `widgets/job-history`.
  - Backend question #27.
  - Branch `feat/office-jobs`.

## Next

Each step adds the mock handlers its screens need, as `CLAUDE.md` requires.

- [ ] **Step 7: quick job entry**
- [ ] **Step 8: clients: list, detail, edit client/location/asset**
- [ ] **Step 9: day overview and manual scheduling**
- [ ] **Step 10: field day and field job on the phone**
- [ ] **Step 11: dispatch board (drag and drop, route plans)**
- [ ] **Step 12: field report, photos, signature, complete, print**
- [ ] **Step 13: tenant settings**
- [ ] **Step 14: live updates (SignalR)**
- [ ] **Step 15: public appointment page and client messages**

## Separate

- [ ] **Step 4 against the real backend:** sign-in, session and app shell on the live API. Blocked on seeded demo accounts (`docs/backend-questions.md` #20).

## Later phase

- PWA / offline.
