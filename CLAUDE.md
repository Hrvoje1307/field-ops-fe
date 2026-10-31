# FieldOps web

React frontend for FieldOps, a multi-tenant SaaS for any company that does work on site: alarm and video surveillance installers, HVAC, plumbers, electricians, boiler and elevator service, cleaning, pest control and so on (work orders, technician scheduling, routes, signed work reports).

The first pilot tenant is an alarm installer. It is an example, not the product. Every screen must work unchanged for a plumbing or HVAC company.

Backend is a separate .NET API built by another developer. This repo only talks to it through the OpenAPI contract.

## Source of truth

- `openapi/openapi.json` is the API contract. Read the relevant paths and schemas before building a screen.
- `schemas/schema.md` describes the database; use it for meaning of fields, not for API shapes.
- Never invent endpoints or fields. If the UI needs something the contract lacks, stop and tell me so I can raise it with the backend.

## Stack

Vite + React + TypeScript (strict), Feature-Sliced Design (see Architecture), TanStack Router (file-based routes in `src/app/routes`), TanStack Query, Orval-generated types, Tailwind CSS, shadcn/ui-style components on Radix, react-hook-form + zod, @dnd-kit (drag and drop, via `shared/ui/drag-board`), react-i18next (Croatian first), @microsoft/signalr (live updates, via `shared/api/realtime`), MSW for a mock API, Vitest + Testing Library, Playwright.

Hosting: Vercel (SPA rewrite to index.html). API on AWS, DB on Supabase; the frontend never talks to Supabase directly.

## Generic platform (most important rule)

The code is the same for every tenant. What differs between companies lives in tenant configuration and comes from the API:

| Varies per tenant                                                         | Comes from                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Job types (name, colour, duration, crew size, required skills, checklist) | `/job-types`                                                                      |
| Equipment types and their fields (alarm panel, AC unit, boiler…)          | `/asset-types`, `/custom-fields?entity=asset`                                     |
| Extra fields on clients, locations, assets, jobs                          | `/custom-fields` → render forms and detail views dynamically from the definitions |
| Technician skills                                                         | `/skills`                                                                         |
| Depots / workshops, working hours                                         | `/depots`, `/technicians`                                                         |
| Company name, logo, locale, timezone, currency, settings                  | `/tenant`, `/me`                                                                  |
| Message and PDF templates                                                 | `/message-templates`, tenant settings                                             |

Rules:

- No industry words in code, UI copy or i18n keys ("alarm", "centrala", "senzor", "kamera"…). Use neutral terms: job / nalog, equipment / oprema, technician / monter, client / klijent.
- No `if` on tenant id, slug, job type name or asset type name. If behaviour must differ, it is a tenant setting or a field on the configuration entity; if the API lacks it, tell me.
- Never hardcode lists the API owns (job types, asset types, skills, custom fields). Only the platform-wide enums from the contract (job status, priority, role) may have fixed labels in i18n.
- Custom fields: one generic renderer for inputs and one for read-only display, driven by `CustomFieldDefinition` (`text`, `textarea`, `number`, `date`, `select`, `multiselect`, `checkbox`, `isSensitive`, `required`, `sortOrder`). Sensitive values are masked and revealed on click.
- Timezone, locale and currency come from the tenant (`/tenant`), with `Europe/Zagreb`, `hr-HR`, `EUR` only as fallbacks. Phone display uses the tenant's country, falling back to E.164.
- i18n: Croatian first, but every string goes through i18n so an `en` locale can be added without code changes.
- Mock data must include at least two tenants from different industries (the alarm installer and e.g. an HVAC/plumbing company) with different job types, asset types and custom fields. Playwright tests run the main flows for both, which proves nothing is alarm-specific.

## Architecture: Feature-Sliced Design

