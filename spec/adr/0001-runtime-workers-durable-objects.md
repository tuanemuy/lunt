# ADR 0001: ランタイムを Cloudflare Workers・Durable Objects・Queues に絞る

- 状態: 採用

## 背景

テンプレートは Node・Cloudflare D1・Cloudflare DO・AWS・GCP の5つのランタイムの配線を持ち、1つを選んで残りを消すことを求める（AGENTS.md）。

## 決定

- ランタイムは Cloudflare Workers + Durable Objects + Queues だけにする。Node・D1・AWS・GCP の配線、`infra/*`、該当する docs とテンプレートの Todo の例を削除した
- `pnpm dev`・`build`・`start`・`test` はこの構成を指す。`pnpm start` は `vite preview`（workerd でビルドを動かす）
- `pnpm-lock.yaml` をコミットし、Biome などの版を固定する

## 結果

- 運用するランタイムは1つで、アダプターも1組だけを保つ
- ほかのランタイムへ移るときは、アダプターと入口の層を足す（ドメイン・アプリケーション・プレゼンテーションの層は変えない）
