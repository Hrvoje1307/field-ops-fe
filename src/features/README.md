# features

Components that call the backend, grouped by area (`features/auth/sign-in`, `features/job/details`): reading (a job's details, a list with its filters, a history) or changing data (sign in, change job status).

They call the entity hooks and add only what is theirs: toasts, navigation, closing a panel, form errors.

```ts
const job = useGetJob(jobId)
const transition = useTransitionJob()
transition.mutate(
  { job, to: 'en_route' },
  { onSuccess: () => toast.success(t('job.changeStatus.done')) },
)
```

Keys, cache times, idempotency keys and cache refreshes live in the hooks (`entities/<area>/api.ts`), so two features reading the same data share the cache. Data comes in by id; a feature reads what it shows.

Imports: entities, shared. Never another feature (compose them in a widget, e.g. through slots). Never TanStack Query's hooks, query keys or cache times (ESLint).
