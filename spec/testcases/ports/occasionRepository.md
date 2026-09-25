# OccasionRepository

契約: [../../domains/occasion.md](../../domains/occasion.md) の `OccasionRepository` と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」。書き込みも読み取りも UnitOfWork の中で行う（読み取りは書き込まない UnitOfWork）。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベントがない | `draft` のイベント（名称だけを持ち、開催期間・開催場所・写真・紹介・キャッチコピーがない）を `insert` し、`findById` で読む | 同じ内容のイベントと `expectedVersion` が返る。`null` の項目は `null` のまま返る | |
| イベントがない | `published` のイベント（すべての項目を持ち、写真3枚を順に持つ）を `insert` し、`findById` で読む | イベント情報、写真の順序、`firstPublishedAt`、`updatedAt`、版が同じ値で返る | |
| イベントがない | `unpublished`（`reason: "byManager"`）のイベントと、`unpublished`（`reason: "photoTakedown"`）で写真のないイベントを `insert` し、それぞれ `findById` で読む | `reason` と `firstPublishedAt` が同じ値で返る | |
| イベントがない | 運営による非公開（`suspended: true`）で、中止の `published` のイベントを `insert` し、`findById` で読む | 公開状態・運営による非公開・中止が、互いに独立した値として同じ内容で返る | |
| ID が X のイベントがある | ID が X の別の内容のイベントを `insert` する | `ConflictError`。保存されたイベントは変わらない | |
| イベントがない | 存在しない ID で `findById` を呼ぶ | `null` が返る | |
| ID が X のイベントがある | `findById` が返した `expectedVersion` を使って、イベント情報を置き換えたイベントを `save` し、`findById` で読む | 置き換えた内容と、振る舞いが進めた版が返る | |
| ID が X の、写真 A・B を持つ `published` のイベントがある | `Occasion.takeDownPhotos` で A を外したイベントを `save` し、`findById` で読む | 写真は B だけで、写真の並びの `takenDown` が保存した値のまま返る | |
| ID が X のイベントがある。`findById` で `expectedVersion` を得た後に、別の `save` が成立して版が進んでいる | 古い `expectedVersion` で `save` する | `ConflictError`。先に成立した `save` の内容は変わらない | |
| ID が X の中止でないイベントを、2つの要求が同じ `expectedVersion` で読んでいる | 一方が中止にしたイベントを、他方が別の変更をしたイベントを `save` する | 先の `save` が成立し、後の `save` は `ConflictError` になる | |
| イベントがない | 存在しない ID のイベントを `save` する | `NotFoundError` | |

## findByIds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `draft`、`published`、`unpublished`、運営による非公開、中止、開催期間を過ぎたイベントが1件ずつある | 6件の ID で `findByIds` を呼ぶ | 6件とも返る。公開状態・運営による非公開・開催の状態で絞り込まれない | |
| ID が X・Y のイベントがある。ID が Z のイベントはない | X・Y・Z で `findByIds` を呼ぶ | X と Y の2件だけが返る。エラーにならない | |
| イベントがある | 空の `ids` で `findByIds` を呼ぶ | 空の結果が返る | |
| イベントが100件ある | 100件の ID で `findByIds` を呼ぶ | 100件とも返る | |
| イベントがある | 101件の ID で `findByIds` を呼ぶ | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## searchForOperation

キーワードは `SearchKeyword.create` で作って渡す。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 名称が「秋のマルシェ」のイベントが、`draft`・`published`・`unpublished`・運営による非公開・中止・開催期間を過ぎた状態で1件ずつある | 「マルシェ」で `searchForOperation` を呼ぶ | 6件とも返り、`count` は 6 | |
| 名称が「Autumn Market」のイベントがある | 「autumn market」と「autumnmarket」でそれぞれ `searchForOperation` を呼ぶ | どちらも、そのイベントが返る（名称に `TextNormalization.normalize` を当てた値で比べる。小文字化と空白の除去） | |
| 名称が「秋のマルシェ」「マルシェ広場」のイベントがある | 「秋 マルシェ」で `searchForOperation` を呼ぶ | 「秋のマルシェ」だけが返る。すべての語を含むイベントだけが当たる | |
| 名称が「ＡＢＣ　フェス」（全角の英字と全角の空白）のイベントがある | 「abcフェス」で `searchForOperation` を呼ぶ | そのイベントが返る（NFKC 正規化。保存された名称にも同じ正規化を当てて比べる） | |
| 名称が「秋のマルシェ」「マルシェ広場」「マルシェ」のイベントがある | 「マルシェ」で `searchForOperation` を呼ぶ | 「マルシェ」（完全一致）、「マルシェ広場」（前方一致）、「秋のマルシェ」（部分一致）の順に返る | |
| 名称が「マルシェ」のイベントが2件ある（ID は A < B） | 「マルシェ」で `searchForOperation` を呼ぶ | A、B の順に返る（同順位は ID の昇順） | |
| 名称が「マルシェ」のイベントと、名称に「マルシェ」を含まず、キャッチコピー・紹介・開催場所の所在地のそれぞれにだけ「マルシェ」を含むイベントが3件ある | 「マルシェ」で `searchForOperation` を呼ぶ | 4件が返る。名称が「マルシェ」のイベントが先頭で、残りの3件は同順位として ID の昇順に並ぶ（`Occasion.searchableText` の `secondary`） | |
| 名称のない `draft` のイベントで、紹介に「祭」を含むものと含まないものがある | 「祭」で `searchForOperation` を呼ぶ | 紹介に「祭」を含むイベントだけが返る | |
| 名称に「マルシェ」を含むイベントがない | 「マルシェ」、`page: 1` で `searchForOperation` を呼ぶ | `items` は空で、`count` は 0 | |
| 名称に「マルシェ」を含むイベントが1件ある | 「マルシェ」、`page: 1`、`limit: 10` で `searchForOperation` を呼ぶ | `items` は1件で、`count` は 1 | |
| 名称に「マルシェ」を含むイベントが10件ある | `page: 1`、`limit: 10` で `searchForOperation` を呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| 名称に「マルシェ」を含むイベントが11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で `searchForOperation` を呼ぶ | `page: 1` は並び順の先頭の10件、`page: 2` は残りの1件。2つのページに重複も欠落もない。どちらも `count` は 11 | |
| 名称に「マルシェ」を含むイベントが11件ある | `page: 3`、`limit: 10` で `searchForOperation` を呼ぶ | `items` は空で、`count` は 11。エラーにならない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベントがない | UnitOfWork の中で「冬のマルシェ」を `insert` してコミットし、直後に `findById`・`findByIds`・`searchForOperation` を呼ぶ | 3つの問い合わせのすべてに、そのイベントが現れる | |
| 名称が「冬のマルシェ」のイベントがある | UnitOfWork の中で名称を「春のマルシェ」に置き換えて `save` してコミットし、直後に「冬」と「春」で `searchForOperation` を呼ぶ | 「冬」には当たらず、「春」に当たる | |
| イベントがない | UnitOfWork の中でイベントを `insert` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `null` を返し、`searchForOperation` にも現れない | |
| ID が X のイベントがある | UnitOfWork の中で X を `save` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `save` の前の内容と版を返す | |
| ID が X のイベントがある | 1つの UnitOfWork の中で、X の `save` と、新しいイベント Y の `insert` を行い、Y の `insert` が ID の重複で `ConflictError` になる | スコープ全体がロールバックされ、X は `save` の前の内容のまま | |
