# Questions for the backend

Places where `openapi/openapi.json` is ambiguous, incomplete or contradicts `schemas/schema.md`, found while building the mock API (`src/shared/api/mocks`). Each item lists what the spec says, what the mock does today, and what we propose. The mock's behaviour is a placeholder until the backend answers; the frontend is built against the proposal.

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

**Spec says:** most operations declare only their success response, sometimes one error. Examples: `GET /locations/{id}` declares only 200, though the `NotFound` response says it is "also returned for other tenants' resources". Technicians' 403s are almost nowhere. The idempotency 422 ("a replay with a different body returns 422") is declared on 4 operations only.

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
