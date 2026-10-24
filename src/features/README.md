# features

Components that call the backend, grouped by area (`features/auth/sign-in`, `features/job/details`): reading (a job's details, a list with its filters, a history) or changing data (sign in, change job status).

Queries and mutations are written inline with the entity's keys, request functions and cache times:

```ts
const { isPending, error, data } = useQuery({
  queryKey: jobKeys.detail(jobId),
  queryFn: async ({ signal }) => {
    return getJob(jobId, signal)
  },
  staleTime: JOB_DETAIL_STALE_TIME,
})
```

Data comes in by id; a feature reads what it shows, so features on one screen share the cache instead of passing data around.

Imports: entities, shared. Never another feature (compose them in a widget, e.g. through slots).
