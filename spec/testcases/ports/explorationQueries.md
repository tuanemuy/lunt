# ExplorationQueries

契約は [Discovery](../../domains/discovery.md) の「ポート」の「共通の契約」と「ExplorationQueries」による。このポートは読み取りだけを持つので、前提条件の集約は、各ドメインのリポジトリ（`PlaceRepository`・`ListingRepository`・`RegionRepository`・`PlaceAffiliationsRepository`・`OccasionRepository`・`ParticipationRepository`・`ArticleRepository`）の `insert`・`save`・`delete` を UnitOfWork の中で呼んで置き、コミットの後に読む。集約は各ドメインの振る舞いで作る。

- 特に書かなければ、店舗は営業中で非公開でなく、地域・イベント・読みもの・掲載は `published` で運営による非公開でない。`criteria` は条件なし、`selectedRegionId`・`origin`・`vicinity`・`bounds`（`findRegions`）は `null`、`pagination` は `page: 1`・`limit: 10`
- 地図の読み取りの `bounds` は、特に書かなければ、前提条件のすべての位置を内側に含む矩形。`grid` は 4 × 4
- 期待結果の `PlaceEntry` は、同じ集約に `ViewProjection.placeEntry` を当てた結果と一致する。区画は `MapClustering.cells`（区画の位置は `Geo.cellOf`）、範囲は `Geo.extentOf`、距離は `Geo.distanceMeters`、エリアと周辺の地域の判定は `RegionFootprint.of` を当てた `BrowseCriteria.matchesRegion`・`Vicinity.includesRegion` の結果と一致する

## findPlaceCells の対象

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗が1つもない | `findPlaceCells` を呼ぶ | 空の並び | |
| `bounds` の内側に店舗 P、外側に店舗 S | `findPlaceCells` を呼ぶ | P の区画だけが返る。S はどの区画にも含まれない | |
| 店舗 P の位置が、`bounds` の南西の角とちょうど同じ。店舗 Q の位置が、北東の角とちょうど同じ | `findPlaceCells` を呼ぶ | どちらも対象になる（両端を含む）。P は `column: 0`・`row: 0`、Q は `column: 3`・`row: 3` の区画 | |
| 休業中の店舗、閉店した店舗、非公開の店舗が `bounds` の内側にある | `findPlaceCells` を呼ぶ | 休業中の店舗の区画だけが返る | |
| 掲載を1件も持たない店舗と、写真のない店舗が `bounds` の内側にある | `findPlaceCells` を呼ぶ | どちらも対象になる | |
| 所在地の `areaCode` が A の店舗 Pa と、B の店舗 Pb | `areaCodes: {A}` で呼ぶ | Pa の区画だけが返る | |
| 店舗 P1 は K1 の提供中の掲載を持つ。店舗 P2 の K1 の掲載は、提供開始前と提供終了だけ。店舗 P3 の K1 の掲載は `unpublished`。店舗 P4 は K2 の提供中の掲載だけを持つ。店舗 P5 は掲載を持たない | `categoryIds: {K1}` で呼ぶ | P1 の区画だけが返る | |
| 店舗 P に、`content.categoryId` が廃止された K のままの提供中の掲載がある。K の移行先は M | `categoryIds: {M, K}` で呼ぶ | P の区画が返る | |
| `areaCode` A で K1 の提供中の掲載を持つ店舗 P1、A で K1 の掲載を持たない店舗 P2、B で K1 の提供中の掲載を持つ店舗 P3 | `areaCodes: {A}`・`categoryIds: {K1}` で呼ぶ | P1 の区画だけが返る | |
| K1 の提供期間の開始が 5/10 の掲載だけを持つ店舗 P | `categoryIds: {K1}` で、`today` を 5/9 にして呼ぶ。別に 5/10 にして呼ぶ | 5/9 では返らず、5/10 では返る | |

