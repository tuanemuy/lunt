# Discovery

閲覧者に見せる範囲の規則、フィードの構成、絞り込み・検索・地図・詳細の読み取りを提供する。読み取り専用で、集約も書き込みも持たない。

共有カーネルの ID・`ContentRef`・`ShowcaseRef`・`LocalDate`・`GeoPoint`・`GeoBounds`・`AreaCode`・`Publication`・`Suspension`・`PhotoSet` と、キーワードの一致（`SearchKeyword`・`SearchableText`・`KeywordRelevance`）を使う（[index.md](index.md)）。Area・Place・Listing・Region・Occasion・Article の状態の型と純粋な関数と、Authority の `Stewardship`（候補の範囲の判定）を、名前で参照する。

- Discovery は保存された状態を持たない。どの読み取りも、各ドメインの集約の現在の状態から求める
- 「閲覧できる」の定義と、発見の場面・参照の場面の表示範囲の規則は、`VisibilityPolicy` だけが持つ。各読み取りは、場面を引数か固定値で持つ
- 閲覧できない対象は、どの読み取りにも現れない。閲覧できない理由（下書き、一時非公開、公開の取り下げ、運営による非公開、店舗の非公開、削除、存在しない）は区別しない（CS-06）
- 提供状態は Listing の `OfferingStatus.of`、開催の状態は Occasion の `HoldingStatus.of`、カテゴリーの解決は Listing の `CategoryCatalog.resolve`・`predecessorsOf`、エリアの展開は Area の `AreaCatalog.expand`、閲覧者に示す地域は Region の `PlaceAffiliations.displayedRegion`、閲覧者に示す参加日は Occasion の `Participation.visibleDates` が定める。Discovery はこれらを定義し直さない
- 店舗管理者の有無と、閲覧者がその店舗の店舗管理者かどうか（Authority の `StewardshipRepository.findById` と `Stewardship.isVacant`・`isSteward`）、閲覧者が店舗の管理権限を持つかどうか（`StewardshipRepository.findPageBySteward`）、写真の表示用の参照（Media の `PhotoStorage.displayRefs`）は、ユースケースが各ドメインのポートから読んで、読み取りの結果に合成する。対象の選択の候補を管理者のいない店舗に限る範囲（`SelectionScope`）だけは、ページと全件数を範囲の中で決めるため、`KeywordSearchQueries` が Authority の `Stewardship.isVacant` で絞る
- 保存済みかどうかは Bookmark の `getSavedTargets` が返す。Discovery の読み取りは、保存済みかどうかを結果に持たない

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Viewable | 閲覧できる | 対象が閲覧者に見せられる状態にあること。公開状態・運営による非公開・店舗の非公開だけで決まり、日付と営業状況では変わらない |
| Scene | 場面 | 公開中の対象を表示する文脈の種類。発見の場面と参照の場面の2つ |
| Discovery scene | 発見の場面 | 新たな訪問先を見つける文脈。発見の対象でない対象を表示しない |
| Reference scene | 参照の場面 | 名指しした対象や、その対象に結びついた対象を確かめる文脈。発見の対象でない対象も、状態を区別して表示する |
| Standing | 対象の状態 | 場面の規則が見て、閲覧者に示す状態。掲載は提供状態（提供開始前は開始日を持つ）と店舗の営業状況、店舗は営業状況、イベントは開催の状態。地域と読みものは、場面で変わる状態を持たない |
| Discoverable | 発見の対象 | 提供中で、閉店していない店舗の掲載。閉店していない店舗。開催前・開催中のイベント。すべての地域と読みもの |
| Feed | フィード | 掲載の並びに、大きな枠を一定の間隔で挿入した並び |
| Feed listing | フィード対象の掲載 | 閲覧できて、発見の対象である掲載 |
| Large frame | 大きな枠 | フィードで地域・読みもの・イベントを紹介する枠 |
| Frame slot | 枠位置 | フィードの中で大きな枠を置く位置。先頭と、掲載6件ごとの後ろ |
| Frame rotation | 巡回 | 大きな枠の種類を 地域 → 読みもの → イベント の順に回すこと |
| BrowseCriteria | 絞り込みの条件 | 選択中のエリアとカテゴリー。フィード・地図・地図の一覧に効き、エリアの条件だけが地域の一覧に効く |
| Origin | 現在地 | 位置情報の利用を許可した閲覧者の位置。近い順の基準 |
| Vicinity | 周辺 | 現在地を中心とする円の範囲。半径は1つの設定値 |
| Exploration focus | 探索の焦点 | 地図の初めの範囲と地域の一覧が対象を集める先。選択エリア、現在地の周辺、すべてのどれか |
| Selection scope | 候補の範囲 | 入力の途中の対象の選択で、呼び出す操作のシナリオが定める候補の範囲 |
| Region footprint | 地域の足あと | 地域自身と、その所属店舗の所在地・位置の並び。地域がエリア・周辺にあるかの判定、現在地から地域までの距離、地域の地図の範囲の元になる |
| Recency | 新しさ | 対象が最初に公開された日時。掲載・地域・イベント・読みものは `firstPublishedAt`、店舗は `registeredAt` |
| Relevance | 関連度 | キーワードと対象の文字列の近さを表す数値。共有カーネルの `KeywordRelevance.relevance` の値 |
| Displayed region | 一覧に示す地域 | 店舗と掲載の一覧に示す地域。Region の `displayedRegion` の結果 |
| Cover photo | 一覧の写真 | 一覧と概要に示す1枚の写真。対象の代表写真。写真のない店舗は、その店舗の閲覧できる掲載のうち、最初の公開が最も新しい掲載の代表写真で代用する |
| Entry | 読み取りの結果 | 閲覧できる対象の集約と、投影に要る結びつき（所属地域、代用の写真）の組 |
| Summary | 要約 | 一覧・概要・枠に示す、対象の主な項目の投影 |
| Map cell | 地図の区画 | 地図の範囲を格子に分けた1区画と、その中の店舗。1件の店舗、位置の違う店舗のまとまり、同じ位置の店舗だけのまとまりのどれか。まとめ方は `MapClustering` が定める |

## エンティティ

なし。Discovery は生成・変更・削除する対象を持たない。閲覧者に見せる対象は、各ドメインの集約（`Place`、`Listing`、`Region`、`PlaceAffiliations`、`Occasion`、`Participation`、`RegionLink`、`Article`）で、Discovery はその型を読み取りの結果に使う。

## 値オブジェクト

### Scene / Standing

```ts
type Scene = "discovery" | "reference";

type Standing =
  | Readonly<{ kind: "listing"; offering: OfferingStatus; operating: OperatingStatus }>
  | Readonly<{ kind: "place"; operating: OperatingStatus }>
  | Readonly<{ kind: "occasion"; holding: HoldingStatus }>
  | Readonly<{ kind: "region" }>
  | Readonly<{ kind: "article" }>;
```

- `Standing.ofListing(listing: PublishedListing, place: Place, today: LocalDate)`: `offering` は `Listing.offeringStatus(listing, today)`、`operating` は `place.operatingStatus`
- `Standing.ofPlace(place: Place)`、`Standing.ofOccasion(occasion: PublishedOccasion, today: LocalDate)`（`Occasion.holdingStatus` の結果。公開中のイベントは開催期間を持つので `null` にならない）
- 等価性: すべてのフィールドの一致

### BrowseCriteria / ResolvedCriteria

```ts
type BrowseCriteria = Readonly<{
  areas: readonly AreaSelection[];    // 空は「エリアの条件なし」
  categoryIds: readonly CategoryId[]; // 空は「カテゴリーの条件なし」
}>;

type ResolvedCriteria = Readonly<{
  areaCodes: ReadonlySet<AreaCode> | null;     // null は条件なし。空の集合は「どの対象も合わない」
  categoryIds: ReadonlySet<CategoryId> | null; // 掲載に保存された CategoryId と比べる集合。null は条件なし
  effective: BrowseCriteria;                   // 効いている条件。選択中の条件の表示に使う
}>;
```

`BrowseCriteria.resolve(criteria: BrowseCriteria, expanded: ReadonlySet<AreaCode>, catalog: CategoryCatalog): ResolvedCriteria`

