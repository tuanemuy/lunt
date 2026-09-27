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
- `commit({ writes, events })` — applies a unit of work. `protocol/commands.ts` is the typed union of write commands; `store/commands.ts` holds one handler per `kind`. The object runs every command and inserts the outbox rows inside one `transactionSync`.
- `isConsumed` / `markConsumed` — per-consumer receipts.
- `kickRelay` — re-arms the relay alarm after manual outbox edits.

Workers RPC turns thrown errors into plain `Error`s, so every outcome a port contract names travels as data: `commit` returns `rejected` with a `WriteFailure` (`conflict` for a version mismatch or a taken unique key, `notFound` for a `save` / `delete` of a missing aggregate), and `DoUnitOfWorkProvider` rethrows it as `ConflictError` / `NotFoundError`. Anything else that throws becomes `SystemError(DATABASE_ERROR)` (`mapDoError`).

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

## Opening the service: the first operator

Every operator screen needs an operator, and only an operator can grant the role, so the first one is made by the opening procedure (`establishFirstOperator`, `spec/usecases/authority.md`):

1. The future operator logs in once (email link or code, or Google), which creates their account.
2. Make that account the first operator:

```bash
curl -X POST -H "Authorization: Bearer $OPS_TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"operator@example.com"}' "$APP_URL/__ops/operators/establish"
```

The answer is `{"established": "<email>"}`. Sending the same address again succeeds without a change. It fails with 404 (`ACCOUNT_NOT_FOUND`) when no account has that address yet, and with 422 (`AUTHORITY_OPERATORS_ALREADY_ESTABLISHED`) once operators exist — from then on, operators grant the role from the role management screen (OM-07). Locally, `OPS_TOKEN` is `lunt-local-development-operations-token` (`apps/web/wrangler.jsonc`).

## Schema

`adapters/do/store/schema.ts` is an append-only list of versioned migrations recorded in `_schema_migrations`. Each runs once, in its own transaction, from the object's constructor. Never edit an applied migration.

## Tests

- `pnpm test:unit` runs the object's store code on `node:sqlite` (`adapters/do/testing/`), which reproduces the platform's statement restrictions.
- `pnpm test:integration` runs the same port conformance suites and the relay end to end against the real object in the Workers pool (`apps/web/app/durable-objects/__tests__/`).

## Deployment

Out of scope for now. A deployed configuration drops `DEV_TOOLS`, sets `SESSION_SECRET` and `OPS_TOKEN` with `wrangler secret put`, creates the two queues, and deploys with the `[[migrations]]` entry that makes `LuntStateObject` SQLite-backed.
