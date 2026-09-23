# Place

訪問先となる店舗・スポットの情報、営業状況、サービス運営者による非公開、店名・住所による照合を管理する。

共有カーネルの `PlaceId`・`PhotoId`・`PhotoSet`・`RevisedPhotos`・`Address`・`GeoPoint`・`Suspension`・`TextNormalization`・`Version`・`PhotosReleasedEvent` を使い、Area に依存する（所在地は `Town.toAddress` で作った `Address`）。規約は [index.md](index.md) が定める。

Place が持たないもの: 店舗管理者の有無と操作の可否（Authority）、地域への所属と代表地域（Region）、掲載（Listing）、イベントへの参加（Occasion）、申請の進み方と前提（Application）、閲覧者に見せる範囲（Discovery の `VisibilityPolicy`）。

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Place | 店舗 | 店舗・スポット。掲載が紐づく訪問先 |
| PlaceKind | 種別 | 店舗かスポットか。スポットは店舗に属さない景色・見どころの場所で、店舗と同じ手続きで扱う（P-21） |
| PlaceProfile | 店舗情報 | 種別、名称、写真、紹介、所在地、位置、訪問情報のまとまり |
| VisitInfo | 訪問情報 | 訪問に必要な情報。営業時間と連絡先 |
| OperatingStatus | 営業状況 | 営業中・休業・閉店 |
| Registration | 登録 | 店舗が作られること。登録申請の承認か、サービス運営者の代理登録で起きる。登録された店舗は公開されている（P-40） |
| Suspension | 店舗の非公開 | サービス運営者による非公開。共有カーネルの `Suspension` |
| PlaceRevision | 情報修正 | 店舗情報と営業状況のうち、変更する項目だけのまとまり。情報修正の申請の内容 |
| PlaceMatching | 照合 | 店名・住所から既存の店舗を探すこと。既存店舗の確認、登録申請の照合、代理登録の前の確認、サービス運営者が店舗を探す操作に共通 |
| Relevance | 関連度 | 照合の語と店舗の名称・所在地の近さを表す数値 |

## エンティティ

### Place

集約ルート。

#### フィールド

| 名前 | 型 | 制約 |
| --- | --- | --- |
| `id` | `PlaceId` | 不変 |
| `profile` | `PlaceProfile` | 公開条件（名称・所在地・位置）を常に満たす。`PlaceProfile` の型が保証する |
| `operatingStatus` | `OperatingStatus` | 登録の時点は `"open"` |
| `suspension` | `Suspension` | 登録の時点は `{ suspended: false }` |
| `registeredAt` | `Date` | 登録の日時。不変。店舗の「新しい順」の基準 |
| `updatedAt` | `Date` | 最後に変わった日時 |
| `version` | `Version` | 登録の時点は `Version.initial()`。内容が変わる振る舞いのたびに進む |

店舗は `Publication` を持たない。公開されていない店舗は、非公開（`suspension.suspended === true`）の店舗だけ。

#### 振る舞い

すべて純粋な関数。状態を変える振る舞いは、次の状態の店舗とドメインイベントの下書きを `WithEventDrafts` で返す。

