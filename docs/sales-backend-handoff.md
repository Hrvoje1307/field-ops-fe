# Sales module: what the frontend needs from the backend

For the backend developer. The v2 frontend of "Prodaja" (OpenAPI 0.3.1, tag `Sales`, `/sales/*`) is finished and runs on a mock that follows the contract. When the backend implements the tag, switching `VITE_API_MOCK=false` should be enough. This page lists what is still open: the questions from `docs/backend-questions.md` #52–#64, ordered by how much they matter. Each has the exact part of the spec, what the frontend does meanwhile, and the change we propose.

Nothing here asks for a different design. Where the spec is silent the frontend took the safest reading and says so.

## How to check the frontend against a backend

- `VITE_API_MOCK=false`, `VITE_API_URL=<api>/api/v1`, `VITE_HUB_URL` for the hub; the app is the same code as with the mock.
- The whole module is hidden unless `GET /me` returns `features` with `sales` **and** `canAccessSales: true`. A backend that has no sales yet gets no `/sales` request at all.
- The mock lives only in `src/shared/api/mocks`; `npm run check:prod-bundle` proves a build with `VITE_API_MOCK=false` contains none of it.

## A. Blocks the frontend

These stop a part of the module from working (or from being safe) on a real backend.

### A1. `Me.canAccessSales` must be required (#52)

**Spec:** `Me.canAccessSales`: "True when the plan has the `sales` feature and the user is an owner or has the membership permission. Drives the Prodaja menu." It is not in `Me.required`. Also not required: `Invitation.canAccessSales`.
**Frontend:** a missing value means "no access" (the menu, the routes and every sales query depend on it), so a backend that forgets the field hides the module from everyone, silently.
**Change:** add `canAccessSales` to `Me.required` (and to `Invitation.required`). Say whether a technician may be given the flag (the contract allows it for any non-owner; the frontend hides the switch for technicians and never shows them the module) and whether an invitation's flag is applied to the membership when it is accepted.

### A2. A draft without the AI (#62)

**Spec:** `POST /sales/threads/{id}/drafts`: "Ask the AI for a reply or follow-up draft." (202, 409 `sales.ai_disabled` / `mailbox.cannot_send`, 429). `DraftCreateRequest` has `kind`, `instructions`, `mailboxId`; no subject, body or recipients. `PUT /sales/drafts/{id}` needs an existing draft.
**Frontend:** without `sales_ai` (or with `SalesSettings.aiEnabled = false`) there is no draft button; the conversation tells the person to answer from their own mail. A plan without `sales_ai` cannot answer a customer from the app at all.
**Change:** let a draft be created by hand: either optional `subject`, `bodyText`, `to`, `cc` on `DraftCreateRequest` (then no AI is called, the answer is 201 with status `ready`), or a separate `POST /sales/threads/{id}/drafts/manual`. Editing, saving to the mailbox and sending already work for it.

### A3. Reconnecting an IMAP mailbox (#60)

**Spec:** `MailboxOAuthStartRequest.mailboxId`: "Set to re-authorise an existing mailbox (status needs_reauth)" (Gmail, Microsoft only). `ImapMailboxCreate` has no `mailboxId`; `Mailbox` carries no hosts, ports, security or username; `MailboxUpdate` has no password. Creating an existing address is 409 `sales.mailbox_exists`.
**Frontend:** a Gmail or Microsoft mailbox in `needs_reauth` is reconnected through `oauth/start` with its id. An IMAP mailbox in `error` gets the connection form with only what the API tells; the person types the hosts and the password again, and the answer is 409, which the screen explains as "disconnect it (without deleting the mail) and connect it again".
**Change:** accept `mailboxId` on `ImapMailboxCreate` (or `PUT /sales/mailboxes/{id}/imap`) to replace the password and the hosts of an existing mailbox, and return hosts, ports, security and username (never the password) in `Mailbox` so the form can start from them. Say whether `connecting` can end in `error` and who sets it.

### A4. The 409 codes (#53, #62)

