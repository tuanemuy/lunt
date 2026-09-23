# Listing

掲載の内容、公開状態、提供状態と、掲載を分類するカテゴリーを管理する。

共有カーネルの `ListingId`・`PlaceId`・`CategoryId`・`PhotoId`・`PhotoSet`・`RevisedPhotos`・`Publication`・`Suspension`・`LocalDate`・`TextNormalization`・`PhotosReleasedEvent`・`Actor` を使う（[index.md](index.md)）。他のドメインに依存しない。

- 掲載を誰が管理するか（店舗管理者か、サービス運営者の代行か）は Authority の事実で、掲載は持たない。管理の操作の可否は、ユースケースが Authority の `AccessPolicy` で確かめる。店舗管理者とサービス運営者は、同じ振る舞いを使う（LST-15、LST-16）
- 所在地・所属地域は店舗の情報で、掲載は `PlaceId` だけを持つ（M-18）
- 閲覧者に見せる読み取りと、閲覧できるかどうかの判定は Discovery が持つ。店舗が非公開かどうかは掲載の振る舞いに影響しない（MOD-08）

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Listing | 掲載 | 1つの店舗・スポットに紐づく、商品・体験・景色・見どころの紹介。種類はカテゴリーが兼ねる（M-15、B-24） |
| ListingContent | 掲載の内容 | 名称、説明、カテゴリー、写真、提供の設定。価格とキャッチコピーを持たない（M-16） |
| PublishableListingContent | 公開できる内容 | 公開条件（写真1枚以上・名称・カテゴリー）を満たす掲載の内容（B-08） |
| ListingPhoto | 掲載の写真 | `PhotoId` と見せる範囲の組。`PhotoSet` の要素。1枚目が代表写真（M-41） |
| Framing | 見せる範囲 | 写真のうち閲覧者に見せる矩形の範囲。写真ごとに1つ（M-19） |
| Offering | 提供の設定 | 「設定しない / 提供期間 / 開催日」のどれか1つ（CF-06） |
| OfferingPeriod | 提供期間 | 開始日と終了日。どちらか一方だけでもよい |
| OpenDates | 開催日 | 1つ以上の暦日。時刻・定員・予約を持たない（M-42） |
| ManualEnd | 管理する人による提供終了 | 掲載を管理する人が掲載を提供終了にしたこと。提供中に戻せる（M-31） |
| OfferingStatus | 提供状態 | 提供開始前・提供中・提供終了。保存せず、提供の設定・`ManualEnd`・今日の暦日から求める。提供終了は、期日によるものと管理する人によるものを区別する |
| OfferingPhase | 提供状態の段階 | `OfferingStatus` から区別の情報を除いた3値 |
| ListingShelf | 管理上の区分 | 管理側の一覧で掲載を分ける4つの区分（公開中・下書き・非公開・提供終了）（M-09） |
| ListingPatch | 掲載の修正 | 掲載の修正の申請が持つ、変更した項目だけの値 |
| CategoryCatalog | カテゴリーの台帳 | サービスに1つだけある、すべてのカテゴリー（廃止済みを含む）の並び |
| Category | カテゴリー | 掲載の分類。1階層で、掲載ごとに1つ（P-18） |
| Successor | 移行先 | 廃止したカテゴリーの掲載が属することになるカテゴリー。廃止の時に台帳に記録する |
| OfferingPhaseRecord | 提供状態の確認記録 | 公開中の掲載について、最後に確かめた提供状態の段階。集約の外に持つ |

- 公開状態の「一時非公開」は `Publication` の `unpublished`、「運営による非公開」は `Suspension` に当たる
- 「再公開」は `unpublished → published` の遷移で、公開と同じ振る舞い（`Listing.publish`）が担う

## エンティティ

### Listing

集約ルート。公開状態ごとの直和型で、公開中の掲載が公開条件を欠く状態を型で表せなくする。

```ts
type ListingBase = Readonly<{
  id: ListingId;
  placeId: PlaceId;          // 生成の後は変わらない
  suspension: Suspension;
  version: Version;
  createdAt: Date;
  updatedAt: Date;           // 内容または状態が最後に変わった日時
}>;

type DraftListing = ListingBase & Readonly<{
  publication: { status: "draft" };
  content: ListingContent;
}>;

type PublishedListing = ListingBase & Readonly<{
  publication: { status: "published"; firstPublishedAt: Date };
  content: PublishableListingContent;
  manualEnd: ManualEnd;
}>;

type UnpublishedListing = ListingBase & Readonly<{
  publication: { status: "unpublished"; firstPublishedAt: Date; reason: "byManager" | "photoTakedown" };
  content: ListingContent;
  manualEnd: ManualEnd;
}>;

type Listing = DraftListing | PublishedListing | UnpublishedListing;
```

#### 振る舞い

