# Questions for the backend

Places where `openapi/openapi.json` is ambiguous, incomplete or contradicts `schemas/schema.md`, found while building the mock API (`src/shared/api/mocks`). Each item lists what the spec says, what the mock does today, and what we propose. The mock's behaviour is a placeholder until the backend answers; the frontend is built against the proposal.

**Status, spec 0.2.0 (2026-10-23):** 0.2.0 doesn't resolve any of items 1–18 yet. Its changes are the print endpoint, `Location.address`, `Invitation.inviteUrl`, the `accessCodes` semantics and description fixes. Items 19–21 are new; items 22–26 came up while building the custom-field renderer (step 5), item 27 with the office job screens (step 6), item 28 with the client screens (step 8), item 29 with scheduling (step 9).

## 1. Two different job status machines

**Spec says:** the OpenAPI description has a transition table. `schemas/schema.md` has a diagram that also allows `scheduled → on_hold`, `en_route → on_hold` and "any open status → cancelled", which would include `en_route → cancelled` and `on_site → cancelled`. The OpenAPI table allows none of these.

**Mock does:** follows the OpenAPI table exactly (`src/shared/api/mocks/lib/job-machine.ts`).

**We propose:** make one document the source of truth (the OpenAPI table) and align the other. See also #14 for one transition we'd like added.

## 2. `/jobs/{id}/transition` declares no 400

**Spec says:** `TransitionRequest.note` is "Required for cancelled and on_hold", but the operation only declares 200, 403 and 409.

**Mock does:** returns `400 ValidationProblemDetails` with `errors.note` when the note is missing or blank.

**We propose:** declare `400` (`#/components/responses/ValidationError`) on the operation.

## 3. Which transitions may a technician perform, and is `completed` in `allowedTransitions`?

**Spec says:** `allowedTransitions` lists "transitions the current user may perform now" and `completed` is only reachable via `/complete`. It doesn't say which transitions each role may perform; only reopening (`completed → new`, `cancelled → new`) is marked owner/dispatcher.

**Mock does:**

- Technicians, on jobs assigned to them: `scheduled`/`confirmed → en_route`, `en_route → on_site`, `on_site → on_hold`, and `on_site → completed`. Everything else is office-only (403 from `/transition`).
- `completed` is included in `allowedTransitions` for an `on_site` job, so the UI can show the "complete" button, which goes through `/complete`. `/transition` with `to: completed` returns 409.
- `scheduled` is only offered when the job has a date and at least one technician; otherwise `/transition` returns `409` with code `job.not_schedulable`.

**We propose:** document this role table in the spec, and confirm that `completed` belongs in `allowedTransitions`.

## 4. Error responses the spec doesn't declare

**Spec says:** most operations declare only their success response, sometimes one error. Examples: `GET /locations/{id}` declares only 200, though the `NotFound` response says it is "also returned for other tenants' resources". Technicians' 403s are almost nowhere. The idempotency 422 ("a replay with a different body returns 422") isn't declared on any operation. The four operations that do declare a 422 use it for something else: completion requirements, attachment confirmation, immutable custom-field properties and notify.

**Mock does:** returns them anyway. The contract test accepts these undeclared responses:

- 401 / 403 / 404 / 422 as `ProblemDetails` on every protected operation;
- 400 as `ValidationProblemDetails` on operations with a body or query parameters;
- 409 on operations that send a `version`.

Anything else undeclared fails the test.

**We propose:** declare these on the operations (or as documented global responses), so the generated client types the errors correctly.

## 5. `version` exists only on Client and Job

**Spec says:** "`version` (from Postgres xmin) enables optimistic concurrency → 409". It exists only on `Client`/`ClientUpdate` and `Job`/`JobUpdate`/`TransitionRequest`/`AssignRequest`. `Location`, `Asset`, `Technician`, `Tenant`, `JobType`, `CustomFieldDefinition`, `Depot` and `Skill` have no `version`, although every row has an xmin. It is also optional in `ClientUpdate`, `TransitionRequest` and `AssignRequest` (required only in `JobUpdate`).

**Mock does:** checks `version` where the spec has it. A stale value → `409` with codes `client.version_conflict` / `job.version_conflict`. An omitted value → no check. Other entities are last-write-wins.

**We propose:** add `version` to every updatable entity (response and update body). Make it required on updates, so a client that forgets it can't overwrite someone else's change.

## 6. Role rules for most endpoints

**Spec says:** only `PUT /tenant` and `PUT /users/{userId}` are marked "Owner only". `GET /jobs` says technicians see only assigned jobs. Nothing else is specified.

**Mock does:**

- **Owner only:** `PUT /tenant`, `PUT /users/{userId}`.
- **Office (owner + dispatcher):** everything else.
- **Technicians may read:** `/me`, `/tenant`, depots, skills, job types, asset types and custom fields; `/me/jobs`, `/technicians/{own id}/schedule`, and jobs assigned to them (`GET /jobs`, `GET/PUT /jobs/{id}`, transition, history).
- **Technicians get 403** from everything else: clients, locations, assets, technicians, members, usage and configuration writes.
- **A technician opening a job that isn't theirs gets 404, not 403.**
- **`PUT /jobs/{id}` by a technician** may change only `internalNote`; any other change → 403 (`job.field_not_editable`).
- **Non-technicians calling `/me/jobs`** get 403.

**We propose:** put a role matrix in the spec (e.g. an `x-roles` extension per operation). In particular, decide whether technicians may add or edit equipment on site (`POST /locations/{id}/assets`, `PUT /assets/{id}`), which currently returns 403.

