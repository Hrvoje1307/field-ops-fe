# shared

Reusable code with no business logic that never calls the backend itself, split into segments:

- `api/`: `apiFetch` and `path` (used by entities to write requests), the fetcher (token, refresh, `ApiError`), retry policy, idempotency keys, generated types (`generated/model`), MSW mocks
- `ui/`: shadcn/ui components on Radix (presentational only)
- `lib/`: small helpers (`cn`, formatting, test setup)
- `config/`: typed environment variables
- `i18n/`: i18next setup and Croatian strings (`hr.ts`)

Imports: nothing outside `shared`.