すべて純粋な関数。状態を変える振る舞いは `version` を進め、`updatedAt` を `now` にする。戻り値の `WithEventDrafts` のドメインイベントは「ドメインイベント」の節による。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `createDraft` | `params: { id: ListingId; placeId: PlaceId; content: ListingContent }, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<DraftListing>` | 下書きを作る。必要なのは `placeId` だけで、内容は空でよい。`content.categoryId` が `null` でなければ `CategoryCatalog.requireActive` で確かめる。`suspension` は `{ suspended: false }`。ドメインイベントはない |
| `createPublished` | `params: { id: ListingId; placeId: PlaceId; content: PublishableListingContent }, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<PublishedListing>` | 掲載の申請の承認で、公開中の掲載を作る（LST-14）。`content.categoryId` は `CategoryCatalog.resolve` で現役のカテゴリーに置き換える。`firstPublishedAt` は `now`、`manualEnd` は `{ ended: false }`。ドメインイベントはない |
| `duplicate` | `source: Listing, params: { id: ListingId; photoIds: ReadonlyMap<PhotoId, PhotoId> }, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<DraftListing>` | 同じ `placeId` の下書きを作る。名称・説明・カテゴリー・写真（並び順と `framing`）を引き継ぎ、`offering` は `{ kind: "none" }` にする。写真の `PhotoId` は `photoIds`（元の ID → 複製した写真の ID）で置き換える。`source` の写真のすべてが `photoIds` の鍵になければ `BusinessRuleError`（`LISTING_DUPLICATE_PHOTOS_MISMATCH`）。公開状態・提供状態・運営による非公開を問わず元にでき、新しい下書きは `source` の運営による非公開を引き継がない（`suspension` は `{ suspended: false }`）。カテゴリーは `CategoryCatalog.resolve` で置き換える。`source` は変わらない |
| `update` | `listing: Listing, content: ListingContent, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<Listing>` | 内容を `content` で置き換える。`published` の掲載は、`ListingContent.toPublishable(content)` が成り立たなければ `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）。`content.categoryId` が `null` でなければ `CategoryCatalog.requireActive` で確かめる（廃止済みなら `LISTING_CATEGORY_NOT_AVAILABLE`）。外れた写真の `PhotoId` を `PhotosReleased` で返す。運営による非公開の間も行える。内容が変わらなければ、何も変えずに返す |
| `applyPatch` | `listing: Listing, patch: ListingPatch, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<Listing> & { adoptedPhotoIds: readonly PhotoId[] }` | 掲載の修正の申請の承認で、`patch` にある項目だけを現在の内容に反映する。ほかの項目は現在の内容のまま残る。反映後の内容は `ListingPatch.preview` が定め、カテゴリーの項目は `CategoryCatalog.resolve` で現役のカテゴリーに置き換える。写真の項目を重ねた結果に1枚も残らなければ `BusinessRuleError`（`LISTING_PATCH_PHOTOS_UNAVAILABLE`）。`adoptedPhotoIds` は、修正が新たに添えて採用された写真（`ListingPatch.addedPhotoIds`）。外れた写真を `PhotosReleased` で返す。公開状態と運営による非公開を問わず行える |
| `publish` | `listing: Listing, now: Date` | `WithEventDrafts<PublishedListing>` | 公開・再公開。公開状態は、共有カーネルの `Publication.publish({ publication, suspension }, ListingContent.missingForPublication(listing.content), now, "LISTING")` で進める。判定の順とエラー（`LISTING_SUSPENDED`、`PUBLICATION_INVALID_TRANSITION`、不足する項目を添えた `LISTING_PUBLISH_CONDITION_UNMET`）は、この関数が持つ（index.md「公開状態と運営による非公開の関数」）。成立した掲載の内容は `ListingContent.toPublishable` で `PublishableListingContent` にする。`draft` からの公開は `manualEnd` を `{ ended: false }` にし、`unpublished` からの再公開は `manualEnd` を保つ |
| `unpublish` | `listing: Listing, now: Date` | `WithEventDrafts<UnpublishedListing>` | 一時非公開。公開状態は、共有カーネルの `Publication.unpublish({ publication, suspension }, "byManager", "LISTING")` で進める。判定の順とエラー（`LISTING_SUSPENDED`、`PUBLICATION_INVALID_TRANSITION`）は、この関数が持つ。内容、`manualEnd`、`firstPublishedAt` は変わらない |
| `endOffering` | `listing: Listing, now: Date` | `WithEventDrafts<PublishedListing>` | `manualEnd` を `{ ended: true; endedAt: now }` にする。提供の設定を問わない。`published` でない掲載は `BusinessRuleError`（`LISTING_NOT_PUBLISHED`）。すでに `ended: true` なら `BusinessRuleError`（`LISTING_ALREADY_ENDED`）。運営による非公開を問わない |
| `resumeOffering` | `listing: Listing, now: Date` | `WithEventDrafts<PublishedListing>` | `manualEnd` を `{ ended: false }` にする。`published` でない掲載は `BusinessRuleError`（`LISTING_NOT_PUBLISHED`）。`ended: false` なら `BusinessRuleError`（`LISTING_NOT_MANUALLY_ENDED`。期日による提供終了は、この操作では戻らない）。戻した後の提供状態は `offeringStatus` に従い、期日を過ぎていれば提供終了のまま（LST-08） |
| `suspend` | `listing: Listing, now: Date` | `WithEventDrafts<Listing>` | `suspension` を、共有カーネルの `Suspension.suspend(listing.suspension, now, "LISTING")` の結果にする。公開状態を問わず、公開状態を書き換えない。すでに運営による非公開なら、この関数が `BusinessRuleError`（`LISTING_ALREADY_SUSPENDED`）にする |
| `unsuspend` | `listing: Listing, now: Date` | `WithEventDrafts<Listing>` | `suspension` を、共有カーネルの `Suspension.unsuspend(listing.suspension, "LISTING")` の結果にする。公開状態はそのまま現れる。運営による非公開でなければ、この関数が `BusinessRuleError`（`LISTING_NOT_SUSPENDED`）にする |
| `takeDownPhotos` | `listing: Listing, photoIds: readonly [PhotoId, ...PhotoId[]], now: Date` | `WithEventDrafts<Listing>` | 申立てに基づいて写真を外す（MOD-02。index.md の「申立てに基づく写真の削除」）。写真は、共有カーネルの `PhotoSet.takeDown(listing.content.photos, photoIds, "LISTING")` で外す。`photoIds` は重複のない1枚以上。残る写真の順序は変わらず、1枚目を外すと次の写真が代表写真になる。`photoIds` に掲載の写真でないものがあれば、この関数が `BusinessRuleError`（`LISTING_PHOTO_NOT_FOUND`）にし、1枚も外さない。`published` の掲載で写真が残らなければ、`Publication.unpublish({ publication, suspension }, "photoTakedown", "LISTING")` で `unpublished` にする。運営による非公開の間も同じ。外した写真を `listing.photos_taken_down` と `PhotosReleased` に載せる。申立ての前提（申立てが未対応で、対象がこの掲載であること）は、ユースケースが Moderation のポートから申立てを読んで確かめる。この振る舞いは申立てを受け取らない |
| `delete` | `listing: Listing, now: Date` | `readonly EventDraft[]` | 削除のドメインイベントと、すべての写真の `PhotosReleased` を返す。公開状態・提供状態・運営による非公開を問わない。削除した掲載は復元できない（B-27） |
| `offeringStatus` | `listing: Listing, today: LocalDate` | `OfferingStatus` | `OfferingStatus.of(listing.content.offering, manualEnd, today)`。`draft` の `manualEnd` は `{ ended: false }` として扱う |
| `shelfOn` | `listing: Listing, today: LocalDate` | `ListingShelf` | 管理上の区分を返す（`ListingShelf` の定義による） |
| `attachableIds` | `listings: readonly Listing[], placeId: PlaceId, today: LocalDate` | `readonly ListingId[]` | イベントの参加に添えられる掲載の `ListingId` を、`listings` の順で返す。添えられる掲載は、`placeId` がその店舗で、`published` で、運営による非公開でなく、提供状態の段階が `available` または `upcoming` の掲載（`Listing.shelfOn(listing, today)` が `published` の掲載に一致する）。添えられる掲載の規則を定める唯一の場所で、Occasion の参加の操作と候補の読み取り、Application の参加の申請が使う |

#### 不変条件

- `published` の掲載の内容は、写真1枚以上・名称・カテゴリーを持つ（型で保証する）。`draft` と `unpublished` の内容は、どの項目が空でもよい
- `placeId` は変わらない。掲載は常に1つの店舗に紐づく（B-16）
- `draft` の掲載は `manualEnd` を持たない。提供終了にできるのも、提供中に戻せるのも、`published` の掲載だけ
- 公開状態の遷移は `Publication` の規則、運営による非公開は `Suspension` の規則に従う（index.md）。運営による非公開の間に行えないのは、`publish`・`unpublish` だけ
- 写真の `PhotoId` は1つの掲載の中で重複しない（`PhotoSet`）

#### ライフサイクル

- 生成: 管理する人による下書きの作成（`createDraft`）、複製（`duplicate`）、掲載の申請の承認（`createPublished`）
- 公開状態: `draft → published`（`publish`）、`published → unpublished`（`unpublish` は `reason: "byManager"`、`takeDownPhotos` で写真がなくなると `reason: "photoTakedown"`）、`unpublished → published`（`publish`）。`draft` へは戻らない。管理側の画面は `reason` で、申立てで写真が削除されて一時非公開になった掲載を区別する
- 運営による非公開: `suspend` と `unsuspend` で、公開状態と独立に切り替わる
- 提供状態: 保存された遷移を持たない。提供期間の更新、開催日の追加、「設定しない」への切り替え（`update`）と `resumeOffering` の後の提供状態は、`offeringStatus` の帰結として決まる（M-31）
- 終了: `delete`。どの状態からでも削除でき、削除した掲載は読み取れない

### CategoryCatalog

集約ルート。サービスに1つだけある。名称の一意、作成順、最後の1つの保護、移行先の妥当性を、1つの集約の不変条件にして楽観ロックで守る。

```ts
type ActiveCategory = Readonly<{
  id: CategoryId;
  name: CategoryName;
  status: "active";
  createdAt: Date;
}>;

