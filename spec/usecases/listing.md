# Listing のユースケース

ドメイン: Listing（[../domains/listing.md](../domains/listing.md)。カテゴリーを含む）

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `createListingDraft` | 店舗に紐づく掲載の下書きを作る | LST-01、LST-02、LST-03、LST-15 / SM-04 |
| `updateListing` | 掲載の内容を保存する。公開状態と運営による非公開を問わず保存でき、公開中の掲載は公開条件を確かめて、保存した時点で反映する | LST-02、LST-03、LST-06、LST-11、LST-16、MOD-03、MOD-06 / SM-04 |
| `publishListing` | 下書きを公開する。一時非公開の掲載を再公開する | LST-04、LST-07、LST-15、LST-16、MOD-03 / SM-04、CM-03 |
| `unpublishListing` | 公開中の掲載を一時非公開にする | LST-07、LST-16 / SM-04 |
| `endListingOffering` | 公開中の掲載を提供終了にする | LST-08、LST-16 / SM-04 |
| `resumeListingOffering` | 管理する人が提供終了にした掲載を、公開状態を問わず、提供中に戻す | LST-08、LST-16 / SM-04 |
| `duplicateListing` | 掲載を複製して、同じ店舗の下書きを作る | LST-09 / SM-04 |
| `deleteListing` | 掲載を削除する | LST-10、LST-16 / SM-04 |
| `getManagedListing` | 掲載1件の内容、公開状態、運営による非公開、提供状態、申立てで写真が削除されたこと、店舗管理者の有無と、紐づく店舗の名称・所在地・所属地域・非公開かどうかを返す | LST-06、LST-07、LST-08、LST-09、LST-10、LST-11、LST-16、MOD-03、MOD-07 / SM-04、OM-03 |
| `listPlaceListings` | 店舗の掲載を管理上の区分で絞って返し、区分ごとの件数を返す | LST-05、LST-11、LST-16、SHP-05 / SM-03、SM-01 |
| `previewListing` | 保存済みの掲載の内容を、閲覧者に見えるのと同じ形で返す | LST-04、LST-15 / CM-03 |
| `suspendListing` | サービス運営者が、掲載を運営による非公開にする | MOD-07、MOD-02 / OM-03 |
| `unsuspendListing` | サービス運営者が、運営による非公開を解除する | MOD-07 / OM-03 |
| `searchListingsForOperation` | サービス運営者が、閲覧できない掲載を含めて、キーワードで掲載を探す | LST-16、MOD-07 / OM-02 |
| `detectEndedOfferings` | 日次のジョブ。公開中の掲載の提供終了を取り出して、ドメインイベントを出す | LST-03、LST-08 |
| `provisionInitialCategories` | 開設時に、初期値の4つのカテゴリーを台帳に入れる | OPE-02 |
| `listCategories` | 現役のカテゴリーを作成順で返す | OPE-02、LST-01、LST-12、LST-13、DIS-03 / OM-06、SM-04、RQ-04、VW-02 |
| `addCategory` | サービス運営者が、カテゴリーを追加する | OPE-02 / OM-06 |
| `renameCategory` | サービス運営者が、カテゴリーの名称を変更する | OPE-02 / OM-06 |
| `retireCategory` | サービス運営者が、移行先を指定してカテゴリーを廃止する | OPE-03 / OM-06 |

掲載の申請と掲載の修正の申請の提出・承認（LST-12〜LST-14）は Application のユースケースが行う。申立てに基づく掲載の写真の削除（MOD-02）は Moderation の `takeDownPhotosByClaim` が行い、`Listing.takeDownPhotos` を呼ぶ。

## 共通の組み立て

各ユースケースの「使用するドメインの振る舞い・ポート」は、次の2つの可否の確かめ方と、読み取りの組み立てを名前で参照する。

集約のリポジトリ（`listingRepository`、`categoryCatalogRepository`、`offeringPhaseLedger`、`placeRepository`、`roleRosterRepository`、`stewardshipRepository`、`photoAssetRepository` など）は `UnitOfWorkContext` から得る。読み取りだけのユースケースも `run` を1つ使い、書き込まずに返す。UnitOfWork に参加しない `PhotoStorage` と Discovery の `ViewProjection` の投影は、`run` の外で使う。エラーケースの表は、可否の条件を再掲せず、`AccessPolicy` の拒否と操作の種類だけを書く。

内容を編集して保存する要求（`updateListing`）は、編集を始めたときの掲載の版を含む。状態を変えるだけの要求（公開、一時非公開、提供終了、提供中への復帰、削除、運営による非公開と解除）は版を含まず、すでにその状態であることを `BusinessRuleError` で返し、同時の書き込みは `save`・`delete` の楽観ロックで守る（[../domains/index.md](../domains/index.md)「編集の競合」）。

### 掲載の管理の可否

掲載の紐づく店舗を対象に、`manage_target` の可否を確かめる。店舗管理者とサービス運営者は、同じユースケースを使う。

- `RoleRosterRepository.findRolesOf`（`ActorAuthority` を作る）
- `StewardshipRepository.findById`（対象は `{ kind: "place"; id: placeId }`。なければ `Stewardship.vacant`）
- `Stewardship.standingOf`
- `AccessPolicy.decide`（`{ kind: "manage_target"; standing }`）。`allowed: false` なら `ForbiddenError`

