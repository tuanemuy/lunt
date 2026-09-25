# PlaceAffiliationsRepository

契約は [Region](../../domains/region.md) の「PlaceAffiliationsRepository」と、[index.md](../../domains/index.md) の「リポジトリの共通の契約」「UnitOfWork ポート」による。前提条件の集約は、`PlaceAffiliations.empty`・`affiliate`・`leave`・`exclude`・`chooseRepresentative` で作り、このポートの `insert`・`save` で保存する。書き込みも読み取りも UnitOfWork の中で行い（読み取りは書き込まない UnitOfWork）、書き込みの結果はコミットの後の読み取りで確かめる。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗の集約が保存されていない | `findById` を呼ぶ | `null` が返る | |
| 店舗の集約が保存されていない | 地域 X との所属を1つ持つ集約を `insert` し、`findById` で読む | X との所属と `affiliatedAt`、`chosenRepresentative: null`、同じ `version`・`updatedAt` の集約と、`expectedVersion` が返る | |
| 店舗の集約が保存されていない。指定する `PlaceId`・`RegionId` の店舗と地域は、どのポートにも保存されていない | その ID の集約を `insert` する | 成功する（参照先があることをポートは確かめない） | |
| 同じ `PlaceId` の集約が保存されている | 同じ `PlaceId` の集約を `insert` する | `ConflictError`。保存されている集約は変わらない | |
| X との所属を持つ集約が保存されている | `findById` の `expectedVersion` で、Y との所属を加えて Y を選んだ代表地域にした集約を `save` し、`findById` で読む | X・Y が最初に所属した順に並び、`chosenRepresentative` は Y、振る舞いが進めた `version` が返る | |
| X・Y との所属を持ち、Y を選んだ集約が保存されている | Y との所属を解除した集約を `save` し、`findById` で読む | 所属は X だけで、`chosenRepresentative` は `null` | |
| X との所属だけを持つ集約が保存されている | X との所属を解除した集約を `save` し、`findById` で読む | `null` ではなく、所属が空の集約が返る | |
| 集約が保存されている。`findById` の後に、別の `save` がコミットされた | 古い `expectedVersion` で `save` する | `ConflictError`。先にコミットされた内容が残る | |
| 店舗の集約が保存されていない | その `PlaceId` の集約を `save` する | `NotFoundError` | |

## findAffiliatedPlaces

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P が X に先に所属し、店舗 Q が X に後に所属している | X で `findAffiliatedPlaces` を呼ぶ | Q・P の順（`affiliatedAt` の降順）に返る。`count` は 2 | |
| 店舗 P と店舗 Q が、同じ `affiliatedAt` で X に所属している | X で `findAffiliatedPlaces` を呼ぶ | `PlaceId` の昇順で返る | |
| 店舗 P が X と Y に、店舗 R が Y だけに所属している | X で `findAffiliatedPlaces` を呼ぶ | P だけが返る | |
| どの店舗も X に所属していない | X で `findAffiliatedPlaces` を呼ぶ | `items` は空、`count` は 0 | |
| 1つの店舗が X に所属している | `page: 1`、`limit: 10` で呼ぶ | `items` は1件、`count` は 1 | |
| 3つの店舗が X に所属している | `page: 1`、`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 5つの店舗が X に所属している | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| 5つの店舗が X に所属している | `page: 3`、`limit: 3` で呼ぶ | `items` は空、`count` は 5 | |

## 集約との整合性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P の集約が X との所属を持つ | Y との所属を加えた集約を `save` し、Y で `findAffiliatedPlaces` を呼ぶ | P が返る | |
| 店舗 P の集約が X・Y との所属を持つ | X との所属を解除した集約を `save` し、X と Y でそれぞれ `findAffiliatedPlaces` を呼ぶ | X では P が返らず、Y では P が返る | |
| 店舗 P が X に所属した後に店舗 Q が X に所属し、その後に P が X との所属を解除され、X に再び所属した集約が保存されている | X で `findAffiliatedPlaces` を呼ぶ | P、Q の順に返り、P は1件だけ（再び所属した日時で並ぶ） | |
| 店舗 P の集約が X・Y との所属を持つ | 選んだ代表地域だけを替えた集約を `save` し、X と Y で `findAffiliatedPlaces` を呼ぶ | どちらの結果も変わらない | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗の集約が保存されていない | 2つの UnitOfWork が、同じ `PlaceId` で、X との所属を持つ集約と Y との所属を持つ集約を同時に `insert` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。成功した側の所属だけが残る | |
| X・Y との所属を持つ集約が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、X との所属の解除と、Y を選んだ代表地域にする変更を同時に `save` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。成功した側の変更だけが残る | |
| X との所属を持つ集約が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、どちらも Y との所属を加えて同時に `save` する | 一方が `ConflictError` になり、Y との所属は1つだけ保存される | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗の集約が保存されていない | UnitOfWork の中で `insert` してコミットし、直後に `findById` と `findAffiliatedPlaces` を呼ぶ | どちらにも、保存した所属が返る | |
| 集約が保存されている | UnitOfWork の中で、所属を解除した集約を `save` してコミットし、直後に `findById` と `findAffiliatedPlaces` を呼ぶ | どちらにも、解除した所属が現れない | |
| 店舗の集約が保存されていない | UnitOfWork の中で `insert` した後に、`fn` が例外を投げる | `findById` は `null`。`findAffiliatedPlaces` にも現れない | |
| X との所属を持つ集約が保存されている | UnitOfWork の中で、Y との所属を加えた集約を `save` した後に、`fn` が例外を投げる | `findById` は前の内容と版を返す。Y の `findAffiliatedPlaces` に現れない | |
| 店舗 P の集約と店舗 Q の集約が保存されている | 1つの UnitOfWork の中で、P を `save` し、Q を古い `expectedVersion` で `save` する | `ConflictError`。P の `save` も残らない | |