- `areas` は `AreaSelection.dedupe` でまとめる。空なら `areaCodes` は `null`。空でなければ `expanded`（ユースケースが `AreaCatalog.expand` で求めた集合）
- `categoryIds` のうち、`catalog` の現役のカテゴリーだけを残す。廃止されたカテゴリーと台帳にない ID は条件から外れる。残りが空なら `categoryIds` は `null`。空でなければ、残った各カテゴリーの `CategoryCatalog.predecessorsOf` の和集合
- `effective` は、まとめたエリアの選択と、残ったカテゴリー
- エリアだけ、カテゴリーだけ、両方のどれでも成り立つ。選んでいない種類の条件は効かない

条件に合うかどうかの判定は、次の純粋な関数だけが定める。

| 関数 | 判定 |
| --- | --- |
| `BrowseCriteria.inAreas(areaCodes, address: Address): boolean` | `areaCodes` が `null`、または `address.areaCode` が含まれる |
| `BrowseCriteria.matchesListing(resolved, listing: PublishedListing, place: Place): boolean` | `inAreas(resolved.areaCodes, place.profile.address)`、かつ `resolved.categoryIds` が `null` または `listing.content.categoryId` が含まれる（V-09、P-12） |
| `BrowseCriteria.matchesPlace(resolved, place: Place, listings: readonly PublishedListing[], today): boolean` | `inAreas(resolved.areaCodes, place.profile.address)`、かつ `resolved.categoryIds` が `null`、または `listings`（その店舗の閲覧できる掲載）に、提供状態の段階が `available` で `categoryId` が含まれる掲載がある（EXP-01） |
| `BrowseCriteria.matchesRegion(areaCodes, footprint: RegionFootprint): boolean` | `areaCodes` が `null`、または `footprint` のどれかの `address.areaCode` が含まれる（V-16）。`footprint` は `RegionFootprint.of(…, "reference")`。カテゴリーの条件は効かない（I-09） |
| `BrowseCriteria.matchesOccasion(resolved, occasion: PublishedOccasion): boolean` | `inAreas(resolved.areaCodes, occasion.content.venue.address)`。カテゴリーの条件は効かない（V-47） |

### SearchKeyword

キーワードは共有カーネルの `SearchKeyword`（[index.md](index.md)「キーワードの一致」）。キーワード検索は `SearchKeyword.create`、対象の選択の候補は `SearchKeyword.parse` を使う。

### SelectionScope

```ts
type SelectionScope =
  | Readonly<{ kind: "place"; vacantOnly: boolean }>    // true: 管理者のいない店舗だけ
  | Readonly<{ kind: "listing" }>
  | Readonly<{ kind: "region" }>
  | Readonly<{ kind: "occasion"; openOnly: boolean }>; // true: 開催前・開催中のイベントだけ
```

対象の選択の候補の範囲。範囲は呼び出す操作のシナリオが定め、呼び出す側が渡す。候補は、閲覧できる対象のうち、次の判定が成り立つものに限る。範囲の外の対象は候補に現れず、全件数にも含まれない。

| 関数 | 判定 |
| --- | --- |
| `SelectionScope.admitsPlace(vacantOnly: boolean, stewardship: Stewardship): boolean` | `vacantOnly` が `false`、または Authority の `Stewardship.isVacant(stewardship)`。管理体制の保存がない店舗は `Stewardship.vacant(target)` として当てる |
| `SelectionScope.admitsOccasion(openOnly: boolean, standing: Extract<Standing, { kind: "occasion" }>): boolean` | `openOnly` が `false`、または `holding` が `upcoming`・`ongoing` |

- 掲載と地域の範囲は、閲覧できるすべての対象
- 範囲の中で、呼び出す操作の「受け付けない事情」に当たる対象（すでに選んだ対象、すでに参加中の店舗など）は、候補に現れる。選べるかどうかは Discovery は区別せず、呼び出す操作の受け付ける条件を持つドメインが決める（申請の対象は Application の `SubmissionScope`）

### Vicinity / MapGrid / MapScope

```ts
type Vicinity = Readonly<{ center: GeoPoint; radiusMeters: number }>;
type MapGrid = Readonly<{ columns: number; rows: number }>;
type MapScope =
  | Readonly<{ kind: "places"; areaCodes: ReadonlySet<AreaCode> | null }> // null はエリアの条件なし
  | Readonly<{ kind: "region"; regionId: RegionId }>;
```

- `Vicinity.create`: `radiusMeters` は正の有限の数。違えば `BusinessRuleError`（`DISCOVERY_INVALID_VICINITY`）。半径は1つの設定値で、ユースケースが渡す。地域の一覧の周辺と地図の初めの範囲の周辺は、同じ1つの設定値を使う（`spec/scenario/index.md`「表示範囲」が同じ範囲とする）
- `Vicinity.includesRegion(vicinity: Vicinity, footprint: RegionFootprint): boolean`: `footprint` のどれかの `location` で `Geo.within(vicinity, location)` が成り立つ。`footprint` は `RegionFootprint.of(…, "reference")`。周辺の地域の判定は、この関数だけが定める
- `MapGrid.create`: `columns`・`rows` は正の整数。違えば `BusinessRuleError`（`DISCOVERY_INVALID_MAP_GRID`）。列と行の数の上限は、転送境界が確かめる
- 地図の読み取りが受け取る範囲は、共有カーネルの `GeoBounds.create` で作る（[index.md](index.md)「値の生成」）

### ExplorationFocus

```ts
type ExplorationFocus =
  | Readonly<{ kind: "areas"; areaCodes: ReadonlySet<AreaCode> }>
  | Readonly<{ kind: "vicinity"; vicinity: Vicinity }>
  | Readonly<{ kind: "everywhere" }>;
```

`ExplorationFocus.of(areaCodes: ReadonlySet<AreaCode> | null, origin: GeoPoint | null, radiusMeters: number): ExplorationFocus`

- `areaCodes` が `null` でなければ `areas`。`null` で `origin` があれば `vicinity`（`Vicinity.create(origin, radiusMeters)`）。どちらもなければ `everywhere`
- 地図の初めの範囲（`findMapExtent`）と地域の一覧（`findRegions`）は、どちらもこの関数で焦点を決める。エリアの選択と現在地のどちらを優先するかは、この関数だけが定める

### RegionFootprint

```ts
type FootprintPoint = Readonly<{ address: Address; location: GeoPoint }>;
type RegionFootprint = readonly FootprintPoint[]; // 先頭は地域自身
```

`RegionFootprint.of(region: PublishedRegion, places: readonly Place[], scene: Scene): RegionFootprint`

- 先頭は地域自身（`region.content.address`・`location`）。続けて、`places`（その地域に所属する店舗）のうち `VisibilityPolicy.isPlaceViewable` と `VisibilityPolicy.admits(scene, Standing.ofPlace(place))` が成り立つ店舗の `profile.address`・`location` を、`places` の順に並べる
- 地域がエリア・周辺にあるかの判定（`BrowseCriteria.matchesRegion`、`Vicinity.includesRegion`）と、近い順の地域の距離（「ポート」の並び順）は `reference` で作る。閲覧できる所属店舗のすべて（休業・閉店を含む）が判定と距離に効く（V-16）
- 地域の地図の範囲（`ExplorationQueries.findMapExtent` の `region`）は `discovery` で作る。地図に示さない閉店した店舗は範囲に効かない
- 地域の判定・距離・範囲に使う所属店舗の集まりは、この関数だけが定める

### Entry

ポートが返す、閲覧できる対象と結びつきの組。

```ts
type SubstituteCover = Readonly<{ listingId: ListingId; photo: ListingPhoto }>;

type PlaceEntry = Readonly<{
  place: Place;
  regions: readonly PublishedRegion[];      // ViewProjection.regionsOf の結果。先頭が一覧に示す地域
  substituteCover: SubstituteCover | null;  // ViewProjection.substituteCover の結果。写真のない店舗の写真の代用
}>;

type ListingEntry = Readonly<{ listing: PublishedListing; place: PlaceEntry }>;

type ParticipantEntry = Readonly<{
  place: PlaceEntry;
  participation: Participation;
  listings: readonly PublishedListing[];    // 添えた掲載のうち閲覧できるもの。添えた順
}>;

type ResolvedTarget =
  | Readonly<{ kind: "listing"; entry: ListingEntry }>
  | Readonly<{ kind: "place"; entry: PlaceEntry }>
  | Readonly<{ kind: "region"; region: PublishedRegion }>
  | Readonly<{ kind: "occasion"; occasion: PublishedOccasion }>;

type ReferenceResolution =
  | Readonly<{ ref: ShowcaseRef; viewable: true; target: ResolvedTarget }>
  | Readonly<{ ref: ShowcaseRef; viewable: false }>;

type Scored<T> = Readonly<{ entry: T; relevance: number }>;

type PlaceCell =
  | Readonly<{ kind: "single"; column: number; row: number; place: PlaceEntry }>
  | Readonly<{
      kind: "cluster";          // 位置の違う店舗のまとまり
      column: number;
      row: number;
      count: number;            // 区画の中の店舗の件数。2以上
      affiliatedCount: number;  // そのうち、選んでいる地域に所属する店舗の件数
      extent: GeoBounds;        // 区画の中の店舗の位置が収まる最小の矩形。幅または高さが 0 でない
    }>
  | Readonly<{
      kind: "colocated";        // 同じ位置の店舗だけのまとまり
      column: number;
      row: number;
      location: GeoPoint;       // 店舗に共通の位置
      places: readonly PlaceEntry[]; // 2件以上。新しい順
    }>;
```

