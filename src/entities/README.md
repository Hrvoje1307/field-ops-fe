# entities

One folder per API area (e.g. `auth` for `/auth/*` and `/me`, `job` for `/jobs/*`). Each has:

- `const.ts`: cache times (`staleTime`) and other constants for the area.
- `api.ts`: query keys (starting with the area's name, e.g. `['jobs', 'detail', id]`), GET request functions (used as `queryFn`), POST/PUT/DELETE request functions (used as `mutationFn`) and cache helpers (invalidation, `fetchX(queryClient)` for route guards). Requests are written with `apiFetch` and `path` from `@/shared/api/api-fetch`.
- `ui/`, `model/`, `lib/` as needed: presentational pieces (badges, chips, renderers) and helpers. Entity UI doesn't fetch; features do.

The only hooks that read data here are the session ones (`useMe`, `useTenantSettings`), which the signed-in area reads everywhere.

Imports: shared only. Never another entity.