## 7. Login into a foreign tenant; switch-tenant can't revoke the old session

**Spec says:** `POST /auth/login` "picks `tenantId` if given, else the last-used tenant" and declares 200/401/429. `POST /auth/switch-tenant` takes only `tenantId`.

**Mock does:**

- Logging in with a `tenantId` the user isn't an active member of returns 401 (`auth.not_a_member`), the same as bad credentials.
- switch-tenant issues a new token pair in a new refresh family for the target tenant, and records it as last-used.
- The old refresh family stays valid until it expires, because the request doesn't say which one it was.

**We propose:**

- Confirm 401 (not 403) for the foreign-tenant login.
- Add `refreshToken` to the switch-tenant request so the old family can be revoked.

## 8. Language of validation messages

**Spec says:** `ValidationProblemDetails.errors` maps field paths to free-text messages; the language isn't specified.

**Mock does:** returns Croatian messages ("Obavezno polje.", "Neispravan broj telefona.") because both tenants use `hr-HR`. `ProblemDetails.code` carries a stable machine code for non-field errors.

**We propose:** either

- localise messages by `Accept-Language` (falling back to the tenant locale), or
- add a stable code per field error (e.g. `errors: { name: [{ code: "required", message: "…" }] }`) so the frontend can translate.

Codes are preferable because we want an `en` locale later.

## 9. Scope of `Idempotency-Key`

**Spec says:** the header is declared on 10 field actions. The description says "Field actions accept `Idempotency-Key`".

**Mock does:**

- Honours the key on every non-GET request, because the frontend sends one on every non-GET request (except the internal `/auth/refresh` call).
- Responses are stored per (tenant, user, key) for 24 h.
- A replay with the same method, path and body returns the stored response, with `Idempotent-Replayed: true`. The same key with a different request returns 422 (`idempotency.key_reused`).

**We propose:** accept the key on every POST/PUT/PATCH/DELETE, declare the parameter on all of them, and declare the 422.

## 10. Job list filter semantics

**Spec says:** `from`/`to` are documented in the generated client as `scheduledDate >= from` / `<= to`. The combination with `unscheduled` and the meaning of `sort=priority` aren't specified.

**Mock does:**

- `from`/`to` filter on `scheduledDate`, inclusive.
- `unscheduled=true` together with `from`/`to` → 400.
- `priority` sorts by importance (low < normal < high < urgent), not alphabetically.
- `sort=scheduledStart` puts unscheduled jobs last in both directions.

**We propose:** confirm these semantics and write them into the parameter descriptions.

## 11. Out-of-range paging and unparseable phone numbers

**Spec says:** `page` has `minimum: 1`; `pageSize` has `minimum: 1, maximum: 200`. `GET /clients/lookup` normalises the phone server-side and declares a 400, without saying when.

**Mock does:**

- `page < 1` or `pageSize > 200` → 400 with field errors (no silent clamping).
- A phone that can't be normalised to E.164 (in the tenant's country) → 400 on `phone`.
- A valid number with no client → 200 with `matches: []`.

**We propose:** confirm 400 rather than clamping.

## 12. `Me.features` values

**Spec says:** "Plan feature flags, e.g. `route_optimization`, `sms`"; the full list isn't defined.

**Mock does:** `pro` and `trial` → `["route_optimization", "sms"]`; `basic` → `["sms"]`.

**We propose:** define the flags as an enum in the spec, together with which plan enables which.

## 13. `Idempotency-Key` on GET for report and checklist

**Spec says:** on `/jobs/{id}/report` and `/jobs/{id}/checklist`, `IdempotencyKey` is declared in the path-level `parameters`, so it applies to the `GET` operations too. The generated client therefore adds an optional `Idempotency-Key` header to `getJobReport` and `getJobChecklist`.

**Mock does:** ignores the header on every GET.

**We propose:** move the parameter from the path item to the `put` operations only.

## 14. Allow `scheduled → on_hold`

**Spec says:** the OpenAPI table only reaches `on_hold` from `on_site`. `schemas/schema.md` also allows `scheduled → on_hold` and `en_route → on_hold`.