- `PlaceCell` のまとめ方は `MapClustering.cells` だけが定める。店舗が選んでいる地域に所属するかどうかは、`single`・`colocated` では `PlaceEntry.regions` が示し、`cluster` では `affiliatedCount` が示す
- `ReferenceResolution` は、参照の解決の結果。参照ごとに、閲覧できる対象の内容（`target`）か、閲覧できないこと（`viewable: false`）のどちらかを持つ。閲覧できない理由と、存在しない対象との区別を持たない
- どの Entry も、`VisibilityPolicy` で閲覧できる対象だけで作る。`PublishedListing`・`PublishedRegion`・`PublishedOccasion`・`PublishedArticle` の型が、公開中であることを表す
- 等価性: 含む集約の ID の一致

### フィードの型

```ts
type FeedListingCandidate = Readonly<{
  listingId: ListingId;
  placeId: PlaceId;
  regionId: RegionId | null; // 一覧に示す地域。なければ null
}>;

type FeedFrame =
  | Readonly<{ kind: "region"; regionId: RegionId }>
  | Readonly<{ kind: "article"; articleId: ArticleId }>
  | Readonly<{ kind: "occasion"; occasionId: OccasionId }>;

type FeedFrameCandidates = Readonly<{
  regions: readonly RegionId[];     // 種類の中の順
  articles: readonly ArticleId[];
  occasions: readonly OccasionId[];
}>;

type FeedItem = Readonly<{ kind: "listing"; listingId: ListingId }> | FeedFrame;

type FeedPage = Readonly<{
  items: readonly FeedItem[];
  listingCount: number; // 条件に合うフィード対象の掲載の全件数
  hasMore: boolean;
}>;
```

`FeedListingCandidate.of(entry: ListingEntry)` は、`regionId` を `entry.place.regions` の先頭から作る。

### RegionContext / CoverPhoto

```ts
type RegionContext =
  | Readonly<{ kind: "displayed" }>                 // 一覧に示す地域
  | Readonly<{ kind: "within"; regionId: RegionId }>; // 地域内の一覧と、地域の詳細の店舗・掲載の区分。その地域

type CoverPhoto =
  | Readonly<{ source: "own"; photoId: PhotoId; framing: Framing | null }>
  | Readonly<{ source: "listing"; listingId: ListingId; photoId: PhotoId; framing: Framing | null }>;
```

`framing` は掲載の写真だけが持つ。店舗・地域・イベント・読みものの写真では `null`。

## ドメインサービス

すべて純粋な関数で、ポートに依存しない。

### VisibilityPolicy

責務: 「閲覧できる」の定義と、場面ごとの表示範囲の規則を定める唯一の場所（P-87、P-88、B-46）。

| メソッド | 定義 |
| --- | --- |
| `isPlaceViewable(place: Pick<Place, "suspension">): boolean` | 非公開でない |
| `isListingViewable(listing: Pick<Listing, "publication" \| "suspension">, place: Pick<Place, "suspension"> \| null): boolean` | `published`、かつ運営による非公開でない、かつ `place` が `null` でなく `isPlaceViewable(place)`（B-47）。紐づく店舗がなければ閲覧できない |
| `isRegionViewable(region: Pick<Region, "publication" \| "suspension">): boolean` | `published`、かつ運営による非公開でない |
| `isOccasionViewable(occasion: Pick<Occasion, "publication" \| "suspension">): boolean` | `published`、かつ運営による非公開でない。中止と開催の状態は関わらない |
| `isArticleViewable(article: Pick<Article, "publication">): boolean` | `published` |
| `isDiscoverable(standing: Standing): boolean` | 掲載は `offering.phase` が `available` かつ `operating` が `permanentlyClosed` でない。店舗は `operating` が `permanentlyClosed` でない。イベントは `holding` が `upcoming` または `ongoing`。地域と読みものは常に `true` |
| `admits(scene: Scene, standing: Standing): boolean` | `scene` が `reference` なら `true`。`discovery` なら `isDiscoverable(standing)` |

- 表示の条件は、どの読み取りでも「閲覧できる、かつ `admits(scene, standing)`」の1つ。場面ごと・画面ごとの例外を持たない
- 休業中の店舗とその掲載、開催前のイベントは、どちらの場面でも `admits` が成り立つ。状態は `Standing` で区別して示す（V-40、V-42）
- 閲覧できる対象は、`admits` が成り立たない場面でも、詳細では閲覧できる（B-11）。詳細の対象そのものは参照の場面に当たる
- 結びつき（所属、参加、開催地域の関連づけ、紹介先、保存）が指す相手が閲覧できなければ、その結びつきは読み取りに現れない。結びつきそのものは各ドメインに残る（B-10）。開催地域の関連づけは、`linked` の組だけが現れる（R-13）

読み取りごとの場面は次のとおり。

| 場面 | 読み取り |
| --- | --- |
| `discovery`（固定） | フィードの候補、地図、地図の一覧、地図の範囲、地域の一覧、地域内の一覧、イベントの一覧、関係のあるイベント、関係のある他の掲載 |
| `reference`（固定） | キーワード検索、対象の選択の候補（範囲は `SelectionScope`）、詳細の対象そのもの、イベントの参加店舗と添えた掲載、参照の解決（保存一覧、紹介先） |
| 引数 | 店舗の掲載（店舗詳細は `reference`、掲載詳細の他の掲載は `discovery`） |

### Geo

責務: `GeoPoint` の間の距離と、`GeoBounds` に対する判定を定める。近い順・周辺・地図の範囲は、保存先にかかわらずこの定義で決まる。

| メソッド | 定義 |
| --- | --- |
| `distanceMeters(a: GeoPoint, b: GeoPoint): number` | 半径 6,371,000 m の球の上の大円距離。`2R·asin(√(sin²(Δφ/2) + cos φ₁·cos φ₂·sin²(Δλ/2)))`（φ は緯度、λ は経度、ラジアン）を、1 m の単位に四捨五入した整数 |
| `within(vicinity: Vicinity, point: GeoPoint): boolean` | `distanceMeters(vicinity.center, point) <= vicinity.radiusMeters` |
| `contains(bounds: GeoBounds, point: GeoPoint): boolean` | 緯度と経度が、どちらも両端を含めて矩形の中にある |
| `cellOf(bounds: GeoBounds, grid: MapGrid, point: GeoPoint): { column: number; row: number }` | `column = min(columns - 1, floor((経度 - 西端) / (東端 - 西端) × columns))`、`row = min(rows - 1, floor((緯度 - 南端) / (北端 - 南端) × rows))`。幅または高さが 0 の矩形では、その方向の値は 0 |
| `extentOf(points: readonly GeoPoint[]): GeoBounds \| null` | すべての点が収まる最小の矩形。点がなければ `null` |
| `boundsOf(vicinity: Vicinity): GeoBounds` | 周辺の円を囲む矩形。`d = radiusMeters / 6,371,000`（ラジアン）、中心の緯度を φ として、南端・北端は中心の緯度 ∓ d、西端・東端は中心の経度 ∓ `asin(sin d / cos φ)`（どちらも度に直す） |

`Geo.JAPAN: GeoBounds` は、日本全体が収まる範囲の定数。南西は緯度 20・経度 122、北東は緯度 46・経度 154。

### SearchRelevance

責務: キーワード検索の対象の種類ごとに、`SearchableText` を作る関数を決める。一致と関連度は、5種類すべてで共有カーネルの `KeywordRelevance`（[index.md](index.md)「キーワードの一致」）が決め、保存先の全文検索の機能に依存しない。

