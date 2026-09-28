# Listing

掲載の内容、公開状態、提供状態と、掲載を分類するカテゴリーを管理する。

共有カーネルの `ListingId`・`PlaceId`・`CategoryId`・`PhotoId`・`PhotoSet`・`RevisedPhotos`・`FieldPatch`・`Publication`・`Suspension`・`LocalDate`・`SearchKeyword`・`SearchableText`・`KeywordRelevance`・`Version`・`PhotosReleasedEvent`・`PhotosTakenDownEvent`・`Actor` を使う（[index.md](index.md)）。他のドメインに依存しない。

- 掲載を誰が管理するかは Authority の事実で、掲載は持たない。管理の操作の可否は、ユースケースが Authority の `AccessPolicy` で確かめる。店舗管理者とサービス運営者は、同じ振る舞いを使う（LST-15、LST-16）
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
| PublicationShelf | 公開状態の区分 | 公開中・下書き・非公開の3つ。公開状態と運営による非公開で決まり、掲載はちょうど1つに入る |
| ListingShelf | 管理上の区分 | 管理側の一覧で掲載を絞る条件。公開状態の区分と提供状態の段階の、2つの直交する条件の組（M-09）。管理側の画面の「提供終了」は、提供状態の段階が `ended` の掲載 |
| ListingPatch | 掲載の修正 | 掲載の修正の申請が持つ、変更した項目だけの値（共有カーネルの `FieldPatch`） |
| ListingMatching | 掲載のキーワードの一致 | キーワードを掲載の名称・説明に当てること。一致と関連度は共有カーネルの `KeywordRelevance` が定める |
| CategoryCatalog | カテゴリーの台帳 | サービスに1つだけある、すべてのカテゴリー（廃止済みを含む）の並び |
| Category | カテゴリー | 掲載の分類。1階層で、掲載ごとに1つ（P-18） |
| Successor | 移行先 | 廃止したカテゴリーの掲載が属することになるカテゴリー。廃止の時に台帳に記録する |
| OfferingPhaseRecord | 提供状態の確認記録 | 公開中の掲載について、最後に確かめた提供状態の段階と、確かめた時点の掲載の版と、提供状態が次に変わる暦日。集約の外に持つ |

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

