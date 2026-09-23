# Discovery のユースケース

ドメイン: Discovery（[../domains/discovery.md](../domains/discovery.md)）。閲覧者に見せる読み取りだけを持ち、書き込みを持たない。表示範囲の規則は `VisibilityPolicy`、フィードの構成は `FeedComposer`、要約の内容は `ViewProjection` が定め、ユースケースは条件と事実を読んで渡す。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| readFeed（フィードを読む） | 条件と現在地に合う掲載の要約と大きな枠を、フィードの並びで返す | DIS-01、DIS-02、DIS-03、DIS-04、DIS-06 / VW-01、CF-03 |
| searchByKeyword（キーワードで探す） | キーワードに一致する店舗・地域・掲載・イベント・読みものを、種類ごとに関連度の高い順で返す | DIS-05 / VW-03 |
| readMapCells（地図の区画を読む） | 範囲と条件に合う店舗を区画ごとの件数にまとめ、地域を位置とともに返す | EXP-01 / VW-04 |
| findMapExtent（対象が収まる範囲を求める） | エリアの条件に合う店舗が収まる範囲、または地域とその所属する店舗が収まる範囲を返す | EXP-01、EXP-04 / VW-04、DT-03 |
| listMapTargets（範囲の対象を一覧で読む） | `readMapCells` と同じ範囲と条件の店舗と地域を、種類ごとに返す | EXP-02 / VW-04 |
| findRegions（地域を探す） | 選択エリア、現在地の周辺、またはすべての地域を返す | EXP-03、DIS-04、DIS-06 / VW-05、CF-03 |
| viewRegion（地域の詳細を見る） | 地域の内容と、所属する店舗、その掲載、関連するイベント、紹介する読みものを返す | EXP-04 / DT-03 |
| listPlacesOfRegion（地域内の店舗を一覧で読む） | 地域に所属する店舗を、所属の新しい順で返す | EXP-05 / VW-06 |
| listListingsOfRegion（地域内の掲載を一覧で読む） | 地域に所属する店舗の掲載を、新しい順で返す | EXP-05 / VW-06 |
| viewListing（掲載の詳細を見る） | 掲載の内容と提供状態、紐づく店舗、所属地域、この掲載を添えたイベント、他の掲載、紹介する読みものを返す | EXP-06 / DT-01 |
| viewPlace（店舗の詳細を見る） | 店舗情報と営業状況、その店舗の掲載、所属地域、参加するイベント、紹介する読みものを返す | EXP-07、SHP-01 / DT-02 |
| listListingsOfPlace（店舗の掲載を一覧で読む） | 店舗の掲載を、状態を区別して返す | EXP-07 / DT-02、CF-05 |
| listOccasions（イベントを一覧で読む） | 開催前・開催中のイベントを、開催日の順で返す | EXP-08 / VW-07 |
| viewOccasion（イベントの詳細を見る） | イベントの内容と開催の状態、参加店舗と添えた掲載・参加日、関連する地域、紹介する読みものを返す | EXP-09 / DT-04 |
| locateParticipants（参加店舗の位置を読む） | イベントのすべての参加店舗を、位置と状態つきで返す | EXP-10 / VW-08 |
| listArticles（読みものを一覧で読む） | 公開中の読みものを、新しい順で返す | EXP-11 / VW-09 |
| readArticle（記事を読む） | 読みものの内容と、紹介先のうち閲覧できる対象を返す | EXP-12 / DT-05 |
| listArticlesShowcasing（対象を紹介する読みものを一覧で読む） | 掲載・店舗・地域・イベントを紹介する公開中の読みものを、新しい順で返す | EXP-04、EXP-06、EXP-07、EXP-09 / DT-01〜DT-04、CF-05 |
| findSelectionCandidates（対象の選択の候補を探す） | 入力の途中で選ぶ店舗・掲載・地域・イベントの候補を、状態を区別して返す | REG-01、REG-03、EVT-01、EVT-05、EVT-10、EDT-02 / CF-02（RQ-06、SM-06、EM-03、CM-04、AM-02） |
| resolveReferences（保存の参照を解決する） | 掲載・店舗の参照を受け、閲覧できる対象は内容と状態つきで、閲覧できない対象は閲覧できないことだけを返す | KEP-01、KEP-02、KEP-03 / VW-10 |

