# Region

地域の情報と公開状態、店舗の地域への所属と代表地域を管理する。共有カーネルの型（`RegionId`・`PlaceId`・`Address`・`GeoPoint`・`PhotoSet`・`Publication`・`Suspension`・`Tagline`・`PhotosReleasedEvent`・`PhotosTakenDownEvent`・`SearchKeyword`・`SearchableText`・`KeywordRelevance`）と、ドメインをまたぐ規約は [index.md](index.md) が定める。

- 閲覧者向けの読み取り（地域の一覧・詳細、店舗と掲載の所属地域）は Discovery が持つ。このドメインは、書き込みと管理側の読み取りを持つ
- 操作の可否は Authority の `AccessPolicy` が判断する。このドメインの振る舞いは、操作する人を受け取らない。操作の種類は、地域の管理（情報と状態、所属店舗の確認と除外）が `manage_target`、代表地域の選択と店舗の所属地域の状況の確認が `act_as_place`、地域を ID で開いて状態と地域運営者の有無を確かめる読み取りが `inspect_target`（index.md「操作の可否」）
- 所属の申請・離脱の申請の進み方と前提は Application が持つ。このドメインは、承認で成立・解除される所属そのものを持つ
- 開催地域の関連づけは、地域の運営者の操作（解除、解除の取り消し）を含めて Occasion が持つ
- 地域は削除されない。店舗の所属は、解除されるまで保たれる

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Region | 地域 | 店舗のまとまりとして紹介する対象。エリアから独立し、階層を持たず、位置を1点で持つ |
| RegionContent | 地域情報 | 名称・所在地・位置・写真・紹介・キャッチコピー |
| Region operator | 地域の運営者 | その地域の管理（`manage_target`）を行える人。地域運営者と、地域運営者が不在の地域で代行するサービス運営者 |
| Publish requirements | 公開条件 | 公開する地域に必須の項目。名称・所在地・位置・写真 |
| Affiliation | 所属 | 店舗と地域の関係。所属申請の承認で成立し、離脱の承認または除外で解除される |
| PlaceAffiliations | 店舗の所属 | 1つの店舗の所属の集合と、店舗管理者が選んだ代表地域 |
| Leave | 離脱 | 店舗についての離脱の申請の承認で、所属が解除されること。承認できる人は Application が定める |
| Exclusion | 除外 | 地域の運営者が、承認なしに所属を解除すること |
| Representative region | 代表地域 | 店舗の所属のうち、一覧に表示する1つの地域。店舗管理者が選んだ地域。選んでいなければ最初に所属した地域 |
| Chosen representative | 選んだ代表地域 | 店舗管理者が代表地域として選んだ所属 |
| Displayed region | 閲覧者に示す地域 | 代表地域が閲覧できる間は代表地域。閲覧できない間は、閲覧できる所属地域のうち最初に所属した地域 |
| First affiliated | 最初に所属した地域 | 所属が成立した日時が最も古い所属の地域 |

## エンティティ

### Region（集約）

公開状態ごとに地域情報の型が違う。`published` の地域は、公開条件を満たす地域情報だけを持つ。

```ts
type RegionBase = Readonly<{
  id: RegionId;
  suspension: Suspension;
  version: Version;
  updatedAt: Date;
}>;

type DraftRegion = RegionBase & Readonly<{
  publication: { status: "draft" };
  content: RegionContent;
}>;
type PublishedRegion = RegionBase & Readonly<{
  publication: { status: "published"; firstPublishedAt: Date };
  content: PublishableRegionContent;
}>;
type UnpublishedRegion = RegionBase & Readonly<{
  publication: { status: "unpublished"; firstPublishedAt: Date; reason: "byManager" | "photoTakedown" };
  content: RegionContent;
}>;

type Region = DraftRegion | PublishedRegion | UnpublishedRegion;
```

#### 振る舞い