## findPlaceCells の区画

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P が1件だけ、ある区画にある | `findPlaceCells` を呼ぶ | その区画は `kind: "single"` で、`place` は P の `PlaceEntry`。店舗のない区画は返らない | |
| 位置の違う店舗 P・Q が、同じ区画にある | `findPlaceCells` を呼ぶ | その区画は `kind: "cluster"`、`count: 2`、`extent` は P と Q の位置が収まる最小の矩形 | |
| 上の結果の `extent` を次の `bounds` にする | 同じ `grid` で呼ぶ | P と Q が別々の区画に、それぞれ `kind: "single"` で返る | |
| 同じ位置の店舗 P・Q・T（`registeredAt` は T1 < T2 < T3）が、同じ区画にある | `findPlaceCells` を呼ぶ | その区画は `kind: "colocated"`、`location` はその位置、`places` は T、Q、P の順の `PlaceEntry` | |
| 上と同じ | その位置だけの矩形（南西と北東がどちらもその位置）を `bounds` にして呼ぶ | 同じ `colocated` の区画が1つ返る（同じ位置の店舗は分かれない） | |
| 同じ位置の店舗 P・Q と、位置の違う店舗 S が、同じ区画にある | `findPlaceCells` を呼ぶ | その区画は `kind: "cluster"`、`count: 3` | |
| 店舗が、区画（`column: 2`・`row: 0`）、（`column: 0`・`row: 1`）、（`column: 3`・`row: 1`）に1件ずつある | `findPlaceCells` を呼ぶ | （2, 0）、（0, 1）、（3, 1）の順（`row`、`column` の昇順） | |
| `bounds` の内側に、位置の違う店舗が30件ある | `grid` を 1 × 1 にして呼ぶ | 1件の `cluster` の区画が `count: 30` で返る（件数は区画の数で限られる） | |
| 同じ経度に店舗 P・Q があり、`bounds` は幅が 0（西端と東端がその経度） | `findPlaceCells` を呼ぶ | どちらの区画も `column: 0`。`row` は緯度で決まる | |
| 写真のない店舗 P に、提供中の掲載がある。P だけの区画 | `findPlaceCells` を呼ぶ | `place.substituteCover` は、その掲載と代表写真 | |

## findPlaceCells の選んでいる地域

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の地域 R に所属する店舗 P は、`criteria` に合わない。店舗 Q は `criteria` に合い、R に所属しない。P と Q は別々の区画 | `selectedRegionId: R` と、その `criteria` で呼ぶ | P と Q の区画は、どちらも `single`。P の `place.regions` に R が含まれ、Q の `place.regions` に R は含まれない | |
| 上と同じ | `selectedRegionId: null` で呼ぶ | Q の区画だけが返る | |
| R に所属し、`criteria` にも合う店舗 P | `selectedRegionId: R` で呼ぶ | P は1回だけ現れる（`single` の区画が1つ） | |
| R に所属する店舗 P・Q と、所属しない店舗 S が、位置の違う店舗として同じ区画にある。どれも `criteria` に合う | `selectedRegionId: R` で呼ぶ | その区画は `cluster` で、`count: 3`・`affiliatedCount: 2` | |
| R に所属する店舗 P・Q と、所属しない店舗 S が、同じ位置にある。どれも `criteria` に合う | `selectedRegionId: R` で呼ぶ | その区画は `colocated` で、`places` の P・Q の `regions` に R が含まれ、S の `regions` に R は含まれない | |
| R に所属する店舗 P・Q が、位置の違う店舗として同じ区画にある | `selectedRegionId: null` で呼ぶ | その区画は `cluster` で、`affiliatedCount: 0` | |
| R に、閉店した店舗と非公開の店舗が所属している | `selectedRegionId: R` で呼ぶ | どちらも現れない | |
| R に所属する店舗 P の位置が、`bounds` の外側 | `selectedRegionId: R` で呼ぶ | P は現れない | |
| 地域 R が `unpublished`、または運営による非公開。R に所属する店舗 P は `criteria` に合わず、R に所属する店舗 Q は `criteria` に合う | `selectedRegionId: R` で呼ぶ | どちらも、P は現れない。Q の区画は `single` で返り、`place.regions` に R は含まれない | |
| その ID の地域がない | その ID を `selectedRegionId` にして呼ぶ | `selectedRegionId: null` と同じ結果。エラーにならない | |

