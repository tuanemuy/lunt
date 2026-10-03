# Deployment

A deployment is the same Worker as `pnpm dev` with the development tools off: real mail (SMTP), real Google login, its own secrets, and the daily jobs on the Cron Trigger. There are two: staging (`apps/web/wrangler.staging.jsonc`, Worker `lunt-staging`) and production (`apps/web/wrangler.production.jsonc`, Worker `lunt`). Each has its own Durable Object, queues and R2 bucket. `apps/web/wrangler.jsonc` stays the local development configuration.

GitHub Actions deploys both:

| Workflow | Trigger | Deploys |
| --- | --- | --- |
| `deploy-staging.yml` | push to `main` | staging |
| `release-please.yml` | push to `main` | nothing: opens or updates the release PR (`CHANGELOG.md`, the version in `package.json`) |
| `deploy-production.yml` | the `v*.*.*` tag that merging the release PR pushes | production, after an approval on the `production` environment |

Both deploy workflows call `deploy.yml`, which imports the area master from Japan Post, builds with the environment's configuration, checks the build (`pnpm --filter @repo/web check:deploy-build`), and runs `wrangler deploy --secrets-file` with the environment's GitHub secrets, so a version never runs without its secrets. Either deploy can also be started by hand (`workflow_dispatch`).