| メソッド | 引数 | 戻り値 | 処理内容 |
| --- | --- | --- | --- |
| `Place.register` | `params: { id: PlaceId; profile: PlaceProfile }`, `now: Date` | `WithEventDrafts<Place, never>` | 店舗を作る。`operatingStatus` は `"open"`、`suspension` は `{ suspended: false }`、`registeredAt` と `updatedAt` は `now`。登録申請の承認と代理登録のどちらも、この関数で作る。ドメインイベントを出さない |
| `Place.updateProfile` | `place: Place`, `profile: PlaceProfile`, `now: Date` | `WithEventDrafts<Place, PhotosReleasedEvent>` | 店舗情報を `profile` に置き換える。置き換えで外れた写真（`place.profile.photos` にあって `profile.photos` にない `PhotoId`）があれば `PhotosReleased` を返す。`PlaceProfile.equals` で変わらない内容なら、`place` をそのまま返し、版を進めない |
| `Place.changeOperatingStatus` | `place: Place`, `next: OperatingStatus`, `now: Date` | `WithEventDrafts<Place, PlaceOperatingStatusChangedEvent>` | 営業状況を `next` にする。営業中・休業・閉店のどれからどれへも変えられる。現在と同じ値なら、`place` をそのまま返し、ドメインイベントを出さない |
| `Place.applyRevision` | `place: Place`, `revision: PlaceRevision`, `now: Date` | `WithEventDrafts<Place, PlaceOperatingStatusChangedEvent \| PhotosReleasedEvent> & { adoptedPhotoIds: readonly PhotoId[] }` | 情報修正の項目だけを、店舗の現在の内容に反映する。ほかの項目は現在の内容のまま残る。反映後の内容は `PlaceRevision.preview` が定める。営業状況が変われば `place.operating_status_changed`、外れた写真があれば `PhotosReleased` を返す。`adoptedPhotoIds` は、情報修正が新たに添えて採用された写真 |
| `Place.suspend` | `place: Place`, `now: Date` | `WithEventDrafts<Place, PlaceSuspendedEvent>` | 店舗を非公開にする。`suspension` を、共有カーネルの `Suspension.suspend(place.suspension, now, "PLACE")` の結果にする。営業状況にかかわらず行える。すでに非公開なら、この関数が `BusinessRuleError`（`PLACE_ALREADY_SUSPENDED`）にする |
| `Place.unsuspend` | `place: Place`, `now: Date` | `WithEventDrafts<Place, PlaceUnsuspendedEvent>` | 非公開を解除する。`suspension` を、共有カーネルの `Suspension.unsuspend(place.suspension, "PLACE")` の結果にする。非公開でなければ、この関数が `BusinessRuleError`（`PLACE_NOT_SUSPENDED`）にする |
| `Place.takeDownPhotos` | `place: Place`, `photoIds: readonly [PhotoId, ...PhotoId[]]`, `now: Date` | `WithEventDrafts<Place, PlacePhotosTakenDownEvent \| PhotosReleasedEvent>` | 申立てに基づいて写真を外す（index.md の「申立てに基づく写真の削除」）。写真は、共有カーネルの `PhotoSet.takeDown(place.profile.photos, photoIds, "PLACE")` で外す。`photoIds` は重複のない1枚以上。残る写真の順序は変わらず、1枚目を外すと次の写真が代表写真になる。写真がなくなっても店舗の公開は続く（店舗は `Publication` を持たない）。`photoIds` に店舗の写真でないものがあれば、この関数が `BusinessRuleError`（`PLACE_PHOTO_NOT_FOUND`）にし、1枚も外さない。外した写真を `place.photos_taken_down` と `PhotosReleased` に載せる |
| `Place.isSuspended` | `place: Place` | `boolean` | 非公開かどうか |

`updateProfile`・`changeOperatingStatus`・`applyRevision`・`takeDownPhotos` は、非公開の間も行える（index.md の「運営による非公開」）。

`takeDownPhotos` は申立てを引数に取らない。申立てが未対応で、対象がその店舗であることは、ユースケースが Moderation の `TakedownClaimRepository.findById` で申立てを読み、`TakedownClaim.authorizePhotoRemoval` で確かめてから、この振る舞いを呼ぶ。Place は Moderation に依存しない。

#### 不変条件

- 名称・所在地・位置を常に持つ。公開条件を欠く内容は `PlaceProfile` を作れないので、店舗に入らない
- 写真は0枚でもよい。`PhotoId` の重複はない
- 店舗を削除する振る舞いを持たない。店舗管理者にもサービス運営者にも、店舗を削除する操作はない（M-47、SHP-12）
- 店舗を非公開にする振る舞いと解除する振る舞いは、サービス運営者の操作だけが呼ぶ。可否は Authority の `AccessPolicy` が定める
- 店舗どうしを統合する振る舞いを持たない。重複する店舗は一方を非公開にする（B-44）。非公開にした店舗の掲載・所属・参加・保存は、どの店舗にも移らない

#### ライフサイクル

