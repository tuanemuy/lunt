# ApplicationRepository

契約は [Application](../../domains/application.md) の「ApplicationRepository」と、[index.md](../../domains/index.md) の「リポジトリの共通の契約」「UnitOfWork ポート」による。前提条件の申請は、`Application.submit`・`sendBack`・`resubmit`・`approve`・`reject`・`withdraw`・`reassess` で作り、このポートの `insert`・`save` で保存する。書き込みは UnitOfWork の中で行い、結果はコミットの後の読み取りで確かめる。

記号: 個人 A・B、店舗 P・Q、地域 X・Y、イベント E、掲載 L。「所属の申請（P→X、店舗として）」は、申請者が店舗 P の、P と X の所属の申請。

## insert・findById・save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 申請が保存されていない | `findById` を呼ぶ | `null` が返る | |
| 申請が保存されていない | A の情報修正の申請（P）を `insert` し、`findById` で読む | 対象の指定（種類、申請者、対象の ID）、内容、補足、確認中の状態（`since`、`answering: null`）、`submittedAt`、同じ `version`・`updatedAt` の申請と、`expectedVersion` が返る | |
| 申請が保存されていない | 8種の申請（登録、情報修正、管理権限、併せた管理権限、所属、離脱、参加、掲載、掲載の修正）をそれぞれ `insert` し、`findById` で読む | どの種類も、`insert` した内容と等しい申請が返る（対象の指定の `registrationId`、予約した `reservedPlaceId`・`reservedListingId`、掲載の修正の `placeId`、写真の並び、見せる範囲、参加日を含む） | |
| 申請が保存されていない。内容が指す店舗・地域・イベント・掲載・登録申請は、どのポートにも保存されていない | その申請を `insert` する | 成功する（参照先があることをポートは確かめない） | |
| 同じ `ApplicationId` の申請が保存されている | 同じ ID の申請を `insert` する | `ConflictError`。保存されている申請は変わらない | |
| 確認中の申請が保存されている | `findById` の `expectedVersion` で、差し戻しにした申請を `save` し、`findById` で読む | 差し戻しの状態（`request`、`decision` の `by` と `at`）と、進んだ `version` が返る | |
| 差し戻しの申請が保存されている | 内容と補足を置き換えて再提出した申請を `save` し、`findById` で読む | 新しい内容と補足、確認中の状態（新しい `since`、`answering` は前の `request`）が返る。`submittedAt` は変わらない | |
| 確認中の申請が保存されている | 承認、否認、取り下げ、失効にした申請をそれぞれ `save` し、`findById` で読む | それぞれの状態（`decision` と `capacity`、`reason`、`withdrawnAt`、`lapsedAt` と `brokenPremises`）が返る | |
| 確認中の申請が保存されている。`findById` の後に、別の `save` がコミットされた | 古い `expectedVersion` で `save` する | `ConflictError`。先にコミットされた内容が残る | |
| 申請が保存されていない | その ID の申請を `save` する | `NotFoundError` | |
| — | ポートの型を確かめる | `delete` を持たない | |