書き込みを持つユースケースは、書き込みと同じ UnitOfWork の中で、書き込みの前に確かめる。

### サービス運営の可否

- `RoleRosterRepository.findRolesOf`
- `AccessPolicy.decide`（`{ kind: "operate_service" }`）。`allowed: false` なら `ForbiddenError`

書き込みを持つユースケースは、書き込みと同じ UnitOfWork の中で、書き込みの前に確かめる。

### 管理する掲載の読み取りの組み立て

掲載を返すユースケースは、保存された `CategoryId` を `CategoryCatalog.resolve` で現役のカテゴリーにし、提供状態を `Listing.offeringStatus(listing, LocalDate.fromInstant(now))` で求め、写真の表示用の参照を `PhotoStorage.displayRefs` で得て返す。`getManagedListing` と同じ形で掲載1件を返すユースケースは、紐づく店舗の名称・所在地・非公開かどうかと、店舗が所属中の地域の名称（最初に所属した順）を添える（SM-04 は所在地と所属地域を店舗の情報から示し、店舗が非公開の間は掲載が閲覧者に表示されないことを示す）。

- `CategoryCatalogRepository.find`、`CategoryCatalog.resolve`
- `Listing.offeringStatus`、`LocalDate.fromInstant`、`Clock`
- `PhotoStorage.displayRefs`
- 掲載1件を返すとき: `PlaceRepository.findById`、`Place.isSuspended`（店舗の名称・所在地・非公開かどうか）、`PlaceAffiliationsRepository.findById`（なければ所属なし）、`RegionRepository.findByIds`（所属中の地域の名称）。所属地域の読み取りは、Region が入る段階から加わり、それまでの所属地域は空（[../domains/index.md](../domains/index.md)「開発の順序との対応」）

組み立てが読むリポジトリ（`categoryCatalogRepository`、`placeRepository`、`placeAffiliationsRepository`、`regionRepository`）は、各ユースケースの `run` の中で、書き込みの前に読む。各ユースケースの「リポジトリ」の列挙は、組み立ての分を含めない。

ID で引く問い合わせ（`PhotoStorage.displayRefs`、`PhotoAssetRepository.findByIds`、`PlaceRepository.findByIds`、`StewardshipRepository.findByTargets`）は 0〜100件を受け取る。100件を超える ID は、100件ずつに分けて呼ぶ。

## createListingDraft

### 概要

店舗に紐づく掲載の下書きを作る。必要なのは店舗への紐づけだけで、名称・説明・カテゴリー・写真・提供の設定は空でよい。公開条件は確かめない。載せた写真の持ち主を、同じ UnitOfWork でこの掲載に設定する。作った下書きは閲覧者に表示されない。

冪等な作成。呼び出し側が掲載の ID を決める。同じ ID の掲載がすでにあり、`placeId` と `ListingContent` が等しければ、書き込みなしに成功として扱う。公開状態は比べないので、最初の作成の後に公開された掲載への送り直しは、その掲載を現在の公開状態のまま返す。

### 入出力

- 入力: `Actor`、呼び出し側が決めた `ListingId`、`PlaceId`、掲載の内容（名称、説明、カテゴリー、写真の並びと写真ごとの見せる範囲、提供の設定）
- 出力: 作った下書き（`getManagedListing` と同じ形。送り直しでは、その掲載の現在の状態）
- 価格とキャッチコピーを受け取らない。所在地と所属地域を受け取らない
- 提供の設定は「設定しない / 提供期間 / 開催日」のどれか1つ。提供期間は開始日と終了日のどちらか一方以上を持ち、終了日は開始日より前にならない。開催日は1つ以上

### 使用するドメインの振る舞い・ポート

- 掲載の管理の可否
- `PlaceRepository.findById`（店舗があること）
- `CategoryCatalogRepository.find`
- `ListingContent.create`、`Listing.createDraft`
- `ListingRepository.findById`（冪等な作成の判定。`ListingContent` の等価性で比べる）、`insert`
- `PhotoAssetRepository.findByIds`、`PhotoOwnership.claimAll`（持ち主は `{ kind: "listing"; id }`）、`PhotoAssetRepository.save`
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `insert`、載せた写真の `save`（持ち主の設定）。ドメインイベントはない
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`placeRepository`、`categoryCatalogRepository`、`listingRepository`、`photoAssetRepository`
- ロールバック: 可否が成り立たない、店舗がない、カテゴリーが現役でない、写真の持ち主を設定できない、ID の重複または楽観ロックの競合。どの場合も、掲載も写真の持ち主も残らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |
| 選んだカテゴリーが廃止されている | `BusinessRuleError`（`LISTING_CATEGORY_NOT_AVAILABLE`） |
| 名称が改行を含む、写真の `PhotoId` が重なる | `BusinessRuleError`（`LISTING_INVALID_NAME`、`LISTING_DUPLICATE_PHOTO`） |
| 提供期間を選んで、開始日も終了日もない、または終了日が開始日より前 | `BusinessRuleError`（`LISTING_INVALID_OFFERING_PERIOD`） |
| 開催日を選んで、開催日が1つもない | `BusinessRuleError`（`LISTING_INVALID_OPEN_DATES`） |
| 載せる写真が存在しない・破棄されている、操作する人が登録した写真でない、すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |
| 同じ ID で、`placeId` または内容の違う掲載がある | `ConflictError` |
| 同じ ID の掲載が削除されている（削除の後に届いた作成の送り直しを含む。`ListingRepository.insert` が拒む） | `ConflictError`。削除した掲載は戻らない |

