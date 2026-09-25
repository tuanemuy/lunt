# HoldingStatusLedger

契約: [../../domains/occasion.md](../../domains/occasion.md) の `HoldingStatusLedger` と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」（参照整合性）「UnitOfWork ポート」。`findToObserve` はイベントの集約と記録を突き合わせるので、前提条件のイベントは `OccasionRepository.insert`・`save` で、記録は `HoldingStatusLedger.put` で組み立てる。記録の値（`lastObserved`・`observedVersion`・`nextChangeOn`）は前提条件が直接与え、ポートは開催の状態を求めない。書き込みも読み取りも UnitOfWork の中で行い、書き込みの結果はコミットの後の読み取りで確かめる。日付は日本時間の暦日。「イベントの版」は、`OccasionRepository.findById` が返すイベントの `version`。

## findToObserve

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント O がある。記録がない | `today: 9/30` で `findToObserve` を呼ぶ | イベント O が、`record: null` とともに返る | |
| 開催期間のない `draft` のイベント O がある。記録がない | `findToObserve` を呼ぶ | イベント O が、`record: null` とともに返る | |
| イベント O の記録は、`observedVersion` がイベントの版と同じで、`nextChangeOn: null` | `today: 12/31` で呼ぶ | イベント O は返らない | |
| イベント O の記録は、`observedVersion` がイベントの版と同じで、`nextChangeOn: 10/1` | `today: 9/30` で呼ぶ | イベント O は返らない | |
| イベント O の記録は、`observedVersion` がイベントの版と同じで、`nextChangeOn: 10/1` | `today: 10/1` で呼ぶ | イベント O が、その記録とともに返る（`nextChangeOn` が今日と同じ日を含む） | |
| イベント O の記録は、`observedVersion` がイベントの版と同じで、`nextChangeOn: 10/1` | `today: 10/5` で呼ぶ | イベント O が返る | |
| イベント O の記録は、`observedVersion` がイベントの版と同じで、`nextChangeOn: null`。その後に `OccasionRepository.save` でイベントを更新し、版が進んだ | `findToObserve` を呼ぶ | イベント O が、更新後のイベントと、前の記録とともに返る | |
| イベント O の記録は、`observedVersion` がイベントの版と同じで、`nextChangeOn: 11/1`。その後にイベントの版が進んだ | `today: 10/1` で呼ぶ | イベント O が返る（版の違いだけで返る） | |
| 開催期間を過ぎた `draft`、`unpublished`、運営による非公開のイベントが1件ずつあり、どれも記録がない | `findToObserve` を呼ぶ | 3件とも返る。公開状態と運営による非公開を問わない | |
| 記録がないイベントが3件ある（ID は A < B < C） | `findToObserve` を呼ぶ | A、B、C の順に返る（`OccasionId` の昇順） | |
| 記録がないイベントが A・B の2件ある | A の記録を、A の今の版と `nextChangeOn: null` で `put` し、`page: 1` で `findToObserve` を呼ぶ | B だけが返り、`count` は 1。記録を置き換えたイベントは結果から外れる | |
| どのイベントも、記録の `observedVersion` がイベントの版と同じで、`nextChangeOn` が `today` より後か `null` | `page: 1` で呼ぶ | `items` は空で、`count` は 0 | |
| 確かめ直すイベントが1件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は1件で、`count` は 1 | |
| 確かめ直すイベントが10件ある | `page: 1`、`limit: 10` で呼ぶ | `items` は10件で、`count` は 10。`page: 2` は空の `items` と `count` 10 | |
| 確かめ直すイベントが11件ある | `page: 1`、`limit: 10` と、`page: 2`、`limit: 10` で呼ぶ | `page: 1` は ID の昇順の先頭の10件、`page: 2` は残りの1件。どちらも `count` は 11 | |
| 確かめ直すイベントが11件ある | `page: 3`、`limit: 10` で呼ぶ | `items` は空で、`count` は 11。エラーにならない | |

## find

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント O がある。記録がない | イベント O で `find` を呼ぶ | `null` が返る | |
| イベント O は保存されていない。その `occasionId` の記録を `put` した | その `occasionId` で `find` を呼ぶ | `null` が返る（指すイベントのない記録は現れない） | |
| イベント O の記録を `put` した | イベント O で `find` を呼ぶ | `put` した `lastObserved`・`observedVersion`・`nextChangeOn` を持つ記録が返る | |
| イベント O と N の記録がある | イベント O の記録を `put` で置き換え、イベント O と N でそれぞれ `find` を呼ぶ | O は置き換えた記録、N は前の記録が返る | |

## put

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント O がある。記録がない | `lastObserved: "upcoming"`、イベントの版より古い `observedVersion`、`nextChangeOn: 10/1` の記録を `put` し、`findToObserve` を呼ぶ | 記録が作られる。イベント O が、`put` した `lastObserved`・`observedVersion`・`nextChangeOn` を持つ記録とともに返る | |
| イベント O の記録の `lastObserved` は `upcoming` | `lastObserved: "ongoing"` で、`observedVersion` をイベントの版より古くした記録を `put` し、`findToObserve` を呼ぶ | 記録が置き換わる。返る記録の `lastObserved` は `ongoing`。イベント O の記録は1つ | |
| イベント O の記録がある | 版を渡さずに、続けて2回 `put` する（`ongoing`、次に `ended`） | どちらも成立し、後の `put` の内容が残る。楽観ロックの競合にならない | |
| イベント O がある。`OccasionRepository.findById` で `expectedVersion` を得ている | 記録を `put` した後、先に得た `expectedVersion` で `OccasionRepository.save` を呼ぶ | `save` が成立する。`put` はイベントの版を進めない | |
| イベント O と N の記録がある | イベント O の記録を `put` する | イベント N の記録は変わらない | |
| イベント O は保存されていない | その `occasionId` の記録を `put` する | 成功する（指す先のイベントがあることをポートは確かめない）。`findToObserve` には現れない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 記録のないイベント O がある | UnitOfWork の中で、イベント O の版と `nextChangeOn: null` の記録を `put` してコミットし、直後に `findToObserve` を呼ぶ | イベント O は結果から外れている | |
| 記録のないイベント O がある | UnitOfWork の中で記録を `put` し、`collectEvents` に `occasion.ended` を渡した後、`fn` が例外を投げる | ロールバックされる。記録はないままで、`findToObserve` はイベント O を `record: null` とともに返す | |
| イベントがない | UnitOfWork の中で `OccasionRepository.insert` をコミットし、直後に `findToObserve` を呼ぶ | 登録したイベントが、`record: null` とともに返る | |