次の読み取りは、他のドメインのユースケースが Discovery のポートとドメインサービスを使って行う。

- 要約と詳細の保存済みの表示は Bookmark の `getSavedTargets` が返し、Discovery のユースケースは保存済みかどうかを結果に持たない。保存一覧の表示の内容は `resolveReferences` が解決する（アカウントの保存の参照は Bookmark の `listBookmarks` が返す）
- 公開前の確認は Listing の `previewListing`、Article の `previewArticle`、Application の `previewListingSubmission` が `ViewProjection.previewListing`・`previewArticle` を使う
- 種類をまたぐ参照（`ContentRef` とその部分型）で対象を受け取るユースケース（保存、申立て、連絡、申請の提出と承認）は、対象が閲覧できるかどうかを `ReferenceQueries.isViewable` で読む。特定の種類の集約を自分で読むユースケース（Occasion の直接の追加と開催地域の関連づけ、Region の店舗の所属地域の状況）は、読んだ集約に `VisibilityPolicy` の `is…Viewable` を当てる（index.md「閲覧できる対象」）
- 既存店舗の確認は Place の `matchPlaces`。写真のない店舗の写真の代用は、`ReferenceQueries.resolve` が返す閲覧できる店舗の `PlaceEntry` の `substituteCover` を使う。申請の判断での店舗の照合と、代理登録の前の確認は Place の `searchPlacesForOperation` で、写真を代用しない

## 共通の組み立て

どのユースケースにも当てはまる。

- ログインを必要としない。`viewPlace` だけが、ログインしている閲覧者の `Actor` を任意で取る
- 今日の日付は `Clock` の現在時刻から `LocalDate.fromInstant` で求め、ポートと `Standing.of…`・`ViewProjection` に渡す
- 絞り込みの条件（`BrowseCriteria`）を取るユースケースは、`AreaCatalog.expand`（Area）と `CategoryCatalogRepository.find`（Listing）の結果から `BrowseCriteria.resolve` で条件を解決し、効いている条件（`effective`）を結果に添える。廃止されたカテゴリーは条件から外れ、エラーにしない
- 一覧・概要・枠は `ViewProjection` の要約（`listingSummary`・`placeSummary`・`regionSummary`・`occasionSummary`・`articleSummary`）で返す。地域名の文脈（`RegionContext`）は、地域内の一覧（`listPlacesOfRegion`・`listListingsOfRegion`）と、地域の詳細（`viewRegion`）の店舗・掲載の区分が `within`、ほかは `displayed`
- 写真は、`PhotoStorage.displayRefs`（Media）の表示用の参照を添えて返す
- 参照の場面の結果は、状態（`Standing`。提供状態、営業状況、開催の状態）を区別できる形で返す
- 一覧は `Pagination` を取り、並びと、条件に合う全件数を返す。対象が1件もなければ、空の並びと件数 0 を返し、エラーにしない
- 詳細の関連情報のうち先頭だけを返す区分の件数は、`ViewProjection` の `RELATED_HEAD`（店舗と掲載の区分）と `RELATED_ARTICLE_HEAD`（読みものの区分）が定める。件数を限った区分は、全件数を併せて返す
- 1つのユースケースの複数の読み取りの間に閲覧できなくなった対象は、結果から落とすだけで、失敗にしない

どのユースケースも UnitOfWork を始めず、読み取りだけを行う。

## readFeed

### 概要

条件と現在地に合うフィード対象の掲載を、`FeedComposer` の並びで、大きな枠（地域・読みもの・イベント）とともに返す。フィードと絞り込みの結果は同じ読み取りで、発見の場面に当たる。現在地があれば近い順、なければ新しい順が掲載の優先順になる。

次のページは、最初のページと同じ条件と同じ現在地で求める。ページは掲載の件数で数える。どのページも、先頭から `FeedComposer.requirement` の件数だけ候補を読んで構成するので、候補が読み込みの間に変わらなければ、ページをつないだ並びは全体を1回で構成した並びと一致する。`requirement` の件数が100を超えるときは、候補を `limit: 100` のページに分けて先頭から順に読み、件数に達するか候補が尽きるまでつなぐ。