| 種類 | `SearchableText` を作る関数 |
| --- | --- |
| 店舗 | Place の `PlaceMatching.searchableText` |
| 掲載 | Listing の `ListingMatching.searchableText` |
| 地域 | Region の `Region.searchableText` |
| イベント | Occasion の `Occasion.searchableText` |
| 読みもの | Article の `Article.searchableText` |

- 5種類とも、対象の文字列は各ドメインの関数が定める。掲載・地域・イベントは、サービス運営者の検索（各リポジトリの `searchForOperation`）と同じ値になる。Discovery は定義し直さない
- 選択中のエリア・カテゴリーの条件は、一致に関わらない

### MapClustering

責務: 地図の区画の店舗のまとめ方（`PlaceCell`）を定める唯一の場所。地図（`ExplorationQueries.findPlaceCells`）と参加店舗マップ（`locateParticipants`）が同じまとめ方を使う。

`MapClustering.cells(bounds: GeoBounds, grid: MapGrid, places: readonly PlaceEntry[], selectedRegionId: RegionId | null): readonly PlaceCell[]`

- `places` のうち `Geo.contains(bounds, location)` が成り立つ店舗を、`Geo.cellOf(bounds, grid, location)` の区画に分ける。店舗のない区画は返さない
- 区画の中の店舗が1件なら `single`。2件以上で位置がすべて等しければ `colocated`（`location` はその位置、`places` は区画のすべての店舗を新しい順）。ほかは `cluster`（`count` は区画の店舗の件数、`extent` は区画の店舗の位置の `Geo.extentOf`、`affiliatedCount` は `PlaceEntry.regions` に `selectedRegionId` の地域を含む店舗の件数。`selectedRegionId` が `null` なら 0）
- 並び順は `row`、`column` の昇順
- まとまり（`cluster`）は、`extent` を次の `bounds` にしてまとめ直すと店舗が分かれる。同じ位置の店舗は縮尺を変えても分かれないので、`colocated` は店舗の一覧を持ち、拡大せずに一覧から選ぶ

### ViewProjection

責務: Entry と要約（Summary）の作り方を定める。一覧に示す地域名、写真のない店舗の写真の代用、掲載の要約の内容は、ここだけが定める。

| メソッド | 定義 |
| --- | --- |
| `regionsOf(affiliations: PlaceAffiliations \| null, regions: readonly Region[]): readonly PublishedRegion[]` | 所属地域のうち `VisibilityPolicy.isRegionViewable` が成り立つ地域を返す。先頭は `PlaceAffiliations.displayedRegion(affiliations, 閲覧できる地域の ID)` の地域、以降は所属した順。`affiliations` が `null`、または閲覧できる所属地域がなければ空（P-15、P-16、B-25） |
| `substituteCover(place: Place, listings: readonly PublishedListing[]): SubstituteCover \| null` | 店舗が写真を持つか、`VisibilityPolicy.isPlaceViewable(place)` が成り立たなければ `null`。それ以外は、`listings`（その店舗の掲載）のうち `VisibilityPolicy.isListingViewable` が成り立つ掲載を「新しい順」に並べた先頭の掲載の代表写真。提供状態を問わない。閲覧できる掲載がなければ `null`（P-43） |
| `placeEntry(place, affiliations, regions, listings): PlaceEntry` | 上の2つから `PlaceEntry` を作る。in-memory のアダプターと、公開前の確認のユースケースが使う |
| `regionLabel(entry: PlaceEntry, context: RegionContext): PublishedRegion \| null` | `displayed` なら `entry.regions` の先頭（なければ `null`。地域名を示さない）。`within` なら、`entry.regions` のうちその地域 |
| `listingSummary(entry: ListingEntry, context: RegionContext, today: LocalDate): ListingSummary` | 掲載の要約 |
| `placeSummary(entry: PlaceEntry, context: RegionContext): PlaceSummary` | 店舗の要約と、地図の概要 |
| `regionSummary(region: PublishedRegion)`、`occasionSummary(occasion: PublishedOccasion, today)`、`articleSummary(article: PublishedArticle)` | 地域・イベント・読みものの要約と、大きな枠 |
| `previewListing(input: { content: ListingContent; place: Place; affiliations: PlaceAffiliations \| null; regions: readonly Region[] }, today: LocalDate): ListingPreview` | 公開していない掲載の内容を、`listingSummary` と掲載の詳細と同じ規則で投影する |
| `previewArticle(content: ArticleContent, showcases: readonly ReferenceResolution[], today: LocalDate): ArticlePreview` | 公開していない読みものの内容を、`articleSummary` と記事と同じ規則で投影する。紹介先は `showcases` の順で、閲覧できる紹介先は状態つきの要約、閲覧できない紹介先は閲覧できないことだけを持つ |
| `pickOtherListings(self: ListingId, samePlace: readonly ListingEntry[], sameRegion: readonly ListingEntry[], limit: number): readonly ListingEntry[]` | 掲載の詳細の「他の掲載」。`samePlace` から `self` を除いた並びに `sameRegion` を続け、先頭の `limit` 件を返す。`limit` は画面の件数で、呼び出す側が渡す |

投影の規則は次のとおり。

| 要約 | 示す内容 | 示さない内容 |
| --- | --- | --- |
| `ListingSummary` | 代表写真（`CoverPhoto` の `own`。見せる範囲を含む）、掲載の名称、店舗の名称、`regionLabel` の地域名、`Standing`（提供開始前は開始日を持つ）、掲載と店舗の ID | 価格とキャッチコピー（型に持たない。V-06、B-02）、説明、カテゴリー |
| `PlaceSummary` | `CoverPhoto`（店舗の代表写真。なければ `substituteCover`。どちらもなければ `null`）、名称、所在地、位置、`regionLabel` の地域名、営業状況 | 紹介、訪問情報 |
| `RegionSummary` | 代表写真、名称、キャッチコピー（あれば）、所在地、位置 | 紹介 |
| `OccasionSummary` | 代表写真、名称、キャッチコピー（あれば）、開催期間、開催場所、開催の状態 | 紹介 |
| `ArticleSummary` | 代表写真、タイトル | 本文 |

- 掲載名・店舗名・地域名は別の項目として持つ（V-05、B-02）。地域名は登録された所属に基づき、フィードで隣り合う地域の枠とは関係しない（B-01）
- `RegionContext` は、地域内の一覧と、地域の詳細の店舗・掲載の区分が `within`（その地域）、ほかの一覧・概要・枠が `displayed`
- 写真の代用の規則は `substituteCover` だけが持つ。他のドメインのユースケースが代用を得る経路は、「ReferenceQueries」の使う側の表による
- 詳細の投影は、対象の集約の内容をそのまま示す。店舗の詳細は、写真のない店舗を写真なしで示し、`substituteCover` を使わない。店舗と掲載の詳細の地域は、`PlaceEntry.regions` のすべてをその順で示す
- 掲載のカテゴリーは、ユースケースが `CategoryCatalog.resolve` で現役のカテゴリーにして示す
- `ListingPreview` と `ArticlePreview` は、公開条件を欠く内容も投影できるよう、名称・タイトル・代表写真を `null` にできる。店舗が非公開でも投影する。`previewArticle` の `showcases` は、紹介先を `ReferenceQueries.resolve` で解決した結果のすべて（閲覧できない紹介先を含む）
- 公開前の確認は、Discovery の読み取りのポートを閲覧できない対象に広げない。ユースケースが、掲載・読みもの・店舗・所属・地域を各ドメインのリポジトリから読み、操作する人がその対象を管理する人（掲載は `manage_target`、読みものは `edit_articles`。提出前の掲載の申請は申請者本人の入力）であることを確かめてから、この関数に渡す

### FeedComposer

責務: フィードの構成を定める。掲載の候補の優先順と大きな枠の候補の順から、フィードの並びを決める。保存先に依存せず、同じ候補からは常に同じ並びになる。

```ts
const LISTINGS_PER_FRAME = 6;
const FRAME_ROTATION = ["region", "article", "occasion"] as const;
```