- 生成: 登録申請の承認（Application のユースケース）か、代理登録。生成の時点で公開されている。管理者と掲載の有無は公開に関わらない
- 営業状況: `"open"`・`"temporarilyClosed"`・`"permanentlyClosed"` の間を、どの向きにも遷移する。閉店した店舗に公開の期限はない（P-45）。営業状況の変更は、掲載の公開状態・提供状態を変えない
- 非公開: `{ suspended: false } → { suspended: true }`（非公開にする）、`{ suspended: true } → { suspended: false }`（解除する）。営業状況と店舗情報は、非公開とその解除で変わらない
- 終わり: なし。店舗は削除されない

## 値オブジェクト

### PlaceKind / OperatingStatus

```ts
type PlaceKind = "shop" | "spot"; // 店舗 | スポット
type OperatingStatus = "open" | "temporarilyClosed" | "permanentlyClosed"; // 営業中 | 休業 | 閉店
```

`PlaceKind.create(input: string)`・`OperatingStatus.create(input: string)`: 列挙にない値は `BusinessRuleError`（`PLACE_INVALID_KIND`、`PLACE_INVALID_OPERATING_STATUS`）。等価性は値の一致。

### PlaceName / PlaceDescription / BusinessHours / ContactInfo

```ts
type PlaceName = string & { readonly [placeNameBrand]: true };
type PlaceDescription = string & { readonly [placeDescriptionBrand]: true };
type BusinessHours = string & { readonly [businessHoursBrand]: true };
type ContactInfo = string & { readonly [contactInfoBrand]: true };
```

- どれも文章で記す値。`create(input: string)` は前後の空白を取り除き、結果が空なら `BusinessRuleError`（`PLACE_NAME_REQUIRED`、`PLACE_EMPTY_TEXT`）
- 任意の項目（紹介、営業時間、連絡先）の未入力は `null` で表し、空の文字列を持たない
- 等価性: 値の一致

### VisitInfo

```ts
type VisitInfo = Readonly<{
  businessHours: BusinessHours | null;
  contact: ContactInfo | null;
}>;
```

等価性: 2つの値の一致。

### PlacePhoto

```ts
type PlacePhoto = Readonly<{ photoId: PhotoId }>;
```

店舗の写真は `PhotoSet<PlacePhoto>`。追加・並び替え・削除は共有カーネルの `PhotoSet` の関数を使う。

### PlaceProfile

```ts
type PlaceProfile = Readonly<{
  kind: PlaceKind;
  name: PlaceName;
  photos: PhotoSet<PlacePhoto>;
  description: PlaceDescription | null;
  address: Address;
  location: GeoPoint;
  visitInfo: VisitInfo;
}>;
```

- 店舗の公開条件（名称・所在地・位置）と種別を、必須のフィールドとして型で表す。写真・紹介・営業時間・連絡先は任意（M-34、B-33）
- `PlaceProfile.create(input: { kind: string; name: string; photoIds: readonly PhotoId[]; description: string | null; address: Address; location: { latitude: number; longitude: number }; businessHours: string | null; contact: string | null }): PlaceProfile`: 各値オブジェクトを作る。`photoIds` に重複があれば `BusinessRuleError`（`PLACE_DUPLICATE_PHOTO`）。任意の文章は、空白を取り除いて空なら `null` にする
- `address` は `Town.toAddress` が作った `Address` を受け取る。店舗のエリアは `address.areaCode` で、紐づく掲載のエリアもこの値から決まる（P-12）。エリアを別のフィールドに持たない
- 登録申請の内容にも使う（Application）
- 等価性: すべてのフィールドの一致。写真は順序を含めて比べる（`PlaceProfile.equals(a, b): boolean`）

### PlaceRevision

```ts
type PlaceChange =
  | Readonly<{ field: "kind"; value: PlaceKind }>
  | Readonly<{ field: "name"; value: PlaceName }>
  | Readonly<{ field: "photos"; value: RevisedPhotos<PlacePhoto> }>
  | Readonly<{ field: "description"; value: PlaceDescription | null }>
  | Readonly<{ field: "address"; value: Address }>
  | Readonly<{ field: "location"; value: GeoPoint }>
  | Readonly<{ field: "businessHours"; value: BusinessHours | null }>
  | Readonly<{ field: "contact"; value: ContactInfo | null }>
  | Readonly<{ field: "operatingStatus"; value: OperatingStatus }>;

type PlaceRevision = readonly [PlaceChange, ...PlaceChange[]];
```