## updateListing

### 概要

掲載の内容（名称、説明、カテゴリー、写真、提供の設定）を、受け取った内容で置き換えて保存する。承認を求めない。公開中の掲載は、保存した時点で閲覧者への表示に反映する。公開中の掲載は、公開条件を欠く内容では保存できない。下書きと一時非公開の掲載は公開条件を確かめず、どの項目が空でも保存できる（公開条件は公開・再公開の時点で確かめる）。

加わった写真の持ち主を同じ UnitOfWork でこの掲載に設定し、外れた写真を `photos.released` で手放す。運営による非公開の間も保存できる。内容が変わらなければ、何も書き込まない。

提供状態は保存しない。保存の後の提供状態は、保存した提供の設定と今日の暦日から決まる。

### 入出力

- 入力: `Actor`、`ListingId`、編集を始めたときの掲載の版、掲載の内容（`createListingDraft` と同じ項目と規則）
- 出力: 保存した後の掲載（`getManagedListing` と同じ形。保存の後の提供状態を含む）

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`（編集を始めたときの版と違えば `ConflictError`）、`save`
- 掲載の管理の可否（掲載の `placeId` で確かめる）
- `CategoryCatalogRepository.find`
- `ListingContent.create`、`Listing.update`
- `PhotoAssetRepository.findByIds`、`PhotoOwnership.claimAll`（現在の内容になく、受け取った内容にある写真）、`PhotoAssetRepository.save`
- `collectEvents`（`photos.released`）
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `save`、加わった写真の `save`（持ち主の設定）、`photos.released` の保存
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`categoryCatalogRepository`、`listingRepository`、`photoAssetRepository`
- ロールバック: 可否が成り立たない、掲載がない、版が違う、公開条件を欠く、カテゴリーが現役でない、写真の持ち主を設定できない、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 掲載が削除されている | `NotFoundError` |
| 別の人が先に保存している（編集を始めたときの版と違う、または同時の保存） | `ConflictError` |
| 公開中の掲載を、写真・名称・カテゴリーのいずれかを欠く内容で保存する | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`。不足する項目を添える） |
| 選んだカテゴリーが廃止されている | `BusinessRuleError`（`LISTING_CATEGORY_NOT_AVAILABLE`） |
| 名称・写真・提供の設定の入力エラー（`createListingDraft` と同じ） | `BusinessRuleError`（`LISTING_INVALID_NAME`、`LISTING_DUPLICATE_PHOTO`、`LISTING_INVALID_OFFERING_PERIOD`、`LISTING_INVALID_OPEN_DATES`） |
| 加える写真が存在しない・破棄されている、操作する人が登録した写真でない、すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |

## publishListing

### 概要

下書きを公開する。一時非公開の掲載を再公開する。保存済みの内容が写真・名称・カテゴリーを持てば成立し、承認を求めない。公開条件を欠く場合は、不足する項目を添えて拒否し、掲載は公開していない状態のまま残る。運営による非公開の掲載は公開できない。店舗が非公開でも公開できる。

再公開は `manualEnd` を保つ。公開の後の提供状態は、提供の設定・`manualEnd`・今日の暦日から決まる。ドメインイベントはない。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 公開した後の掲載（`getManagedListing` と同じ形）
- 公開条件を欠くエラーは、不足する項目（写真・名称・カテゴリー）を添える

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`、`save`
- 掲載の管理の可否
- `Listing.publish`、`ListingContent.missingForPublication`（判定の順は、共有カーネルの `Publication.publish` が持つ: 運営による非公開、不正な遷移、公開条件）
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `save`
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`listingRepository`
- ロールバック: 可否が成り立たない、掲載がない、運営による非公開、公開条件を欠く、すでに公開中、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 掲載が削除されている | `NotFoundError` |
| 運営による非公開（後から管理権限を得た店舗管理者も同じ） | `BusinessRuleError`（`LISTING_SUSPENDED`） |
| すでに公開中（別の人が先に公開した） | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`） |
| 写真・名称・カテゴリーのいずれかを欠く（申立てで写真がなくなった掲載を含む） | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`。不足する項目を添える） |
| 同時の保存 | `ConflictError` |

## unpublishListing

### 概要

公開中の掲載を一時非公開にする。公開状態は `unpublished`（`reason: "byManager"`）になり、`listing.unpublished` を出す。内容、`manualEnd`、`firstPublishedAt` は変わらない。運営による非公開の掲載は一時非公開にできない。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 一時非公開にした後の掲載（`getManagedListing` と同じ形）

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`、`save`
- 掲載の管理の可否
- `Listing.unpublish`
- `collectEvents`（`listing.unpublished`）
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `save`、`listing.unpublished` の保存
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`listingRepository`
- ロールバック: 可否が成り立たない、掲載がない、運営による非公開、公開中でない、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 掲載が削除されている | `NotFoundError` |
| 運営による非公開 | `BusinessRuleError`（`LISTING_SUSPENDED`） |
| 公開中でない（下書き、別の人が先に一時非公開にした） | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`） |
| 同時の保存 | `ConflictError` |

## endListingOffering

### 概要

公開中の掲載を、管理する人の操作で提供終了にする。提供の設定を問わず、運営による非公開の間も行える。`manualEnd` を記録するだけで、ドメインイベントは出さない。提供終了のドメインイベントは `detectEndedOfferings` が出す。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 提供終了にした後の掲載（`getManagedListing` と同じ形。提供状態は `ended`・`cause: "manual"`）

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`、`save`
- 掲載の管理の可否
- `Listing.endOffering`
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `save`
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`listingRepository`
- ロールバック: 可否が成り立たない、掲載がない、公開中でない、すでに管理する人が提供終了にしている、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 掲載が削除されている | `NotFoundError` |
| 公開中でない（下書き、一時非公開） | `BusinessRuleError`（`LISTING_NOT_PUBLISHED`） |
| すでに管理する人が提供終了にしている | `BusinessRuleError`（`LISTING_ALREADY_ENDED`） |
| 同時の保存 | `ConflictError` |