| メソッド | 定義 |
| --- | --- |
| `conflicts(a: FeedListingCandidate, b: FeedListingCandidate): boolean` | `placeId` が等しい、または `regionId` がどちらも `null` でなく等しい |
| `arrange(candidates: readonly FeedListingCandidate[]): readonly FeedListingCandidate[]` | 掲載の並びを決める（下の「掲載の混ぜ方」） |
| `slotCount(listingCount: number): number` | `listingCount` が 0 なら 0。それ以外は `floor(listingCount / LISTINGS_PER_FRAME) + 1` |
| `assignFrames(candidates: FeedFrameCandidates, slots: number): readonly (FeedFrame \| null)[]` | 枠位置ごとの大きな枠を決める（下の「大きな枠の巡回」） |
| `requirement(pagination: Pagination): { listings: number; framesPerKind: number }` | そのページまでを構成するのに最初に読む候補の件数。`listings = page × limit`、`framesPerKind = slotCount(page × limit)` |
| `page(input: { listings: readonly FeedListingCandidate[]; exhausted: boolean; listingCount: number; frames: FeedFrameCandidates }, pagination: Pagination): FeedPage \| null` | 先頭から構成して、そのページの範囲を切り出す（下の「ページ」）。`listings` は優先順の先頭から読んだ候補、`exhausted` は候補を最後まで読んだかどうか。読んだ候補でそのページまでの掲載の並びが決まらなければ `null` |

掲載の混ぜ方（V-45）。

1. 候補は優先順（現在地があれば近い順、なければ新しい順）に並んでいる。まだ置いていない候補の並びを「残り」とする。先頭の位置には残りの先頭を置く
2. 以降の位置には、残りのうち、直前に置いた掲載と `conflicts` が成り立たない候補の、優先順で最初のものを置く。残りがすべて直前の掲載と `conflicts` が成り立つときだけ、残りの先頭を置く（連続する）
3. 置いた候補を残りから除き、残りが空になるまで繰り返す

- 「連続」は掲載の並びの上で判定し、間に大きな枠があっても変わらない
- 「同じ地域」は、掲載の要約に示す地域（一覧に示す地域）が同じことを指す。地域名を示さない掲載どうしは、同じ地域に当たらない
- 優先順の先頭から読んだ候補に規則を当てた並びは、各位置で、置く候補が読んだ候補の中に決まる限り、全件を読んだ場合の並びと一致する。位置が決まるのは、残りの読んだ候補に直前の掲載と `conflicts` が成り立たない候補があるとき、または候補を最後まで読んだとき

大きな枠の巡回（V-46、P-30、`spec/pages/index.md`「フィード」）。

1. 枠位置は、先頭（0番）と、掲載が `LISTINGS_PER_FRAME` 件並ぶごとの後ろ（k 番は 6k 件目の掲載の後ろ）。掲載が0件なら枠位置はなく、大きな枠を1つも置かない
2. 巡回の位置は `FRAME_ROTATION` の先頭（地域）から始まる。枠位置ごとに、巡回の位置から順に、まだ使っていない候補を持つ最初の種類を選び、その種類の候補を「種類の中の順」の先頭から1つ使う。巡回の位置を、使った種類の次へ進める
3. 候補のない種類と、候補を使い切った種類は飛ばす。どの種類にも使える候補がなければ、その枠位置と以降の枠位置は `null`（掲載だけが並ぶ）
4. 同じ地域・読みもの・イベントを、1回のフィードの中で2回使わない

ページ。

- フィードのページは、掲載の件数で数える。`pagination`（`page` は1始まり、`limit` は 1〜100）のページは、`arrange` の結果の `(page - 1) × limit` 番目から `limit` 件の掲載（0始まり）を含む
- 0番の枠位置は最初のページに入る。k 番（k ≥ 1）の枠位置は、6k 件目の掲載を含むページに、その掲載の直後に入る
- k 番の枠位置の大きな枠は、0番から k 番までを先頭から順に割り当てて決まる。各種類の候補は、先頭から `framesPerKind` 件あれば足りる
- 掲載の候補は、`requirement` の件数を読んだ後も、`page` が `null` を返す間は読み足す。ユースケースは、候補を `limit: 100` のページに分けて先頭から順に読み、`page` が並びを返すまでつなぐ。候補が尽きたら `exhausted` を `true` にする
- `hasMore` は `page × limit < listingCount`。範囲の外のページは、`items` が空になる
- 次のページは、最初のページと同じ条件と同じ現在地で求める。候補が読み込みの間に変わらなければ、ページをつないだ並びは、全体を1回で構成した並びと一致し、連続しない規則・巡回・繰り返さない規則がページをまたいで保たれる。読み込みの間に候補が変わった場合の並びは、その時点の候補から構成した並びになる

## ドメインイベント

なし。Discovery はドメインイベントを出さず、消費しない。読み取りは各ドメインの集約の現在の状態から求めるので、ドメインイベントで更新する写しを持たない。

## ポート

読み取りのポートは5つ。どれも読み取り専用で、UnitOfWork に参加しない。

| ポート | 目的 |
| --- | --- |
| `FeedCandidateQueries` | フィードの候補 |
| `ExplorationQueries` | 地図、地図の一覧、地域の一覧、地域内の一覧、イベントの一覧、読みものの一覧 |
| `KeywordSearchQueries` | キーワード検索と、対象の選択の候補 |
| `DetailQueries` | 詳細の対象と、関連情報 |
| `ReferenceQueries` | 参照の解決と、対象1件が閲覧できるかどうか |

### 共通の契約

- 可視性: 各ドメインでコミットした書き込み（公開、一時非公開、非公開、営業状況、所属、参加、関連づけ、カテゴリーの廃止、管理体制、削除）は、以後のすべての読み取りに即座に反映される（CS-13）。遅れて更新される写しを、契約の上で許さない
- 閲覧できる対象: 結果に現れる対象と、Entry が含む結びつきの相手は、`VisibilityPolicy` の `is…Viewable` が成り立つものに限る。場面を持つ読み取りは、加えて `VisibilityPolicy.admits(scene, standing)` が成り立つものに限る。`standing` は引数の `today` で求める。店舗の `standing` は日付に依存しないので、店舗と地域だけを見る読み取りは `today` を取らない
- 規則の出どころ: 絞り込みは `BrowseCriteria.matches…`、周辺は `Vicinity.includesRegion`、地域の判定・範囲・距離に使う所属店舗は `RegionFootprint.of`、地図の区画は `MapClustering.cells`、距離は `Geo`、一致と関連度は `KeywordRelevance`（対象の文字列は `SearchRelevance` の表）、候補の範囲は `SelectionScope.admits…`、Entry の中身は `ViewProjection.placeEntry` の定義と一致する。アダプターは保存先に合わせて実現するが、結果は in-memory の実装（これらの純粋な関数をそのまま使う）と一致する
- 提供状態: 掲載の提供状態の段階が効く判定（発見の対象、`BrowseCriteria.matchesPlace`、店舗の掲載の順）は、Listing の `Offering.startsOn`・`Offering.lastAvailableOn` の暦日と `manualEnd.ended` を `today` と比べて行う。段階の規則は Listing の `OfferingStatus.of` だけが持つ。問い合わせは暦日と真偽値の比較だけで段階を判定する（index.md「日付と位置」）
- カテゴリー: `ResolvedCriteria.categoryIds` は、掲載に保存された `content.categoryId` と比べる。廃止したカテゴリーの掲載は、`predecessorsOf` の展開によって移行先の条件に合う。結果の掲載の `categoryId` は保存された値のままで、ユースケースが `CategoryCatalog.resolve` で解決する
- ページング: 一覧はテンプレートの `Pagination` を取り、`PaginationResult`（`items` と、条件に合う全件数 `count`）を返す。範囲の外の `page` は空の `items`。ページングを持たない読み取りは、件数の限られ方を契約に書く
- 一意性・並行性: 書き込みがないので、一意性の担保も楽観ロックもない。1回の呼び出しの結果は、1つの時点の状態に基づく。複数の呼び出しの間の一貫性は保証しない（呼び出しの間に対象が閲覧できなくなった場合、後の呼び出しの結果に現れないだけで、エラーにしない）
- エラー: 存在しない ID と閲覧できない対象は、エラーではなく `null`、空の結果、または `viewable: false`（`ReferenceQueries.resolve`）。件数の上限を超える入力（`ReferenceQueries.resolve` の `refs`）は `BusinessRuleError`（`COMMON_INVALID_INPUT`。index.md「リポジトリの共通の契約」）

並び順は次の名前で指す。どれも、同順位は対象の ID の昇順。

| 名前 | キー |
| --- | --- |
| 新しい順 | 新しさ（掲載・地域・イベント・読みものは `publication.firstPublishedAt`、店舗は `registeredAt`）の降順 |
| 近い順 | `origin` までの距離の昇順、次に新しい順。距離は `Geo.distanceMeters(origin, 位置)`。位置は、掲載は紐づく店舗の `location`、店舗は `location`、イベントは `venue.location`。地域は、足あと（`RegionFootprint.of(…, "reference")`。地域自身と閲覧できる所属店舗）の位置のうち `origin` に最も近いもの |
| 開催日の順 | `content.period.start` の昇順、次に `content.period.end` の昇順 |
| 関連度の高い順 | 関連度（`KeywordRelevance.relevance`）の降順、次に新しい順 |
| 店舗の掲載の順 | 提供状態の段階（`available`、`upcoming`、`ended` の順）、次に新しい順 |