**Mock does:** follows the OpenAPI table (see #1). A job waiting for a part before the first visit therefore has to go back to `new`, losing its date and technicians, or stay `scheduled` with a note.

**We propose:** add `scheduled → on_hold` to the OpenAPI table (reason required, like the other `on_hold` transitions). Waiting for a part or for the client before the visit is a common real case. We don't need `en_route → on_hold`.

## 15. Tenant country for phone numbers

**Spec says:** phones are E.164 and the frontend shows them "in the tenant country's national format". `Tenant` has `locale`, `timezone` and `currency`, but no country.

**Mock does:** the frontend and the mock derive the country from the locale's region (`hr-HR` → `HR`, `en-US` → `US`). They use it to read national numbers in contact input and the phone lookup.

**We propose:** add an explicit `country` (ISO 3166-1 alpha-2) to `Tenant`/`TenantUpdate`. Locale and country can differ, e.g. an English-speaking UI for a Croatian company.

## 16. Expose `Retry-After` to the browser (CORS)

**Spec says:** the `TooManyRequests` response (429 on `/auth/login`) declares a `Retry-After` header.

**Mock does:** sends `Retry-After` in seconds. The frontend shows "Previše neuspjelih pokušaja. Pokušajte ponovno za N min.", and falls back to "Previše pokušaja, pokušajte malo kasnije." when the header is missing.

**We propose:** the API is on another origin than the frontend, so the browser only lets JavaScript read `Retry-After` if CORS responses include `Access-Control-Expose-Headers: Retry-After`. Please add it, next to allowing `Authorization` and `Idempotency-Key` in `Access-Control-Allow-Headers`.

## 17. Technician role label as a tenant setting

**Spec says:** `Role` is a fixed enum (`owner`, `dispatcher`, `technician`); `TenantSettings` has no labels.

**Mock does:** the frontend labels the role from i18n: "Vlasnik", "Dispečer", "Monter".

**We propose:** add a tenant setting such as `tenant.settings.technicianLabel`. "Monter" fits installers but not cleaning or HVAC companies; they'd say "serviser", "djelatnik" and so on. The frontend keeps "Monter" from i18n as the fallback until the setting exists.

## 18. A stable code for revoked access

**Spec says:** `ProblemDetails.code` is described as a stable machine code, but no codes are listed. Nothing says what `/me`, or any authenticated call, returns once a user or their membership is deactivated.

**Mock does:**

- Returns `401` with `code: "auth.access_revoked"`, both on API calls and on `/auth/refresh`, when the user no longer exists or the membership is inactive.
- The frontend then clears the session and shows "Vaš pristup je ukinut. Obratite se vlasniku tvrtke." on `/login`. It treats `403` from `/me` the same way.
- Every other 401 counts as an ended session ("Sesija je istekla").

**We propose:** document `auth.access_revoked` (and the other auth codes the backend uses) in the spec, so the frontend doesn't depend on a convention.

## 19. CORS for the frontend origins

**Spec says:** nothing (CORS isn't part of OpenAPI).

**What the live API does (preflight check, 2026-10-23):**

- **Allowed origins:** `http://localhost:5173` and **any** `https://*.vercel.app` origin, i.e. every Vercel-hosted site, not only ours. Others, e.g. `http://localhost:4173` (`npm run preview`), get no CORS headers.
- **Credentials:** responses include `Access-Control-Allow-Credentials: true`.
- **Methods and headers:** the requested method and headers are allowed (`Authorization`, `Idempotency-Key`, `Content-Type` work).
- **Exposed headers:** only `Idempotent-Replayed`. `Retry-After` is not exposed, see #16.

**We propose:**

- **Origins:** an explicit allowlist: `http://localhost:5173`, `http://localhost:4173`, the production domain, and our project's Vercel preview pattern instead of all of `*.vercel.app`.
- **Headers:** allow `Authorization`, `Idempotency-Key` and `Content-Type`.
- **Exposed headers:** `Retry-After` and `Idempotent-Replayed`.
- **Credentials:** drop `Allow-Credentials` unless cookies are used. The frontend sends a bearer token, so it isn't needed.

## 20. Seeded demo accounts on the server

**Spec says:** nothing.

**Mock does:** seeds two fictional tenants (an alarm installer in Zagreb, an HVAC/plumbing company in Split). It has an owner, a dispatcher and technicians per tenant, plus one dispatcher in both, all with password `demo` (README, "Mock API"). The demo login buttons and the Playwright tests use them.

**We propose:** seed the same accounts (emails, roles, both tenants, the shared dispatcher) on the dev/staging server, plus comparable demo data. Then the app and the Playwright suite can run against the real backend unchanged. Not on production.

## 21. Where `Invitation.inviteUrl` points

**Spec says:** `inviteUrl` (0.2.0) is returned "only when the server has no SMTP configured". It doesn't say which URL it contains. Accepting goes through `POST /auth/invite/accept { token, password, fullName }`.

**Mock does:** returns `<app origin>/invite?token=<token>`.

**We propose:** the link points at the frontend, not the API: `<frontend base URL>/invite?token=<token>`, with the frontend base URL configured per environment on the server. The emailed link should use the same format. The frontend will add the `/invite` page in a later step.

## 22. Hidden vs. empty sensitive custom fields

**Spec says:** `CustomFieldValues`: "Sensitive fields are returned only to owners/dispatchers and assigned technicians; otherwise omitted." `Location` has `hasAccessCodes` for the same situation with access codes; custom fields have nothing like it.

**Mock does:** leaves hidden sensitive keys out, as the spec says.

**Frontend does:** shows "—" (not set) for a sensitive field without a value. For a viewer who may not see it, that may be wrong: the value exists but is hidden.

**We propose:** list the keys that were withheld, e.g. `hiddenCustomFields: ["entry_code"]` next to `customFields` on Client, Location, Asset and Job. The UI can then show "hidden" instead of "not set".

## 23. `customFields` on PUT: replace, keep or clear

**Spec says:** nothing about how `customFields` on PUT (clients, locations, assets, jobs) relates to the stored values.

**Mock does:**

- The object replaces the stored one: a non-sensitive key that is left out is cleared.
- An omitted **sensitive** key keeps its stored value, for every caller.
- `null` or `""` clears a value, sensitive or not.

**Frontend does:**

- Leaves empty fields out of the request.
- Leaves out a masked sensitive field the user never revealed, so the server keeps it.
- Sends `null` for a sensitive field the user revealed and then emptied: **clearing a sensitive field needs an explicit `null`**, because leaving it out means "keep".

Note the asymmetry with `LocationInput.accessCodes` (0.2.0), where `null` means "keep" and `""` means "remove". For sensitive custom fields, leaving the key out means "keep" and `null` means "clear".

**We propose:** document exactly these rules in the spec (or tell us the server's, and we follow them).

## 24. What `required` means for a checkbox

**Spec says:** `CustomFieldDefinitionInput.required` is a boolean for every type, including `checkbox`.

**Mock does:** a required checkbox only needs a value: `false` counts as filled.

**Frontend does:** the same. A checkbox always sends `true` or `false`, so a required checkbox never blocks saving.

**We propose:** confirm this, or say that a required checkbox must be ticked (e.g. a confirmation). In that case the frontend will require `true`.

## 25. Make `Location.address` required in responses

**Spec says:** `Location.address` (0.2.0) is `readOnly` and optional. `JobSummary.location.address` is required.

**Frontend does:** shows `address`. If it's missing, one helper (`locationAddress` in `entities/location`) joins street and city, so addresses aren't formatted anywhere else.

**We propose:** list `address` under `required` for `Location` (read-only fields can be required in responses). Then the fallback can go.

## 26. Same custom-field key for all asset types and for one type

**Spec says:** `GET /custom-fields?entity=asset&assetTypeId=…` returns the definitions for that asset type. It doesn't say whether a definition with no `assetTypeId` (all asset types) and one for the given type may share a `key`, or which one applies if they do.

**Frontend does:** keeps one definition per key; the one for the specific asset type wins (`prepareDefinitions` in `entities/custom-field`). The mock data has such a pair, and asking for that type returns both.

**We propose:** either forbid duplicate keys within an entity (400 when creating the definition), or document that the type-specific definition overrides the general one and return only that one.

## 27. What a transition to `new` clears

**Spec says:** the status table allows `scheduled`, `confirmed`, `on_hold`, `completed` and `cancelled` → `new`. It doesn't say what happens to the job's date and technicians. `POST /jobs/{id}/assign` says an empty `technicianIds` "moves a scheduled job back to `new`", and `DispatchBoard.unassigned` is "Status new (any date)", so a `new` job may keep a date.

**Mock does:** `/transition` to `new` clears `scheduledDate`, `scheduledStart` and all technicians (back to the queue, or reopened).

**Frontend does:** asks for confirmation ("Nalog … vraća se među nove naloge.") without saying what is cleared, and shows the job as the server returns it.

**We propose:** document it on `/transition`. Either `→ new` clears date and technicians (then we'll say so in the confirmation), or it keeps them and only the status changes.

## 28. Deleting equipment that open jobs refer to

**Spec says:** `DELETE /assets/{id}` answers only `204`. `DELETE /locations/{id}` and `DELETE /clients/{id}` answer `409` while there are open jobs. Nothing says what happens to jobs whose `assetId` points at deleted equipment.

**Mock does:** soft-deletes the equipment; jobs keep their `assetId` and still show it.

**Frontend does:** asks for confirmation, then deletes; job pages keep showing what the API returns.

**We propose:** either `409` while open jobs refer to the equipment (like locations), or document that jobs keep the reference and keep returning the deleted equipment in `Job.asset`.

## 29. What `POST /jobs/{id}/assign` checks

**Spec says:** "Manual assignment (drag & drop). Replaces the assignment set." 400 for validation, 409 for conflicts. It doesn't say which job statuses may be reassigned, nor whether technicians without the job type's required skills, on a non-working day or outside their working hours are refused. `DispatchBoard` and the technician fields (`skillIds`, `workingDays`, `workStart`, `workEnd`) carry the data to check.

**Mock does:** refuses `en_route`, `on_site`, `completed`, `invoiced` and `cancelled` with `409 job.not_assignable`; unknown or inactive technicians and a lead who isn't assigned give `400`; a start on another day than `scheduledDate` gives `400`. Skills, working days and hours are not checked.

**Frontend does:** only offers scheduling for `new`, `scheduled`, `confirmed` and `on_hold`, and shows skills, days off, hours, crew size and overlaps as warnings that don't block saving.

**We propose:** document the accepted statuses on the operation, and decide whether skills, days off and hours are errors or only warnings. We prefer warnings only: a dispatcher may know better (a swap, a favour, an emergency).

## 30. A `version` on `JobSummary`

**Spec says:** `AssignRequest.version` is optional, and `JobSummary` (the dispatch board's card) has no `version`; only `Job` does.

**Mock does:** accepts `/assign` without a `version` and applies it.

**Frontend does:** a drag and drop on the board sends `/assign` without `version`, because the card has none (reading the job first would make the check meaningless: it would compare the job with itself a moment ago). Two dispatchers moving the same card overwrite each other.

**We propose:** add `version` to `JobSummary` so the board can send what the user saw and get a `409` when the job changed.

## 31. What `sequence` does in `/assign`

**Spec says:** `sequence`: "Position in the lead technician's day (board ordering)". Nothing says whether it is a plain number saved on that job or an insertion point that makes room for the job, nor how it combines with `scheduledStart` when the order and the times disagree.

**Mock does:** treats it as an insertion point (the others in that technician's day are numbered again); the board lists jobs by `sequence`, then start time.

**Frontend does:** a drop sends the technician, the day, `scheduledStart: null` (the position decides the order now) and `sequence` = the index it was dropped at.

**We propose:** insertion semantics (the server renumbers), documented on the operation. If it is only a stored number, the frontend has to send one request per job whose position changed.

## 32. Discarding a draft route plan, and drafts piling up

**Spec says:** `POST /route-plans/optimize` stores a `draft`; publishing makes the day's earlier published plan `discarded`. There is no endpoint to discard a draft, and nothing says what happens to an earlier draft of the same day when a new one is made. The board has one `draftPlanId`.

**Mock does:** a new draft makes the day's earlier drafts `discarded`.

**Frontend does:** shows the board's `draftPlanId` as "the draft"; there is no "discard" button.

**We propose:** say which draft the board reports when there are several, and either discard older drafts on optimize (as the mock does) or add `DELETE /route-plans/{id}`.

## 33. What `/route-plans/optimize` accepts and returns

**Spec says:** takes `date`, `technicianIds` and `jobIds`; "Locked jobs and multi-person jobs stay fixed with their current assignee". Not said: which job statuses are accepted, where a route starts and ends (a depot per technician? `Route.depotId` is optional), whether `Stop.sequence` starts at 0 or 1, and how a locked job that is not in `jobIds` counts.

**Mock does:** accepts `new`, `scheduled`, `confirmed` and `on_hold` jobs (400 otherwise); every route starts and ends at the tenant's first depot; `sequence` starts at 1; a fixed job whose assignees are not chosen is unassigned with reason `other`.

**Frontend does:** offers the queue and the day's scheduled and confirmed jobs, all chosen, with the technicians who work that day; locked and crew jobs are offered too.

**We propose:** document accepted statuses, the start and end of a route, and the base of `sequence`.

## 34. What `PUT /route-plans/{id}` checks, and concurrent edits

**Spec says:** "Manual corrections to a draft. Server recomputes ETAs only for routes that changed." `409` if the plan is not a draft. No `version`, no mention of what a correction may not do.

**Mock does:** `400` for a job that is not part of the plan, a technician that is unknown or inactive, or a single-person job in two routes; jobs left out of every route become `unassigned` with reason `other`; skills, working days and hours are not checked.

**Frontend does:** every drag sends the whole routes; ETAs come from the response.

**We propose:** warnings, not errors, for skills and hours (as in #29); a `version` or `updatedAt` on the plan so two dispatchers correcting the same draft get a `409` instead of overwriting each other.

## 35. What publishing does to jobs that already have a status

**Spec says:** publish "applies the plan: assignments, scheduledStart, jobs → `scheduled`".

**Mock does:** `new` and `on_hold` jobs become `scheduled`; `scheduled` and `confirmed` keep their status (a client who confirmed stays confirmed) and get the new time and technician; jobs the plan left unassigned are untouched.

**Frontend does:** shows what the API returns on the board.

**We propose:** document it; a confirmed job whose time changes probably needs the client told again.

## 36. Reading a report that does not exist yet

**Spec says:** `GET /jobs/{id}/report` answers `JobReport` (200) and `Job.report` is optional. Nothing says what a job that has no report yet gets.

**Mock does:** creates an empty report the first time it is read or written (200), and `Job.report` is `null` until then.

**Frontend does:** opens the report screen for a job on site and expects an empty `JobReport` (not 404) to fill in.

**We propose:** document it: an empty report (all fields `null`, the job's checklist copied in, no materials or photos) for a job on site, so the screen never has to treat 404 as "start a new one".

## 37. Who fills in the times at completion, and what `sendReportToClient` does without an email

**Spec says:** `POST /jobs/{id}/complete` validates required checklist items, the signature (if `requireSignature`) and `workDone`, sets `completed`, queues the PDF and the client email. `startedAt`, `finishedAt` and `labourMinutes` are optional on the report.

**Mock does:** nothing with the times; sends no email (it only counts one in the usage when `sendReportToClient` is not `false`).

**Frontend does:** offers the arrival (from the status history) as `startedAt`, and sets `finishedAt` to now when the technician left it empty, both through `PUT /report` before completing. Leaves `labourMinutes` alone.

**We propose:** say whether the API fills `startedAt` (the on-site time) and `finishedAt` (the completion time) itself when they are empty, and what happens to `sendReportToClient: true` when the client has no email (ignored, or a 422?). If the API fills them, the frontend stops doing it.

## 38. What a 422 from `/complete` says, and concurrent edits of one report

**Spec says:** `422` is `ProblemDetails` with "Completion requirements not met". `PUT /jobs/{id}/report` has no `version`.

**Mock does:** one sentence in `detail` listing everything missing (open required checklist items by name, the signature, the work done), `code: job.completion_requirements`.

**Frontend does:** works out what is missing itself from the report (so the button waits and says why) and shows the API's `detail` when it still answers 422. The office and the technician saving the same report at the same time overwrite each other.

**We propose:** a machine-readable list in the 422 (e.g. `errors` with `checklist`, `signature`, `workDone`) so the screen can point at the item, and a `version` (or `updatedAt`) on `JobReport` for `PUT`, answered with `409` like jobs and clients.

## 39. Prices on a report seen by technicians

**Spec says:** `JobMaterial` has `unitPrice` and `lineTotal`; `JobReport.totalMaterials` is a `Money`. Nothing limits them by role.

**Mock does:** technicians see and may set prices (free-text materials take an optional `unitPrice`).

**Frontend does:** shows prices and the sum to technicians and lets them type a price for free-text material.

**We propose:** decide whether technicians see prices (a tenant setting would fit: some companies do not want field staff to see them) and whether they may set one for free-text material.

## 40. How the client learns the PDF is ready, and photo formats

**Spec says:** "The PDF appears on the report as `pdfAttachmentId` when the background job finishes." Photos: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, up to 20 MB; `GET /attachments/{id}/url` gives a link valid 5 minutes and a `thumbnailUrl`.

**Mock does:** `pdfAttachmentId` appears 3 seconds after completion; the PUT to the storage URL insists on exactly the returned headers and the declared size.

**Frontend does:** fetches the report again every 3 seconds for up to 2 minutes after completion until `pdfAttachmentId` is there (step 14's SignalR can replace this). Photos are shrunk in the browser to JPEG with the longest side at most 2000 px when the browser can decode them; otherwise (HEIC in browsers that cannot read it) the file is sent as it is. `takenAt` is the file's last-modified time.

**We propose:** an event (`ReportPdfReady`, thin like the others) so no polling is needed; say whether HEIC is converted and a thumbnail made for it; say whether `takenAt` should come from the photo's EXIF instead.

## 41. CORS of the file storage

**Spec says:** `POST /attachments/upload-url` returns a `uploadUrl` (`PUT`) and the exact `headers` to send; question #19 asks for CORS on the API for the frontend's origins.

**Mock does:** serves the "storage" from the API's own origin, so CORS never shows.

**Frontend does:** the browser `PUT`s photo and signature bytes straight to `uploadUrl` with the returned headers (`Content-Type`) and no bearer token, and opens files from the presigned `GET` links.

**We propose:** the storage bucket (S3) allows `PUT` and `GET` from the frontend origins (production, Vercel previews, `localhost:5173`) with the signed headers, and exposes `ETag` if it matters to you. Without it every photo and signature fails in the browser even though the API calls work.

## 42. No `version` on the configuration entities

**Spec says:** `PUT /tenant`, `/depots/{id}`, `/skills/{id}`, `/job-types/{id}`, `/asset-types/{id}`, `/custom-fields/{id}`, `/message-templates/{id}` and `/technicians/{id}` take no `version` and return no 409 for a stale write (clients, locations and jobs do).

**Mock does:** the last save wins.

**Frontend does:** sends the whole object it loaded with the changes typed on top, so a second person's change to another field of the same record is lost when the first person saves.

**We propose:** the same optimistic `version` as on clients, at least on `PUT /tenant` (one big object with many settings) and on job types.

## 43. Who may change the configuration

**Spec says:** only `PUT /tenant` and `/users` say "Owner only". Nothing is said for depots, skills, job types, equipment types, custom fields, message templates, invitations or technicians.

**Mock does:** `PUT /tenant` and `/users` are owner only; the rest is open to the office (owner and dispatcher).

**Frontend does:** shows "Postavke" only to the owner and sends dispatchers away from `/settings`, until the rights are known. A dispatcher can therefore not change anything there even where the API would let them.

**We propose:** say per endpoint whether a dispatcher may write (it is common that a dispatcher edits job types and message templates but not the company or the team), and whether a dispatcher may at least read them.

## 44. The company logo and sender name

**Spec says:** `Tenant.logoAttachmentId` (set by `PUT /tenant`) and read-only `logoUrl`; the upload accepts `kind: logo` with the same mime list as other files (JPEG, PNG, WebP, HEIC, PDF, up to 20 MB). `smsSenderName` is "alphanumeric sender ID", max 11.

**Mock does:** a logo is a confirmed `logo` file of the company in JPEG, PNG or WebP; `logoUrl` is its address. Any text up to 11 characters is a sender name.

**Frontend does:** takes pictures in JPEG, PNG or WebP up to 2 MB, uploads at once, and links the file when the settings are saved. A replaced or removed logo's old file is left alone.

**We propose:** say which formats a logo may be (a PDF or HEIC logo is of no use on a report), how long `logoUrl` is valid (if it is a presigned link the page needs to fetch it again), whether the old logo file is deleted when another is linked, and what a sender name may contain (spaces? the 11-character limit counts which characters?).

## 45. Skills, depots and equipment types: what the contract leaves open

**Spec says:** `POST /skills` answers 409 (a duplicate name, presumably); `PUT /skills/{id}` lists no error; `DELETE /skills/{id}` is 204 with no 409. `DELETE /depots/{id}` and `DELETE /asset-types/{id}` answer 409. `Depot.lat/lng` are optional. `AssetType.icon` is a free string.

**Mock does:** `POST /skills` with a name that exists is 409, `PUT` with one is 400 on `name`, and a deleted skill is also removed from technicians and from the job types that require it. A depot technicians start from and a type that equipment has cannot be deleted (409); deleting an equipment type deletes its custom fields.

**Frontend does:** shows a taken skill name next to the name for both 409 and 400, words the two depot and type 409s ("technicians still start here", "equipment of this type exists"), and asks before every delete. Coordinates are typed by hand and optional; the icon is a text field that is kept as it is when only the name changes.

**We propose:** say what `PUT /skills` answers for a taken name (400 `name` or 409), what deleting a skill does to the job types that require it and to technicians (remove it from both, as the mock does, or refuse with 409 listing them), whether the backend geocodes a depot's address when `lat/lng` are empty (if not, the screen needs a way to find them, if so the fields can go), and which icon names exist (a list, so the screen can offer them instead of free text). Say too whether deleting an equipment type should take its custom fields' stored values with it.

## 46. Checklist templates and job type deletion

**Spec says:** `DELETE /checklist-templates/{id}` is 204 with no 409, and `JobType.checklistTemplateId` points at one. `PUT /checklist-templates/{id}`: "Affects only jobs created afterwards (items are copied into each job)". `DELETE /job-types/{id}` answers 409 (jobs use it). A job type's `color` is `#rrggbb`.

**Mock does:** deleting a template that job types use takes it off them (their `checklistTemplateId` becomes `null`); jobs keep their copied items. A job type with jobs cannot be deleted (409). Blank names and labels are 400s on `name` and `items[n].label`.

**Frontend does:** offers "Aktivna" as the way to retire a job type (inactive types stay on existing jobs and are not offered for new ones) and says so when a delete is refused; says in the template dialog that existing jobs keep their items; sends the items in the order shown (the contract has no `position` on a template item, so order is the array's); requires at least one item with a label.

**We propose:** say whether deleting a template in use is refused (409) or detaches it, as above; whether a job type that is `isActive: false` still shows in `GET /job-types` (the screen assumes yes, with the flag); whether an empty template is allowed; and whether renaming or reordering a template should reach open jobs.

## 47. Custom field definitions: order, options and scope

**Spec says:** `sortOrder` is an integer on each definition; `key` is `^[a-z][a-z0-9_]{0,62}$` and, with `entity` and `type`, immutable (422); `options` are `{ value, label }`; `assetTypeId` is "only for entity=asset"; `DELETE` keeps the values in JSONB but hides them. `GET /custom-fields?entity=asset` without `assetTypeId` returns every type's fields.

**Mock does:** a key is unique per entity and asset type (409 on create, 400 on `key` on update); a field without an asset type applies to all types; a field with one wins over a same-key field for all types.

**Frontend does:** puts a field up or down by renumbering the list in tens and saving the fields whose number changed (one request each, in turn); a new field goes after the last. Keys are suggested from the label and checked against the pattern; a new option gets a stored value made from its label (never one that exists in that field), a renamed option keeps its value. A deleted option is not removed from stored values (the forms already show "no longer offered").

**We propose:** a bulk `PUT /custom-fields/order` (list of ids) so a move is one request and cannot stop half way; say whether the same key may exist for two asset types and for "all types" at once (the screen allows it, the forms show one per key); and what a removed option does to stored values (kept and shown as "no longer offered", as the forms assume, or cleared).

## 48. Message templates: defaults, language and preview

**Spec says:** `GET /message-templates` returns `MessageTemplate`s with `isDefault` ("Platform default, not yet customised by tenant"); `POST` answers 409; `PUT /{id}` updates; `DELETE` "falls back to platform default"; `POST /message-templates/preview` renders a `body` (optionally against a `jobId`) and returns `rendered`, `length`, `smsSegments` (GSM-7 160/153, UCS-2 70/67) and `unknownPlaceholders`. The placeholders are listed in the description of `body`: `{klijent} {datum} {vrijeme_od} {vrijeme_do} {firma} {monter} {broj_naloga} {link}`. `subject` is "Email only".

**Mock does:** the list holds the tenant's own templates and, for each key and channel where it has none in its locale, a platform default (a fixed `id`, `isDefault: true`). `PUT` and `DELETE` on a default's id are 404; writing over a default is a `POST` (409 when the tenant already has one for that key, channel and locale). An e-mail needs a subject (400 on `subject`), an SMS keeps none. Preview uses sample data (the job is only checked to exist) and treats a character outside GSM-7 as UCS-2 for the whole text.

**Frontend does:** lists whatever the API returns, grouped by the four keys of the enum, so it never decides which channels exist for a key; editing a default sends `POST`, editing the tenant's own sends `PUT`, "Vrati zadano" sends `DELETE`. The editor offers the eight placeholders as buttons and shows a preview (400 ms after typing stops) with the length, the SMS count, a note when č, ć, š, ž or đ make the text UCS-2 (it works that out itself from the rendered text) and the unknown placeholders. A `409` on writing closes the panel and refetches.

**We propose:** say whether the platform defaults come back in the list at all (the screen assumes they do, one per key and channel) and whether editing one is `POST` or `PUT` on the default's id; which channels exist for which key (a template for a channel the platform never sends is useless); a list of placeholders from the API (or at least per key, e.g. `{link}` only where there is one) so the buttons need not be hard-coded; whether a template in another language than the tenant's is meant to be editable here (the screen edits the language the template has); and whether the preview should be able to use a real job (we have no picker yet).

## 49. Team: members, invitations and technician data

**Spec says:** `GET /users` lists memberships; `PUT /users/{userId}` ("Owner only") changes `role` and `isActive`, 409 "Would leave tenant without an owner"; `POST /users/invitations` is "Invitation emailed" (201) or 409, and `Invitation.inviteUrl` is "only when the server has no SMTP configured". `POST /technicians` says "The user must already be a member of the tenant with role `technician` (or be invited first)"; `GET /technicians` has `includeInactive`.

**Mock does:** the invitation always carries an `inviteUrl` (as a server without SMTP would); a person who is a member or has an open invitation is a 409; the last active owner cannot be demoted or deactivated (409); `POST /technicians` for anyone who is not an active member with the role `technician` is a 400 on `userId`, and a second one for the same user too.

**Frontend does:** lists members with role, status, last sign-in and, for technicians, hours, days, depot and skills; a member with the role `technician` and no technician record gets a button to give them one (changing a member's role to technician is a separate step first). Your own role and status are not editable in the screen (the API would allow it). When the invitation has an `inviteUrl` the screen shows it with a copy button so it can be passed on by hand. Inactive technicians are fetched too (`includeInactive`), so their data can be changed.

**We propose:** create the technician record when a member is given the role `technician` (or accept `POST /users/invitations` with the working data), so it is one step; say what "invited first" means for `POST /technicians` (a technician record for a person who has not accepted yet, so the board can plan for them); say whether the invitation e-mail carries a link to a page of the app (`/invite?token=` is what the mock uses; the accept page is not in the contract, only `POST /auth/accept-invitation` if that is what it is) and who sets the new person's name and password; and whether deactivating a member should also set their technician inactive (the screen leaves the two independent).

## 50. The SignalR hub

**Spec says:** hub `/hubs/dispatch`, "Auth via `?access_token=`. Server adds connection to groups `tenant:{id}` and, for technicians, `tech:{technicianId}`." Events `JobUpdated {jobId, scheduledDate}`, `JobStatusChanged {jobId, from, to, technicianId, changedAt}`, `RoutePlanPublished {routePlanId, date}`; "Clients invalidate TanStack Query caches on receipt; payloads are intentionally thin."

**Mock does:** serves the hub at the API's origin (`/hubs/dispatch`, outside `/api/v1`), with `POST …/negotiate` and a WebSocket speaking the SignalR JSON protocol. It sends events by comparing the tenant's jobs and route plans before and after every write: a job that is new, changed (status, date, start, lock, version, technicians) or deleted is `JobUpdated`; a changed status is also `JobStatusChanged` (with the lead technician); a plan that became published is `RoutePlanPublished`. The office hears everything in its tenant; a technician hears about jobs they are on, and every published plan. The author's own connection gets the events too.

**Frontend does:** connects when the signed-in area opens (one connection per company; switching company reconnects), with the access token as `access_token` and a growing pause (0, 2, 5, 10, then 30 s) for as long as it is down. Every event marks all job data stale (jobs, clients, the board, technicians' days, reports), because the event carries only the job's new date, not where it was; what is on screen refetches, events within 200 ms refresh once, and a connection back after a break refreshes too. A technician gets a notice when a change was not their own; everyone gets one after live updates have been down for 10 seconds. No polling.

**We propose:** say where the hub is (the host; the contract gives only the path; `VITE_HUB_URL` overrides it) and that WebSockets and `negotiate` get through CloudFront or whatever sits before the API, with CORS for `negotiate`; say what happens to a live connection when its access token expires (the client sends a new token only when it connects again); add the old date to `JobUpdated` (`previousScheduledDate`) so a board can refresh only the days involved; add an event for a finished PDF (`ReportPdfReady`, see #40) and say whether `JobUpdated` is sent when the report, checklist, materials or photos of a job change; say who is in `tech:{id}` for a job with several technicians, and whether a technician is told about jobs that only left them (the mock does); and say whether other changes need events too (clients, locations, equipment, settings: today another user's edit of a client shows only when the page is refetched).

## 51. The client's page and messages to clients

**Spec says:** `GET /public/jobs/{token}` (404 unknown, 410 "Token expired or already used"), `POST …/confirm` ("Confirmed (idempotent)", 409 "Job no longer confirmable"), `POST …/reschedule-request` (`note` up to 500 characters, up to 3 `preferredDates`; 202 "Dispatcher notified"; 410). `GET /messages` (filters `jobId`, `status`, paging), `POST /jobs/{id}/notify` (202 with the queued messages; 422 "No contact with phone/email or SMS disabled"). `MessageTemplate.body` may use `{link}`.

**Mock does:** a job gets a link secret when the first message about it goes out, valid for `publicLinkValidityHours`; the link in a message is `<frontend origin>/p/<token>`. A confirmed job is `confirmed` (history: actor `client`); a request for another time sets `rescheduleNote` (the note, then "Željeni datumi: …") and `rescheduleRequested`, and can be made once (a second one is a 410, since the contract lists no other answer). A message goes `queued → sent → delivered` over about four seconds; `notify` without `contactId` goes to every contact who can be reached (for SMS: has a phone and `receivesSms`), with `contactId` to that contact whatever they want, and counts toward the month's usage.

**Frontend does:** the page at `/p/{token}` (outside the signed-in area, Croatian only, dates in `hr-HR`/Zagreb because `PublicJob` carries no locale or time zone) shows the company with its logo and accent colour, the job, the street, the date and the arrival window; "Potvrđujem termin" only when `canConfirm`, "Tražim drugi termin" only when `canRequestReschedule`; 404 and 410 are told apart. The office sees a job's messages on its page, can send from a template or free text to everyone or one contact (with a preview from `POST /message-templates/preview` with the `jobId`), and has a list of all messages with a status filter. A list with messages still on their way is read again every 3 seconds (no event for it).

**We propose:** say what URL `{link}` points to (the app's `/p/{token}` is our assumption, so the backend needs the frontend's address as a setting) and whether the token is made per job, per message or per contact, how it relates to `publicLinkValidityHours`, and what "already used" in the 410 means when confirming is idempotent. Give the office the job's link (a `publicUrl` on `Job`) so it can be copied without sending a message. Add locale, time zone and the technician's first name to `PublicJob`. Say where the office sees the up to three `preferredDates` (the job has only `rescheduleNote`; the mock appends them to it) and what the 202 reschedule request does for the dispatcher (a notification? a history entry?). Add an event or a webhook for a message changing state (and a `message` filter by contact). Say which contact a message goes to when `contactId` is omitted and which one the 422 means. Rate limiting, `Cache-Control: no-store` and bot protection on the public endpoints. A way to answer the client's message is not in the contract.
