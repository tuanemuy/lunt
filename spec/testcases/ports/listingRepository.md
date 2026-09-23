# ListingRepository

ポートの契約は [../../domains/listing.md](../../domains/listing.md) の「ListingRepository」と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」による。掲載は、ドメインの振る舞い（`createDraft`、`publish`、`unpublish`、`endOffering`、`suspend`、`update` など）で作った値を `insert`・`save` して用意する。日付に関わるケースは、`today` に 2026-07-10 を渡す。

## insert / findById / save / delete

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 掲載がない | 下書きを `insert` し、同じ ID で `findById` する | `insert` した掲載と等しい掲載（内容、写真の順序と `framing`、提供の設定、`suspension`、`version`、`createdAt`、`updatedAt`）と、`expectedVersion` が返る | |
| 掲載がない | 公開中の掲載（`manualEnd` が `{ ended: true }`）と、一時非公開の掲載（`reason: "photoTakedown"`）と、運営による非公開の掲載を `insert` し、それぞれ `findById` する | 公開状態ごとの形（`firstPublishedAt`、`reason`、`manualEnd`、`suspendedAt`）が、`insert` した値のまま返る | |
| 掲載がない | 名称・説明・カテゴリーが `null` で、写真のない下書きを `insert` し、`findById` する | 空の項目が空のまま返る | |
| 掲載がない | 提供の設定が「設定しない」、開始日だけの提供期間、終了日だけの提供期間、複数の開催日の掲載を `insert` し、それぞれ `findById` する | 提供の設定が `insert` した値のまま返る | |
| ID が X の掲載を `insert` している | 同じ ID X の別の掲載を `insert` する | `ConflictError`。保存されている掲載は変わらない | |
| 掲載がない | 存在しない ID で `findById` する | `null` が返る | |
| 掲載を `insert` し、`findById` で `expectedVersion` を得ている | 内容を変えた掲載を、その `expectedVersion` で `save` する | 成功する。以後の `findById` は、変えた後の掲載と、新しい `expectedVersion` を返す | |
| 上の `save` が成立している | 新しい `expectedVersion` で、もう一度 `save` する | 成功する | |
| 掲載を `insert` し、`findById` で `expectedVersion` を得た後、別の `save` が成立している | 古い `expectedVersion` で `save` する | `ConflictError`。保存されている掲載は、先に成立した `save` の内容のまま | |
| 掲載を `insert` し、同じ `expectedVersion` を2つの呼び出し側が持っている | 2つの `save` を同時に行う | 一方が成功し、他方は `ConflictError`。保存されているのは成功した側の内容 | |
| 掲載がない | 存在しない ID の掲載を `save` する | `NotFoundError` | |
| 掲載を `insert` し、`findById` で `expectedVersion` を得ている | その `expectedVersion` で `delete` する | 成功する。以後の `findById` は `null` を返す | |
| 掲載を `insert` し、`findById` で `expectedVersion` を得た後、別の `save` が成立している | 古い `expectedVersion` で `delete` する | `ConflictError`。掲載は残る | |
| 掲載がない | 存在しない ID で `delete` する | `NotFoundError` | |
| 掲載を `delete` している | 同じ ID の掲載を `save` する | `NotFoundError` | |
| 店舗 A の掲載を `insert` し、`delete` している | `findByIds`、`findPageByPlace`、`countByPlace`、`findPageByCategories`、`searchForOperation` で、その掲載に当たる条件を問い合わせる | どの問い合わせにも、削除した掲載は現れない。`countByPlace` の件数にも入らない | |