`origin: GeoPoint | null` を取る読み取りは、`origin` があれば近い順、なければ「新しい順」（イベントは「開催日の順」）で返す（V-45、V-48）。

### FeedCandidateQueries

```ts
type FeedQuery = Readonly<{
  criteria: ResolvedCriteria;
  origin: GeoPoint | null;
  today: LocalDate;
}>;

interface FeedCandidateQueries {
  findListings(query: FeedQuery, pagination: Pagination): Promise<PaginationResult<ListingEntry>>;
  findRegionFrames(query: FeedQuery, pagination: Pagination): Promise<PaginationResult<PublishedRegion>>;
  findOccasionFrames(query: FeedQuery, pagination: Pagination): Promise<PaginationResult<PublishedOccasion>>;
}
```

場面は `discovery` に固定。読みものの枠の候補は `ExplorationQueries.findArticles` を使う（読みものは絞り込まず、常に新しい順。V-47）。

| メソッド | 対象 | 並び順 |
| --- | --- | --- |
| `findListings` | フィード対象の掲載のうち、`BrowseCriteria.matchesListing` が成り立つもの。休業中の店舗の掲載と、イベントの参加に添えた掲載を、他の掲載と同じ条件で含む（V-29、V-44、B-07）。絞り込みの結果も、この読み取り（V-48） | `origin` による |
| `findRegionFrames` | 閲覧できる地域のうち、所属する店舗の掲載に、`findListings` の対象になる掲載（同じ `criteria`）を1件以上持つもの（V-46、V-47）。所属は代表地域に限らず、すべての所属を見る | `origin` による |
| `findOccasionFrames` | 閲覧できて発見の対象であるイベントのうち、閲覧できる参加店舗を1つ以上持ち、`BrowseCriteria.matchesOccasion` が成り立つもの。添えた掲載の有無と提供状態は問わない（AC-32） | `origin` があれば近い順、なければ開催日の順 |

### ExplorationQueries

```ts
interface ExplorationQueries {
  findPlaceCells(query: {
    bounds: GeoBounds;
    grid: MapGrid;
    criteria: ResolvedCriteria;
    selectedRegionId: RegionId | null;
    today: LocalDate;
  }): Promise<readonly PlaceCell[]>;

  findMapExtent(scope: MapScope): Promise<GeoBounds | null>;

  findPlacesInBounds(
    query: { bounds: GeoBounds; criteria: ResolvedCriteria; origin: GeoPoint | null; today: LocalDate },
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceEntry>>;

  findRegions(
    query: {
      bounds: GeoBounds | null;
      areaCodes: ReadonlySet<AreaCode> | null;
      vicinity: Vicinity | null;
      origin: GeoPoint | null;
    },
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedRegion>>;

  findPlacesOfRegion(regionId: RegionId, pagination: Pagination): Promise<PaginationResult<PlaceEntry>>;

  findListingsOfRegion(
    query: { regionId: RegionId; excludingPlaceId: PlaceId | null; today: LocalDate },
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>>;

  findOccasions(today: LocalDate, pagination: Pagination): Promise<PaginationResult<PublishedOccasion>>;

  findArticles(pagination: Pagination): Promise<PaginationResult<PublishedArticle>>;
}
```

場面は `discovery` に固定（読みものは場面で変わる状態を持たない）。

| メソッド | 対象 | 並び順・件数 |
| --- | --- | --- |
| `findPlaceCells` | `Geo.contains(bounds, location)` が成り立つ店舗のうち、`BrowseCriteria.matchesPlace` が成り立つもの。`selectedRegionId` の地域が閲覧できれば、その地域に所属する店舗のうち `Geo.contains(bounds, location)` が成り立つものを、`criteria` にかかわらず加える（`spec/pages/index.md`「地図」）。`selectedRegionId` が `null`、またはその地域が閲覧できなければ、加えない。結果は、対象の店舗の `PlaceEntry` に `MapClustering.cells(bounds, grid, entries, selectedRegionId)` を当てた結果と一致する（地域が閲覧できなければ `selectedRegionId` は `null` として当てる） | `MapClustering.cells` の順。区画の数（`columns × rows`）で件数が限られる。`colocated` の `places` の件数は、1つの位置の店舗の数で限られる |
| `findMapExtent` | `places` の範囲: 閲覧できて発見の対象である店舗のうち、`BrowseCriteria.inAreas(areaCodes, address)` が成り立つ店舗の位置の `Geo.extentOf`。`areaCodes` が `null` なら、閲覧できて発見の対象であるすべての店舗。カテゴリーの条件を取らない（`spec/pages/index.md`「地図」）。`region` の範囲: その地域の `RegionFootprint.of(region, 所属する店舗, "discovery")` の位置の `Geo.extentOf`。地域が閲覧できなければ `null`。対象が1つもなければ `null` | — |
| `findPlacesInBounds` | `findPlaceCells` の `selectedRegionId` が `null` のときと同じ店舗（EXP-02） | `origin` による |
| `findRegions` | 閲覧できる地域のうち、次のすべてが成り立つもの。`bounds` が `null` でなければ `Geo.contains(bounds, location)`。`BrowseCriteria.matchesRegion(areaCodes, footprint)`。`vicinity` が `null` でなければ `Vicinity.includesRegion(vicinity, footprint)`。`footprint` は `RegionFootprint.of(region, 所属する店舗, "reference")`。地図の地域（`bounds` あり）、地図の一覧の地域、地域の一覧（`bounds` は `null`）に共通。カテゴリーの条件を取らない（I-09） | `origin` による |
| `findPlacesOfRegion` | その地域に所属する店舗。地域が閲覧できなければ空 | 所属した日時（`affiliatedAt`）の新しい順。同順位は `PlaceId` の昇順 |
| `findListingsOfRegion` | その地域に所属する店舗の掲載。`excludingPlaceId` があれば、その店舗の掲載を除く。地域が閲覧できなければ空。選択中のエリア・カテゴリーの条件を取らない | 新しい順 |
| `findOccasions` | 閲覧できて発見の対象であるイベント。参加店舗を持たないイベントを含む（EXP-08）。条件を取らない | 開催日の順 |
| `findArticles` | 公開中の読みもの | 新しい順 |

- 地図の地域は、`findRegions` のすべてのページを読む。範囲の中の地域を件数で切らない
- 地図の区画は、近接する店舗のまとまりを保存先の側で求めてよいが、結果は `MapClustering.cells` と一致する。店舗が分かれる縮尺までの拡大は、`cluster` の `extent` を次の `bounds` にして読み直す
- 地域を選んでいる間の所属する店舗は、`selectedRegionId` で加わり、`affiliatedCount` と `PlaceEntry.regions` で他の店舗と区別できる。閉店した店舗は、場面の規則で地図の区画に現れない
- 選んでいる地域そのものは、`findRegions` の条件と `bounds` にかかわらず、ユースケースが `DetailQueries.findRegion` で読む
- `places` の範囲の `findMapExtent` が `null`（収める店舗が0件）のとき、ユースケースは `Geo.JAPAN` を返す

### KeywordSearchQueries

```ts
interface KeywordSearchQueries {
  searchPlaces(
    query: { keyword: SearchKeyword; vacantOnly: boolean },
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PlaceEntry>>>;
  searchListings(keyword: SearchKeyword, pagination: Pagination): Promise<PaginationResult<Scored<ListingEntry>>>;
  searchRegions(keyword: SearchKeyword, pagination: Pagination): Promise<PaginationResult<Scored<PublishedRegion>>>;
  searchOccasions(
    query: { keyword: SearchKeyword; openOnly: boolean; today: LocalDate },
    pagination: Pagination,
  ): Promise<PaginationResult<Scored<PublishedOccasion>>>;
  searchArticles(keyword: SearchKeyword, pagination: Pagination): Promise<PaginationResult<Scored<PublishedArticle>>>;
}
```

