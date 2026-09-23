# StewardshipRepository

前提条件の管理体制は、`Stewardship.vacant` に `grant`・`appointByApproval`・`invite`・`removeSteward` を適用して作る。P1、P2 は店舗、R1 は地域、O1 はイベントを指す `StewardedRef`（同じ種類の中は ID の昇順）。A、B、C は `AccountId`。`delete` を持たない。

## insert、findById

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | 管理者 A、B（就任の古い順）と、招待2件（招待の古い順）を持つ R1 の管理体制を `insert` し、`findById(R1)` | `status: "stewarded"` の管理体制を返す。管理者は A、B の順で `since` を保ち、招待は同じ順で `id`・`email`・`invitedAt` を保つ。`expectedVersion` を返す | |
| 空 | `findById(P1)` | `null` | |
| R1 の管理体制を `insert` 済み | 同じ `target`（R1）の管理体制を `insert` | `ConflictError`。保存されている管理体制は変わらない | |
| 店舗 P1 の管理体制を `insert` 済み | `kind` が `region` で、`id` の文字列が P1 と同じ `target` の管理体制を `insert` | 成功する。`target` は `kind` と `id` の組で区別する。`findById(P1)` は店舗の管理体制を返す | |
| 空 | 同じ `target` の管理体制の `insert` を、別々の UnitOfWork で同時に実行する | 一方だけが成功し、他方は `ConflictError`。その対象の管理体制は1つだけ | |

## save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 管理者 A の P1 の管理体制を `insert` 済み | 招待を加えた管理体制を `save` し、`findById(P1)` | 成功する。招待を持つ管理体制と、前と違う `expectedVersion` を返す | |
| 管理者 A だけの R1 の管理体制を `insert` 済み。招待が1件ある | A を取り除いた管理体制（`status: "vacant"`、招待は残る）を `save` し、`findById(R1)` | `status: "vacant"` の管理体制を、招待とともに返す。`null` にならない | |
| `vacant` で招待を持つ R1 の管理体制がある | 就任で `stewarded` にした管理体制を `save` し、`findById(R1)` | `status: "stewarded"` の管理体制を返す | |
| P1 の管理体制がある。`expectedVersion` V を得た後、別の `save` が成功している | V で `save` | `ConflictError`。先の `save` の内容は変わらない | |
| 管理者 A、B だけの P1 の管理体制がある | 同じ `expectedVersion` で、A を取り除いた管理体制の `save` と、B を取り除いた管理体制の `save` を、別々の UnitOfWork で同時に実行する | 一方だけが成功し、他方は `ConflictError`。保存されている管理体制は `stewarded` で、管理者は1人 | |
| 空 | `save(P1 の管理体制, expectedVersion)` | `NotFoundError` | |

## findByTargets

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| P1、R1 の管理体制を `insert` 済み | `findByTargets([P1, P2, R1])` | P1 と R1 の管理体制を返す。保存されていない P2 は結果に含まれない。並び順は問わない | |
| P1 の管理体制を `insert` 済み | `findByTargets([P1])` | P1 の管理体制の1件を返す | |
| 空 | `findByTargets([P1, R1])` | 空の結果を返す。エラーにならない | |
| `vacant` の R1 の管理体制がある | `findByTargets([R1])` | `vacant` の管理体制を返す。保存された管理体制は、状態にかかわらず返す | |
| P1 の管理体制を `insert` 済み | `findByTargets([])` | 空の結果を返す。エラーにならない | |
| 100件の対象の管理体制を `insert` 済み | 100件の対象で `findByTargets` | 100件を返す | |
| P1 の管理体制を `insert` 済み | 101件の対象で `findByTargets` | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## findPageBySteward

`pagination` を示さない操作は `{ page: 1, limit: 100 }`。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | `findPageBySteward(A)` | 空の `items` と `count: 0` を返す | |
| A が管理者の P1 の管理体制がある | `findPageBySteward(A)` | P1 の管理体制の1件と、`findById(P1)` と同じ `expectedVersion`、`count: 1` を返す | |
| A が管理者の O1、R1、P2、P1 の管理体制を、この順で `insert` 済み | `findPageBySteward(A)` | P1、P2、R1、O1 の順（`target.kind` は `place`、`region`、`occasion` の順。次に `target.id` の昇順）で返す | |
| A が管理者の P1、P2、R1、O1 の管理体制がある | `findPageBySteward(A, { page: 2, limit: 3 })` | O1 の1件と `count: 4` を返す | |
| A が管理者の P1 の管理体制がある | `findPageBySteward(A, { page: 2, limit: 100 })` | 空の `items` と `count: 1` を返す。範囲の外の `page` はエラーにならない | |
| P1 の管理者は A、B。P2 の管理者は B だけ | `findPageBySteward(A)` | P1 だけを返す。`count: 1` | |
| P1 の管理者は B。P1 に A のメールアドレス宛ての招待がある | `findPageBySteward(A)` | 空の `items` と `count: 0` を返す。招待の宛先であるだけの管理体制は含めない | |
| A が管理者だった P1 の管理体制から、A を取り除いて `save` 済み | `findPageBySteward(A)` | 空の `items` と `count: 0` を返す | |
| A が管理者の管理体制が101件ある | `findPageBySteward(A, { page: 1, limit: 100 })` と `{ page: 2, limit: 100 }` | 1ページ目は100件、2ページ目は残りの1件を返す。どちらも `count: 101`。2つのページに重複も欠けもない | |
| A が管理者の P1 の管理体制がある。`findPageBySteward(A)` で `expectedVersion` を得ている | A を取り除いた P1 の管理体制を、その `expectedVersion` で `save` | 成功する | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | UnitOfWork の中で A が管理者の P1 の管理体制を `insert` してコミットし、直後に UnitOfWork の外で `findById`・`findByTargets`・`findPageBySteward(A)` | 3つとも P1 の管理体制を返す（read-your-writes） | |
| A が管理者の P1、R1 の管理体制がある | 1つの UnitOfWork の中で、A を取り除いた P1 と R1 の管理体制を `save` してコミットする | 両方が反映される。`findPageBySteward(A)` は空の `items` を返す | |
| A が管理者の P1、R1 の管理体制がある | 1つの UnitOfWork の中で、A を取り除いた P1 と R1 の管理体制を `save` し、`fn` が例外を投げる | ロールバックされる。`findPageBySteward(A)` は P1 と R1 を、前と同じ `expectedVersion` で返す | |
| A が管理者の P1、R1 の管理体制がある。R1 の `expectedVersion` V を得た後、R1 の別の `save` が成功している | 1つの UnitOfWork の中で、A を取り除いた P1 の `save` と、V での R1 の `save` を行う | 遅くともコミットの時点で `ConflictError` になる。スコープ全体がロールバックされ、P1 の管理体制も変わらない | |
| 空 | UnitOfWork の中で P1 の管理体制を `insert` し、`fn` が例外を投げる | ロールバックされる。`findById(P1)` は `null` | |