| メソッド | シグネチャ | 処理 |
| --- | --- | --- |
| `register` | `(params: { id: RegionId; content: RegionContent }, now: Date) => WithEventDrafts<DraftRegion, never>` | `draft`、運営による非公開でない地域を作る。公開条件は確かめない |
| `updateContent` | `(region: Region, content: RegionContent, now: Date) => WithEventDrafts<Region, PhotosReleasedEvent>` | 地域情報を置き換える。`published` の地域では、`content` が公開条件を欠くと、`missingRequirements(content)` の項目を添えた `BusinessRuleError("REGION_PUBLISH_CONDITION_UNMET")`。前の写真のうち `content` にない `PhotoId` を `photos.released` に載せる。写真の並びは、共有カーネルの `PhotoSet.replace(region.content.photos, content.photos.items)` で置き換える（`PhotoId` の並びが変わらなければ `takenDown` を保つ）。公開状態と運営による非公開は変えない。運営による非公開の間も行える |
| `publish` | `(region: Region, now: Date) => WithEventDrafts<PublishedRegion, never>` | 共有カーネルの `Publication.publish` に、地域の公開状態と運営による非公開の組と、`missingRequirements(region.content)` を渡して遷移する。判定の順序は共有カーネルが定める。エラーコードは `REGION_SUSPENDED`、`COMMON_PUBLICATION_INVALID_TRANSITION`、`REGION_PUBLISH_CONDITION_UNMET` |
| `unpublish` | `(region: Region, now: Date) => WithEventDrafts<UnpublishedRegion, RegionUnpublishedEvent>` | 共有カーネルの `Publication.unpublish` に、地域の公開状態と運営による非公開の組と、`"byManager"` を渡して遷移し、`reason: "byManager"` の `region.unpublished` を返す。判定の順序は共有カーネルが定める。エラーコードは `REGION_SUSPENDED`、`COMMON_PUBLICATION_INVALID_TRANSITION` |
| `suspend` | `(region: Region, now: Date) => WithEventDrafts<Region, RegionSuspendedEvent>` | 共有カーネルの `Suspension.suspend` で運営による非公開にし、`region.suspended` を返す。公開状態は変えない。すでに運営による非公開なら `BusinessRuleError("REGION_ALREADY_SUSPENDED")` |
| `unsuspend` | `(region: Region, now: Date) => WithEventDrafts<Region, RegionUnsuspendedEvent>` | 共有カーネルの `Suspension.unsuspend` で運営による非公開を解除し、`region.unsuspended` を返す。公開状態は変えない。運営による非公開でなければ `BusinessRuleError("REGION_NOT_SUSPENDED")` |
| `takeDownPhotos` | `(region: Region, photoIds: readonly [PhotoId, ...PhotoId[]], now: Date) => WithEventDrafts<Region, PhotosTakenDownEvent \| RegionUnpublishedEvent \| PhotosReleasedEvent>` | 申立てに基づいて写真を外す（index.md「申立てに基づく写真の削除」）。申立てを受け取らない（削除できるかは、Moderation の `takeDownPhotosByClaim` が `TakedownClaim.authorizePhotoRemoval` で確かめる）。共有カーネルの `PhotoSet.takeDown` で写真を外し、`takenDown` を `true` にする。`photoIds` に地域の写真でないものがあれば `BusinessRuleError("REGION_PHOTO_NOT_FOUND")` になり、1枚も外さない。`published` の地域の写真がなくなると、共有カーネルの `Publication.unpublish`（`"photoTakedown"`）で `unpublished` にし、`reason: "photoTakedown"` の `region.unpublished` を返す。運営による非公開の間も同じ。外した写真を、共有カーネルの `content.photos_taken_down`（`owner` は `{ kind: "region"; id }`。`unpublished` は、この削除で `unpublished` になったかどうか）と `photos.released` に載せる |
| `missingRequirements` | `(content: RegionContent) => readonly RegionRequirement[]` | 公開条件のうち欠けている項目を、`RegionRequirement` の定義の順（`name`、`address`、`location`、`photos`）に返す。空なら公開条件を満たす |
| `searchableText` | `(region: Region) => SearchableText` | 1つのキーワードで地域を探す読み取り（`RegionRepository.searchForOperation`、Discovery のキーワード検索と対象の選択の候補）の対象の文字列の全体。`primary` は名称（名称のない地域は空の文字列）、`secondary` はキャッチコピー、紹介、所在地の文字列（共有カーネルの `Address.text`）。値のない項目は含めない。一致と関連度は、この値に共有カーネルの `KeywordRelevance` を当てて決める |
| `reconstruct` | `(stored: unknown) => Region` | 保存された値から復元する。不変条件を欠く値は `RehydrationError` |

