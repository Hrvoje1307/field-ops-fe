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

- [x] **Restructure: where the backend is called**
  - `entities/<area>/` per API area (auth, tenant, job, client, location, asset, technician, job-type, custom-field) with `const.ts` (cache times) and `api.ts` (query keys, request functions written with `apiFetch` and `path`, cache helpers). `entities/session` became `entities/auth`; `/tenant` got its own entity.
  - Features write `useQuery` / `useMutation` inline with those; widgets and pages only compose (`widgets/job-history` became `features/job/history`; the job list and detail moved into `features/job/list` and `features/job/details`, composed by `widgets/job-detail`).
  - Orval generates plain functions (no hooks); the app imports only its types.
  - ESLint enforces it: requests only in entities, queries and mutations not in pages, widgets or shared, no generated request functions.
  - Branch `refactor/entity-api`.

- [x] **Step 7: quick job entry**
  - `/jobs/new` ("Novi nalog" in the office menu and on the job list): find the caller by phone (`/clients/lookup`) or by name, or enter a new client; pick one of their locations (the only one is picked by itself) or add one, optionally the equipment; then the job.
  - Job types are the tenant's active ones, with their default duration and crew size as hints; client, location and job custom fields come from `/custom-fields` (required ones shown, optional ones under "Dodatni podaci").
  - Saving: a new client goes with its first location in one request, a new location for an existing client goes first, then the job. After a saved client or location the form switches to it, so a retry only sends what is left; each request keeps its idempotency key while retried unchanged. 400s land next to their inputs (`contacts[0].phone`, `firstLocation.street`, `customFields.x` mapped onto the form).
  - Entities: `createJob`, `createClient`, `createLocation`; `ClientFields`, `ClientMatch`, `LocationFields`. Shared: `TextField`, `SelectField`, `ChoiceGroup`.
  - No new mock handlers were needed. Playwright for both tenants.
  - Branch `feat/quick-job-entry`.

