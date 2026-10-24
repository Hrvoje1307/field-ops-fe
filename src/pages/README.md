# pages

One slice per screen, a group of widgets with the page's layout. A page may use a single feature directly when there is nothing to compose. Pages don't call the backend; they get route params and search from the route file and pass them on.

Each slice exposes its page component through `index.ts`; routes in `src/app/routes` import only that.

Imports: widgets, features, entities, shared. Never another page.