## findMapExtent

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗が1つもない | `places` の範囲で、`areaCodes: null` で呼ぶ | `null` | |
| 店舗 P が1件だけ | `places` の範囲で、`areaCodes: null` で呼ぶ | 南西と北東がどちらも P の位置の矩形 | |
| 離れた位置に店舗 P・Q・S。さらに離れた位置に、閉店した店舗と非公開の店舗 | `places` の範囲で、`areaCodes: null` で呼ぶ | P・Q・S の位置が収まる最小の矩形。閉店した店舗と非公開の店舗は関わらない | |
| `areaCode` A の店舗 P・Q と、B の店舗 S | `places` の範囲で、`areaCodes: {A}` で呼ぶ | P と Q の位置が収まる最小の矩形 | |
| `areaCode` A の店舗 P は掲載を持ち、同じ A の店舗 T は掲載を持たない | `places` の範囲で、`areaCodes: {A}` で呼ぶ | P と T の位置が収まる最小の矩形（掲載とカテゴリーは関わらない） | |
| `areaCode` A の店舗がない。または `areaCodes` が空の集合 | `places` の範囲で呼ぶ | どちらも `null` | |
| 公開中の地域 R に、店舗 P・Q が所属している | `region` の範囲で R を指定して呼ぶ | R の位置と、P・Q の位置が収まる最小の矩形 | |
| 公開中の地域 R に、所属する店舗がない | `region` の範囲で R を指定して呼ぶ | 南西と北東がどちらも R の位置の矩形 | |
| 公開中の地域 R に所属する店舗が、閉店した店舗と非公開の店舗だけ | `region` の範囲で R を指定して呼ぶ | R の位置だけの矩形 | |
| 地域 R が `unpublished`、または運営による非公開。または、その ID の地域がない | `region` の範囲で呼ぶ | どれも `null` | |