## resumeListingOffering

### 概要

管理する人が提供終了にした掲載を、提供中に戻す。公開中と一時非公開のどちらの掲載にも行え、公開状態は変わらない。運営による非公開の間も行える。`manualEnd` を外すだけで、戻した後の提供状態は提供の設定と今日の暦日から決まる。終了日または最後の開催日を過ぎている掲載は、戻しても提供終了（`cause: "schedule"`）のまま。期日で自動で提供終了になった掲載は、この操作の対象ではない。ドメインイベントはない。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 戻した後の掲載（`getManagedListing` と同じ形。戻した後の提供状態を含む）

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`、`save`
- 掲載の管理の可否
- `Listing.resumeOffering`
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `save`
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`listingRepository`
- ロールバック: 可否が成り立たない、掲載がない、管理する人による提供終了でない、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 掲載が削除されている | `NotFoundError` |
| 管理する人が提供終了にした掲載でない（期日による提供終了、下書きを含む） | `BusinessRuleError`（`LISTING_NOT_MANUALLY_ENDED`） |
| 同時の保存 | `ConflictError` |

## duplicateListing

### 概要

掲載を元にして、同じ店舗の新しい下書きを作る。名称・説明・カテゴリー・写真（並び順と見せる範囲）を引き継ぎ、提供の設定は「設定しない」にする。下書き・公開・一時非公開のどの掲載も、提供状態と運営による非公開を問わず元にできる。新しい下書きは、元の掲載の運営による非公開を引き継がない。元の掲載は変わらない。

写真は Media の `duplicatePhotos` で複製し、複製した写真の `markStored` と持ち主の設定を、新しい掲載の書き込みと同じ UnitOfWork で行う。元の写真の持ち主は変わらない。

冪等な作成（[../domains/index.md](../domains/index.md) の「リポジトリの共通の契約」）。呼び出し側が新しい掲載の ID を決める。この要求の内容は、元の掲載を複製した下書きで、同じ内容かどうかは `Listing.isDuplicateOf(すでにある掲載, 元の掲載, 台帳)` で判定する。成り立てば、同じ ID・同じ内容の送り直しとして、書き込みも写真の複製もなしにすでにある掲載を返す。成り立たなければ（別の店舗の掲載、複製の後に内容が変わった掲載を含む）`ConflictError`。

### 入出力

- 入力: `Actor`、元にする掲載の `ListingId`、呼び出し側が決めた新しい `ListingId`
- 出力: 作った下書き（`getManagedListing` と同じ形）。送り直しでは、すでにある掲載

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`（元の掲載と、新しい ID の掲載）、`insert`
- 掲載の管理の可否（元の掲載の `placeId` で確かめる）
- `CategoryCatalogRepository.find`
- `Listing.isDuplicateOf`（冪等な作成の判定）
- Media の `duplicatePhotos`（元の `PhotoId` から新しい `PhotoId` への対応を得る）
- `Listing.duplicate`
- `PhotoAssetRepository.findByIds`、`PhotoAsset.markStored`、`PhotoOwnership.claimAll`（持ち主は新しい掲載）、`PhotoAssetRepository.save`
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

- `run` は2つ。判定のための読み取りだけの `run` と、書き込みの `run`（[../domains/index.md](../domains/index.md)「UnitOfWork ポート」）
- 2つの `run` の間に、外部への副作用として Media の `duplicatePhotos`（写真の記録と `PhotoStorage.copy`）がある。読み取りの `run` で送り直しか `ConflictError` に決まれば、写真を複製しない
- 書き込みの `run` は、可否と新しい ID の掲載を確かめ直す（新しい ID の掲載があれば、冪等な作成の判定による）。元の掲載は書き込みの対象でないので読み直さず、読み取りの `run` で読んだ内容を複製する。書き込むのは、新しい掲載の `insert` と、複製した写真の `save`（`markStored` と持ち主の設定）
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`categoryCatalogRepository`、`listingRepository`、`photoAssetRepository`
- ロールバック: 可否が成り立たない、ID の重複または楽観ロックの競合
- 途中で失敗した場合に残る状態: 新しい掲載は作られない。複製した写真は持ち主のないまま残り、Media の `sweepUnownedPhotos` が削除する（書き込みの `run` で送り直しと分かった場合も同じ）。元の掲載と元の写真は変わらない
- 読み取りの `run` の後に元の掲載が削除されても、写真の複製が成立すれば、読んだ内容で新しい下書きができる

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 元の掲載が削除されている、または存在しない | `NotFoundError` |
| 新しい `ListingId` と同じ ID の掲載があり、`isDuplicateOf` が成り立たない | `ConflictError` |
| 新しい `ListingId` と同じ ID の掲載が削除されている（`ListingRepository.insert` が拒む） | `ConflictError`。複製した写真は持ち主のないまま残り、`sweepUnownedPhotos` が削除する |
| 元の写真が複製の前に破棄されている（`duplicatePhotos` が成立しない） | `BusinessRuleError`（`MEDIA_DUPLICATE_SOURCE_UNAVAILABLE`） |

