# ArticleRepository

契約: [../../domains/article.md](../../domains/article.md) の `ArticleRepository` と、[../../domains/index.md](../../domains/index.md) のリポジトリの共通の契約。読みものは、`Article` の振る舞い（`create`・`revise`・`publish`・`unpublish`・`takeDownPhotos`）で作った値を `insert`・`save` して用意する。書き込みも読み取りも UnitOfWork の中で行う（読み取りは書き込まない `run`）。このポートは `delete` を持たない。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 読みものがない | タイトル・本文・写真2枚・紹介先3つを持つ下書きを `insert` し、`findById` する | 同じ内容の下書きと `expectedVersion` を返す。写真の順と紹介先の順（種類と ID）が保たれる | |
| 読みものがない | タイトルも本文も `null` で、写真も紹介先もない下書きを `insert` し、`findById` する | 同じ内容の下書きを返す | |
| 読みものがない | 存在しない `ArticleId` で `findById` する | `null` を返す | |
| `insert` した下書き | `findById` の `expectedVersion` で、`publish` の結果を `save` し、`findById` する | `published` の読みものを返す。`firstPublishedAt` が保たれる | |
| 公開中の読みもの | `unpublish` の結果を `save` し、`findById` する | `unpublished` の読みものを返す。`firstPublishedAt` と `reason`（`byManager`）が保たれる | |
| 写真1枚の公開中の読みもの | `takeDownPhotos` の結果を `save` し、`findById` する | `unpublished` の読みものを返す。`reason` は `photoTakedown`。`photos.items` は空で、`photos.takenDown` が `true` のまま保たれる | |
| `insert` した読みもの | `revise` の結果を `save` し、`findById` する | 置き換えた内容を返す。`updatedAt` は `revise` の時刻 | |
| `insert` した読みもの | 同じ `ArticleId` の読みものを `insert` する | `ConflictError`。元の読みものは変わらない | |
| 読みもの A がある。一度も `insert` していない `ArticleId` の読みもの Z | A の `findById` で得た `expectedVersion` で、Z を `save` する | `NotFoundError`。A は変わらない | |
| 同じ紹介先を持つ読みものが2つ | 2つ目を `insert` する | 成功する。ID のほかに一意性はない | |
| 指す先のない紹介先を持つ読みもの | `insert` する | 成功する。紹介先の指す先があることを保存の条件にしない | |

## 楽観ロック

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 同じ読みものを2回 `findById` し、同じ `expectedVersion` を2つ得た | 1つ目で `save` を確定し、2つ目で `save` する | 2つ目は `ConflictError`。1つ目の内容が残る | |
| 編集の `revise` と、申立てによる `takeDownPhotos` が、同じ版の読みものを読んだ | `takeDownPhotos` の `save` を先に確定し、`revise` の `save` を後に確定する | `revise` の側が `ConflictError`。削除された写真は戻らない | |
| 同じ読みものの同じ `expectedVersion` で、2つの `save` を同時に実行する | 両方の完了を待つ | 片方だけが成功し、もう片方は `ConflictError` | |
| `save` を確定した読みもの | もう一度 `findById` し、新しい `expectedVersion` で `save` する | 成功する | |

## findPage

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 下書き・公開・公開の取り下げの読みものが1件ずつ | `status: null` で読む | 3件とも返す。`count` は 3 | |
| 上と同じ | `status: "draft"` で読む | 下書きだけを返す。`count` は 1 | |
| 上と同じ | `status: "published"` で読む | 公開中だけを返す。`count` は 1 | |
| 上と同じ | `status: "unpublished"` で読む | 公開の取り下げだけを返す。`count` は 1 | |
| `reason` が `byManager` と `photoTakedown` の、公開の取り下げの読みもの | `status: "unpublished"` で読む | 2件とも返す。それぞれの `reason` が保たれる | |
| 読みものが3件。`updatedAt` は T1 < T2 < T3 | `status: null` で読む | T3、T2、T1 の順に返す | |
| 読みものが2件。`updatedAt` が同じ | 読む | ID の昇順に返す | |
| 最も古い `updatedAt` の読みもの | `revise` の結果を `save` してから読む | その読みものが先頭に現れる | |
| 下書きの読みもの | `publish` の結果を `save` してから、`status: "draft"` と `status: "published"` で読む | 下書きの側に現れず、公開の側に現れる | |
| 読みものが0件 | `page: 1, limit: 10` で読む | `items` は空、`count` は 0 | |
| 読みものが1件 | `page: 1, limit: 10` で読む | `items` は1件、`count` は 1 | |
| 読みものが10件 | `page: 1, limit: 10` で読む | `items` は10件、`count` は 10 | |
| 読みものが10件 | `page: 2, limit: 10` で読む | `items` は空、`count` は 10 | |
| 読みものが11件 | `page: 1, limit: 10` と `page: 2, limit: 10` で読む | 1ページ目は新しい順の先頭10件、2ページ目は残りの1件。重なりも抜けもない。`count` はどちらも 11 | |
| 下書きが11件、公開中が2件 | `status: "published"`、`page: 1, limit: 10` で読む | `items` は2件、`count` は 2。絞り込みに合う件数だけを数える | |

