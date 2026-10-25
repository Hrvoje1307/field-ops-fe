# entities

One folder per API area (e.g. `auth` for `/auth/*` and `/me`, `job` for `/jobs/*`). Each has:

- `const.ts`: cache times (`staleTime`) and other constants for the area.
- `api.ts`: query keys (starting with the area's name, e.g. `['jobs', 'detail', id]`), request functions (written with `apiFetch` and `path` from `@/shared/api/api-fetch`) and one hook per request that holds the key, `queryFn`, cache time, idempotency key and cache refresh: `useGetJob(id)`, `useListClients(params)`, `useCreateJob()`, `useTransitionJob()`… Writes put the saved record in the cache and invalidate what shows it; a 409 refetches and tells the user. Cache helpers (`invalidateJobData`, `fetchMe(queryClient)` for route guards) live here too.
- `ui/`, `model/`, `lib/` as needed: presentational pieces (badges, chips, renderers) and helpers. Entity UI doesn't fetch; features call the hooks.

Imports: shared only. Never another entity.