## deleteListing

### 概要

掲載を削除する。公開状態・提供状態・運営による非公開を問わない。削除した掲載は復元できず、以後のどの読み取りにも現れない。`listing.deleted` と、すべての写真の `photos.released` を出す。提供状態の確認記録も同じ UnitOfWork で削除する。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`、`delete`
- 掲載の管理の可否
- `Listing.delete`
- `OfferingPhaseLedger.remove`
- `collectEvents`（`listing.deleted`、`photos.released`）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `delete`、`OfferingPhaseLedger.remove`、`listing.deleted` と `photos.released` の保存
- リポジトリ: `roleRosterRepository`、`stewardshipRepository`、`listingRepository`、`offeringPhaseLedger`
- ロールバック: 可否が成り立たない、掲載がない、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 別の人が先に削除している | `NotFoundError` |
| 同時の保存・削除 | `ConflictError` |

## getManagedListing

### 概要

掲載1件を、管理する人に返す。内容、公開状態（一時非公開の理由を含み、申立てで写真がなくなった掲載を区別できる）、運営による非公開、提供状態（提供終了は、期日によるものと管理する人によるものを区別する）を返す。閲覧できない掲載（下書き、一時非公開、運営による非公開、非公開の店舗の掲載）も返す。

読めるかどうかは `inspect_target`（対象を開いて状態と管理者の有無を確かめる読み取り）で確かめる。掲載を管理できるかどうかは、`manage_target` の結果を返す。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 掲載1件を、内容（カテゴリーは現役に解決したもの）、公開状態と一時非公開の理由、運営による非公開、提供状態、申立てで写真が削除されたこと（写真の並びの `takenDown`。写真の `PhotoId` の並びが変わるまで）、紐づく店舗の名称・所在地・所属中の地域の名称・非公開かどうか、店舗に店舗管理者がいるかどうか、操作する人がこの掲載を管理できるかどうかとともに返す

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`
- `RoleRosterRepository.findRolesOf`、`StewardshipRepository.findById`（対象は掲載の店舗。なければ `Stewardship.vacant`）、`Stewardship.standingOf`
- `AccessPolicy.decide`（`{ kind: "inspect_target"; standing }`。`allowed: false` なら `ForbiddenError`）。出力の管理できるかどうかは `AccessPolicy.decide`（`{ kind: "manage_target"; standing }`）の結果
- `Stewardship.isVacant`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使い、掲載、可否、台帳、店舗、所属、地域を読んで、書き込まずに返す。`PhotoStorage.displayRefs` は `run` の外で呼ぶ。サービス運営者が不在の代行で開く場合も、店舗の所在地と所属地域はこの読み取りで返す。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`inspect_target`） | `ForbiddenError` |
| 掲載が削除されている、または存在しない | `NotFoundError` |

## listPlaceListings

### 概要

店舗のすべての掲載（下書き、一時非公開、運営による非公開、代理作成や申請の承認で公開された掲載、管理者のいなかった時期の下書きを含む）を、更新の新しい順に返す。管理上の区分（`ListingShelf`）の2つの条件、公開状態の区分（公開中・下書き・非公開）と提供状態の段階（提供開始前・提供中・提供終了）で絞れる。公開状態の区分ごとと提供状態の段階ごとの件数を併せて返す。段階と件数は今日の暦日で決まる。SM-01・SM-03 の区分のうち、公開中・下書き・非公開は公開状態の区分、提供終了は提供状態の段階 `ended` に当たる。

### 入出力

- 入力: `Actor`、`PlaceId`、公開状態の区分（指定しなければ絞らない）、提供状態の段階（指定しなければ絞らない）、`Pagination`
- 出力: 掲載の一覧（`findPageByPlace` の並び）と条件に合う全件数、公開状態の区分ごとと提供状態の段階ごとの件数（`countByPlace`）。掲載ごとに、掲載を見分ける情報（名称・代表写真・現役に解決したカテゴリー）、公開状態と一時非公開の理由、運営による非公開、提供状態を返す

### 使用するドメインの振る舞い・ポート