条件に合う掲載が0件なら、大きな枠も持たない空のフィードを返す。

### 入出力

- 入力: `BrowseCriteria`（エリアの選択とカテゴリー。どちらも空でよい）、現在地（`GeoPoint`。位置情報の利用を許可していなければ `null`）、`Pagination`。`Actor` を取らない
- 出力: フィードの並び（掲載の要約と、地域・読みもの・イベントの大きな枠）、条件に合う掲載の全件数、次のページがあるかどうか、効いている条件
- 掲載の要約は、写真・掲載の名称・店舗の名称・一覧に示す地域名と、掲載と店舗の ID を持つ。価格とキャッチコピーを持たない

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.expand`、`CategoryCatalogRepository.find`、`BrowseCriteria.resolve`
- `FeedComposer.requirement`、`FeedListingCandidate.of`、`FeedComposer.page`
- `FeedCandidateQueries.findListings`・`findRegionFrames`・`findOccasionFrames`
- `ExplorationQueries.findArticles`（読みものの枠の候補。条件で絞り込まない）
- `ViewProjection.listingSummary`・`regionSummary`・`occasionSummary`・`articleSummary`
- `PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。読み取りの間に候補が変わった場合は、その時点の候補から構成した並びを返す。

### エラーケース

要件が振る舞いを定めるエラーはない。条件に合う掲載がないこと、現在地がないことは、エラーにしない。

## searchByKeyword

### 概要

キーワードに一致する対象を、店舗・地域・掲載・イベント・読みものの種類ごとに、関連度の高い順で返す。検索結果は参照の場面で、提供開始前・提供終了の掲載、休業・閉店の店舗、終了・中止のイベントも、状態を区別して返す。選択中のエリア・カテゴリーの条件は効かない。種類ごとに独立にページングする。

### 入出力

- 入力: キーワード（文字列）、読む種類（5種類すべて、または1つの種類）、`Pagination`。`Actor` を取らない
- 出力: 種類ごとの、状態つきの要約の並びと全件数
- キーワードは `SearchKeyword.create` で確かめる
- 写真のない店舗は、`PlaceEntry` の `substituteCover`（その店舗の閲覧できる掲載のうち、最初の公開が最も新しい掲載の代表写真）で代用し、代用できなければ写真なしで返す

### 使用するドメインの振る舞い・ポート

- `SearchKeyword.create`
- `KeywordSearchQueries.searchPlaces`・`searchRegions`・`searchListings`・`searchOccasions`・`searchArticles`
- `ViewProjection` の要約、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| キーワードが空、または空白だけ | `BusinessRuleError`（`DISCOVERY_KEYWORD_REQUIRED`）。検索は行わない |

どの種類にも結果がないことは、エラーにしない。

## readMapCells

### 概要

範囲と条件に合う店舗と地域を返す。地図は発見の場面に当たる。店舗は、範囲を格子に分けた区画ごとに件数でまとめ、店舗が1件の区画は店舗の要約を持つ。地域は1点の位置で、店舗とまとめずに返す。1回の読み取りの地域は100件まで。

地域を選んでいる間は、その地域と、その地域に所属する店舗を、選択中のエリア・カテゴリーの条件にかかわらず結果に含める。所属する店舗は、区画の中の件数で他の店舗と区別できる。

### 入出力