type RetiredCategory = Readonly<{
  id: CategoryId;
  name: CategoryName;
  status: "retired";
  createdAt: Date;
  retiredAt: Date;
  successorId: CategoryId;   // 廃止の時点で現役だったカテゴリー
}>;

type Category = ActiveCategory | RetiredCategory;

type CategoryCatalog = Readonly<{
  categories: readonly Category[];   // 作成順。廃止済みを含む
  version: Version;
  updatedAt: Date;
}>;
```

#### 振る舞い

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `establish` | `catalog, initial: readonly { id: CategoryId; name: CategoryName }[], now: Date` | `WithEventDrafts<CategoryCatalog>` | 空の台帳に、開設時のカテゴリーを現役として入れる。台帳が空でなければ `BusinessRuleError`（`CATEGORY_CATALOG_ESTABLISHED`）。`initial` は1つ以上で、名称が重複すれば `BusinessRuleError`（`CATEGORY_NAME_TAKEN`）。ドメインイベントはない。初期値の名称は `INITIAL_CATEGORY_NAMES = ["食べる", "買う", "体験", "見る"]`（B-45） |
| `add` | `catalog, params: { id: CategoryId; name: CategoryName }, now: Date` | `WithEventDrafts<CategoryCatalog>` | 現役のカテゴリーを並びの最後に加える。現役のカテゴリーに同じ名称があれば `BusinessRuleError`（`CATEGORY_NAME_TAKEN`）。同じ `id` があれば `BusinessRuleError`（`CATEGORY_ID_TAKEN`） |
| `rename` | `catalog, id: CategoryId, name: CategoryName, now: Date` | `WithEventDrafts<CategoryCatalog>` | 現役のカテゴリーの名称を変える。`id` がなければ `BusinessRuleError`（`CATEGORY_NOT_FOUND`）、廃止済みなら `CATEGORY_RETIRED`、他の現役のカテゴリーと同じ名称なら `CATEGORY_NAME_TAKEN`。同じ名称への変更は何も変えない。掲載は書き換わらない |
| `retire` | `catalog, id: CategoryId, successorId: CategoryId, now: Date` | `WithEventDrafts<CategoryCatalog>` | 現役のカテゴリーを廃止済みにし、移行先を記録する。`id` が廃止済みなら `CATEGORY_RETIRED`。`successorId` が `id` と同じ、台帳にない、または廃止済みなら `BusinessRuleError`（`CATEGORY_SUCCESSOR_INVALID`）。現役のカテゴリーが1つだけなら `BusinessRuleError`（`CATEGORY_LAST_ONE`）。移行先は、そのカテゴリーの掲載が1件もなくても必須（引数の型で保証する） |
| `actives` | `catalog` | `readonly ActiveCategory[]` | 現役のカテゴリーを作成順で返す。掲載に設定するカテゴリーの選択肢と、絞り込みの選択肢 |
| `requireActive` | `catalog, id: CategoryId` | `ActiveCategory` | `id` が現役のカテゴリーでなければ `BusinessRuleError`（`LISTING_CATEGORY_NOT_AVAILABLE`） |
| `resolve` | `catalog, id: CategoryId` | `ActiveCategory` | `id` が現役ならそれを、廃止済みなら `successorId` を現役のカテゴリーに当たるまでたどって返す。台帳にない `id` は `BusinessRuleError`（`CATEGORY_NOT_FOUND`） |
| `predecessorsOf` | `catalog, id: CategoryId` | `readonly CategoryId[]` | `successorId` の連なりをたどると `id` に行き着くすべての `CategoryId`（`id` 自身を含む）を返す。現役の `id` では、`resolve` の結果が `id` になる `CategoryId` の全体に一致する。廃止済みの `id` では、その廃止で移行先に移った掲載が保存している `CategoryId` の全体に一致する |

#### 不変条件

- 現役のカテゴリーの名称は重複しない。廃止済みのカテゴリーと同じ名称のカテゴリーは追加できる（OPE-03）
- 開設（`establish`）の後、現役のカテゴリーは常に1つ以上ある。カテゴリーが1つもない台帳は、開設の前だけにある
- `successorId` は台帳にある別のカテゴリーを指す。移行先は廃止の時点で現役のカテゴリーに限り、廃止は取り消せないので、`successorId` の連なりは循環せず、必ず現役のカテゴリーに行き着く
- 並びは作成順で、並び替えの操作を持たない。追加したカテゴリーは最後に入る
- 廃止済みのカテゴリーは台帳から消えない（`resolve` が使う）

#### ライフサイクル

- 生成: 開設の前は、カテゴリーが1つもない空の台帳（`version` は `Version.initial()`）。開設時に `establish` で、初期値の4つを現役として入れる
- カテゴリーの状態: `active → retired`（`retire`）。`retired` から戻らない
- 台帳は削除されない

#### カテゴリーの解決

廃止したカテゴリーの掲載を移行先に付け替える規則（O-06）は、台帳の移行先の記録と `resolve`・`predecessorsOf` だけが持つ。

- 掲載の内容と申請の内容の `CategoryId` は、読み取りの時点で `CategoryCatalog.resolve` を通して現役のカテゴリーとして扱う。廃止が確定した時点から、廃止したカテゴリーの掲載と申請は移行先のカテゴリーのものとして示される
- カテゴリーで絞り込む問い合わせ（Discovery）は、選んだカテゴリーを `CategoryCatalog.predecessorsOf` で展開した `CategoryId` の集合で絞り込む
- 掲載と申請に保存された `CategoryId` を、廃止に合わせて書き換える処理を持たない。廃止は掲載の `version` と `updatedAt` を進めない。内容を保存する（`update`）、複製する（`duplicate`）、申請を承認する（`createPublished`・`applyPatch`）時点で、現役の `CategoryId` が保存される

## 値オブジェクト

### ListingName / ListingDescription / CategoryName

```ts
type ListingName = string & { readonly [listingNameBrand]: true };
type ListingDescription = string & { readonly [listingDescriptionBrand]: true };
type CategoryName = string & { readonly [categoryNameBrand]: true };
```

- `ListingName.create(input: string)`: 前後の空白を除く。空、または改行を含めば `BusinessRuleError`（`LISTING_INVALID_NAME`）
- `ListingDescription.create(input: string)`: 前後の空白を除く。空なら `BusinessRuleError`（`LISTING_INVALID_DESCRIPTION`）。改行を含められる。説明のない掲載は `null` で表す
- `CategoryName.create(input: string)`: 前後の空白を除く。空、または改行を含めば `BusinessRuleError`（`CATEGORY_INVALID_NAME`）
- 等価性: 値の一致。カテゴリーの名称の重複は、`CategoryName` の値の一致で判定する

### Framing / ListingPhoto

```ts
type Framing = Readonly<{ x: number; y: number; width: number; height: number }>;
type ListingPhoto = Readonly<{ photoId: PhotoId; framing: Framing | null }>;
```

- `Framing` は、写真の幅と高さに対する割合（0〜1）で表す矩形。`x`・`y` は左上の位置
- `Framing.create(input)`: `0 <= x`、`0 <= y`、`0 < width`、`0 < height`、`x + width <= 1`、`y + height <= 1` のどれかを欠けば `BusinessRuleError`（`LISTING_INVALID_FRAMING`）
- `framing: null` は、見せる範囲を調整していない写真（写真の全体）
- 等価性: すべてのフィールドの一致
- 掲載の写真の並びは `PhotoSet<ListingPhoto>`。追加・並び替え・削除は共有カーネルの関数による

### Offering / OfferingPeriod / OpenDates

```ts
type OfferingPeriod =
  | Readonly<{ start: LocalDate; end: LocalDate }>
  | Readonly<{ start: LocalDate; end: null }>
  | Readonly<{ start: null; end: LocalDate }>;

