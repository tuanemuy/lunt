# ADR 0011: 写真を R2 に置き、Worker から配る

- 状態: 採用

## 背景

写真は同意と持ち主を持つ（`spec/domains/media.md`）。

## 決定

- 実体は R2 バインディング `PHOTOS` のキー `photos/{photoId}`。配信は Worker のルート `/photos/{photoId}`（ETag と短い `Cache-Control`）
- 写真の検査は純粋な TS の構造の検証
- 登録はサーバー関数への multipart。ファイルの大きさ（10 MiB）と画像の辺（16384 px）の上限は転送境界の DoS 対策として実装に置き、spec の業務の規則にしない

## 結果

- 開発時は wrangler/miniflare がローカルのディスクに永続化する
