# ApplicationReviewDesk

契約は [Application](../../domains/application.md) の「ApplicationReviewDesk」による。読み取り専用のポートで、書き込みのメソッドを持たない。前提条件は、申請を `ApplicationRepository` の `insert`・`save` で、地域・イベントの管理体制を Authority の `StewardshipRepository` の `insert`・`save` で保存して組み立てる。書き込みは UnitOfWork の中で行い、結果はコミットの後の読み取りで確かめる。

記号: 地域 X は運営者がいる。地域 Y は保存された管理体制がない。地域 Z は管理体制が保存されていて `vacant`（最後の運営者が辞任した）。イベント E は運営者がいる。イベント F は保存された管理体制がない。時刻は t1 < t2 < t3 < t4。

## region・occasion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| X への所属の申請 a1（確認中、`since` は t2）、離脱の申請 a2（確認中、`since` は t1）、所属の申請 a3（差し戻し）、所属の申請 a4（承認）、Y への所属の申請 a5（確認中）が保存されている | `{ kind: "region"; regionId: X }` で呼ぶ | a2・a1 の順（`status.since` の古い順）に返る。`count` は 2。差し戻しの a3、終わった a4、別の地域の a5 は返らない | |
| Y（管理体制がない）への所属の申請が確認中で保存されている | `{ kind: "region"; regionId: Y }` で呼ぶ | その申請が返る（運営者の有無を問わない） | |
| E への参加の申請 p1（確認中）、p2（取り下げ）、F への参加の申請 p3（確認中）が保存されている | `{ kind: "occasion"; occasionId: E }` で呼ぶ | p1 だけが返る | |
| X を対象に持つが、承認者の席が `operator` の申請はない。店舗 P の情報修正の申請が確認中で保存されている | `{ kind: "region"; regionId: X }` で呼ぶ | 情報修正の申請は返らない | |
| X への確認中の申請が2件、同じ `since` で保存されている | 呼ぶ | ID の昇順で返る | |
| X への確認中の申請がない | 呼ぶ | `items` は空、`count` は 0 | |
| 差し戻しの後に再提出された X への申請 a1（`since` は t3、`submittedAt` は t1）と、確認中の申請 a2（`since` は t2）が保存されている | 呼ぶ | a2・a1 の順（`submittedAt` ではなく `since` で並ぶ） | |

## service・asApprover

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 登録、情報修正、管理権限、掲載、掲載の修正の申請が、それぞれ確認中で保存されている | `{ kind: "service"; section: "asApprover" }` で呼ぶ | 5件が、`since` の古い順に返る | |
| 登録申請 r（確認中）と、r を参照する併せた管理権限の申請 s（確認中）が保存されている | 呼ぶ | r と s の両方が返る（登録申請がまだ承認されていない管理権限の申請を含む） | |
| Y（管理体制がない）への所属の申請、Z（`vacant`）への離脱の申請、F（管理体制がない）への参加の申請が、確認中で保存されている | 呼ぶ | 3件とも返る | |
| X（運営者がいる）への所属の申請と、E（運営者がいる）への参加の申請が、確認中で保存されている。`since` は十分に古い | 呼ぶ | どちらも返らない | |
| 情報修正の申請が、差し戻し・承認・否認・取り下げ・失効のそれぞれで保存されている | 呼ぶ | どれも返らない | |
| 承認者の席が `operator` の確認中の申請がなく、管理者不在の地域・イベントへの確認中の申請もない | 呼ぶ | `items` は空、`count` は 0 | |

## service・proxyable

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| X への所属の申請 a1（`since` は t1）、E への参加の申請 p1（`since` は t2）、X への離脱の申請 a2（`since` は t4）が、確認中で保存されている | `pendingSinceOrBefore: t3` で呼ぶ | a1・p1 の順に返る。`count` は 2。a2 は返らない | |
| X への所属の申請が、`since` が t3 ちょうどの確認中で保存されている | `pendingSinceOrBefore: t3` で呼ぶ | その申請が返る（以前を含む） | |
| Y（管理体制がない）と Z（`vacant`）への、`since` が t1 の確認中の申請が保存されている | `pendingSinceOrBefore: t3` で呼ぶ | どちらも返らない（`asApprover` に現れる） | |
| 情報修正の申請が、`since` が t1 の確認中で保存されている | `pendingSinceOrBefore: t3` で呼ぶ | 返らない | |
| X への所属の申請が、`since` が t1 の差し戻しと、`since` が t1 だった承認で保存されている | `pendingSinceOrBefore: t3` で呼ぶ | どちらも返らない | |
| X への申請が、最初の確認中（`since` は t1）から差し戻され、再提出で確認中（`since` は t4）に戻っている | `pendingSinceOrBefore: t3` で呼ぶ | 返らない（期間は再提出から数え直す） | |
| 確認中の申請が、X・Y・Z・E・F への申請と、承認者の席が `operator` の申請を含めて保存されている | `asApprover` と、十分に新しい `pendingSinceOrBefore` の `proxyable` を呼ぶ | 2つの結果に同じ申請は現れない。合わせると、確認中の申請のすべてになる | |

## 管理体制の変化

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| Y（管理体制がない）への確認中の申請が `asApprover` に現れている | Y に運営者を置く管理体制を `insert` してコミットし、`asApprover` と `proxyable`（`since` 以降の日時）を呼ぶ | `asApprover` から外れ、`proxyable` に現れる | |
| X（運営者がいる）への確認中の申請が `proxyable` に現れている | X の管理体制を `vacant` にして `save` してコミットし、両方を呼ぶ | `proxyable` から外れ、`asApprover` に現れる | |

## ページング

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `asApprover` に当たる申請が1件 | `page: 1`、`limit: 10` で呼ぶ | `items` は1件、`count` は 1 | |
| `asApprover` に当たる申請が3件 | `page: 1`、`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| `asApprover` に当たる申請が5件 | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は `since` の古い順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| `asApprover` に当たる申請が5件 | `page: 3`、`limit: 3` で呼ぶ | `items` は空、`count` は 5 | |
| `region`・`occasion`・`proxyable` のそれぞれに当たる申請が5件 | それぞれ `limit: 3` で、`page: 1`・`page: 2`・`page: 3` を呼ぶ | 上の2行と同じ | |

## 可視性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 申請が保存されていない | UnitOfWork の中で、情報修正の申請を `insert` してコミットし、直後に `asApprover` を呼ぶ | その申請が返る | |
| 確認中の申請が `asApprover` に現れている | UnitOfWork の中で、否認にした申請を `save` してコミットし、直後に呼ぶ | その申請は返らない | |
| 確認中の申請が `asApprover` に現れている | UnitOfWork の中で、差し戻しにした申請を `save` してコミットし、続けて、再提出した申請を `save` してコミットし、それぞれの直後に呼ぶ | 差し戻しの後は返らず、再提出の後は新しい `since` で返る | |
| 申請が保存されていない | UnitOfWork の中で申請を `insert` した後に、`fn` が例外を投げる。その後に呼ぶ | その申請は返らない | |