- `PlaceRepository.findById`（店舗があること）
- 掲載の管理の可否
- `ListingRepository.findPageByPlace`、`countByPlace`
- `LocalDate.fromInstant`、`Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使い、店舗、可否、`findPageByPlace`、`countByPlace`、台帳を読んで、書き込まずに返す。`PhotoStorage.displayRefs` は `run` の外で呼ぶ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |

掲載が1件もない店舗と、選んだ区分に当てはまる掲載がない場合は、空の一覧を返す。

## previewListing

### 概要

保存済みの掲載の内容を、公開状態を問わず、閲覧者向けの掲載の要約と掲載詳細と同じ形で返す。下書きと一時非公開の掲載の、公開前の見え方の確認に使う。店舗名と地域名は、紐づく店舗の情報から引く。価格とキャッチコピーを含まない。掲載は変わらない。

公開できるかどうかの判断に要る状態（公開状態、運営による非公開、店舗が非公開かどうか）を併せて返す。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 閲覧者向けの掲載の要約と掲載詳細の形（`ViewProjection.previewListing` の結果）と、公開状態、運営による非公開、店舗が非公開かどうか

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`
- 掲載の管理の可否
- `PlaceRepository.findById`（店舗名、店舗が非公開かどうか）
- `PlaceAffiliationsRepository.findById`、`RegionRepository.findByIds`（店舗の所属と、所属地域。読み取りが加わる段階は「管理する掲載の読み取りの組み立て」と同じ）
- Discovery の `ViewProjection.previewListing`（掲載の内容、店舗、所属、地域、今日の暦日を渡す。閲覧者に示す地域と、要約と詳細の形は、この投影だけが定める）
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使い、掲載、可否、店舗、所属、地域、台帳を読んで、書き込まずに返す。`ViewProjection.previewListing` と `PhotoStorage.displayRefs` は `run` の外で使う。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 掲載が削除されている | `NotFoundError` |

## suspendListing

### 概要

サービス運営者が、掲載を運営による非公開にする。店舗管理者の有無と公開状態を問わない。公開状態は書き換えない。`listing.suspended` を出す。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 運営による非公開にした後の掲載（`getManagedListing` と同じ形）

### 使用するドメインの振る舞い・ポート

- サービス運営の可否
- `ListingRepository.findById`、`save`
- `Listing.suspend`
- `collectEvents`（`listing.suspended`）
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `save`、`listing.suspended` の保存
- リポジトリ: `roleRosterRepository`、`listingRepository`
- ロールバック: 可否が成り立たない、掲載がない、すでに運営による非公開、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 掲載が削除されている | `NotFoundError` |
| 別のサービス運営者がすでに運営による非公開にしている | `BusinessRuleError`（`LISTING_ALREADY_SUSPENDED`） |
| 同時の保存 | `ConflictError` |

## unsuspendListing

### 概要

サービス運営者が、掲載の運営による非公開を解除する。公開状態は書き換えず、解除すると公開状態がそのまま現れる。運営による非公開の間に申立てで最後の写真が削除された掲載は、一時非公開（`photoTakedown`）として現れる。`listing.unsuspended` を出す。

### 入出力

- 入力: `Actor`、`ListingId`
- 出力: 解除した後の掲載（`getManagedListing` と同じ形）

### 使用するドメインの振る舞い・ポート

- サービス運営の可否
- `ListingRepository.findById`、`save`
- `Listing.unsuspend`
- `collectEvents`（`listing.unsuspended`）
- `Clock`
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 掲載の `save`、`listing.unsuspended` の保存
- リポジトリ: `roleRosterRepository`、`listingRepository`
- ロールバック: 可否が成り立たない、掲載がない、運営による非公開でない、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 運営による非公開の間に、掲載が削除されている | `NotFoundError` |
| 別のサービス運営者がすでに解除している | `BusinessRuleError`（`LISTING_NOT_SUSPENDED`） |
| 同時の保存 | `ConflictError` |

## searchListingsForOperation

### 概要

サービス運営者が、キーワードで、閲覧者に表示されない掲載（下書き、一時非公開、運営による非公開、非公開の店舗の掲載）を含めて掲載を探す。キーワードは掲載の名称と説明に当たり、一致と関連度は `ListingMatching.searchableText` に当てた共有カーネルの `KeywordRelevance` が定める（`ListingRepository.searchForOperation` の契約）。結果は関連度の高い順。掲載ごとに、紐づく店舗の名称と非公開かどうか、店舗管理者の有無、掲載の状態を添える。店舗管理者の有無は、不在の代行ができる掲載を見分けるのに使う。

### 入出力

- 入力: `Actor`、キーワード、`Pagination`
- 出力: 掲載の一覧（`searchForOperation` の並び）と条件に合う全件数。掲載ごとに、`ListingId`、掲載を見分ける情報（名称・代表写真・店舗名）、紐づく店舗の `PlaceId` と非公開かどうか、店舗に店舗管理者がいるかどうか、公開状態と一時非公開の理由、運営による非公開、提供状態を返す
- キーワードは `SearchKeyword.parse` で確かめる。結果が `null`（空、または空白だけ）なら、ポートを呼ばずに、空の結果を返す

### 使用するドメインの振る舞い・ポート

- サービス運営の可否
- `SearchKeyword.parse`
- `ListingRepository.searchForOperation`
- `PlaceRepository.findByIds`、`Place.isSuspended`（店舗名、店舗が非公開かどうか）
- `StewardshipRepository.findByTargets`、`Stewardship.isVacant`（店舗管理者の有無）
- 管理する掲載の読み取りの組み立て

### トランザクション境界

UnitOfWork を1つ使い、可否、`searchForOperation`、店舗、管理体制、台帳を読んで、書き込まずに返す。`PhotoStorage.displayRefs` は `run` の外で呼ぶ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |

## detectEndedOfferings

### 概要

