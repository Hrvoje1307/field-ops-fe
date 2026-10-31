# FieldOps — database schema

Postgres 15+ on Supabase. 38 tables in schema `fieldops`, plus 14 for Sales (see [Sales](#sales), migration `sales_schema.sql`, API 0.3.1). Generated from `schema.sql` (the source of truth — EF migrations should reproduce it).

## Rules that apply everywhere

- **IDs** are UUID v7 (time-sortable). The app generates them with `Guid.CreateVersion7()`.
- **`tenant_id` is on every tenant-owned table**, child tables included. The EF global filter uses it, and every query is scoped by it.
- **Standard columns.** Most tables have `created_at`, `updated_at` and `deleted_at`. These are not repeated in the tables below; the ✦ mark means the table has them.
- **Soft delete.** `deleted_at` is set and the row stays. Unique rules only apply to rows that aren't deleted.
- **Time.** Moments in time are `timestamptz`, stored in UTC. Clock times like working hours and client windows are `time` in the tenant's timezone.
- **Enums** are plain text with a check. The allowed values are listed in the notes.
- **Money** is `numeric(12,2)`. Never float.
- **Concurrency.** Rows use Postgres `xmin` as the version, which is exposed as `version` in the API.
- **✎ marks** an existing table or column changed by the Sales migration.
- **Hangfire** creates its own tables in schema `hangfire`.

## Relationships at a glance

```
tenant ─┬─ memberships ── user
        ├─ depots ── technicians ── technician_skills ── skills
        ├─ job_types ── job_type_skills ── skills
        └─ clients ─┬─ client_contacts
                    └─ locations ── assets
                          │
service_plans ──────────► jobs ◄── (client, location, asset?, job_type)
                          ├─ job_assignments ── technicians
                          ├─ job_status_history
                          ├─ job_checklist_items
                          ├─ job_materials ── catalog_items
                          ├─ job_reports ── attachments (signature, pdf)
                          ├─ messages / public_job_links
                          └─ route_stops ── routes ── route_plans
```

## Job status flow

```
new ──► scheduled ──► confirmed ──► en_route ──► on_site ──► completed ──► invoiced
 ▲         │  └────────────────────────▲  │          │           │
 │         ▼                              ▼          ▼           └─► new (reopen)
 └──── on_hold ◄──────────────────────────────────────┘
any open status ──► cancelled (reason required) ──► new
```
`scheduled → en_route` is allowed without client confirmation, because SMS is only added in V2.

## Tenancy & auth

Who the customer firms are, who can log in, and how sessions work.

### `tenants` ✦

One row per company using the platform. `settings` holds per-tenant toggles (signature required, SMS time, etc.).

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| name | text |  |
| slug | text |  |
| oib | char(11)? |  |
| address | text? |  |
| phone | text? |  |
| email | citext? |  |
| iban | text? |  |
| logo_attachment_id | uuid? | → `attachments`; FK added after attachments |
| locale | text | default `hr-HR` |
| timezone | text | default `Europe/Zagreb` |
| currency | char(3) | default `EUR` |
| plan | text | trial \| basic \| pro; default `trial` |
| status | text | active \| suspended \| cancelled; default `active` |
| settings | jsonb | default `{}`; see TenantSettings in openapi.yaml |

Unique: (slug  _(only not deleted)_)

### `users` ✦

Global login accounts. A user can belong to several tenants.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| email | citext |  |
| phone | text? |  |
| full_name | text |  |
| password_hash | text? | null when external_id is used |
| external_id | text? | if we ever move to an external IdP |
| email_confirmed_at | timestamptz? |  |
| security_stamp | uuid | default `gen_random_uuid()`; rotate to kill all sessions |
| is_superadmin | boolean | default `false` |
| last_login_at | timestamptz? |  |

Unique: (email  _(only not deleted)_) · (external_id  _(only external_id set)_)

### `tenant_memberships` ✎

User ↔ tenant link. **The role lives here**, not on the user.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| user_id | uuid | → `users` |
| role | text | owner \| dispatcher \| technician |
| is_active | boolean | default `true` |
| can_access_sales | boolean | ✎ default `false`; owners always have access regardless (`Member.canAccessSales`) |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

Unique: (tenant_id, user_id)

### `refresh_tokens`

Rotating refresh tokens. Reusing an old one revokes the whole family (theft detection).

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| user_id | uuid | → `users` |
| tenant_id | uuid | → `tenants` |
| family_id | uuid |  |
| token_hash | bytea | SHA-256 of the opaque token |
| expires_at | timestamptz |  |
| revoked_at | timestamptz? |  |
| replaced_by_id | uuid? | → `refresh_tokens` |
| created_at | timestamptz | default `now()` |
| created_ip | inet? |  |
| user_agent | text? |  |

Unique: (token_hash)

### `user_invitations` ✎

Pending email invites to join a tenant.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| email | citext |  |
| role | text | owner \| dispatcher \| technician |
| can_access_sales | boolean | ✎ default `false`; applied to the new membership when the invite is accepted (expected; not stated in the SQL) |
| token_hash | bytea |  |
| invited_by | uuid | → `users` |
| expires_at | timestamptz |  |
| accepted_at | timestamptz? |  |
| revoked_at | timestamptz? |  |
| created_at | timestamptz | default `now()` |

Unique: (token_hash) · (tenant_id, email  _(only accepted_at not set, revoked_at not set)_)

### `password_reset_tokens`

One-time password reset tokens (only the hash is stored).

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| user_id | uuid | → `users` |
| token_hash | bytea |  |
| expires_at | timestamptz |  |
| used_at | timestamptz? |  |
| created_at | timestamptz | default `now()` |

Unique: (token_hash)

## Organisation

The firm's own setup: where technicians start from and what they can do.

### `depots` ✦

Workshop / base. Technicians start and end their route here.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| name | text |  |
| address | text |  |
| lat | double? |  |
| lng | double? |  |
| opens_at | time | default `07:00:00` |
| closes_at | time | default `16:00:00` |

### `skills` ✦

Tenant-defined skills (e.g. "video surveillance").

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| name | text |  |

Unique: (tenant_id, lower(name)  _(only not deleted)_)

### `technicians` ✦

Field worker profile for a user: hours, working days, home depot, map colour.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| user_id | uuid | → `users` |
| depot_id | uuid? | → `depots` |
| color | char(7) | default `#3b82f6` |
| work_start | time | default `07:00:00` |
| work_end | time | default `15:00:00` |
| working_days | smallint[] | default `{1,2,3,4,5}`; ISO weekday, 1 = Monday |
| is_active | boolean | default `true` |

Unique: (tenant_id, user_id  _(only not deleted)_)

### `technician_skills`

Which technician has which skill.

| column | type | notes |
|---|---|---|
| tenant_id | uuid | → `tenants` |
| technician_id | uuid | **PK**; → `technicians` |
| skill_id | uuid | **PK**; → `skills` |

Primary key: (technician_id, skill_id)

## Configuration

Everything that makes the platform generic instead of alarm-specific.

### `asset_types` ✦

Kinds of equipment the tenant services (alarm panel, camera, AC unit…).

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| name | text |  |
| icon | text? |  |

Unique: (tenant_id, lower(name)  _(only not deleted)_)

### `custom_field_definitions` ✦

Extra fields per entity. Values are stored in each entity's `custom_fields` JSONB.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| entity | text | client \| location \| asset \| job |
| asset_type_id | uuid? | → `asset_types`; only for entity = 'asset'; null = all asset types |
| key | text |  |
| label | text |  |
| type | text | text \| textarea \| number \| date \| select \| multiselect \| checkbox |
| options | jsonb? | [{ "value": "...", "label": "..." }] for select types |
| required | boolean | default `false` |
| is_sensitive | boolean | default `false`; value encrypted by the app, shown only to assigned techs |
| sort_order | integer | default `0` |

Unique: (tenant_id, entity, asset_type_id, key  _(only not deleted)_)

### `checklist_templates` ✦

Reusable checklists, copied into a job when it's created.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| name | text |  |
| items | jsonb | default `[]`; [{ "label": "...", "required": true }] |

### `job_types` ✦

Install / service / repair… with default duration, crew size and checklist.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| name | text |  |
| color | char(7) | default `#64748b` |
| default_duration_min | integer | default `60` |
| required_people | smallint | default `1` |
| checklist_template_id | uuid? | → `checklist_templates` |
| sms_enabled | boolean | default `true` |
| is_active | boolean | default `true` |

Unique: (tenant_id, lower(name)  _(only not deleted)_)

### `job_type_skills`

Skills a job type requires (used by the route optimizer).

| column | type | notes |
|---|---|---|
| tenant_id | uuid | → `tenants` |
| job_type_id | uuid | **PK**; → `job_types` |
| skill_id | uuid | **PK**; → `skills` |

Primary key: (job_type_id, skill_id)

### `catalog_items` ✦

Parts & materials price list.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| sku | text |  |
| name | text |  |
| unit | text | default `kom` |
| price | numeric(12,2) | default `0` |
| is_active | boolean | default `true` |

Unique: (tenant_id, sku  _(only not deleted)_)

### `message_templates`

SMS / email text per tenant with `{placeholders}`.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| key | text | reminder_day_before \| on_the_way \| report_ready \| reschedule_ack |
| channel | text | sms \| email |
| locale | text | default `hr-HR` |
| subject | text? | email only |
| body | text | placeholders: {klijent} {datum} {vrijeme_od} {firma} {link} ... |
| is_active | boolean | default `true` |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

Unique: (tenant_id, key, channel, locale)

### `number_sequences`

Per-tenant, per-year counters for job numbers (RN-2026-0001).

| column | type | notes |
|---|---|---|
| tenant_id | uuid | **PK**; → `tenants` |
| doc_type | text | **PK** |
| year | smallint | **PK** |
| prefix | text | default `RN` |
| last_value | integer | default `0` |

Primary key: (tenant_id, doc_type, year)

## Clients & equipment

Who the firm works for, where, and what's installed there.

### `clients` ✦

Person or company.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| type | text | person \| company |
| name | text |  |
| oib | char(11)? |  |
| email | citext? |  |
| notes | text? |  |
| custom_fields | jsonb | default `{}` |

### `client_contacts` ✦

Phone/email contacts of a client. Phone lookup for incoming calls hits this table.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| client_id | uuid | → `clients` |
| name | text |  |
| phone | text? | E.164 |
| email | citext? |  |
| is_primary | boolean | default `false` |
| receives_sms | boolean | default `true` |

Unique: (client_id  _(only is_primary, not deleted)_)

### `locations` ✦

Addresses of a client, with coordinates and access notes. Gate/alarm codes go in the encrypted column.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| client_id | uuid | → `clients` |
| label | text? | "Kuća", "Ured Savska" |
| street | text |  |
| city | text |  |
| postal_code | text? |  |
| country | char(2) | default `HR` |
| lat | double? |  |
| lng | double? |  |
| geocode_status | text | pending \| ok \| failed \| manual; default `pending` |
| access_notes | text? | non-secret: parking, dog, which door |
| access_codes_enc | bytea? | secret: alarm/gate codes, AES-GCM by the app; assigned techs only |
| custom_fields | jsonb | default `{}` |

### `assets` ✦

A piece of equipment installed at a location.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| location_id | uuid | → `locations` |
| asset_type_id | uuid | → `asset_types` |
| manufacturer | text? |  |
| model | text? |  |
| serial_no | text? |  |
| installed_at | date? |  |
| warranty_until | date? |  |
| notes | text? |  |
| custom_fields | jsonb | default `{}` |

## Jobs

The core: a unit of work from phone call to signed report.

### `service_plans` ✦

Recurring service (every N months). A daily background job creates jobs from it.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| client_id | uuid | → `clients` |
| location_id | uuid | → `locations` |
| asset_id | uuid? | → `assets` |
| job_type_id | uuid | → `job_types` |
| interval_months | smallint |  |
| next_due_date | date |  |
| lead_days | smallint | default `14` |
| notes | text? |  |
| is_active | boolean | default `true` |

### `jobs` ✦

A work order. See the status flow below.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| number | text | RN-2026-0001 |
| client_id | uuid | → `clients` |
| location_id | uuid | → `locations` |
| asset_id | uuid? | → `assets` |
| job_type_id | uuid | → `job_types` |
| service_plan_id | uuid? | → `service_plans` |
| status | text | new \| scheduled \| confirmed \| en_route \| on_site \| on_hold \| completed \| invoiced \| cancelled; default `new` |
| priority | text | low \| normal \| high \| urgent; default `normal` |
| source | text | phone \| email \| portal \| service_plan; default `phone` |
| title | text |  |
| description | text? |  |
| internal_note | text? | office-only, never shown to client |
| duration_min | integer |  |
| required_people | smallint | default `1` |
| preferred_date | date? | what the client asked for |
| window_start | time? | client availability, tenant-local wall clock |
| window_end | time? |  |
| scheduled_date | date? |  |
| scheduled_start | timestamptz? | set by route plan / manual ordering |
| locked | boolean | default `false`; optimizer must not move it |
| on_hold_reason | text? |  |
| cancel_reason | text? |  |
| reschedule_requested_at | timestamptz? |  |
| reschedule_note | text? |  |
| completed_at | timestamptz? |  |
| created_by | uuid? | → `users` |
| custom_fields | jsonb | default `{}` |

Unique: (tenant_id, number) · (service_plan_id  _(only one open job per service plan: status not in completed, invoiced, cancelled; not deleted)_)

### `job_assignments`

Which technician(s) are on a job; one can be lead.

| column | type | notes |
|---|---|---|
| tenant_id | uuid | → `tenants` |
| job_id | uuid | **PK**; → `jobs` |
| technician_id | uuid | **PK**; → `technicians` |
| is_lead | boolean | default `false` |
| assigned_at | timestamptz | default `now()` |
| assigned_by | uuid? | → `users` |

Primary key: (job_id, technician_id)

Unique: (job_id  _(only is_lead)_)

### `job_status_history`

Every status change, who did it and where (lat/lng).

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| job_id | uuid | → `jobs` |
| from_status | text? |  |
| to_status | text |  |
| changed_by | uuid? | → `users`; null = system / client via public link |
| changed_at | timestamptz | default `now()` |
| lat | double? |  |
| lng | double? |  |
| note | text? |  |

### `job_checklist_items`

The job's own copy of its checklist, ticked off on site.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| job_id | uuid | → `jobs` |
| position | smallint |  |
| label | text |  |
| is_required | boolean | default `false` |
| is_done | boolean | default `false` |
| done_by | uuid? | → `users` |
| done_at | timestamptz? |  |

Unique: (job_id, position) · (job_id, "position")

### `job_materials`

Parts used. Name and price are copied from the catalog so later price changes don't rewrite history.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| job_id | uuid | → `jobs` |
| catalog_item_id | uuid? | → `catalog_items` |
| name | text | copied from catalog at time of use |
| quantity | numeric(12,3) |  |
| unit | text |  |
| unit_price | numeric(12,2) | default `0` |
| created_by | uuid? | → `users` |
| created_at | timestamptz | default `now()` |

### `job_reports`

Field report: work done, times, signature, generated PDF. One per job.

| column | type | notes |
|---|---|---|
| job_id | uuid | **PK**; → `jobs` |
| tenant_id | uuid | → `tenants` |
| work_done | text? |  |
| started_at | timestamptz? |  |
| finished_at | timestamptz? |  |
| labour_minutes | integer? |  |
| signed_by_name | text? |  |
| signature_attachment_id | uuid? | → `attachments` |
| pdf_attachment_id | uuid? | → `attachments` |
| completed_at | timestamptz? |  |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

## Files

### `attachments` ✎

Photos, signatures, PDFs, logos. The file itself lives in S3; this is the metadata. `owner_type` + `owner_id` say what it belongs to.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| owner_type | text | tenant \| client \| location \| asset \| job \| deal ✎ |
| owner_id | uuid | polymorphic, no FK |
| kind | text | photo \| signature \| pdf \| doc \| logo |
| storage_key | text | {tenantId}/{ownerType}/{ownerId}/{fileId} |
| file_name | text? |  |
| mime | text |  |
| size_bytes | bigint |  |
| status | text | pending \| uploaded; default `pending` |
| taken_at | timestamptz? |  |
| uploaded_by | uuid? | → `users` |
| created_at | timestamptz | default `now()` |
| deleted_at | timestamptz? |  |

Unique: (storage_key)

## Routing

Output of the route optimizer.

### `route_plans`

One optimisation run for a day. Draft until published; only one published plan per day.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| date | date |  |
| status | text | draft \| published \| discarded; default `draft` |
| solver | text | ors \| vroom \| manual; default `ors` |
| solver_input | jsonb? |  |
| solver_output | jsonb? |  |
| unassigned | jsonb | default `[]`; [{ "jobId": "...", "reason": "skills|time_window|capacity" }] |
| total_distance_m | integer? |  |
| total_duration_s | integer? |  |
| created_by | uuid? | → `users` |
| published_at | timestamptz? |  |
| published_by | uuid? | → `users` |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

Unique: (tenant_id, date  _(only status = 'published')_)

### `routes`

One technician's route inside a plan.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| route_plan_id | uuid | → `route_plans` |
| technician_id | uuid | → `technicians` |
| depot_id | uuid? | → `depots` |
| start_time | timestamptz? |  |
| end_time | timestamptz? |  |
| distance_m | integer? |  |
| duration_s | integer? |  |
| polyline | text? | encoded polyline for the map |

Unique: (route_plan_id, technician_id)

### `route_stops`

Ordered stops with ETA/ETD.

| column | type | notes |
|---|---|---|
| tenant_id | uuid | → `tenants` |
| route_id | uuid | **PK**; → `routes` |
| job_id | uuid | → `jobs` |
| sequence | smallint | **PK** |
| eta | timestamptz? |  |
| etd | timestamptz? |  |
| travel_from_prev_s | integer? |  |

Primary key: (route_id, sequence)

Unique: (route_id, job_id)

## Messaging

### `messages`

Every SMS/email sent, with delivery status and cost.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| job_id | uuid? | → `jobs` |
| client_contact_id | uuid? | → `client_contacts` |
| channel | text | sms \| email |
| template_key | text? |  |
| to_address | text | E.164 or email |
| subject | text? |  |
| body | text |  |
| provider | text | infobip \| ses \| fake |
| provider_message_id | text? |  |
| status | text | queued \| sent \| delivered \| failed \| undeliverable; default `queued` |
| error | text? |  |
| segments | smallint? |  |
| cost | numeric(10,4)? |  |
| currency | char(3)? |  |
| sent_at | timestamptz? |  |
| delivered_at | timestamptz? |  |
| created_at | timestamptz | default `now()` |

Unique: (provider, provider_message_id  _(only provider_message_id set)_)

### `public_job_links`

One-time tokens behind the "confirm your appointment" SMS link.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| job_id | uuid | → `jobs` |
| token_hash | bytea | SHA-256 of a 256-bit random token; token only ever in the SMS |
| expires_at | timestamptz |  |
| used_at | timestamptz? |  |
| action | text? | confirmed \| reschedule_requested |
| reschedule_note | text? |  |
| created_at | timestamptz | default `now()` |

Unique: (token_hash)

## System

### `audit_log`

Who changed what, with a JSON diff. Also logs reads of sensitive fields.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid? | → `tenants`; null for superadmin/system actions |
| user_id | uuid? | → `users` |
| entity | text |  |
| entity_id | uuid |  |
| action | text | insert \| update \| delete \| read_sensitive |
| diff | jsonb? |  |
| at | timestamptz | default `now()` |

### `usage_counters` ✎

Monthly SMS / optimisation / AI usage per tenant (for billing).

| column | type | notes |
|---|---|---|
| tenant_id | uuid | **PK**; → `tenants` |
| month | date | **PK**; first day of month |
| sms_count | integer | default `0` |
| sms_cost | numeric(12,4) | default `0` |
| email_count | integer | default `0` |
| optimizations_count | integer | default `0` |
| ai_classifications | integer | ✎ default `0`; threads classified (`Usage.aiClassifications`) |
| ai_drafts | integer | ✎ default `0` |
| ai_input_tokens | bigint | ✎ default `0` |
| ai_output_tokens | bigint | ✎ default `0` |

Primary key: (tenant_id, month)

### `idempotency_keys`

Stores responses to field actions so a double-tap or retry on weak signal doesn't do things twice.

| column | type | notes |
|---|---|---|
| tenant_id | uuid | **PK**; → `tenants` |
| user_id | uuid | **PK**; → `users` |
| key | text | **PK** |
| request_hash | bytea | method + path + body hash; mismatch → 422 |
| response_status | smallint? |  |
| response_body | jsonb? |  |
| created_at | timestamptz | default `now()` |

Primary key: (tenant_id, user_id, key)

## Sales

Module "Prodaja" (plan feature `sales`; AI parts need `sales_ai`). Source: `schemas/sales_schema.sql`, applied on top of the base schema. This section explains what the fields mean; API shapes are in `openapi/openapi.json`. Same conventions as above: every table has `tenant_id`, children reference `(tenant_id, id)` so a row can never point at another tenant's data, owners/users that must belong to the tenant reference `tenant_memberships (tenant_id, user_id)`, version is `xmin`. Emails and patterns are stored lower-case.

```
tenant ─┬─ mailboxes ──┬─ mail_thread_mailboxes ─┐
        │              └─ mail_message_mailboxes ┤
        ├─ mail_threads ── mail_messages ────────┘
        │        ├─ mail_drafts ◄── follow_up_rules
        │        └─ ai_feedback
        ├─ sales_stages ── deals ── deal_activities
        │                    └─ (job, client, attachments owner_type = deal)
        ├─ mail_exclusion_rules
        └─ sales_settings (one row)
```

**Visibility.** A conversation in several connected mailboxes (e.g. `info@` and a personal inbox in CC) is **one** thread and one message per tenant; the per-mailbox provider ids live in `mail_thread_mailboxes` / `mail_message_mailboxes`. A message is visible when at least one of its mailboxes is visible to the user, a thread likewise. Personal mailboxes are visible only to their owner and tenant owners, so a reply sent only from a personal inbox stays private even when the rest of the conversation is in a shared one. `mail_threads.mailbox_id` is the mailbox the thread is shown under (shared preferred).

### `mailboxes` ✦

A connected mailbox (OAuth for Gmail / Microsoft, or IMAP+SMTP).

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| provider | text | gmail \| microsoft \| imap |
| email_address | text | lower-case; unique per tenant among non-deleted |
| display_name | text |  |
| kind | text | shared \| personal |
| owner_user_id | uuid? | → `tenant_memberships`; required when `kind` = personal |
| status | text | connecting \| active \| needs_reauth \| error \| disabled; default `connecting` |
| credentials_enc | bytea | AES-GCM, key outside the database; never in the API |
| imap_host, smtp_host | text? | required for provider imap |
| imap_port, smtp_port | integer? | 1–65535; required for provider imap |
| imap_security, smtp_security | text? | ssl \| starttls |
| can_send | boolean | default `false`; `false` → 409 `mailbox.cannot_send` |
| sync_from | date | how far back the first sync reads |
| sync_cursor | jsonb? | historyId / deltaLink / per-folder uidvalidity+uid |
| push_subscription | jsonb? | Gmail watch / Graph subscription with expiry |
| last_synced_at | timestamptz? |  |
| last_error | text? |  |
| created_by | uuid? | → `users` |

### `mailbox_oauth_states`

Short-lived state for the OAuth round trip (start → callback). Backend only.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id, user_id | uuid | → `tenant_memberships` |
| state_hash | bytea | unique |
| provider | text | gmail \| microsoft |
| code_verifier_enc | bytea | PKCE verifier |
| request | jsonb | kind, ownerUserId, syncFrom, mailboxId (reconnect) |
| expires_at, used_at | timestamptz | used_at null until the callback |
| created_at | timestamptz |  |

### `sales_stages` ✦

Funnel stages, per tenant and editable.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| name | text | unique per tenant (case-insensitive) among non-deleted |
| color | char(7) | `#rrggbb`; default `#64748b` |
| position | smallint | board order |
| kind | text | open \| won \| lost |
| follow_up_days | smallint? | default follow-up distance for deals entering the stage |
| stale_after_days | smallint? | days in stage before a deal counts as stale |
| is_active | boolean | default `true` |

A tenant with stages always has **exactly one active won and one active lost** stage (deferred constraint trigger); violating it is 409 `sales.stage_required`.

### `deals` ✦

An opportunity.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| title | text |  |
| stage_id | uuid | → `sales_stages` |
| client_id | uuid? | → `clients`; set by linking or conversion |
| contact_name, contact_email, contact_phone | text? | email lower-case, phone E.164 |
| value | numeric(12,2)? | money, decimal string in the API |
| currency | char(3) | default `EUR` |
| expected_close_date | date? |  |
| owner_user_id | uuid? | → `tenant_memberships` |
| source | text | email \| phone \| manual \| web; default `email` |
| notes | text? |  |
| lost_reason | text? | price \| timing \| competitor \| no_response \| not_qualified \| other; required when `lost_at` is set |
| lost_note | text? |  |
| won_at, lost_at | timestamptz? |  |
| stage_entered_at | timestamptz | drives "days in stage" |
| last_contact_at | timestamptz? |  |
| next_follow_up_at | timestamptz? | drives follow-up due and the Today list |
| job_id | uuid? | → `jobs`; set on conversion, unique (a job belongs to at most one deal) |
| extracted | jsonb | what the AI extracted from the conversation |
| created_by | uuid? | → `users` |

### `deal_activities`

Timeline of a deal.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id, deal_id | uuid | → `deals` |
| type | text | created \| stage_changed \| field_changed \| note \| email_in \| email_out \| draft_created \| draft_sent \| follow_up_snoozed \| follow_up_done \| thread_linked \| thread_unlinked \| converted |
| actor_kind | text | user \| ai \| system |
| actor_user_id | uuid? | → `users`; required when `actor_kind` = user |
| text | text? |  |
| data | jsonb | type-specific details |
| at | timestamptz | default `now()` |

### `mail_threads` ✦

One conversation per tenant, across mailboxes. Holds the AI result.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| mailbox_id | uuid | → `mailboxes`; the mailbox it is shown under |
| subject, snippet | text |  |
| participants | jsonb | list of addresses |
| message_count | integer |  |
| has_attachments | boolean |  |
| last_message_at | timestamptz |  |
| last_inbound_at, last_outbound_at | timestamptz? |  |
| awaiting_reply | boolean | waiting for the client's answer (we wrote last; exact rule is the backend's) |
| ai_status | text | pending \| done \| failed \| skipped; default `pending` |
| category | text? | new_inquiry \| quote_request \| follow_up \| negotiation \| objection \| accepted \| declined \| support \| admin \| spam \| other |
| category_source | text? | ai \| user (a user's correction wins) |
| category_confidence | numeric(3,2)? | 0–1; below `sales_settings.review_threshold` the thread goes to "Za pregled" |
| is_sales | boolean? | null = not decided yet |
| summary, next_action | text? | AI suggestions; never acted on automatically |
| suggested_stage_id | uuid? | → `sales_stages`; a suggestion only |
| extracted | jsonb | contact, value, dates found in the text |
| ai_model, ai_processed_at, ai_input_hash | text?, timestamptz?, bytea? | hash skips reprocessing unchanged input |
| deal_id | uuid? | → `deals` |
| client_id | uuid? | → `clients` |
| excluded | boolean | sender matched an exclusion rule |

### `mail_thread_mailboxes`

Which mailboxes have the thread, and under which provider id.

| column | type | notes |
|---|---|---|
| thread_id, mailbox_id | uuid | **PK**; → `mail_threads`, `mailboxes` |
| tenant_id | uuid | → `tenants` |
| provider_thread_id | text | Gmail threadId / Graph conversationId / IMAP root Message-ID; unique per mailbox |

### `mail_messages`

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id, thread_id | uuid | → `mail_threads` |
| internet_message_id | text? | Message-ID header; the dedupe key across mailboxes |
| in_reply_to | text? |  |
| direction | text | inbound \| outbound |
| from_email, from_name | text, text? | email lower-case |
| to_addresses, cc_addresses | jsonb | lists of `{email, name}` |
| subject | text? |  |
| sent_at | timestamptz |  |
| snippet | text |  |
| body_text | text? | null when not stored (non-sales threads, retention) |
| attachments | jsonb | metadata only until saved to a deal |

### `mail_message_mailboxes`

| column | type | notes |
|---|---|---|
| message_id, mailbox_id | uuid | **PK**; → `mail_messages`, `mailboxes` |
| tenant_id | uuid | → `tenants` |
| provider_message_id | text | Gmail id / Graph id / `{folder}:{uidvalidity}:{uid}`; unique per mailbox |

### `mail_exclusion_rules`

Senders whose mail is never treated as sales.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| pattern | text | lower-case address or `@domain`; unique per tenant |
| note | text? |  |
| created_by | uuid? | → `users` |
| created_at | timestamptz |  |

### `follow_up_rules` ✦

When a quiet deal gets a follow-up reminder (and optionally a draft).

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id | uuid | → `tenants` |
| name | text |  |
| stage_id | uuid? | → `sales_stages`; null = any open stage |
| days_without_reply | smallint | 1–90, **working days** |
| create_draft | boolean | default `true` |
| is_active | boolean | default `true` |

### `mail_drafts` ✦

A reply or follow-up prepared by the AI or written by a user. Never sent without a user action.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id, thread_id | uuid | → `mail_threads` |
| deal_id | uuid? | → `deals` |
| mailbox_id | uuid | sends from here; must be a mailbox that has the thread |
| kind | text | reply \| follow_up |
| status | text | generating \| ready \| edited \| saved_to_mailbox \| sent \| discarded \| failed |
| subject, body_text | text |  |
| to_addresses, cc_addresses | jsonb | lists of addresses |
| instructions | text? | what the user asked the AI for |
| error | text? | when `failed` |
| ai_model | text? |  |
| follow_up_rule_id | uuid? | → `follow_up_rules`; one open draft per thread and rule |
| provider_draft_id | text? | set by "save to mailbox" |
| sent_message_id | uuid? | → `mail_messages` |
| sent_at | timestamptz? | required when `status` = sent |
| created_by | uuid? | → `users` |

### `sales_settings`

One row per tenant (created with the tenant, or by the migration for existing ones).

| column | type | notes |
|---|---|---|
| tenant_id | uuid | **PK**; → `tenants` |
| ai_enabled | boolean | default `true`; off → 409 `sales.ai_disabled` on AI actions |
| signature | text? | appended to drafts |
| tone | text | formal \| neutral \| friendly; default `neutral` |
| reply_language | text | default `auto` |
| knowledge | text? | company facts the AI may use in drafts |
| response_sla_hours | smallint | 1–168; default `4`; target time to answer an inbound sales mail (what it drives is not stated in the SQL) |
| digest_enabled | boolean | default `true` |
| digest_time | time | tenant-local; default `07:45` |
| digest_recipient_ids | uuid[] | user ids; the app checks membership |
| store_non_sales_bodies | boolean | default `false` |
| retention_days | integer? | ≥ 30; null = keep |
| review_threshold | numeric(3,2) | 0–1; default `0.70` |
| updated_at | timestamptz |  |

### `ai_feedback`

A user's correction of the AI, kept as an example for later classification.

| column | type | notes |
|---|---|---|
| id | uuid | **PK** |
| tenant_id, thread_id | uuid | → `mail_threads` |
| field | text | category \| is_sales \| stage |
| ai_value | text? | what the AI said |
| user_value | text | what the user chose |
| example_text | text | text the correction is based on |
| user_id | uuid | → `users` |
| created_at | timestamptz |  |

### Seed for existing tenants

The migration gives every existing tenant six stages (Novi upit, Kontaktiran, Ponuda poslana, Pregovori, Dobiven = won, Izgubljen = lost; "Ponuda poslana" has `follow_up_days` 3), a follow-up rule "Ponuda poslana, 3 dana bez odgovora" and a `sales_settings` row. New tenants get the same from the app.

---