`version` と `updatedAt` の進み方は、index.md「リポジトリの共通の契約」の規則による。置き換えた後の地域情報が前と等しい（`RegionContent` の等価性）`updateContent` は、状態を変えない振る舞いに当たる。

#### 不変条件

- `published` の地域の地域情報は、名称・所在地・位置があり、写真が1枚以上ある
- `firstPublishedAt` は最初の公開の日時で、以後変わらない
- 運営による非公開の間、`publish`・`unpublish` は成立しない。公開条件を欠いたことによる `unpublished` への遷移だけが起きる（index.md「運営による非公開」）
- 写真の `PhotoId` は重複しない

#### ライフサイクル

- 生成: サービス運営者の登録で `draft` として作る。地域運営者がいなくても作れ、公開できる
- 公開状態の遷移: `draft → published`、`published → unpublished`、`unpublished → published`。`published → unpublished` は、公開の取り下げ（`byManager`）と、最後の写真の削除（`photoTakedown`）で起きる。管理側の読み取りは、この `reason` で「写真の削除による公開の取り下げ」を示す
- 運営による非公開: どの公開状態にも重ねられる。解除すると、その時点の公開状態がそのまま現れる
- 公開の取り下げと運営による非公開は、所属と開催地域の関連づけを変えない。店舗と掲載の公開状態・提供状態も変えない

### PlaceAffiliations（集約）

1つの店舗の所属の集合。集約の ID は `PlaceId`。「同じ店舗と地域の所属は1つ」「代表地域は所属の中から」は、この集約の不変条件で守る。

```ts
type PlaceAffiliations = Readonly<{
  placeId: PlaceId;
  affiliations: readonly Affiliation[]; // 最初に所属した順
  chosenRepresentative: RegionId | null;
  version: Version;
  updatedAt: Date;
}>;
```

#### 振る舞い

| メソッド | シグネチャ | 処理 |
| --- | --- | --- |
| `empty` | `(placeId: PlaceId, now: Date) => PlaceAffiliations` | 所属のない集約を作る。店舗の最初の所属が成立するときに使う |
| `affiliate` | `(a: PlaceAffiliations, regionId: RegionId, now: Date) => WithEventDrafts<PlaceAffiliations, AffiliationEstablishedEvent>` | 所属を成立させる（所属申請の承認）。`affiliatedAt` は `now`。すでに所属中なら `BusinessRuleError("REGION_ALREADY_AFFILIATED")`。選んだ代表地域は変えない |
| `leave` | `(a: PlaceAffiliations, regionId: RegionId, now: Date) => WithEventDrafts<PlaceAffiliations, AffiliationDissolvedEvent>` | 所属を解除する（離脱申請の承認）。`cause: "left"` |
| `exclude` | `(a: PlaceAffiliations, regionId: RegionId, now: Date) => WithEventDrafts<PlaceAffiliations, AffiliationDissolvedEvent>` | 所属を解除する（除外）。理由を取らない。`cause: "excluded"` |
| `chooseRepresentative` | `(a: PlaceAffiliations, regionId: RegionId, now: Date) => WithEventDrafts<PlaceAffiliations, never>` | 所属中の地域を、選んだ代表地域にする。所属中でなければ `BusinessRuleError("REGION_NOT_AFFILIATED")`。すでに代表地域（`representative` の結果。選んでいない店舗では最初に所属した地域）なら `BusinessRuleError("REGION_REPRESENTATIVE_ALREADY_CHOSEN")` で、何も変えない。地域の公開状態と運営による非公開を問わない |
| `has` | `(a: PlaceAffiliations, regionId: RegionId) => boolean` | その地域に所属中かどうか。Application の `Premise` に渡す事実になる |
| `representative` | `(a: PlaceAffiliations) => RegionId \| null` | 代表地域を返す。選んだ代表地域があればそれ、なければ最初に所属した地域、所属がなければ `null` |
| `displayedRegion` | `(a: PlaceAffiliations, viewableRegionIds: ReadonlySet<RegionId>) => RegionId \| null` | 閲覧者に示す地域を返す。代表地域が `viewableRegionIds` にあればそれ、なければ `viewableRegionIds` にある所属のうち最初に所属した地域、なければ `null` |
| `reconstruct` | `(stored: unknown) => PlaceAffiliations` | 保存された値から復元する。不変条件を欠く値は `RehydrationError` |