- 入力: 範囲（`GeoBounds`）、格子（列と行の数）、`BrowseCriteria`、選んでいる地域（`RegionId` または `null`）。`Actor` を取らない
- 出力: 店舗の区画の並び（区画の位置、件数、選んでいる地域に所属する店舗の件数、店舗の位置が収まる範囲、1件の区画は店舗の要約）、地域の要約の並び、選んでいる地域の要約、効いている条件
- 範囲は `Geo.requireBounds`、格子は `MapGrid.create` で確かめる

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.expand`、`CategoryCatalogRepository.find`、`BrowseCriteria.resolve`
- `Geo.requireBounds`、`MapGrid.create`
- `ExplorationQueries.findPlaceCells`
- `ExplorationQueries.findRegions`（`bounds` は入力の範囲、`areaCodes` は解決したエリアの条件、`vicinity` と `origin` は `null`、`page: 1`・`limit: 100`）
- `DetailQueries.findRegion`（選んでいる地域。条件と範囲にかかわらず読む）
- `ViewProjection.placeSummary`・`regionSummary`、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。範囲と条件に合う店舗も地域もなければ、空の結果を返す。選んでいる地域が閲覧できなくなっていれば、その地域と所属による追加を結果に含めない。

## findMapExtent

### 概要

対象が収まる範囲を求める。エリアの選択から求める範囲は、閲覧できて発見の対象である店舗のうち、所在地が選択エリアにある店舗が収まる範囲で、エリアの選択がなければ、閲覧できて発見の対象であるすべての店舗が収まる範囲になる。カテゴリーの条件は効かない。収める店舗が0件なら、日本全体が収まる範囲（`Geo.JAPAN`）を返す。地域から求める範囲は、その地域の位置と、所属する店舗の位置が収まる範囲になる。

### 入出力

- 入力: エリアの選択（`AreaSelection` の並び。空でよい）、または `RegionId` のどちらか。`Actor` を取らない
- 出力: 範囲（`GeoBounds`）。地域から求める場合に、地域が閲覧できなければ `null`

### 使用するドメインの振る舞い・ポート

- `AreaSelection.dedupe`、`AreaCatalog.expand`（エリアの選択から求める場合。選択が空なら `MapScope` の `areaCodes` は `null`）
- `ExplorationQueries.findMapExtent`
- `Geo.JAPAN`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。地域が閲覧できないことは、エラーにしない。

## listMapTargets

### 概要

`readMapCells` と同じ範囲・同じ条件の店舗と地域を、種類ごとに返す。地図の一覧は発見の場面に当たる。どちらの種類も、現在地があれば近い順、なければ新しい順に並ぶ。種類ごとに独立にページングする。店舗の対象は、地域を選んでいないときの `readMapCells` の店舗と一致する。

### 入出力

- 入力: 範囲（`GeoBounds`）、`BrowseCriteria`、現在地（`GeoPoint` または `null`）、読む種類（店舗と地域の両方、またはどちらか）、`Pagination`。`Actor` を取らない
- 出力: 店舗の要約（写真・名称・所在地・一覧に示す地域名・営業状況）の並びと全件数、地域の要約の並びと全件数、効いている条件

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.expand`、`CategoryCatalogRepository.find`、`BrowseCriteria.resolve`
- `Geo.requireBounds`
- `ExplorationQueries.findPlacesInBounds`
- `ExplorationQueries.findRegions`（`bounds` は入力の範囲、`areaCodes` は解決したエリアの条件、`vicinity` は `null`）
- `ViewProjection.placeSummary`・`regionSummary`、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。

## findRegions

### 概要

地域を一覧で返す。地域の一覧は発見の場面に当たる。エリアの条件があれば、位置または所属する店舗の所在地が選択エリアにある地域を返す。エリアの条件がなく現在地があれば、現在地の周辺（半径は設定値）の地域を返す。どちらもなければ、すべての地域を返す。現在地があれば近い順、なければ新しい順に並ぶ。カテゴリーの条件は効かない。

### 入出力

- 入力: `BrowseCriteria`、現在地（`GeoPoint` または `null`）、`Pagination`。`Actor` を取らない
- 出力: 地域の要約（写真・名称・所在地）の並びと全件数、効いている条件

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.expand`、`CategoryCatalogRepository.find`、`BrowseCriteria.resolve`
- `Vicinity.create`（エリアの条件がなく、現在地があるときだけ）
- `ExplorationQueries.findRegions`（`bounds` は `null`）
- `ViewProjection.regionSummary`、`PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。現在地がないことは、エラーにしない。

## viewRegion

### 概要

地域の内容と、関連情報の区分（所属する店舗、その掲載、関連するイベント、紹介する読みもの）を返す。合成をまたぐ規則は次のとおり。

