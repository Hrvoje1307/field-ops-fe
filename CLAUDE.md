# FieldOps web

React frontend for FieldOps, a multi-tenant SaaS for any company that does work on site: alarm and video surveillance installers, HVAC, plumbers, electricians, boiler and elevator service, cleaning, pest control and so on (work orders, technician scheduling, routes, signed work reports).

The first pilot tenant is an alarm installer. It is an example, not the product. Every screen must work unchanged for a plumbing or HVAC company.

Backend is a separate .NET API built by another developer. This repo only talks to it through the OpenAPI contract.

## Source of truth

- `openapi/openapi.json` is the API contract. Read the relevant paths and schemas before building a screen.
- `schemas/schema.md` describes the database; use it for meaning of fields, not for API shapes.
- Never invent endpoints or fields. If the UI needs something the contract lacks, stop and tell me so I can raise it with the backend.

## Stack

Vite + React + TypeScript (strict), Feature-Sliced Design (see Architecture), TanStack Router (file-based routes in `src/app/routes`), TanStack Query, Orval-generated client, Tailwind CSS, shadcn/ui-style components on Radix, react-hook-form + zod, react-i18next (Croatian first), MSW for a mock API, Vitest + Testing Library, Playwright.

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
  pages/      one slice per screen: jobs-list, job-detail, clients-list, client-detail, day-overview, field-day, field-job, login
  widgets/    composed blocks used by pages: app-shell (office rail, field header), technician-day-column, job-queue, job-history
  features/   user actions: auth/sign-in, auth/sign-out, job/quick-create, job/assign, job/change-status, client/create
  entities/   business objects: job, client, location, technician, job-type, session (UI bits like StatusBadge, model helpers, query option factories)
  shared/     api (fetcher, generated client, mocks), ui (shadcn components), lib (datetime, phone, cn), i18n, config (env)
```

Rules:

- Layers import only from layers below: app → pages → widgets → features → entities → shared. Never upward, never sideways between slices of the same layer (a feature must not import another feature; compose them in a widget or page).
- Every slice exposes a public API through its `index.ts`. Import slices only via that index (`@/entities/job`), never deep paths (`@/entities/job/ui/status-badge`). `shared` segments may be imported directly (`@/shared/ui/button`).
- Segments inside a slice: `ui/`, `model/` (hooks, state, query options, helpers), `api/` (thin wrappers around generated hooks if needed), `lib/`, `config/`. Only create the segments you need.
- Route files in `src/app/routes` stay thin: search-param schema, guards (`beforeLoad`), loader, and render the page component from `@/pages/...`. No UI logic in route files.
- Generated API types live in `shared/api/generated`; entities may re-export the types they own (e.g. `Job`, `JobStatus` from `@/entities/job`).
- Enforce boundaries with ESLint (`eslint-plugin-boundaries` or Steiger, the FSD linter); a boundary violation fails lint.

## Rules

- API calls only through the generated client in `src/shared/api/generated` (never edit it; after changing the spec run `npm run api:generate` and commit the result, CI fails on drift via `npm run api:check`) and the single fetch mutator `src/shared/api/fetcher.ts`.
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
