# Mock API

A contract-faithful stand-in for the FieldOps API, served by MSW (`VITE_API_MOCK=true`). Shapes, statuses, error codes, roles and visibility follow `openapi/openapi.json`. The app must run against the real API with `VITE_API_MOCK=false` and no change of code, so **nothing in the app may know about this folder**: it is imported only by `src/app/providers/mocks.ts`, `src/app/mock-routes.ts`, the test setup and tests (`src/shared/api/mocks/tests/mock-isolation.test.ts` checks it).

```
db/        stored rows (what the API never returns lives here), storage, versioning
handlers/  one file per API tag (sales-*.ts for the Sales tag)
lib/       auth, errors (problems.ts), presenting rows as API shapes, the hub, sales/
seed/      two industries with their own configuration, a third tenant without Sales
tests/     every response is validated against the OpenAPI document
```

## Seeded accounts

Password `demo` for everyone. Dates are relative to today; the data is reseeded every day (`window.__fieldopsResetMock()` reseeds now).

| Tenant                   | Plan                | Owner                  | Dispatcher                                                                           |
| ------------------------ | ------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| Alarmko (alarm, Zagreb)  | `sales`, `sales_ai` | `vlasnik@alarmko.test` | `dispecer@alarmko.test` (has Prodaja)                                                |
| Bura klima (HVAC, Split) | `sales`, `sales_ai` | `vlasnik@bura.test`    | `dispecer@bura.test` (has Prodaja)                                                   |
| Čisto (cleaning, Rijeka) | no Sales            | `vlasnik@cisto.test`   | none of its own; `ana@demo.test` switches here: no Prodaja menu, `sales.not_enabled` |

`ana@demo.test` is a dispatcher in all three: in Alarmko she has the Sales permission, in Bura she does not (`sales.forbidden`). Technicians never have it.

## Things only the mock does (conventions, never visible to the app)

These exist because no server stands behind the mock. The UI treats the result like any other response from the contract and has no code for the trigger.

| Trigger                                                       | What the mock answers                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMAP host ending in `.invalid` (`POST /sales/mailboxes/imap`) | 422 `mailbox.imap_failed`, `detail` names the host                                                                                                                                                                                                          |
| SMTP host ending in `.invalid`                                | 422 `mailbox.smtp_failed`                                                                                                                                                                                                                                   |
| IMAP password `wrong`                                         | 422 `mailbox.imap_failed`, `detail` "Authentication failed."                                                                                                                                                                                                |
| OAuth `code` of the form `mock:<address>` on the callback     | the mailbox is connected as that address (the stand-in consent page sends it)                                                                                                                                                                               |
| OAuth `error=access_denied` on the callback                   | redirect with `?error=access_denied`; any other `error` is `provider_error`                                                                                                                                                                                 |
| `authorizeUrl` of `oauth/start`                               | `/mock-oauth/{provider}?state=…`: a stand-in consent page (`ui/mock-oauth-page.tsx`, added by `app/mock-routes.tsx` with the mock only). A navigation is not seen by the worker, so the page calls the callback with `fetch` and goes where it redirects to |
| A new mailbox (OAuth or IMAP)                                 | `connecting` for `MOCK_CONNECT_MS` (4 s), then `active` with a last sync; read-time, like the AI results                                                                                                                                                    |
| `window.__fieldopsExpireMailbox('info@firma.test')`           | the provider revokes the grant: the mailbox is `needs_reauth` (dev console and Playwright only)                                                                                                                                                             |
| AI answers take `MOCK_AI_LATENCY_MS` (2.5 s)                  | the thread is `pending` / the draft `generating` until then, then `SalesThreadUpdated` / `DraftReady`                                                                                                                                                       |
| `MOCK_AI_MONTHLY_LIMIT` classifications + drafts in a month   | 429 `sales.ai_quota_exceeded` with `Retry-After` in seconds (the real allowance is the backend's and the plan's; the frontend never computes a quota)                                                                                                       |

Both constants are in `lib/sales/const.ts`.

## Tests and the clock

- Vitest: `fixToday()` (`src/shared/lib/test/fixed-today.ts`) fixes "today" to a Wednesday (2026-10-28).
- Playwright: `resetMock(page)` (`e2e/support.ts`) starts the page's clock at the same moment and lets it run; every spec calls it first, so "tomorrow" is a working day whatever day the suite runs.
- `tests/contract.ts` checks every response of every test against the OpenAPI document, including error statuses, and (for `/sales/*`) that the error `code` is one the Sales tag names or a documented gap (`tests/sales-codes.ts`, `docs/backend-questions.md` #53).