- [x] **Step 8: clients: list, detail, edit client/location/asset**
  - `/clients`: search (name, phone, OIB, address), person/company filter and sort in the URL, open jobs per client, paging and states.
  - `/clients/$clientId`: contacts, the client's fields, each location (maps, access notes, access codes masked until revealed, location fields) with its equipment and the equipment's type fields; the client's latest jobs and "Novi nalog" (`/jobs/new?clientId=`, client chosen). Job pages link to the client.
  - Editing in side panels: the client (contacts added, removed, one primary; sent with `version`, a 409 keeps the panel and refetches), locations (access codes kept unless revealed: emptied removes, text replaces; the location keeps its own country), equipment (the chosen type's fields). Deleting asks first; open jobs block it with the API's 409.
  - `/clients/new`: a client without a job, with an optional first location.
  - Entities: client/location/asset update and delete requests and form models; `ClientProfileFields`, `ContactsFields`, `AccessCodesField`, `AssetFields`. Shared: `FormSheet`, `ConfirmDialog`, `reportSaveError`.
  - No new mock handlers were needed. Backend question #28. Playwright for both tenants.
  - Devtools are off in Playwright runs (`VITE_DEVTOOLS=false`), where they covered buttons.

- [x] **Step 9: day overview and manual scheduling**
  - `/` ("Danas"): a day (date in the URL, previous/next/today, tenant time zone) with the unscheduled queue (new jobs of any date, most urgent first) and a column per active technician: working hours or "Ne radi", planned load against the working day, jobs in visit order; every card opens the job or its schedule.
  - Scheduling in a side panel ("Zakaži" / "Promijeni termin", also on the job page): date, optional start, technicians with a lead; the start goes to the API as a UTC instant from the tenant-local date and time. Warnings that don't block: missing skills of the job type, day off, outside working hours, fewer technicians than needed, overlap with the technician's other jobs. "Ukloni iz rasporeda" puts the job back in the queue. A 409 keeps the panel and refetches; retries reuse the idempotency key.
  - Entities: `dispatch` (board), `assignJob`, technician working-time helpers.
  - Mock: new `GET /dispatch/board` handler (columns, working days, planned minutes, queue), tested and covered by the contract tests.
  - Toasts moved to the top centre: at the bottom right they covered side panels' buttons.
  - Backend question #29. Playwright for both tenants (the skill warning needs a technician lacking a skill: only Bura's seed has one).

- [x] **Step 10: field day and field job on the phone**
  - `/field` ("Moj dan"): the technician's own day (date in the URL, arrows, today) as large cards in visit order: time or planned arrival, client, address, job type, priority, status; call the client's primary contact and navigate with one tap.
  - `/field/jobs/$jobId`: location with a navigation button, access notes and access codes (large, masked until tapped), contacts to call, description and the office's note, equipment with its fields, the job's own fields. One big action fixed at the bottom: the next step of `allowedTransitions` (Označi: na putu → na lokaciji); "Više" for the rest (on hold with a required reason). Completing waits for step 12. A job of another technician is "not found".
  - The phone's position goes with the arrival steps (`lat`/`lng`) when it arrives within a few seconds; no permission or signal never stops the change. A 409 refetches and keeps the dialog's reason; retries reuse the idempotency key.
  - Entities: `getMyDay`, `splitTransitions` (primary step by display order, `completed` never offered), `CallButton`. Shared: `currentPosition`, a router test helper.
  - No new mock handlers. Playwright for both tenants on a phone viewport (the access-code test only runs for Alarmko: Bura's seed has no such job for its technician).

- [x] **Restructure: entity hooks**
  - Features, widgets and pages no longer write `queryKey`, `queryFn`, `staleTime` or `useMutation` themselves: each entity's `api.ts` has one hook per request (`useGetJob`, `useListClients`, `useListCustomFieldDefinitions`, `useCreateJob`, `useTransitionJob`, `useUpdateClient`, `useLogin`…) holding the key, request, cache time, idempotency key and cache refresh. A 409 on a job or client write is handled in the hook (refetch and message); features keep their own UI (dialogs, toasts, navigation).
  - ESLint fails when features, widgets or pages import TanStack Query's hooks, a `*Keys` object or a `*_STALE_TIME`.

## Next

Each step adds the mock handlers its screens need, as `CLAUDE.md` requires.

- [x] **Step 11: dispatch board (drag and drop, route plans)**
  - The day board: cards move between the queue and the technicians' columns and within a day, by pointer or keyboard (`@dnd-kit`; announcements in Croatian). A drop saves at once: the technician, the board's day and the position (`sequence`), no start time; skills and day-off warnings follow without blocking. Locked jobs, jobs for several people and jobs under way stay put; a padlock locks and unlocks scheduled jobs. The scheduling panel stays the way to set an exact time.
  - "Optimiraj dan": choose technicians (those working that day) and jobs (the queue and scheduled jobs, locked and crew ones included, they stay with their people), a few seconds of solver, then the draft's own page `/plans/$planId`. Off, with the reason, when `Me.features` has no `route_optimization`; 402 and 502 are worded.
  - The plan page: a column per technician with arrival, departure and drive for each stop, route and plan totals, the jobs the plan could not place with the reason (the six contract reasons) and the API's detail. A draft is corrected by dragging (each change is saved with `PUT`, times come back recalculated) and published after a confirmation; a published or discarded plan is read-only. The day links to its draft or published plan.
  - Entities: route plan requests and hooks in `entities/dispatch` (409 refetches and tells the user); `canSchedule` moved to `entities/job`, `scheduleWarnings` and `warningText` to `entities/technician`. Shared: `DragBoard`/`DragList`/`DragItem`/`DragColumn`, `resolveMove`, `formatDistance`.
  - Mock: `POST /route-plans/optimize` (a stand-in solver: cheapest insertion by travel time, locked and crew jobs fixed, skills, working days and hours, windows, coordinates, the contract's reasons), `GET`/`PUT`/`publish`, 402 for `basic`, usage count, 409 when not a draft; the board reports `draftPlanId` and `publishedPlanId`; `/assign` with `sequence` makes room in the day.
  - Backend questions #30–#35. Playwright for both tenants (optimizing only for Alarmko: Bura's plan is `basic`, where it checks the button is off).
- [ ] **Step 12: field report, photos, signature, complete, print**
- [ ] **Step 13: tenant settings**
- [ ] **Step 14: live updates (SignalR)**
- [ ] **Step 15: public appointment page and client messages**

## Separate

- [ ] **Step 4 against the real backend:** sign-in, session and app shell on the live API. Blocked on seeded demo accounts (`docs/backend-questions.md` #20).

## Later phase

- PWA / offline.
