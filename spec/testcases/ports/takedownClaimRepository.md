# TakedownClaimRepository

契約は [Moderation](../../domains/moderation.md) の「TakedownClaimRepository」と、[index.md](../../domains/index.md) の「リポジトリの共通の契約」「UnitOfWork ポート」による。前提条件の申立ては、`TakedownClaim.submit`・`TakedownClaim.resolve` で作り、このポートの `insert`・`save` で保存する。書き込みも読み取りも UnitOfWork の中で行い（読み取りは書き込まない `run`）、書き込みの結果はコミットの後の読み取りで確かめる。このポートは `delete` を持たない。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 申立てが保存されていない | 店舗本人が店舗を対象にした未対応の申立てを `insert` し、`findById` で読む | 同じ立場・対象・理由・メールアドレス・`receivedAt`・`version` の、`status: "open"` の申立てと、`expectedVersion` が返る。結果は持たない | |
| 申立てが保存されていない | 写真の権利者が読みものを対象にし、写真を2枚示した未対応の申立てを `insert` し、`findById` で読む | 立場 `photoRightsHolder`、対象、示した2枚の `PhotoId` が返る | |
| 申立てが保存されていない | 対象が掲載・店舗・地域・イベント・読みものの申立てを1件ずつ `insert` し、それぞれ `findById` で読む | どの申立ても、対象の `kind` と `id` がそのまま返る | |
| 申立てが保存されていない | `findById` を呼ぶ | `null` が返る | |
| ID が同じ申立てが保存されている | 同じ ID の申立てを `insert` する | `ConflictError`。保存されている申立ては変わらない | |
| 申立てが保存されている | 別の ID で、立場・対象・写真・理由・メールアドレスが同じ申立てを `insert` する | 成功する。2つの申立てがどちらも `findById` で読める（ID のほかに一意性はない） | |
| 申立てが保存されていない | どの集約も指さない ID を対象にした申立てを `insert` する | 成功する。ポートは対象があることを確かめない | |
| 未対応の申立てが保存されている | `findById` の `expectedVersion` で、`resolve` した申立てを `save` し、`findById` で読む | `status: "resolved"`、添えた結果、進んだ `version` が返る。立場・対象・写真・理由・メールアドレス・`receivedAt` は変わらない | |
| 未対応の申立てが保存されている。`findById` の後に、別の `save` がコミットされた | 古い `expectedVersion` で `save` する | `ConflictError`。先にコミットされた内容が残る | |
| 申立てが保存されていない | その ID の申立てを `save` する | `NotFoundError` | |

## findOpen

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 申立てが保存されていない | `page: 1`、`limit: 10` で `findOpen` を呼ぶ | `items` は空、`count` は 0 | |
| 未対応の申立てが1件保存されている | `page: 1`、`limit: 10` で `findOpen` を呼ぶ | `items` は1件、`count` は 1 | |
| 未対応の申立てが2件、対応済みの申立てが1件保存されている | `findOpen` を呼ぶ | 未対応の2件だけが返る。`count` は 2 | |
| `receivedAt` が互いに違う未対応の申立てが3件、`receivedAt` の順と違う順で `insert` されている | `findOpen` を呼ぶ | `receivedAt` の古い順に返る | |
| `receivedAt` が同じで ID の違う未対応の申立てが2件保存されている | `findOpen` を呼ぶ | ID の昇順で返る | |
| 未対応の申立てが3件保存されている | `page: 1`、`limit: 3` で `findOpen` を呼ぶ | `items` は3件、`count` は 3 | |
| 未対応の申立てが5件保存されている | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| 未対応の申立てが5件保存されている | `page: 3`、`limit: 3` で `findOpen` を呼ぶ | `items` は空、`count` は 5 | |
| 未対応の申立てが100件保存されている | `page: 1`、`limit: 100` で `findOpen` を呼ぶ | `items` は100件、`count` は 100 | |
| 未対応の申立てが5件、対応済みの申立てが2件保存されている | `page: 1`、`limit: 3` で `findOpen` を呼ぶ | `count` は 5（未対応の全件数） | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 未対応の申立てが保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、違う結果で `resolve` した申立てを同時に `save` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。成功した側の結果だけが残る | |
| 申立てが保存されていない | 2つの UnitOfWork が、同じ ID の申立てを同時に `insert` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。申立ては1つだけ保存される | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 申立てが保存されていない | UnitOfWork の中で未対応の申立てを `insert` してコミットし、直後に `findById` と `findOpen` を呼ぶ | どちらにも、その申立てが返る | |
| 未対応の申立てが保存されている | UnitOfWork の中で、`resolve` した申立てを `save` してコミットし、直後に `findById` と `findOpen` を呼ぶ | `findById` は対応済みの申立てを返す。`findOpen` にその申立ては現れず、`count` も1つ減る | |
| 申立てが保存されていない | UnitOfWork の中で `insert` した後に、`fn` が例外を投げる | `findById` は `null`、`findOpen` にも現れない | |
| 未対応の申立てが保存されている | UnitOfWork の中で、`resolve` した申立てを `save` した後に、`fn` が例外を投げる | `findById` は、未対応の申立てと `save` の前の版を返す。`findOpen` に現れたまま | |
| 未対応の申立て A と、申立て B が保存されている | 1つの UnitOfWork の中で、`resolve` した A を `save` し、B と同じ ID の申立てを `insert` する | `ConflictError`。A の `save` も残らず、A は未対応のまま | |
