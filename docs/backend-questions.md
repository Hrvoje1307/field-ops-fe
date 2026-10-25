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