掲載の修正（Listing の `ListingPatch`）と同じ構造を持つ。`field` で判別する変更の配列で、写真の項目は共有カーネルの `RevisedPhotos`（写真ごとに、提出の時点で対象にあった `"current"` か、修正が新たに添えた `"added"` かを持つ）。

- 変更する項目だけを持つ。1つ以上の項目を持ち、同じ `field` は1つまで。名称・所在地・位置を空にする修正は、型で表せない。営業状況の変更は、情報の修正と併せても、単独でも持てる
- `PlaceRevision.create(changes: readonly PlaceChange[]): PlaceRevision`: 項目が0件なら `BusinessRuleError`（`PLACE_REVISION_EMPTY`）。同じ `field` が重なる、または写真の `photoId` が重なるなら `BusinessRuleError`（`PLACE_REVISION_INVALID`）
- `PlaceRevision.between(current: Place, desired: { profile: PlaceProfile; operatingStatus: OperatingStatus }): PlaceRevision`: 店舗の現在の内容と、入力された内容を項目ごとに比べ、値が違う項目だけで作る。写真は、並びが違えば `RevisedPhotos.between(current.profile.photos, desired.profile.photos)` を項目の値にする。違う項目がなければ `BusinessRuleError`（`PLACE_REVISION_EMPTY`）。申請の提出と再提出は、この関数で内容を作る
- `PlaceRevision.preview(place: Place, revision: PlaceRevision): { profile: PlaceProfile; operatingStatus: OperatingStatus }`: 情報修正を店舗の現在の内容に重ねた結果を返す。項目にない値は店舗の現在の値。写真の項目は `RevisedPhotos.overlay(place.profile.photos, value)` の結果（提出の後に外された、または申立てで削除された写真は戻らない）。`Place.applyRevision` の反映後の内容と、再提出・再申請の入力の初めの内容は、この結果になる
- `PlaceRevision.compare(place: Place, revision: PlaceRevision): readonly PlaceChangeComparison[]`: 項目ごとに、店舗の現在の値と情報修正の値を並べて返す。順序は `PlaceChange` の定義の順。承認者の判断に使う。`PlaceChangeComparison` は `field` で判別する直和型で、`{ field; current; proposed }` の `current` と `proposed` は、その `field` の `value` の型（写真の `current` は `PhotoSet<PlacePhoto>`）
- `PlaceRevision.addedPhotoIds(revision: PlaceRevision): readonly PhotoId[]`: 写真の項目の `RevisedPhotos.addedPhotoIds`。写真の項目がなければ空。申請が持ち主になる写真はこれだけ
- 承認は、すべての項目を反映する。項目の一部だけを反映する操作はない（SHP-11）
- 等価性: `field` ごとの値の一致。項目の順序を問わない

### PlaceMatchCriteria

```ts
type MatchText = string & { readonly [matchTextBrand]: true };

type PlaceMatchCriteria = Readonly<{
  text: { name: MatchText; address: MatchText | null } | { name: null; address: MatchText };
  includeSuspended: boolean;
}>;
```

- `MatchText.create(input: string): MatchText`: `PlaceMatching.normalize` の結果が空なら `BusinessRuleError`（`PLACE_MATCH_TEXT_EMPTY`）。正規化した値を持つ
- `PlaceMatchCriteria.create(input: { name: string | null; address: string | null; includeSuspended: boolean })`: 店名と住所のどちらも空（空白だけを含む）なら `BusinessRuleError`（`PLACE_MATCH_TEXT_REQUIRED`）
- `includeSuspended`: 非公開の店舗を含めるか。既存店舗の確認は `false`、登録申請の照合・代理登録の前の確認・サービス運営者が対象を探す操作は `true`
- 1つのキーワードで探す操作は、同じ語を `name` と `address` の両方に入れる

## ドメインサービス

