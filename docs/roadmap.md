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
- [x] **Step 12: field report, photos, signature, complete, print**
  - `/field/jobs/$jobId/report` (phone): on site, "Izvještaj i završetak" is the job's big action. One page: what was done and the times (saved as typed, again after a failure, the input never lost; the arrival from the history is offered as the start), the checklist (large rows, the tick shows at once and is taken back if it fails), materials (from the tenant's catalog or free text, with the sum), photos (shrunk to 2000 px, one after another, a failed one can be tried again and resumes its upload), the client's signature (finger or pen, with the signer's name; asked for only as far as `requireSignature` says), and the one action that completes the job (what is missing is said first; "Pošalji izvještaj klijentu"). A 422 shows the API's reason, a 409 refetches.
  - Office job page: the report read-only (work done, times, checklist, materials, photos, signature), "Ispiši izvještaj" (fetched with the token, shown as a blob URL in the window the click opened) and the PDF once it is ready (the report is looked at again every few seconds after completion).
  - Entities: `entities/report` (report, checklist, materials, catalog, upload, signature, print hooks) and `useCompleteJob`; `useGetTenant`. Shared: `SignaturePad`, `shrinkPhoto`, print window helper.
  - Mock: report, checklist, materials, catalog, attachments (upload-url, a storage `PUT` that insists on the signed headers and the declared size, confirm, list, link, delete), signature, `/complete` with the contract's 422 rules and a PDF that appears after a delay, a printable HTML report; a catalog per tenant; completed jobs have a signature and a PDF.
  - Backend questions #36–#41. Playwright on the phone for both tenants (Alarmko needs the signature, Bura does not) and for the office.
