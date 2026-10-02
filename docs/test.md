# Testing

Lunt's tests run in two Vitest pools. Both exercise the same SQL: the Durable Object's store code (`packages/core/src/adapters/durableObject/store/`) runs on `node:sqlite` in the Node pool and inside the real object in the Workers pool.

## Layers

| Layer | Pool / command | What it covers |
| --- | --- | --- |
| Domain | Node, `pnpm test:unit` | Value objects, entities, shared kernel rules and error codes. Property-based with fast-check where boundaries matter. |
| Usecase | Node, `pnpm test:unit` | Usecases over a production-shaped container: the real request-side adapters and unit of work, the DO store on an in-memory `node:sqlite` database (`createInProcessState`), `FakeIdGenerator`, a fixed clock, and fakes only for external ports (mail, photo storage, identity providers). |
| Port conformance | Node **and** Workers | One suite per port in an `__conformance__/` directory next to its adapters (`adapters/durableObject/`, `adapters/r2/`, `adapters/staticAssets/`, `adapters/webCrypto/`, `adapters/shared/` for ports served by a provider-independent composition, and `application/notification/` for the presentation-side mail renderer), run by a Node runner (`*.conformance.test.ts`) and, for every port that touches the state object or the mail transport, a Workers runner against the real object (`apps/web/app/durable-objects/__tests__/*.conformance.integration.test.ts`). The real SMTP and Google adapters run their suites only when their credentials are in the environment (`docs/runtime_cloudflare_do.md` 「Mail and external login」). |
| Runtime wiring | Workers, `pnpm test:integration` | RPC serialization, `transactionSync`, schema migrations, the alarm relay, fan-out to the queue, consumer receipts. |

## Fidelity of the Node pool

`createNodeSqlStorage` (`adapters/nodeSqlite/nodeSqlStorage.ts`) reproduces the platform restrictions: transaction-control statements are refused, at most 100 bound parameters, only string / number / null / ArrayBuffer bindings. `createInProcessState` passes every RPC argument and result through `structuredClone`. The conformance suites run on both pools, so any remaining difference between `node:sqlite` and the Durable Object shows up as a failing Workers run.

## Mapping spec test cases

- `spec/testcases/{domain}/{usecase}.md` → `packages/core/src/application/{domain}/__tests__/{usecase}.test.ts`.
- `spec/testcases/ports/{port}.md` → `{port}.ts` in the `__conformance__/` directory of its adapters.
- Each `##` section is a `describe`; each table row is an `it` whose title starts with `{usecase or port}#{n}` — `n` counts the rows of the file in order across its tables — followed by the row's precondition and operation text (design.md D-11). The text makes a renumbering after a spec edit visible.
- Every row runs; there is no `it.todo`. A mechanism worth covering beyond the rows gets extra tests named without the `#n` prefix: the per-kind lookup of `ContentDirectory` also runs against a conformance-only table (`__conformance__/contentDirectory.ts`), and Application's kind-agnostic core and ports against the test kinds in `domain/application/__tests__/testKinds.ts`.

## Rules

- No repository or unit-of-work fakes: usecases run on the real store.
- Build fixtures through usecases or repositories, never with raw SQL (the conformance-only table above is the exception).
- Concurrency cases interleave deterministically: a barrier or `commitAfter` lets the competing unit of work commit after the other's reads and before its commit, so the named loser is asserted.
- The Workers pool isolates storage per file only; each test takes a fresh object with `idFromName(crypto.randomUUID())`. Alarms fire for real, so relay outcomes are polled with `vi.waitFor`.

## Commands

| Purpose | Command |
| --- | --- |
| All | `pnpm test` |
| Node pool | `pnpm test:unit` |
| Workers pool | `pnpm test:integration` |
| One directory | `pnpm exec vitest run packages/core/src/domain/common` |
| SMTP contract (sends real mail) | `SMTP_HOST=… SMTP_USERNAME=… SMTP_PASSWORD=… MAIL_FROM=… SMTP_TEST_TO=… pnpm test:integration` |
| Google contract | `GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… pnpm exec vitest run packages/core/src/adapters/shared/__tests__/externalIdentityVerifier.conformance.test.ts` |
| Types and lint | `pnpm typecheck`, `pnpm lint` |

Without the credentials the contract suites are skipped, which is what the skipped counts of a plain `pnpm test` are.
