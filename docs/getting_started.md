# Getting started

From a fresh clone to a running Lunt with an operator, categories and the area master, then the tests. Everything here runs locally; deploying is `docs/deployment.md`.

## Requirements

- Node.js 22.13 or later (`engines`; the unit tests use `node:sqlite`). `flake.nix` with `.envrc` (direnv) provides it.
- pnpm 11.1.2 (`packageManager`; `corepack enable` installs it).
- No Cloudflare account. `pnpm dev` runs the Worker, the Durable Object, the queues, the R2 bucket and the Cron Trigger in workerd through `@cloudflare/vite-plugin`, with the bindings of `apps/web/wrangler.jsonc`.

## Install and run

```bash
pnpm install   # also runs `wrangler types` → apps/web/worker-configuration.d.ts
pnpm dev       # http://localhost:3000
```

There is no database step: the state object applies its schema from its constructor on the first request.

Settings come from the `vars` of `apps/web/wrangler.jsonc`: development tools on (`DEV_TOOLS=1`), mail to the development inbox, a fake Google, and public development values of `SESSION_SECRET` and `OPS_TOKEN` (accepted only while the development tools are on). Local overrides and secrets go in `apps/web/.dev.vars` (gitignored; an entry overrides the same-named var). The first run needs none:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars               # commented templates for SMTP, Google, …
cp apps/web/.dev.vars.manual-test.example apps/web/.dev.vars   # or: the manual tests' settings (docs/manual_test.md)
```

Restart `pnpm dev` after editing `.dev.vars`. Every variable is described in `docs/runtime_cloudflare_do.md` 「Settings」.

Local state (the object's SQLite, queues, R2) persists under `apps/web/.wrangler/state`:

```bash
pnpm dev:reset                                                  # delete it; the next start is empty
LUNT_STATE_DIR=.wrangler/state-b pnpm dev --port 3102 --strictPort   # a second server with its own state
LUNT_STATE_DIR=.wrangler/state-b pnpm dev:reset                 # empty that one
```

`LUNT_STATE_DIR` is relative to `apps/web` and must be under `.wrangler/`. Mail links and the Google redirect use `APP_URL` (`http://localhost:3000`); on another port, enter the code from the mail, or set `APP_URL` in `.dev.vars`.

The production build, served locally by workerd:

```bash
pnpm build     # dist/client (static assets) and dist/server (the Worker)
pnpm start     # vite preview on http://localhost:4173, same bindings and local state
```

It carries the development configuration (`wrangler.jsonc`). A build to deploy names the deployed one: `LUNT_WRANGLER_CONFIG=wrangler.production.jsonc pnpm build` (`docs/deployment.md`).

## Opening a fresh environment

A new environment has no operator, no categories and (outside development) no area master. Do these once, in this order. `$APP_URL` and `$OPS_TOKEN` are the environment's; locally `http://localhost:3000` and `lunt-local-development-operations-token`.

1. Area master. Import Japan Post's postal code data before building (`docs/runtime_cloudflare_do.md` 「Area master」):

   ```bash
   pnpm area:import https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip
   ```

   It writes about 1,000 JSON files to `apps/web/public/area/` (gitignored), which `pnpm build` ships as static assets. Locally, without an import, the committed sample in `apps/web/public/area-sample/` answers (development tools only); restart `pnpm dev` after importing.

2. The first operator. The future operator logs in once at `/login` (mail link or code, or Google), which creates the account. Then:

   ```bash
   curl -X POST -H "Authorization: Bearer $OPS_TOKEN" -H "Content-Type: application/json" \
     -d '{"email":"operator@example.com"}' "$APP_URL/__ops/operators/establish"
   # {"established":"operator@example.com"}
   ```

   Resending the same address answers the same. 404 `ACCOUNT_NOT_FOUND`: the address has not logged in yet. 422 `AUTHORITY_OPERATORS_ALREADY_ESTABLISHED`: operators exist; grant the role from OM-07 instead.

3. The initial categories (「食べる」「買う」「体験」「見る」):

   ```bash
   curl -X POST -H "Authorization: Bearer $OPS_TOKEN" "$APP_URL/__ops/categories/provision"
   # {"provisioned":true}   — {"provisioned":false} once the catalog has categories; resending is safe
   ```

   Operators rename, add and retire categories afterwards at `/ops/categories`.

4. Other roles. The operator opens `/ops/roles` (OM-07): 「編集担当者に任命する」 appoints an editor, 「サービス運営者の役割を付与する」 grants the operator role, both by the email address of an existing account. Stewards of places, regions and events come through their applications and invitations, not here.

For the manual tests, `node apps/web/scripts/seedManualTest.mjs <document>` does steps 2–4 and seeds a document's test data instead (`docs/manual_test.md`).

## Tests and checks

```bash
pnpm typecheck         # tsc at the root and in every package
pnpm lint              # Biome; `pnpm lint:fix && pnpm format` to fix
pnpm test              # test:unit, then test:integration
pnpm test:unit         # Node pool: domain, usecases, port conformance on node:sqlite
pnpm test:integration  # Workers pool: the same conformance suites and the relay against the real object
```

A few suites need real credentials and are skipped without them (the SMTP contract sends real mail):

| Suite | Enabled by | Command |
| --- | --- | --- |
| SMTP login mail and Mailer (Workers pool) | `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`, `SMTP_TEST_TO` (optional `SMTP_TEST_TO_2`) in the shell | `pnpm test:integration` |
| Google OIDC | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in the shell | `pnpm vitest run packages/core/src/adapters/shared/__tests__/externalIdentityVerifier.conformance.test.ts` |

What each layer covers and how tests map to `spec/testcases/`: `docs/test.md`. Browser procedures (`spec/manual-tests/`): `docs/manual_test.md`.

## Where to go next

| Topic | Document |
| --- | --- |
| Topology, settings, SMTP / Google / R2 / map tiles, operations (dead letters, daily jobs, schema) | `docs/runtime_cloudflare_do.md` |
| Deploying with the development tools off | `docs/deployment.md` |
| Manual-test environment (dev clock, inbox, fake Google, seeding) | `docs/manual_test.md` |
| Test layers and rules | `docs/test.md` |
| Code patterns | `docs/backend_implementation_example.md`, `docs/frontend_implementation_example.md` |
