# Deployment

A deployment is the same Worker as `pnpm dev` with the development tools off: real mail (SMTP), real Google login, its own secrets, and the daily jobs on the Cron Trigger. `apps/web/wrangler.production.example.jsonc` is the sample configuration; `apps/web/wrangler.jsonc` stays the local development one.

The build chooses the configuration. `pnpm build` copies the Wrangler configuration named by `LUNT_WRANGLER_CONFIG` (default `wrangler.jsonc`) into `apps/web/dist/server/wrangler.json`, and `wrangler deploy` deploys that file. A deployment is therefore built with `LUNT_WRANGLER_CONFIG=wrangler.production.jsonc`; a plain `pnpm build` is for local preview (`pnpm start`) only.

What changes against development:

| | Development (`wrangler.jsonc`) | Deployment (`wrangler.production.example.jsonc`) |
| --- | --- | --- |
| `DEV_TOOLS` | `1`: `/__dev/*`, development clock, `/__dev/seed` | unset: none of them exists |
| Mail | `MAIL_TRANSPORT=devInbox` | `smtp` + `SMTP_*`, `MAIL_FROM` |
| External login | `EXTERNAL_IDP=fake` | `google` + `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| `SESSION_SECRET`, `OPS_TOKEN` | public development values in `vars` | secrets (`wrangler secret put`) |
| Daily jobs | Cron, or by hand from `/__dev/clock` (`DAILY_JOBS_AUTO=off`) | Cron `5 15 * * *` (00:05 JST), always; `DAILY_JOBS_AUTO` is ignored |
| Area master | `public/area/` if imported, else the committed sample | `public/area/` only |

A configuration that keeps the development inbox, the fake provider or a public development secret with `DEV_TOOLS` off refuses every request, so a half-converted configuration fails closed.

## 1. Cloudflare resources

Run wrangler from `apps/web` (it is a dev dependency there):

```bash
cd apps/web
pnpm exec wrangler login
pnpm exec wrangler queues create lunt-events
pnpm exec wrangler queues create lunt-events-dlq
pnpm exec wrangler r2 bucket create lunt-photos
```

The Durable Object needs no creation step: the `migrations` entry of the configuration (`new_sqlite_classes`) makes `LuntStateObject` SQLite-backed on the first deploy, and the object creates its tables itself.

## 2. External services

- SMTP on port 465 and a verified sender domain: `docs/runtime_cloudflare_do.md` 「SMTP (port 465)」.
- A Google OAuth client with the redirect URI `https://<host>/login/external/google/callback`: `docs/runtime_cloudflare_do.md` 「Google (OpenID Connect)」.

## 3. Configuration

```bash
cp wrangler.production.example.jsonc wrangler.production.jsonc
```

Replace every `example` value: `APP_URL` (the public origin, no trailing slash), `MAIL_FROM`, `SMTP_HOST`, `SMTP_USERNAME`, `GOOGLE_CLIENT_ID`, and uncomment `routes` for a custom domain. The file holds no secrets. Keep the bindings, queue names and the `migrations` entry as they are. The other variables carry their defaults; each is described in `docs/runtime_cloudflare_do.md` 「Settings」.

## 4. Build

From the repository root:

```bash
pnpm install
pnpm area:import https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip
LUNT_WRANGLER_CONFIG=wrangler.production.jsonc pnpm build
```

The build writes `apps/web/dist/client` (static assets, the area master included) and `apps/web/dist/server` (the Worker and its `wrangler.json`, carrying the production configuration). Check the result without deploying:

```bash
cd apps/web
pnpm exec wrangler deploy --dry-run
```

It reports `Using redirected Wrangler configuration` with `dist/server/wrangler.json`, and lists the bindings (`LUNT_STATE`, `EVENTS_QUEUE`, `PHOTOS`, `ASSETS`) and the production vars — `MAIL_TRANSPORT ("smtp")`, `EXTERNAL_IDP ("google")`, no `DEV_TOOLS`. If it shows `DEV_TOOLS`, the build used the development configuration: build again with `LUNT_WRANGLER_CONFIG`.

To try the build locally first, put throwaway values of the four secrets (`SESSION_SECRET="…"` lines, 32 characters or more for the first two) in a file outside the repository and pass it with `--env-file`; without it, wrangler reads the development `.dev.vars` the build copied next to the Worker, whose values would switch the tools back on:

```bash
pnpm exec wrangler dev --config dist/server/wrangler.json --local --port 8787 \
  --persist-to /tmp/lunt-prod-check --env-file /tmp/lunt-prod-check.env \
  --var APP_URL:http://127.0.0.1:8787
```

`/__dev/*` answers 404 there, `/login` shows no development login, and 「Google でログイン」 goes to accounts.google.com.

## 5. Deploy and set the secrets

```bash
pnpm exec wrangler deploy
pnpm exec wrangler secret put SESSION_SECRET --config wrangler.production.jsonc        # e.g. `openssl rand -base64 48`
pnpm exec wrangler secret put OPS_TOKEN --config wrangler.production.jsonc             # optional; unset turns /__ops/* off
pnpm exec wrangler secret put SMTP_PASSWORD --config wrangler.production.jsonc
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.production.jsonc
```

`wrangler deploy` deploys the last build's `dist/server/wrangler.json` (so does `--config dist/server/wrangler.json`): run it only after a build with `LUNT_WRANGLER_CONFIG=wrangler.production.jsonc`. Do not pass `--config wrangler.production.jsonc` to `deploy`: that file is the build's input, and wrangler would try to bundle the sources itself and fail. The `secret put` commands take it only for the Worker's name. Until `SESSION_SECRET` is set (at least 32 characters), every request fails; `OPS_TOKEN` must also be at least 32 characters.

## 6. Open the service

Follow `docs/getting_started.md` 「Opening a fresh environment」 steps 2–4 with `APP_URL` and the `OPS_TOKEN` you set: the first operator logs in and is established with `POST /__ops/operators/establish`, `POST /__ops/categories/provision` puts in the initial categories, and the operator appoints editors at `/ops/roles`.

## Updating

Re-run `LUNT_WRANGLER_CONFIG=wrangler.production.jsonc pnpm build` and `wrangler deploy`. Schema changes need no step: the object applies the migrations it has not recorded when it next starts (`docs/runtime_cloudflare_do.md` 「Schema」). Re-import the area master and redeploy when Japan Post publishes new data (monthly). Watch the logs with `pnpm exec wrangler tail lunt` or the dashboard (`observability` is on in the sample); operations are in `docs/runtime_cloudflare_do.md` (dead letters, daily jobs that stop early).

## Backups

Lunt ships no backup or restore tooling. All state except photos is in the one Durable Object, and the photos are in R2. Cloudflare keeps 30 days of point-in-time recovery for SQLite-backed Durable Objects, but it is reachable only through the object's storage API (`ctx.storage.getBookmarkForTime` / `onNextSessionRestoreBookmark`), which Lunt does not expose.