### PlaceMatching

責務: 店名・住所による照合の、一致と関連度を定める。純粋な関数で、ポートに依存しない。保存先にかかわらず、照合の結果はこの定義で決まる。

| メソッド | 処理内容 |
| --- | --- |
| `normalize(input: string): string` | 共有カーネルの `TextNormalization.normalize(input)` の結果を返す。正規化の定義（NFKC 正規化、ロケールに依存しない小文字化、空白の除去）は共有カーネルだけが持ち、照合はこの関数で正規化した値を比べる |
| `addressText(address: Address): string` | `prefecture`・`municipality`・`town`・`rest` をこの順につないだ文字列 |
| `fieldScore(value: string, text: MatchText): 0 \| 1 \| 2 \| 3` | `normalize(value)` と語を比べる。等しければ 3、値が語で始まれば 2、値が語を含むか語が値を含めば 1、どれでもなければ 0 |
| `relevance(place: Place, criteria: PlaceMatchCriteria): number` | 名称の `fieldScore`（`criteria.text.name` が `null` なら 0）と、`addressText(place.profile.address)` の `fieldScore`（`criteria.text.address` が `null` なら 0）の和 |
| `matches(place: Place, criteria: PlaceMatchCriteria): boolean` | `relevance` が 1 以上で、かつ `criteria.includeSuspended` が `true` か店舗が非公開でない |

- 店名と住所の両方を入れた照合は、どちらか一方が一致する店舗を結果に含め、両方が一致する店舗ほど関連度が高い
- 営業状況は一致に関わらない。休業・閉店の店舗も結果に含まれる（参照の場面）
- 店舗の重複は、ポートも集約も機械的に拒まない。重複の判断は、照合の結果を見たサービス運営者が行う（P-42、P-75）

## ドメインイベント

すべて `aggregateId` は `PlaceId`。`PlaceEvent` は、次の表の `place.` で始まる4つの型（`PlaceOperatingStatusChangedEvent`、`PlaceSuspendedEvent`、`PlaceUnsuspendedEvent`、`PlacePhotosTakenDownEvent`）の直和。

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `"place.operating_status_changed"` | `{ placeId: PlaceId; from: OperatingStatus; to: OperatingStatus }` | 営業状況が変わった（`changeOperatingStatus`、営業状況の項目を持つ `applyRevision`） | Notification（`to` が閉店のとき、その店舗とその掲載を紹介する公開中の読みものの編集担当者へ。P-96） |
| `"place.suspended"` | `{ placeId: PlaceId }` | 店舗が非公開になった | Notification（店舗管理者へ P-93、紹介する公開中の読みものの編集担当者へ P-96） |
| `"place.unsuspended"` | `{ placeId: PlaceId }` | 店舗の非公開が解除された | Notification（店舗管理者へ P-93） |
| `"place.photos_taken_down"` | `{ placeId: PlaceId; photoIds: readonly PhotoId[] }`。店舗は公開状態を持たないので、他のドメインの同じ出来事が持つ `unpublished` を持たない | 申立てに基づいて店舗の写真が削除された（`takeDownPhotos`） | Notification（店舗管理者へ P-93） |
| `"photos.released"`（共有カーネル） | `{ photoIds: readonly PhotoId[] }` | 店舗情報の更新・情報修正の反映で写真が外れた、申立てで写真が削除された | Media |

店舗管理者が不在の店舗では、店舗管理者宛ての通知の宛先を Notification がサービス運営者に決める。Place は宛先を持たない。

## ポート

### PlaceRepository

目的: 店舗の集約の保存と読み取り、店名・住所による照合。`UnitOfWorkContext` に `placeRepository` として入る。

```ts
interface PlaceRepository
  extends Omit<TransactionalRepository<Place, PlaceId>, "delete"> {
  findByIds(ids: readonly PlaceId[]): Promise<readonly Place[]>;
  match(
    criteria: PlaceMatchCriteria,
    pagination: Pagination,
  ): Promise<PaginationResult<PlaceMatch>>;
}

type PlaceMatch = Readonly<{ place: Place; relevance: number }>;
```

