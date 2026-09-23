# InfoReportRepository

契約は [Moderation](../../domains/moderation.md) の「InfoReportRepository」と、[index.md](../../domains/index.md) の「リポジトリの共通の契約」「UnitOfWork ポート」による。前提条件の連絡は、`InfoReport.submit`（掲載が対象の連絡は、事実の `listingPlaceId` に店舗を渡す）・`InfoReport.requestConfirmation`・`InfoReport.resolve` で作り、このポートの `insert`・`save` で保存する。書き込みは UnitOfWork の中で行い、結果はコミットの後の読み取りで確かめる。このポートは `delete` を持たない。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 連絡が保存されていない | 店舗を対象にした未対応の連絡を `insert` し、`findById` で読む | 同じ対象（`kind: "place"`、`placeId`）・種類・内容・連絡した人・`receivedAt`・`version` の、`status: "open"` の連絡と、`expectedVersion` が返る。依頼と対応した日時は持たない | |
| 連絡が保存されていない | 掲載を対象にした、種類が閉店の未対応の連絡を `insert` し、`findById` で読む | 対象は `kind: "listing"` で、`placeId` と `listingId` の両方が返る。種類は `closure` | |
| 連絡が保存されていない | `findById` を呼ぶ | `null` が返る | |
| ID が同じ連絡が保存されている | 同じ ID の連絡を `insert` する | `ConflictError`。保存されている連絡は変わらない | |
| 連絡が保存されている | 別の ID で、連絡した人・対象・種類・内容が同じ連絡を `insert` する | 成功する。2つの連絡がどちらも `findById` で読める（ID のほかに一意性はない） | |
| 連絡が保存されていない | どの集約も指さない `placeId`・`listingId`・連絡した人の `AccountId` を持つ連絡を `insert` する | 成功する。ポートは指す先があることを確かめない | |
| 未対応の連絡が保存されている | `findById` の `expectedVersion` で、`requestConfirmation` した連絡を `save` し、`findById` で読む | `status: "confirmationRequested"`、`request.requestedAt`、進んだ `version` が返る。対象・種類・内容・連絡した人・`receivedAt` は変わらない | |
| 未対応の連絡が保存されている | `resolve` した連絡を `save` し、`findById` で読む | `status: "resolved"`、`request: null`、`resolvedAt` が返る | |
| 確認依頼中の連絡が保存されている | `resolve` した連絡を `save` し、`findById` で読む | `status: "resolved"`、確認依頼中のときと同じ `request.requestedAt`、`resolvedAt` が返る | |
| 未対応の連絡が保存されている。`findById` の後に、別の `save` がコミットされた | 古い `expectedVersion` で `save` する | `ConflictError`。先にコミットされた内容が残る | |
| 連絡が保存されていない | その ID の連絡を `save` する | `NotFoundError` | |

## findUnresolved

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 連絡が保存されていない | `page: 1`、`limit: 10` で `findUnresolved` を呼ぶ | `items` は空、`count` は 0 | |
| 未対応の連絡が1件保存されている | `page: 1`、`limit: 10` で `findUnresolved` を呼ぶ | `items` は1件、`count` は 1 | |
| 未対応、確認依頼中、依頼を経た対応済み、依頼を経ない対応済みの連絡が1件ずつ保存されている | `findUnresolved` を呼ぶ | 未対応と確認依頼中の2件だけが返る。`count` は 2 | |
| `receivedAt` が互いに違う未対応と確認依頼中の連絡が計3件、`receivedAt` の順と違う順で `insert` されている | `findUnresolved` を呼ぶ | 状態にかかわらず、`receivedAt` の古い順に返る。確認の依頼の日時は並び順に影響しない | |
| `receivedAt` が同じで ID の違う未対応の連絡が2件保存されている | `findUnresolved` を呼ぶ | ID の昇順で返る | |
| 対応を終えていない連絡が3件保存されている | `page: 1`、`limit: 3` で `findUnresolved` を呼ぶ | `items` は3件、`count` は 3 | |
| 対応を終えていない連絡が5件保存されている | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| 対応を終えていない連絡が5件保存されている | `page: 3`、`limit: 3` で `findUnresolved` を呼ぶ | `items` は空、`count` は 5 | |
| 対応を終えていない連絡が100件保存されている | `page: 1`、`limit: 100` で `findUnresolved` を呼ぶ | `items` は100件、`count` は 100 | |
| 対応を終えていない連絡が5件、対応済みの連絡が2件保存されている | `page: 1`、`limit: 3` で `findUnresolved` を呼ぶ | `count` は 5（対応を終えていない全件数） | |