## 枠の一意性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の情報修正の申請（P）が確認中で保存されている | A の情報修正の申請（P）を、別の ID で `insert` する | `ConflictError`。前の申請は変わらず、新しい申請は保存されない | |
| A の情報修正の申請（P）が差し戻しで保存されている | A の情報修正の申請（P）を、別の ID で `insert` する | `ConflictError` | |
| A の情報修正の申請（P）が確認中で保存されている | B の情報修正の申請（P）を `insert` する | 成功する（別の申請者の枠は別の枠） | |
| A の情報修正の申請（P）が確認中で保存されている | A の情報修正の申請（Q）と、A の管理権限の申請（P）を `insert` する | どちらも成功する（対象または種類が違う枠は別の枠） | |
| 所属の申請（P→X、店舗として）が確認中で保存されている | 所属の申請（P→X、店舗として）を、別の ID で `insert` する | `ConflictError`（店舗を1人の申請者として数える） | |
| 所属の申請（P→X、店舗として）が確認中で保存されている | 所属の申請（P→Y、店舗として）、離脱の申請（P→X、店舗として）、A が個人として行う所属の申請（P→X）を `insert` する | どれも成功する | |
| A の登録申請 r に併せた管理権限の申請（`placeId` は P）が確認中で保存されている | 登録申請を参照しない、A の管理権限の申請（P）を `insert` する | `ConflictError`（`registrationId` は枠に含まれない） | |
| A の登録申請が確認中で保存されている | A の登録申請を、別の ID と別の予約した `reservedPlaceId` で `insert` する | 成功する（登録申請は枠を持たない） | |
| A の掲載の申請（P）が確認中で保存されている | A の掲載の申請（P）を、別の ID で `insert` する | 成功する（掲載の申請は枠を持たない） | |
| A の情報修正の申請（P）が、否認・取り下げ・失効・承認のどれかで保存されている | A の情報修正の申請（P）を、別の ID で `insert` する | 成功する。前の申請は終わった状態のまま残る | |
| A の情報修正の申請（P）が確認中で保存されている | その申請を取り下げにして `save` し、コミットの後に、A の情報修正の申請（P）を別の ID で `insert` する | 成功する（終わった申請の枠は、`save` のコミットの時点で空く） | |

## findByIds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 確認中の申請 a1、承認の申請 a2、失効の申請 a3 が保存されている | a1・a2・a3 と、存在しない ID で `findByIds` を呼ぶ | a1・a2・a3 が、状態を問わず返る。存在しない ID は結果に現れない | |
| 申請が保存されている | 空の配列で `findByIds` を呼ぶ | 空の配列が返る | |
| 100件の申請が保存されている | 100件の ID で `findByIds` を呼ぶ | 100件が返る | |
| — | 101件の ID で `findByIds` を呼ぶ | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## findActiveBySlot

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の情報修正の申請（P）が確認中で保存されている | その枠で `findActiveBySlot` を呼ぶ | その申請が返る | |
| A の情報修正の申請（P）が差し戻しで保存されている | その枠で呼ぶ | その申請が返る | |
| A の情報修正の申請（P）が否認で保存されている。その枠の進行中の申請はない | その枠で呼ぶ | `null` | |
| A の情報修正の申請（P）の否認の申請と、同じ枠の確認中の申請が保存されている | その枠で呼ぶ | 確認中の申請が返る | |
| B の情報修正の申請（P）だけが確認中で保存されている | A の情報修正（P）の枠で呼ぶ | `null` | |
| 所属の申請（P→X、店舗として）が確認中で保存されている | 離脱（P→X、店舗として）の枠、所属（P→Y、店舗として）の枠でそれぞれ呼ぶ | どちらも `null` | |

## findActiveBySubject

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P に、A の情報修正の申請（確認中）、B の管理権限の申請（差し戻し）、参加の申請（P→E、確認中）、A の掲載の申請（承認）が保存されている。店舗 Q に、A の情報修正の申請（確認中）が保存されている | `{ kind: "place"; id: P }` で呼ぶ | P の進行中の3件が、ID の昇順で、`expectedVersion` とともに返る。承認の申請と Q の申請は返らない | |
| 所属の申請（P→X）と離脱の申請（Q→X）が確認中、所属の申請（P→Y）が確認中で保存されている | `{ kind: "region"; id: X }` で呼ぶ | X の2件だけが返る | |
| 参加の申請（P→E）が確認中、参加の申請（Q→E）が取り下げで保存されている | `{ kind: "occasion"; id: E }` で呼ぶ | P→E の申請だけが返る | |
| 掲載 L の掲載の修正の申請が、A のものと B のもの、どちらも確認中で保存されている | `{ kind: "listing"; id: L }` で呼ぶ | 2件が返る | |
| A の登録申請 r と、r を参照する併せた管理権限の申請 s が、どちらも確認中で保存されている | `{ kind: "registration"; id: r }` で呼ぶ | s だけが返る（登録申請そのものは返らない） | |
| A の登録申請 r と、併せた管理権限の申請 s が確認中で保存されている | `{ kind: "place"; id: r の reservedPlaceId }` で呼ぶ | r と s が返る | |
| その対象に関わる進行中の申請がない | 呼ぶ | 空の配列が返る | |

