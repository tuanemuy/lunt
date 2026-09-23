# Occasion

イベント（催し）の情報、公開状態、開催の状態、店舗の参加、開催地域の関連づけを管理する。共有カーネルの型（`OccasionId`・`PlaceId`・`ListingId`・`RegionId`・`LocalDate`・`DateRange`・`Address`・`GeoPoint`・`PhotoSet`・`Publication`・`Suspension`・`Tagline`・`PhotosReleasedEvent`）と、ドメインをまたぐ規約は [index.md](index.md) が定める。

- 閲覧者向けの読み取り（イベントの一覧・詳細、参加店舗、関連するイベント・地域）は Discovery が持つ。このドメインは、書き込みと管理側の読み取りを持つ
- 操作の可否は Authority の `AccessPolicy` が判断する。このドメインの振る舞いは、操作する人を受け取らない。イベントの側の操作（イベント運営者、不在ならサービス運営者）と、店舗の側の操作（店舗管理者）、地域の側の操作（地域運営者、不在ならサービス運営者）を、振る舞いで分ける
- 店舗の側の参加の操作（参加状況の確認、参加内容の変更、取りやめ）は、店舗として行う操作で、その店舗の店舗管理者だけが行う（index.md「操作の可否」）。店舗管理者のいない店舗の参加は、イベントの側が扱う（直接の追加、参加内容の変更、除外）
- サービス運営者は、イベント運営者の有無にかかわらず、イベントを ID で開いて状態とイベント運営者の有無を確かめられる
- 参加の申請の進み方と前提は Application が持つ。このドメインは、承認または直接の追加で成立する参加そのものを持つ
- イベントは削除されない。イベントは地域から独立し、参加と開催地域の関連づけは、店舗の所属、店舗と掲載の公開状態・提供状態を変えない（B-06、B-15、AC-73）

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Occasion | イベント | 店舗が参加する催し。開催期間と開催場所を持つ |
| OccasionContent | イベント情報 | 名称・開催期間・開催場所・写真・紹介・キャッチコピー |
| Period | 開催期間 | 開始日と終了日。両端を含む |
| Venue | 開催場所 | 所在地と位置（1点）。イベントのエリアは所在地から決まる |
| Publish requirements | 公開条件 | 公開するイベントに必須の項目。名称・開催期間・開催場所・写真 |
| HoldingStatus | 開催の状態 | 開催前・開催中・終了・中止。保存せず、開催期間・中止・今日の日付から求める |
| Postponement | 延期 | 開催期間の更新 |
| Cancellation | 中止 | 開催しないことにする操作で決まる状態。日付では決まらず、取り消せる |
| Participation | 参加 | 店舗とイベントの関係。イベントと店舗の組に1つ |
| ParticipationDetails | 参加内容 | 参加に添えた掲載と参加日。どちらも任意で複数 |
| Attached listing | 添えた掲載 | 店舗がイベントで提供する掲載 |
| Participation date | 参加日 | 店舗が参加する日。保存の時点で開催期間内 |
| Direct addition | 直接の追加 | イベントの側が、店舗管理者のいない店舗を承認なしに参加店舗にすること |
| Withdrawal | 取りやめ | 店舗の側が、承認なしに参加を解除すること |
| Exclusion | 除外 | イベントの側が、承認なしに参加を解除すること |
| RegionLink | 開催地域の関連づけ | イベントと地域の関係。イベントと地域の組に1つ |
| Unlink | 関連づけを外す | イベントの側が、関連づけ中の組をなくすこと。あらためて関連づけられる |
| Detach | 関連づけの解除 | 地域の側が、関連づけを解除すること。解除された組は、イベントの側から再び関連づけられない |
| Restore | 解除の取り消し | 地域の側が解除を取り消し、関連づけを回復すること |
| HoldingStatusRecord | 開催の状態の記録 | 日次のジョブが最後に確かめた開催の状態。集約の外に持つ |

## エンティティ

### Occasion（集約）

公開状態ごとにイベント情報の型が違う。`published` のイベントは、公開条件を満たすイベント情報だけを持つ。中止は、公開状態とも運営による非公開とも独立した状態。

```ts
type Cancellation =
  | { cancelled: false }
  | { cancelled: true; cancelledAt: Date };

type OccasionBase = Readonly<{
  id: OccasionId;
  suspension: Suspension;
  cancellation: Cancellation;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

type DraftOccasion = OccasionBase & Readonly<{
  publication: { status: "draft" };
  content: OccasionContent;
}>;
type PublishedOccasion = OccasionBase & Readonly<{
  publication: { status: "published"; firstPublishedAt: Date };
  content: PublishableOccasionContent;
}>;
type UnpublishedOccasion = OccasionBase & Readonly<{
  publication: { status: "unpublished"; firstPublishedAt: Date; reason: "byManager" | "photoTakedown" };
  content: OccasionContent;
}>;

type Occasion = DraftOccasion | PublishedOccasion | UnpublishedOccasion;
```

#### 振る舞い

