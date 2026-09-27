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
  adapters/do/         # Durable Object のアダプター（プロトコル、store、リポジトリ）
  lib/                 # すべての層が使う構造の部品
apps/web/              # @repo/web — TanStack Start のアプリ
  app/server.ts        # Worker のエントリ（fetch・queue・scheduled）
  app/durable-objects/ # 状態の Durable Object
  app/worker/          # queue と Durable Object のスタブ
  app/presentation/    # サーバー関数の入口、エラーの応答、入力の検証
  app/routes/          # ファイルベースのルート
  app/components/
  wrangler.jsonc       # ローカル開発の Worker の設定
docs/                  # 実行環境とテストの手引き
spec/                  # 設計
```

## 必要なもの

- Node.js 22.13 以上（`node:sqlite` を使う。`flake.nix` / `.envrc` の direnv 環境を推奨）
- pnpm 11

## 始め方

```bash
pnpm install
pnpm dev          # http://localhost:3000 （workerd 上で Worker と Durable Object が動く）
```

データベースの準備は要らない。Durable Object が最初の要求でスキーマを作る。ローカルの状態は `apps/web/.wrangler/state` に残り、`pnpm dev:reset` で消せる。

ビルドした成果物をローカルで動かす:

```bash
pnpm build
pnpm start
```

## コマンド

| 目的 | コマンド |
| --- | --- |
| 開発サーバー | `pnpm dev` |
| ローカルの状態を消す | `pnpm dev:reset` |
| ビルド・起動 | `pnpm build` / `pnpm start` |
| 型検査 | `pnpm typecheck` |
| Lint・整形 | `pnpm lint` / `pnpm lint:fix` / `pnpm format` |
| テスト | `pnpm test`（`pnpm test:unit` + `pnpm test:integration`。[`docs/test.md`](docs/test.md)） |
| 日次ジョブの起動（開発中） | `curl "http://localhost:3000/cdn-cgi/local/scheduled?cron=5+15+*+*+*"` |

変更の後は `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test`。