**Spec:** the Sales tag names 14 codes. Several operations say only "409" with no code: a stale `version` on deals and drafts; `POST /sales/drafts/{id}/send`: "Already sent, stale version, or mailbox cannot send"; the 403 of an "Owner only" operation has no code. The tag says `sales.deal_already_converted` and `sales.mailbox_needs_reauth`, the operations say `deal.already_converted` and `mailbox.needs_reauth`.
**Frontend:** text is chosen only by `ProblemDetails.code` through one map; both spellings are mapped; an unknown code gets a generic line. Without a code the screen cannot tell "already sent" from "someone edited it" from "this mailbox cannot send", and says "the data changed" for all three.
**Change:** name the codes. We use these in the mock and map them already: `deal.version_conflict`, `draft.version_conflict`, `draft.already_sent`, `draft.not_ready` (editing or sending a draft that is still `generating`), `mailbox.cannot_send` for send, and `auth.forbidden` for owner-only. Settle which spelling of `sales.deal_already_converted` / `deal.already_converted` and `sales.mailbox_needs_reauth` / `mailbox.needs_reauth` is real.

### A5. The OAuth return and `Retry-After` (#58)

**Spec:** `GET /sales/mailboxes/oauth/callback` answers 302 "to {APP_URL}/sales/settings/mailboxes?connected={mailboxId} or ?error={code} (access_denied, wrong_account, already_connected (same as sales.mailbox_exists), provider_error)". 429 `sales.ai_quota_exceeded` carries `Retry-After`.
**Frontend:** serves `/sales/settings/mailboxes`, reads `connected` and `error` from the query and clears them. The `Retry-After` header is read to say "try again in …".
**Change:** say what `{APP_URL}` is in each environment (the frontend's origin; Vercel preview URLs differ), and add `Retry-After` to `Access-Control-Expose-Headers`, or the browser hides it (same as #16).

## B. Desirable

The frontend works without these; each one removes a workaround or a wrong message.

### B1. Settings have no version (#63)

**Spec:** `SalesSettings` has no `version`; `PUT /sales/settings` is "Owner only" and replaces the whole record (400, no 409).
**Frontend:** two screens (AI and knowledge, daily digest) write the one record, so each save reads it first and sends the whole record with only its own fields changed. Two owners saving at the same time still overwrite each other and nothing can tell them.
**Change:** a `version` (or `updatedAt` with `If-Match`) so a stale save is a 409 like everywhere else, or `PATCH` with only the changed fields.

### B2. Deleting by settings, the report, rules, exclusions (#63)

**Spec:** `retentionDays`: "Delete bodies of threads with no activity for this long; null = keep"; `storeNonSalesBodies`: "When false, only metadata is kept for threads classified as non-sales"; `GET /sales/reports/summary` takes `from`, `to`, `ownerUserId`; `ExclusionRuleInput.pattern` has a regex; `FollowUpRuleInput.stageId` "Null = all open stages".
**Frontend:** before a save that turns `storeNonSalesBodies` off or sets or shortens `retentionDays` a dialog says stored mail content is deleted. The report is shown to everyone with sales access; only owners get a person picker and send `ownerUserId`. Dates are tenant-local `yyyy-MM-dd`, `to` inclusive.
**Change:** say when the deletion happens (at once, at night); who may read the report and what a dispatcher gets (all deals or only their own), and 403 or ignore for `ownerUserId` from a non-owner; whether `to` is inclusive and in which zone the dates are read; how a duplicate exclusion is answered (400 on `pattern`?), whether `pattern` is compared case-insensitively, and whether the exclusions made from a conversation (B5) are listed.

### B3. Mailboxes: disconnecting, syncing (#54)

**Spec:** `DELETE /sales/mailboxes/{id}`: "Disconnect: revoke the grant and stop syncing. Deals stay." `purge`: "Also delete imported threads, messages and drafts". `POST …/sync` is 409 for some state.
**Frontend:** the dialog offers the purge and says in those words what it deletes; after a disconnect without `purge` it only says the mail is not deleted.
**Change:** say what happens to the conversations after a disconnect without `purge` (still shown? under which mailbox?), whether a conversation also held by another mailbox survives a purge, and when sync answers 409 besides `needs_reauth` (paused, error).

### B4. Today (#55, #62)

**Spec:** `SalesTodayItem.thread` is required; `staleDeals` is a separate list, and `stale` is also a reason of an item; `ownerUserId`: owners may pass any user.
**Frontend:** shows the items in the API's order with a text per reason; works out nothing; owners get a person picker.
**Change:** say what Today shows for a deal with a follow-up due and no conversation (it has no `thread`), and when `stale` is an item and when only a `staleDeals` entry; whether `ownerUserId` may also be used by dispatchers, and add the deal's owner to `SalesToday` so a row can say whose it is.

### B5. Deals and stages (#56, #59)

**Spec:** `DealCreate.source` is optional (the table defaults to `email`); `stageId` "defaults to the first open stage"; `DELETE /sales/deals/{id}` and `POST …/link` list a 409 without a reason; "a tenant always has exactly one active won and one active lost stage"; `DealConvertRequest.locationId`: "Existing location of clientId; with newClient, firstLocation is used"; `DealSummary` has no time of entering the stage and `SalesStage` has no deal count.
**Frontend:** an existing client with a new location saves the location first and then converts (two requests; a failed conversion leaves the location behind); the board does not show "days in stage"; a deactivated stage is explained as "gone from the board" without a count.
**Change:** accept `newLocation` (a `LocationInput`) in `DealConvertRequest` next to `clientId`; add `stageEnteredAt` to `DealSummary` and `dealCount` to `SalesStage`; say what the two 409s mean; how to replace the won or lost stage (creating the new one is refused, retiring the old one first is `sales.stage_required`); where deals in a deactivated stage appear; what happens to the rules of a deleted stage; whether the backend sets `nextFollowUpAt` when a deal enters a stage with `followUpDays`; the default `source`. Add email to `GET /clients` `q` (the spec lists "name, phone, OIB, address"), or an `email` parameter to `lookup`: the conversion form offers existing clients by the contact's email.

### B6. Conversations, classification, exclusion, attachments (#57, #61)

**Spec:** `needsReview`: "AI confidence below the review threshold and no user correction yet"; "Non-sales threads are returned only with isSales=false"; `ClassificationUpdate` takes `category` and `isSales`; `ThreadExcludeRequest.pattern`: "Email address or "@domain". Defaults to the thread's external sender."; `purge` default true; `POST …/attachments`: "Download a mail attachment and save it to the linked deal (S3)"; `Attachment.kind` is `photo | signature | pdf | doc | logo`.
**Frontend:** each inbox card is only API parameters; a correction sends both fields; an excluded conversation goes where the API puts it; a mail attachment can be saved only after it is linked.
**Change:** say whether a non-sales conversation can be in "Za pregled"; whether `category` and `isSales` may disagree or the server derives one; add `excluded` to `MailThreadSummary` and the deal's stage (`stage {id, name}`) to `MailThreadSummaryDeal`; say whether the classification is returned without `sales_ai`; a way to open a mail attachment before saving it; whether `kind` and the upload MIME list can hold what clients send (spreadsheets, Word files); a `followUpRuleId` on `Draft` so Today can say why a draft exists; whether the three sales events, which carry only ids, may reach people who cannot see a personal mailbox.

### B7. Live updates (#64)

**Spec:** the three events (`SalesThreadUpdated`, `DealUpdated`, `DraftReady`); nothing announces a mailbox's `status` or `lastSyncedAt`.
**Frontend:** refreshes by the ids in the events; polls only as a reserve (when the hub is down; a draft still `generating`, slowly and for two minutes at most).
**Change:** an event for a mailbox (`MailboxUpdated`), or confirm that the end of the first sync always sends `SalesThreadUpdated`; confirm that `DraftReady` is also sent when generation fails (`status: failed`).

## Index

| Question in `backend-questions.md` | Here       |
| ---------------------------------- | ---------- |
| #52 sales access                   | A1         |
| #53 error codes                    | A4         |
| #54 mailboxes                      | B3         |
| #55 Today                          | B4         |
| #56 deals and stages               | B5         |
| #57 conversations, drafts          | B6         |
| #58 OAuth return, CORS             | A5         |
| #59 funnel and conversion          | B5         |
| #60 IMAP reconnect                 | A3         |
| #61 exclusion, suggested stage     | B6         |
| #62 drafts without the AI, sending | A2, A4, B4 |
| #63 settings, rules, report        | B1, B2     |
| #64 live updates                   | B7         |