- `version` と `updatedAt` の進み方は、index.md「リポジトリの共通の契約」の規則による。`affiliate`・`leave`・`exclude`・`chooseRepresentative` は、状態を変えるか、エラーになる
- `leave` と `exclude` は同じ解除の処理を使う。所属中でなければ `BusinessRuleError("REGION_NOT_AFFILIATED")`。解除した地域が選んだ代表地域なら、選んだ代表地域を `null` にする。残る所属と、他の地域への所属は変えない
- `viewableRegionIds` は、その店舗の所属地域のうち閲覧できる地域の ID。ユースケースまたは Discovery が、読んだ地域に `VisibilityPolicy.isRegionViewable` を当てて求めて渡す
- 最初に所属した順は、`affiliatedAt` の昇順。同じ日時は `RegionId` の昇順
- どの振る舞いも、店舗と掲載の公開状態・提供状態に触れない（B-06）

#### 不変条件

- `affiliations` の `regionId` は重複しない
- `chosenRepresentative` は `null` か、`affiliations` にある `regionId`
- `affiliations` は最初に所属した順に並ぶ

#### ライフサイクル

- 生成: 店舗の最初の所属が成立するときに、`empty` から `affiliate` して作る。記録のない店舗は、所属のない店舗として扱う
- 所属の成立: 所属申請の承認だけで起きる。承認のユースケースが `affiliate` を呼ぶ
- 所属の解除: 離脱申請の承認（`leave`）と除外（`exclude`）で起きる。解除した所属は記録に残らない。同じ地域への再度の所属は、新しい所属として成立し、`affiliatedAt` は新しい日時になる
- 代表地域: 所属が1つの店舗は、その地域が代表地域。選んだ代表地域との所属が解除されると、最初に所属した地域が代表地域になる。店舗管理者は選び直せる
- 集約は削除しない。すべての所属が解除された店舗は、空の集合を持つ

## 値オブジェクト

### RegionName / RegionDescription

| 型 | バリデーション | 等価性 |
| --- | --- | --- |
| `RegionName`（名称） | 前後の空白を除いて 1〜100 文字。改行を含まない | 文字列の一致 |
| `RegionDescription`（紹介） | 前後の空白を除いて 1〜2000 文字 | 文字列の一致 |

未入力は `null` で表し、空の文字列の値オブジェクトは作らない。違反は `BusinessRuleError("REGION_INVALID_NAME")`・`("REGION_INVALID_DESCRIPTION")`。キャッチコピーは共有カーネルの `Tagline`（`Tagline.create`。違反のコードは index.md「値の生成」）を使う。

### RegionContent / PublishableRegionContent