- `insert`・`findById`・`save` は index.md の「リポジトリの共通の契約」に従う。`delete` を持たない（店舗は削除されない）
- 一意性: ポートが担保するのは `PlaceId` の一意性だけ。名称・所在地の一意性は、ポートも呼び出し側も担保しない
- 参照整合性: 店舗は他の集約の ID を持たない。`address.areaCode` が `AreaCatalog` にあることは、`Address` を作る呼び出し側が担保する
- 並行性: `save` は楽観ロック。店舗情報の更新、営業状況の変更、情報修正の反映、非公開とその解除、写真の削除は、すべて同じ版で競合を検出する
- 編集の競合（index.md）: 店舗情報の更新と営業状況の変更は、読んだときの `Place.version` を要求に含め、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする（他の人が先に保存した内容を上書きしない）。非公開、非公開の解除、申立てに基づく写真の削除は版を含めない。すでにその状態であること、写真がすでにないことは `BusinessRuleError` で返し、同時の書き込みは `save` の楽観ロックで守る
- 可視性: コミットした書き込みは、以後の `findById`・`findByIds`・`match` に即座に反映される

| メソッド | 振る舞い | エラー |
| --- | --- | --- |
| `findByIds` | ID が一致する店舗を、非公開の店舗を含めて返す。`ids` は 0〜100件で、0件では空を返す。存在しない ID は結果に現れない。ID の昇順。100件を超える対象は、呼び出し側が分けて呼ぶ | `ids` が100件を超えると `BusinessRuleError`（`COMMON_INVALID_INPUT`） |
| `match` | `PlaceMatching.matches` が成り立つすべての店舗を対象に、`PlaceMatching.relevance` の降順、同順位は `PlaceId` の昇順で、`pagination`（`page`・`limit`）の範囲を返す。`count` は対象の全件数。範囲の外の `page` では `items` が空。`relevance` は `PlaceMatching.relevance` の値と一致する。絞り込み（非公開を含めるか）は `criteria.includeSuspended` だけで決まり、営業状況では絞り込まない | — |

保存先の障害を `SystemError` にするのはアダプターの責務で、適合テストの対象にしない。

`match` は次の場面に共通の1つの問い合わせ。

| 場面 | `includeSuspended` | 語 |
| --- | --- | --- |
| 既存店舗の確認（SHP-02） | `false` | 利用者が入力した店名・住所 |
| 登録申請の照合（SHP-09） | `true` | 申請の名称と所在地（`PlaceMatching.addressText`）。サービス運営者が入力した店名・住所でも探す |
| 代理登録の前の確認（SHP-12） | `true` | サービス運営者が入力した店名・住所 |
| サービス運営者が店舗を探す（SHP-13、MOD-08、MOD-09） | `true` | サービス運営者が入力した店名・住所。1つのキーワードで探すときは、同じ語を店名と住所の両方に入れる |
| 対象の選択の候補の店舗を探す（Discovery のユースケース） | `false` | キーワードを店名と住所の両方に入れる |

- Place のユースケースは、`includeSuspended` ごとに分かれる。`false` の照合は `matchPlaces`（`Actor` を取らない）、`true` の照合は `searchPlacesForOperation`（サービス運営者）。非公開の店舗を返すかどうかを、1つのユースケースの引数で切り替えない
- 写真のない店舗の写真の代用（P-43）の規則は、Discovery の `ViewProjection.substituteCover` だけが持つ。`matchPlaces` は、一致した店舗を Discovery の `ReferenceQueries.resolve` に渡し、返った `PlaceEntry.substituteCover` を添える。Place は代用の規則を持たない。`searchPlacesForOperation` は写真を代用しない
- 管理者の有無は `searchPlacesForOperation` だけが返す。ユースケースが Authority の `StewardshipRepository.findByTargets` から読んで添える

## トランザクション境界

1つの UnitOfWork で原子的に確定する範囲。

