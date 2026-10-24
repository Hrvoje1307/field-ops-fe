# app

App wiring: entry point (`main.tsx`), router (`router.ts`, file-based routes in `routes/`), providers (`providers/`: TanStack Query, i18n, MSW start-up) and global styles.

No business logic here. Route files only connect a URL to a page from `@/pages/*`. Route guards may load session data through the cache (`fetchMe(queryClient)`).

Imports: may use every layer below, slices only through their `index.ts`.