すべて純粋な関数。`version` と `updatedAt` の進み方は index.md「リポジトリの共通の契約」による。戻り値の `WithEventDrafts` のドメインイベントは「ドメインイベント」の節による。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `reconstruct` | 保存された値 | `Listing` | 値オブジェクトを通して組み立て直す。公開状態ごとの形（`published` の内容が公開条件を満たすことを含む）を欠く値は `RehydrationError` |
| `createDraft` | `params: { id: ListingId; placeId: PlaceId; content: ListingContent }, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<DraftListing>` | 下書きを作る。必要なのは `placeId` だけで、内容は空でよい。`content.categoryId` が `null` でなければ `CategoryCatalog.requireActive` で確かめる。`suspension` は `{ suspended: false }`。ドメインイベントはない |
| `createPublished` | `params: { id: ListingId; placeId: PlaceId; content: PublishableListingContent }, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<PublishedListing>` | 掲載の申請の承認で、公開中の掲載を作る（LST-14）。`content.categoryId` は `CategoryCatalog.resolve` で現役のカテゴリーに置き換える。`firstPublishedAt` は `now`、`manualEnd` は `{ ended: false }`。ドメインイベントはない |
| `duplicate` | `source: Listing, params: { id: ListingId; photoIds: ReadonlyMap<PhotoId, PhotoId> }, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<DraftListing>` | 同じ `placeId` の下書きを作る。名称・説明・カテゴリー・写真（並び順と `framing`）を引き継ぎ、`offering` は `{ kind: "none" }` にする。写真の並びは `PhotoSet.of` で作り、`takenDown` を引き継がない。写真の `PhotoId` は `photoIds`（元の ID → 複製した写真の ID）で置き換える。`source` の写真のすべてが `photoIds` の鍵になければ `BusinessRuleError`（`LISTING_DUPLICATE_PHOTOS_MISMATCH`）。公開状態・提供状態・運営による非公開を問わず元にでき、新しい下書きは `source` の運営による非公開を引き継がない（`suspension` は `{ suspended: false }`）。カテゴリーは `CategoryCatalog.resolve` で置き換える。`source` は変わらない |
| `isDuplicateOf` | `candidate: Listing, source: Listing, catalog: CategoryCatalog` | `boolean` | 複製の送り直しの判定。`candidate` が `source` の `duplicate` の結果と同じ内容なら `true`。`placeId` が等しく、名称・説明・提供の設定が等しく、カテゴリーが `CategoryCatalog.resolve` を通して等しく（どちらも `null` を含む）、写真が同じ枚数で、並びごとの `framing` が等しい（`PhotoId` は複製で変わるので比べない）ときに `true`。`duplicate` の結果の `offering` は `{ kind: "none" }` なので、`candidate` の提供の設定も「設定しない」でなければ `false` |
| `update` | `listing: Listing, content: ListingContent, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<Listing>` | 内容を `content` で置き換える。`published` の掲載は、`ListingContent.toPublishable(content)` で公開条件を確かめる（欠けば、不足する項目を添えた `LISTING_PUBLISH_CONDITION_UNMET`）。`content.categoryId` が `null` でなければ `CategoryCatalog.requireActive` で確かめる（廃止済みなら `LISTING_CATEGORY_NOT_AVAILABLE`）。外れた写真の `PhotoId` を `photos.released` で返す。写真の並びは `PhotoSet.replace(listing.content.photos, content.photos.items)` で置き換える（`takenDown` を保つか消すかは `PhotoSet.replace` が決める）。公開状態を問わず（下書き・公開・一時非公開）、運営による非公開の間も行える（LST-06）。内容が変わらなければ、何も変えずに返す |
| `applyPatch` | `listing: Listing, patch: ListingPatch, catalog: CategoryCatalog, now: Date` | `WithEventDrafts<Listing>` | 掲載の修正の申請の承認で、`patch` にある項目だけを現在の内容に反映する。ほかの項目は現在の内容のまま残る。反映後の内容は `FieldPatch.preview(ListingPatch.schema, listing.content, patch)` の結果で、カテゴリーの項目は `CategoryCatalog.resolve` で現役のカテゴリーに置き換える。写真の項目を重ねた結果に1枚も残らなければ `BusinessRuleError`（`LISTING_PATCH_PHOTOS_UNAVAILABLE`）。修正が新たに添えた写真（`FieldPatch.addedPhotoIds`）は、すべて反映後の内容に載る。外れた写真を `photos.released` で返す。公開状態と運営による非公開を問わず行える |
| `publish` | `listing: Listing, now: Date` | `WithEventDrafts<PublishedListing>` | 公開・再公開。公開状態は、共有カーネルの `Publication.publish({ publication, suspension }, ListingContent.missingForPublication(listing.content), now, "LISTING")` で進める。判定の順とエラー（`LISTING_SUSPENDED`、`COMMON_PUBLICATION_INVALID_TRANSITION`、不足する項目を添えた `LISTING_PUBLISH_CONDITION_UNMET`）は、この関数が持つ（index.md「公開状態と運営による非公開の関数」）。成立した掲載の内容は `ListingContent.toPublishable` で `PublishableListingContent` にする。`draft` からの公開は `manualEnd` を `{ ended: false }` にし、`unpublished` からの再公開は `manualEnd` を保つ |
| `unpublish` | `listing: Listing, now: Date` | `WithEventDrafts<UnpublishedListing>` | 一時非公開。公開状態は、共有カーネルの `Publication.unpublish({ publication, suspension }, "byManager", "LISTING")` で進める。判定の順とエラー（`LISTING_SUSPENDED`、`COMMON_PUBLICATION_INVALID_TRANSITION`）は、この関数が持つ。内容、`manualEnd`、`firstPublishedAt` は変わらない |
| `endOffering` | `listing: Listing, now: Date` | `WithEventDrafts<PublishedListing>` | `manualEnd` を `{ ended: true }` にする。提供の設定を問わない。`published` でない掲載は `BusinessRuleError`（`LISTING_NOT_PUBLISHED`）。すでに `ended: true` なら `BusinessRuleError`（`LISTING_ALREADY_ENDED`）。運営による非公開を問わない |
| `resumeOffering` | `listing: Listing, now: Date` | `WithEventDrafts<PublishedListing \| UnpublishedListing>` | `manualEnd` を `{ ended: false }` にする。公開状態を問わず、`published` と `unpublished` のどちらの掲載にも行える（LST-08）。`manualEnd` が `ended: true` でなければ（`draft` を含む）`BusinessRuleError`（`LISTING_NOT_MANUALLY_ENDED`。期日による提供終了は、この操作では戻らない）。公開状態は変わらない。戻した後の提供状態は `offeringStatus` に従い、期日を過ぎていれば提供終了のまま（LST-08）。運営による非公開を問わない |
| `suspend` | `listing: Listing, now: Date` | `WithEventDrafts<Listing>` | `suspension` を、共有カーネルの `Suspension.suspend(listing.suspension, "LISTING")` の結果にする。公開状態を問わず、公開状態を書き換えない。すでに運営による非公開なら、この関数が `BusinessRuleError`（`LISTING_ALREADY_SUSPENDED`）にする |
| `unsuspend` | `listing: Listing, now: Date` | `WithEventDrafts<Listing>` | `suspension` を、共有カーネルの `Suspension.unsuspend(listing.suspension, "LISTING")` の結果にする。公開状態はそのまま現れる。運営による非公開でなければ、この関数が `BusinessRuleError`（`LISTING_NOT_SUSPENDED`）にする |
| `takeDownPhotos` | `listing: Listing, photoIds: readonly [PhotoId, ...PhotoId[]], now: Date` | `WithEventDrafts<Listing>` | 申立てに基づいて写真を外す（MOD-02。index.md の「申立てに基づく写真の削除」）。写真は、共有カーネルの `PhotoSet.takeDown(listing.content.photos, photoIds, "LISTING")` で外す（`takenDown` は `true` になる）。`photoIds` は重複のない1枚以上。残る写真の順序は変わらず、1枚目を外すと次の写真が代表写真になる。`photoIds` に掲載の写真でないものがあれば、この関数が `BusinessRuleError`（`LISTING_PHOTO_NOT_FOUND`）にし、1枚も外さない。`published` の掲載で写真が残らなければ、`Publication.unpublish({ publication, suspension }, "photoTakedown", "LISTING")` で `unpublished` にする。運営による非公開の間も同じ。外した写真を `content.photos_taken_down`（`owner` は `{ kind: "listing"; id }`、`unpublished` はこの削除で `unpublished` になったかどうか）と `photos.released` に載せる。申立てを受け取らない（申立てと外せる写真の関係は index.md「申立てに基づく写真の削除」） |
| `delete` | `listing: Listing, now: Date` | `readonly EventDraft[]` | 削除のドメインイベントと、すべての写真の `photos.released` を返す。公開状態・提供状態・運営による非公開を問わない。削除した掲載は復元できない（B-27） |
| `offeringStatus` | `listing: Listing, today: LocalDate` | `OfferingStatus` | `OfferingStatus.of(listing.content.offering, manualEnd, today)`。`draft` の `manualEnd` は `{ ended: false }` として扱う |
| `publicationShelf` | `listing: Listing` | `PublicationShelf` | 掲載が入る公開状態の区分を返す（`ListingShelf` の節の表による） |
| `inShelf` | `listing: Listing, shelf: ListingShelf, today: LocalDate` | `boolean` | `shelf.publication` が `null` か `publicationShelf(listing)` に等しく、かつ `shelf.phase` が `null` か `offeringStatus(listing, today).phase` に等しければ `true` |
| `attachableIds` | `listings: readonly Listing[], placeId: PlaceId, today: LocalDate` | `readonly ListingId[]` | イベントの参加に添えられる掲載の `ListingId` を、`listings` の順で返す。添えられる掲載は、`placeId` がその店舗で、`published` で、運営による非公開でない掲載。提供状態を問わない（提供開始前・提供中・提供終了のどれも添えられる。I-22）。添えられる掲載の規則を定める唯一の場所で、Occasion の参加の操作と Application の参加の申請が使う。候補の読み取り（Occasion の `listAttachableListings`）が使う `ListingRepository.findPageAttachable` の契約も、この関数で定める |