type OpenDates = readonly [LocalDate, ...LocalDate[]]; // 昇順。重複はない

type Offering =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "period"; period: OfferingPeriod }>
  | Readonly<{ kind: "dates"; dates: OpenDates }>;
```

- `OfferingPeriod.create(input: { start: LocalDate | null; end: LocalDate | null })`: 両方が `null` なら `BusinessRuleError`（`LISTING_OFFERING_PERIOD_EMPTY`）。両方があって `end` が `start` より前なら `BusinessRuleError`（`LISTING_OFFERING_PERIOD_REVERSED`）。`start` と `end` が同じ日でもよい
- `OpenDates.create(input: readonly LocalDate[])`: 空なら `BusinessRuleError`（`LISTING_OPEN_DATES_EMPTY`）。重複を除き、昇順に並べる。過去の日付も受け付ける（LST-03）
- `Offering` は排他的な選択で、切り替えると前の設定を持たない
- 等価性: `kind` と、その中身の一致

### ManualEnd

```ts
type ManualEnd =
  | Readonly<{ ended: false }>
  | Readonly<{ ended: true; endedAt: Date }>;
```

### OfferingStatus / OfferingPhase

```ts
type OfferingPhase = "upcoming" | "available" | "ended";

type OfferingStatus =
  | Readonly<{ phase: "upcoming"; startsOn: LocalDate }>
  | Readonly<{ phase: "available" }>
  | Readonly<{ phase: "ended"; cause: "schedule" }>
  | Readonly<{ phase: "ended"; cause: "manual"; scheduleElapsed: boolean }>;