- 場面は `reference` に固定。提供開始前・提供終了の掲載、閉店した店舗、終了・中止したイベントを含む（V-11）。状態は、ユースケースが `Standing` で示す
- 5種類とも、対象は、閲覧できて、その種類の `SearchableText`（`SearchRelevance` の表）に対して `KeywordRelevance.matches` が成り立つもの。`relevance` は `KeywordRelevance.relevance` の値と一致する
- キーワードが当たる項目は、`scenario/index.md`「探し方」の「キーワードで探す」の表の項目で、`SearchRelevance` の表の関数がその項目から対象の文字列を作る。キーワード検索（DIS-05）と、対象の選択の候補（CF-02 のうち、名称・所在地で店舗を探す CM-01 の照合を除くもの）が、この読み取りを使う。名称・所在地で店舗を探す照合は、Place の `PlaceMatching`（`PlaceRepository.match`）による
- 写真のない店舗を含む（B-57）
- 候補の範囲: `vacantOnly` が `true` なら、店舗は `SelectionScope.admitsPlace` が成り立つもの（管理者のいない店舗）に限る。`openOnly` が `true` なら、イベントは `SelectionScope.admitsOccasion`（`standing` は `today` で求める）が成り立つもの（開催前・開催中）に限る。`items` と `count` は、範囲の中の対象で決まる。キーワード検索は、どちらも `false` で呼ぶ
- 並び順は関連度の高い順
- 種類ごとに独立にページングする。絞り込みの条件を取らない

### DetailQueries

```ts
type OccasionSubject =
  | Readonly<{ kind: "listing"; id: ListingId }>
  | Readonly<{ kind: "place"; id: PlaceId }>
  | Readonly<{ kind: "region"; id: RegionId }>;

interface DetailQueries {
  findListing(listingId: ListingId): Promise<ListingEntry | null>;
  findPlace(placeId: PlaceId): Promise<PlaceEntry | null>;
  findRegion(regionId: RegionId): Promise<PublishedRegion | null>;
  findOccasion(occasionId: OccasionId): Promise<PublishedOccasion | null>;
  findArticle(articleId: ArticleId): Promise<PublishedArticle | null>;

  findListingsOfPlace(
    query: { placeId: PlaceId; scene: Scene; today: LocalDate },
    pagination: Pagination,
  ): Promise<PaginationResult<ListingEntry>>;

  findOccasionsRelatedTo(subject: OccasionSubject, today: LocalDate): Promise<readonly PublishedOccasion[]>;
  findParticipants(occasionId: OccasionId): Promise<readonly ParticipantEntry[]>;
  findRegionsOfOccasion(occasionId: OccasionId): Promise<readonly PublishedRegion[]>;
  findArticlesShowcasing(ref: ShowcaseRef, pagination: Pagination): Promise<PaginationResult<PublishedArticle>>;
}
```

| メソッド | 対象 | 場面 | 並び順・件数 |
| --- | --- | --- | --- |
| `findListing`・`findPlace`・`findRegion`・`findOccasion`・`findArticle` | 閲覧できる対象1件。閲覧できなければ `null`（CS-06）。提供開始前・提供終了の掲載、閉店した店舗、終了・中止したイベントも返す | `reference` | — |
| `findListingsOfPlace` | その店舗の掲載。店舗が閲覧できなければ空。店舗詳細の掲載は `reference`、掲載詳細の「同じ店舗の掲載」は `discovery` で読む | 引数 | 店舗の掲載の順 |
| `findOccasionsRelatedTo` | `listing`: その掲載を参加内容に添えた参加のイベント。`place`: その店舗が参加中のイベント。`region`: その地域に `linked` で関連づけられたイベント（V-43）。`subject` の対象が閲覧できなければ空 | `discovery` | 開催日の順。全件（1つの対象に結びつく開催前・開催中のイベントの数で限られる） |
| `findParticipants` | そのイベントに参加中の、閲覧できる店舗。閉店した店舗を含む（I-04）。`listings` は、参加内容の `listingIds` のうち閲覧できる掲載を、提供状態にかかわらず、添えた順で持つ。イベントが閲覧できなければ空。参加店舗マップにも使う | `reference` | 参加が成立した順（`participatedAt` の昇順）。同順位は `PlaceId` の昇順。全件（1つのイベントの参加店舗の数で限られる） |
| `findRegionsOfOccasion` | そのイベントに `linked` で関連づけられた、閲覧できる地域。イベントが閲覧できなければ空 | — | 関連づけた順（`linkedAt` の昇順）。同順位は `RegionId` の昇順。全件 |
| `findArticlesShowcasing` | `ref` を紹介先に持つ公開中の読みもの（B-54）。`ref` の対象が閲覧できなければ空（`count` は 0） | — | 新しい順 |

- 参加日は、ユースケースが `Participation.visibleDates(participation, occasion.content.period)` で求めて、日付の順で示す。開催期間の外の参加日は示さない
- 「イベントに閲覧できる掲載がない」（V-37）は、`findParticipants` のすべての `listings` が空であること。「地域に閲覧できる掲載がない」は、`findListingsOfRegion` の `count` が 0 であること
- `findArticlesShowcasing` は閲覧者への表示のための問い合わせで、通知の宛先を引く Article の `findPublishedByShowcases` とは別に持つ

### ReferenceQueries

```ts
interface ReferenceQueries {
  resolve(refs: readonly ShowcaseRef[]): Promise<readonly ReferenceResolution[]>;
  isViewable(ref: ContentRef): Promise<boolean>;
}
```

| メソッド | 振る舞い |
| --- | --- |
| `resolve` | `refs`（0〜100件。`BookmarkRef` は `ShowcaseRef` に含まれる）から重複を除いた参照のすべてについて、参照ごとに1つの `ReferenceResolution` を、初出の順で返す。閲覧できる対象は `viewable: true` と `target`、閲覧できない対象と存在しない対象は `viewable: false`。閲覧できない参照も結果から落ちない。0件は空を返し、100件を超える `refs` は `BusinessRuleError`（`COMMON_INVALID_INPUT`。呼び出し側が分けて呼ぶ）。場面は `reference` に固定で、提供開始前・提供終了・休業・閉店・終了・中止の対象も返す。状態は、ユースケースが `Standing` で示す |
| `isViewable` | 対象1件が閲覧できるかどうか。存在しない対象は `false`。掲載は、紐づく店舗の非公開を含めて判定する。日付と場面に依存しない |

`isViewable` を使うか、読んだ集約に `VisibilityPolicy` の `is…Viewable` を当てるかは、index.md「閲覧できる対象」が定める。`ReferenceQueries` を使うユースケースのうち、保存一覧の解決（`resolveReferences`）と他のドメインのユースケースは次のとおり。Discovery の閲覧の読み取り（`readArticle`・`listArticlesShowcasing`）の使い方は、それぞれのユースケースが定める。読んだ集約に `VisibilityPolicy` を当てるだけのユースケースは、この表に挙げない。

| 使う側 | 使い方 | シナリオ |
| --- | --- | --- |
| Discovery の `resolveReferences` | 保存の `BookmarkRef` を `resolve` に渡す。`viewable: false` の参照は、対象の情報なしの「閲覧できない対象」にする（V-39、B-10、B-27）。アカウントの保存（Bookmark の `listBookmarks` が返す参照）と、端末の保存の両方の表示に使う。保存そのものは閲覧できるかどうかを確かめず、閲覧できないことはこの読み取りの時点で示す | KEP-01、KEP-02、KEP-03 |
| Article の編集と公開前の確認 | 紹介先を `resolve` に渡し、`viewable: false` の紹介先を閲覧できない紹介先として示す。`previewArticle` は `resolve` の結果のすべてを `ViewProjection.previewArticle` に渡す | EDT-02、EDT-06 |
| Place の `matchPlaces` | 照合の結果の店舗を `resolve` に渡し、`PlaceEntry` の `substituteCover` を写真の代用に使う（P-43）。申請の判断での店舗の照合と代理登録の前の確認は Place の `matchPlacesForOperation` で、写真を代用せず、`resolve` を使わない | SHP-02 |
| Moderation の申立て・連絡 | `isViewable` を申立ての提出の事実（`TakedownTargetFacts` の `viewable`）と、申立て・連絡の詳細の表示に使う。連絡の提出は、読んだ店舗・掲載に `VisibilityPolicy` を当てて事実（`InfoReportSubmissionFacts` の `kind`）にする。一覧と詳細に示す対象の名称は、閲覧できない対象を含めて Moderation の `ContentDirectory.describe` で解決し、`resolve` を使わない | MOD-01、MOD-02、MOD-04、MOD-05 |
| Application の提出 | 申請の対象（店舗、掲載、地域、イベント）が閲覧できることを、提出の可否の事実として確かめる。`isViewable` と `VisibilityPolicy` のどちらを使うかは、index.md「閲覧できる対象」による | REG-01、REG-03、EVT-01、LST-12、LST-13、SHP-04、SHP-08 |
| Application の判断の画面の読み取り（`getApplicationForReview`） | 申請の対象が閲覧できるかどうかを、表示のために求める。`isViewable` と `VisibilityPolicy` のどちらを使うかは、index.md「閲覧できる対象」による | APP-07 |

