import js from '@eslint/js'
import pluginQuery from '@tanstack/eslint-plugin-query'
import pluginRouter from '@tanstack/eslint-plugin-router'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// ---------------------------------------------------------------------------
// Feature-Sliced Design boundaries
//   app → pages → widgets → features → entities → shared   (import downward only)
//   Sliced layers (pages, widgets, features, entities) are entered only through
//   their public API (index.ts). app and shared have no slices: free inside.
//   Features are grouped: features/<group>/<slice> (e.g. features/auth/sign-in);
//   slices of the same group are still separate slices.
// ---------------------------------------------------------------------------
const publicApi = (...types) => ({
  element: { type: types, fileInternalPath: 'index.{ts,tsx}' },
})
const shared = { element: { type: 'shared' } }

const fsdBoundaries = {
  name: 'fsd/boundaries',
  files: ['src/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
    'import/resolver': {
      typescript: { alwaysTryTypes: true, project: './tsconfig.app.json' },
    },
    'boundaries/root-path': import.meta.dirname,
    'boundaries/include': ['src/**/*'],
    'boundaries/legacy-templates': false,
    'boundaries/elements': [
      { type: 'app', pattern: 'src/app', partialMatch: false },
      { type: 'page', pattern: 'src/pages/*', partialMatch: false, capture: ['slice'] },
      { type: 'widget', pattern: 'src/widgets/*', partialMatch: false, capture: ['slice'] },
      {
        type: 'feature',
        pattern: 'src/features/*/*',
        partialMatch: false,
        capture: ['group', 'slice'],
      },
      { type: 'entity', pattern: 'src/entities/*', partialMatch: false, capture: ['slice'] },
      { type: 'shared', pattern: 'src/shared', partialMatch: false },
    ],
  },
  rules: {
    // Every file under src/ must belong to a layer
    'boundaries/no-unknown-files': 'error',
    'boundaries/dependencies': [
      'error',
      {
        default: 'disallow',
        // Imports inside the same element (same slice, within app, within shared) are always allowed.
        policies: [
          {
            from: { element: { type: 'app' } },
            allow: { to: [publicApi('page', 'widget', 'feature', 'entity'), shared] },
          },
          {
            from: { element: { type: 'page' } },
            allow: { to: [publicApi('widget', 'feature', 'entity'), shared] },
          },
          {
            from: { element: { type: 'widget' } },
            allow: { to: [publicApi('feature', 'entity'), shared] },
          },
          {
            from: { element: { type: 'feature' } },
            allow: { to: [publicApi('entity'), shared] },
          },
          {
            from: { element: { type: 'entity' } },
            allow: { to: [shared] },
          },
          // shared has no policy: it may only import within itself
        ],
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Where the backend is called
//   entities/<area>/api.ts   query keys and request functions (apiFetch + path)
//   features                 useQuery / useMutation with those functions, inline
//   app                      route guards (fetchMe, fetchTenant) and the QueryClient
//   pages, widgets, shared   never: they compose and render
// Generated code is used for its types only (@/shared/api/generated/model).
// ---------------------------------------------------------------------------
const generatedRequests = {
  group: ['@/shared/api/generated/*', '!@/shared/api/generated/model'],
  message:
    'Requests are written in entities/<area>/api.ts with apiFetch; import only types from @/shared/api/generated/model.',
}
const apiFetchOutsideEntities = {
  name: '@/shared/api/api-fetch',
  message: 'Requests are written in entities/<area>/api.ts; use those functions.',
}
const queryHooks = {
  name: '@tanstack/react-query',
  importNames: [
    'useQuery',
    'useSuspenseQuery',
    'useQueries',
    'useSuspenseQueries',
    'useInfiniteQuery',
    'useSuspenseInfiniteQuery',
    'usePrefetchQuery',
    'useMutation',
    'useQueryClient',
    'queryOptions',
    'mutationOptions',
  ],
  message:
    'Data is read and written in features (useQuery / useMutation with entity request functions). Pages, widgets and shared only compose and render.',
}

const backendCalls = [
  {
    name: 'backend/entities',
    files: ['src/entities/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [generatedRequests] }] },
  },
  {
    name: 'backend/features-and-app',
    files: ['src/features/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [apiFetchOutsideEntities], patterns: [generatedRequests] },
      ],
    },
  },
  {
    name: 'backend/compose-only',
    files: ['src/pages/**/*.{ts,tsx}', 'src/widgets/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}'],
    ignores: ['src/shared/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [apiFetchOutsideEntities, queryHooks], patterns: [generatedRequests] },
      ],
    },
  },
]

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    '.tanstack',
    '.vitest',
    'public/mockServiceWorker.js',
    'src/app/routeTree.gen.ts',
    'src/shared/api/generated',
  ]),
  {
    name: 'app/typescript',
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite(),
      pluginQuery.configs['flat/recommended'],
      pluginRouter.configs['flat/recommended'],
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TanStack Router's redirect() / notFound() are meant to be thrown
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            {
              from: 'package',
              package: '@tanstack/router-core',
              name: ['Redirect', 'NotFoundError'],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'app/routes',
    files: ['src/app/routes/**/*.tsx'],
    rules: {
      // Route files export `Route`; the component is passed to createFileRoute
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          extraHOCs: ['createFileRoute', 'createRootRouteWithContext'],
        },
      ],
    },
  },
  {
    name: 'shared/ui',
    files: ['src/shared/ui/**/*.tsx'],
    rules: {
      // shadcn components export variants (e.g. buttonVariants) next to components
      'react-refresh/only-export-components': 'off',
    },
  },
  fsdBoundaries,
  ...backendCalls,
  {
    name: 'config/javascript',
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  eslintConfigPrettier,
])