```

`OfferingStatus.of(offering: Offering, manualEnd: ManualEnd, today: LocalDate): OfferingStatus` は純粋な関数で、提供状態を定める唯一の場所。

1. 期日による段階を求める
   - `none`: `available`
   - `period`: `start` があって `today < start` なら `upcoming`（`startsOn` は `start`）。`end` があって `today > end` なら `ended`。それ以外は `available`
   - `dates`: `today` が最後の開催日より後なら `ended`。それ以外は `available`（最初の開催日より前も提供中）
2. `manualEnd.ended` が `true` なら `{ phase: "ended"; cause: "manual"; scheduleElapsed }`。`scheduleElapsed` は、期日による段階が `ended` かどうか
3. `manualEnd.ended` が `false` なら、期日による段階をそのまま返す。`ended` は `cause: "schedule"`

- 提供中に戻す操作を示すのは `cause: "manual"` のときだけ。`scheduleElapsed: true` は、戻しても提供終了のままであることを表す（SM-04）
- 公開状態と運営による非公開は、提供状態に影響しない。一時非公開の間も同じ関数で決まる（LST-07）

### ListingContent / PublishableListingContent

```ts
type ListingContent = Readonly<{
  name: ListingName | null;
  description: ListingDescription | null;
  categoryId: CategoryId | null;
  photos: PhotoSet<ListingPhoto>;
  offering: Offering;
}>;

type PublishableListingContent = ListingContent & Readonly<{
  name: ListingName;
  categoryId: CategoryId;
  photos: readonly [ListingPhoto, ...ListingPhoto[]];
}>;
```

- `ListingContent.create(input)`: 各項目を値オブジェクトで組み立てる。空の名称・説明は `null`
- `ListingContent.missingForPublication(content): readonly ("photos" | "name" | "category")[]`: 公開条件のうち不足する項目を返す
- `ListingContent.toPublishable(content): PublishableListingContent`: 不足があれば `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）。公開条件を定める唯一の場所で、公開、公開中の掲載の保存、掲載の申請の提出（Application）が使う（M-27）
- 等価性: すべての項目の一致。写真は順序と `framing` を含めて比べる

### ListingPatch

```ts
type ListingChange =
  | Readonly<{ field: "name"; value: ListingName }>
  | Readonly<{ field: "description"; value: ListingDescription | null }>
  | Readonly<{ field: "categoryId"; value: CategoryId }>
  | Readonly<{ field: "photos"; value: RevisedPhotos<ListingPhoto> }> // 1枚以上
  | Readonly<{ field: "offering"; value: Offering }>;

type ListingPatch = readonly [ListingChange, ...ListingChange[]];
```

店舗の情報修正（Place の `PlaceRevision`）と同じ構造を持つ。`field` で判別する変更の配列で、写真の項目は共有カーネルの `RevisedPhotos`（写真ごとに、提出の時点で対象にあった `"current"` か、修正が新たに添えた `"added"` かを持つ）。

- 変更する項目だけを持つ。1つ以上の項目を持ち、同じ `field` は1つまで。`description` の `null` は説明を空にする変更。名称・カテゴリーを空にする修正は、型で表せない
- `ListingPatch.create(changes: readonly ListingChange[]): ListingPatch`: 項目が0件なら `BusinessRuleError`（`LISTING_PATCH_EMPTY`）。同じ `field` が重なる、写真の `photoId` が重なる、または写真の項目が0枚なら `BusinessRuleError`（`LISTING_PATCH_INVALID`）
- `ListingPatch.between(current: ListingContent, proposed: PublishableListingContent): ListingPatch`: 掲載の現在の内容と、入力された内容を項目ごとに比べ、値が違う項目だけで作る。写真は、並びまたは `framing` が違えば `RevisedPhotos.between(current.photos, proposed.photos)` を項目の値にする。違う項目が1つもなければ `BusinessRuleError`（`LISTING_PATCH_EMPTY`）（LST-13）。申請の提出と再提出は、この関数で内容を作る
- `ListingPatch.preview(content: ListingContent, patch: ListingPatch): ListingContent`: 修正を掲載の現在の内容に重ねた結果を返す。項目にない値は掲載の現在の値。写真の項目は `RevisedPhotos.overlay(content.photos, value)` の結果（提出の後に外された、または申立てで削除された写真は戻らない）。`Listing.applyPatch` の反映後の内容と、再提出・再申請の入力の初めの内容は、この結果になる
- `ListingPatch.compare(current: ListingContent, patch: ListingPatch): readonly ListingChangeComparison[]`: 項目ごとに、掲載の現在の値と修正の値を並べて返す。順序は `ListingChange` の定義の順。承認者の判断に使う。`ListingChangeComparison` は `field` で判別する直和型で、`{ field; current; proposed }` の `proposed` はその `field` の `value` の型、`current` は `ListingContent` のその項目の型（写真の `current` は `PhotoSet<ListingPhoto>`）
- `ListingPatch.addedPhotoIds(patch: ListingPatch): readonly PhotoId[]`: 写真の項目の `RevisedPhotos.addedPhotoIds`。写真の項目がなければ空。申請が持ち主になる写真はこれだけ
- 承認は、すべての項目を反映する。重ねた結果に写真が1枚も残らない修正は反映できない（`Listing.applyPatch`）。この規則だけが掲載に固有
- 等価性: `field` ごとの値の一致。項目の順序を問わない

### ListingShelf

```ts
type ListingShelf = "published" | "draft" | "hidden" | "ended";
```