| 書き込み | 同じスコープで確定するもの |
| --- | --- |
| 代理登録 | 店舗の `insert`、店舗の写真の持ち主の設定（Media） |
| 店舗情報の更新 | 店舗の `save`、追加した写真の持ち主の設定（Media）、`PhotosReleased` の保存 |
| 営業状況の変更 | 店舗の `save`、`place.operating_status_changed` の保存 |
| 非公開、非公開の解除 | 店舗の `save`、`place.suspended`・`place.unsuspended` の保存 |
| 申立てに基づく写真の削除 | 店舗の `save`、`place.photos_taken_down` と `PhotosReleased` の保存 |
| 登録申請の承認（Application のユースケース） | 申請の `save`、店舗の `insert`、写真の持ち主の申請から店舗への付け替え（Media）、ドメインイベントの保存 |
| 情報修正の申請の承認（Application のユースケース） | 申請の `save`、店舗の `save`、`adoptedPhotoIds` の持ち主の申請から店舗への付け替え（Media）、ドメインイベントの保存 |

- ユースケースは、`AreaCatalog` による町域の解決、Authority の事実の読み取り、`AccessPolicy` の判断、`findById` を終えてから書き込む。`AreaCatalog.findTown` が `null` を返す `TownRef` での代理登録と店舗情報の更新は `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）になり、書き込まない
- 申立てに基づく写真の削除と、申立てを対応済みにする操作（Moderation）は、別の UnitOfWork で確定する
- 写真の実体の削除（`PhotosReleased` の消費）と通知は、ドメインイベントの消費で結果整合にする
- 店舗の非公開は、掲載・所属・参加・保存を書き換えない。それらが閲覧できなくなることは、Discovery の `VisibilityPolicy` が店舗の `Suspension` を読んで決める

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `matchPlaces` | 店名・住所で、非公開でない店舗を探し、関連度の高い順に返す。`Actor` を取らない。写真のない店舗には写真を代用する | SHP-02 |
| `searchPlacesForOperation` | サービス運営者が、店名・住所で、非公開の店舗を含めて店舗を探し、関連度の高い順に、非公開かどうかと管理者の有無とともに返す | SHP-09、SHP-12、SHP-13、MOD-08、MOD-09 |
| `listStewardedPlaces` | 操作する人が管理権限を持つ店舗（Authority から読んだ `PlaceId`）を、名称と状態とともに読む | SHP-05 |
| `getManagedPlace` | `PlaceId` で選んだ店舗の情報・営業状況・非公開かどうか・管理者の有無を読む。店舗管理者と、管理者のいない店舗を代行するサービス運営者が管理のために読む。サービス運営者は、管理者の有無にかかわらず、店舗を開いて状態と管理者の有無を確かめられる（index.md の「操作の可否」） | SHP-05、SHP-06、SHP-07、SHP-13、MOD-08、MOD-09 |
| `registerPlaceByProxy` | サービス運営者が、公開条件を満たす情報で店舗を登録する。冪等な作成（同じ `PlaceId` で、店舗情報が `PlaceProfile.equals` で等しければ成功として扱い、等しくなければ `ConflictError`） | SHP-12 |
| `updatePlaceProfile` | 店舗管理者、または管理者のいない店舗でサービス運営者が、店舗情報を申請なしで置き換える | SHP-06、SHP-13、MOD-06 |
| `changeOperatingStatus` | 店舗管理者、または管理者のいない店舗でサービス運営者が、営業中・休業・閉店のどれかに変える | SHP-07、SHP-13、MOD-06 |
| `suspendPlace` | サービス運営者が店舗を非公開にする。重複する店舗の整理でも使う | MOD-08、MOD-09 |
| `unsuspendPlace` | サービス運営者が非公開を解除する | MOD-08、MOD-09 |
| `takeDownPlacePhotos` | サービス運営者が、未対応の申立ての対象である店舗から、選んだ写真を外す。申立ての事実は Moderation のポートから読んで確かめる | MOD-02 |

登録申請の承認による店舗の登録（SHP-09）と、情報修正の申請の承認による反映（SHP-11）は Application のユースケースで、`Place.register`・`Place.applyRevision` を呼ぶ。登録申請と情報修正の申請の提出（SHP-03、SHP-08）も Application のユースケースで、内容を `PlaceProfile.create`・`PlaceRevision.between` で作る。
