# PhotoAssetRepository

契約: [../../domains/media.md](../../domains/media.md) の `PhotoAssetRepository` と、[../../domains/index.md](../../domains/index.md) のリポジトリの共通の契約。写真は、`PhotoAsset` の振る舞い（`register`・`markStored`・`claim`・`transfer`・`discard`）で作った値を `insert`・`save` して用意する。リポジトリは `UnitOfWorkContext` から得る。UnitOfWork を書かない呼び出しは、呼び出しごとに1つの `run` の中で行い、コミットする。

## insert・findById・save・delete

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 写真がない | `accepted` の写真を `insert` し、`findById` する | 同じ内容の `accepted` の写真と `expectedVersion` を返す | |
| 写真がない | 存在しない `PhotoId` で `findById` する | `null` を返す | |
| `insert` した `accepted` の写真 | `findById` の `expectedVersion` で、`markStored` の結果を `save` し、`findById` する | `stored` の写真を返す。`owner` は `null` | |
| 持ち主のない `stored` の写真 | `claim` の結果を `save` し、`findById` する | `owner` が、設定した `PhotoOwnerRef`（種類と ID）のまま返る。`article`・`listing`・`place`・`region`・`occasion`・`application` のどの種類も保たれる | |
| 申請を持ち主とする `stored` の写真 | `transfer` の結果を `save` し、`findById` する | `owner` が反映先の集約に替わっている | |
| `stored` の写真 | `discard` の結果を `save` し、`findById` する | `discarded` の写真を返す。`owner` を持たない | |
| `insert` した写真 | 同じ `PhotoId` の写真を `insert` する | `ConflictError`。元の写真は変わらない | |
| `insert` した写真 | `save` の後に `findById` する | `registeredBy`・`consentedAt`・`digest`・`registeredAt` は `insert` した値のまま | |
| `discarded` の写真 | `findById` の `expectedVersion` で `delete` し、`findById` する | `null` を返す | |
| 写真 A がある。一度も `insert` していない `PhotoId` の写真 Z | A の `findById` で得た `expectedVersion` で、Z を `save` する | `NotFoundError`。A は変わらない | |
| 写真 A がある | A の `findById` で得た `expectedVersion` で、一度も `insert` していない `PhotoId` を `delete` する | `NotFoundError`。A は残る | |
| 写真 A を `delete` した | `delete` の前に得た `expectedVersion` で、A を `save` する | `NotFoundError`。A は戻らない | |
| 写真 A を `delete` した | `delete` の前に得た `expectedVersion` で、A をもう一度 `delete` する | `NotFoundError` | |
| 写真 A を `insert` し、`discard` を `save` して `delete` した | A と同じ `PhotoId` の `accepted` の写真を `insert` する | `ConflictError`。`findById` は `null` のまま（削除した写真の ID は、登録に使えない） | |

## 楽観ロック

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 同じ写真を2回 `findById` し、同じ `expectedVersion` を2つ得た | 1つ目で `save` を確定し、2つ目で `save` する | 2つ目は `ConflictError`。1つ目の内容が残る | |
| 同じ写真の同じ `expectedVersion` を2つ得た | 1つ目で `save` を確定し、2つ目で `delete` する | 2つ目は `ConflictError`。写真は残る | |
| 持ち主のない `stored` の写真を、持ち主の設定と掃除が同じ版で読んだ | 持ち主の設定の `save`（`claim`）を先に確定し、掃除の `save`（`discard`）を後に確定する | 掃除の側が `ConflictError`。写真は持ち主を持つ `stored` のまま | |
| 上と同じ | 掃除の `save`（`discard`）を先に確定し、持ち主の設定の `save`（`claim`）を後に確定する | 持ち主の設定の側が `ConflictError`。写真は `discarded` のまま | |
| 同じ写真の同じ `expectedVersion` で、2つの `save` を同時に実行する | 両方の完了を待つ | 片方だけが成功し、もう片方は `ConflictError` | |