掲載は、常にちょうど1つの区分に入る。上から順に判定する。

| 区分 | 条件 |
| --- | --- |
| `hidden`（非公開） | 運営による非公開、または `unpublished` |
| `draft`（下書き） | `draft` |
| `ended`（提供終了） | `published` で、提供状態の段階が `ended` |
| `published`（公開中） | `published` で、提供状態の段階が `upcoming` または `available` |

## ドメインサービス

### OfferingWatch

責務: 公開中の掲載の提供状態を、最後に確かめた段階と比べ、提供終了になった出来事を取り出す。ポートに依存しない純粋な関数。

```ts
OfferingWatch.detect(
  listing: PublishedListing,
  recorded: OfferingPhase | null,
  today: LocalDate,
  now: Date,
): { record: OfferingPhaseRecord; eventDrafts: readonly EventDraft<ListingOfferingEndedEvent>[] }
```

- `record` は、`today` の段階と `confirmedOn: today` を持つ
- `today` の段階が `ended` で、`recorded` が `ended` でなければ、`listing.offering_ended` を1つ返す。`cause` は `OfferingStatus` の `cause`、`observedOn` は `today`
- それ以外はドメインイベントを返さない。提供中に戻った出来事のドメインイベントはない
- 期日による提供終了も、管理する人による提供終了も、この関数だけがドメインイベントにする。提供終了にして次の確認までに提供中へ戻した掲載は、ドメインイベントを出さない

## ドメインイベント

`aggregateId` は `ListingId`（`category.retired` は `CategoryId`）。

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `listing.unpublished` | `{ listingId; placeId; reason: "byManager" \| "photoTakedown" }`（`Publication` の `reason` と同じ値） | `unpublish`、または `takeDownPhotos` で `published` の掲載の写真がなくなった | Notification（P-96） |
| `listing.suspended` | `{ listingId; placeId }` | `suspend` | Notification（P-93、P-96） |
| `listing.unsuspended` | `{ listingId; placeId }` | `unsuspend` | Notification（P-93） |
| `listing.photos_taken_down` | `{ listingId; placeId; photoIds: readonly PhotoId[]; unpublished: boolean }`。`unpublished` は、この削除で一時非公開（`photoTakedown`）になったかどうか。すでに `draft`・`unpublished` だった掲載は `false` | `takeDownPhotos` | Notification（P-93） |
| `listing.deleted` | `{ listingId; placeId }` | `delete` | Application（掲載の修正の申請の前提の再評価、P-77 e）、Notification（P-96） |
| `listing.offering_ended` | `{ listingId; placeId; cause: "schedule" \| "manual"; observedOn: LocalDate }`。`observedOn` は、提供終了を確かめた日 | `OfferingWatch.detect` が提供終了を取り出した | Notification（P-96） |
| `category.retired` | `{ categoryId; successorId }` | `CategoryCatalog.retire` | Notification（P-93。`CategoryCatalog.predecessorsOf(categoryId)` の `CategoryId` を保存している掲載を `ListingRepository.findPageByCategories` で読み、その掲載を持つ店舗ごとに1つの通知を作る） |
| `photos.released` | 共有カーネル | `update`・`applyPatch`・`takeDownPhotos` で写真が外れた、`delete` | Media |

- 下書きの作成、複製、内容の更新、公開、提供終了、提供中への復帰、カテゴリーの追加と名称の変更は、ドメインイベントを出さない
- 通知の宛先（店舗管理者か、管理者不在のためのサービス運営者か、紹介している読みものの有無）は Notification が決める

## ポート

### ListingRepository

目的: 掲載の集約の永続化と、管理側の問い合わせ。`TransactionalRepository<Listing, ListingId>` を拡張する（共通の契約は index.md）。`UnitOfWorkContext` に `listingRepository` として入る。

```ts
interface ListingRepository extends TransactionalRepository<Listing, ListingId> {
  findByIds(ids: readonly ListingId[]): Promise<readonly Listing[]>;
  findPageByPlace(
    placeId: PlaceId,
    shelf: ListingShelf | null,
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>>;
  countByPlace(placeId: PlaceId, today: LocalDate): Promise<Readonly<Record<ListingShelf, number>>>;
  findPageByCategories(categoryIds: readonly CategoryId[], pagination: Pagination): Promise<PaginationResult<Listing>>;
  searchForOperation(keyword: string, pagination: Pagination): Promise<PaginationResult<Listing>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save`・`delete` | index.md の共通の契約。ID の一意性はポートが担保する。`save`・`delete` は楽観ロック。`placeId` と `categoryId` の指す先があることは、呼び出し側が書き込みの前に確かめる。`delete` した掲載は、以後のどの問い合わせにも現れない |
