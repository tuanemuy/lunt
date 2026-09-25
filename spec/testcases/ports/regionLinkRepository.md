# RegionLinkRepository

契約: [../../domains/occasion.md](../../domains/occasion.md) の `RegionLinkRepository` と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」。集約の ID はイベントと地域の組（`RegionLinkKey`）。書き込みも読み取りも UnitOfWork の中で行う（読み取りは書き込まない UnitOfWork）。参照先のイベントと地域があることはポートが確かめないので、前提条件は関連づけの `insert`・`save` だけで組み立てる。

## insert・findById・save・delete

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 関連づけがない | イベント O と地域 R の組の `linked` の関連づけを `insert` し、`findById` で読む | 同じ内容（`status: "linked"`、`linkedAt`、`updatedAt`、版）の関連づけと `expectedVersion` が返る | |
| イベント O と地域 R の組の `linked` の関連づけがある | 同じ組の関連づけを `insert` する | `ConflictError`。保存された関連づけは変わらない | |
| イベント O と地域 R の組の `detached` の関連づけがある | 同じ組の `linked` の関連づけを `insert` する | `ConflictError`。関連づけは `detached` のまま残る | |
| イベント O と地域 R の組の関連づけがある | イベント O と地域 S の組、イベント N と地域 R の組の関連づけを `insert` する | どちらも成立する。一意性は組に対して働く | |
| イベント O と地域 R の組に関連づけがない。2つの要求が同時に同じ組の関連づけを `insert` する | 両方をコミットする | 一方が成立し、他方は遅くともコミットの時点で `ConflictError` になる。組の関連づけは1つ | |
| 関連づけがない | 関連づけのない組で `findById` を呼ぶ | `null` が返る | |
| イベント O と地域 R の組の `linked` の関連づけがある | `findById` が返した `expectedVersion` を使って、`detached` にした関連づけを `save` し、`findById` で読む | `status: "detached"`、変わらない `linkedAt`、振る舞いが進めた版が返る | |
| イベント O と地域 R の組の `detached` の関連づけがある | `linked` に戻した関連づけを `save` し、`findById` で読む | `status: "linked"` で返る。`linkedAt` は変わらない | |
| 2つの要求が、同じ `linked` の関連づけを同じ `expectedVersion` で読んでいる | 先に `delete`（関連づけを外す）を確定し、後から `detached` にして `save`（解除）する | `delete` が成立し、`save` は `NotFoundError` になる（削除済みは、版にかかわらず `NotFoundError`） | |
| 2つの要求が、同じ `linked` の関連づけを同じ `expectedVersion` で読んでいる | 先に `detached` にして `save`（解除）を確定し、後から `delete`（関連づけを外す）する | `save` が成立し、`delete` は `ConflictError` になる。関連づけは `detached` で残る | |
| 関連づけを `findById` で読んだ後に、別の `save` が成立して版が進んでいる | 古い `expectedVersion` で `save` する | `ConflictError`。先に成立した内容は変わらない | |
| 関連づけがない | 関連づけのない組の関連づけを `save` する | `NotFoundError` | |
| イベント O と地域 R の組の `linked` の関連づけがある | `findById` が返した `expectedVersion` で `delete` し、`findById` で読む | `null` が返る。`findByOccasion`・`findByRegion` にも現れない | |
| 関連づけを `delete` した後 | 同じ組の関連づけを、新しい `linkedAt` で `insert` する | 成立する | |
| 関連づけを `findById` で読んだ後に、別の `save` が成立して版が進んでいる | 古い `expectedVersion` で `delete` する | `ConflictError`。関連づけは残る | |
| 関連づけがない | 関連づけのない組を `delete` する | `NotFoundError` | |

## findByOccasion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント O に、地域 R（`linkedAt` が古い。`linked`）、地域 S（新しい。`detached`）の関連づけがある。イベント N に地域 T の関連づけがある | イベント O で `findByOccasion` を呼ぶ | R、S の順（`linkedAt` の昇順）に2件が返り、`count` は 2。`linked` と `detached` の両方を含む。地域 T の関連づけは含まれない | |
| イベント O に、同じ `linkedAt` の地域 A・B（`RegionId` は A < B）の関連づけがある | イベント O で `findByOccasion` を呼ぶ | A、B の順に返る（同順位は `RegionId` の昇順） | |
| イベント O に関連づけがない | `page: 1` で `findByOccasion` を呼ぶ | `items` は空で、`count` は 0 | |
| イベント O に関連づけが1件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は1件で、`count` は 1 | |
| イベント O に関連づけが10件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| イベント O に関連づけが11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で呼ぶ | `page: 1` は並び順の先頭の10件、`page: 2` は残りの1件。重複も欠落もない。どちらも `count` は 11 | |
| イベント O に関連づけが11件ある | `page: 3`、`limit: 10` で呼ぶ | `items` は空で、`count` は 11。エラーにならない | |

## findByRegion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域 R に、イベント M（`linkedAt` が古い。`linked`）、イベント N（新しい。`detached`）の関連づけがある。地域 S にイベント M の関連づけがある | 地域 R で `findByRegion` を呼ぶ | N、M の順（`linkedAt` の降順）に2件が返り、`count` は 2。`linked` と `detached` の両方を含む。地域 S の関連づけは含まれない | |
| 地域 R のイベント N との関連づけを `detached` から `linked` に戻して `save` した | 地域 R で `findByRegion` を呼ぶ | イベント N の関連づけが `linked` で返る。並び順は N、M のまま（並び順の基準の `linkedAt` は最初の値のまま） | |
| 地域 R に、同じ `linkedAt` のイベント A・B（`OccasionId` は A < B）の関連づけがある | 地域 R で `findByRegion` を呼ぶ | A、B の順に返る（同順位は `OccasionId` の昇順） | |
| 地域 R に関連づけがない | `page: 1` で `findByRegion` を呼ぶ | `items` は空で、`count` は 0 | |
| 地域 R に関連づけが1件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は1件で、`count` は 1 | |
| 地域 R に関連づけが10件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| 地域 R に関連づけが11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で呼ぶ | `page: 1` は並び順の先頭の10件、`page: 2` は残りの1件。重複も欠落もない。どちらも `count` は 11 | |
| 地域 R に関連づけが11件ある | `page: 3`、`limit: 10` で呼ぶ | `items` は空で、`count` は 11 | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 関連づけがない | UnitOfWork の中で関連づけを `insert` してコミットし、直後に `findById`・`findByOccasion`・`findByRegion` を呼ぶ | 3つの問い合わせのすべてに、その関連づけが現れる | |
| `linked` の関連づけがある | UnitOfWork の中で `detached` にして `save` してコミットし、直後に `findByRegion` と `findByOccasion` を呼ぶ | どちらにも、`detached` の関連づけとして返る | |
| 関連づけがない | UnitOfWork の中で関連づけを `insert` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `null` を返し、`findByOccasion`・`findByRegion` にも現れない | |
| `linked` の関連づけがある | UnitOfWork の中で `delete` した後、`fn` が例外を投げる | ロールバックされる。`findById` は `delete` の前の関連づけと版を返す | |