- 地域が閲覧できなければ、どの区分も返さない
- 店舗、掲載、イベントの区分は発見の場面に当たる
- 対象が1件もない区分は、空で返す。掲載の全件数が 0 であることが「地域に閲覧できる掲載がない」に当たる
- 店舗と掲載の区分の要約の地域名には、代表地域ではなく、その地域を示す

### 入出力

- 入力: `RegionId`。`Actor` を取らない
- 出力: 地域の写真（登録された順）・名称・キャッチコピー・紹介・所在地・位置、所属する店舗の要約（先頭の `RELATED_HEAD` 件）と全件数、その掲載の要約（先頭の `RELATED_HEAD` 件）と全件数、関連するイベントの要約（すべて）、紹介する読みものの要約（先頭の `RELATED_ARTICLE_HEAD` 件）と全件数

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findRegion`
- `ExplorationQueries.findPlacesOfRegion`、`ExplorationQueries.findListingsOfRegion`（`excludingPlaceId` は `null`）
- `DetailQueries.findOccasionsRelatedTo`（`region`）
- `DetailQueries.findArticlesShowcasing`
- `ViewProjection.placeSummary`・`listingSummary`（`RegionContext` は `within`）、`occasionSummary`・`articleSummary`、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域が公開の取り下げ、運営による非公開、下書き、または存在しない | `NotFoundError`。理由を区別しない |

## listPlacesOfRegion

### 概要

地域に所属する店舗を、その地域に所属した日時の新しい順で返す。地域内の一覧は発見の場面に当たり、閉店した店舗を含まない。選択中のエリア・カテゴリーの条件は効かない。店舗の地域名には、代表地域ではなく、その地域を示す。

### 入出力

- 入力: `RegionId`、`Pagination`。`Actor` を取らない
- 出力: 店舗の要約の並びと全件数

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findRegion`（地域が閲覧できること）
- `ExplorationQueries.findPlacesOfRegion`
- `ViewProjection.placeSummary`（`RegionContext` は `within`）、`PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域が閲覧できない、または存在しない | `NotFoundError` |

## listListingsOfRegion

### 概要

地域に所属する店舗の掲載を、新しい順で返す。地域内の一覧は発見の場面に当たる。選択中のエリア・カテゴリーの条件は効かない。掲載の地域名には、その地域を示す。全件数が 0 であることが「地域に閲覧できる掲載がない」に当たる。

### 入出力

- 入力: `RegionId`、`Pagination`。`Actor` を取らない
- 出力: 掲載の要約の並びと全件数

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findRegion`（地域が閲覧できること）
- `ExplorationQueries.findListingsOfRegion`（`excludingPlaceId` は `null`）
- `ViewProjection.listingSummary`（`RegionContext` は `within`）、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域が閲覧できない、または存在しない | `NotFoundError` |

## viewListing

### 概要

掲載の内容と状態、関連情報の区分（店舗、地域、イベント、他の掲載、紹介する読みもの）を返す。合成をまたぐ規則は次のとおり。

- 掲載が閲覧できなければ、どの区分も返さない。紐づく店舗が非公開の掲載は閲覧できない
- 掲載そのものと紐づく店舗は参照の場面に当たり、提供開始前・提供終了の掲載と、休業・閉店の店舗の掲載も、状態を区別して返す
- 他の掲載とイベントの区分は発見の場面に当たる。他の掲載は、同じ店舗の掲載に、一覧に示す地域に所属する他の店舗の掲載を続けた、先頭の `RELATED_HEAD` 件（`ViewProjection.pickOtherListings`）。一覧に示す地域がなければ、同じ店舗の掲載だけになる
- 地域は、店舗のすべての閲覧できる所属地域を、一覧に示す地域を先頭に、以降は所属した順で返す

店舗管理者の有無を添える。手続きの入口（掲載の修正の申請、情報の誤り・閉店の連絡）は、この事実から決まる。

### 入出力