release-please reads [Conventional Commits](https://www.conventionalcommits.org/): only `feat:`, `fix:` and other typed commits on `main` (with squash merges, the PR title) produce a release PR. Commits before `bootstrap-sha` in `release-please-config.json` are not read.

The build chooses the configuration. `pnpm build` copies the Wrangler configuration named by `LUNT_WRANGLER_CONFIG` (default `wrangler.jsonc`) into `apps/web/dist/server/wrangler.json`, and `wrangler deploy` deploys that file. A plain `pnpm build` is for local preview (`pnpm start`) only.

What changes against development:

| | Development (`wrangler.jsonc`) | Staging / production (`wrangler.staging.jsonc`, `wrangler.production.jsonc`) |
| --- | --- | --- |
| `DEV_TOOLS` | `1`: `/__dev/*`, development clock, `/__dev/seed` | unset: none of them exists |
| Mail | `MAIL_TRANSPORT=devInbox` | `smtp` + `SMTP_*`, `MAIL_FROM` |
| External login | `EXTERNAL_IDP=fake` | `google` + `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| `SESSION_SECRET`, `OPS_TOKEN` | public development values in `vars` | secrets (GitHub environment secrets) |
| Daily jobs | Cron, or by hand from `/__dev/clock` (`DAILY_JOBS_AUTO=off`) | Cron `5 15 * * *` (00:05 JST), always; `DAILY_JOBS_AUTO` is ignored |
| Area master | `public/area/` if imported, else the committed sample | `public/area/` only |

A configuration that keeps the development inbox, the fake provider or a public development secret with `DEV_TOOLS` off refuses every request, so a half-converted configuration fails closed. `check:deploy-build` refuses such a build before it is uploaded, and also one whose vars still hold an `example` value or that has no area master.

## 1. Cloudflare resources

Run wrangler from `apps/web` (it is a dev dependency there):

```bash
cd apps/web
pnpm exec wrangler login
pnpm exec wrangler queues create lunt-events
pnpm exec wrangler queues create lunt-events-dlq
pnpm exec wrangler r2 bucket create lunt-photos
pnpm exec wrangler queues create lunt-staging-events
pnpm exec wrangler queues create lunt-staging-events-dlq
pnpm exec wrangler r2 bucket create lunt-staging-photos
```

The Durable Object needs no creation step: the `migrations` entry of the configuration (`new_sqlite_classes`) makes `LuntStateObject` SQLite-backed on the first deploy, and the object creates its tables itself.

Create an API token for the workflows from the 「Edit Cloudflare Workers」 template and add `Queues: Edit` (the deploy registers the queue consumers). Note the account ID.

## 2. External services

For each environment:

- SMTP on port 465 and a verified sender domain: `docs/runtime_cloudflare_do.md` 「SMTP (port 465)」.
- A Google OAuth client with the redirect URI `https://<host>/login/external/google/callback`: `docs/runtime_cloudflare_do.md` 「Google (OpenID Connect)」. One client can carry both environments' redirect URIs.

## 3. Configuration

Edit `apps/web/wrangler.production.jsonc` and `apps/web/wrangler.staging.jsonc` and commit them. Replace every `example` value: `APP_URL` (the public origin, no trailing slash), `MAIL_FROM`, `SMTP_HOST`, `SMTP_USERNAME`, `GOOGLE_CLIENT_ID`, and uncomment `routes` for a custom domain. The files hold no secrets. Keep the bindings, queue names and the `migrations` entry as they are. The other variables carry their defaults; each is described in `docs/runtime_cloudflare_do.md` 「Settings」.

## 4. GitHub

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token of step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID |
| `RELEASE_PLEASE_TOKEN` | a fine-grained personal access token on this repository with `Contents` and `Pull requests` read and write. Not `GITHUB_TOKEN`: a tag it pushes starts no workflow, so production would never deploy |

Environments `staging` and `production` (Settings → Environments), each with the Worker's secrets:

| Secret | |
| --- | --- |
| `SESSION_SECRET` | required, at least 32 characters (e.g. `openssl rand -base64 48`) |
| `OPS_TOKEN` | optional, at least 32 characters; unset turns `/__ops/*` off |
| `SMTP_PASSWORD` | required |
| `GOOGLE_CLIENT_SECRET` | required |

Give `production` required reviewers so a release waits for an approval before it deploys. A missing required secret fails the workflow before the upload; the deploy adds or replaces the secrets it carries and never deletes one, so removing `OPS_TOKEN` takes `wrangler secret delete OPS_TOKEN --name lunt`.

## 5. Release

Merging to `main` deploys staging and updates the release PR. Merging the release PR tags `vX.Y.Z` and deploys production once approved. To deploy without a release, run 「Deploy (staging)」 or 「Deploy (production)」 from the Actions tab.

### By hand

The workflows' steps, from the repository root (`wrangler.staging.jsonc` for staging):

```bash
pnpm install
pnpm area:import https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip
LUNT_WRANGLER_CONFIG=wrangler.production.jsonc pnpm build
pnpm --filter @repo/web check:deploy-build
```

The build writes `apps/web/dist/client` (static assets, the area master included) and `apps/web/dist/server` (the Worker and its `wrangler.json`, carrying the chosen configuration). Check the result without deploying:

```bash
cd apps/web
pnpm exec wrangler deploy --dry-run
```

It reports `Using redirected Wrangler configuration` with `dist/server/wrangler.json`, and lists the bindings (`LUNT_STATE`, `EVENTS_QUEUE`, `PHOTOS`, `ASSETS`) and the deployed vars — `MAIL_TRANSPORT ("smtp")`, `EXTERNAL_IDP ("google")`, no `DEV_TOOLS`.

To try the build locally first, put throwaway values of the four secrets (`SESSION_SECRET="…"` lines, 32 characters or more for the first two) in a file outside the repository and pass it with `--env-file`; without it, wrangler reads the development `.dev.vars` the build copied next to the Worker, whose values would switch the tools back on:

```bash
pnpm exec wrangler dev --config dist/server/wrangler.json --local --port 8787 \
  --persist-to /tmp/lunt-prod-check --env-file /tmp/lunt-prod-check.env \
  --var APP_URL:http://127.0.0.1:8787
```

`/__dev/*` answers 404 there, `/login` shows no development login, and 「Google でログイン」 goes to accounts.google.com.

Deploy with the secrets in a JSON file outside the repository (`{"SESSION_SECRET": "…", …}`):

```bash
pnpm exec wrangler deploy --secrets-file /path/to/secrets.json
```

`wrangler deploy` deploys the last build's `dist/server/wrangler.json` (so does `--config dist/server/wrangler.json`). Do not pass `--config wrangler.production.jsonc` to `deploy`: that file is the build's input, and wrangler would try to bundle the sources itself and fail. Until `SESSION_SECRET` is set (at least 32 characters), every request fails; `OPS_TOKEN` must also be at least 32 characters.

## 6. Open the service

Follow `docs/getting_started.md` 「Opening a fresh environment」 steps 2–4 with `APP_URL` and the `OPS_TOKEN` you set: the first operator logs in and is established with `POST /__ops/operators/establish`, `POST /__ops/categories/provision` puts in the initial categories, and the operator appoints editors at `/ops/roles`.

## Updating

Merge to `main` and release as in step 5. Schema changes need no step: the object applies the migrations it has not recorded when it next starts (`docs/runtime_cloudflare_do.md` 「Schema」). Every deploy imports the current area master, so Japan Post's monthly data reaches a deployment with its next deploy. Watch the logs with `pnpm exec wrangler tail lunt` (`lunt-staging` for staging) or the dashboard (`observability` is on in both configurations); operations are in `docs/runtime_cloudflare_do.md` (dead letters, daily jobs that stop early).

## Backups

Lunt ships no backup or restore tooling. All state except photos is in the one Durable Object, and the photos are in R2. Cloudflare keeps 30 days of point-in-time recovery for SQLite-backed Durable Objects, but it is reachable only through the object's storage API (`ctx.storage.getBookmarkForTime` / `onNextSessionRestoreBookmark`), which Lunt does not expose.
