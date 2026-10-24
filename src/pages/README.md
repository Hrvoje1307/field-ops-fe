# pages

One slice per screen (e.g. `pages/home`, later `pages/job-detail`). A page composes widgets, features and entities and owns its layout.

Each slice exposes its page component through `index.ts`; routes in `src/app/routes` import only that.

Imports: widgets, features, entities, shared. Never another page.
