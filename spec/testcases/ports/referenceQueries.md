# ReferenceQueries

契約は [Discovery](../../domains/discovery.md) の「ポート」の「共通の契約」と「ReferenceQueries」による。このポートは読み取りだけを持つので、前提条件の集約は、各ドメインのリポジトリ（`PlaceRepository`・`ListingRepository`・`RegionRepository`・`PlaceAffiliationsRepository`・`OccasionRepository`・`ArticleRepository`）の `insert`・`save`・`delete` を UnitOfWork の中で呼んで置き、コミットの後に読む。集約は各ドメインの振る舞いで作る。

- 特に書かなければ、店舗は営業中で非公開でなく、地域・イベント・読みもの・掲載は `published` で運営による非公開でない
- 期待結果の `PlaceEntry` は、同じ集約に `ViewProjection.placeEntry` を当てた結果と一致する
- `resolve` の結果は、`refs` から重複を除いた参照ごとに1つの `ReferenceResolution`。`viewable: true` の結果の `target` を、以下では対象の名前で書く

## resolve

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 閲覧できる対象がある | 空の `refs` で `resolve` を呼ぶ | 空の並び。エラーにならない | |
| 掲載 L（店舗 P の掲載） | L の参照1件で `resolve` を呼ぶ | `viewable: true` の結果が1件返る。`ref` は L の参照、`target` は `kind: "listing"` で、L と P の `ListingEntry` | |
| イベント E、掲載 L、地域 R、店舗 P | E、L、R、P の順の参照で `resolve` を呼ぶ | 4件とも `viewable: true` で、`target` は E（`occasion`）、L（`listing`。`ListingEntry`）、R（`region`）、P（`place`。`PlaceEntry`）。引数の順で返る | |
| 閲覧できる掲載 L1・L3 と、`unpublished` の掲載 L2 | L1、L2、L3 の順の参照で呼ぶ | L1、L2、L3 の順で3件返る。L1 と L3 は `viewable: true` と `target`、L2 は `viewable: false` で `target` を持たない | |
| どの集約も指さない ID の参照 | 閲覧できる対象の参照に混ぜて呼ぶ | 存在しない対象の参照は `viewable: false`、残りは `viewable: true` で、入力の全件が引数の順で返る。エラーにならない | |
| `draft`・`unpublished`・運営による非公開の掲載、非公開の店舗の `published` の掲載、`delete` した掲載 | それぞれの参照で呼ぶ | どれも `viewable: false`。理由の区別を持たない | |
| 非公開の店舗 P と、P の `published` の掲載 L | P と L の参照で呼ぶ | 2件とも `viewable: false` | |
| `draft`・`unpublished`・運営による非公開の地域とイベント | それぞれの参照で呼ぶ | どれも `viewable: false` | |
| 提供開始前の掲載、提供終了の掲載、休業中の店舗、閉店した店舗とその掲載、終了したイベント、中止のイベント | それぞれの参照で呼ぶ | どれも `viewable: true` で、`target` が返る | |
| 閲覧できる掲載 L と店舗 P | L、P、L の順の参照で呼ぶ | L、P の順で2件返り、L は初出の位置に1回だけ現れる | |
| 店舗 P の掲載 L。P も閲覧できる | 掲載 L の参照と店舗 P の参照で呼ぶ | 掲載の結果と店舗の結果が、別々に1件ずつ返る（掲載とその店舗は別の対象） | |
| 店舗 P が、公開中の地域 X・Y にこの順に所属し、代表地域は Y。`unpublished` の地域 Z にも所属している | P の参照で呼ぶ | `regions` は Y、X の順 | |
| 写真のない店舗 P に、`published` の掲載 L1（`firstPublishedAt` が T1）・L2（T2。T1 < T2）がある | P の参照で呼ぶ | `substituteCover` は、L2 とその代表写真 | |
| 参照がすべて、閲覧できない対象を指す | 呼ぶ | 参照と同じ件数の `viewable: false` が、引数の順で返る。エラーにならない | |
| 閲覧できる掲載と店舗が、合わせて100件 | 100件の参照で呼ぶ | 100件の `viewable: true` が引数の順で返る | |
| 閲覧できる掲載と店舗が、合わせて101件 | 101件の参照で呼ぶ | `BusinessRuleError`（`DISCOVERY_TOO_MANY_REFS`） | |
| 掲載と店舗だけの参照（`BookmarkRef`） | 呼ぶ | `ShowcaseRef` と同じ扱いで解決される | |

## isViewable

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 営業中・休業中・閉店の店舗 | それぞれ `place` の参照で呼ぶ | どれも `true` | |
| 非公開の店舗 | `place` の参照で呼ぶ | `false` | |
| `published` の掲載で、提供中・提供開始前・提供終了のもの。閉店した店舗の `published` の掲載 | それぞれ `listing` の参照で呼ぶ | どれも `true`（日付と営業状況に依存しない） | |
| `draft`・`unpublished`・運営による非公開の掲載 | それぞれ呼ぶ | どれも `false` | |
| 非公開の店舗の `published` の掲載 | `listing` の参照で呼ぶ | `false` | |
| `published` の地域 | `region` の参照で呼ぶ | `true` | |
| `draft`・`unpublished`・運営による非公開の地域 | それぞれ呼ぶ | どれも `false` | |
| 公開中のイベントで、開催前・開催中・終了・中止のもの | それぞれ `occasion` の参照で呼ぶ | どれも `true` | |
| `draft`・`unpublished`・運営による非公開のイベント | それぞれ呼ぶ | どれも `false` | |
| `published` の読みもの | `article` の参照で呼ぶ | `true` | |
| `draft` と `unpublished` の読みもの | それぞれ呼ぶ | どちらも `false` | |
| どの集約も指さない ID | 5つの種類でそれぞれ呼ぶ | どれも `false`。エラーにならない | |
| `delete` した掲載 | `listing` の参照で呼ぶ | `false` | |
| 店舗 P がある。P の ID と同じ文字列を ID に持つ掲載はない | P の ID を `listing` の参照の ID にして呼ぶ | `false`（種類と ID の組で決まる） | |

## 可視性と UnitOfWork

このポートは UnitOfWork に参加しない。各ドメインの書き込みのコミットとロールバックが、読み取りにどう現れるかを確かめる。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `published` の掲載 L を持つ店舗 P | P を非公開にして `save` してコミットし、直後に P と L の `isViewable` と `resolve` を呼ぶ | どちらも `false`。`resolve` は P と L の両方を `viewable: false` で返す | |
| 上の続き | P の非公開を解除して `save` してコミットし、直後に同じ読み取りを呼ぶ | どちらも `true`。`resolve` は P と L を `viewable: true` で返す | |
| `unpublished` の掲載 L | `publish` して `save` してコミットし、直後に `isViewable` を呼ぶ | `true` | |
| `published` の地域 R | `unpublish` した R を `save` してコミットし、直後に `isViewable` と `resolve` を呼ぶ | `false`。`resolve` は R を `viewable: false` で返す | |
| 保存されていない店舗 P | UnitOfWork の中で P を `insert` してコミットし、直後に `isViewable` を呼ぶ | `true` | |
| `published` の掲載 L | UnitOfWork の中で、L を運営による非公開にして `save` した後に、`fn` が例外を投げる | `isViewable` は `true`。`resolve` は L を `viewable: true` で返す | |