## findByIds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 掲載 X、Y、Z を `insert` している | X と Z の ID で `findByIds` する | X と Z だけが返る | |
| 掲載 X を `insert` している | X の ID と、存在しない ID で `findByIds` する | X だけが返る。存在しない ID は結果に現れず、エラーにならない | |
| 掲載を `insert` している | 空の ID の並びで `findByIds` する | 空の結果が返る | |
| 下書き、一時非公開、運営による非公開の掲載を `insert` している | それらの ID で `findByIds` する | 公開状態と運営による非公開を問わず、すべて返る | |
| 掲載を100件 `insert` している | 100件の ID で `findByIds` する | 100件すべてが返る | |
| 掲載を `insert` している | 101件の ID で `findByIds` する | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## findPageByPlace

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 A に、下書き、公開中、一時非公開、運営による非公開の掲載を `insert` している。店舗 B にも掲載を `insert` している | 店舗 A、`shelf: null` で読む | 店舗 A の4件すべてが返り、`count` は4。店舗 B の掲載は返らない | |
| 店舗 A に、公開中で提供中の掲載と、公開中で提供開始前（開始日 2026-07-20）の掲載がある | `shelf: "published"` で読む | 2件とも返る | |
| 店舗 A に、下書きと、運営による非公開の下書きがある | `shelf: "draft"` で読む | 運営による非公開でない下書きだけが返る | |
| 店舗 A に、一時非公開の掲載、運営による非公開の公開中の掲載、運営による非公開の下書きがある | `shelf: "hidden"` で読む | 3件とも返る | |
| 店舗 A に、終了日 2026-06-30 の公開中の掲載、`manualEnd` が `{ ended: true }` の公開中の掲載、最後の開催日が 2026-07-09 の公開中の掲載がある | `shelf: "ended"` で読む | 3件とも返る | |
| 店舗 A に、終了日 2026-06-30 の一時非公開の掲載がある | `shelf: "ended"` と `shelf: "hidden"` で読む | `hidden` にだけ返る | |
| 店舗 A に、終了日 2026-07-15 の公開中の掲載がある | `today` に 2026-07-10 と 2026-07-16 を渡して、`shelf: "published"` と `shelf: "ended"` で読む | 2026-07-10 では `published` に、2026-07-16 では `ended` に返る | |
| 店舗 A に、`updatedAt` が古い順に X、Y、Z の掲載がある | `shelf: null` で読む | Z、Y、X の順で返る | |
| 店舗 A に、`updatedAt` が同じ掲載が2件ある | `shelf: null` で読む | ID の昇順で返る | |
| 店舗 A の掲載 X を `save` して、`updatedAt` を最も新しくした | `shelf: null` で読む | X が先頭に返る | |
| 店舗 A に掲載がない | 読む | `items` は空、`count` は0 | |
| 店舗 A に掲載が1件ある | `page: 1`、`limit: 10` で読む | 1件が返り、`count` は1 | |
| 店舗 A に掲載が3件ある | `page: 1`、`limit: 3` で読む | 3件が返り、`count` は3 | |
| 店舗 A に掲載が5件ある | `limit: 3` で、`page: 1` と `page: 2` を読む | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。`count` はどちらも5 | |
| 店舗 A に掲載が5件ある | `page: 3`、`limit: 3` で読む | `items` は空、`count` は5 | |
| 店舗 A に公開中の掲載が2件、下書きが3件ある | `shelf: "draft"`、`limit: 2` で読む | 下書きが2件返り、`count` は3（絞り込んだ後の全件数） | |

## countByPlace

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 A に、公開中で提供中が2件、提供開始前が1件、下書きが1件、一時非公開が1件、運営による非公開の公開中が1件、期日による提供終了が1件、`manualEnd` による提供終了が1件ある | `countByPlace` を読む | `published` は3、`draft` は1、`hidden` は2、`ended` は2。合計は掲載の総数8に一致する | |
| 上と同じ | 区分ごとに `findPageByPlace` を読む | 各区分の `count` が、`countByPlace` の値に一致する | |
| 店舗 A に掲載がない | `countByPlace` を読む | 4つの区分がすべて0で返る | |
| 店舗 A に、終了日 2026-07-15 の公開中の掲載がある | `today` に 2026-07-10 と 2026-07-16 を渡して読む | 2026-07-10 では `published` に、2026-07-16 では `ended` に数えられる | |
| 店舗 A と店舗 B に掲載がある | 店舗 A で読む | 店舗 B の掲載は数えられない | |

## findPageByCategories

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `categoryId` が C1 の、下書き、公開中、一時非公開、運営による非公開の掲載と、`categoryId` が C2 の掲載、`categoryId` が `null` の掲載を `insert` している | `[C1]` で読む | C1 の4件が、公開状態を問わず返る。C2 の掲載と、カテゴリーのない掲載は返らない | |
| 上と同じ | `[C1, C2]` で読む | C1 の4件と C2 の掲載が返る。カテゴリーのない掲載は返らない | |
| 台帳では C1 が廃止済みで移行先が C2。`categoryId` が C1 の掲載と C2 の掲載がある | `[C2]` で読む | 保存された `categoryId` が C2 の掲載だけが返る（`resolve` を通さない） | |
| `categoryId` が C1 の掲載と C2 の掲載が複数ある | `[C1, C2]` で読む | カテゴリーにかかわらず、ID の昇順で返る | |
| 掲載がある | 空の集合で読む | `items` は空、`count` は0 | |
| 互いに違う101個の `CategoryId` のうち1つを `categoryId` に持つ掲載がある | 101個の集合で読む | その掲載が返る（絞り込みの条件の集合は、件数に上限を持たない） | |
| `categoryId` が C1 の掲載がない | `[C1]` で読む | `items` は空、`count` は0 | |
| `categoryId` が C1 の掲載が1件ある | `page: 1`、`limit: 10` で読む | 1件が返り、`count` は1 | |
| `categoryId` が C1 の掲載が5件ある | `limit: 5` で `page: 1` を、`limit: 3` で `page: 1`・`page: 2`・`page: 3` を読む | `limit: 5` は5件。`limit: 3` は、3件、2件、空の順。`count` はどれも5 | |