## findPublishedByShowcases

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 掲載 L を紹介先に持つ公開中の読みもの X。店舗 P を紹介先に持つ公開中の読みもの Y | L だけを渡す | X だけを返す | |
| 上と同じ | L と P を渡す | X と Y を返す。`refs` のどれかを紹介先に持てば当たる | |
| 掲載 L と店舗 P の両方を紹介先に持つ公開中の読みもの X | L と P を渡す | X を1回だけ返す。`count` は 1 | |
| 掲載 L を紹介先に持つ、下書き・公開中・公開の取り下げの読みものが1件ずつ | L を渡す | 公開中の1件だけを返す。`count` は 1 | |
| ID `x` の掲載を紹介先に持つ公開中の読みもの | ID `x` の店舗を渡す | 返さない。`kind` が違えば別の対象 | |
| 地域とイベントを紹介先に持つ公開中の読みもの | その地域を渡す。別に、そのイベントを渡す | どちらも、その読みものを返す | |
| どの読みものも紹介していない対象 | その対象を渡す | `items` は空、`count` は 0 | |
| L を紹介する公開中の読みものが3件。`firstPublishedAt` は T1 < T2 < T3 | L を渡す | T3、T2、T1 の順に返す | |
| T1 に公開し、取り下げ、T4 に再び公開した読みものと、T2 に公開した読みもの。どちらも L を紹介する | L を渡す | T2 の読みものを先に返す。再び公開しても `firstPublishedAt` は T1 のまま | |
| L を紹介する公開中の読みものが2件。`firstPublishedAt` が同じ | L を渡す | ID の昇順に返す | |
| L を紹介する公開中の読みもの | `unpublish` の結果を `save` してから、L を渡す | 返さなくなる | |
| L を紹介する公開中の読みもの | L を紹介先から外す `revise` の結果を `save` してから、L を渡す | 返さなくなる | |
| 公開中の読みもの | L を紹介先に加える `revise` の結果を `save` してから、L を渡す | 返すようになる | |
| 公開中の読みものがある | 空の `refs` を渡す | `items` は空、`count` は 0 | |
| 101個の対象のうち、最後の1つだけを紹介する公開中の読みもの | 101個を渡す | その読みものを返す。`refs` の件数に上限はない | |
| L を紹介する公開中の読みものが1件 | L を渡し、`page: 1, limit: 10` で読む | `items` は1件、`count` は 1 | |
| L を紹介する公開中の読みものが10件 | L を渡し、`page: 1, limit: 10` で読む | `items` は10件、`count` は 10 | |
| L を紹介する公開中の読みものが10件 | L を渡し、`page: 2, limit: 10` で読む | `items` は空、`count` は 10 | |
| L を紹介する公開中の読みものが11件 | L を渡し、`page: 1, limit: 10` と `page: 2, limit: 10` で読む | 1ページ目は新しい順の先頭10件、2ページ目は残りの1件。重なりも抜けもない。`count` はどちらも 11 | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| UnitOfWork の中で読みものを `insert` し、コミットした | コミットの直後に `findById`・`findPage` で読む | どちらにも、即座に反映されている | |
| UnitOfWork の中で `publish` の結果を `save` し、コミットした | コミットの直後に `findPublishedByShowcases` で読む | 即座に反映されている | |
| 読みものがない | UnitOfWork の中で読みものを `insert` し、その後に例外を投げる | `findById` は `null`。`findPage` にも現れない | |
| 下書きの読みもの | UnitOfWork の中で `publish` の結果を `save` し、その後に例外を投げる | 読みものは下書きのままで、版も変わらない | |
| 写真を持つ読みもの | UnitOfWork の中で `takeDownPhotos` の結果を `save` し、下書きを `collectEvents` に渡し、その後に例外を投げる | 読みものは変わらず、ドメインイベントも残らない | |