| メソッド | シグネチャ | 処理 |
| --- | --- | --- |
| `register` | `(params: { id: OccasionId; content: OccasionContent }, now: Date) => WithEventDrafts<DraftOccasion, never>` | `draft`、運営による非公開でなく、中止でないイベントを作る。公開条件は確かめない |
| `updateContent` | `(occasion: Occasion, content: OccasionContent, now: Date) => WithEventDrafts<Occasion, OccasionPeriodChangedEvent \| PhotosReleasedEvent>` | イベント情報を置き換える。`published` のイベントでは、`content` が公開条件を欠くと `BusinessRuleError("OCCASION_PUBLISH_CONDITION_UNMET")`。開催期間が前と違えば `occasion.period_changed` を返す（延期）。前の写真のうち `content` にない `PhotoId` を `PhotosReleased` に載せる。公開状態・運営による非公開・中止は変えない。中止したイベントの開催期間を更新しても中止のまま。運営による非公開の間も行える。参加と参加日は変えない |
| `publish` | `(occasion: Occasion, now: Date) => WithEventDrafts<PublishedOccasion, never>` | 共有カーネルの `Publication.publish` に、イベントの公開状態と運営による非公開の組と、`missingRequirements(occasion.content)` を渡して遷移する。判定の順序は共有カーネルが定める。エラーコードは `OCCASION_SUSPENDED`、`PUBLICATION_INVALID_TRANSITION`、`OCCASION_PUBLISH_CONDITION_UNMET`。開催の状態を問わない |
| `unpublish` | `(occasion: Occasion, now: Date) => WithEventDrafts<UnpublishedOccasion, OccasionUnpublishedEvent>` | 共有カーネルの `Publication.unpublish` に、イベントの公開状態と運営による非公開の組と、`"byManager"` を渡して遷移し、`reason: "byManager"` の `occasion.unpublished` を返す。判定の順序は共有カーネルが定める。エラーコードは `OCCASION_SUSPENDED`、`PUBLICATION_INVALID_TRANSITION` |
| `cancel` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, OccasionCancelledEvent>` | 中止にする。開催期間と今日の日付、公開状態、運営による非公開を問わない。すでに中止なら `BusinessRuleError("OCCASION_ALREADY_CANCELLED")` |
| `revokeCancellation` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, never>` | 中止を取り消す。開催期間を過ぎていても取り消せる。中止でなければ `BusinessRuleError("OCCASION_NOT_CANCELLED")`。開催の状態は、開催期間と日付で決まる状態に戻る |
| `suspend` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, OccasionSuspendedEvent>` | 共有カーネルの `Suspension.suspend` で運営による非公開にし、`occasion.suspended` を返す。公開状態と中止は変えない。すでに運営による非公開なら `BusinessRuleError("OCCASION_ALREADY_SUSPENDED")` |
| `unsuspend` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, OccasionUnsuspendedEvent>` | 共有カーネルの `Suspension.unsuspend` で運営による非公開を解除し、`occasion.unsuspended` を返す。公開状態と中止は変えない。運営による非公開でなければ `BusinessRuleError("OCCASION_NOT_SUSPENDED")` |
| `takeDownPhotos` | `(occasion: Occasion, photoIds: readonly [PhotoId, ...PhotoId[]], now: Date) => WithEventDrafts<Occasion, OccasionPhotosTakenDownEvent \| OccasionUnpublishedEvent \| PhotosReleasedEvent>` | 申立てに基づいて写真を外す。申立てを受け取らない（申立てが未対応で、対象がこのイベントであることは、ユースケースが Moderation のポートから申立てを読んで確かめる）。共有カーネルの `PhotoSet.takeDown` で写真を外す。`photoIds` にイベントの写真でないものがあれば `BusinessRuleError("OCCASION_PHOTO_NOT_FOUND")` になり、1枚も外さない。`published` のイベントの写真がなくなると、共有カーネルの `Publication.unpublish`（`"photoTakedown"`）で `unpublished` にし、`reason: "photoTakedown"` の `occasion.unpublished` を返す。運営による非公開の間も同じ。外した写真を `occasion.photos_taken_down`（`unpublished` は、この削除で `unpublished` になったかどうか）と `PhotosReleased` に載せる |
| `holdingStatus` | `(occasion: Occasion, today: LocalDate) => HoldingStatus \| null` | 開催の状態を返す。`HoldingStatus.of(occasion.content.period, occasion.cancellation, today)` |
| `missingRequirements` | `(content: OccasionContent) => readonly OccasionRequirement[]` | 公開条件のうち欠けている項目を返す。空なら公開条件を満たす |
| `reconstruct` | `(input: ReconstructInput) => Occasion` | 保存された値から復元する。不変条件を欠く値は `RehydrationError` |

状態を変えた振る舞いは、`version` を1つ進め、`updatedAt` を `now` にする。

#### 不変条件

- `published` のイベントのイベント情報は、名称・開催期間・開催場所（所在地と位置）があり、写真が1枚以上ある
- 開催期間は `start <= end`（`DateRange`）
- `firstPublishedAt` は最初の公開の日時で、以後変わらない
- 運営による非公開の間、`publish`・`unpublish` は成立しない。公開条件を欠いたことによる `unpublished` への遷移だけが起きる。中止と中止の取り消しは、運営による非公開の間も行える
- 開催の状態を保存しない。中止だけを保存する

#### ライフサイクル

- 生成: サービス運営者の登録で `draft` として作る。イベント運営者がいなくても作れ、公開できる
- 公開状態の遷移: `draft → published`、`published → unpublished`、`unpublished → published`。`published → unpublished` は、公開の取り下げ（`byManager`）と、最後の写真の削除（`photoTakedown`）で起きる。管理側の読み取りは、この `reason` で「写真の削除による公開の取り下げ」を示す
- 運営による非公開: どの公開状態にも重ねられる。解除すると、その時点の公開状態がそのまま現れる
- 中止: `cancelled: false → true`（`cancel`）、`true → false`（`revokeCancellation`）。何度でも行き来できる
- 開催の状態: 中止でないイベントは、日付の経過と開催期間の更新で 開催前・開催中・終了 の間を動く。終了したイベントの開催期間を未来へ更新すると、開催前または開催中に戻る
- 公開の取り下げ・運営による非公開・中止・開催期間の更新は、参加と開催地域の関連づけを変えない

