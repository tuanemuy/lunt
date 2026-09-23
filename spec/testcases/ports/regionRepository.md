# RegionRepository

契約は [Region](../../domains/region.md) の「RegionRepository」と、[index.md](../../domains/index.md) の「リポジトリの共通の契約」「UnitOfWork ポート」による。前提条件の地域は、`Region.register` と集約の振る舞いで作り、このポートの `insert`・`save` で保存する。書き込みは UnitOfWork の中で行い、結果はコミットの後の読み取りで確かめる。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域が保存されていない | すべての項目を入力した `draft` の地域を `insert` し、`findById` で読む | 同じ地域情報（写真は同じ順序）、`draft`、運営による非公開でないこと、同じ `version`・`createdAt`・`updatedAt` の地域と、`expectedVersion` が返る | |
| 地域が保存されていない | 名称・所在地・位置・紹介・キャッチコピーが `null` で、写真が空の `draft` の地域を `insert` し、`findById` で読む | すべての項目が `null`、写真が空の地域が返る | |
| 地域が保存されていない | `findById` を呼ぶ | `null` が返る | |
| ID が同じ地域が保存されている | 同じ ID の地域を `insert` する | `ConflictError`。保存されている地域は変わらない | |
| 同じ名称の地域が保存されている | 別の ID で、同じ名称の地域を `insert` する | 成功する。2つの地域がどちらも `findById` で読める | |
| `draft` の地域が保存されている | `findById` の `expectedVersion` で、`published` にした地域を `save` し、`findById` で読む | `published`、`firstPublishedAt`、進んだ `version` が返る | |
| `published` の地域が保存されている | `unpublished`（`byManager`）にした地域を `save` し、`findById` で読む | `unpublished`、理由 `byManager`、変わらない `firstPublishedAt` が返る | |
| `published` の地域が保存されている | `unpublished`（`photoTakedown`）にした地域を `save` し、`findById` で読む | `unpublished`、理由 `photoTakedown` が返る | |
| `published` の地域が保存されている | 運営による非公開にした地域を `save` し、`findById` で読む | `published` のまま、`suspended: true` と `suspendedAt` が返る | |
| 地域が保存されている | 地域情報を置き換えた地域（写真の並び替えを含む）を `save` し、`findById` で読む | 置き換えた地域情報が、写真の順序を含めて返る | |
| 地域が保存されている。`findById` の後に、別の `save` がコミットされた | 古い `expectedVersion` で `save` する | `ConflictError`。先にコミットされた内容が残る | |
| 地域が保存されていない | その ID の地域を `save` する | `NotFoundError` | |

## findByIds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `draft`・`published`・`unpublished`・運営による非公開の地域が1つずつ保存されている | 4つの ID で `findByIds` を呼ぶ | 4つの地域がすべて返る（順序は問わない） | |
| 地域 A が保存されている。ID B の地域は保存されていない | A・B の ID で `findByIds` を呼ぶ | A だけが返る | |
| 地域が保存されている | 空の `ids` で `findByIds` を呼ぶ | 空が返る | |
| 指定する ID の地域が1つも保存されていない | `findByIds` を呼ぶ | 空が返る | |
| 100 件の地域が保存されている | 100 件の ID で `findByIds` を呼ぶ | 100 件が返る | |
| 地域が保存されている | 101 件の ID で `findByIds` を呼ぶ | `BusinessRuleError("COMMON_INVALID_INPUT")` | |

## search

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 名称が「谷中」「谷中銀座」「東京谷中」「上野」の地域が保存されている | `keyword: "谷中"` で `search` を呼ぶ | 「谷中」（完全一致）、「谷中銀座」（前方一致）、「東京谷中」（部分一致）の順に返り、`count` は 3。「上野」は返らない | |
| 名称にキーワードを含む `draft`・`published`・`unpublished`・運営による非公開の地域が保存されている | `search` を呼ぶ | 4つの地域がすべて返る | |
| 名称が「Yanaka Street」の地域が保存されている | `keyword: "yanaka"` と `keyword: "ＹＡＮＡＫＡ"` でそれぞれ `search` を呼ぶ | どちらも、その地域が返る（`keyword` と名称に `TextNormalization.normalize` を当てた値で比べる。NFKC 正規化と小文字化） | |
| 名称が「Yanaka Street」の地域と、名称が「ＹＡＮＡＫＡ　ぎんざ」（全角の英字と全角の空白）の地域が保存されている | `keyword: "yanakastreet"` と `keyword: "yanaka ぎんざ"` でそれぞれ `search` を呼ぶ | それぞれ、前の地域と後の地域が返る（空白の除去。保存された名称にも同じ正規化を当てて比べる） | |
| 名称が「ヤナカ」の地域が保存されている | `keyword: "ﾔﾅｶ"` で `search` を呼ぶ | その地域が返る | |
| 名称が同じで ID の違う地域が2つ保存されている | その名称で `search` を呼ぶ | ID の昇順で返る | |
| 名称が `null` の地域が保存されている | 任意のキーワードで `search` を呼ぶ | その地域は返らない | |
| キーワードを含む名称の地域が保存されていない | `search` を呼ぶ | `items` は空、`count` は 0 | |
| 名称のある地域が保存されている | `keyword: ""` と、空白だけの `keyword` でそれぞれ `search` を呼ぶ | どちらも `items` は空、`count` は 0 | |
| キーワードに合う地域が1件保存されている | `page: 1`、`limit: 10` で `search` を呼ぶ | `items` は1件、`count` は 1 | |
| キーワードに合う地域が3件保存されている | `page: 1`、`limit: 3` で `search` を呼ぶ | `items` は3件、`count` は 3 | |
| キーワードに合う地域が5件保存されている | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| キーワードに合う地域が5件保存されている | `page: 3`、`limit: 3` で `search` を呼ぶ | `items` は空、`count` は 5 | |
| 名称が「谷中」の地域が保存されている | 名称を「根津」に替えて `save` し、`keyword: "谷中"` と `keyword: "根津"` で `search` を呼ぶ | 「谷中」では返らず、「根津」で返る | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、違う内容を同時に `save` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。成功した側の内容だけが残る | |
| 地域が保存されていない | 2つの UnitOfWork が、同じ ID の地域を同時に `insert` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。地域は1つだけ保存される | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域が保存されていない | UnitOfWork の中で `insert` してコミットし、直後に `findById`・`findByIds`・`search` を呼ぶ | どの問い合わせにも、その地域が返る | |
| 地域が保存されている | UnitOfWork の中で `save` してコミットし、直後に `findById`・`findByIds` を呼ぶ | どちらも、保存した内容を返す | |
| 地域が保存されていない | UnitOfWork の中で `insert` した後に、`fn` が例外を投げる | `findById` は `null`、`findByIds` と `search` にも現れない | |
| 地域が保存されている | UnitOfWork の中で `save` した後に、`fn` が例外を投げる | `findById` は、`save` の前の内容と版を返す | |
| 地域 A と地域 B が保存されている | 1つの UnitOfWork の中で、A を `save` し、B と同じ ID の地域を `insert` する | `ConflictError`。A の `save` も残らず、A と B は前の内容のまま | |