#### 不変条件

- `published` の掲載の内容は、写真1枚以上・名称・カテゴリーを持つ（型で保証する）。`draft` と `unpublished` の内容は、どの項目が空でもよい
- `placeId` は変わらない。掲載は常に1つの店舗に紐づく（B-16）
- `draft` の掲載は `manualEnd` を持たない。提供終了にできるのは `published` の掲載だけ（M-22）。提供中に戻せるのは、管理する人が提供終了にした掲載で、公開状態を問わない（LST-08）
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
}>;

type RetiredCategory = Readonly<{
  id: CategoryId;
  name: CategoryName;
  status: "retired";
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
| `reconstruct` | 保存された値 | `CategoryCatalog` | 値オブジェクトを通して組み立て直す。不変条件（現役の名称の一意、`successorId` が台帳の別のカテゴリーを指し、連なりが現役のカテゴリーに行き着くこと）を欠く値は `RehydrationError` |
| `establish` | `catalog, initial: readonly { id: CategoryId; name: CategoryName }[], now: Date` | `WithEventDrafts<CategoryCatalog>` | 空の台帳に、開設時のカテゴリーを現役として入れる。台帳が空でなければ `BusinessRuleError`（`LISTING_CATEGORY_CATALOG_ESTABLISHED`）。`initial` は1つ以上で、名称が重複すれば `BusinessRuleError`（`LISTING_CATEGORY_NAME_TAKEN`）。ドメインイベントはない。初期値の名称は `INITIAL_CATEGORY_NAMES = ["食べる", "買う", "体験", "見る"]`（B-45） |
| `add` | `catalog, params: { id: CategoryId; name: CategoryName }, now: Date` | `WithEventDrafts<CategoryCatalog>` | 現役のカテゴリーを並びの最後に加える。現役のカテゴリーに同じ名称があれば `BusinessRuleError`（`LISTING_CATEGORY_NAME_TAKEN`）。同じ `id` があれば `BusinessRuleError`（`LISTING_CATEGORY_ID_TAKEN`） |
| `rename` | `catalog, id: CategoryId, name: CategoryName, now: Date` | `WithEventDrafts<CategoryCatalog>` | 現役のカテゴリーの名称を変える。`id` がなければ `BusinessRuleError`（`LISTING_CATEGORY_NOT_FOUND`）、廃止済みなら `LISTING_CATEGORY_RETIRED`、他の現役のカテゴリーと同じ名称なら `LISTING_CATEGORY_NAME_TAKEN`。同じ名称への変更は何も変えない。掲載は書き換わらない |
| `retire` | `catalog, id: CategoryId, successorId: CategoryId, now: Date` | `WithEventDrafts<CategoryCatalog>` | 現役のカテゴリーを廃止済みにし、移行先を記録する。判定は上から順で、どれも `BusinessRuleError`。(1) `id` が台帳になければ `LISTING_CATEGORY_NOT_FOUND`。(2) `id` が廃止済みなら `LISTING_CATEGORY_RETIRED`。(3) 現役のカテゴリーが `id` の1つだけなら `LISTING_CATEGORY_LAST_ONE`。(4) `successorId` が `id` と同じ、台帳にない、または廃止済みなら `LISTING_CATEGORY_SUCCESSOR_INVALID`。移行先は、そのカテゴリーの掲載が1件もなくても必須（引数の型で保証する） |
| `actives` | `catalog` | `readonly ActiveCategory[]` | 現役のカテゴリーを作成順で返す。掲載に設定するカテゴリーの選択肢と、絞り込みの選択肢 |
| `requireActive` | `catalog, id: CategoryId` | `ActiveCategory` | `id` が現役のカテゴリーでなければ `BusinessRuleError`（`LISTING_CATEGORY_NOT_AVAILABLE`） |
| `resolve` | `catalog, id: CategoryId` | `ActiveCategory` | `id` が現役ならそれを、廃止済みなら `successorId` を現役のカテゴリーに当たるまでたどって返す。台帳にない `id` は `BusinessRuleError`（`LISTING_CATEGORY_NOT_FOUND`） |
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
- 廃止済みのカテゴリーの扱いは、操作がカテゴリーを新しく選ぶかどうかで分かれる。管理する人が選んで保存する内容（`createDraft`・`update`）は `requireActive` で確かめ、廃止済みなら `LISTING_CATEGORY_NOT_AVAILABLE` で選び直させる（申請の提出・再提出も同じ。下の「ユースケース（概要）」）。保存・提出された値を引き継ぐ操作（`duplicate`、承認の `createPublished`・`applyPatch`）は `resolve` で移行先に置き換え、選び直させない（OPE-03）

## 値オブジェクト

### ListingName / ListingDescription / CategoryName

```ts
type ListingName = string & { readonly [listingNameBrand]: true };
type ListingDescription = string & { readonly [listingDescriptionBrand]: true };
type CategoryName = string & { readonly [categoryNameBrand]: true };
```

- `ListingName.create(input: string)`: 前後の空白を除く。空、または改行を含めば `BusinessRuleError`（`LISTING_INVALID_NAME`）
- `ListingDescription.create(input: string)`: 前後の空白を除く。空なら `BusinessRuleError`（`LISTING_INVALID_DESCRIPTION`）。改行を含められる。説明のない掲載は `null` で表す
- `CategoryName.create(input: string)`: 前後の空白を除く。空、または改行を含めば `BusinessRuleError`（`LISTING_INVALID_CATEGORY_NAME`）
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

- `OfferingPeriod.create(input: { start: LocalDate | null; end: LocalDate | null })`: 両方が `null`、または両方があって `end` が `start` より前なら `BusinessRuleError`（`LISTING_INVALID_OFFERING_PERIOD`）。`start` と `end` が同じ日でもよい
- `OpenDates.create(input: readonly LocalDate[])`: 空なら `BusinessRuleError`（`LISTING_INVALID_OPEN_DATES`）。重複を除き、昇順に並べる。過去の日付も受け付ける（LST-03）
- `Offering` は排他的な選択で、切り替えると前の設定を持たない
- 等価性: `kind` と、その中身の一致

提供の設定から、提供状態の段階を分ける2つの暦日を求める。どちらも純粋な関数で、提供の設定のどの暦日を境に段階が変わるかは、この2つだけが持つ。保存先の問い合わせ（`ListingRepository` の提供状態の段階の判定）は、この2つの暦日を比べるだけで段階の境を決める。

| 関数 | 結果 |
| --- | --- |
| `Offering.startsOn(offering: Offering): LocalDate \| null` | 提供開始前が終わる暦日。`period` で `start` があれば `start`。それ以外（`none`、`start` のない `period`、`dates`）は `null`。開催日は、最初の開催日より前も提供中なので `null` |
| `Offering.lastAvailableOn(offering: Offering): LocalDate \| null` | 提供中である最後の暦日。`period` で `end` があれば `end`、`dates` は最後の開催日。それ以外（`none`、`end` のない `period`）は `null` |

### ManualEnd

```ts
type ManualEnd = Readonly<{ ended: boolean }>;
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

`OfferingStatus.of(offering: Offering, manualEnd: ManualEnd, today: LocalDate): OfferingStatus` は純粋な関数で、提供状態を定める唯一の場所。段階は、`Offering.startsOn`・`Offering.lastAvailableOn` の暦日と `today` の比較と、`manualEnd.ended` だけで決まる。

1. 期日による段階を求める。`startsOn` があって `today < startsOn` なら `upcoming`（`startsOn` を持つ）。`lastAvailableOn` があって `lastAvailableOn < today` なら `ended`。それ以外は `available`
2. `manualEnd.ended` が `true` なら `{ phase: "ended"; cause: "manual"; scheduleElapsed }`。`scheduleElapsed` は、期日による段階が `ended` かどうか
3. `manualEnd.ended` が `false` なら、期日による段階をそのまま返す。`ended` は `cause: "schedule"`

段階が `ended` になるのは、`manualEnd.ended` が `true`、または `lastAvailableOn` が `today` より前のとき。

`OfferingStatus.nextChangeOn(offering: Offering, manualEnd: ManualEnd, today: LocalDate): LocalDate | null` は、`today` より後で `OfferingStatus.of` の段階が `today` の段階から変わる最初の暦日を返す。変わる日がなければ `null`。

- `manualEnd.ended` が `true`: `null`
- `startsOn` があって `today < startsOn` なら `startsOn`
- `lastAvailableOn` があって `today <= lastAvailableOn` なら `lastAvailableOn` の翌日
- それ以外は `null`

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
  photos: PhotoSet<ListingPhoto> & Readonly<{ items: readonly [ListingPhoto, ...ListingPhoto[]] }>;
}>;
```

- `ListingContent.create(input)`: 各項目を値オブジェクトで組み立てる。空の名称・説明は `null`。写真の並びは `PhotoSet.of(…, "LISTING")` で作る（`photoIds` の重複は `LISTING_DUPLICATE_PHOTO`）
- `ListingContent.missingForPublication(content): readonly ("photos" | "name" | "category")[]`: 公開条件のうち不足する項目を返す
- `ListingContent.toPublishable(content): PublishableListingContent`: 不足があれば、不足する項目（`missingForPublication` の結果）を添えた `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）。公開条件を定める唯一の場所で、公開、公開中の掲載の保存、掲載の申請の提出（Application）が使う（M-27）
- 等価性: すべての項目の一致。写真は `items` を順序と `framing` を含めて比べ、`takenDown` は比べない

### ListingPatch

```ts
type ListingChange =
  | Readonly<{ field: "name"; value: ListingName }>
  | Readonly<{ field: "description"; value: ListingDescription | null }>
  | Readonly<{ field: "categoryId"; value: CategoryId }>
  | Readonly<{ field: "photos"; value: RevisedPhotos<ListingPhoto> }> // 1枚以上
  | Readonly<{ field: "offering"; value: Offering }>;

type ListingPatch = FieldPatch<ListingChange>;
```

変更した項目だけを持つ修正の規則（生成、差分、重ね合わせ、見比べ、添えた写真、承認はすべての項目を反映すること）は、共有カーネルの `FieldPatch`（index.md「修正の申請」）が定める。Listing が定めるのは、項目と、項目ごとの読み方・比べ方・重ね方と、掲載に固有の規則だけ。

- `description` の `null` は説明を空にする変更。名称・カテゴリーを空にする修正は、型で表せない。写真の項目は1枚以上の写真を持つ
- `ListingPatch.schema: FieldPatchSchema<ListingContent, ListingChange, …>`: 項目の順は `ListingChange` の定義の順、写真の項目は `photos`。各項目は `ListingContent` の同じ名前の項目を読み、`ListingContent` の等価性の規則で比べ（写真は並びと `framing`）、その項目を置き換えて重ねる
- 申請の提出と再提出は `FieldPatch.between(ListingPatch.schema, listing.content, proposed)` で内容を作る。`proposed` は `PublishableListingContent`（LST-13）なので、変更の値の名称・カテゴリーは `null` にならず、写真は1枚以上になる
- 掲載に固有の規則: 重ねた結果に写真が1枚も残らない修正は反映できない（`Listing.applyPatch` の `LISTING_PATCH_PHOTOS_UNAVAILABLE`）

### ListingShelf

```ts
type PublicationShelf = "published" | "draft" | "hidden";

type ListingShelf = Readonly<{
  publication: PublicationShelf | null; // null は公開状態の区分で絞らない
  phase: OfferingPhase | null;          // null は提供状態の段階で絞らない
}>;
```

掲載は、公開状態の区分のちょうど1つと、提供状態の段階のちょうど1つに入る。2つの条件は互いに独立で、`Listing.inShelf` は両方の条件が合うときに成り立つ。公開状態の区分の条件は `Listing.publicationShelf` だけが、提供状態の段階は `Listing.offeringStatus`（`OfferingStatus.of`）だけが持つ。

| 公開状態の区分 | 条件 |
| --- | --- |
| `published`（公開中） | `published` で、運営による非公開でない |
| `draft`（下書き） | `draft` で、運営による非公開でない |
| `hidden`（非公開） | 運営による非公開、または `unpublished` |

- 提供状態の段階は、公開状態と運営による非公開を問わない。`draft` は `manualEnd` を持たないので、期日だけで決まる

## ドメインサービス

### ListingMatching

責務: キーワードを掲載に当てるときの、掲載の文字列を定める。純粋な関数で、ポートに依存しない。

| メソッド | 処理内容 |
| --- | --- |
| `searchableText(listing: Listing): SearchableText` | `primary` は名称（名称のない掲載は空の文字列）、`secondary` は説明（説明のない掲載は空の並び） |

キーワードの一致と関連度は、この値に共有カーネルの `KeywordRelevance` を当てて決める。サービス運営者の検索（`ListingRepository.searchForOperation`）と、Discovery のキーワード検索・対象の選択の候補は、同じこの定義による。

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

- `record` は、`today` の段階、`observedVersion: listing.version`、`nextChangeOn: OfferingStatus.nextChangeOn(listing.content.offering, listing.manualEnd, today)` を持つ
- `today` の段階が `ended` で、`recorded` が `ended` でなければ、`listing.offering_ended` を1つ返す。`observedOn` は `today`
- それ以外はドメインイベントを返さない。提供中に戻った出来事のドメインイベントはない
- 期日による提供終了も、管理する人による提供終了も、この関数だけがドメインイベントにする。提供終了にして次の確認までに提供中へ戻した掲載は、ドメインイベントを出さない
- 提供状態の段階の規則は `Offering.startsOn`・`Offering.lastAvailableOn`・`OfferingStatus.of`・`OfferingStatus.nextChangeOn` だけが持つ。確認記録のポートは、版と暦日を比べるだけで、段階を求めない

## ドメインイベント

`aggregateId` は `ListingId`（`category.retired` は `CategoryId`）。型は、表の上から順に `ListingUnpublishedEvent`、`ListingSuspendedEvent`、`ListingUnsuspendedEvent`、`ListingDeletedEvent`、`ListingOfferingEndedEvent`、`CategoryRetiredEvent`（`DomainEventBase<型名, ペイロード>`）と、共有カーネルの `PhotosTakenDownEvent`・`PhotosReleasedEvent`。

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `listing.unpublished` | `{ listingId; reason: "byManager" \| "photoTakedown" }`（`Publication` の `reason` と同じ値） | `unpublish`、または `takeDownPhotos` で `published` の掲載の写真がなくなった | Notification（notification.md の対応の表） |
| `listing.suspended` | `{ listingId; placeId }` | `suspend` | Notification（notification.md の対応の表） |
| `listing.unsuspended` | `{ listingId; placeId }` | `unsuspend` | Notification（notification.md の対応の表） |
| `listing.deleted` | `{ listingId }` | `delete` | Application（掲載の修正の申請の前提の再評価、P-77 e）、Notification（notification.md の対応の表） |
| `listing.offering_ended` | `{ listingId; observedOn: LocalDate }`。`observedOn` は、提供終了を確かめた日。期日による提供終了と、管理する人による提供終了を区別しない | `OfferingWatch.detect` が提供終了を取り出した | Notification（notification.md の対応の表） |
| `category.retired` | `{ categoryId }` | `CategoryCatalog.retire` | Notification（notification.md の対応の表） |
| `content.photos_taken_down` | 共有カーネル。`unpublished` は、この削除で一時非公開（`photoTakedown`）になったかどうかで、すでに `draft`・`unpublished` だった掲載は `false` | `takeDownPhotos` | Notification（notification.md の対応の表） |
| `photos.released` | 共有カーネル | `update`・`applyPatch`・`takeDownPhotos` で写真が外れた、`delete` | Media |

- 下書きの作成、複製、内容の更新、公開、提供終了、提供中への復帰、カテゴリーの追加と名称の変更は、ドメインイベントを出さない
- `listing.offering_ended` は、日次のジョブと掲載の削除が同時に確定すると、削除された掲載について出る（`listing.deleted` より後に届くこともある）。消費者は、指す掲載がないことを消費の失敗にしない

## ポート

### ListingRepository

目的: 掲載の集約の永続化と、管理側の問い合わせ。`TransactionalRepository<Listing, ListingId>` を拡張する（共通の契約は index.md）。`UnitOfWorkContext` に `listingRepository` として入る。

```ts
interface ListingRepository extends TransactionalRepository<Listing, ListingId> {
  findByIds(ids: readonly ListingId[]): Promise<readonly Listing[]>;
  isDeleted(id: ListingId): Promise<boolean>;
  findPageByPlace(
    placeId: PlaceId,
    shelf: ListingShelf,
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Listing>>;
  countByPlace(placeId: PlaceId, today: LocalDate): Promise<ListingShelfCounts>;
  findPageAttachable(placeId: PlaceId, today: LocalDate, pagination: Pagination): Promise<PaginationResult<Listing>>;
  findPageByCategories(categoryIds: readonly CategoryId[], pagination: Pagination): Promise<PaginationResult<Listing>>;
  searchForOperation(keyword: SearchKeyword, pagination: Pagination): Promise<PaginationResult<Listing>>;
}

type ListingShelfCounts = Readonly<{
  publication: Readonly<Record<PublicationShelf, number>>;
  phase: Readonly<Record<OfferingPhase, number>>;
}>;
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save`・`delete` | index.md の共通の契約。ID の一意性はポートが担保する。`save`・`delete` は楽観ロック。`placeId` と `categoryId` の指す先があることは、呼び出し側が書き込みの前に確かめる。`delete` した掲載は、以後のどの問い合わせにも現れない。ポートは削除した掲載の ID を覚え、同じ ID の `insert` は `ConflictError` にする（削除した掲載は、作成の送り直しでも戻らない。B-27） |
| `isDeleted` | その ID の掲載が削除済みなら `true`。掲載があるとき、その ID の掲載が一度も作られていないときは `false`。作成の送り直し（`createListingDraft`・`duplicateListing`）が、写真の持ち主の設定・写真の複製より先に、削除した ID を `ConflictError` にするために使う |
| `findByIds` | 与えた ID のうち、存在する掲載を返す。順序は保証しない。存在しない ID は結果に現れない。ID は 0〜100件で、0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`。index.md）。他のドメインのユースケースが事実（店舗への紐づけ、公開状態、提供状態）を読むのに使う |
| `findPageByPlace` | その店舗の掲載（下書き、一時非公開、運営による非公開を含む）のうち、`Listing.inShelf(listing, shelf, today)` が成り立つものを返す（`shelf` の2つの条件がどちらも `null` なら、すべての掲載。区分の判定は下の「区分の判定」）。並び順は `updatedAt` の新しい順、同順位は ID の昇順 |
| `countByPlace` | その店舗の掲載の件数を、公開状態の区分ごと（`publication`）と、提供状態の段階ごと（`phase`）に返す（区分の判定は下の「区分の判定」）。`publication` の合計と `phase` の合計は、どちらもその店舗の掲載の総数に一致する |
| `findPageAttachable` | その店舗の掲載のうち、`Listing.attachableIds(その店舗のすべての掲載, placeId, today)` が返す掲載を返す。並び順は `updatedAt` の新しい順、同順位は ID の昇順 |
| `findPageByCategories` | 保存された `content.categoryId` が `categoryIds` のどれかに一致する掲載を、公開状態・運営による非公開を問わず返す（`resolve` を通さない。呼び出し側が `CategoryCatalog.predecessorsOf` で展開した集合を渡す）。`categoryIds` は絞り込みの条件で、件数に上限を持たない。空の集合では空の結果。並び順は ID の昇順。Notification が、廃止したカテゴリーの掲載を持つ店舗を読むのに使う |
| `searchForOperation` | 公開状態・運営による非公開を問わず、`KeywordRelevance.matches(ListingMatching.searchableText(listing), keyword)` が成り立つ掲載を返す。並び順は `KeywordRelevance.relevance` の降順、同順位は ID の昇順。アダプターは、保存先の文字列の比較の規則や全文検索の機能によらず、この定義と同じ結果を返す |

- エラー: 楽観ロックの競合と ID の重複は `ConflictError`、対象のない（削除済みを含む）`save`・`delete` は `NotFoundError`、100件を超える `findByIds` は `BusinessRuleError`（`COMMON_INVALID_INPUT`）
- 並行性: `save`・`delete` は楽観ロック。内容の更新、状態の変更、申立てに基づく写真の削除、申請の承認による反映は、すべて同じ版で競合を検出する。内容の更新の要求は、編集を始めたときの `Listing.version` を含み、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする（index.md「編集の競合」）。状態を変えるだけの要求（公開、一時非公開、提供終了、提供中への復帰、運営による非公開と解除、申立てに基づく写真の削除、削除）は版を含まない
- 可視性: コミットした書き込みは、以後のすべての問い合わせに即座に反映される
- 区分の判定: 公開状態の区分は、公開状態と運営による非公開の比較だけで決まる（`ListingShelf` の表）。提供状態の段階は、`OfferingStatus.of` が返す条件で決まる。`ended` は `manualEnd.ended` が `true`、または `Offering.lastAvailableOn(content.offering)` が `today` より前。`upcoming` は `ended` でなく、`Offering.startsOn(content.offering)` が `today` より後。どちらでもなければ `available`。`today` は引数で受け取る。アダプターは、`insert`・`save` の時点で掲載の内容から `Offering.startsOn`・`Offering.lastAvailableOn` の暦日を求めて持ち、問い合わせは暦日と真偽値の比較だけを持つ。期日による段階の規則（どの暦日まで提供中か）は、アダプターに持たない

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
  observedVersion: Version;       // 確かめた時点の Listing.version
  nextChangeOn: LocalDate | null; // OfferingStatus.nextChangeOn の値
}>;

interface OfferingPhaseLedger {
  findPageDrifted(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<Readonly<{ listing: PublishedListing; recorded: OfferingPhase | null }>>>;
  find(listingId: ListingId): Promise<OfferingPhaseRecord | null>;
  record(entry: OfferingPhaseRecord): Promise<void>;
  remove(listingId: ListingId): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `findPageDrifted` | `published` の掲載のうち、記録がないもの、記録の `observedVersion` が掲載の `version` と違うもの、または記録の `nextChangeOn` が `today` 以前のものを、記録の `phase`（記録がなければ `null`）とともに返す。`nextChangeOn` が `null` の記録は、暦日では返らない。運営による非公開を問わない。並び順は ID の昇順。提供状態の段階を求めない（段階の規則は `Offering`・`OfferingStatus` の関数だけが持つ） |
| `find` | その掲載の記録を返す。記録がない、または記録が指す掲載がなければ `null` |
| `record` | その掲載の記録を置き換える。なければ作る。掲載の版を進めない。楽観ロックを持たず、後の書き込みが残る。掲載がない（削除済みを含む）`listingId` の記録も成功する |
| `remove` | その掲載の記録を削除する。記録がなくても成功する |

- 記録の一意性（掲載ごとに1つ）はポートが担保する。記録が指す掲載があることは担保しない（index.md「リポジトリの共通の契約」の参照整合性。`find`・`record` の行）
- `OfferingWatch.detect` が返した記録を `record` した掲載は、掲載の版が変わるか、`nextChangeOn` の暦日が来るまで、`findPageDrifted` の結果から外れる。ジョブは、先頭のページ（`page: 1`）を読み直して進め、読んだページの全件が失敗したら打ち切る。残りは、次の実行が続ける

## トランザクション境界

1つの UnitOfWork で原子的に確定する範囲は次のとおり。

| 操作 | 原子的に確定するもの |
| --- | --- |
| 下書きの作成、内容の更新 | 掲載の書き込み、加わった写真の持ち主の設定（Media の `PhotoOwnership.claimAll`）、`photos.released` の保存 |
| 公開、一時非公開、提供終了、提供中への復帰、運営による非公開と解除 | 掲載の書き込み、ドメインイベントの保存 |
| 申立てに基づく写真の削除（Moderation の `takeDownPhotosByClaim`） | 掲載の書き込み（写真の削除と、公開条件を欠いた場合の `unpublished`）、ドメインイベントの保存。申立ては読むだけで、書き込まない。申立てを対応済みにする操作（Moderation）は別の UnitOfWork で確定する |
| 複製 | 新しい掲載の書き込み、複製した写真の `markStored` と持ち主の設定。写真の実体の複製は、この UnitOfWork の前に Media が行う（[media.md](media.md)）。この UnitOfWork の中で、新しい ID の掲載を読み直し、あれば `Listing.isDuplicateOf` で送り直しかどうかを決める |
| 削除 | 掲載の削除、`OfferingPhaseLedger.remove`、ドメインイベントの保存 |
| 掲載の申請の承認、掲載の修正の申請の承認（Application のユースケース） | 申請の書き込み、掲載の書き込み（`createPublished`・`applyPatch`）、申請が持ち主の写真のすべての持ち主の付け替え（Media の `PhotoOwnership.transferAll`）、ドメインイベントの保存 |
| カテゴリーの追加、名称の変更 | 台帳の書き込み |
| カテゴリーの廃止 | 台帳の書き込み（廃止と移行先の記録）、`category.retired` の保存。掲載と申請は書き込まない |
| 提供終了の検出（日次のジョブ） | 掲載1件ごとに、`OfferingPhaseLedger.record` と `listing.offering_ended` の保存。掲載は書き込まない。この UnitOfWork の中で、掲載と記録を読み直してから `OfferingWatch.detect` を当てる |

カテゴリーの廃止で、廃止したカテゴリーの掲載が移行先のカテゴリーの掲載になることは、台帳の書き込みだけで確定する（「カテゴリーの解決」）。閲覧者と管理する人に見える結果は、廃止と同時に切り替わる。店舗管理者への通知は、`category.retired` の消費で結果整合にする。

## ユースケース（概要）

管理の操作（1〜8、10、11）の可否は、Authority の `AccessPolicy` の `manage_target`（対象は掲載の店舗）で確かめる。9 は `inspect_target`（対象を開いて状態と管理者の有無を確かめる読み取り）で確かめ、出力の「管理できるか」は `manage_target` の結果を返す。12〜14、18〜20 は `operate_service` で確かめる。内容の更新（2）の要求は、編集を始めたときの版を含む。読み取りは、カテゴリーを `CategoryCatalog.resolve` で解決し、提供状態を `Listing.offeringStatus` で求め、写真の表示用の参照を Media の `PhotoStorage` から得て返す。

| # | 名前 | 説明 | シナリオ |
| --- | --- | --- | --- |
| 1 | createListingDraft | 店舗に紐づく下書きを作る。冪等な作成（同じ ID で、`placeId` と `ListingContent` が等しければ成功として扱う） | LST-01、LST-02、LST-03、LST-15 |
| 2 | updateListing | 掲載の内容（名称、説明、カテゴリー、写真、提供の設定）を保存する。公開状態と運営による非公開を問わず保存できる。公開中の掲載は公開条件を確かめ、保存した時点で反映する | LST-02、LST-03、LST-06、LST-11、LST-16、MOD-03、MOD-06 |
| 3 | publishListing | 下書きを公開する。一時非公開の掲載を再公開する | LST-04、LST-07、LST-15、LST-16、MOD-03 |
| 4 | unpublishListing | 公開中の掲載を一時非公開にする | LST-07、LST-16 |
| 5 | endListingOffering | 公開中の掲載を提供終了にする | LST-08、LST-16 |
| 6 | resumeListingOffering | 管理する人が提供終了にした掲載を、公開状態を問わず、提供中に戻す | LST-08、LST-16 |
| 7 | duplicateListing | 掲載を複製して、同じ店舗の下書きを作る。写真は Media で複製する。冪等な作成（新しい ID の掲載がすでにあり、`Listing.isDuplicateOf` が成り立てば、書き込みも写真の複製もなしに成功として扱う。成り立たなければ `ConflictError`） | LST-09 |
| 8 | deleteListing | 掲載を削除する | LST-10、LST-16 |
| 9 | getManagedListing | 掲載1件の内容、公開状態、運営による非公開、提供状態、申立てで写真が削除されたこと、店舗管理者の有無と、紐づく店舗の名称・所在地・所属地域・非公開かどうかを返す。サービス運営者が掲載を ID で開いて確かめる読み取りを兼ねる | LST-06、LST-07、LST-08、LST-09、LST-10、LST-11、LST-16、MOD-03、MOD-07 |
| 10 | listPlaceListings | 店舗の掲載を、管理上の区分（公開状態の区分と提供状態の段階）で絞って返す。公開状態の区分ごとと提供状態の段階ごとの件数を返す | LST-05、LST-11、LST-16、SHP-05 |
| 11 | previewListing | 掲載の保存済みの内容を、公開状態を問わず、閲覧者向けの掲載の要約と掲載詳細と同じ形で返す。投影は Discovery の `ViewProjection.previewListing` による | LST-04、LST-15 |
| 12 | suspendListing | サービス運営者が、掲載を運営による非公開にする | MOD-07、MOD-02 |
| 13 | unsuspendListing | サービス運営者が、運営による非公開を解除する | MOD-07 |
| 14 | searchListingsForOperation | サービス運営者が、閲覧できない掲載を含めて、キーワードで掲載を探す。一致と関連度は `ListingMatching.searchableText` に当てた `KeywordRelevance` | LST-16、MOD-07 |
| 15 | detectEndedOfferings | 日次のジョブ。`findPageDrifted` の掲載ごとに、掲載と記録を読み直して `OfferingWatch.detect` を行い、記録を更新して、提供終了のドメインイベントを出す | LST-03、LST-08 |
| 16 | provisionInitialCategories | 開設時に、空の台帳に初期値の4つのカテゴリーを入れる。台帳が空でなければ何もしない | OPE-02 |
| 17 | listCategories | 現役のカテゴリーを作成順で返す | OPE-02、LST-01、LST-12、LST-13、DIS-03 |
| 18 | addCategory | サービス運営者が、カテゴリーを追加する。冪等な作成（同じ ID で同じ名称の現役のカテゴリーがあれば成功として扱い、同じ ID のほかのカテゴリーがあれば `ConflictError`） | OPE-02 |
| 19 | renameCategory | サービス運営者が、カテゴリーの名称を変更する | OPE-02 |
| 20 | retireCategory | サービス運営者が、移行先を指定してカテゴリーを廃止する | OPE-03 |

掲載の申請と掲載の修正の申請の提出・承認（LST-12〜LST-14）は Application のユースケースで、このドメインの `PublishableListingContent`・`ListingPatch`（`ListingPatch.schema`）・`Listing.createPublished`・`Listing.applyPatch` を使う。

- 提出と再提出は、内容のカテゴリーが現役であることを `CategoryCatalog.requireActive` で確かめる（掲載の修正の申請は、カテゴリーを変える場合）。廃止済みのカテゴリーなら `LISTING_CATEGORY_NOT_AVAILABLE`
- 提出の後にカテゴリーが廃止された申請の内容は書き換えない。表示は `CategoryCatalog.resolve` を通し、承認（`createPublished`・`applyPatch`）が現役のカテゴリーに置き換える
- 承認者が見比べる内容は `FieldPatch.compare(ListingPatch.schema, …)` で作る

イベントの参加に添える掲載の確認（Occasion の参加の操作、Application の参加の申請）は、このドメインの `Listing.attachableIds` を使う。添えられる掲載の候補の読み取り（Occasion の `listAttachableListings`）は、`ListingRepository.findPageAttachable` を使う。