### Participation（集約）

店舗のイベントへの参加。集約の ID はイベントと店舗の組（`ParticipationKey`）。参加中の間だけ存在し、解除で削除される。

```ts
type ParticipationKey = Readonly<{ occasionId: OccasionId; placeId: PlaceId }>;

type Participation = Readonly<{
  key: ParticipationKey;
  details: ParticipationDetails;
  participatedAt: Date;
  version: Version;
  updatedAt: Date;
}>;
```

#### 振る舞い

| メソッド | シグネチャ | 処理 |
| --- | --- | --- |
| `establish` | `(params: { key: ParticipationKey; details: ParticipationDetails }, now: Date) => WithEventDrafts<Participation, ParticipationEstablishedEvent>` | 参加の申請の承認で参加を成立させる。`details` は申請の内容（提出・再提出のときに `ParticipationDetails.create` で確かめた値）。`participatedAt` は `now` |
| `addDirectly` | `(existing: Participation \| null, params: { key: ParticipationKey; details: ParticipationDetails }, facts: { placeHasSteward: boolean; placeViewable: boolean }, now: Date) => WithEventDrafts<Participation, ParticipationEstablishedEvent>` | イベントの側が、店舗を参加店舗として追加する。`existing` があれば `BusinessRuleError("ALREADY_PARTICIPATING")`。店舗管理者のいる店舗は `BusinessRuleError("PLACE_HAS_STEWARD")`。閲覧できない店舗は `BusinessRuleError("PLACE_NOT_VIEWABLE")`。イベントの開催の状態を問わない。`facts.placeViewable` は、ユースケースが、`PlaceRepository.findById` で読んだ店舗に `VisibilityPolicy.isPlaceViewable` を当てて渡す |
| `changeByPlace` | `(p: Participation, details: ParticipationDetails, now: Date) => WithEventDrafts<Participation, ParticipationChangedEvent>` | 店舗の側が参加内容を置き換える。承認は要らない。`changedBy: "place"` |
| `changeByOccasion` | `(p: Participation, details: ParticipationDetails, facts: { placeHasSteward: boolean }, now: Date) => WithEventDrafts<Participation, ParticipationChangedEvent>` | イベントの側が参加内容を置き換える。店舗管理者のいる店舗は `BusinessRuleError("PLACE_HAS_STEWARD")`。参加が成立した経緯を問わない。`changedBy: "occasion"` |
| `withdraw` | `(p: Participation, now: Date) => readonly EventDraft<ParticipationDissolvedEvent>[]` | 店舗の側が参加を取りやめる。`cause: "withdrawn"`。ユースケースが集約を削除する |
| `exclude` | `(p: Participation, now: Date) => readonly EventDraft<ParticipationDissolvedEvent>[]` | イベントの側が店舗を除外する。理由を取らない。店舗管理者の有無と、参加が成立した経緯を問わない。`cause: "excluded"`。ユースケースが集約を削除する |
| `visibleDates` | `(p: Participation, period: DateRange \| null) => readonly LocalDate[]` | 閲覧者に示す参加日を返す。`ParticipationDetails.datesWithin(p.details, period)` |

- `changeByPlace` と `changeByOccasion` は、内容が前と同じなら、何も変えずドメインイベントも返さない
- 参加内容の変更・取りやめ・直接の追加・除外は、イベントの開催の状態、公開状態、運営による非公開を問わない。参加の申請だけが、開催前・開催中の閲覧できるイベントに限られ、その規則は Application の `Premise` と提出の確認が持つ
- どの振る舞いも、店舗と掲載の公開状態・提供状態に触れない

#### 不変条件

- イベントと店舗の組に、参加は1つ
- 添えた掲載の `ListingId` は重複しない。参加日は重複しない
- 参加日は、保存の時点の開催期間内にある。後の開催期間の更新で期間外になった参加日は、参加に残り、閲覧者に示さない
- 添えた掲載は、添えた時点で、その店舗の添えられる掲載（`Listing.attachableIds`）。後に提供終了・非公開・削除になった掲載は、参加に残る。表示は Discovery の `VisibilityPolicy` による

#### ライフサイクル

- 生成: 参加の申請の承認（`establish`）、またはイベントの側による店舗管理者のいない店舗の直接の追加（`addDirectly`）
- 変更: 店舗管理者のいる店舗は店舗の側（`changeByPlace`）、いない店舗はイベントの側（`changeByOccasion`）。店舗に店舗管理者が就いても、不在になっても、参加は保たれる
- 解除: 取りやめ（`withdraw`）または除外（`exclude`）で削除する。解除は取り消せない。再び参加するときは、新しい参加として成立する
- 集約の ID は、呼び出し側が決めて送る値ではなく、イベントと店舗の組。index.md の冪等な作成（呼び出し側が ID を決めて送る集約の規約）の対象ではない。成立した後に同じ組の追加を送り直すと、内容が同じでも `BusinessRuleError("ALREADY_PARTICIPATING")` になる

### RegionLink（集約）