```
src/
  app/        providers, router setup, global styles, route files (src/app/routes)
  pages/      one slice per screen, a group of widgets: jobs-list, job-detail, clients-list, client-detail, day-overview, route-plan, field-day, field-job, field-report, messages-list, public-appointment, settings-company, settings-job-types, settings-checklists, settings-custom-fields, settings-messages, settings-team, settings-skills, settings-depots, settings-equipment-types, login; Sales: sales-today, sales-board, sales-inbox, deal-detail, sales-report, settings-mailboxes, settings-sales-stages, settings-follow-up-rules, settings-sales-ai, settings-exclusions
  widgets/    groups of features: app-shell (office rail, field header), settings-shell, job-detail, client-detail, day-overview, field-job, field-report, technician-day-column, job-queue; Sales: sales-today, sales-board, deal-detail, mail-inbox, mail-thread (settings-shell gets a Prodaja section)
  features/   components that call the backend, grouped: auth/sign-in, auth/sign-out, job/list, job/details, job/history, job/change-status, job/quick-create, job/client-jobs, job/assign, job/field-status, job/report-form, job/report-view, schedule/day-board, schedule/route-plan, field/day, field/job, client/list, client/details, client/create, client/edit, location/edit, asset/edit, job/messages, messages/list, public/appointment, live/updates, settings/company, settings/usage, settings/job-types, settings/checklists, settings/custom-fields, settings/messages, settings/team, settings/skills, settings/depots, settings/equipment-types; Sales: sales/today, sales/board, sales/report, deal/details, deal/create, deal/edit, deal/move, deal/convert, deal/activities, deal/follow-up, deal/attachments, mail/inbox, mail/thread, mail/classify, mail/link, mail/exclude, mail/save-attachment, draft/editor, draft/send, mailbox/list, mailbox/connect, settings/sales-stages, settings/follow-up-rules, settings/exclusions, settings/sales-ai, settings/sales-digest
  entities/   one folder per API area: auth, tenant, job, dispatch (board and route plans), report (reports, materials, files), client, location, asset (equipment and its types), technician, member (team and invitations), message (messages to clients), public-job (the client's page), realtime (the SignalR connection: status, events, refreshing the cache), skill, depot, job-type, checklist-template, message-template, custom-field, Sales: mailbox, mail-thread (conversations, messages, classification), deal (deals, board, activities, today), sales-stage, draft, sales-config (settings, follow-up rules, exclusions), sales-report; `member` gains canAccessSales, `report` attachments owner `deal`, `realtime` the sales events (query keys, request functions, cache times; presentational UI like StatusBadge; model helpers)
  shared/     UI and helpers that never call the backend: api (fetcher, apiFetch, generated types, mocks), ui (shadcn components), lib (datetime, phone, cn), i18n, config (env)
```

Where the backend is called (enforced by ESLint):

