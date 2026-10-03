# Lunt

写真から、まちのお店・掲載・地域・イベント・読みものを見つける Web サービス。閲覧側はスマートフォン中心で、店舗・地域・イベント・読みものの管理と、サービスの運営も同じサービスで行う。

設計の正本は [`spec/`](spec/index.md)。実装の規約は [`AGENTS.md`](AGENTS.md)。

## 構成

- TanStack Start（React 19 / RSC、TanStack Router、Tailwind v4）
- Cloudflare Workers + 1つの SQLite-backed Durable Object + Queues（[`docs/runtime_cloudflare_do.md`](docs/runtime_cloudflare_do.md)）
- ヘキサゴナルアーキテクチャ + DDD（`domain → application → adapters`、presentation は `apps/web`）

```
packages/core/src/     # @repo/core — フレームワークに依らない層
  domain/              # エンティティ、値オブジェクト、ポート、ドメインイベント（common は共有カーネル）
  application/         # ユースケース、UnitOfWork、横断のポート、消費者と日次ジョブ、DI
  adapters/            # ポートの実装（プロバイダーごと。プロバイダーに依存しない部品は shared）
  lib/                 # すべての層が使う構造の部品
apps/web/              # @repo/web — TanStack Start のアプリ
  app/server.ts        # Worker のエントリ（fetch・queue・scheduled）
  app/durable-objects/ # 状態の Durable Object
  app/worker/          # queue の処理、運用の口（/__ops）、写真の配信、開発用のデータ投入、Durable Object のスタブ
  app/presentation/    # サーバー関数の入口、エラーの応答、入力の検証
  app/routes/          # ファイルベースのルート
  app/components/
  wrangler.jsonc       # ローカル開発の Worker の設定（開発用の道具が有効）
  wrangler.staging.jsonc     # staging の Worker の設定（開発用の道具が無効）
  wrangler.production.jsonc  # 本番の Worker の設定（開発用の道具が無効）
  scripts/             # エリアのマスターの取り込み、ローカルの状態の削除、手動テストのデータ投入
docs/                  # 実行環境とテストの手引き
spec/                  # 設計
```

## 必要なもの

- Node.js 22.13 以上（単体テストが `node:sqlite` を使う。`flake.nix` / `.envrc` の direnv 環境を推奨）
- pnpm 11.1.2（`corepack enable` で入る）
- ローカル開発に Cloudflare のアカウントは要らない

## 始め方

```bash
pnpm install
pnpm dev          # http://localhost:3000 （workerd 上で Worker・Durable Object・Queues・R2・Cron が動く）
```

データベースの準備は要らない。Durable Object が最初の要求でスキーマを作る。設定は `apps/web/wrangler.jsonc` の `vars`（開発用の道具・開発用受信箱・疑似 Google が有効）で、上書きと秘密の値は `apps/web/.dev.vars`（見本は `.dev.vars.example`、手動テスト用は `.dev.vars.manual-test.example`）に置く。ローカルの状態は `apps/web/.wrangler/state` に残り、`pnpm dev:reset` で消せる。`LUNT_STATE_DIR` で状態を分けたサーバーを並べて動かせる。

ビルドした成果物をローカルで動かす:

```bash
pnpm build
pnpm start        # http://localhost:4173
```

このビルドは開発用の設定（`wrangler.jsonc`）を成果物に入れる。デプロイは GitHub Actions が行う。`main` への push で staging に、release-please のリリース PR をマージすると本番にデプロイされる（[`docs/deployment.md`](docs/deployment.md)）。

## 新しい環境の初期設定

1. エリアのマスターを取り込む: `pnpm area:import <utf_ken_all.zip のパスか URL>`（開発中は取り込まなくても同梱の見本で動く）
2. 最初のサービス運営者: その人が一度ログインしてから `POST /__ops/operators/establish`（`OPS_TOKEN` の Bearer）
3. 初期カテゴリー: `POST /__ops/categories/provision`
4. 編集担当者・ほかの運営者: 運営者が `/ops/roles`（OM-07）で任命する

コマンドと応答は [`docs/getting_started.md`](docs/getting_started.md)。

## コマンド

| 目的 | コマンド |
| --- | --- |
| 開発サーバー | `pnpm dev`（`--port` で変更） |
| ローカルの状態を消す | `pnpm dev:reset` |
| ビルド・起動 | `pnpm build` / `pnpm start` |
| エリアのマスターの取り込み | `pnpm area:import <source>` |
| 型検査 | `pnpm typecheck` |
| Lint・整形 | `pnpm lint` / `pnpm lint:fix` / `pnpm format` |
| テスト | `pnpm test`（`pnpm test:unit` + `pnpm test:integration`。[`docs/test.md`](docs/test.md)） |
| 日次ジョブの起動（開発中） | `curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=5+15+*+*+*"` または `/__dev/clock` |
| Worker の型の再生成 | `pnpm cf:types` |

変更の後は `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test`。

## ドキュメント

| 内容 | 場所 |
| --- | --- |
| 起動・初期設定・テストの手順 | [`docs/getting_started.md`](docs/getting_started.md) |
| 実行環境の構成・設定値・実接続（SMTP・Google・R2・地図）・運用（DLQ・日次ジョブ・スキーマ） | [`docs/runtime_cloudflare_do.md`](docs/runtime_cloudflare_do.md) |
| デプロイ（開発用の道具を無効にした設定の見本） | [`docs/deployment.md`](docs/deployment.md) |
| 手動テストの環境（開発用の時刻・受信箱・疑似 Google・テストデータの投入） | [`docs/manual_test.md`](docs/manual_test.md) |
| テストの層と規則 | [`docs/test.md`](docs/test.md) |
| 実装の例 | [`docs/backend_implementation_example.md`](docs/backend_implementation_example.md)、[`docs/frontend_implementation_example.md`](docs/frontend_implementation_example.md) |