## トランザクション境界

書き込みなし。Discovery のユースケースは原子的に確定する範囲を持たない。Discovery の読み取りのポート、Area の `AreaCatalog`、Media の `PhotoStorage.displayRefs` は UnitOfWork に参加せず、`run` の外で呼ぶ。他のドメインの集約のリポジトリ（Listing の `CategoryCatalogRepository`、Authority の `StewardshipRepository`）を読むユースケースは、書き込まない `run` を1つ使って読む（index.md「UnitOfWork ポート」）。

- 1つのユースケースが複数のポートを読む場合、読み取りの間に他の要求の書き込みが確定することがある。ユースケースは、後の読み取りに現れなくなった対象を、結果から落とす（区分ごと表示しない）だけで、失敗にしない
- ページの読み取りの間に対象が変わることは防がない（`FeedComposer` の「ページ」）

## ユースケース（概要）

どのユースケースもログインを必要としない。要約には、Media の `PhotoStorage.displayRefs` で得た写真の表示用の参照を添える。絞り込みの条件を取るユースケースは、`AreaCatalog.expand` と `CategoryCatalogRepository.find` の結果から `BrowseCriteria.resolve` で条件を解決し、効いている条件（`effective`）を結果に添える。

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `readFeed` | 条件・現在地・ページを受け、`FeedComposer.requirement` の件数から候補を読み（`FeedComposer.page` が並びを返すまで100件ずつ読み足す）、`FeedComposer.page` で構成して、掲載の要約と大きな枠を返す。現在地がなければ新しい順。条件に合う掲載が0件なら、空のフィードを返す | DIS-01、DIS-02、DIS-03、DIS-04、DIS-06 |
| `searchByKeyword` | キーワードを共有カーネルの `SearchKeyword.create` で `SearchKeyword` にし、店舗・地域・掲載・イベント・読みものの種類ごとの結果を、状態つきの要約で返す。種類ごとに独立にページングする | DIS-05 |
| `readMapCells` | 範囲・格子・条件・選んでいる地域を受け、店舗の区画（1件の店舗、位置の違う店舗のまとまり、同じ位置の店舗の一覧）と、範囲の中の地域を返す。選んでいる地域そのものは `DetailQueries.findRegion` で読む | EXP-01 |
| `findMapExtent` | `ExplorationFocus.of` の焦点で、選択エリアの店舗が収まる範囲、現在地の周辺を囲む範囲（`Geo.boundsOf`）、すべての店舗が収まる範囲のどれか、または地域とその所属する店舗が収まる範囲を返す。収める店舗が0件なら `Geo.JAPAN` を返す | EXP-01、EXP-04 |
| `listMapTargets` | 同じ範囲と条件の店舗と地域を、種類ごとに、現在地があれば近い順、なければ新しい順で返す | EXP-02 |
| `findRegions` | `ExplorationFocus.of` の焦点で、選択エリアの地域、現在地の周辺の地域、すべての地域のどれかを返す。エリア・周辺にあるかと、現在地からの距離は、地域の足あと（`RegionFootprint`）で決まる | EXP-03、DIS-04、DIS-06 |
| `viewRegion` | 地域の内容と、関連するイベントを返す | EXP-04 |
| `listPlacesOfRegion` | 地域に所属する店舗を、所属の新しい順で返す。地域名はその地域。地域の詳細の店舗の区分もこれで読む | EXP-04、EXP-05 |
| `listListingsOfRegion` | 地域に所属する店舗の掲載を、新しい順で返す。地域名はその地域。地域の詳細の掲載の区分もこれで読む | EXP-04、EXP-05 |
| `viewListing` | 掲載の内容と提供状態、紐づく店舗と営業状況、すべての所属地域、この掲載を添えたイベント、他の掲載（`pickOtherListings`。件数は入力）を返す。店舗管理者の有無（Authority の `StewardshipRepository.findById` と `Stewardship.isVacant`）を添える | EXP-06 |
| `viewPlace` | 店舗情報と営業状況、すべての所属地域、参加するイベントを返す。店舗管理者の有無（`Stewardship.isVacant`）と、閲覧者がその店舗の店舗管理者かどうか（`Stewardship.isSteward`。ログインしていない閲覧者は店舗管理者でない）を添える | EXP-07、SHP-01 |
| `listListingsOfPlace` | 店舗の掲載を、参照の場面で、店舗の掲載の順で返す。店舗の詳細の掲載の区分もこれで読む。店舗が閲覧できなければ `NotFoundError` | EXP-07 |
| `listOccasions` | 開催前・開催中のイベントを、開催日の順で返す | EXP-08 |
| `viewOccasion` | イベントの内容と開催の状態、参加店舗と添えた掲載・参加日、関連する地域を返す。閲覧者が店舗の管理権限を持つかどうか（Authority の `StewardshipRepository.findPageBySteward`。ログインしていない閲覧者は持たない）を添える | EXP-09 |
| `locateParticipants` | イベントのすべての参加店舗を、`MapClustering.cells` でまとめた区画と、すべての位置が収まる範囲で返す | EXP-10 |
| `listArticles` | 公開中の読みものを、新しい順で返す | EXP-11 |
| `readArticle` | 読みものの内容と、紹介先のうち閲覧できる対象を、編集担当者が並べた順で返す | EXP-12 |
| `listArticlesShowcasing` | 掲載・店舗・地域・イベントを紹介する公開中の読みものを、新しい順で返す。詳細の読みものの区分もこれで読む。紹介される対象が閲覧できなければ `NotFoundError` | EXP-04、EXP-06、EXP-07、EXP-09 |
| `findSelectionCandidates` | 候補の範囲（`SelectionScope`）とキーワードを受け、範囲の中の候補を状態つきの要約で返す。キーワードは共有カーネルの `SearchKeyword.parse` で確かめ、空のキーワードは空の結果を返す。どの種類も `KeywordSearchQueries` のその種類の読み取りを使う。店舗の候補には、店舗管理者の有無を添える | REG-01、REG-03、EVT-01、EVT-05、EVT-10、EDT-02 |
| `resolveReferences` | 掲載・店舗の参照（`BookmarkRef`）を受け、閲覧できる対象は状態つきの要約で、閲覧できない対象は閲覧できないことだけを、引数の順で返す。ログインの有無にかかわらず使える。受け取った参照は保存しない | KEP-01、KEP-02、KEP-03 |

- 詳細の関連情報のうち先頭の件数だけを示す区分（店舗・掲載・読みもの）は、画面が一覧のユースケース（`listPlacesOfRegion`・`listListingsOfRegion`・`listListingsOfPlace`・`listArticlesShowcasing`）を、`spec/pages/index.md`「詳細の関連情報」の件数を `limit` にして読む。区分の件数は Discovery の値に持たない。合成をまたぐ規則を持つ区分（他の掲載の `pickOtherListings`）だけは、件数を入力で受ける
- 店舗と掲載の詳細が示す手続きの入口は、ユースケースが添えた事実（店舗管理者の有無、閲覧者がその店舗の店舗管理者か）から決まる。Discovery は入口の規則を持たない
- 対象の選択の候補の範囲（`SelectionScope`）は、呼び出す操作のシナリオが定め、呼び出す側が渡す。範囲の中で「すでに選んだ対象」と「選べない対象」を決める事実（所属・参加・関連づけの有無）は、呼び出す操作が持つ現在の結びつきから決まる。選べない対象を選んだ要求は、結びつきを持つドメインの振る舞いが `BusinessRuleError` にする
- 公開前の確認（Listing の `previewListing`、Article の `previewArticle`、Application の `previewListingSubmission`）は、`ViewProjection.previewListing`・`previewArticle` を使う
- 保存一覧の表示の内容は、`resolveReferences` が解決する。アカウントの保存は Bookmark の `listBookmarks` が返す参照を、端末の保存は端末が持つ参照を渡す
- 他のドメインのユースケースが `ReferenceQueries` を使う場面は、「ReferenceQueries」の使う側の表による