- [x] **Step 13: tenant settings** (in five small parts, each committed on its own)
  - [x] **13a: company.** `/settings` (owner only; the menu item and the route both) with a list of sections and `/settings/company`: name, OIB, address, phone, email, IBAN, logo (uploaded at once, linked on save), language and country, time zone, currency, signature required, job number prefix, report colour and footer, reminder time, SMS sender, quiet hours, "on the way" SMS, link validity, and this month's usage. Saving refreshes the session (the shell's name), and everything shown in the tenant's time zone. 400s land next to their inputs.
    - Entities: `useUpdateTenant`, `useGetTenantUsage`, the form model (`entities/tenant`), `useUploadTenantLogo` (`entities/report`, next to the other file uploads). Shared: `CheckboxField`, `FormSection`, time zone and currency options.
    - Mock: the logo (a confirmed `logo` file of the company; `logoUrl` follows it). Backend questions #42–#44. Playwright for both tenants, a dispatcher and a technician.
  - [x] **13b: skills, depots, equipment types.** `/settings/skills`, `/settings/depots`, `/settings/equipment-types`: a list with add, edit (side panel) and delete (asking first) for each. Skills: a taken name is shown next to the name. Depots: name, address, working hours (closing after opening), optional coordinates (both or none, point or comma). Equipment types: name and the API's icon word, kept when only the name changes. A depot technicians start from and a type with equipment cannot be deleted: the 409 is worded.
    - Entities: `entities/skill` and `entities/depot` (new; requests, one hook per request, form models), equipment type requests and hooks in `entities/asset`. Writes refresh what shows the data (technicians, the board, job types, equipment, custom fields). Shared: `ConfigList`.
    - Backend question #45. Playwright for both tenants.
  - [x] **13c: job types and checklists.** `/settings/job-types`: a list with colour, duration, crew, required skills and checklist, add and edit in a side panel (name, colour picker with the code, duration of at least 5 minutes, 1 to 10 people, skills from `/skills`, a checklist from `/checklist-templates`, messages on or off, active), "Neaktivna" on retired ones, and delete that is refused (and says to deactivate) while jobs of the type exist. An inactive type is not offered for new jobs. `/settings/checklists`: templates with named items, "obavezna", moved up and down and removed; the dialog says existing jobs keep their items. A skill the tenant no longer has is dropped when a type is saved.
    - Entities: `entities/job-type` (create, update, delete, form model), new `entities/checklist-template`. Shared: `ColorField`. Writes refresh job data, the types and the templates.
    - Mock: `/checklist-templates` (list, create, replace, delete; blank labels are 400s; delete detaches job types). Backend question #46. Playwright for both tenants.
  - [x] **13d-1: custom fields.** `/settings/custom-fields?entity=`: the fields of clients, locations, equipment or jobs in display order, with type, key, required, sensitive and (equipment) the equipment type. Add and edit in a side panel (name, key suggested from the name and checked against the contract's pattern, type, equipment type, options for the select types, required, sensitive); the key and type are locked once saved; put up or down (renumbered in tens); delete says the values stay stored but hidden. The job form built from the definitions shows a new field at once. Equipment fields with the same name are told apart by their type in the buttons' names.
    - Entities: `entities/custom-field` (create, update, delete, all definitions of an entity, form model, order helper). Shared: `toKey`/`uniqueKey`, `SelectField` can be disabled. Backend question #47. Playwright for both tenants.
  - [x] **13d-2: message templates.** `/settings/messages`: the four kinds of message (reminder the day before, on the way, report ready, appointment changed), each with the channels the API offers, "Zadano" on the platform's own text, "Isključeno" on a switched-off one. The editor: subject (e-mail only), text with a button for each of the eight placeholders (put in at the cursor), a switch, and a preview from the API after typing stops: the text with sample data, characters and SMS count, a note when č, ć, š, ž or đ shrink an SMS to 70 characters, and unknown placeholders. Writing over a default creates the tenant's text (a 409 means someone just did: the list shows theirs); changing one it has replaces it; "Vrati zadano" asks first and brings the platform's text back.
    - Entities: new `entities/message-template` (requests, hooks incl. the preview, form model, placeholders). Shared: `fitsGsm7`/`unicodeOnlyCharacters`, `useDebouncedValue`.
    - Mock: `/message-templates` (list with defaults, create, replace, delete, preview with GSM-7/UCS-2 segment counting; own templates per tenant: Alarmko has customised one). Backend question #48. Playwright for both tenants.
  - [x] **13e: team.** `/settings/team`: the members with role ("Vlasnik", "Dispečer", "Monter"), "(vi)" on yourself, "Neaktivan", last sign-in and, for technicians, their hours, working days ("pon–pet"), depot and skills; change a member's role and whether they can sign in (not your own; a 409 says the company needs an active owner). "Podaci o monteru": colour, hours, working days, depot, skills, active; a member who has the role but no data gets it with the same form (create), the others are replaced. Invitations: invite by e-mail and role; when the server returns the link (no e-mail) it is shown with a copy button, also in the list; revoke asks first. A technician made active or inactive shows or hides their column on the day board at once.
    - Entities: new `entities/member` (members, invitations); `entities/technician` gets create/update and the form model. Shared: `weekdayName`, `formatWeekdays`.
    - Backend question #49. Playwright for both tenants.
- [x] **Step 14: live updates (SignalR)**
  - The signed-in area keeps a SignalR connection to `/hubs/dispatch` (one per company; switching company reconnects, signing out stops it), with the access token, and tries again for as long as it is down (0, 2, 5, 10, then every 30 s, renewing the token first). The SignalR client is a chunk of its own.
  - An event marks all job data stale (jobs, clients, the board, technicians' days, reports) and what is on screen refetches: the event only has the job's new date, so a board cannot know the old day. A burst, or the echo of our own write, refreshes once; a connection back after a break refreshes too. No polling.
  - A technician gets "Raspored je promijenjen." / "Objavljen je plan za …" for changes that were not their own (one at a time); after ten seconds of no live updates everyone sees a notice that the data may be behind.
  - Entities: new `entities/realtime` (`useRealtime`, the channel of status and events, own-write tracking, the refresher). Feature `live/updates`. Shared: `startHub` (`shared/api/realtime`), `env.hubUrl` (`VITE_HUB_URL` overrides).
  - Mock: the hub speaks the real SignalR protocol over MSW's WebSocket support (negotiate, handshake, pings); events are found by comparing the tenant before and after every write; the office hears its tenant, a technician their jobs and published plans; tenants are separate; the browser console has `__fieldopsDropHub(ms)` to cut it, with an outage.
  - Backend question #50. Playwright for both tenants: the board, a job's page and a technician's phone follow another session; a cut connection catches up.
- [ ] **Step 15: public appointment page and client messages**

## Separate

- [ ] **Step 4 against the real backend:** sign-in, session and app shell on the live API. Blocked on seeded demo accounts (`docs/backend-questions.md` #20).

## Later phase

- PWA / offline.