- 入力: `ListingId`。`Actor` を取らない
- 出力: 掲載の写真（登録された順と見せる範囲）・名称・説明・現役に解決したカテゴリー・提供の設定・提供状態（提供開始前は開始日）、紐づく店舗の要約と営業状況、所属地域の要約（すべて）、この掲載を添えたイベントの要約（すべて）、他の掲載の要約（`pickOtherListings` の結果）、紹介する読みものの要約（先頭の `RELATED_ARTICLE_HEAD` 件）と全件数、店舗管理者の有無
- 価格とキャッチコピーを持たない

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findListing`
- `Listing.offeringStatus`、`Standing.ofListing`
- `CategoryCatalogRepository.find`、`CategoryCatalog.resolve`
- `DetailQueries.findListingsOfPlace`（`scene` は `discovery`）
- `ExplorationQueries.findListingsOfRegion`（一覧に示す地域。`excludingPlaceId` は紐づく店舗）
- `ViewProjection.pickOtherListings`
- `DetailQueries.findOccasionsRelatedTo`（`listing`）
- `DetailQueries.findArticlesShowcasing`
- `StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.isVacant`（Authority）
- `ViewProjection` の要約、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 掲載が下書き・一時非公開・運営による非公開・削除のいずれか、紐づく店舗が非公開、または掲載が存在しない | `NotFoundError`。理由を区別しない |

## viewPlace

### 概要

店舗の情報と営業状況、関連情報の区分（掲載、地域、イベント、紹介する読みもの）を返す。合成をまたぐ規則は次のとおり。

- 店舗が閲覧できなければ、どの区分も返さない
- 店舗そのものと掲載の区分は参照の場面に当たる。休業・閉店の店舗も状態を区別して返し、掲載は提供開始前・提供終了を含めて、店舗の掲載の順で返す
- イベントの区分は発見の場面に当たる
- 写真のない店舗は写真なしで返し、掲載の写真で代用しない
- 地域は、すべての閲覧できる所属地域を、一覧に示す地域を先頭に、以降は所属した順で返す

店舗管理者の有無と、閲覧者がその店舗の店舗管理者かどうかを添える。手続きの入口（管理権限の申請、店舗の管理、修正・掲載・所属の申請、情報の誤り・閉店の連絡）は、この事実から決まる。

### 入出力

- 入力: `PlaceId`、ログインしている閲覧者の `Actor`（ログインしていなければ `null`）
- 出力: 店舗の写真（登録された順）・名称・紹介・所在地・位置・訪問に必要な情報・営業状況、その店舗の掲載の要約（先頭の `RELATED_HEAD` 件）と全件数、所属地域の要約（すべて）、参加するイベントの要約（すべて）、紹介する読みものの要約（先頭の `RELATED_ARTICLE_HEAD` 件）と全件数、店舗管理者の有無、閲覧者がその店舗の店舗管理者かどうか
- ログインしていない閲覧者は、店舗管理者でないものとして返す

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findPlace`
- `DetailQueries.findListingsOfPlace`（`scene` は `reference`）
- `DetailQueries.findOccasionsRelatedTo`（`place`）
- `DetailQueries.findArticlesShowcasing`
- `StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.isVacant`、`Stewardship.isSteward`（Authority）
- `ViewProjection` の要約、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗が非公開、または存在しない | `NotFoundError`。理由を区別しない |

## listListingsOfPlace

### 概要

店舗の掲載を、参照の場面で、店舗の掲載の順（提供中、提供開始前、提供終了の順。それぞれ新しい順）で返す。`viewPlace` の掲載の区分と同じ対象と順で、全件をページで読める。店舗が閲覧できなければ、空の並びを返す。

### 入出力