## findConfirmationRequestedByPlace

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P の連絡が保存されていない | P の `placeId` で呼ぶ | `items` は空、`count` は 0 | |
| 店舗 P を対象にした確認依頼中の連絡が1件保存されている | P の `placeId` で、`page: 1`、`limit: 10` で呼ぶ | `items` は1件、`count` は 1 | |
| 店舗 P を対象にした確認依頼中の連絡と、P の掲載を対象にした確認依頼中の連絡（`target.placeId` が P）が保存されている | P の `placeId` で呼ぶ | 2件とも返る | |
| 店舗 P に、未対応、確認依頼中、依頼を経た対応済みの連絡が1件ずつ保存されている | P の `placeId` で呼ぶ | 確認依頼中の1件だけが返る。`count` は 1 | |
| 店舗 P と店舗 Q に、確認依頼中の連絡が1件ずつ保存されている | P の `placeId` で呼ぶ | P の連絡だけが返る。`count` は 1 | |
| 店舗 P に、`request.requestedAt` が互いに違う確認依頼中の連絡が3件保存されている。`receivedAt` の順は `requestedAt` の順と違う | P の `placeId` で呼ぶ | `request.requestedAt` の新しい順に返る | |
| 店舗 P に、`request.requestedAt` が同じで ID の違う確認依頼中の連絡が2件保存されている | P の `placeId` で呼ぶ | ID の昇順で返る | |
| 店舗 P に確認依頼中の連絡が3件保存されている | `page: 1`、`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 店舗 P に確認依頼中の連絡が5件保存されている | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| 店舗 P に確認依頼中の連絡が5件保存されている | `page: 3`、`limit: 3` で呼ぶ | `items` は空、`count` は 5 | |
| 店舗 P に確認依頼中の連絡が100件保存されている | `page: 1`、`limit: 100` で呼ぶ | `items` は100件、`count` は 100 | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 未対応の連絡が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、一方は `requestConfirmation` した連絡を、他方は `resolve` した連絡を、同時に `save` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。成功した側の状態だけが残る | |
| 連絡が保存されていない | 2つの UnitOfWork が、同じ ID の連絡を同時に `insert` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。連絡は1つだけ保存される | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 連絡が保存されていない | UnitOfWork の中で未対応の連絡を `insert` してコミットし、直後に `findById` と `findUnresolved` を呼ぶ | どちらにも、その連絡が返る。`findConfirmationRequestedByPlace` には現れない | |
| 未対応の連絡が保存されている | UnitOfWork の中で、`requestConfirmation` した連絡を `save` してコミットし、直後に `findById`・`findUnresolved`・`findConfirmationRequestedByPlace` を呼ぶ | `findById` は確認依頼中の連絡を返す。`findUnresolved` と `findConfirmationRequestedByPlace` のどちらにも、確認依頼中として現れる | |
| 確認依頼中の連絡が保存されている | UnitOfWork の中で、`resolve` した連絡を `save` してコミットし、直後に `findById`・`findUnresolved`・`findConfirmationRequestedByPlace` を呼ぶ | `findById` は対応済みの連絡を返す。`findUnresolved` と `findConfirmationRequestedByPlace` のどちらにも現れない | |
| 連絡が保存されていない | UnitOfWork の中で `insert` した後に、`fn` が例外を投げる | `findById` は `null`、`findUnresolved` にも現れない | |
| 未対応の連絡が保存されている | UnitOfWork の中で、`requestConfirmation` した連絡を `save` した後に、`fn` が例外を投げる | `findById` は、未対応の連絡と `save` の前の版を返す。`findConfirmationRequestedByPlace` に現れない | |
| 未対応の連絡 A と、連絡 B が保存されている | 1つの UnitOfWork の中で、`resolve` した A を `save` し、B と同じ ID の連絡を `insert` する | `ConflictError`。A の `save` も残らず、A は未対応のまま | |