```ts
type RegionContent = Readonly<{
  name: RegionName | null;
  address: Address | null;
  location: GeoPoint | null; // 1点。範囲の図形を持たない
  photos: PhotoSet<{ photoId: PhotoId }>;
  description: RegionDescription | null;
  tagline: Tagline | null;
}>;

type PublishableRegionContent = RegionContent & Readonly<{
  name: RegionName;
  address: Address;
  location: GeoPoint;
  photos: PhotoSet<{ photoId: PhotoId }> & Readonly<{ items: readonly [{ photoId: PhotoId }, ...{ photoId: PhotoId }[]] }>;
}>;

type RegionRequirement = "name" | "address" | "location" | "photos";
```

- `RegionContent.create(input: { name: string | null; address: Address | null; location: GeoPoint | null; photoIds: readonly PhotoId[]; description: string | null; tagline: string | null }) => RegionContent`。各項目を値オブジェクトにする。写真の並びは `PhotoSet.of(…, "REGION")` で作る（`takenDown` は `false`。`photoIds` の重複は `REGION_DUPLICATE_PHOTO`）
- `address` は、ユースケースが Area の `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で作って渡す。解決できない `TownRef` は、ユースケースが `BusinessRuleError("AREA_TOWN_NOT_FOUND")` にする
- 等価性は、すべての項目の一致（写真は `items` の順序と `takenDown` を含む）。冪等な作成の「同じ内容」の判定に使う

### Affiliation

```ts
type Affiliation = Readonly<{ regionId: RegionId; affiliatedAt: Date }>;
```

`affiliatedAt` は所属が成立した日時。「最初に所属した地域」と、所属の新しい順の基準になる。等価性は `regionId` の一致。

## ドメインサービス

なし。代表地域と閲覧者に示す地域の決まり方は `PlaceAffiliations` の純粋な関数が持つ。

## ドメインイベント

消費者のいる出来事だけをドメインイベントにする。地域の登録・公開と、代表地域の選択は、ドメインイベントを出さない。地域情報の更新は、写真を外したときの `photos.released` だけを出す。

| 型名 | TS の型 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- | --- |
| `region.unpublished` | `RegionUnpublishedEvent` | `{ regionId: RegionId; reason: "byManager" \| "photoTakedown" }` | 公開の取り下げ。最後の写真の削除による `unpublished` への遷移 | Notification（[notification.md](notification.md) の対応の表） |
| `region.suspended` | `RegionSuspendedEvent` | `{ regionId: RegionId }` | 運営による非公開にした | Notification（[notification.md](notification.md) の対応の表） |
| `region.unsuspended` | `RegionUnsuspendedEvent` | `{ regionId: RegionId }` | 運営による非公開を解除した | Notification（[notification.md](notification.md) の対応の表） |
| `content.photos_taken_down` | `PhotosTakenDownEvent`（共有カーネル） | 共有カーネル（`owner` は `{ kind: "region"; id }`） | 申立てに基づいて写真を外した | Notification（[notification.md](notification.md) の対応の表） |
| `region.affiliation_established` | `AffiliationEstablishedEvent` | `{ placeId: PlaceId; regionId: RegionId }` | 所属が成立した | Application（`reassessApplicationPremises`。その店舗に関わる進行中の申請の前提を再評価する） |
| `region.affiliation_dissolved` | `AffiliationDissolvedEvent` | `{ placeId: PlaceId; regionId: RegionId; cause: "left" \| "excluded" }` | 所属が解除された | Application（`reassessApplicationPremises`。その店舗に関わる進行中の申請の前提を再評価する）、Notification（[notification.md](notification.md) の対応の表） |
| `photos.released` | `PhotosReleasedEvent`（共有カーネル） | 共有カーネル | 地域情報の更新で写真を外した。申立てに基づいて写真を外した | Media |

- このドメインが宣言する TS の型（共有カーネルの型を除く）は、どれも `DomainEventBase<型名, ペイロード>`（例: `type RegionUnpublishedEvent = DomainEventBase<"region.unpublished", { regionId: RegionId; reason: "byManager" | "photoTakedown" }>`）
- `aggregateId` は、地域の出来事では `RegionId`、所属の出来事では `PlaceId`
- 地域運営者・店舗管理者が不在の対象への通知の宛先は Notification が決める
- 所属申請・離脱申請の承認の通知は、Application のドメインイベントから作られる

## ポート

### RegionRepository

地域の集約を保存し、管理側の読み取りを提供する。`TransactionalRepository<Region, RegionId>` から `delete` を除いて拡張する（地域は削除されない）。

```ts
interface RegionRepository extends Omit<TransactionalRepository<Region, RegionId>, "delete"> {
  findByIds(ids: readonly RegionId[]): Promise<readonly Region[]>;
  searchForOperation(keyword: SearchKeyword, pagination: Pagination): Promise<PaginationResult<Region>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save` | index.md の「リポジトリの共通の契約」による。`save` は楽観ロックを使う |
| `findByIds` | 指定した ID の地域を、公開状態と運営による非公開を問わず返す。ない ID は結果に含めない。順序は保証しない。`ids` の件数の扱いは index.md の「リポジトリの共通の契約」による。店舗の所属地域の状況、イベントの開催地域の関連づけの状態、店舗と掲載の管理の読み取りの所属地域（Place、Listing）に使う |
| `searchForOperation` | 公開状態と運営による非公開を問わず、`KeywordRelevance.matches(Region.searchableText(region), keyword)` が成り立つ地域を返す。並び順は `KeywordRelevance.relevance` の降順、同順位は ID の昇順。一致と並びは保存先の文字列の比較の規則や全文検索の機能によらず、この定義で決まる。サービス運営者が非公開を含めて探す読み取りに使う |

- エラー: `ConflictError`（ID の重複、楽観ロックの競合）、`NotFoundError`（`save` の対象がない）、`BusinessRuleError("COMMON_INVALID_INPUT")`（`findByIds` の 100 件超）
- 並行性: 地域情報の更新、公開、公開の取り下げ、運営による非公開とその解除、写真の削除は、すべて同じ版で競合を検出する。地域情報の更新は、編集を始めたときの `Region.version` を要求に含め、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする。状態を変えるだけの操作（公開、公開の取り下げ、運営による非公開とその解除、写真の削除）は版を含めず、`save` の楽観ロックで守る
- 一意性: ID の一意性だけをポートが担保する。名称の一意性はない
- 可視性: コミットした書き込みは、以後のすべての問い合わせに即座に反映される

### PlaceAffiliationsRepository

店舗の所属の集約を保存し、地域ごとに所属店舗を引く。`TransactionalRepository<PlaceAffiliations, PlaceId>` から `delete` を除いて拡張する（集約は削除しない）。

```ts
interface PlaceAffiliationsRepository extends Omit<TransactionalRepository<PlaceAffiliations, PlaceId>, "delete"> {
  findAffiliatedPlaces(
    regionId: RegionId,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceId>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `findById` | 店舗の所属の集約を返す。所属が成立したことのない店舗は `null`。呼び出し側は `null` を所属のない店舗として扱う |
| `insert` | 同じ `PlaceId` の集約があれば `ConflictError`。同じ店舗の最初の所属が同時に2つ成立しようとすると、後の要求が `ConflictError` になる |
| `save` | 楽観ロックを使う。同じ店舗への同時の成立・解除・代表地域の選択は、後の要求が `ConflictError` になる |
| `findAffiliatedPlaces` | その地域に所属中の店舗を返す。店舗の営業状況と非公開を問わない。並び順は所属の新しい順（`affiliatedAt` の降順）。同順位は `PlaceId` の昇順 |

- 一意性: 「同じ店舗と地域の所属は1つ」は集約の不変条件で、楽観ロックで守る。ポートは `PlaceId` の一意性だけを担保する
- 整合性: `findAffiliatedPlaces` は、集約に保存された所属と常に一致する。コミットした成立・解除は、以後の問い合わせに即座に反映される
- 参照整合性: 店舗と地域があることは、ユースケースが書き込みの前に確かめる

## トランザクション境界

- 地域の登録・更新・公開・公開の取り下げ・運営による非公開・解除・写真の削除は、`Region` の書き込みとドメインイベントの保存が1つの UnitOfWork で確定する。写真を載せた保存では、Media の写真の持ち主の設定も同じ UnitOfWork で確定する。申立てに基づく写真の削除（Moderation の `takeDownPhotosByClaim`）は、申立てを対応済みにする操作とは別の UnitOfWork で確定する
- 所属申請の承認は、Application の申請の承認と、`PlaceAffiliations` の `affiliate` の書き込み、両方のドメインイベントの保存が1つの UnitOfWork で確定する。離脱申請の承認と `leave` も同じ。承認のユースケースは Application に属し、前提（所属の有無）を `PlaceAffiliations.has` の事実で確かめてから書き込む
- 除外と代表地域の選択は、`PlaceAffiliations` の書き込みとドメインイベントの保存が1つの UnitOfWork で確定する
- 所属の成立・解除に伴う他の申請の失効と、通知は、ドメインイベントの消費で結果整合にする
- `Region` と `PlaceAffiliations` を同じ UnitOfWork で書き込む操作はない

`UnitOfWorkContext` に、`regionRepository: RegionRepository` と `placeAffiliationsRepository: PlaceAffiliationsRepository` を加える。

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `registerRegion` | サービス運営者が、地域情報を入力して下書きの地域を作る | REG-12 |
| `updateRegionContent` | 地域の運営者が、地域情報を置き換える。公開中の地域は公開条件を確かめる | REG-06、REG-13、MOD-03 |
| `publishRegion` | 公開条件を満たす下書き・公開を取り下げた地域を公開する | REG-07、REG-12、REG-13、MOD-03 |
| `unpublishRegion` | 公開中の地域の公開を取り下げる | REG-07、REG-13 |
| `suspendRegion` | サービス運営者が、地域を閲覧できなくする | MOD-07 |
| `unsuspendRegion` | サービス運営者が、運営による非公開を解除する | MOD-07 |
| `chooseRepresentativeRegion` | 店舗管理者が、所属中の地域から代表地域を選ぶ | REG-04 |
| `excludeAffiliatedPlace` | 地域の運営者が、店舗の所属を解除する | REG-10、REG-13 |
| `getPlaceAffiliationStatus` | 店舗管理者に、店舗の所属中の地域とその状態、代表地域、閲覧者に示されている地域を返す | REG-01、REG-02、REG-04、REG-05 |
| `listAffiliatedPlaces` | 地域に所属中の店舗を、所属の新しい順に返す | REG-08、REG-13 |
| `getManagedRegion` | 地域運営者とサービス運営者に、ID で選んだ地域の地域情報、公開状態、運営による非公開、閲覧者が閲覧できるかどうか、不足する公開条件、申立てで写真が削除されたこと、地域運営者の有無を返す。サービス運営者は、地域運営者のいる地域も開ける | REG-06、REG-07、REG-08、REG-10、REG-11、REG-13、MOD-07 |
| `searchRegionsForOperation` | サービス運営者が、キーワードで、閲覧者に表示されない地域を含めて探す | REG-12、REG-13、MEM-01、MOD-07 |

所属の成立（REG-09 の所属申請の承認）と離脱による解除（REG-09 の離脱申請の承認）は、Application の承認のユースケースが、この集約の `affiliate`・`leave` を呼んで行う。申立てに基づく写真の削除（MOD-02）は、Moderation の `takeDownPhotosByClaim` が `Region.takeDownPhotos` を呼んで行う。