イベントと地域の開催地域の関連づけ。集約の ID はイベントと地域の組（`RegionLinkKey`）。

```ts
type RegionLinkKey = Readonly<{ occasionId: OccasionId; regionId: RegionId }>;

type RegionLinkBase = Readonly<{
  key: RegionLinkKey;
  linkedAt: Date;
  version: Version;
  updatedAt: Date;
}>;

type ActiveRegionLink = RegionLinkBase & Readonly<{ status: "linked" }>;
type DetachedRegionLink = RegionLinkBase & Readonly<{ status: "detached"; detachedAt: Date }>;

type RegionLink = ActiveRegionLink | DetachedRegionLink;
```

#### 振る舞い

| メソッド | シグネチャ | 処理 |
| --- | --- | --- |
| `link` | `(existing: RegionLink \| null, key: RegionLinkKey, facts: { regionViewable: boolean }, now: Date) => WithEventDrafts<ActiveRegionLink, RegionLinkedEvent>` | イベントの側が地域を関連づける。地域運営者の承認は要らない。`existing` が `linked` なら `BusinessRuleError("REGION_ALREADY_LINKED")`、`detached` なら `BusinessRuleError("REGION_LINK_DETACHED")`。閲覧できない地域は `BusinessRuleError("REGION_NOT_VIEWABLE")`。`facts.regionViewable` は、ユースケースが、`RegionRepository.findById` で読んだ地域に `VisibilityPolicy.isRegionViewable` を当てて渡す |
| `unlink` | `(link: RegionLink) => RegionLinkKey` | イベントの側が関連づけを外す。`detached` の組は `BusinessRuleError("REGION_LINK_DETACHED")`。削除する組の ID を返し、ユースケースが集約を削除する |
| `detach` | `(link: RegionLink, now: Date) => WithEventDrafts<DetachedRegionLink, RegionLinkDetachedEvent>` | 地域の側が関連づけを解除する。すでに `detached` なら `BusinessRuleError("REGION_LINK_ALREADY_DETACHED")` |
| `restore` | `(link: RegionLink, now: Date) => WithEventDrafts<ActiveRegionLink, never>` | 地域の側が解除を取り消す。`linked` なら `BusinessRuleError("REGION_LINK_NOT_DETACHED")`。`linkedAt` は変えない |

どの振る舞いも、店舗の所属、参加、店舗と掲載の公開状態・提供状態に触れない。

#### 不変条件

- イベントと地域の組に、関連づけは1つ
- `detached` の組は、イベントの側から関連づけることも外すこともできない。`linked` に戻せるのは地域の側だけ

#### ライフサイクル

- 生成: イベントの側の `link`。関連づけた時点で `linked`
- `linked → detached`（地域の側の `detach`）、`detached → linked`（地域の側の `restore`）。何度でも行き来できる
- 削除: イベントの側の `unlink`（`linked` の組だけ）。外した組は、あらためて `link` できる
- 集約の ID は、呼び出し側が決めて送る値ではなく、イベントと地域の組。`Participation` と同じく、index.md の冪等な作成の対象ではない。関連づけた後に同じ組の関連づけを送り直すと `BusinessRuleError("REGION_ALREADY_LINKED")` になる
- 地域・イベントの公開の取り下げと運営による非公開は、関連づけを変えない

## 値オブジェクト

### OccasionName / OccasionDescription

| 型 | バリデーション | 等価性 |
| --- | --- | --- |
| `OccasionName`（名称） | 前後の空白を除いて 1〜100 文字。改行を含まない | 文字列の一致 |
| `OccasionDescription`（紹介） | 前後の空白を除いて 1〜2000 文字 | 文字列の一致 |

未入力は `null` で表し、空の文字列の値オブジェクトは作らない。違反は `BusinessRuleError("INVALID_OCCASION_NAME")`・`("INVALID_OCCASION_DESCRIPTION")`。キャッチコピーは共有カーネルの `Tagline` を使う。

### Venue

```ts
type Venue = Readonly<{ address: Address | null; location: GeoPoint | null }>;
```

開催場所。公開条件の「開催場所」は、所在地と位置の両方があること。イベントのエリアは `address.areaCode`。等価性は両方の項目の一致。

### OccasionContent / PublishableOccasionContent

```ts
type OccasionContent = Readonly<{
  name: OccasionName | null;
  period: DateRange | null;
  venue: Venue;
  photos: PhotoSet<{ photoId: PhotoId }>;
  description: OccasionDescription | null;
  tagline: Tagline | null;
}>;

type PublishableOccasionContent = OccasionContent & Readonly<{
  name: OccasionName;
  period: DateRange;
  venue: { address: Address; location: GeoPoint };
  photos: readonly [{ photoId: PhotoId }, ...{ photoId: PhotoId }[]];
}>;

type OccasionRequirement = "name" | "period" | "venue" | "photos";
```