- 入力: `PlaceId`、`Pagination`。`Actor` を取らない
- 出力: 状態つきの掲載の要約の並びと全件数

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findListingsOfPlace`（`scene` は `reference`）
- `ViewProjection.listingSummary`、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。

## listOccasions

### 概要

開催前・開催中のイベントを、開催日の順で返す。イベントの一覧は発見の場面に当たり、終了・中止のイベントを含まない。参加店舗を持たないイベントも返す。選択中のエリア・カテゴリーの条件は効かない。

### 入出力

- 入力: `Pagination`。`Actor` を取らない
- 出力: イベントの要約（写真・名称・開催期間・開催場所・開催の状態）の並びと全件数

### 使用するドメインの振る舞い・ポート

- `ExplorationQueries.findOccasions`
- `ViewProjection.occasionSummary`、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。

## viewOccasion

### 概要

イベントの内容と開催の状態、関連情報の区分（参加店舗、関連する地域、紹介する読みもの）を返す。合成をまたぐ規則は次のとおり。

- イベントが閲覧できなければ、どの区分も返さない。終了・中止のイベントは閲覧でき、状態を区別して返す
- イベントそのもの、参加店舗、添えた掲載は参照の場面に当たる。閉店した店舗と、提供開始前・提供終了の添えた掲載も、状態を区別して返す
- 参加店舗は、店舗ごとに、添えた掲載と参加日を併せて返す。参加日は `Participation.visibleDates` で求め、開催期間の外の参加日を含めない
- すべての参加店舗の添えた掲載が空であることが「イベントに閲覧できる掲載がない」に当たる

### 入出力

- 入力: `OccasionId`。`Actor` を取らない
- 出力: イベントの写真（登録された順）・名称・キャッチコピー・紹介・開催期間・開催場所・開催の状態、参加店舗（店舗の要約と営業状況、添えた掲載の状態つきの要約、日付の順の参加日。すべて）、関連する地域の要約（すべて）、紹介する読みものの要約（先頭の `RELATED_ARTICLE_HEAD` 件）と全件数

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findOccasion`
- `Occasion.holdingStatus`、`Standing.ofOccasion`
- `DetailQueries.findParticipants`、`Participation.visibleDates`
- `DetailQueries.findRegionsOfOccasion`
- `DetailQueries.findArticlesShowcasing`
- `ViewProjection` の要約、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントが公開の取り下げ、運営による非公開、下書き、または存在しない | `NotFoundError`。理由を区別しない |

## locateParticipants

### 概要

イベントのすべての参加店舗を、位置と状態つきで返す。参加店舗の地図は参照の場面に当たり、閉店した店舗を含む。エリア・カテゴリーの条件と現在地は効かない。すべての参加店舗が収まる範囲を併せて返す。

### 入出力

- 入力: `OccasionId`。`Actor` を取らない
- 出力: 参加店舗の要約（写真・名称・所在地・位置・営業状況）の並び（すべて）と、すべての位置が収まる範囲。参加店舗がなければ、空の並びと範囲 `null`

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findOccasion`（イベントが閲覧できること）
- `DetailQueries.findParticipants`
- `Geo.extentOf`
- `ViewProjection.placeSummary`、`PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントが閲覧できない、または存在しない | `NotFoundError` |

## listArticles

### 概要

公開中の読みものを、新しい順で返す。選択中のエリア・カテゴリーの条件は効かない。

### 入出力

- 入力: `Pagination`。`Actor` を取らない
- 出力: 読みものの要約（写真・タイトル）の並びと全件数

### 使用するドメインの振る舞い・ポート

- `ExplorationQueries.findArticles`
- `ViewProjection.articleSummary`、`PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。

## readArticle

### 概要

読みものの内容と、紹介先を返す。合成をまたぐ規則は次のとおり。

- 読みものが公開中でなければ、紹介先も返さない
- 紹介先は参照の場面に当たり、提供開始前・提供終了・休業・閉店・終了・中止の対象も、状態を区別して返す
- 閲覧できない紹介先（非公開、公開の取り下げ、削除、非公開の店舗の掲載）は結果に含めない。読みものの本文は変わらずに返す
- 紹介先の順は、編集担当者が並べた順

### 入出力

- 入力: `ArticleId`。`Actor` を取らない
- 出力: 読みもののタイトル・写真（登録された順）・本文、紹介先の状態つきの要約の並び（掲載・店舗・地域・イベントの種類を区別できる）

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findArticle`
- `ReferenceQueries.resolve`（結果のうち `viewable: true` の紹介先だけを返す）
- `Standing.ofListing`・`ofPlace`・`ofOccasion`、`ViewProjection` の要約
- `PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 読みものが下書き、公開の取り下げ、または存在しない | `NotFoundError`。理由を区別しない |

## listArticlesShowcasing

### 概要

掲載・店舗・地域・イベントの1つを紹介先に持つ公開中の読みものを、新しい順で返す。`viewListing`・`viewPlace`・`viewRegion`・`viewOccasion` の読みものの区分と同じ対象と順で、全件をページで読める。紹介される対象が閲覧できなければ、空の並びを返す。

### 入出力

- 入力: 紹介される対象（`ShowcaseRef`）、`Pagination`。`Actor` を取らない
- 出力: 読みものの要約の並びと全件数

### 使用するドメインの振る舞い・ポート

- `DetailQueries.findArticlesShowcasing`
- `ViewProjection.articleSummary`、`PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。

