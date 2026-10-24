# shared

Reusable code with no business logic, split into segments:

- `api/`: fetcher (Orval mutator), `ApiError`, retry policy, generated client (`generated/`, gitignored), MSW mocks
- `ui/`: shadcn/ui components on Radix
- `lib/`: small helpers (`cn`, test setup)
- `config/`: typed environment variables
- `i18n/`: i18next setup and Croatian strings (`hr.ts`)

Imports: nothing outside `shared`.
