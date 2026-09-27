# AGENTS.md

Guidance for coding agents working in this repository.

## Principles

- Prioritize type safety; lean on TypeScript's type system fully.
- Prefer stateless, pure functional code in domain / application layers. Adapter classes are fine when they encapsulate a single external resource and keep mutable state internal.
- Make illegal states unrepresentable at the type level before falling back to runtime checks.
- Default to no comments. Add one only when the WHY is non-obvious — a hidden constraint, an invariant, a workaround. Library-level JSDoc on exported APIs is welcome.
- Validate at the boundaries (transport in, value-object construction); trust the static type in between.
- Keep cross-cutting concerns (clock, id generation, logging) behind ports so domain and application code stays deterministic and testable.

## Workspace layout

pnpm monorepo. One lockfile at the root; packages resolve each other via package `exports` pointing straight at `.ts` sources (no build step for internal packages). `@repo/core` exposes a single flat rule — `"./*": "./src/*.ts"` — so every subpath maps 1:1 to a file and there is no barrel to import from.

- `packages/core` (`@repo/core`) — domain / application / adapters + shared `lib/` primitives. Framework-free; imported everywhere as `@repo/core/*`.
- `apps/web` (`@repo/web`) — the TanStack Start app: routes, components, the presentation layer, the Worker entry (`app/server.ts`) with its queue / scheduled handlers (`app/worker/`), the state Durable Object (`app/durable-objects/`), `scripts/`, and the runtime configs (`vite.config.ts`, `wrangler.jsonc`).
- Root — shared tooling only: Biome, TypeScript, vitest orchestration configs, delegating scripts. `apps/web` and `packages/core` declare no `typescript` of their own — their `tsc` is the root's (pnpm puts the workspace root's `node_modules/.bin` on every package script's `PATH`), so there is one compiler version to bump. `@types/*` are publicly hoisted (see `pnpm-workspace.yaml`) so `.d.ts` files inside the pnpm store can resolve `react` / `vitest` types.

A future app (MCP server, CLI, …) is a new `apps/*` package that declares `"@repo/core": "workspace:*"` and owns its DI wiring or reuses one from `packages/core/src/application/di/`. No tsconfig `paths` mirror is needed.

## Development Commands

Run from the repo root — root scripts delegate to `@repo/web` where relevant:

- `pnpm dev` / `pnpm build` / `pnpm start` (`vite preview` of the build in workerd) / `pnpm dev:reset` (delete the local Durable Object / queue / R2 state)
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` / `pnpm format:check` (Biome, whole repo)
- `pnpm typecheck` (root `tsc` for the vitest configs + `pnpm -r typecheck` across packages)
- `pnpm test` / `pnpm test:unit` (Node pool: domain, usecases and port conformance over `node:sqlite`) / `pnpm test:integration` (Workers pool: the same conformance suites and the relay against the real Durable Object)
- Web-only scripts not delegated at the root: `pnpm --filter @repo/web <script>` (or run inside `apps/web`)

After changes: `pnpm typecheck && pnpm lint:fix && pnpm format`.

## Architecture

Hexagonal architecture with DDD. Dependencies point inward: presentation → application → domain, with adapters implementing ports defined inward of them.

### Layers

- **Domain** (`packages/core/src/domain/`) — Pure business logic: entities, value objects, domain services, port interfaces, domain events. No I/O, no framework, no ambient time / id generation. Throws `BusinessRuleError` for invariant violations.
- **Application** (`packages/core/src/application/`) — Use cases that orchestrate the domain. Defines ports for cross-cutting concerns (clock, id generation, logging), the unit-of-work abstraction, and application-level errors. DTO projection for the presentation layer lives here.
- **Adapters** (`packages/core/src/adapters/`) — Concrete implementations of ports per provider (DB, external APIs, etc). Translate driver-specific errors into the shared error contracts.
- **Presentation** (`apps/web/app/presentation/`) — Framework-specific cross-cutting utilities for TanStack Start: server-function entry point, error-response middleware, transport-boundary input validation, error display helpers. The full `SerializedError` union is assembled here from each layer's variants.

### Not a layer

- `packages/core/src/lib/` — Shared structural primitives (e.g. the `CodedError` base, structural pieces of the serialized-error contract) that every layer may extend. Living outside the layered tree is what lets all four layers depend on it without violating the inward-only direction.

### Frontend

TanStack Start with React 19 / RSC, TanStack Router (file-based routes), Tailwind v4. Components live under `apps/web/app/components/`, routes under `apps/web/app/routes/`. Default to async server components for data fetching and usecase invocation; use server functions (via the presentation-layer entry point) for mutations and loader bridges; drive client mutations through React 19 primitives directly rather than custom wrappers.

Mutations are a three-layer concern: server component fetches → `"use client"` island for interaction → React 19 primitives (`useActionState` / `useTransition` / `useOptimistic`) for instant feedback. The third layer is mandatory — a server function wired straight to a `<form>` with no optimistic/pending UI is the default failure mode that yields a sluggish, round-trip-only app.

Ownership follows the kind of change. **In-item mutations** (a field toggle, an inline rename) don't change list membership and the leaf survives them, so the leaf owns its server function, its item-local `useOptimistic`, and its error UI. **List-membership changes** (add/remove) can't use an item-local `useOptimistic` — they're a parent-state change — so move list ownership to a client island seeded by the loader and have the owner run the server function for them (`apps/web/app/components/ops/RoleBoard`, OM-07, is the reference: it owns the role holders, adds from its form's action and removes optimistically). Delete in particular must run in the owner: the optimistic removal unmounts the leaf before the request settles, so a leaf-owned delete would discard its own error UI. Add is dispatched from the form's action because the form lives outside the list and survives the round trip. Every mutation reconciles by awaiting `useReconcile()` (`apps/web/app/presentation/reconcile.ts`) inside its transition — `router.invalidate({ sync: true })`, not a bare `router.invalidate()`. A bare call treats a loaded route as stale-while-revalidate and resolves before the fresh data exists, so the transition ends early and the optimistic state reverts to stale data until the background refresh lands. With `sync` it resolves once the fresh data is committed, and the optimistic revert and the refetched data land in one commit.

Loading fallbacks come in two kinds, by scope. **Per-fragment streaming** is for content tied 1:1 to a URL (lists, details): the loader forwards the `renderServerComponent(...)` promise **without awaiting** it, so navigation settles instantly and the fragment streams in under `<Suspense fallback={<Skeleton/>}>` (resolved client-side by `Deferred`/`use()`). `apps/web/app/routes/_account/me/notifications.tsx` (MY-03) and `routes/_manage/ops/roles.tsx` (OM-07) are the references. Skeletons live under `apps/web/app/components/ui/Skeleton` (generic) and next to the component they stand in for (e.g. `components/ops/RoleHoldersSkeleton`, shaped to the real DOM so it swaps in without layout shift). **Route-level pending** (`router.tsx`'s `defaultPendingComponent` + `defaultPendingMs`/`defaultPendingMinMs`) is the navigation fallback for any route whose loader genuinely *blocks*; a route that streams settles its loader immediately and never triggers it. Keep the two roles distinct: skeletons cover the initial/streaming load, the optimistic primitives above cover post-mount mutations. `apps/web/app/components/ui/Deferred` encodes the rules that keep them from colliding — use it rather than a bare `<Suspense>` + `use()`. It adopts each new loader promise inside a transition, because the fresh unresolved promise a reconcile yields would otherwise re-suspend the boundary, flash the skeleton, and remount the island along with its optimistic state; that same adoption, scheduled while the mutation is pending, is what lets React fold the optimistic revert into the commit that shows the new data (`useDeferredValue` does not — its render is not entangled with the mutation). And it wraps only the fallback → content reveal in `<ViewTransition>`: `useOptimistic` commits are urgent, so React never animates them, and a transition around mutating content just holds the reconciling commit back.

## Key concepts

Each of these is enforced in code and documented in library-level JSDoc at the relevant module — read there for the details.

- **Unit of Work** — every transactional usecase runs inside `UnitOfWorkProvider.run(fn)`; the context exposes the repositories the callback may touch and the only path to enqueue domain events.
- **Outbox / domain events** — events collected during a UoW are persisted transactionally and dispatched out-of-band by a relay worker. Delivery is at-least-once with no ordering guarantee; consumers must be idempotent. The relay worker claims rows under a lease so multiple workers cannot dispatch the same row, and a crashed worker's claim is reclaimable once the lease lapses.
- **Idempotent create** — the caller mints the aggregate id and resends the same one on failure; the creating usecase answers "same id, same content" as a replay (no write, no event) and "same id, different content" as a `ConflictError`. The client keeps the id across a failed attempt — a fresh id per submit would defeat it. `packages/core/src/application/account/startEmailLogin.ts` with `apps/web/app/components/account/LoginFlow` (the login mail) and `application/authority/inviteMember.ts` are the references.
- **Retry strategy** — a failed database operation is never retried, in the adapter or above it. Adapters translate the driver error (`SystemError("DATABASE_ERROR")`, `ConflictError`) and let it surface; the caller may resend, which OCC and idempotent create make safe. Contention is designed out instead of retried: every unit of work commits as one `transactionSync` inside the single state Durable Object, which serializes it against every other request. Redelivering a domain event is the outbox relay's job, not a retry of the write. There is intentionally no application-level OCC retry decorator.
- **Input validation** — validated at exactly two points: the transport boundary (shape / DoS) and value-object construction (business invariants). Usecases trust the static type in between. On the frontend the transport boundary is the route's `validateSearch` (URL params) or a server function's `.validator(validateInput(schema))` (client-posted payloads); `serverData` is **internal-only** and intentionally schemaless — never feed unvalidated external input through it. A caller-chosen aggregate id follows the same rule: its format is owned by the `IdGenerator` port, so the transport boundary parses it (`parseGeneratedId`, `apps/web/app/presentation/validator.ts`) into the `GeneratedId` brand the creating usecase requires — an id adapters would refuse to rehydrate cannot be passed to it.

- **Session and the `Actor` boundary** — the session is an HMAC-signed cookie (`apps/web/app/presentation/sessionToken.ts`) naming an account; it grants nothing by itself. Server functions obtain the actor through `resolveActor` / `requireActor` (`presentation/actor.ts`), which read the account inside a write-free unit of work once per request, so a withdrawn account's session is simply "not logged in". Routes that need a login call `requireLogin(location)` (`presentation/session.ts`) in `beforeLoad`; it redirects to `/login?next=…`, and every return path goes through `safeNextPath` (same-origin paths only). Cross-site calls to server functions are refused by the framework's CSRF middleware (`apps/web/app/start.ts`).

## Error handling

- Errors are class hierarchies that each carry their own `kind`-tagged serialized form (`toSerialized()`). The presentation layer serializes structurally — no `instanceof` enumeration of concrete classes.
- HTTP status mapping is presentation-only, driven by the serialized `kind`. Errors themselves do not carry transport concerns.
- What the user sees is decided by `classifyError` (`apps/web/app/presentation/errorState.ts`): it maps a serialized error onto a common state of `spec/pages/index.md` (CS-02 failed, CS-04 login required, CS-05 forbidden, CS-06 not found, CS-07 conflict, CS-08 premise changed, CS-10 invalid input with field errors) and its Japanese wording. Business error codes are mapped one by one in `presentation/businessErrorCatalog.ts`, a table typed over `BusinessErrorCode` (`packages/core/src/domain/businessErrorCode.ts`): when a domain adds codes to that union, the build fails until each code has a state (CS-08 or CS-10) and a sentence. Domain messages are for logs, never shown.
- Avoid broad `try / catch` in ordinary application logic. Use it only at explicit boundaries (server-function serialization, per-row tolerance in workers).

### Cross-layer catch policy

- **adapter → application**: adapters catch driver-specific errors and translate them into the shared error contracts. Application code never sees provider-native errors.
- **domain → application**: domain errors flow through usecases unchanged. Do not re-translate at the usecase boundary — invariant violations and transport-shape violations are intentionally distinct kinds.
- **application → presentation**: the server-function boundary catches and serializes any thrown error structurally via its `kind`-tagged form. Usecases themselves do not serialize.
- **worker → root**: workers wrap per-row processing in `try / catch` for partial-failure tolerance. This is the only place a broad `catch` is expected in application-layer code.

## Runtime

Lunt runs only on Cloudflare Workers + one SQLite-backed Durable Object + Queues. `docs/runtime_cloudflare_do.md` is the operational guide; `.spec-implement/design.md` records the decisions.

- **One Worker** (`apps/web/app/server.ts`) hosts the TanStack Start fetch handler, the events queue consumer and its dead-letter queue (`apps/web/app/worker/queue.ts`), and the daily Cron Trigger (`scheduled`, 00:05 JST, running `packages/core/src/application/workers/dailyJobRegistry.ts`).
- **One Durable Object** (`apps/web/app/durable-objects/luntState.ts`, a single global instance) holds every aggregate, the outbox and the per-consumer receipts. Its RPC surface is `query(name, args)` / `commit(request)` plus receipts and `kickRelay` (`packages/core/src/adapters/do/protocol/`). Named reads and write commands are typed catalogs whose DO-side handler tables (`adapters/do/store/`) must cover every key. Each domain keeps its own fragment of every shared registry (protocol, store and migrations, unit-of-work repositories, container services, error codes and their display) and the aggregating files combine them — `docs/backend_implementation_example.md` has the table and the checklist for a new domain. Migration versions are allocated globally in `adapters/do/store/schema.ts`; the object applies every version it has not recorded.
- **Relay**: committing events arms the object's alarm; the alarm drains the outbox and sends one queue message per (event, subscribed consumer), so consumers retry and dead-letter independently. Consumers are written with `defineConsumer` (`packages/core/src/application/events/consumer.ts`) and registered with their event types in `events/consumers.ts`, decoders in `events/registry.ts`; the types force every event to have a decoder and at least one consumer — a consumer that lands with a later stage is listed in `deferredConsumers` until then. The relay never gives up on an outbox row (capped backoff, error logs from `OUTBOX_ALERT_AFTER_ATTEMPTS`). Messages that exhaust the queue's retries are kept in the object's `dead_letters` table and re-driven by an operator through `/__ops/dead-letters` (`docs/runtime_cloudflare_do.md`).
- **DI**: `packages/core/src/application/di/container.ts` builds the one container shape used by requests, consumers and jobs. Ports whose implementation belongs to presentation (the notification mail renderer) come in through `PresentationPorts` (`apps/web/app/presentation/ports.ts`).
- **Operations**: `/__ops/*` with the `OPS_TOKEN` bearer — dead letters, relay kick, and establishing the first service operator (`docs/runtime_cloudflare_do.md`).
- **Mail and external login**: development inbox (`/__dev/inbox`) and a fake Google (`/__dev/idp/authorize`) under `DEV_TOOLS=1`; SMTP on port 465 and Google OpenID Connect otherwise (`docs/runtime_cloudflare_do.md` 「Mail and external login」).

## Examples

具体的な実装パターンは `docs/backend_implementation_example.md`（ドメイン・ユースケース・Durable Object のアダプター・テスト）と `docs/frontend_implementation_example.md`（画面・サーバー関数・状態の表示）を参照。どちらもアカウント（ログイン・退会）と管理権限（役割・管理体制）の実装を題材にしている。テストの層と規則は `docs/test.md`。
