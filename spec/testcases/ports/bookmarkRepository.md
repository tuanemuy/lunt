# BookmarkRepository

契約: [../../domains/bookmark.md](../../domains/bookmark.md) の `BookmarkRepository`。保存は `Bookmark.create` で作った値を `add`・`addAll` して用意する。書き込みも読み取りも UnitOfWork の中で行う（読み取りは書き込まない `run`）。どの操作も `ConflictError` と `NotFoundError` を返さない。

## add

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| アカウント A の保存がない | A の掲載 L の保存（`savedAt` は T1）を `add` する | 成功する。`findByAccount` が L の保存を `savedAt` T1 で返し、`findSavedTargets` が L を返す | |
| A の掲載 L の保存（T1）がある | A の掲載 L の保存（T2）を `add` する | 成功する。保存は1つのままで、`savedAt` は T1 のまま。`count` は増えない | |
| A の保存がない | 同じ ID を持つ掲載の保存と店舗の保存を `add` する | 2つの別の保存になる。`target.kind` が違えば別の対象 | |
| A の掲載 L の保存がある | アカウント B の掲載 L の保存を `add` する | 成功する。A と B がそれぞれ L の保存を持つ | |
| A の保存がない | A の掲載 L の保存の `add` を、2つの UnitOfWork で同時に実行する | どちらも成功する。保存は1つになる | |
| 指す先のない `ListingId` の保存 | `add` する | 成功する。対象があることを保存の条件にしない | |

## addAll

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の保存がない | 掲載 L（T1）と店舗 P（T2）の保存を `addAll` する | 成功する。2つとも、それぞれの `savedAt` で加わる | |
| A の掲載 L の保存（T0）がある | 掲載 L（T1）と掲載 M（T2）の保存を `addAll` する | 成功する。L は `savedAt` T0 のまま、M が T2 で加わる。`count` は 2 | |
| A の保存がある | 空の一覧を `addAll` する | 成功する。何も変わらない | |
| A の保存がない | 1件の一覧を `addAll` する | 成功する。1件が加わる | |
| A の保存がない | 互いに違う対象の101件の一覧を `addAll` する | 成功する。101件が加わる。件数の上限を持たない | |
| A の保存がない | 同じ一覧を、2回続けて `addAll` する | どちらも成功する。結果は1回目と同じ | |
| A の保存がない | UnitOfWork の中で3件を `addAll` し、その後に例外を投げる | `findByAccount` は空。1件も残らない | |

## remove・removeAllByAccount

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の掲載 L と店舗 P の保存がある | A の L を `remove` する | 成功する。L の保存がなくなり、P の保存は残る | |
| A の保存に掲載 L がない | A の L を `remove` する | 成功する。何も変わらない | |
| A と B が掲載 L の保存を持つ | A の L を `remove` する | A の保存だけがなくなる。B の保存は残る | |
| 同じ ID を持つ掲載の保存と店舗の保存がある | 掲載の側を `remove` する | 店舗の保存は残る | |
| A の L の保存（T1）を `remove` した | A の L の保存（T2）を `add` する | 新しい保存になり、`savedAt` は T2 | |
| A が3件、B が2件の保存を持つ | A で `removeAllByAccount` する | A の保存が0件になる。B の2件は残る | |
| A の保存がない | A で `removeAllByAccount` する | 成功する。何も変わらない | |
| A の保存を `removeAllByAccount` で削除した | もう一度 A で `removeAllByAccount` する | 成功する。何も変わらない | |

## findByAccount

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の保存が3件。`savedAt` は T1 < T2 < T3 | 読む | T3、T2、T1 の順に返す | |
| A の保存に、`savedAt` が同じ掲載と店舗 | 読む | `target.kind` の昇順（`listing`、`place` の順）に返す | |
| A の保存に、`savedAt` が同じ掲載が2件 | 読む | `target.id` の昇順に返す | |
| A と B が保存を持つ | A で読む | A の保存だけを返す。`count` は A の件数 | |
| A の保存に、指す先のない対象の保存がある | 読む | その保存も返す。対象が閲覧できるかどうかで絞らない | |
| 返された保存 | 内容を確かめる | `accountId`・`target`（種類と ID）・`savedAt` が、`add` した値のまま | |
| A の保存が0件 | `page: 1, limit: 10` で読む | `items` は空、`count` は 0 | |
| A の保存が1件 | `page: 1, limit: 10` で読む | `items` は1件、`count` は 1 | |
| A の保存が10件 | `page: 1, limit: 10` で読む | `items` は10件、`count` は 10 | |
| A の保存が10件 | `page: 2, limit: 10` で読む | `items` は空、`count` は 10 | |
| A の保存が11件 | `page: 1, limit: 10` と `page: 2, limit: 10` で読む | 1ページ目は新しい順の先頭10件、2ページ目は最も古い1件。重なりも抜けもない。`count` はどちらも 11 | |

## findSavedTargets

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A が掲載 L と店舗 P を保存している。掲載 M は保存していない | L・M・P を渡す | L と P を返す。順序は問わない | |
| A が何も保存していない | L を渡す | 空の一覧を返す | |
| A が掲載 L を保存している | 空の一覧を渡す | 空の一覧を返す | |
| A が掲載 L を保存している | L だけを渡す | L を返す | |
| A が ID `x` の掲載を保存している。ID `x` の店舗は保存していない | ID `x` の掲載と店舗を渡す | 掲載だけを返す | |
| B が掲載 L を保存している。A は保存していない | A で L を渡す | 空の一覧を返す | |
| A が100件の対象を保存している | その100件を渡す | 100件とも返す | |
| A が掲載 L を保存している | 保存していない対象を100件渡す | 空の一覧を返す | |
| A が掲載 L を保存している | L を含む101件の対象を渡す | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の掲載 L の保存がある | L の `remove` を確定し、その後に L の `add` を確定する | どちらも成功する。L の保存がある | |
| A の掲載 L の保存がある | L の `add` を確定し、その後に L の `remove` を確定する | どちらも成功する。L の保存はない | |
| A の掲載 L の保存がある | L の `remove` と L の `add` を、2つの UnitOfWork で同時に実行する | どちらも成功し、`ConflictError` にならない。結果は、保存が1つあるか、ないかのどちらか | |
| A の掲載 L の保存がある | L の `remove` を、2つの UnitOfWork で同時に実行する | どちらも成功する。L の保存はない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| UnitOfWork の中で `add` し、コミットした | コミットの直後に `findByAccount`・`findSavedTargets` で読む | どちらにも、即座に反映されている | |
| UnitOfWork の中で `remove` し、コミットした | コミットの直後に `findByAccount`・`findSavedTargets` で読む | どちらにも、即座に反映されている | |
| A の保存がない | UnitOfWork の中で `add` し、その後に例外を投げる | `findByAccount` は空 | |
| A の掲載 L の保存がある | UnitOfWork の中で `remove` し、その後に例外を投げる | L の保存は残る | |
| A の保存が3件 | UnitOfWork の中で `removeAllByAccount` し、その後に例外を投げる | 3件とも残る | |
