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
| Dead-letter queue | same handler, `batch.queue === "lunt-events-dlq"` | Queue `lunt-events-dlq` |
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

The dispatcher (`createFanOutDispatcher`) sends one queue message `{ consumer, event }` per subscribed consumer (`application/events/consumers.ts`). Each message is acked or retried on its own: one failing consumer never re-runs the others, and it alone reaches the dead-letter queue. The consumer checks its receipt first and records it only after it succeeded (`consumeEventMessage`); consumers are idempotent on their own, so a lost receipt costs a repeat, never a wrong result.

## Schema

`adapters/do/store/schema.ts` is an append-only list of versioned migrations recorded in `_schema_migrations`. Each runs once, in its own transaction, from the object's constructor. Never edit an applied migration.

## Tests

- `pnpm test:unit` runs the object's store code on `node:sqlite` (`adapters/do/testing/`), which reproduces the platform's statement restrictions.
- `pnpm test:integration` runs the same port conformance suites and the relay end to end against the real object in the Workers pool (`apps/web/app/durable-objects/__tests__/`).

## Deployment

Out of scope for now. A deployed configuration drops `DEV_TOOLS`, sets `SESSION_SECRET` with `wrangler secret put`, creates the two queues, and deploys with the `[[migrations]]` entry that makes `LuntStateObject` SQLite-backed.