## findByIds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 写真 A・B・C がある | A と C の ID で読む | A と C を、それぞれの `expectedVersion` とともに返す。B は返さない。順序は問わない | |
| 写真 A がある | A の ID と、存在しない ID で読む | A だけを返す。存在しない ID は結果に現れず、エラーにならない | |
| 写真 A がある | 存在しない ID だけで読む | 空の並びを返す | |
| 写真 A がある | 空の一覧で読む | 空の並びを返す | |
| 写真 A を `delete` した | A の ID で読む | 空の並びを返す | |
| `accepted`・`stored`・`discarded` の写真が1枚ずつある | 3つの ID で読む | 3枚とも、段階を保って返す | |
| 写真が100枚ある | 100件の ID で読む | 100枚とも返す | |
| 写真がある | 101件の ID で読む | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |
| `findByIds` で得た `expectedVersion` | その版で `save` する | 成功する。`findById` の `expectedVersion` と同じに使える | |

## findPageSweepable

`registeredBefore` を B と書く。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `registeredAt` が B より前の `accepted` の写真 | 読む | その写真を返す | |
| `registeredAt` が B より前の、持ち主のない `stored` の写真 | 読む | その写真を返す | |
| `registeredAt` が B より前の、持ち主のある `stored` の写真 | 読む | 返さない | |
| `registeredAt` が B と同じ `accepted` の写真と、B より後の持ち主のない `stored` の写真 | 読む | どちらも返さない | |
| `registeredAt` が B より後の `discarded` の写真 | 読む | その写真を返す。`discarded` は `registeredAt` を問わない | |
| 持ち主を持っていた `stored` の写真を `discard` して `save` した | 読む | その写真を返す | |
| B より前の持ち主のない `stored` の写真に、`claim` を `save` した | 読む | 返さなくなる | |
| 掃除の対象の写真を `delete` した | 読む | 返さなくなる | |
| 対象の写真が3枚。`registeredAt` は T1 < T2 < T3 | 読む | T1、T2、T3 の順に返す | |
| 対象の写真が2枚。`registeredAt` が同じ | 読む | ID の昇順に返す | |
| 返された写真 | 返された `expectedVersion` で `save` する | 成功する | |
| 対象が0件 | `page: 1, limit: 10` で読む | `items` は空、`count` は 0 | |
| 対象が1件 | `page: 1, limit: 10` で読む | `items` は1件、`count` は 1 | |
| 対象が10件 | `page: 1, limit: 10` で読む | `items` は10件、`count` は 10 | |
| 対象が10件 | `page: 2, limit: 10` で読む | `items` は空、`count` は 10 | |
| 対象が11件 | `page: 1, limit: 10` と `page: 2, limit: 10` で読む | 1ページ目は古い順の先頭10件、2ページ目は残りの1件。重なりも抜けもない。`count` はどちらも 11 | |
| 対象が11件 | `page: 1, limit: 10` の10件を `delete` し、もう一度 `page: 1, limit: 10` で読む | 残りの1件を返す。`count` は 1 | |
| 対象と対象でない写真が混ざっている | 読む | `count` は対象の件数だけを数える | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| UnitOfWork の中で写真を `insert` し、コミットした | コミットの直後に `findById`・`findByIds`・`findPageSweepable` で読む | どの問い合わせにも、即座に反映されている | |
| UnitOfWork の中で写真を2枚 `insert` し、その後に例外を投げた | `findByIds` で2枚を読む | 空の並びを返す。1枚も残らない | |
| 写真 A・B を読んだ。B の版は、別の UnitOfWork の `save` で進んでいる | 1つの UnitOfWork で、A の `claim` と B の `claim` を `save` する | `ConflictError`。A の持ち主も設定されていない | |
| UnitOfWork の中で `discard` を `save` し、その後に例外を投げた | `findById` で読む | 写真は `stored` のままで、版も変わらない | |