| `findByIds` | 与えた ID のうち、存在する掲載を返す。順序は保証しない。存在しない ID は結果に現れない。ID は 0〜100件で、0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`。index.md）。他のドメインのユースケースが事実（店舗への紐づけ、公開状態、提供状態）を読むのに使う |
| `findPageByPlace` | その店舗のすべての掲載（下書き、一時非公開、運営による非公開を含む）を返す。`shelf` が `null` でなければ、`Listing.shelfOn(listing, today)` がその区分の掲載に絞る。並び順は `updatedAt` の新しい順、同順位は ID の昇順 |
| `countByPlace` | その店舗の掲載の件数を、`Listing.shelfOn(listing, today)` の区分ごとに返す。4つの区分の合計は、その店舗の掲載の総数に一致する |
| `findPageByCategories` | 保存された `content.categoryId` が `categoryIds` のどれかに一致する掲載を、公開状態・運営による非公開を問わず返す（`resolve` を通さない。呼び出し側が `CategoryCatalog.predecessorsOf` で展開した集合を渡す）。`categoryIds` は絞り込みの条件で、件数に上限を持たない。空の集合では空の結果。並び順は ID の昇順。Notification が、廃止したカテゴリーの掲載を持つ店舗を読むのに使う |
| `searchForOperation` | キーワードを名称または説明に含む掲載を、公開状態・運営による非公開を問わず返す。一致は、キーワードと、名称・説明のそれぞれに、共有カーネルの `TextNormalization.normalize` を当てた文字列どうしの部分一致で決まる。アダプターは、保存先の文字列の比較の規則によらず、この正規化を当てた値で比べる。正規化した結果が空のキーワードは空の結果。並び順は関連度の高い順で、名称に含む掲載を、説明だけに含む掲載より先にする。同順位は ID の昇順 |

- エラー: 楽観ロックの競合と ID の重複は `ConflictError`、対象のない（削除済みを含む）`save`・`delete` は `NotFoundError`、100件を超える `findByIds` は `BusinessRuleError`（`COMMON_INVALID_INPUT`）
- 並行性: `save`・`delete` は楽観ロック。内容の更新、状態の変更、申立てに基づく写真の削除、申請の承認による反映は、すべて同じ版で競合を検出する。内容の更新の要求は、編集を始めたときの `Listing.version` を含み、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする（index.md「編集の競合」）。状態を変えるだけの要求（公開、一時非公開、提供終了、提供中への復帰、運営による非公開と解除、申立てに基づく写真の削除、削除）は版を含まない
- 可視性: コミットした書き込みは、以後のすべての問い合わせに即座に反映される
- `shelf` と件数の判定は日付に依存するので、`today` を引数で受け取る。アダプターは `ListingShelf` と `OfferingStatus.of` の定義どおりに判定する

### CategoryCatalogRepository

目的: カテゴリーの台帳の永続化。台帳はサービスに1つで、ID を持たない。index.md の「リポジトリの共通の契約」の、全体で1つの集約の契約に従い、`findById`・`save` と同じ楽観ロックの契約を持ち、`insert`・`delete` を持たない。`UnitOfWorkContext` に `categoryCatalogRepository` として入る。

```ts
interface CategoryCatalogRepository {
  find(): Promise<Versioned<CategoryCatalog>>;
  save(catalog: CategoryCatalog, expectedVersion: ExpectedVersion<CategoryCatalog>): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `find` | 台帳を返す。保存された台帳がなければ、空の台帳（カテゴリーなし、`Version.initial()`）と、その版の `expectedVersion` を返す。カテゴリーは作成順で、廃止済みを含む。台帳が1つであることはポートが担保する |
| `save` | `find` が返した `expectedVersion` と保存されている版が違えば `ConflictError`（楽観ロック）。空の台帳の `expectedVersion` での `save` は、保存された台帳がまだないときだけ成立する（同時の開設は一方が `ConflictError`）。名称の一意、最後の1つの保護、移行先の妥当性は、集約の不変条件と楽観ロックで守る。ポートは名称の一意を担保しない |

- 可視性: コミットした書き込みは、以後の `find` に即座に反映される。廃止が確定した後の `find` は、廃止済みのカテゴリーと移行先を返す

### OfferingPhaseLedger

目的: 公開中の掲載について、最後に確かめた提供状態の段階を、集約とは別に持つ（index.md「時間の経過で起きる出来事」）。`UnitOfWorkContext` に `offeringPhaseLedger` として入る。

```ts
type OfferingPhaseRecord = Readonly<{
  listingId: ListingId;
  phase: OfferingPhase;
  confirmedOn: LocalDate;
}>;

interface OfferingPhaseLedger {
  findPageDrifted(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Readonly<{ listing: PublishedListing; recorded: OfferingPhase | null }>>>;
  record(entry: OfferingPhaseRecord): Promise<void>;
  remove(listingId: ListingId): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `findPageDrifted` | `published` の掲載のうち、記録がないもの、または `Listing.offeringStatus(listing, today).phase` が記録の `phase` と違うものを返す。運営による非公開を問わない。並び順は ID の昇順。`record` で今日の段階を記録した掲載は結果から外れる |
| `record` | その掲載の記録を置き換える。なければ作る。掲載の版を進めない。楽観ロックを持たず、後の書き込みが残る |
| `remove` | その掲載の記録を削除する。記録がなくても成功する |

- 記録の一意性（掲載ごとに1つ）はポートが担保する
- `findPageDrifted` は、処理した掲載が結果から外れる。ジョブは、先頭のページ（`page: 1`）を読み直して進め、読んだページの全件が失敗したら打ち切る。残りは、次の実行が続ける
- 記録が指す掲載が削除された場合、`findPageDrifted` はその記録を返さない

## トランザクション境界

1つの UnitOfWork で原子的に確定する範囲は次のとおり。

| 操作 | 原子的に確定するもの |
| --- | --- |
| 下書きの作成、内容の更新 | 掲載の書き込み、加わった写真の持ち主の設定（Media の `PhotoOwnership.claimAll`）、`photos.released` の保存 |
| 公開、一時非公開、提供終了、提供中への復帰、運営による非公開と解除 | 掲載の書き込み、ドメインイベントの保存 |
| 申立てに基づく写真の削除 | 掲載の書き込み（写真の削除と、公開条件を欠いた場合の `unpublished`）、ドメインイベントの保存。申立ては読むだけで、書き込まない。申立てを対応済みにする操作（Moderation）は別の UnitOfWork で確定する |
| 複製 | 新しい掲載の書き込み、複製した写真の `markStored` と持ち主の設定。写真の実体の複製は、この UnitOfWork の前に Media が行う（[media.md](media.md)） |
| 削除 | 掲載の削除、`OfferingPhaseLedger.remove`、ドメインイベントの保存 |
| 掲載の申請の承認、掲載の修正の申請の承認（Application のユースケース） | 申請の書き込み、掲載の書き込み（`createPublished`・`applyPatch`）、採用した写真の持ち主の付け替え（Media の `PhotoOwnership.transferAll`）、ドメインイベントの保存 |
| カテゴリーの追加、名称の変更 | 台帳の書き込み |
| カテゴリーの廃止 | 台帳の書き込み（廃止と移行先の記録）、`category.retired` の保存。掲載と申請は書き込まない |
| 提供終了の検出（日次のジョブ） | 掲載1件ごとに、`OfferingPhaseLedger.record` と `listing.offering_ended` の保存。掲載は書き込まない |

カテゴリーの廃止で、廃止したカテゴリーの掲載が移行先のカテゴリーの掲載になることは、台帳の書き込みだけで確定する（「カテゴリーの解決」）。閲覧者と管理する人に見える結果は、廃止と同時に切り替わる。店舗管理者への通知は、`category.retired` の消費で結果整合にする。

## ユースケース（概要）

管理の操作（1〜8、10、11）は、操作する人がその店舗の掲載を管理できること（店舗管理者、または店舗管理者のいない店舗でのサービス運営者）を、Authority の `AccessPolicy` で確かめる。9 は、その店舗の掲載を管理できる人に加えて、サービス運営者が店舗管理者の有無にかかわらず行える（index.md「操作の可否」の、サービス運営者が対象を開いて確かめる読み取り）。12〜15、19〜21 はサービス運営者が行う。内容の更新（2）の要求は、編集を始めたときの版を含む。読み取りは、カテゴリーを `CategoryCatalog.resolve` で解決し、提供状態を `Listing.offeringStatus` で求め、写真の表示用の参照を Media の `PhotoStorage` から得て返す。

| # | 名前 | 説明 | シナリオ |
| --- | --- | --- | --- |
| 1 | createListingDraft | 店舗に紐づく下書きを作る。冪等な作成（同じ ID で、`placeId` と `ListingContent` が等しければ成功として扱う） | LST-01、LST-02、LST-03、LST-15 |
| 2 | updateListing | 掲載の内容（名称、説明、カテゴリー、写真、提供の設定）を保存する。公開中の掲載は保存した時点で反映する | LST-02、LST-03、LST-06、LST-11、LST-16、MOD-03、MOD-06 |
| 3 | publishListing | 下書きを公開する。一時非公開の掲載を再公開する | LST-04、LST-07、LST-15、LST-16、MOD-03 |
| 4 | unpublishListing | 公開中の掲載を一時非公開にする | LST-07、LST-16 |
| 5 | endListingOffering | 公開中の掲載を提供終了にする | LST-08、LST-16 |
| 6 | resumeListingOffering | 管理する人が提供終了にした掲載を、提供中に戻す | LST-08、LST-16 |
| 7 | duplicateListing | 掲載を複製して、同じ店舗の下書きを作る。写真は Media で複製する。冪等な作成（新しい ID の掲載がすでにあり、元の掲載と同じ店舗の掲載なら、書き込みも写真の複製もなしに成功として扱う。違う店舗の掲載なら `ConflictError`） | LST-09 |
| 8 | deleteListing | 掲載を削除する | LST-10、LST-16 |
| 9 | getManagedListing | 掲載1件の内容、公開状態、運営による非公開、提供状態、店舗管理者の有無を返す。サービス運営者が掲載を ID で開いて確かめる読み取りを兼ねる | LST-05、LST-06、LST-11、LST-16、MOD-07 |
| 10 | listPlaceListings | 店舗の掲載を、管理上の区分で絞って返す。区分ごとの件数を返す | LST-05、LST-11、LST-16、SHP-05 |
| 11 | previewListing | 掲載の保存済みの内容を、公開状態を問わず、閲覧者向けの掲載の要約と掲載詳細と同じ形で返す。投影は Discovery の `ViewProjection.previewListing` による | LST-04、LST-15 |
| 12 | suspendListing | サービス運営者が、掲載を運営による非公開にする | MOD-07、MOD-02 |
| 13 | unsuspendListing | サービス運営者が、運営による非公開を解除する | MOD-07 |
| 14 | takeDownListingPhotos | サービス運営者が、未対応の申立ての対象である掲載から、選んだ写真を外す。申立ての事実は Moderation のポートから読んで確かめる（`TakedownClaimRepository.findById`、`TakedownClaim.authorizePhotoRemoval`）。申立ては書き換えない | MOD-02 |
| 15 | searchListingsForOperation | サービス運営者が、閲覧できない掲載を含めて、キーワードで掲載を探す | LST-16、MOD-07 |
| 16 | detectEndedOfferings | 日次のジョブ。`findPageDrifted` の掲載ごとに `OfferingWatch.detect` を行い、記録を更新して、提供終了のドメインイベントを出す | LST-03、LST-08 |
| 17 | provisionInitialCategories | 開設時に、空の台帳に初期値の4つのカテゴリーを入れる。台帳が空でなければ何もしない | OPE-02 |
| 18 | listCategories | 現役のカテゴリーを作成順で返す | OPE-02、LST-01 |
| 19 | addCategory | サービス運営者が、カテゴリーを追加する。冪等な作成（同じ ID で同じ名称の現役のカテゴリーがあれば成功として扱う） | OPE-02 |
| 20 | renameCategory | サービス運営者が、カテゴリーの名称を変更する | OPE-02 |
| 21 | retireCategory | サービス運営者が、移行先を指定してカテゴリーを廃止する | OPE-03 |

掲載の申請と掲載の修正の申請の提出・承認（LST-12〜LST-14）は Application のユースケースで、このドメインの `PublishableListingContent`・`ListingPatch`・`Listing.createPublished`・`Listing.applyPatch` を使う。

- 提出と再提出は、内容のカテゴリーが現役であることを `CategoryCatalog.requireActive` で確かめる（掲載の修正の申請は、カテゴリーを変える場合）。廃止済みのカテゴリーなら `LISTING_CATEGORY_NOT_AVAILABLE`
- 提出の後にカテゴリーが廃止された申請の内容は書き換えない。表示は `CategoryCatalog.resolve` を通し、承認（`createPublished`・`applyPatch`）が現役のカテゴリーに置き換える
- 承認者が見比べる内容は `ListingPatch.compare` で作る

イベントの参加に添える掲載の確認（Occasion の参加の操作と `listAttachableListings`、Application の参加の申請）は、このドメインの `Listing.attachableIds` を使う。