## findActiveByIndividual

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の情報修正の申請（確認中）、A の管理権限の申請（差し戻し）、A の掲載の申請（否認）、B の情報修正の申請（確認中）、所属の申請（P→X、店舗として。確認中）が保存されている | A で呼ぶ | A の進行中の2件が、ID の昇順で、`expectedVersion` とともに返る。否認の申請、B の申請、店舗として行った申請は返らない | |
| A の進行中の申請がない | A で呼ぶ | 空の配列が返る | |

## findPageByApplicants

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の個人の申請 a1（先に提出）、a2（後に提出、否認）、店舗 P が行った申請 p1（a1 と a2 の間に提出）、店舗 Q が行った申請 q1、B の個人の申請 b1 が保存されている | `{ individual: A; places: [P] }` で呼ぶ | a2・p1・a1 の順（`submittedAt` の新しい順）に、状態を問わず返る。`count` は 3。q1 と b1 は返らない | |
| 同上 | `{ individual: null; places: [P] }` で呼ぶ | p1 だけが返る。`count` は 1 | |
| 同上 | `{ individual: A; places: [] }` で呼ぶ | a2・a1 が返る | |
| A が個人として行った所属の申請（P→X）が保存されている。店舗 P が行った申請はない | `{ individual: null; places: [P] }` で呼ぶ | `items` は空、`count` は 0（対象が P でも、申請者が P でない申請は返らない） | |
| 差し戻しの後に再提出された申請 a1（最初の提出が先）と、その再提出より前に提出された申請 a2（最初の提出は a1 より後）が保存されている | A で呼ぶ | a2・a1 の順（再提出で `submittedAt` は変わらない） | |
| 同じ `submittedAt` の A の申請が2件保存されている | A で呼ぶ | ID の昇順で返る | |
| `{ individual: null; places: [] }` | 呼ぶ | `items` は空、`count` は 0 | |
| 条件に合う申請が0件 | `page: 1`、`limit: 10` で呼ぶ | `items` は空、`count` は 0 | |
| 条件に合う申請が1件 | `page: 1`、`limit: 10` で呼ぶ | `items` は1件、`count` は 1 | |
| 条件に合う申請が3件 | `page: 1`、`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 条件に合う申請が5件 | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| 条件に合う申請が5件 | `page: 3`、`limit: 3` で呼ぶ | `items` は空、`count` は 5 | |
| 101店舗のそれぞれが行った申請が1件ずつ保存されている | 101件の `places` で呼ぶ | `count` は 101（`places` は件数に上限を持たない） | |

## findPageBySubject

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域 X に、所属の申請 x1（最も先に提出、承認）、x2（次に提出、確認中）、x3（次に提出、否認）、x4（最後に提出、差し戻し）が保存されている | `{ kind: "region"; id: X }`、`filter` なしで呼ぶ | x4・x2・x3・x1 の順（進行中の申請を先に、次に `submittedAt` の新しい順）。`count` は 4 | |
| 同上 | `statuses: ["underReview"]` で呼ぶ | x2 だけが返る。`count` は 1 | |
| 地域 X に、所属の申請と離脱の申請が保存されている | `kinds: ["leave"]` で呼ぶ | 離脱の申請だけが返る | |
| 店舗 P に、店舗として行った所属の申請、A が個人として行った情報修正の申請が保存されている | `{ kind: "place"; id: P }`、`applicant: "place"` で呼ぶ | 店舗として行った申請だけが返る | |
| 同上 | `applicant: "individual"` で呼ぶ | 個人の申請だけが返る | |
| 店舗 P に、`kinds`・`statuses`・`applicant` のそれぞれに合う申請と合わない申請が保存されている | 3つの項目をすべて指定して呼ぶ | すべての項目に合う申請だけが返る | |
| 登録申請 r を参照する併せた管理権限の申請が、取り下げの s1 と、その後に提出された確認中の s2 で保存されている | `{ kind: "registration"; id: r }` で呼ぶ | s2・s1 の順に返る | |
| 進行中の申請が2件、同じ `submittedAt` で保存されている | 呼ぶ | ID の昇順で返る | |
| その対象に関わる申請がない | 呼ぶ | `items` は空、`count` は 0 | |
| 条件に合う申請が1件 | `page: 1`、`limit: 10` で呼ぶ | `items` は1件、`count` は 1 | |
| 条件に合う申請が3件 | `page: 1`、`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 条件に合う申請が5件（進行中が2件） | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件（進行中の2件を含む）、`page: 2` は残りの2件。どちらも `count` は 5 | |
| 条件に合う申請が5件 | `page: 3`、`limit: 3` で呼ぶ | `items` は空、`count` は 5 | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の情報修正（P）の枠に進行中の申請がない | 2つの UnitOfWork が、同じ枠の申請を、別の ID で同時に `insert` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。進行中の申請は1件だけ残る | |
| 申請が保存されていない | 2つの UnitOfWork が、同じ ID の申請を同時に `insert` する | 一方が成功し、他方は `ConflictError` になる | |
| 確認中の申請が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、承認にした申請と取り下げにした申請を同時に `save` する | 一方が成功し、他方は遅くともコミットの時点で `ConflictError` になる。先にコミットした状態だけが残る | |
| 確認中の申請が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、承認にした申請と否認にした申請を同時に `save` する（2人の承認者） | 同上 | |
| 差し戻しの申請が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、再提出した申請と取り下げにした申請を同時に `save` する（2人の店舗管理者） | 同上 | |
| 確認中の申請が保存されている | 2つの UnitOfWork が、同じ `expectedVersion` で、否認にした申請と失効にした申請を同時に `save` する | 同上 | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 申請が保存されていない | UnitOfWork の中で `insert` してコミットし、直後に `findById`・`findByIds`・`findActiveBySlot`・`findActiveBySubject`・`findActiveByIndividual`・`findPageByApplicants`・`findPageBySubject` を呼ぶ | どの問い合わせにも、保存した申請が返る | |
| 確認中の申請が保存されている | UnitOfWork の中で、取り下げにした申請を `save` してコミットし、直後に同じ問い合わせを呼ぶ | `findById`・`findByIds`・`findPageByApplicants`・`findPageBySubject` は取り下げの申請を返し、`findActive…` の3つには現れない | |
| 申請が保存されていない | UnitOfWork の中で `insert` した後に、`fn` が例外を投げる | `findById` は `null`。どの問い合わせにも現れず、同じ枠の申請を後から `insert` できる | |
| 確認中の申請が保存されている | UnitOfWork の中で、否認にした申請を `save` した後に、`fn` が例外を投げる | `findById` は確認中の申請と前の版を返す | |
| 申請が保存されていない | 1つの UnitOfWork の中で、登録申請と、併せた管理権限の申請を `insert` してコミットする | 2件とも保存される | |
| 同じ ID の管理権限の申請がすでに保存されている | 1つの UnitOfWork の中で、登録申請と、その ID の併せた管理権限の申請を `insert` する | `ConflictError`。登録申請も残らない | |
| 申請 a1 と a2 が保存されている | 1つの UnitOfWork の中で、a1 を `save` し、a2 を古い `expectedVersion` で `save` する | `ConflictError`。a1 の `save` も残らない | |