- **entities/<area>/** (one folder per API area, e.g. `/auth/login` and `/auth/switch-tenant` both in `entities/auth`):
  - `const.ts`: cache times (`JOB_DETAIL_STALE_TIME`…) and other constants.
  - `api.ts`: query keys (`jobKeys.detail(id)` → `['jobs', 'detail', id]`; every key starts with the area's name), request functions written out with `apiFetch` and `path` (``apiFetch<Job>(path`/jobs/${id}`, { signal })``), and **one hook per request** that holds the key, `queryFn`, cache time, idempotency key and cache refresh: `useGetJob(id)`, `useListClients(params)`, `useListCustomFieldDefinitions(scope)`, `useCreateJob()`, `useTransitionJob()`… Writes refresh what they change (the saved record goes into the cache, job data is invalidated) and a 409 refetches and tells the user.
  - Route guards use plain functions (`fetchMe(queryClient)`).
- **features, widgets, pages** call those hooks, e.g. `const definitions = useListCustomFieldDefinitions(scope)`, and add only what is theirs: toasts, navigation, closing a panel, form errors. They never import `useQuery` / `useMutation` / `useQueryClient`, a `*Keys` object, a `*_STALE_TIME` or `apiFetch` (ESLint fails). Two features reading the same data share the cache because the hook is the same.
- **widgets** group features, **pages** group widgets (a page may use a single feature directly when there is nothing to compose). Data flows in by id (the feature reads it), not through props loaded above.
- **app** owns the `QueryClient` and the route guards. **shared** never calls the backend (`shared/api` provides the means).
- Session data (`useMe` in `entities/auth`, `useTenantSettings` in `entities/tenant`) is read anywhere in the signed-in area like any other hook; the route guard loads it first.

Rules:

- Layers import only from layers below: app → pages → widgets → features → entities → shared. Never upward, never sideways between slices of the same layer (a feature must not import another feature; compose them in a widget or page).
- Every slice exposes a public API through its `index.ts`. Import slices only via that index (`@/entities/job`), never deep paths (`@/entities/job/ui/status-badge`). `shared` segments may be imported directly (`@/shared/ui/button`).
- Inside an entity: `const.ts` and `api.ts` (see above), plus segments `ui/`, `model/` (state, helpers), `lib/`, `config/` as needed. Inside other slices: `ui/`, `model/`, `lib/`, `config/`. Only create the segments you need.
- Route files in `src/app/routes` stay thin: search-param schema, guards (`beforeLoad`), loader, and render the page component from `@/pages/...`. No UI logic in route files.
- Generated API types live in `shared/api/generated/model`; entities re-export the types they own (e.g. `Job`, `JobStatus` from `@/entities/job`). Nothing imports the generated request functions.
- Enforce boundaries with ESLint (`eslint-plugin-boundaries` or Steiger, the FSD linter); a boundary violation fails lint.

## Rules

- API calls only through the request functions in `entities/<area>/api.ts`, built on `apiFetch` (`src/shared/api/api-fetch.ts`) and the single fetcher `src/shared/api/fetcher.ts`. Paths and bodies follow `openapi/openapi.json`; types come from the generated model. Never edit the generated code; after changing the spec run `npm run api:generate` and commit the result (CI fails on drift via `npm run api:check`).
- The fetcher handles: base URL from `VITE_API_URL`, bearer token, refresh on 401 (refresh tokens rotate), `Idempotency-Key` on every non-GET request except the internal `/auth/refresh` call, throwing `ApiError` with RFC 9457 ProblemDetails (`errors` = field path → messages).
- Access token in memory only; refresh token in localStorage.
- Tenant comes from the JWT. Never put tenantId in URLs or bodies.
- Dates: instants are UTC ISO strings; `HH:mm` and `yyyy-MM-dd` are tenant-local. Always format in the tenant's timezone (from `/tenant`), never the browser's.
- Show addresses from `Location.address` / `JobSummary.location.address` (the API's "street, city"); don't format street and city in the UI.
- Authenticated documents such as `GET /jobs/{id}/report/print` (HTML) are fetched through the client with the bearer token and opened as a blob URL, never as a plain link (a link would go without the token).
- Phones are E.164; show them in the tenant country's national format (Croatian for HR tenants), E.164 otherwise.
- Money is a decimal string; never parse to float for arithmetic.
- Job status buttons are driven by `allowedTransitions` from the API, not by client-side rules. `completed` only via `/jobs/{id}/complete`.
- Updates send `version`; on 409 refetch and tell the user the data changed.
- Show 400 field errors next to the fields; other errors as a toast.
- Every list/detail has loading, empty and error states.
- All user-facing text goes through i18n (`src/shared/i18n/hr.ts`), in Croatian, sentence case, plain verbs ("Spremi nalog", not "Submit").
- Roles: owner and dispatcher use the office area (desktop-first); technician uses `/field` (phone-first, big touch targets, one primary action per screen). Technicians must not reach office routes.
- Sensitive values (access codes, custom fields with `isSensitive`) hidden by default, revealed on click.
- No PWA/offline yet (later phase), but keep idempotency keys and don't lose form input on a failed request.

## Modul Prodaja (v2)

Sales is an optional module (API tag `Sales`, `/sales/*`), still generic: nothing industry-specific, nothing tenant-specific in code. `/webhooks/*` are backend-only; the frontend never calls them.

- **Access** = `me.features` contains `sales` **and** `me.canAccessSales`. Both are read from `/me`; the menu item, the routes (guard) and every sales query depend on it. Owners always have access, a technician never reaches it (office area only). Without the feature the app behaves exactly as before.
- **AI parts** (category, summary, suggested next step, draft buttons) are shown only when `features` also contains `sales_ai`. Sync, the funnel, mailboxes and manual work do not depend on it. `SalesSettings.aiEnabled = false` turns AI off per tenant (409 `sales.ai_disabled` on AI actions).
- **Personal mailboxes are private**: only their owner and tenant owners see them and their conversations. The API filters; the UI never shows or caches another user's personal mailbox and shows only the messages the API returns.
- **AI only suggests.** It never sends mail and never changes a deal's stage. Sending is always a user action with a confirmation that lists the recipients; moving a deal is always a user action. Suggested stage / next action are suggestions to accept, not state.
- **Everything configurable comes from the API**: stages (name, colour, kind open/won/lost, follow-up days), follow-up rules, exclusions, tone, language, signature, knowledge, threshold, SLA, digest. No hardcoded stage names or colours; only the platform enums of the contract (thread category, mailbox status, draft status, lost reason, deal source, activity type) have fixed labels in i18n.
- **Error codes** (`ProblemDetails.code`, listed in the Sales tag description) go through one i18n map (`sales.not_enabled`, `sales.forbidden`, `sales.lost_reason_required`, `sales.stage_required`, `sales.stage_in_use`, `sales.mailbox_exists`, `sales.mailbox_needs_reauth`, `mailbox.cannot_send`, `mailbox.imap_failed`, `mailbox.smtp_failed`, `sales.ai_disabled`, `thread.not_linked`, `sales.deal_already_converted`, `sales.ai_quota_exceeded` with `Retry-After`); an unknown code falls back to a generic message. 409 on a stale `version` refetches and tells the user; 400 `lostReason` shows next to the field.
- **The backend is not ready yet** (spec 0.3.1 is ahead of the deployed API), so the sales module is built on MSW mocks. The mock must follow the contract exactly (shapes, status codes, error codes, 202 + `DraftReady` for drafts, visibility rules) and add no behaviour the spec lacks, so that `VITE_API_MOCK=false` works without a code change. Mock code is imported only inside `shared/api/mocks`. Anything missing or unclear in the spec goes to `docs/backend-questions.md`, not into the mock or the UI.
- Realtime: `SalesThreadUpdated`, `DealUpdated` and `DraftReady` (group `sales:{tenantId}`, sent only to users with sales access) mark sales data stale like the job events do.

## Mock API

While the backend isn't ready, `VITE_API_MOCK=true` starts MSW handlers in `src/shared/api/mocks` (one handler file per API tag: auth, jobs, clients...). Mocks must follow the contract exactly (shapes, status machine, roles, validation, 409 on stale version). Seed data: at least two fictional tenants from different industries (an alarm installer in Zagreb and an HVAC/plumbing company), each with its own job types, asset types, skills and custom fields; dates relative to today. When you add a screen, add the mock handlers it needs in the same change.

## Workflow

- Before a feature: read the relevant OpenAPI paths, propose the plan (which FSD layer and slice each piece goes into, routes, components, queries/mutations, and what comes from tenant configuration instead of code), wait for my OK.
- Small, reviewable steps. After each step run `npm run lint`, `npm run typecheck`, `npm test`.
- Add a Vitest test for logic (formatting, fetcher, state helpers) and a Playwright test for each main user flow.
- Commit with clear messages; don't commit `.env.local`.

## Commands

- `npm run dev` – dev server (mock API by default)
- `npm run api:generate` – regenerate client from `openapi/openapi.json`
- `npm run lint` / `npm run typecheck` / `npm test` / `npx playwright test`
