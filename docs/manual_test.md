# Running the manual tests locally

`spec/manual-tests/*.md` are browser procedures. Their preconditions ask for a test environment where mail and the external login can be observed, time can be moved forward, and the daily jobs run only when a step says so. The local development server provides all of it while `DEV_TOOLS=1`; none of it exists in a deployed configuration.

## Set up

1. Copy the settings: `cp apps/web/.dev.vars.manual-test.example apps/web/.dev.vars` (gitignored). They satisfy the 設定値 each procedure states — send cap M ≥ 20, login link/code lifetime T ≥ 4 minutes, wrong-code limit N ≥ 2, the review period P ≥ 2 days and D ≤ 8 days — and switch the automatic daily jobs off.
2. Start from an empty state: `pnpm dev:reset && pnpm dev` (http://localhost:3000).
3. Open the service: the first operator logs in once, then `POST /__ops/operators/establish` (`docs/runtime_cloudflare_do.md` 「Opening the service」).
4. Record the settings the procedures ask for from `.dev.vars` (and `apps/web/wrangler.jsonc` for anything not overridden).

## What the procedures' wording maps to

| Procedure says | Do |
| --- | --- |
| テスト環境で受け取ったメール | `/__dev/inbox` (filter by recipient; links in the mail open directly) |
| 提供元・外部アカウント | 「Google でログイン」 goes to `/__dev/idp/authorize`: give a verified address, an unverified one, no address, or cancel |
| テスト環境の時刻を N 分／日 進める | `/__dev/clock` → 「時刻を進める」. Time only moves forward; it applies from the next page load, operation or job |
| 時刻を初期状態に戻す | `/__dev/clock` → 「実際の時刻に戻す」 (offset 0; `pnpm dev:reset` also resets it with the data) |
| テスト環境で日次のジョブを実行する | `/__dev/clock` → 「日次のジョブを実行する」 (every daily job, on the application's time; the result per job is listed) |
| 日次のジョブは手順が実行を指示したときだけ動く | `DAILY_JOBS_AUTO="off"` (in the example settings) stops the Cron Trigger |
| 通信エラー | the browser's developer tools → offline |

## How the development clock works

The state object keeps an offset (ms): it is only ever increased, or put back to 0 (the wall clock). While `DEV_TOOLS=1`, every request, queue batch and scheduled run gets a clock of wall time + offset (`packages/core/src/application/di/clock.ts`), so login expiry, publication dates, offering ends, review periods and job cut-offs all see the advanced time. Infrastructure timers inside the state object (outbox relay back-off, retention) keep wall time. With `DEV_TOOLS` off the offset is never read, `/__dev/*` does not exist, the state object refuses to advance the clock, and `DAILY_JOBS_AUTO` is ignored.

Time never goes back to an arbitrary point: the only way back is to the wall clock (「実際の時刻に戻す」), which with `pnpm dev:reset` restores the initial state `spec/manual-tests/editorial.md` asks for.
