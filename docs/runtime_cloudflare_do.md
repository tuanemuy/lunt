# Runtime: Cloudflare Workers + Durable Object + Queues

Lunt runs as one Worker and one SQLite-backed Durable Object. The object holds every aggregate, the outbox and the per-consumer receipts in its private SQLite database, so a unit of work that writes several aggregates of different domains commits in one real transaction, and reads that span domains run as one query (`.spec-implement/design.md` D-02).

## Quick start

```bash
pnpm install
pnpm dev          # vite dev: the Worker runs in workerd with the bindings of apps/web/wrangler.jsonc
pnpm dev:reset    # delete the local state under apps/web/.wrangler/state
```

There is no database setup: the object applies its schema from its constructor, so the first request creates everything. Local state persists across restarts under `apps/web/.wrangler/state`.

## Topology

| Piece | Where | Trigger |
| --- | --- | --- |
| Fetch (TanStack Start) | `apps/web/app/server.ts` `fetch` | HTTP |
| Events consumer | `server.ts` `queue` → `app/worker/queue.ts` | Queue `lunt-events` |
| Dead-letter queue | same handler, `batch.queue === "lunt-events-dlq"`: keeps each message in the state object | Queue `lunt-events-dlq` |
| Operations | `server.ts` `fetch` → `app/worker/ops.ts` (`/__ops/*`, bearer `OPS_TOKEN`) | HTTP |
| Daily jobs | `server.ts` `scheduled` → `runDailyJobs` | Cron `5 15 * * *` (00:05 JST) |
| State, relay, receipts | `app/durable-objects/luntState.ts` (`LuntStateObject`, one instance named `global`) | RPC / its alarm |

Everything is one Worker, so `pnpm dev` runs the consumer and the scheduled handler too. Trigger the daily jobs locally with:

```bash
curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=5+15+*+*+*"
```

## RPC protocol

The object's RPC surface (`packages/core/src/adapters/do/protocol/client.ts`, `LuntStateClient`):

- `query(name, args)` — a named read. `protocol/queries.ts` is the typed catalog (name → args, result); `store/queries.ts` holds the handler of every name, and `satisfies` makes a missing handler a type error.
- `commit({ conditions, writes, events })` — applies a unit of work. `protocol/commands.ts` is the typed union of write commands; `store/commands.ts` holds one handler per `kind`. `protocol/conditions.ts` is the typed union of commit conditions — facts an access decision rested on (a role still held, a steward still stewarding, a target still vacant), added through Authority's `AccessGuard` — and `store/conditions.ts` checks each. The object reads the conditions, runs every command and inserts the outbox rows inside one `transactionSync`.
- `isConsumed` / `markConsumed` — per-consumer receipts.
- `kickRelay` — re-arms the relay alarm after manual outbox edits.

Workers RPC turns thrown errors into plain `Error`s, so every outcome a port contract names travels as data: `commit` returns `rejected` with a `WriteFailure` (`conflict` for a version mismatch or a taken unique key, `notFound` for a `save` / `delete` of a missing aggregate) or `refused` naming a condition that no longer holds, and `DoUnitOfWorkProvider` rethrows them as `ConflictError` / `NotFoundError` / `ForbiddenError`. Conditions are read before the writes (so an operator may revoke their own role), but a failing write is reported ahead of a refusal: a concurrent change of the same aggregate is a conflict to resend. Anything else that throws becomes `SystemError(DATABASE_ERROR)` (`mapDoError`).

Request-side repositories run `query` for reads (immediately, inside the unit of work) and append write commands to the unit of work's buffer. Commands carry the aggregate snapshot; the object's handler derives index columns from it, so indexes cannot drift from their aggregate.

