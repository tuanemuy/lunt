# ParticipationRepository

契約: [../../domains/occasion.md](../../domains/occasion.md) の `ParticipationRepository` と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」。集約の ID はイベントと店舗の組（`ParticipationKey`）。書き込みは UnitOfWork の中で行う。参照先のイベント・店舗・掲載があることはポートが確かめないので、前提条件は参加の `insert` だけで組み立てる。

## insert・findById・save・delete

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 参加がない | イベント O と店舗 P の組の参加（添えた掲載 L2・L1 の順、参加日 10/1・10/2）を `insert` し、`findById` で読む | 同じ内容の参加と `expectedVersion` が返る。添えた掲載の順序、参加日、`participatedAt`、`updatedAt`、版が同じ値で返る | |
| 参加がない | 添えた掲載も参加日も空の参加を `insert` し、`findById` で読む | 空の並びのまま返る | |
| イベント O と店舗 P の組の参加がある | 同じ組の参加を `insert` する | `ConflictError`。保存された参加は変わらない | |
| イベント O と店舗 P の組の参加がある | イベント O と店舗 Q の組、イベント N と店舗 P の組の参加を `insert` する | どちらも成立する。一意性は組に対して働く | |
| イベント O と店舗 P の組に参加がない。2つの要求が同時に同じ組の参加を `insert` する | 両方をコミットする | 一方が成立し、他方は遅くともコミットの時点で `ConflictError` になる。組の参加は1つ | |
| 参加がない | 参加のない組で `findById` を呼ぶ | `null` が返る | |
| イベント O と店舗 P の組の参加がある | `findById` が返した `expectedVersion` を使って、参加内容を置き換えた参加を `save` し、`findById` で読む | 置き換えた内容と、進んだ版が返る | |
| 2つの要求が、同じ参加を同じ `expectedVersion` で読んでいる | 両方が参加内容を置き換えて `save` する | 先の `save` が成立し、後の `save` は `ConflictError` になる | |
| 参加がない | 参加のない組の参加を `save` する | `NotFoundError` | |
| イベント O と店舗 P の組の参加がある | `findById` が返した `expectedVersion` で `delete` し、`findById` で読む | `null` が返る。`findByOccasion`・`findByPlace` にも現れない | |
| 参加を `delete` した後 | 同じ組の参加を、新しい `participatedAt` で `insert` する | 成立する。新しい参加として読める | |
| 2つの要求が、同じ参加を同じ `expectedVersion` で読んでいる | 両方が `delete` する | 先の `delete` が成立し、後の `delete` は `NotFoundError` になる（削除済みは、版にかかわらず `NotFoundError`） | |
| 参加を `findById` で読んだ後に、別の `save` が成立して版が進んでいる | 古い `expectedVersion` で `delete` する | `ConflictError`。参加は残る | |
| 参加がない | 参加のない組を `delete` する | `NotFoundError` | |

## findByOccasion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント O に、店舗 P（`participatedAt` が古い）、店舗 Q（新しい）が参加中。イベント N に店舗 R が参加中 | イベント O で `findByOccasion` を呼ぶ | Q、P の順（`participatedAt` の降順）に2件が返り、`count` は 2。店舗 R の参加は含まれない | |
| イベント O に、同じ `participatedAt` の店舗 A・B（`PlaceId` は A < B）が参加中 | イベント O で `findByOccasion` を呼ぶ | A、B の順に返る（同順位は `PlaceId` の昇順） | |
| イベント O に参加がない | `page: 1` で `findByOccasion` を呼ぶ | `items` は空で、`count` は 0 | |
| イベント O に参加が1件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は1件で、`count` は 1 | |
| イベント O に参加が10件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| イベント O に参加が11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で呼ぶ | `page: 1` は並び順の先頭の10件、`page: 2` は残りの1件。重複も欠落もない。どちらも `count` は 11 | |
| イベント O に参加が11件ある | `page: 3`、`limit: 10` で呼ぶ | `items` は空で、`count` は 11。エラーにならない | |

## findByPlace

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P が、イベント M（`participatedAt` が古い）、イベント N（新しい）に参加中。店舗 Q がイベント M に参加中 | 店舗 P で `findByPlace` を呼ぶ | N、M の順（`participatedAt` の降順）に2件が返り、`count` は 2。店舗 Q の参加は含まれない | |
| 店舗 P が、同じ `participatedAt` のイベント A・B（`OccasionId` は A < B）に参加中 | 店舗 P で `findByPlace` を呼ぶ | A、B の順に返る（同順位は `OccasionId` の昇順） | |
| 店舗 P に参加がない | `page: 1` で `findByPlace` を呼ぶ | `items` は空で、`count` は 0 | |
| 店舗 P に参加が1件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は1件で、`count` は 1 | |
| 店舗 P に参加が10件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| 店舗 P に参加が11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で呼ぶ | `page: 1` は並び順の先頭の10件、`page: 2` は残りの1件。重複も欠落もない。どちらも `count` は 11 | |
| 店舗 P に参加が11件ある | `page: 3`、`limit: 10` で呼ぶ | `items` は空で、`count` は 11 | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 参加がない | UnitOfWork の中で参加を `insert` してコミットし、直後に `findById`・`findByOccasion`・`findByPlace` を呼ぶ | 3つの問い合わせのすべてに、その参加が現れる | |
| 参加がある | UnitOfWork の中で参加内容を置き換えて `save` してコミットし、直後に `findByOccasion` を呼ぶ | 置き換えた参加内容が返る | |
| 参加がない | UnitOfWork の中で参加を `insert` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `null` を返し、`findByOccasion`・`findByPlace` にも現れない | |
| 参加がある | UnitOfWork の中で参加を `delete` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `delete` の前の参加と版を返す | |
