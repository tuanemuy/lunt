# OverdueNoticeLedger

契約は [Application](../../domains/application.md) の「OverdueNoticeLedger」と、[index.md](../../domains/index.md) の「リポジトリの共通の契約」「UnitOfWork ポート」による。前提条件の記録は、記録が指す申請を `ApplicationRepository.insert` で保存したうえで、このポートの `record` で保存する。`record` は UnitOfWork の中で呼び、結果はコミットの後に、読み取りだけの `run` の中で `findByApplicationIds` を呼んで確かめる。

記号: 申請 a1・a2・a3 は `ApplicationRepository` に保存されている。a9 はどの申請の ID でもない。時刻は t1 < t2。

## findByApplicationIds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 記録がない | a1 で呼ぶ | 空の配列が返る | |
| a1 に `pendingSince` が t1 の記録、a2 に `pendingSince` が t2 の記録がある。a3 に記録はない | a1・a2・a3 で呼ぶ | a1（t1）と a2（t2）の記録が返る。a3 は結果に現れない | |
| a1 に記録がある | 空の配列で呼ぶ | 空の配列が返る | |
| 100件の申請 ID に記録がある | 100件の ID で呼ぶ | 100件の記録が返る | |
| a9 の記録を `record` した（下の「record」） | a9 で呼ぶ | 空の配列が返る（指す申請のない記録は結果に現れない） | |
| — | 101件の ID で呼ぶ | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## record

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| a1 に記録がない | `{ applicationId: a1; pendingSince: t1 }` を `record` してコミットし、a1 で `findByApplicationIds` を呼ぶ | `pendingSince` が t1 の記録が1つ返る | |
| a9 の申請は保存されていない | `{ applicationId: a9; pendingSince: t1 }` を `record` してコミットする | 成功する（記録が指す申請があることをポートは確かめない） | |
| a1 に `pendingSince` が t1 の記録がある | `{ applicationId: a1; pendingSince: t2 }` を `record` してコミットし、a1 で呼ぶ | `pendingSince` が t2 の記録が1つだけ返る（記録は置き換わり、申請ごとに1つ） | |
| a1 に `pendingSince` が t2 の記録がある | `pendingSince` が t1 の記録を `record` してコミットし、a1 で呼ぶ | `pendingSince` が t1 の記録が1つだけ返る（前の記録は残らない） | |
| 申請 a1 が `ApplicationRepository` に版 v で保存されている | a1 の記録を `record` してコミットし、`ApplicationRepository.findById` で a1 を読む | a1 の `version` は変わらない。読む前に得た `expectedVersion` で a1 を `save` できる | |
| a1 に記録がない | 2つの UnitOfWork が、a1 の記録を同時に `record` する | どちらも成功する（楽観ロックを持たない）。a1 で呼ぶと、記録が1つだけ返る | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| a1 に記録がない | UnitOfWork の中で a1 の記録を `record` してコミットし、直後に a1 で呼ぶ | その記録が返る | |
| a1 に記録がない | UnitOfWork の中で a1 の記録を `record` した後に、`fn` が例外を投げる。その後に a1 で呼ぶ | 空の配列が返る（記録は残らない） | |
| a1 に `pendingSince` が t1 の記録がある | UnitOfWork の中で、`pendingSince` が t2 の記録を `record` した後に、`fn` が例外を投げる。その後に a1 で呼ぶ | `pendingSince` が t1 の記録が返る | |
| a1 に記録がない | UnitOfWork の中で、`record` と `collectEvents`（`application.review_period_elapsed`）を行った後に、`fn` が例外を投げる | 記録もドメインイベントも残らない | |