## searchForOperation

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 名称に「りんご」を含む掲載、説明に「りんご」を含む掲載、どちらにも含まない掲載がある | 「りんご」で探す | 名称または説明に含む2件が返る。含まない掲載は返らない | |
| 名称に「りんご」を含む、下書き、公開中、一時非公開、運営による非公開の掲載がある | 「りんご」で探す | 4件すべてが返る | |
| 名称が「Apple Pie」の掲載がある | 「apple」と「APPLE」で探す | どちらでも返る | |
| 名称が「Apple Pie」の掲載がある | 全角の「ＡＰＰＬＥ」と、空白のない「applepie」で探す | どちらでも返る（`TextNormalization.normalize` を当てた値で比べる） | |
| 名称が「ＣＡＦＥ　ラテ」（全角の英字と全角の空白）の掲載がある | 「cafeラテ」で探す | 返る（保存された名称にも同じ正規化を当てて比べる） | |
| 名称が「ÉCLAIR」の掲載がある | 「éclair」で探す | 返る（小文字化は ASCII の外の英字にも当たる。保存先の文字列の比較の規則によらない） | |
| 名称が「青森のりんごジュース」の掲載がある | 「りんご」で探す | 部分一致で返る | |
| 名称に「りんご」を含む掲載がある | 前後に空白のある「 りんご 」で探す | 「りんご」で探した結果と同じ | |
| 掲載がある | 空のキーワードと、空白だけのキーワードで探す | どちらも `items` は空、`count` は0 | |
| 名称が `null` で、説明も `null` の掲載がある | 任意のキーワードで探す | その掲載は返らない | |
| 説明にだけ「りんご」を含む掲載 X（ID が小さい）と、名称に「りんご」を含む掲載 Y（ID が大きい）がある | 「りんご」で探す | Y、X の順で返る | |
| 名称に「りんご」を含む掲載が2件ある | 「りんご」で探す | 同順位の2件は ID の昇順で返る | |
| キーワードを含む掲載がない | 探す | `items` は空、`count` は0 | |
| キーワードを含む掲載が1件ある | `page: 1`、`limit: 10` で探す | 1件が返り、`count` は1 | |
| キーワードを含む掲載が5件ある | `limit: 5` で `page: 1` を、`limit: 3` で `page: 1`・`page: 2`・`page: 3` を読む | `limit: 5` は5件。`limit: 3` は、3件、2件、空の順で、重複も欠けもない。`count` はどれも5 | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 掲載がない | `UnitOfWorkProvider.run` の中で掲載を `insert` し、値を返してコミットする | コミットの直後から、`findById`、`findByIds`、`findPageByPlace`、`countByPlace`、`findPageByCategories`、`searchForOperation` のすべてに反映される | |
| 掲載 X を `insert` している | `run` の中で X を `save` し、コミットする | コミットの直後から、すべての問い合わせが `save` した後の内容を返す | |
| 掲載がない | `run` の中で掲載を `insert` した後に、例外を投げる | ロールバックされる。`findById` は `null` を返し、どの問い合わせにも現れない | |
| 掲載 X を `insert` している | `run` の中で X を `save` した後に、例外を投げる | ロールバックされる。`findById` は `save` の前の掲載と、前の `expectedVersion` を返す | |
| 掲載 X を `insert` している | `run` の中で X を `delete` した後に、例外を投げる | ロールバックされる。X は残り、すべての問い合わせに現れる | |
| 掲載 X と Y を `insert` している | `run` の中で X を `save` し、Y を古い `expectedVersion` で `save` する | 遅くともコミットの時点で `ConflictError` になり、X の `save` も反映されない | |
| 掲載がない | `run` の中で、同じ ID の掲載を2回 `insert` する | 遅くともコミットの時点で `ConflictError` になり、掲載は1件も残らない | |
