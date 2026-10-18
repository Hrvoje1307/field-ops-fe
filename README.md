# field-ops-fe

React frontend for FieldOps. See `CLAUDE.md` for the rules and architecture.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173, mock API (MSW) on by default
```

Copy `.env.example` to `.env.local` to point at a real API (`VITE_API_MOCK=false`).

## Scripts

| script                 | what it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Vite dev server                                             |
| `npm run build`        | typecheck + production build to `dist/`                     |
| `npm run lint`         | ESLint (incl. FSD boundaries) + Prettier check              |
| `npm run typecheck`    | `tsc -b`                                                    |
| `npm test`             | Vitest unit/component tests                                 |
| `npm run test:e2e`     | Playwright (run `npx playwright install chromium` once)     |
| `npm run api:generate` | regenerate the client from `openapi/openapi.json` via Orval |

The generated client (`src/shared/api/generated`) is gitignored; `dev`, `build`, `lint`, `typecheck` and `test` regenerate it first.