Durable Object SQLite limits to design around: at most 100 bound parameters per statement (pass id sets as one JSON parameter to `json_each(?)`), short `LIKE` patterns (match strings with the domain's own functions), and no `BEGIN` / `SAVEPOINT` (use `transactionSync`).

## Relay and consumers

Committing events arms the alarm. `alarm()` runs the shared `processOutboxEvents` over the object's outbox, then prunes processed rows and old receipts, then re-arms while rows remain (`adapters/do/alarm.ts`). The platform retries a throwing alarm, so no cron safety net is needed.

The relay never gives up on an event: a failed publish (the queue refused the batch, or the event could not be decoded) is retried with exponential backoff capped at one hour, for as long as it takes. From `OUTBOX_ALERT_AFTER_ATTEMPTS` failures on, each further failure is logged at error level. `kickRelay` requeues rows an earlier version parked (`failed_at`) and relays at once.

The dispatcher (`createFanOutDispatcher`) sends one queue message `{ consumer, event }` per subscribed consumer (`application/events/consumers.ts`). Each message is acked or retried on its own: one failing consumer never re-runs the others, and it alone reaches the dead-letter queue. The consumer checks its receipt first and records it only after it succeeded (`consumeEventMessage`); consumers are idempotent on their own, so a lost receipt costs a repeat, never a wrong result.

## Dead letters and re-drive

A message whose consumer keeps failing is retried by the events queue (`max_retries` 3) and then moves to `lunt-events-dlq`. The dead-letter consumer does not drop it: it stores the message in the state object's `dead_letters` table (one row per consumer and event; acked only once stored) and logs it at error level. Re-driving is an operator action (`spec/domains/index.md` 「トランザクションとドメインイベント」). Consumers are idempotent, so a re-drive continues where the consumer stopped.

Procedure, once the cause is fixed and deployed (`$APP_URL` and `$OPS_TOKEN` as configured; locally `http://localhost:3000` and the development token in `wrangler.jsonc`):

```bash
# 1. See what is waiting (oldest first; each row names the consumer, the event and how often it dead-lettered)
curl -H "Authorization: Bearer $OPS_TOKEN" "$APP_URL/__ops/dead-letters?limit=100"

# 2. Re-drive the oldest ones…
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" -d '{"limit":100}' "$APP_URL/__ops/dead-letters/redrive"
#    …or specific ones
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{"keys":[{"consumer":"purgeBookmarksOnWithdrawal","eventId":"…"}]}' \
  "$APP_URL/__ops/dead-letters/redrive"
```

The answer lists `redriven` and `failed` (a letter whose event can no longer be decoded, or a batch the queue refused, stays pending). A re-driven message that fails its retries again comes back to `dead_letters`, pending again, with `deadLetteredCount` counted up. `POST /__ops/relay/kick` re-arms the relay and requeues outbox rows an earlier version parked.

The endpoints exist only when `OPS_TOKEN` is set (at least 32 characters; the public development token is refused unless `DEV_TOOLS=1`).

## Daily jobs that stop early

The daily jobs share one progression rule (`drainPages`, `packages/core/src/application/workers/dailyJobs.ts`; `spec/flows/index.md` 「共通の前提」). Each target runs in its own unit of work, and a failing target — a row that cannot be restored included — is logged and counted, never retried in the same run. The three jobs whose query drops a target once it is done (`"shrinking"`) re-read page 1 after every page and stop at a page holding no target the run has not tried yet:

| Job | Query (page of 100) | Target key in the logs | Events it emits (their consumers) |
| --- | --- | --- | --- |
| `sweepUnownedPhotos` | `findPageSweepable`: oldest `registeredAt` first, then photo id | photo id | none; it also finishes the deletions `discardReleasedPhotos` (on `photos.released`) left behind |
| `detectEndedOfferings` | `findPageDrifted`: listing id ascending | listing id | `listing.offering_ended` (`deliverNotifications`) |
| `recordEndedOccasions` | `findToObserve`: occasion id ascending | occasion id | `occasion.ended` (`deliverNotifications`, `reassessApplicationPremises`) |

The order is fixed, so a target that fails every run stays at the head of the query. With 100 or more such targets at the head, page 1 holds only targets the run has already tried: every run stops there (`abandoned: true`) and nothing behind them is processed, day after day, while the job reports no crash. Fewer than 100 only cost their own failure. `notifyOverdueReviews` reads its pages in turn (`"stable"`) and `purgeClosedLoginChallenges` does not page, so neither is held up this way.

What to watch, per run (Workers logs: `wrangler tail lunt` while the cron fires at 00:05 JST, or the dashboard's logs):

- `[daily] <job> completed` with `{ processed, failed, skipped, abandoned }`. `processed: 0`, `failed: 100` (one full page) and `abandoned: true` on consecutive days is the stuck state above; a `failed` count that grows from run to run is its warning.
- `[daily] <job>: target <key> failed` (error level, `cause` attached): the target's own unit of work threw — for these jobs typically a `RehydrationError` from the aggregate it re-reads, or a storage failure (`SystemError`; for photos, R2).
- `[daily] <job>: target <key> cannot be read; skipped` (warn level, `cause` attached): the query's own row for that key does not restore (the ledger row or the photo record).
- `[daily] <job> crashed`: the page read itself threw; nothing of that job ran (a broken JSON column fails the whole page, not one row).

Procedure, per job, once a key keeps coming back:

1. Collect the keys: the `target` field of the failed / unreadable lines of the last runs. The same key on consecutive days is a persistent failure; a key seen once is transient and the next run retries it.
2. Check the dead letters for the same ids (`GET /__ops/dead-letters?limit=100`, see above; match the key against each letter's `aggregateId` and `payload`). The job's own failures never reach the queue, but a broken aggregate usually breaks its consumers too: `discardReleasedPhotos` letters whose `photos.released` payload holds the photo id (`sweepUnownedPhotos`), `deliverNotifications` letters for `listing.offering_ended` or other events of the listing (`detectEndedOfferings`), `deliverNotifications` / `reassessApplicationPremises` letters for `occasion.ended` or other events of the occasion (`recordEndedOccasions`). The letter holds no error: the cause is on the `[queue] <consumer> failed on <type> <eventId>` lines of its retries (error level, `cause` attached), and the same error as the job's confirms the diagnosis.
3. Fix the cause and deploy. A `RehydrationError` means a stored row no longer matches its aggregate's snapshot shape: either make the adapter restore it (the row was written by an earlier version) or repair it with a data migration in the state object's schema (`packages/core/src/adapters/do/store/schema.ts`, the next free version; the object applies it on its next start). A storage failure (R2 for `sweepUnownedPhotos`) is fixed on the storage side; nothing in the state object needs to change.
4. Let the next 00:05 run pick the targets up: the query still selects them, and the stopped run left everything behind them untouched, so one successful run drains the backlog. Then re-drive the dead letters found in step 2 (`POST /__ops/dead-letters/redrive`); the consumers are idempotent.
5. Confirm on the next `[daily] <job> completed` line: `failed` back to 0 and `abandoned: false`.

## Opening the service: the first operator

Every operator screen needs an operator, and only an operator can grant the role, so the first one is made by the opening procedure (`establishFirstOperator`, `spec/usecases/authority.md`):

1. The future operator logs in once (email link or code, or Google), which creates their account.
2. Make that account the first operator:

```bash
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"operator@example.com"}' "$APP_URL/__ops/operators/establish"
```

The answer is `{"established": "<email>"}`. Sending the same address again succeeds without a change. It fails with 404 (`ACCOUNT_NOT_FOUND`) when no account has that address yet, and with 422 (`AUTHORITY_OPERATORS_ALREADY_ESTABLISHED`) once operators exist — from then on, operators grant the role from the role management screen (OM-07). Locally, `OPS_TOKEN` is `lunt-local-development-operations-token` (`apps/web/wrangler.jsonc`).

## Mail and external login

Development uses the development inbox and a fake Google (`.spec-implement/design.md` D-07): mail is kept in the object and read at `/__dev/inbox`, and the "Google" button goes to `/__dev/idp/authorize`, where the tester picks a verified address, an unverified one, no address, or cancel. Both need `DEV_TOOLS=1` and are refused without it, so a deployment must select the real adapters. Even with `DEV_TOOLS=1`, every development tool answers only requests to `localhost` / `127.0.0.1` / `[::1]` unless `DEV_TOOLS_ALLOW_REMOTE=1` (trusted shared test environments only; `docs/manual_test.md`).

| Variable | Kind | Meaning | Default |
| --- | --- | --- | --- |
| `MAIL_TRANSPORT` | var | `devInbox` or `smtp` | `devInbox` |
| `MAIL_FROM` | var | Sender, `Name <address>` | `Lunt <no-reply@lunt.example>` |
| `SMTP_HOST`, `SMTP_USERNAME` | var | SMTP server and login | — (required for `smtp`) |
| `SMTP_PASSWORD` | secret | SMTP password | — (required for `smtp`) |
| `SMTP_PORT` | var | only `465` (implicit TLS) is accepted | `465` |
| `EXTERNAL_IDP` | var | `fake` or `google` | `fake` |
| `GOOGLE_CLIENT_ID` | var | OAuth client ID | — (required for `google`) |
| `GOOGLE_CLIENT_SECRET` | secret | OAuth client secret | — (required for `google`) |
| `LOGIN_CHALLENGE_TTL_MS` | var | lifetime of a login link and code | `900000` (15 min) |
| `LOGIN_MAX_CODE_ATTEMPTS` | var | wrong codes that close a challenge | `5` |
| `LOGIN_MAX_UNEXPIRED_CHALLENGES` | var | unexpired login mails one address may have | `5` |

Locally, put secrets in `apps/web/.dev.vars` (template: `.dev.vars.example`); deployed, use `wrangler secret put`.

### SMTP (port 465)

Use a provider that offers SMTPS on 465 — e.g. SendGrid (`smtp.sendgrid.net`, user `apikey`), Amazon SES (`email-smtp.<region>.amazonaws.com`), Resend (`smtp.resend.com`, user `resend`), or Gmail / Google Workspace with an app password (`smtp.gmail.com`). Verify the sending domain (SPF, DKIM) and the `MAIL_FROM` address with the provider. Port 25 is blocked on Workers and STARTTLS on 587 is not used (`worker-mailer` over `cloudflare:sockets`).

1. Contract run (sends real mail; only runs when the variables are set):
   `SMTP_HOST=… SMTP_USERNAME=… SMTP_PASSWORD=… MAIL_FROM=… SMTP_TEST_TO=you@example.com pnpm test:integration`
   The login-mail and Mailer suites send to `SMTP_TEST_TO` (the Mailer suite also to `SMTP_TEST_TO_2`, or to `SMTP_TEST_TO` with a `+lunt2` tag when unset); check that the mails arrive with a `…/login/link?token=…` link and `コード: NNNNNN`, and the notification mail's subject and link.
2. End to end: set `MAIL_TRANSPORT=smtp` and the SMTP variables in `.dev.vars`, run `pnpm dev`, send a login mail from `/login` to your address, and log in with its code and, from a second browser, its link.

### Google (OpenID Connect)

In Google Cloud Console (APIs & Services):

1. OAuth consent screen: user type External, scopes `openid` and `email` only; while the app is in Testing, add the test accounts as test users.
2. Credentials → Create OAuth client ID → type **Web application**. Authorized redirect URIs: `http://localhost:3000/login/external/google/callback` for local runs and `https://<host>/login/external/google/callback` for each deployment. JavaScript origins are not needed.
3. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and set `EXTERNAL_IDP=google`.

The flow uses the authorization code with PKCE (S256), `state` and `nonce`, and requires `email_verified`. Checks:

- Automated (discovery, authorization URL, a refused callback and a bogus code; runs only with the variables set): `GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… pnpm vitest run packages/core/src/adapters/identity`.
- By hand: log in with Google from `/login`; the account for that address is created or reused (a second login lands on the same account), and cancelling on Google's consent screen returns to MY-02 with the external-login failure state. An account without a verified address cannot be produced with Google accounts; that case is covered by the fake provider.

## Area master

The area master (prefectures, municipalities, towns) is static JSON served from the Worker's static assets (`ASSETS`), built from Japan Post's 「住所の郵便番号（1レコード1行、UTF-8形式）」 (`.spec-implement/design.md` D-08).

1. Download `utf_ken_all.zip` from https://www.post.japanpost.jp/zipcode/dl/utf-zip.html (direct link: https://www.post.japanpost.jp/zipcode/dl/utf/zip/utf_ken_all.zip). Use the UTF-8 version, not the Shift_JIS `ken_all.zip`.
2. Import it (a `.zip`, the extracted `utf_ken_all.csv`, or the URL): `pnpm area:import ~/Downloads/utf_ken_all.zip`. The files go to `apps/web/public/area/` (`index.json`, `towns/{prefecture}.json`, `postal/{first 3 digits}.json`; about 1,000 files). They are gitignored; `pnpm build` copies them into `dist/client`, and they deploy with the Worker. Re-run the import and redeploy when Japan Post publishes new data (monthly).
3. Restart `pnpm dev` after importing: each isolate keeps the master it first read.

Without an import, development (`DEV_TOOLS=1`) uses the committed sample in `apps/web/public/area-sample/` (Tokyo's Chiyoda, Chuo, Bunkyo, Taito, Mikurajima; Yokohama Naka; Osaka Kita; Okaya, Nagano, for the 「…の次に番地がくる場合」 town — every postal code the manual tests use), built from `apps/web/scripts/areaSample.csv`. A deployment without `DEV_TOOLS` reads only `/area`, and area lookups fail with `DATA_INTEGRITY_ERROR` until the master is imported.

Maintenance: `pnpm area:import apps/web/scripts/areaSample.csv --out apps/web/public/area-sample` rebuilds the sample; `pnpm area:import --test-master` rebuilds the tests' master (`packages/core/src/adapters/area/testing/testMasterAssets/`). Tests check that both committed copies match their sources.

## Photos

Photos live in the R2 bucket bound as `PHOTOS` (`apps/web/wrangler.jsonc`, bucket `lunt-photos`) under the key `photos/{photoId}` (D-09). The Worker serves them at `/photos/{photoId}` (`apps/web/app/worker/photos.ts`: ETag and `If-None-Match`, `Cache-Control: max-age=60`, `nosniff`). Locally, `pnpm dev` keeps the bucket under `apps/web/.wrangler/state` (cleared by `pnpm dev:reset`). The record of each photo (consent, owner, state) is in the state object; unowned photos are removed by the daily `sweepUnownedPhotos` after `PHOTO_UNOWNED_RETENTION_MS` (default 7 days). A deployment creates the bucket (`wrangler r2 bucket create lunt-photos`).

## Discovery settings

| Variable | Kind | Meaning | Default |
| --- | --- | --- | --- |
| `VICINITY_RADIUS_METERS` | var | radius of the viewer's vicinity: the region list (VW-05) and the map's first range (VW-04) with the viewer's position | `3000` |

## Map tiles

VW-04 and VW-08 draw the map with MapLibre GL JS over public vector tiles (`.spec-implement/design.md` D-13). `MAP_STYLE_URL` (var) is the MapLibre style the browser loads; the default is OpenFreeMap's Positron, `https://tiles.openfreemap.org/styles/positron`: OpenStreetMap data, no API key, no registration and no request limit (https://openfreemap.org, terms at https://openfreemap.org/tos/). Attribution is required: it comes from the tiles' TileJSON and the map's attribution control shows 「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」. With the default style, the map redraws it in the MapCanvas colours with Japanese labels (`apps/web/app/components/map/mapStyle.ts`); any other style is used as it is, so a replacement must carry its own attribution in its sources.

The browser fetches the style, tiles, glyphs and sprites from the style's host (`tiles.openfreemap.org` by default) and runs MapLibre's worker from the app's own assets. The app sets no Content-Security-Policy today; one added later must allow that host in `connect-src` and `img-src`, and `worker-src 'self' blob:`. If the style or every tile fails, the map shows 「地図を表示できませんでした」 with a retry, and the screen's lists keep working.

`/__dev/ui/map` shows the map parts with sample pins (`?tiles=broken` for the fallback, `?at=35.69,139.77` for a stand-in position).

## Schema

`adapters/do/store/schema.ts` is an append-only list of versioned migrations recorded in `_schema_migrations`. Each runs once, in its own transaction, from the object's constructor. Never edit an applied migration.

A change that narrows a value rule (e.g. the line-break set of `domain/common/lineBreak.ts`) leaves stored rows the new rule rejects unrestorable, so ship it with a migration that rewrites that data and rebuilds `search_texts` (texts stored under the old rule would still match such rows).

## Tests

- `pnpm test:unit` runs the object's store code on `node:sqlite` (`adapters/do/testing/`), which reproduces the platform's statement restrictions.
- `pnpm test:integration` runs the same port conformance suites and the relay end to end against the real object in the Workers pool (`apps/web/app/durable-objects/__tests__/`).

## Deployment

Out of scope for now. A deployed configuration drops `DEV_TOOLS`, sets `SESSION_SECRET` and `OPS_TOKEN` with `wrangler secret put`, creates the two queues, and deploys with the `[[migrations]]` entry that makes `LuntStateObject` SQLite-backed.
