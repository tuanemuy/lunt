# OverdueNoticeLedger

契約は [Application](../../domains/application.md) の「OverdueNoticeLedger」と、[index.md](../../domains/index.md) の「UnitOfWork ポート」による。`findPageDue` は `ApplicationReviewDesk` の `proxyable` に当たる申請を対象にするので、前提条件は、申請を `ApplicationRepository` の `insert`・`save` で、地域・イベントの管理体制を Authority の `StewardshipRepository` で保存し、記録をこのポートの `record` で保存して組み立てる。`record` は UnitOfWork の中で呼び、結果はコミットの後の読み取りで確かめる。

記号: 地域 X とイベント E は運営者がいる。地域 Y は保存された管理体制がない。時刻は t1 < t2 < t3 < t4。

## findPageDue

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| X への所属の申請 a1（確認中、`since` は t2）と、E への参加の申請 p1（確認中、`since` は t1）が保存されている。記録はない | `pendingSinceOrBefore: t3` で呼ぶ | p1・a1 の順（`status.since` の古い順）に、それぞれ `recorded: null` とともに返る。`count` は 2 | |
| X への確認中の申請が、`since` が t3 ちょうどで保存されている | `pendingSinceOrBefore: t3` で呼ぶ | その申請が返る | |
| X への確認中の申請が、`since` が t4 で保存されている | `pendingSinceOrBefore: t3` で呼ぶ | 返らない | |
| Y（管理体制がない）への確認中の申請（`since` は t1）と、情報修正の確認中の申請（`since` は t1）が保存されている | `pendingSinceOrBefore: t3` で呼ぶ | どちらも返らない（`proxyable` に当たらない） | |
| X への申請が、`since` が t1 の差し戻しで保存されている。X への別の申請が、`since` が t1 だった取り下げで保存されている | `pendingSinceOrBefore: t3` で呼ぶ | どちらも返らない | |
| X への確認中の申請 a1（`since` は t1）に、`pendingSince` が t1 の記録がある | `pendingSinceOrBefore: t3` で呼ぶ | a1 は返らない | |
| X への申請 a1 に、`pendingSince` が t1 の記録がある。a1 は差し戻しの後に再提出され、確認中（`since` は t2）に戻っている | `pendingSinceOrBefore: t3` で呼ぶ | a1 が、`pendingSince` が t1 の `recorded` とともに返る（記録の `pendingSince` が `status.since` と違う） | |
| 同じ `since` の、記録のない確認中の申請が2件保存されている | 呼ぶ | ID の昇順で返る | |
| 当たる申請がない | 呼ぶ | `items` は空、`count` は 0 | |
| 当たる申請が1件 | `page: 1`、`limit: 10` で呼ぶ | `items` は1件、`count` は 1 | |
| 当たる申請が3件 | `page: 1`、`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 当たる申請が5件 | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は先頭の3件、`page: 2` は残りの2件。どちらも `count` は 5 | |
| 当たる申請が5件 | `page: 3`、`limit: 3` で呼ぶ | `items` は空、`count` は 5 | |
| 当たる申請が5件 | `page: 1`、`limit: 3` で読み、返った3件をそれぞれの `since` で `record` してコミットし、もう一度 `page: 1`、`limit: 3` で読む | 2回目は残りの2件が返り、`count` は 2。もう一度、返った2件を `record` して読むと、`items` は空（結果が空になるまで `page: 1` を読む使い方が、全件を1回ずつたどる） | |

## record

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| X への確認中の申請 a1（`since` は t1）に記録がない | `{ applicationId: a1; pendingSince: t1; noticedAt: t3 }` を `record` してコミットし、`findPageDue` を呼ぶ | a1 は返らない | |
| a1 に `pendingSince` が t1 の記録がある。a1 は再提出で確認中（`since` は t2）に戻っている | `{ applicationId: a1; pendingSince: t2; noticedAt: t4 }` を `record` してコミットし、`findPageDue`（`pendingSinceOrBefore: t3`）を呼ぶ | a1 は返らない（記録は置き換わり、申請ごとに1つ） | |
| a1 に `pendingSince` が t2 の記録がある。a1 の `since` は t2 | `pendingSince` が t1 の記録を `record` してコミットし、`findPageDue` を呼ぶ | a1 が、`pendingSince` が t1 の `recorded` とともに返る（前の記録は残らない） | |
| a1 が版 v で保存されている | a1 の記録を `record` してコミットし、`ApplicationRepository.findById` で a1 を読む | a1 の `version` と `updatedAt` は変わらない。読む前に得た `expectedVersion` で a1 を `save` できる | |
| a1 に記録がない | 2つの UnitOfWork が、a1 の記録を同時に `record` する | どちらも成功する（楽観ロックを持たない）。記録は1つだけ残り、a1 は `findPageDue` に返らない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| a1 が `findPageDue` に現れている | UnitOfWork の中で `record` してコミットし、直後に `findPageDue` を呼ぶ | a1 は返らない | |
| a1 が `findPageDue` に現れている | UnitOfWork の中で `record` した後に、`fn` が例外を投げる。その後に `findPageDue` を呼ぶ | a1 が `recorded: null` とともに返る（記録は1件も残らない） | |
| a1 に `pendingSince` が t1 の記録がある。a1 は再提出で確認中（`since` は t2）に戻っている | UnitOfWork の中で、`pendingSince` が t2 の記録を `record` した後に、`fn` が例外を投げる。その後に `findPageDue` を呼ぶ | a1 が、`pendingSince` が t1 の `recorded` とともに返る | |
| a1 が `findPageDue` に現れている | UnitOfWork の中で、`record` と `collectEvents`（`application.review_overdue`）を行った後に、`fn` が例外を投げる | 記録もドメインイベントも残らない | |
| X への確認中の申請 a1（`since` は t1、記録なし）が `findPageDue` に現れている | UnitOfWork の中で、a1 を否認にして `save` してコミットし、直後に `findPageDue` を呼ぶ | a1 は返らない | |