日次のジョブ。入力はスケジュール。公開中の掲載のうち、確認記録がない、確認記録の後に掲載の版が変わった、または確認記録の「提供状態が次に変わる暦日」が来た掲載（`OfferingPhaseLedger.findPageDrifted`）を読み、掲載ごとに `OfferingWatch.detect` の記録で確認記録を置き換える。今日の段階が提供終了で、記録が提供終了でなかった掲載について、`listing.offering_ended`（期日によるものと管理する人によるものを区別しない。`observedOn` は今日の暦日）を出す。段階が変わらない掲載と、提供中に戻った掲載は、記録だけを更新する。掲載は書き込まず、掲載の版を進めない。

冪等。確認記録の更新とドメインイベントの保存を、掲載1件ごとに1つの UnitOfWork で確定する。記録を更新した掲載は、版が変わるか次に変わる暦日が来るまで `findPageDrifted` の結果から外れるので、同じ日に何度実行しても、1つの提供終了について出るドメインイベントは1つ。提供終了にして次の実行までに提供中へ戻した掲載は、ドメインイベントを出さない。

先頭のページを読み直して進める。1件の失敗は他の掲載の処理を妨げない。読んだページの全件が失敗したら打ち切り、残りは次の実行が続ける。

### 入出力

- 入力: なし（スケジュール）。今日の暦日は `LocalDate.fromInstant(now)`
- 出力: なし
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `OfferingPhaseLedger.findPageDrifted`（`page: 1` を読み直す）、`find`、`record`
- `ListingRepository.findById`
- `OfferingWatch.detect`（`OfferingStatus.of`、`OfferingStatus.nextChangeOn`）
- `collectEvents`（`listing.offering_ended`）
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

読み取りだけの `run` でページを読み、掲載1件ごとに書き込みの `run` を1つ使う（[../domains/index.md](../domains/index.md)「UnitOfWork ポート」）。

- ページの読み取り: `run` を1つ使い、`findPageDrifted` の `page: 1` を読む
- 掲載1件ごとの `run`: 掲載（`ListingRepository.findById`）と確認記録（`OfferingPhaseLedger.find`）を読み直す。掲載がない、または `published` でなければ、何も書き込まずに次へ進む。そうでなければ、読み直した掲載と記録の段階で `OfferingWatch.detect` を行い、`record` とドメインイベントの保存を確定する
- リポジトリ: `offeringPhaseLedger`、`listingRepository`
- ロールバック: その掲載の書き込みの失敗。記録もドメインイベントも残らず、次の実行が同じ掲載を取り出す
- 掲載を読み直した後に、別の UnitOfWork の `deleteListing` が先にコミットしても、この `run` はコミットし、記録と `listing.offering_ended` が確定する。`record` は掲載があることを確かめないので成功し、指す掲載のない記録は以後の `find`・`findPageDrifted` に現れない（[../domains/index.md](../domains/index.md)「リポジトリの共通の契約」の参照整合性）。このとき、削除された掲載の `listing.offering_ended` が出る（[../domains/listing.md](../domains/listing.md)「ドメインイベント」）
- 途中で失敗した場合に残る状態: 処理を終えた掲載の記録とドメインイベントは確定している。残りの掲載は記録が古いまま残り、次の実行が続ける

### エラーケース

要件が振る舞いを定めるエラーはない。

## provisionInitialCategories

### 概要

開設時に、空の台帳に初期値の4つのカテゴリー（「食べる」「買う」「体験」「見る」）を、この順の現役のカテゴリーとして入れる。画面からは呼ばず、開設の手順が、最初のサービス運営者の設定（Authority の `establishFirstOperator`）と併せて呼ぶ。台帳が空の間は、カテゴリーを選べず、掲載を公開できない。

冪等。台帳が空でなければ、何も書き込まずに成功として扱う。同時の実行は、台帳の楽観ロックで一方だけが成立する。

### 入出力

- 入力: なし
- 出力: なし
- `Actor` を取らない。カテゴリーの ID は `IdGenerator` で決める

### 使用するドメインの振る舞い・ポート

- `CategoryCatalogRepository.find`、`save`
- `CategoryName.create`、`CategoryCatalog.establish`（`INITIAL_CATEGORY_NAMES`）
- `Clock`、`IdGenerator`

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 台帳の `save`。ドメインイベントはない
- リポジトリ: `categoryCatalogRepository`
- ロールバック: 楽観ロックの競合（同時の開設）

### エラーケース

要件が振る舞いを定めるエラーはない。

## listCategories

### 概要

現役のカテゴリーを作成順で返す。掲載に設定するカテゴリーの選択肢、閲覧者の絞り込みの選択肢、カテゴリーの管理の一覧に使う。廃止済みのカテゴリーは返さない。カテゴリーは1階層。

### 入出力

- 入力: なし
- 出力: 現役のカテゴリーの並び（作成順）
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `CategoryCatalogRepository.find`
- `CategoryCatalog.actives`

### トランザクション境界

UnitOfWork を1つ使い、台帳を読んで、書き込まずに返す。

### エラーケース

要件が振る舞いを定めるエラーはない。

## addCategory

### 概要

サービス運営者が、カテゴリーを追加する。追加したカテゴリーは現役で、並びの最後に入り、掲載に設定するカテゴリーの選択肢と絞り込みの選択肢に加わる。廃止済みのカテゴリーと同じ名称は追加できる。ドメインイベントはない。

