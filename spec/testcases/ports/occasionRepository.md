# OccasionRepository

契約: [../../domains/occasion.md](../../domains/occasion.md) の `OccasionRepository` と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」。書き込みは UnitOfWork の中で行う。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベントがない | `draft` のイベント（名称だけを持ち、開催期間・開催場所・写真・紹介・キャッチコピーがない）を `insert` し、`findById` で読む | 同じ内容のイベントと `expectedVersion` が返る。`null` の項目は `null` のまま返る | |
| イベントがない | `published` のイベント（すべての項目を持ち、写真3枚を順に持つ）を `insert` し、`findById` で読む | イベント情報、写真の順序、`firstPublishedAt`、`createdAt`・`updatedAt`、版が同じ値で返る | |
| イベントがない | `unpublished`（`reason: "byManager"`）のイベントと、`unpublished`（`reason: "photoTakedown"`）で写真のないイベントを `insert` し、それぞれ `findById` で読む | `reason` と `firstPublishedAt` が同じ値で返る | |
| イベントがない | 運営による非公開（`suspendedAt` を持つ）で、中止（`cancelledAt` を持つ）の `published` のイベントを `insert` し、`findById` で読む | 公開状態・運営による非公開・中止が、互いに独立した値として同じ内容で返る | |
| ID が X のイベントがある | ID が X の別の内容のイベントを `insert` する | `ConflictError`。保存されたイベントは変わらない | |
| イベントがない | 存在しない ID で `findById` を呼ぶ | `null` が返る | |
| ID が X のイベントがある | `findById` が返した `expectedVersion` を使って、イベント情報を置き換えたイベントを `save` し、`findById` で読む | 置き換えた内容と、進んだ版が返る | |
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

## search

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 名称が「秋のマルシェ」のイベントが、`draft`・`published`・`unpublished`・運営による非公開・中止・開催期間を過ぎた状態で1件ずつある | `keyword: "マルシェ"` で `search` を呼ぶ | 6件とも返り、`count` は 6 | |
| 名称が「Autumn Market」のイベントがある | `keyword: "autumn market"` と `keyword: "autumnmarket"` でそれぞれ `search` を呼ぶ | どちらも、そのイベントが返る（`keyword` と名称に `TextNormalization.normalize` を当てた値で比べる。小文字化と空白の除去） | |
| 名称が「ＡＢＣ　フェス」（全角の英字と全角の空白）のイベントがある | `keyword: "abcフェス"` で `search` を呼ぶ | そのイベントが返る（NFKC 正規化。保存された名称にも同じ正規化を当てて比べる） | |
| 名称が「秋のマルシェ」「マルシェ広場」「マルシェ」のイベントがある | `keyword: "マルシェ"` で `search` を呼ぶ | 「マルシェ」（完全一致）、「マルシェ広場」（前方一致）、「秋のマルシェ」（部分一致）の順に返る | |
| 名称が「マルシェ」のイベントが2件ある（ID は A < B） | `keyword: "マルシェ"` で `search` を呼ぶ | A、B の順に返る（同順位は ID の昇順） | |
| 名称のない `draft` のイベントと、名称が「夏祭り」のイベントがある | `keyword: "祭"` で `search` を呼ぶ | 「夏祭り」だけが返る。名称のないイベントは当たらない | |
| 紹介に「マルシェ」を含み、名称に含まないイベントがある | `keyword: "マルシェ"` で `search` を呼ぶ | そのイベントは返らない（名称だけを対象にする） | |
| 名称に「マルシェ」を含むイベントがない | `keyword: "マルシェ"`、`page: 1` で `search` を呼ぶ | `items` は空で、`count` は 0 | |
| 名称のあるイベントがある | `keyword: ""` と、空白だけの `keyword` でそれぞれ `search` を呼ぶ | どちらも `items` は空で、`count` は 0 | |
| 名称に「マルシェ」を含むイベントが1件ある | `keyword: "マルシェ"`、`page: 1`、`limit: 10` で `search` を呼ぶ | `items` は1件で、`count` は 1 | |
| 名称に「マルシェ」を含むイベントが10件ある | `page: 1`、`limit: 10` で `search` を呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| 名称に「マルシェ」を含むイベントが11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で `search` を呼ぶ | `page: 1` は並び順の先頭の10件、`page: 2` は残りの1件。2つのページに重複も欠落もない。どちらも `count` は 11 | |
| 名称に「マルシェ」を含むイベントが11件ある | `page: 3`、`limit: 10` で `search` を呼ぶ | `items` は空で、`count` は 11。エラーにならない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベントがない | UnitOfWork の中で「冬のマルシェ」を `insert` してコミットし、直後に `findById`・`findByIds`・`search` を呼ぶ | 3つの問い合わせのすべてに、そのイベントが現れる | |
| 名称が「冬のマルシェ」のイベントがある | UnitOfWork の中で名称を「春のマルシェ」に置き換えて `save` してコミットし、直後に `keyword: "冬"` と `keyword: "春"` で `search` を呼ぶ | 「冬」には当たらず、「春」に当たる | |
| イベントがない | UnitOfWork の中でイベントを `insert` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `null` を返し、`search` にも現れない | |
| ID が X のイベントがある | UnitOfWork の中で X を `save` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `save` の前の内容と版を返す | |
| ID が X のイベントがある | 1つの UnitOfWork の中で、X の `save` と、新しいイベント Y の `insert` を行い、Y の `insert` が ID の重複で `ConflictError` になる | スコープ全体がロールバックされ、X は `save` の前の内容のまま | |
