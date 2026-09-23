# HoldingStatusLedger

契約: [../../domains/occasion.md](../../domains/occasion.md) の `HoldingStatusLedger`。`findToObserve` はイベントの集約と記録を突き合わせるので、前提条件のイベントは `OccasionRepository.insert`・`save` で、記録は `HoldingStatusLedger.put` で組み立てる。日付は日本時間の暦日。イベントの開催期間は、断りがなければ 10/1〜10/3。

## findToObserve

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 中止でないイベント O がある。記録がない | `today: 9/30` で `findToObserve` を呼ぶ | イベント O が、`record: null` とともに返る | |
| 開催期間のない `draft` のイベント O がある。記録がない | `findToObserve` を呼ぶ | イベント O が、`record: null` とともに返る（記録のないイベントを含む） | |
| 開催期間のない `draft` のイベント O がある。`lastObserved: null` の記録を `put` した | `findToObserve` を呼ぶ | イベント O は返らない（今日の開催の状態も `null`） | |
| イベント O の記録の `lastObserved` は `upcoming` | `today: 9/30` で呼ぶ | イベント O は返らない | |
| イベント O の記録の `lastObserved` は `upcoming` | `today: 10/1` で呼ぶ | イベント O が、その記録とともに返る（今日の状態は `ongoing`） | |
| イベント O の記録の `lastObserved` は `ongoing` | `today: 10/3` で呼ぶ | イベント O は返らない（終了日は開催中に含む） | |
| イベント O の記録の `lastObserved` は `ongoing` | `today: 10/4` で呼ぶ | イベント O が、その記録とともに返る（今日の状態は `ended`） | |
| イベント O は中止中。記録の `lastObserved` は `ongoing` | `today: 10/2` で呼ぶ | イベント O が返る（今日の状態は `cancelled`） | |
| イベント O は中止中。記録の `lastObserved` は `cancelled` | `today: 10/4` で呼ぶ | イベント O は返らない（中止は日付で変わらない） | |
| イベント O の記録の `lastObserved` は `ended`。その後に `OccasionRepository.save` で開催期間を 11/1〜11/3 に更新した | `today: 10/10` で呼ぶ | イベント O が、更新後の開催期間を持つイベントと、`ended` の記録とともに返る（今日の状態は `upcoming`） | |
| イベント O の記録の `lastObserved` は `cancelled`。その後に `OccasionRepository.save` で中止を取り消した | `today: 10/2` で呼ぶ | イベント O が返る（今日の状態は `ongoing`） | |
| 開催期間を過ぎた `draft`、`unpublished`、運営による非公開のイベントが1件ずつあり、記録の `lastObserved` はどれも `ongoing` | `today: 10/4` で呼ぶ | 3件とも返る。公開状態と運営による非公開を問わない | |
| 記録と今日の状態が違うイベントが3件ある（ID は A < B < C） | `findToObserve` を呼ぶ | A、B、C の順に返る（`OccasionId` の昇順） | |
| 記録と今日の状態が違うイベントが A・B の2件ある。A の記録を今日の状態で `put` した | `page: 1` で `findToObserve` を呼ぶ | B だけが返り、`count` は 1。記録を更新したイベントは結果から外れる | |
| 記録と今日の状態が違うイベントがない | `page: 1` で呼ぶ | `items` は空で、`count` は 0 | |
| 記録と今日の状態が違うイベントが1件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は1件で、`count` は 1 | |
| 記録と今日の状態が違うイベントが10件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| 記録と今日の状態が違うイベントが11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で呼ぶ | `page: 1` は ID の昇順の先頭の10件、`page: 2` は残りの1件。どちらも `count` は 11 | |
| 記録と今日の状態が違うイベントが11件ある | `page: 3`、`limit: 10` で呼ぶ | `items` は空で、`count` は 11。エラーにならない | |

## put

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント O がある。記録がない | `lastObserved: "upcoming"` の記録を `put` し、`today` を開催期間の中にして `findToObserve` を呼ぶ | 記録が作られる。イベント O が、`lastObserved: "upcoming"` と `put` した `observedAt` を持つ記録とともに返る | |
| イベント O の記録の `lastObserved` は `upcoming` | `lastObserved: "ongoing"` の記録を `put` し、`today` を開催期間の後にして `findToObserve` を呼ぶ | 記録が置き換わる。返る記録の `lastObserved` は `ongoing`。イベント O の記録は1つ | |
| イベント O の記録がある | 版を渡さずに、続けて2回 `put` する（`ongoing`、次に `ended`） | どちらも成立し、後の `put` の内容が残る。楽観ロックの競合にならない | |
| イベント O がある。`OccasionRepository.findById` で `expectedVersion` を得ている | 記録を `put` した後、先に得た `expectedVersion` で `OccasionRepository.save` を呼ぶ | `save` が成立する。`put` はイベントの版を進めない | |
| イベント O と N の記録がある | イベント O の記録を `put` する | イベント N の記録は変わらない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 記録と今日の状態が違うイベント O がある | UnitOfWork の中で今日の状態の記録を `put` してコミットし、直後に `findToObserve` を呼ぶ | イベント O は結果から外れている | |
| 記録と今日の状態が違うイベント O がある | UnitOfWork の中で今日の状態の記録を `put` し、`collectEvents` に `occasion.ended` を渡した後、`fn` が例外を投げる | ロールバックされる。記録は `put` の前のまま（なければ、ないまま）で、`findToObserve` はイベント O を前と同じ記録とともに返す | |
| イベントがない | UnitOfWork の中で `OccasionRepository.insert` をコミットし、直後に `findToObserve` を呼ぶ | 登録したイベントが、`record: null` とともに返る | |