## findPlacesInBounds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `bounds` の内側に、営業中の店舗、休業中の店舗、閉店した店舗、非公開の店舗。外側に営業中の店舗 | `findPlacesInBounds` を呼ぶ | 内側の営業中の店舗と休業中の店舗の `PlaceEntry` が返る。`count` は 2 | |
| 店舗が混ざった前提で、`areaCodes` と `categoryIds` を持つ `criteria` | 同じ `bounds`・`criteria`・`today` で、`findPlacesInBounds`（`limit: 100`）と、`selectedRegionId: null` の `findPlaceCells` を呼ぶ | `findPlacesInBounds` の `count` が、区画の店舗の件数（`single` は 1、`cluster` は `count`、`colocated` は `places` の件数）の合計と一致する。`single` と `colocated` の区画の店舗は、すべて `items` に含まれる | |
| 店舗 P1・P2・P3 の `registeredAt` が T1 < T2 < T3 | `origin: null` で呼ぶ | P3、P2、P1 の順 | |
| `registeredAt` が同じ店舗が2つ | `origin: null` で呼ぶ | `PlaceId` の昇順 | |
| 店舗 P1・P2・P3 の位置が、`origin` から 100 m・500 m・2 km。`registeredAt` は P3 が最も新しい | その `origin` で呼ぶ | P1、P2、P3 の順 | |
| `Geo.distanceMeters` が同じになる2つの店舗。`registeredAt` が違う | `origin` つきで呼ぶ | `registeredAt` の新しい店舗が先 | |
| 対象の店舗がない | `findPlacesInBounds` を呼ぶ | `items` は空、`count` は 0 | |
| 対象の店舗が1つ | `findPlacesInBounds` を呼ぶ | `items` は1件、`count` は 1 | |
| 対象の店舗が3つ | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 対象の店舗が5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## findRegions

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域が1つもない | `findRegions` を呼ぶ | `items` は空、`count` は 0 | |
| `published` の地域 R1、`draft` の地域、`unpublished` の地域、`published` で運営による非公開の地域 | 条件をすべて `null` にして呼ぶ | R1 だけが返る。`count` は 1 | |
| 所属する店舗を持たない公開中の地域と、所属する店舗に掲載がない公開中の地域 | 条件をすべて `null` にして呼ぶ | どちらも返る | |
| 位置が `bounds` の内側の地域 R1、外側の地域 R2、`bounds` の北東の角とちょうど同じ位置の地域 R3 | その `bounds` で呼ぶ | R1 と R3 が返る | |
| 所在地の `areaCode` が A の地域 R1。所在地は B で、所属する営業中の店舗の所在地が A の地域 R2。所在地も所属する店舗の所在地も B の地域 R3 | `areaCodes: {A}` で呼ぶ | R1 と R2 が返る | |
| 所在地が B の地域 R に所属する、所在地が A の店舗が、非公開の店舗だけ | `areaCodes: {A}` で呼ぶ | R は返らない | |
| 上の前提で、所在地が A の閉店した店舗が R に所属している。別に、所在地が A の休業中の店舗だけが所属する、所在地が B の地域 R' がある | `areaCodes: {A}` で呼ぶ | R と R' が返る（閲覧できる所属店舗は休業・閉店を含む） | |
| 公開中の地域がある | `areaCodes` を空の集合にして呼ぶ | `items` は空、`count` は 0 | |
| 位置が `vicinity.center` から 900 m の地域 R1、ちょうど 1,000 m の地域 R2、1,100 m の地域 R3 | `vicinity` の `radiusMeters` を 1000 にして呼ぶ | R1 と R2 が返る（半径ちょうどを含む） | |
| 位置が `vicinity.center` から 5 km の地域 R4 に、800 m の閉店した店舗が所属している。5 km の地域 R5 に、800 m の非公開の店舗だけが所属している | `radiusMeters` を 1000 にして呼ぶ | R4 は返り、R5 は返らない（`Vicinity.includesRegion` と `RegionFootprint.of`） | |
| `bounds` の内側で `areaCode` A の地域 R1、`bounds` の内側で B の地域 R2、`bounds` の外側で A の地域 R3 | その `bounds` と `areaCodes: {A}` で呼ぶ | R1 だけが返る（与えた条件のすべてが成り立つ地域） | |
| 地域 R1・R2・R3 の `firstPublishedAt` が T1 < T2 < T3。R1 は公開を取り下げた後、T3 より後に再び公開されている | `origin: null` で呼ぶ | R3、R2、R1 の順 | |
| `firstPublishedAt` が同じ地域が2つ | `origin: null` で呼ぶ | `RegionId` の昇順 | |
| 地域 R1・R2 の位置が、`origin` から 5 km・1 km。`firstPublishedAt` は R1 が新しい | その `origin` で呼ぶ | R2、R1 の順 | |
| 地域 R1 の位置は `origin` から 5 km で、R1 に所属する閉店した店舗の位置は 500 m。地域 R2 の位置は 1 km。地域 R3 の位置は 3 km で、R3 に所属する非公開の店舗の位置は 100 m | その `origin` で呼ぶ | R1、R2、R3 の順（地域の距離は、`RegionFootprint.of(…, "reference")` の位置のうち最も近いものまで。非公開の店舗は効かない） | |
| 対象の地域が3つ | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 対象の地域が5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## findPlacesOfRegion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の地域 R に、所属する店舗がない | R で呼ぶ | `items` は空、`count` は 0 | |
| R に、店舗 P（`affiliatedAt` が T1）、Q（T2）、S（T3）が所属している。`registeredAt` は P が最も新しい | R で呼ぶ | S、Q、P の順（`affiliatedAt` の降順）。`count` は 3 | |
| R に、同じ `affiliatedAt` で店舗が2つ所属している | R で呼ぶ | `PlaceId` の昇順 | |
| R に、休業中の店舗、閉店した店舗、非公開の店舗が所属している | R で呼ぶ | 休業中の店舗だけが返る | |
| 店舗 P が R と S に所属し、代表地域は S | R で呼ぶ | P が返る。`regions` は S、R の順 | |
| 店舗 P が R との所属を解除（`leave` または `exclude`）して保存されている | R で呼ぶ | P は現れない | |
| 地域 R が `unpublished`、または運営による非公開。または、その ID の地域がない | R で呼ぶ | どれも `items` は空、`count` は 0 | |
| R に対象の店舗が5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## findListingsOfRegion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の地域 R に所属する店舗 P・Q に、フィード対象の掲載 L1（P）・L2（Q）・L3（P）があり、`firstPublishedAt` は T1 < T2 < T3 | R で、`excludingPlaceId: null` で呼ぶ | L3、L2、L1 の順の `ListingEntry`。`count` は 3 | |
| 上と同じ | `excludingPlaceId: P` で呼ぶ | L2 だけが返る。`count` は 1 | |
| `firstPublishedAt` が同じ掲載が2件 | R で呼ぶ | `ListingId` の昇順 | |
| R に所属する営業中の店舗に、提供開始前・提供終了・`unpublished`・運営による非公開の掲載がある。R に所属する閉店した店舗と非公開の店舗に、`published` で提供中の掲載がある | R で呼ぶ | どれも現れない | |
| R に所属する休業中の店舗に、`published` で提供中の掲載がある | R で呼ぶ | 現れる | |
| 店舗 P は R と S に所属し、代表地域は S。P にフィード対象の掲載がある | R で呼ぶ | P の掲載が返る（代表地域に限らない） | |
| R に所属しない店舗に、フィード対象の掲載がある | R で呼ぶ | 現れない | |
| 地域 R が `unpublished`、または運営による非公開。または、その ID の地域がない | R で呼ぶ | どれも `items` は空、`count` は 0 | |
| R に所属する店舗はあるが、対象の掲載がない | R で呼ぶ | `items` は空、`count` は 0 | |
| R に対象の掲載が5件 | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## findOccasions

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベントが1つもない | `findOccasions` を呼ぶ | `items` は空、`count` は 0 | |
| 参加を1つも持たない、開催前の公開中のイベント E | `findOccasions` を呼ぶ | E が返る。`count` は 1 | |
| 開催期間が 5/1〜5/10 の公開中のイベント E | `today` を 4/30、5/1、5/10、5/11 にして、それぞれ呼ぶ | 4/30・5/1・5/10 では返り、5/11 では返らない | |
| 開催前で `cancellation.cancelled: true` のイベント | `findOccasions` を呼ぶ | 現れない | |
| 中止を取り消した（`revokeCancellation`）開催前のイベント | `findOccasions` を呼ぶ | 現れる | |
| 開催前のイベントが、`draft`、`unpublished`、運営による非公開のいずれか | `findOccasions` を呼ぶ | どれも現れない | |
| 対象のイベント E1（5/1〜5/5）、E2（4/28〜5/2）、E3（5/1〜5/3）。`firstPublishedAt` は E1 が最も新しい | `findOccasions` を呼ぶ | E2、E3、E1 の順 | |
| 開催期間が同じ対象のイベントが2つ | `findOccasions` を呼ぶ | `OccasionId` の昇順 | |
| 対象のイベントが3つ | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 対象のイベントが5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## findArticles

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 読みものが1つもない | `findArticles` を呼ぶ | `items` は空、`count` は 0 | |
| `published` の読みもの A1、`draft` の読みもの、`unpublished` の読みもの | `findArticles` を呼ぶ | A1 だけが返る。`count` は 1 | |
| 紹介先を持たない公開中の読みものと、紹介先がすべて閲覧できない公開中の読みもの | `findArticles` を呼ぶ | どちらも返る | |
| 公開中の読みもの A1・A2・A3 の `firstPublishedAt` が T1 < T2 < T3。A1 は公開を取り下げた後、T3 より後に再び公開されている | `findArticles` を呼ぶ | A3、A2、A1 の順 | |
| `firstPublishedAt` が同じ読みものが2つ | `findArticles` を呼ぶ | `ArticleId` の昇順 | |
| 公開中の読みものが3つ | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 公開中の読みものが5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## 可視性と UnitOfWork