冪等な作成。呼び出し側がカテゴリーの ID を決める。同じ ID のカテゴリーが台帳にあれば、`CategoryCatalog.add` を呼ばずに判定する。そのカテゴリーが同じ名称の現役のカテゴリーなら、書き込みなしに成功として扱う。名称が違う、または廃止済みなら `ConflictError`。

### 入出力

- 入力: `Actor`、呼び出し側が決めた `CategoryId`、名称
- 出力: 追加した後の現役のカテゴリーの並び（`listCategories` と同じ形）

### 使用するドメインの振る舞い・ポート

- サービス運営の可否
- `CategoryCatalogRepository.find`、`save`
- `CategoryName.create`、`CategoryCatalog.add`
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 台帳の `save`
- リポジトリ: `roleRosterRepository`、`categoryCatalogRepository`
- ロールバック: 可否が成り立たない、名称の誤り・重複、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 名称が空 | `BusinessRuleError`（`LISTING_INVALID_CATEGORY_NAME`） |
| 現役のカテゴリーに同じ名称がある | `BusinessRuleError`（`LISTING_CATEGORY_NAME_TAKEN`） |
| 同じ ID で、名称の違うカテゴリー、または廃止済みのカテゴリーがある | `ConflictError` |
| 別のサービス運営者が同時に台帳を保存した | `ConflictError` |

## renameCategory

### 概要

サービス運営者が、現役のカテゴリーの名称を変更する。そのカテゴリーを設定している掲載は、付け替えなしに新しい名称で読み取られる。掲載の公開状態・提供状態は変わらない。同じ名称への変更は、何も書き込まない。ドメインイベントはない。

### 入出力

- 入力: `Actor`、`CategoryId`、新しい名称
- 出力: 変更した後の現役のカテゴリーの並び（`listCategories` と同じ形）

### 使用するドメインの振る舞い・ポート

- サービス運営の可否
- `CategoryCatalogRepository.find`、`save`
- `CategoryName.create`、`CategoryCatalog.rename`
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 台帳の `save`。掲載は書き込まない
- リポジトリ: `roleRosterRepository`、`categoryCatalogRepository`
- ロールバック: 可否が成り立たない、名称の誤り・重複、カテゴリーがない・廃止済み、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 名称が空 | `BusinessRuleError`（`LISTING_INVALID_CATEGORY_NAME`） |
| 他の現役のカテゴリーと同じ名称 | `BusinessRuleError`（`LISTING_CATEGORY_NAME_TAKEN`） |
| 別のサービス運営者がすでに廃止している | `BusinessRuleError`（`LISTING_CATEGORY_RETIRED`） |
| カテゴリーが台帳にない | `BusinessRuleError`（`LISTING_CATEGORY_NOT_FOUND`） |
| 別のサービス運営者が同時に台帳を保存した | `ConflictError` |

## retireCategory

### 概要

サービス運営者が、移行先を指定して現役のカテゴリーを廃止する。移行先は、廃止するカテゴリー以外の現役のカテゴリーで、そのカテゴリーの掲載と申請が1件もなくても必須。最後の1つの現役のカテゴリーは廃止できない。廃止は取り消せない。

確定するのは台帳の書き込み（廃止と移行先の記録）と `category.retired` の保存。廃止が確定した時点から、廃止したカテゴリーは選択肢から消え、その掲載と申請は `CategoryCatalog.resolve` によって移行先のカテゴリーのものとして読み取られる（[../domains/listing.md](../domains/listing.md)「カテゴリーの解決」）。掲載と申請に保存された `CategoryId` は書き換えず、掲載の版と更新日時は進まない。店舗管理者への通知は、`category.retired` の消費（Notification）で結果整合にする。

### 入出力

- 入力: `Actor`、廃止する `CategoryId`、移行先の `CategoryId`（必須）
- 出力: 廃止した後の現役のカテゴリーの並び（`listCategories` と同じ形）

### 使用するドメインの振る舞い・ポート

- サービス運営の可否
- `CategoryCatalogRepository.find`、`save`
- `CategoryCatalog.retire`
- `collectEvents`（`category.retired`）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 台帳の `save`、`category.retired` の保存。掲載と申請は書き込まない
- リポジトリ: `roleRosterRepository`、`categoryCatalogRepository`
- ロールバック: 可否が成り立たない、カテゴリーがない、移行先が妥当でない、最後の1つ、廃止済み、楽観ロックの競合。台帳は変わらず、ドメインイベントも残らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 廃止するカテゴリーが台帳にない | `BusinessRuleError`（`LISTING_CATEGORY_NOT_FOUND`） |
| 廃止するカテゴリーを、別のサービス運営者がすでに廃止している | `BusinessRuleError`（`LISTING_CATEGORY_RETIRED`） |
| 現役のカテゴリーが、廃止するカテゴリーの1つだけ（移行先にかかわらない） | `BusinessRuleError`（`LISTING_CATEGORY_LAST_ONE`） |
| 移行先が、廃止するカテゴリーと同じ、台帳にない、または別のサービス運営者がすでに廃止している | `BusinessRuleError`（`LISTING_CATEGORY_SUCCESSOR_INVALID`） |
| 別のサービス運営者が同時に台帳を保存した | `ConflictError` |

`BusinessRuleError` の判定の順は、この表の上から順（`CategoryCatalog.retire`）。
