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
- `apps/web` (`@repo/web`) — the TanStack Start app and the one Cloudflare Worker: routes, components, the presentation layer, the Worker entry (`app/server.ts`), the state Durable Object, the queue and operations handlers, `scripts/`, and the runtime configs (`vite.config.ts`, `wrangler.jsonc`, `wrangler.production.example.jsonc`).
- Root — shared tooling only: Biome, TypeScript, vitest configs (Node pool and Workers pool), delegating scripts. `apps/web` and `packages/core` declare no `typescript` of their own — their `tsc` is the root's (pnpm puts the workspace root's `node_modules/.bin` on every package script's `PATH`), so there is one compiler version to bump. `@types/*` are publicly hoisted (see `pnpm-workspace.yaml`) so `.d.ts` files inside the pnpm store can resolve `react` / `vitest` types.

A future app (MCP server, CLI, …) is a new `apps/*` package that declares `"@repo/core": "workspace:*"` and owns its DI wiring or reuses `packages/core/src/application/di/`. No tsconfig `paths` mirror is needed.

## Development Commands

Run from the repo root — root scripts delegate to `@repo/web` where relevant (`docs/getting_started.md` has the full walkthrough):

- `pnpm dev` / `pnpm dev:reset` / `pnpm build` / `pnpm start`
- `pnpm area:import <utf_ken_all.zip>` (area master), `pnpm cf:types` (regenerate `worker-configuration.d.ts`)
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` / `pnpm format:check` (Biome, whole repo)
- `pnpm typecheck` (root `tsc` for the vitest configs + `pnpm -r typecheck` across packages)
- `pnpm test` / `pnpm test:unit` (Node pool) / `pnpm test:integration` (Workers pool)
- Web-only scripts not delegated at the root: `pnpm --filter @repo/web <script>` (or run inside `apps/web`)

After changes: `pnpm typecheck && pnpm lint:fix && pnpm format`.

## Architecture

Hexagonal architecture with DDD. Dependencies point inward: presentation → application → domain, with adapters implementing ports defined inward of them.

### Layers

- **Domain** (`packages/core/src/domain/`) — Pure business logic: entities, value objects, domain services, port interfaces, domain events. No I/O, no framework, no ambient time / id generation. Throws `BusinessRuleError` for invariant violations. `domain/common/` is the shared kernel.
- **Application** (`packages/core/src/application/`) — Use cases that orchestrate the domain. Defines ports for cross-cutting concerns (clock, id generation, logging, consumer receipts), the unit-of-work abstraction, application-level errors, event consumers, daily jobs and the DI container (`application/di/`). DTO projection for the presentation layer lives here.
- **Adapters** (`packages/core/src/adapters/`) — Concrete implementations of ports: `do/` (the state Durable Object's RPC protocol, store and request-side repositories), `mail/` (SMTP, development inbox), `identity/` (Google OIDC, development fake), `login/`, `photos/` (R2), `area/` (static-asset area master). Translate driver-specific errors into the shared error contracts.
- **Presentation** (`apps/web/app/presentation/`) — Framework-specific cross-cutting utilities for TanStack Start: server-function entry point, error-response middleware, transport-boundary input validation, error display helpers, the session and `Actor` boundary. The full `SerializedError` union is assembled here from each layer's variants.

### Not a layer

- `packages/core/src/lib/` — Shared structural primitives (e.g. the `CodedError` base, structural pieces of the serialized-error contract) that every layer may extend. Living outside the layered tree is what lets all four layers depend on it without violating the inward-only direction.

### Frontend

TanStack Start with React 19 / RSC, TanStack Router (file-based routes), Tailwind v4. Components live under `apps/web/app/components/`, routes under `apps/web/app/routes/`. Default to async server components for data fetching and usecase invocation; use server functions (via the presentation-layer entry point) for mutations and loader bridges; drive client mutations through React 19 primitives directly rather than custom wrappers. `docs/frontend_implementation_example.md` walks through the patterns below with Lunt's code.

Mutations are a three-layer concern: server component fetches → `"use client"` island for interaction → React 19 primitives (`useActionState` / `useTransition` / `useOptimistic`) for instant feedback. The third layer is mandatory — a server function wired straight to a `<form>` with no optimistic/pending UI is the default failure mode that yields a sluggish, round-trip-only app.

Ownership follows the kind of change. **In-item mutations** (a field toggle, an inline rename) don't change list membership and the leaf survives them, so the leaf owns its server function, its item-local `useOptimistic`, and its error UI. **List-membership changes** (add/remove) can't use an item-local `useOptimistic` — they're a parent-state change — so move list ownership to a client island seeded by the loader (`apps/web/app/components/ops/RoleBoard`, OM-07) and have the owner run the server function for them. Delete in particular must run in the owner: the optimistic removal unmounts the leaf before the request settles, so a leaf-owned delete would discard its own error UI. Add is dispatched from the form's action because the form lives outside the list and survives the round trip. Every mutation reconciles by awaiting `useReconcile()` (`apps/web/app/presentation/reconcile.ts`) inside its transition — `router.invalidate({ sync: true })`, not a bare `router.invalidate()`. A bare call treats a loaded route as stale-while-revalidate and resolves before the fresh data exists, so the transition ends early and the optimistic state reverts to stale data until the background refresh lands. With `sync` it resolves once the fresh data is committed, and the optimistic revert and the refetched data land in one commit.

Loading fallbacks come in two kinds, by scope. **Per-fragment streaming** is for content tied 1:1 to a URL (lists, details): the loader forwards the `renderServerComponent(...)` promise **without awaiting** it, so navigation settles instantly and the fragment streams in under `<Suspense fallback={<Skeleton/>}>` (resolved client-side by `Deferred`/`use()`). `apps/web/app/routes/_account/me/index.tsx` with its `-render.tsx` is the reference; skeletons live under `apps/web/app/components/ui/Skeleton` (generic) and next to their screen (`apps/web/app/components/account/AccountSkeleton`, shaped to the real DOM so it swaps in without layout shift). **Route-level pending** (`router.tsx`'s `defaultPendingComponent` + `defaultPendingMs`/`defaultPendingMinMs`) is the navigation fallback for any route whose loader genuinely *blocks*; a route that streams settles its loader immediately and never triggers it. Keep the two roles distinct: skeletons cover the initial/streaming load, the optimistic primitives above cover post-mount mutations. `apps/web/app/components/ui/Deferred` encodes the rules that keep them from colliding — use it rather than a bare `<Suspense>` + `use()`. It adopts each new loader promise inside a transition, because the fresh unresolved promise a reconcile yields would otherwise re-suspend the boundary, flash the skeleton, and remount the island along with its optimistic state; that same adoption, scheduled while the mutation is pending, is what lets React fold the optimistic revert into the commit that shows the new data (`useDeferredValue` does not — its render is not entangled with the mutation). And it wraps only the fallback → content reveal in `<ViewTransition>`: `useOptimistic` commits are urgent, so React never animates them, and a transition around mutating content just holds the reconciling commit back.

## Key concepts

Each of these is enforced in code and documented in library-level JSDoc at the relevant module — read there for the details.

- **Unit of Work** — every transactional usecase runs inside `UnitOfWorkProvider.run(fn)`; the context exposes the repositories the callback may touch and the only path to enqueue domain events. The Durable Object applies the buffered writes, their commit conditions and the outbox rows in one `transactionSync`.
- **Outbox / domain events** — events collected during a UoW are persisted transactionally and dispatched out-of-band by the state object's alarm relay, one queue message per subscribed consumer. Delivery is at-least-once with no ordering guarantee; consumers must be idempotent. The relay claims rows under a lease (`OUTBOX_LEASE_MS`), so an alarm that died mid-claim is reclaimable once the lease lapses; consumer receipts are recorded only after the consumer succeeded.
- **Idempotent create** — the caller mints the aggregate id and resends the same one on failure; the creating usecase answers "same id, same content" as a replay (no write, no event) and "same id, different content" as a `ConflictError`. The client keeps the id across a failed attempt — a fresh id per submit would defeat it. `packages/core/src/application/authority/inviteMember.ts` and `apps/web/app/components/members/MemberBoard/InviteForm.tsx` are the reference.
- **Retry strategy** — a failed database operation is never retried, in the adapter or above it. Adapters translate the failure (`SystemError("DATABASE_ERROR")`, `ConflictError`, `NotFoundError`, `ForbiddenError` for a refused commit condition) and let it surface; the caller may resend, which OCC and idempotent create make safe. Contention is designed out instead of retried: every write goes through the single state Durable Object, which runs one commit at a time. Redelivering a domain event is the relay's and the queue's job, not a retry of the write. There is intentionally no application-level OCC retry decorator.
- **Input validation** — validated at exactly two points: the transport boundary (shape / DoS) and value-object construction (business invariants). Usecases trust the static type in between. On the frontend the transport boundary is the route's `validateSearch` (URL params) or a server function's `.validator(validateInput(schema))` (client-posted payloads, `apps/web/app/presentation/validator.ts`); `serverData` (`apps/web/app/presentation/serverAction.ts`) is **internal-only** and intentionally schemaless — never feed unvalidated external input through it. A caller-chosen aggregate id follows the same rule: its format is owned by the `IdGenerator` port, so the transport boundary parses it (`parseGeneratedId`, `apps/web/app/presentation/validator.ts`) into the `GeneratedId` brand the creating usecase requires — an id adapters would refuse to rehydrate cannot be passed to it.

## Error handling

- Errors are class hierarchies that each carry their own `kind`-tagged serialized form (`toSerialized()`). The presentation layer serializes structurally — no `instanceof` enumeration of concrete classes.
- HTTP status mapping is presentation-only, driven by the serialized `kind`. Errors themselves do not carry transport concerns.
- Avoid broad `try / catch` in ordinary application logic. Use it only at explicit boundaries (server-function serialization, per-row tolerance in workers).

### Cross-layer catch policy

- **adapter → application**: adapters catch driver-specific errors and translate them into the shared error contracts. Application code never sees provider-native errors.
- **domain → application**: domain errors flow through usecases unchanged. Do not re-translate at the usecase boundary — invariant violations and transport-shape violations are intentionally distinct kinds.
- **application → presentation**: the server-function boundary catches and serializes any thrown error structurally via its `kind`-tagged form. Usecases themselves do not serialize.
- **worker → root**: consumers and daily jobs wrap per-message / per-target processing in `try / catch` for partial-failure tolerance. This is the only place a broad `catch` is expected in application-layer code.

## Runtime

One runtime: Cloudflare Workers + one SQLite-backed Durable Object + Queues (`.spec-implement/design.md` D-01, D-02, D-05). There is no Node, D1, AWS or GCP wiring and no `infra/` directory.

- Worker entry: `apps/web/app/server.ts` — `fetch` (TanStack Start, `/photos/*`, `/__ops/*`, `/__dev/seed`), `queue` (events consumer and dead-letter queue, `app/worker/queue.ts`), `scheduled` (daily jobs, Cron `5 15 * * *`).
- State: `apps/web/app/durable-objects/luntState.ts` (`LuntStateObject`, one instance) over `packages/core/src/adapters/do/`; its alarm is the outbox relay and pruner; its constructor applies the schema migrations.
- DI: `packages/core/src/application/di/container.ts` (`createRequestContainer`, one per request, queue batch or scheduled run).
- Configuration: `apps/web/wrangler.jsonc` (local development, development tools on) and `apps/web/wrangler.production.example.jsonc` (deployment sample, development tools off).

Guides: `docs/getting_started.md` (setup, opening a fresh environment, tests), `docs/runtime_cloudflare_do.md` (topology, settings, real connections, operations), `docs/deployment.md`, `docs/manual_test.md`, `docs/test.md`.

## Examples

具体的な実装パターンは `docs/backend_implementation_example.md` / `docs/frontend_implementation_example.md` を参照。