- `OccasionContent.create(input: { name: string | null; period: { start: LocalDate; end: LocalDate } | null; venue: Venue; photoIds: readonly PhotoId[]; description: string | null; tagline: string | null }) => OccasionContent`。各項目を値オブジェクトにする。終了日が開始日より前の開催期間は `DateRange` の違反（`BusinessRuleError("COMMON_INVALID_DATE_RANGE")`）で、下書きでも保存できない。`photoIds` の重複は `BusinessRuleError("DUPLICATE_PHOTO")`
- 開催場所の `address` は、ユースケースが Area の `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で作って渡す。解決できない `TownRef` は、ユースケースが `BusinessRuleError("AREA_TOWN_NOT_FOUND")` にする
- 等価性は、すべての項目の一致（写真は順序を含む）。冪等な作成の「同じ内容」の判定に使う

### HoldingStatus

```ts
type HoldingStatus = "upcoming" | "ongoing" | "ended" | "cancelled";
```

`HoldingStatus.of(period: DateRange | null, cancellation: Cancellation, today: LocalDate) => HoldingStatus | null`

1. 中止なら `cancelled`
2. 開催期間がなければ `null`（開催の状態が決まらない。公開中のイベントでは起きない）
3. `today < period.start` なら `upcoming`（開催前）
4. `today <= period.end` なら `ongoing`（開催中）
5. それ以外は `ended`（終了）

`today` は `LocalDate.fromInstant(now)`。Application の `Premise` の「イベントが開催前または開催中」と、Discovery の `VisibilityPolicy` の「終了・中止」は、この関数の結果を使う。

### ParticipationDetails

```ts
type ParticipationDetails = Readonly<{
  listingIds: readonly ListingId[]; // 添えた順。重複なし
  dates: readonly LocalDate[];      // 昇順。重複なし
}>;
```

`ParticipationDetails.create(input: { listingIds: readonly ListingId[]; dates: readonly LocalDate[] }, facts: { period: DateRange | null; attachableListingIds: ReadonlySet<ListingId> }, current: ParticipationDetails | null) => ParticipationDetails`

- `listingIds` も `dates` も空でよい。重複は取り除き、`dates` は昇順に並べる
- 参加日がすべて `facts.period` の中にあること。外の日付があれば、または開催期間がないのに参加日があれば `BusinessRuleError("PARTICIPATION_DATE_OUT_OF_PERIOD")`。`current` にある参加日にも同じ規則を当てる。開催期間の更新で期間外になった参加日を残したままの保存は成立しない
- 添える掲載がすべて、`facts.attachableListingIds` にあるか、`current.listingIds` にあること。どちらにもなければ `BusinessRuleError("LISTING_NOT_ATTACHABLE")`
- `facts.attachableListingIds` は、その店舗の添えられる掲載の ID。添えられる掲載の規則は Listing の `Listing.attachableIds(listings, placeId, today)` だけが持つ。ユースケースは、入力の `ListingId` を `ListingRepository.findByIds` で読み、この関数の結果を渡す
- `current` は、変更の前の参加内容。すでに添えた掲載は、提供終了になっても添えたままにできる。新しい参加と申請の内容では `null`
- `ParticipationDetails.datesWithin(details: ParticipationDetails, period: DateRange | null) => readonly LocalDate[]` は、開催期間内の参加日だけを返す。開催期間がなければ空
- 等価性は、`listingIds`（順序を含む）と `dates` の一致
- Application は、参加の申請の内容にこの値オブジェクトを使い、提出と再提出のときに `create`（`current` は `null`）で確かめる

## ドメインサービス

### HoldingStatusObserver

時間の経過で起きる出来事（イベントの終了）を、開催の状態の記録と今日の開催の状態の比較から取り出す。純粋な関数で、ポートに依存しない。

```ts
type HoldingStatusRecord = Readonly<{
  occasionId: OccasionId;
  lastObserved: HoldingStatus | null;
  observedAt: Date;
}>;
```

`HoldingStatusObserver.observe(record: HoldingStatusRecord | null, occasion: Occasion, today: LocalDate, now: Date) => { record: HoldingStatusRecord; eventDrafts: readonly EventDraft<OccasionEndedEvent>[] } | null`

- 今日の開催の状態（`Occasion.holdingStatus`）が `record.lastObserved` と同じなら `null`（書き込みもドメインイベントもない）
- 違えば（記録がない場合を含む）、今日の状態を持つ新しい記録を返す。今日の状態が `ended` なら、`occasion.ended` を返す
- 延期または中止で終了でなくなったイベントは、次のジョブで記録が `ended` でない状態に戻る。再び終了すると、`occasion.ended` がもう一度出る

## ドメインイベント

消費者のいる出来事だけをドメインイベントにする。イベントの登録・公開、中止の取り消し、関連づけを外す操作、解除の取り消しは、ドメインイベントを出さない。

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `occasion.period_changed` | `{ occasionId: OccasionId; previous: DateRange \| null; current: DateRange \| null }` | イベント情報の更新で開催期間が変わった | Notification（参加店舗の店舗管理者） |
| `occasion.unpublished` | `{ occasionId: OccasionId; reason: "byManager" \| "photoTakedown" }` | 公開の取り下げ。最後の写真の削除による `unpublished` への遷移 | Notification（このイベントを紹介する公開中の読みものの編集担当者） |
| `occasion.cancelled` | `{ occasionId: OccasionId }` | 中止にした | Application（参加の申請の前提の再評価）、Notification（参加店舗の店舗管理者、編集担当者） |
| `occasion.ended` | `{ occasionId: OccasionId; observedOn: LocalDate }` | 日次のジョブが、開催の状態が終了に変わったことを確かめた | Application（参加の申請の前提の再評価）、Notification（編集担当者） |
| `occasion.suspended` | `{ occasionId: OccasionId }` | 運営による非公開にした | Notification（イベント運営者、編集担当者） |
| `occasion.unsuspended` | `{ occasionId: OccasionId }` | 運営による非公開を解除した | Notification（イベント運営者） |
| `occasion.photos_taken_down` | `{ occasionId: OccasionId; photoIds: readonly PhotoId[]; unpublished: boolean }` | 申立てに基づいて写真を外した。`unpublished` は、この削除で公開していない状態になったかどうか | Notification（イベント運営者） |
| `occasion.participation_established` | `{ occasionId: OccasionId; placeId: PlaceId }` | 参加が成立した | Application（参加の申請の前提の再評価） |
| `occasion.participation_changed` | `{ occasionId: OccasionId; placeId: PlaceId; changedBy: "place" \| "occasion" }` | 参加内容を変更した | Notification（`place` をイベント運営者へ） |
| `occasion.participation_dissolved` | `{ occasionId: OccasionId; placeId: PlaceId; cause: "withdrawn" \| "excluded" }` | 参加が解除された | Notification（`withdrawn` をイベント運営者へ、`excluded` を店舗管理者へ） |
| `occasion.region_linked` | `{ occasionId: OccasionId; regionId: RegionId }` | 開催地域を関連づけた | Notification（地域運営者） |
| `occasion.region_link_detached` | `{ occasionId: OccasionId; regionId: RegionId }` | 地域の側が関連づけを解除した | Notification（イベント運営者） |
| `photos.released` | 共有カーネル | イベント情報の更新で写真を外した。申立てに基づいて写真を外した | Media |

- `aggregateId` は、イベントの出来事では `OccasionId`、参加と関連づけの出来事では組を表す文字列（`OccasionId` と相手の ID の連結）
- 運営者・店舗管理者が不在の対象への通知の宛先は Notification が決める
- 開催期間の更新で終了になったイベントの `occasion.ended` は、次の日次のジョブで出る。それまでの間も、参加の申請の提出と承認は、`Premise` が今日の開催の状態の事実で確かめるので成立しない
- 参加の申請の承認の通知は、Application のドメインイベントから作られる

## ポート

### OccasionRepository

イベントの集約を保存し、管理側の読み取りを提供する。`TransactionalRepository<Occasion, OccasionId>` から `delete` を除いて拡張する（イベントは削除されない）。

```ts
interface OccasionRepository extends Omit<TransactionalRepository<Occasion, OccasionId>, "delete"> {
  findByIds(ids: readonly OccasionId[]): Promise<readonly Occasion[]>;
  search(query: { keyword: string }, pagination: Pagination): Promise<PaginationResult<Occasion>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save` | index.md の「リポジトリの共通の契約」による。`save` は楽観ロックを使う。同時の中止と中止の取り消しは、後の要求が `ConflictError` になる |
| `findByIds` | 指定した ID のイベントを、公開状態・運営による非公開・開催の状態を問わず返す。ない ID は結果に含めない。順序は保証しない。`ids` の件数の扱いは index.md の「リポジトリの共通の契約」による。管理するイベントの一覧、管理する対象の名称の解決（Authority）、店舗の参加状況、地域に関連づけられたイベントの状態の表示に使う |
| `search` | 名称に `keyword` を含むイベントを、公開状態・運営による非公開・開催の状態を問わず返す。一致は、`keyword` と名称のそれぞれに共有カーネルの `TextNormalization.normalize` を当てた値どうしの部分一致で、保存先によらない。正規化した結果が空の `keyword` は、空の結果（`count` は 0）を返す。並び順は関連度の高い順（正規化した値の完全一致、前方一致、部分一致の順）。同順位は ID の昇順。名称のないイベントは当たらない。サービス運営者が非公開を含めて探す読み取りに使う |

- エラー: `ConflictError`（ID の重複、楽観ロックの競合）、`NotFoundError`（`save` の対象がない）、`BusinessRuleError("COMMON_INVALID_INPUT")`（`findByIds` の 100 件超）
- 一意性: ID の一意性だけをポートが担保する
- 並行性: イベント情報の更新、公開、公開の取り下げ、中止とその取り消し、運営による非公開とその解除、写真の削除は、すべて同じ版で競合を検出する。イベント情報の更新は、編集を始めたときの `Occasion.version` を要求に含め、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする。状態を変えるだけの操作は版を含めず、`save` の楽観ロックで守る
- 可視性: コミットした書き込みは、以後のすべての問い合わせに即座に反映される

### ParticipationRepository

参加の集約を保存し、イベントの側と店舗の側から参加を引く。`TransactionalRepository<Participation, ParticipationKey>` を拡張する。

```ts
interface ParticipationRepository extends TransactionalRepository<Participation, ParticipationKey> {
  findByOccasion(occasionId: OccasionId, pagination: Pagination): Promise<PaginationResult<Participation>>;
  findByPlace(placeId: PlaceId, pagination: Pagination): Promise<PaginationResult<Participation>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert` | 同じイベントと店舗の組の参加があれば `ConflictError`。「イベントと店舗の組に参加は1つ」は、集約の ID の一意性としてポートが担保する。同時の承認と直接の追加は、後の要求が `ConflictError` になる |
| `findById` | 組の参加を返す。参加中でなければ `null`。`Participation.addDirectly` の `existing` と、Application の `Premise` に渡す「参加の有無」の事実になる |
| `save` | 楽観ロックを使う。同時の参加内容の変更は、後の要求が `ConflictError` になる。参加内容の変更は、編集を始めたときの `Participation.version` を要求に含め、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする。状態のエラー（`PLACE_HAS_STEWARD`）は、版の比較より先に判定する |
| `delete` | 楽観ロックを使う。取りやめと除外が同時に起きると、後の要求は、削除済みの参加への `delete` として `NotFoundError` になる |
| `findByOccasion` | そのイベントに参加中の店舗の参加を返す。店舗の営業状況と非公開を問わない。並び順は参加の新しい順（`participatedAt` の降順）。同順位は `PlaceId` の昇順 |
| `findByPlace` | その店舗が参加中のイベントの参加を返す。イベントの公開状態・運営による非公開・開催の状態を問わない。並び順は参加の新しい順。同順位は `OccasionId` の昇順 |

- 参照整合性: イベント・店舗・添える掲載があることは、ユースケースが書き込みの前に確かめる。後から削除された掲載の `ListingId` は参加に残り、閲覧できない対象として扱う
- 可視性: コミットした成立・変更・解除は、以後の問い合わせに即座に反映される

### RegionLinkRepository

開催地域の関連づけの集約を保存し、イベントの側と地域の側から関連づけを引く。`TransactionalRepository<RegionLink, RegionLinkKey>` を拡張する。

```ts
interface RegionLinkRepository extends TransactionalRepository<RegionLink, RegionLinkKey> {
  findByOccasion(occasionId: OccasionId, pagination: Pagination): Promise<PaginationResult<RegionLink>>;
  findByRegion(
    regionId: RegionId,
    filter: { status?: "linked" | "detached" },
    pagination: Pagination,
  ): Promise<PaginationResult<RegionLink>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert` | 同じイベントと地域の組の関連づけがあれば、`linked` でも `detached` でも `ConflictError`。「イベントと地域の組に関連づけは1つ」は、集約の ID の一意性としてポートが担保する。`detached` の組が残る間、同じ組を新しく作れないことも、この一意性で守る |
| `findById` | 組の関連づけを、`linked` でも `detached` でも返す。なければ `null`。ユースケースは、結果を `RegionLink.link` の `existing` に渡す |
| `save`・`delete` | 楽観ロックを使う。イベントの側の `unlink` と地域の側の `detach` が同時に起きると、`unlink` の `delete` が先に確定すれば、`detach` の `save` は削除済みの関連づけへの `save` として `NotFoundError` になり、`detach` の `save` が先に確定すれば、`unlink` の `delete` は `ConflictError` になる |
| `findByOccasion` | そのイベントの関連づけを、`linked` と `detached` の両方返す。地域の公開状態と運営による非公開を問わない。並び順は関連づけた順（`linkedAt` の昇順）。同順位は `RegionId` の昇順 |
| `findByRegion` | その地域の関連づけを返す。`status` を指定すると、その状態だけを返す。イベントの公開状態・運営による非公開・開催の状態を問わない。並び順は関連づけの新しい順（`linkedAt` の降順）。同順位は `OccasionId` の昇順 |

- 参照整合性: イベントと地域があることは、ユースケースが書き込みの前に確かめる
- 可視性: コミットした書き込みは、以後の問い合わせに即座に反映される

### HoldingStatusLedger

開催の状態の記録を、`Occasion` の集約とは別に持つ。日次のジョブだけが書き込み、`Occasion` の版を進めない。

```ts
interface HoldingStatusLedger {
  findToObserve(
    today: LocalDate,
    pagination: Pagination,
  ): Promise<PaginationResult<{ occasion: Occasion; record: HoldingStatusRecord | null }>>;
  put(record: HoldingStatusRecord): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `findToObserve` | 今日の開催の状態（`HoldingStatus.of` の規則による）が、記録の `lastObserved` と違うイベントを、記録とともに返す。記録のないイベントを含む。公開状態と運営による非公開を問わない。並び順は `OccasionId` の昇順。ジョブが記録を更新したイベントは、以後の結果から外れる。ジョブは、結果が空になるまで、`page: 1` を読み直して確かめることを繰り返し、読んだページの全件が失敗したら打ち切る（次の実行でやり直す） |
| `put` | そのイベントの記録を置き換える。なければ作る。楽観ロックを使わない。UnitOfWork の中で呼び、同じスコープのドメインイベントの保存と一緒に確定する。`occasionId` の指すイベントがあることは確かめない。ジョブは `findToObserve` が返したイベントの記録だけを書き込む（イベントは削除されない） |

- 同じイベントを2つのジョブが同時に確かめると、`occasion.ended` が重ねて出ることがある。消費者は冪等に作る
- エラー: 契約が定めるエラーはない。ジョブは1件ごとの失敗を許し、次の実行でもう一度確かめる

## トランザクション境界

- イベントの登録・更新・公開・公開の取り下げ・中止・中止の取り消し・運営による非公開・解除・写真の削除は、`Occasion` の書き込みとドメインイベントの保存が1つの UnitOfWork で確定する。写真を載せた保存では、Media の写真の持ち主の設定も同じ UnitOfWork で確定する。申立てに基づく写真の削除は、Moderation の申立てを対応済みにする操作とは別の UnitOfWork で確定する
- 参加の申請の承認は、Application の申請の承認と、`Participation` の `establish` の書き込み（`insert`）、両方のドメインイベントの保存が1つの UnitOfWork で確定する。承認のユースケースは Application に属し、前提（開催の状態、参加の有無）を事実で確かめてから書き込む
- 直接の追加・参加内容の変更・取りやめ・除外は、`Participation` の1つの集約の書き込みとドメインイベントの保存が1つの UnitOfWork で確定する。ユースケースは、店舗管理者の有無、店舗が閲覧できるか、添えられる掲載、開催期間の事実をすべて読んでから書き込む
- 関連づけ・関連づけを外す・解除・解除の取り消しは、`RegionLink` の1つの集約の書き込みとドメインイベントの保存が1つの UnitOfWork で確定する
- 日次のジョブは、イベント1件ごとに、`HoldingStatusLedger.put` と `occasion.ended` の保存を1つの UnitOfWork で確定する
- `Occasion`・`Participation`・`RegionLink` のうち2つ以上を同じ UnitOfWork で書き込む操作はない。事実を読んでから書き込むまでの間に他の集約が変わること（開催期間の更新と参加日の保存の行き違い、店舗管理者の就任と直接の追加の行き違い）は防がない。期間外になった参加日は `visibleDates` が除き、成立した参加は店舗管理者が就いた後も保たれる
- 参加の申請の失効と通知は、ドメインイベントの消費で結果整合にする

`UnitOfWorkContext` に、`occasionRepository: OccasionRepository`、`participationRepository: ParticipationRepository`、`regionLinkRepository: RegionLinkRepository`、`holdingStatusLedger: HoldingStatusLedger` を加える。

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `registerOccasion` | サービス運営者が、イベント情報を入力して下書きのイベントを作る | EVT-12 |
| `updateOccasionContent` | イベント運営者（不在ならサービス運営者）が、イベント情報を置き換える。延期は開催期間の更新で行う | EVT-04、EVT-13、MOD-03 |
| `publishOccasion` | 公開条件を満たす下書き・公開を取り下げたイベントを公開する | EVT-06、EVT-12、EVT-13、MOD-03 |
| `unpublishOccasion` | 公開中のイベントの公開を取り下げる | EVT-06、EVT-13 |
| `cancelOccasion` | イベントの側が、開催の状態にかかわらずイベントを中止にする | EVT-11、EVT-13 |
| `revokeOccasionCancellation` | イベントの側が、中止を取り消す。開催の状態は開催期間と日付で決まる状態に戻る | EVT-11、EVT-13 |
| `suspendOccasion` | サービス運営者が、イベントを閲覧できなくする | MOD-07 |
| `unsuspendOccasion` | サービス運営者が、運営による非公開を解除する | MOD-07 |
| `takeDownOccasionPhotos` | サービス運営者が、未対応の申立ての対象のイベントから、選んだ写真を外す。写真がなくなった公開中のイベントは公開の取り下げになる | MOD-02 |
| `changeParticipationByPlace` | 店舗管理者が、添えた掲載と参加日を承認なしに変更する | EVT-02 |
| `withdrawParticipation` | 店舗管理者が、承認なしに参加を解除する | EVT-03 |
| `addParticipationDirectly` | イベントの側が、店舗管理者のいない閲覧できる店舗を、掲載と参加日を添えて参加店舗にする | EVT-10、EVT-13 |
| `changeParticipationByOccasion` | イベントの側が、店舗管理者のいない参加店舗の参加内容を変更する | EVT-10、EVT-13 |
| `excludeParticipant` | イベントの側が、店舗の参加を解除する | EVT-09、EVT-13 |
| `linkRegion` | イベントの側が、閲覧できる地域を開催地域として関連づける | EVT-05、EVT-13 |
| `unlinkRegion` | イベントの側が、関連づけ中の地域を外す | EVT-05、EVT-13 |
| `detachRegionLink` | 地域の側が、関連づけを解除する | REG-11、REG-13 |
| `restoreRegionLink` | 地域の側が、解除を取り消して関連づけを回復する | REG-11、REG-13 |
| `getPlaceParticipations` | 店舗が参加中のイベントを、イベントの状態・開催の状態・参加内容・期間外の参加日とともに返す | EVT-01、EVT-02、EVT-03 |
| `getParticipationDetails` | 1つの店舗と1つのイベントの参加内容を、開催期間、期間外の参加日、店舗管理者の有無とともに返す | EVT-02、EVT-10 |
| `listAttachableListings` | 店舗の側とイベントの側に、その店舗の添えられる掲載を返す | EVT-01、EVT-02、EVT-10 |
| `listOccasionParticipants` | イベントに参加中の店舗を、参加内容と店舗管理者の有無とともに、参加の新しい順に返す | EVT-07、EVT-13 |
| `listOccasionRegionLinks` | イベントの関連づけ中の地域と、地域の側が解除した地域を、地域の状態とともに返す | EVT-05、EVT-13 |
| `listRegionOccasionLinks` | 地域の関連づけ中のイベントと解除したイベントを、イベントの状態と開催の状態とともに返す | REG-11、REG-13 |
| `getManagedOccasion` | イベント運営者とサービス運営者に、ID で選んだイベントのイベント情報、公開状態、運営による非公開、開催の状態、不足する公開条件、イベント運営者の有無を返す。サービス運営者は、イベント運営者のいるイベントも開ける | EVT-04、EVT-06、EVT-11、EVT-13、MOD-07 |
| `searchOccasionsForOperation` | サービス運営者が、キーワードで、閲覧者に表示されないイベントを含めて探す | EVT-12、EVT-13、MOD-07 |
| `recordEndedOccasions` | 日次のジョブが、開催の状態の記録と今日の状態を比べ、終了に変わったイベントの `occasion.ended` を出す | EVT-01、EVT-04、EVT-08 |

参加の成立（EVT-08 の参加の申請の承認）は、Application の承認のユースケースが、`Participation.establish` を呼んで行う。