## findSelectionCandidates

### 概要

入力の途中で選ぶ対象の候補を、種類を1つ決めて、キーワードで探す。候補は参照の場面に当たり、閲覧できる対象だけを、状態を区別して返す。どの種類も、`searchByKeyword` と同じ一致と関連度（`KeywordSearchQueries`）で探す。店舗は店名と住所で探せる。店舗の候補には、店舗管理者の有無を添える。空、または空白だけのキーワードは、どの種類でも空の結果を返す。

すでに選んだ対象と選べない対象は、呼び出す操作が持つ現在の結びつき（所属、参加、関連づけ、紹介先）から決まり、このユースケースは区別しない。選べない対象を選んだ要求は、結びつきを持つドメインの振る舞いが拒否する。

### 入出力

- 入力: 種類（店舗・掲載・地域・イベントのどれか）、キーワード（文字列）、`Pagination`。`Actor` を取らない
- 出力: 状態つきの要約の並びと全件数。関連度の高い順
- キーワードは `SearchKeyword.parse` で確かめる。結果が `null`（空、または空白だけ）なら、ポートを呼ばずに、空の並びと全件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `SearchKeyword.parse`
- `KeywordSearchQueries.searchPlaces`・`searchListings`・`searchRegions`・`searchOccasions`（入力の種類の1つ）
- `StewardshipRepository.findByTargets`、`Stewardship.isVacant`（Authority。店舗の候補だけ）
- `ViewProjection` の要約、`PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

要件が振る舞いを定めるエラーはない。候補がないことと、キーワードが空であることは、エラーにしない。

## resolveReferences

### 概要

掲載・店舗の参照を受け、保存一覧に示す内容を解決する。ログインの有無にかかわらず使える。アカウントの保存は Bookmark の `listBookmarks` が返す参照を、端末の保存は端末が持つ参照を渡す。端末の保存の時点の、対象が閲覧できるかどうかの確認にも使う。合成をまたぐ規則は次のとおり。

- 参照の場面に当たり、提供開始前・提供終了の掲載と、休業・閉店の店舗も、状態を区別して返す
- 閲覧できない対象（一時非公開、運営による非公開、非公開の店舗の掲載、削除、存在しない）は、閲覧できないことだけを、対象の情報なしで返す。理由を区別しない
- 結果は、入力の参照のすべてについて、参照ごとに1つ。閲覧できる対象の内容か、閲覧できないことのどちらかを持つ（`ReferenceQueries.resolve` の `ReferenceResolution` と同じ直和）。順は引数の順で、同じ参照が重なっていれば、初出の位置に1回だけ現れる
- 受け取った参照は保存しない

### 入出力

- 入力: `BookmarkRef` の並び（0〜100件）。`Actor` を取らない
- 出力: 参照ごとに、閲覧できる対象は状態つきの掲載または店舗の要約、閲覧できない対象は参照と閲覧できないこと
- 写真のない店舗は、`PlaceEntry` の `substituteCover` で代用し、代用できなければ写真なしで返す

### 使用するドメインの振る舞い・ポート

- `ReferenceQueries.resolve`（`viewable: true` の結果は `target` を投影し、`viewable: false` の結果は参照と閲覧できないことだけを返す）
- `Standing.ofListing`・`ofPlace`、`ViewProjection.listingSummary`・`placeSummary`（`RegionContext` は `displayed`）
- `PhotoStorage.displayRefs`、`Clock`

### トランザクション境界

UnitOfWork は不要。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 参照が100件を超える | `BusinessRuleError`（`DISCOVERY_TOO_MANY_REFS`）。呼び出し側が100件ずつに分けて呼ぶ |

参照が0件であること、どの参照も閲覧できないことは、エラーにしない。
