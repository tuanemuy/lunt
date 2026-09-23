# OfferingPhaseLedger

ポートの契約は [../../domains/listing.md](../../domains/listing.md) の「OfferingPhaseLedger」による。`findPageDrifted` は掲載の集約を読むので、前提の掲載は `ListingRepository.insert`・`save`・`delete` で、確認記録は `record`・`remove` で用意する。`today` は、断りがなければ 2026-07-10 を渡す。

## findPageDrifted

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中で提供中の掲載 X があり、確認記録がない | 読む | X が `recorded: null` で返る | |
| 公開中で提供中の掲載 X に、`phase: "available"` の確認記録がある | 読む | X は返らない | |
| 公開中の掲載 X の終了日が 2026-07-09。確認記録は `phase: "available"` | 読む | X が `recorded: "available"` で返る。`listing` は公開中の掲載の形で返る | |
| 公開中の掲載 X の `manualEnd` が `{ ended: true }`。確認記録は `phase: "available"` | 読む | X が `recorded: "available"` で返る | |
| 公開中の掲載 X の提供期間が更新されて提供中。確認記録は `phase: "ended"` | 読む | X が `recorded: "ended"` で返る | |
| 公開中の掲載 X の開始日が 2026-07-10。確認記録は `phase: "upcoming"` | 読む | X が `recorded: "upcoming"` で返る | |
| 公開中の掲載 X の終了日が 2026-07-15。確認記録は `phase: "available"` | `today` に 2026-07-10 と 2026-07-16 を渡して読む | 2026-07-10 では返らず、2026-07-16 では `recorded: "available"` で返る | |
| 下書きと一時非公開の掲載があり、確認記録がない。一時非公開の掲載のもう1件には、今日の段階と違う確認記録がある | 読む | どれも返らない | |
| 公開中の掲載 X が運営による非公開で、確認記録がない | 読む | X が返る | |
| 公開中の掲載 X に今日の段階と違う確認記録があり、X を `ListingRepository.delete` で削除している | 読む | X の記録は返らない | |
| 公開中で確認記録のない掲載が複数ある | 読む | ID の昇順で返る | |
| 公開中の掲載 X が返る状態にある | X の今日の段階を `record` してから読む | X は結果から外れる | |
| 当たる掲載がない | 読む | `items` は空、`count` は0 | |
| 当たる掲載が1件ある | `page: 1`、`limit: 10` で読む | 1件が返り、`count` は1 | |
| 当たる掲載が5件ある | `limit: 5` で `page: 1` を、`limit: 3` で `page: 1`・`page: 2`・`page: 3` を読む | `limit: 5` は5件。`limit: 3` は、3件、2件、空の順で、重複も欠けもない。`count` はどれも5 | |
| 当たる掲載が5件ある | `limit: 3` で `page: 1` を読み、返った3件を `record` し、もう一度 `page: 1` を読む | 残りの2件が返り、`count` は2 | |

## record

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中で提供中の掲載 X に確認記録がない | X の記録（`phase: "ended"`、`confirmedOn: 2026-07-10`）を `record` する | 記録が作られる。`findPageDrifted` は X を `recorded: "ended"` で返す | |
| 公開中で提供中の掲載 X に、`phase: "available"` の確認記録がある | X の記録を `phase: "ended"` で `record` する | 記録が置き換わる。掲載ごとの記録は1つのままで、`findPageDrifted` は X を `recorded: "ended"` で1回だけ返す | |
| 掲載 X を `ListingRepository.findById` で読み、`expectedVersion` を得ている | X の記録を `record` した後に、その `expectedVersion` で X を `save` する | `save` が成功する。`record` は掲載の版を進めない | |
| 掲載 X に確認記録がある | 2つの `record`（`phase: "available"` と `phase: "ended"`）を続けて行う | どちらも成功し、`ConflictError` にならない。後の `record` の値が残る | |

## remove

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中で提供中の掲載 X に、`phase: "available"` の確認記録がある | X の記録を `remove` する | 成功する。以後の `findPageDrifted` は、X を `recorded: null` で返す | |
| 掲載 X に確認記録がない | X の記録を `remove` する | 成功する。エラーにならない | |
| 掲載 X と Y に確認記録がある | X の記録を `remove` する | Y の記録は変わらない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の掲載 X に確認記録がない | `UnitOfWorkProvider.run` の中で X の今日の段階を `record` し、コミットする | コミットの直後の `findPageDrifted` から、X が外れる | |
| 公開中の掲載 X に確認記録がない | `run` の中で X の今日の段階を `record` した後に、例外を投げる | ロールバックされる。記録は残らず、`findPageDrifted` は X を `recorded: null` で返す | |
| 公開中で提供中の掲載 X に、`phase: "available"` の確認記録がある | `run` の中で X の記録を `remove` した後に、例外を投げる | ロールバックされる。記録は残り、`findPageDrifted` は X を返さない | |
| 公開中で提供中の掲載 X に、`phase: "available"` の確認記録がある | `run` の中で X を `ListingRepository.delete` で削除し、X の記録を `remove` して、コミットする | 掲載も記録も残らない。`findPageDrifted` に X は現れない | |