このポートは UnitOfWork に参加しない。各ドメインの書き込みのコミットとロールバックが、読み取りにどう現れるかを確かめる。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗が保存されていない | UnitOfWork の中で店舗 P を `insert` してコミットし、直後に `findPlaceCells`・`findPlacesInBounds`・`findMapExtent` を呼ぶ | どれにも P が反映されている | |
| 営業中の店舗 P | P の営業状況を閉店にして `save` してコミットし、直後に `findPlaceCells`・`findPlacesInBounds` を呼ぶ | どちらにも P は現れない | |
| K1 の `draft` の掲載だけを持つ店舗 P | 掲載を `publish` して `save` してコミットし、直後に `categoryIds: {K1}` で `findPlaceCells` を呼ぶ | P の区画が返る | |
| 公開中の地域 R と、R に所属しない店舗 P | P の `PlaceAffiliations` に R との所属を加えて保存してコミットし、直後に `findPlacesOfRegion`・`findListingsOfRegion`・`region` の範囲の `findMapExtent` を呼ぶ | どれにも P（とその掲載、その位置）が反映されている | |
| 公開中の地域 R | R を運営による非公開にして `save` してコミットし、直後に `findRegions`・`findPlacesOfRegion` を呼ぶ。続けて、解除して `save` してコミットし、もう一度呼ぶ | 1回目は R が現れず、R の店舗の一覧は空。2回目は、どちらも元の結果に戻る | |
| `draft` のイベント E と `draft` の読みもの A（どちらも公開条件を満たす） | それぞれ `publish` して `save` してコミットし、直後に `findOccasions`・`findArticles` を呼ぶ | E と A が現れる | |
| 店舗が保存されていない | UnitOfWork の中で店舗 P を `insert` した後に、`fn` が例外を投げる | どの読み取りにも P は現れない | |
| 公開中の地域 R | UnitOfWork の中で、`unpublish` した R を `save` した後に、`fn` が例外を投げる | `findRegions` に R が現れる | |
