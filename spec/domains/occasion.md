# Occasion

イベント（催し）の情報、公開状態、開催の状態、店舗の参加、開催地域の関連づけを管理する。共有カーネルの型（`OccasionId`・`PlaceId`・`ListingId`・`RegionId`・`LocalDate`・`DateRange`・`Address`・`GeoPoint`・`PhotoSet`・`Publication`・`Suspension`・`Tagline`・`PhotosReleasedEvent`・`PhotosTakenDownEvent`・`SearchKeyword`・`SearchableText`・`KeywordRelevance`）と、ドメインをまたぐ規約は [index.md](index.md) が定める。

- 閲覧者向けの読み取り（イベントの一覧・詳細、参加店舗、関連するイベント・地域）は Discovery が持つ。このドメインは、書き込みと管理側の読み取りを持つ
- 操作の可否は Authority の `AccessPolicy` が判断する。このドメインの振る舞いは、操作する人を受け取らない。イベントの運営者の操作（そのイベントの `manage_target`）、店舗管理者の操作（その店舗の `act_as_place`。参加状況の確認、参加内容の変更、取りやめ）、地域の運営者の操作（その地域の `manage_target`）を、振る舞いで分ける。イベントを ID で開いて状態とイベント運営者の有無を確かめる読み取りは `inspect_target`（index.md「操作の可否」）
- 管理者のいない店舗の参加は、イベントの運営者が扱う（直接の追加、参加内容の変更、除外）
- 参加の申請の進み方と前提は Application が持つ。このドメインは、承認または直接の追加で成立する参加そのものを持つ
- イベントは削除されない。イベントは地域から独立し、参加と開催地域の関連づけは、店舗の所属、店舗と掲載の公開状態・提供状態を変えない（B-06、B-15、AC-73）

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Occasion | イベント | 店舗が参加する催し。開催期間と開催場所を持つ |
| Occasion operator | イベントの運営者 | そのイベントの管理（`manage_target`）を行える人。イベント運営者と、イベント運営者が不在のイベントで代行するサービス運営者 |
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
| Participation date | 参加日 | 店舗が参加する日。添えた時点で開催期間内 |
| Direct addition | 直接の追加 | イベントの運営者が、管理者のいない店舗を承認なしに参加店舗にすること |
| Withdrawal | 取りやめ | 店舗管理者が、承認なしに参加を解除すること |
| Exclusion | 除外 | イベントの運営者が、承認なしに参加を解除すること |
| RegionLink | 開催地域の関連づけ | イベントと地域の関係。イベントと地域の組に1つ |
| Unlink | 関連づけを外す | イベントの運営者が、関連づけ中の組をなくすこと。あらためて関連づけられる |
| Detach | 関連づけの解除 | 地域の運営者が、関連づけを解除すること。解除された組は、イベントの運営者が再び関連づけることはできない |
| Restore | 解除の取り消し | 地域の運営者が解除を取り消し、関連づけを回復すること |
| HoldingStatusRecord | 開催の状態の記録 | 日次のジョブが最後に確かめた開催の状態と、そのときのイベントの版、開催の状態が次に変わる暦日。集約の外に持つ |

## エンティティ

### Occasion（集約）

公開状態ごとにイベント情報の型が違う。`published` のイベントは、公開条件を満たすイベント情報だけを持つ。中止は、公開状態とも運営による非公開とも独立した状態。

```ts
type Cancellation = Readonly<{ cancelled: boolean }>;

type OccasionBase = Readonly<{
  id: OccasionId;
  suspension: Suspension;
  cancellation: Cancellation;
  version: Version;
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
| `updateContent` | `(occasion: Occasion, content: OccasionContent, now: Date) => WithEventDrafts<Occasion, OccasionPeriodChangedEvent \| PhotosReleasedEvent>` | イベント情報を置き換える。`published` のイベントでは、`content` が公開条件を欠くと、`missingRequirements(content)` の項目を添えた `BusinessRuleError("OCCASION_PUBLISH_CONDITION_UNMET")`。開催期間が前と違えば `occasion.period_changed` を返す（延期）。前の写真のうち `content` にない `PhotoId` を `photos.released` に載せる。写真の並びは、共有カーネルの `PhotoSet.replace(occasion.content.photos, content.photos.items)` で置き換える（`PhotoId` の並びが変わらなければ `takenDown` を保つ）。公開状態・運営による非公開・中止は変えない。中止したイベントの開催期間を更新しても中止のまま。運営による非公開の間も行える。参加と参加日は変えない |
| `publish` | `(occasion: Occasion, now: Date) => WithEventDrafts<PublishedOccasion, never>` | 共有カーネルの `Publication.publish` に、イベントの公開状態と運営による非公開の組と、`missingRequirements(occasion.content)` を渡して遷移する。判定の順序は共有カーネルが定める。エラーコードは `OCCASION_SUSPENDED`、`COMMON_PUBLICATION_INVALID_TRANSITION`、`OCCASION_PUBLISH_CONDITION_UNMET`。開催の状態を問わない |
| `unpublish` | `(occasion: Occasion, now: Date) => WithEventDrafts<UnpublishedOccasion, OccasionUnpublishedEvent>` | 共有カーネルの `Publication.unpublish` に、イベントの公開状態と運営による非公開の組と、`"byManager"` を渡して遷移し、`reason: "byManager"` の `occasion.unpublished` を返す。判定の順序は共有カーネルが定める。エラーコードは `OCCASION_SUSPENDED`、`COMMON_PUBLICATION_INVALID_TRANSITION` |
| `cancel` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, OccasionCancelledEvent>` | 中止にする。開催期間と今日の日付、公開状態、運営による非公開を問わない。すでに中止なら `BusinessRuleError("OCCASION_ALREADY_CANCELLED")` |
| `revokeCancellation` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, never>` | 中止を取り消す。開催期間を過ぎていても取り消せる。中止でなければ `BusinessRuleError("OCCASION_NOT_CANCELLED")`。開催の状態は、開催期間と日付で決まる状態に戻る |
| `suspend` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, OccasionSuspendedEvent>` | 共有カーネルの `Suspension.suspend` で運営による非公開にし、`occasion.suspended` を返す。公開状態と中止は変えない。すでに運営による非公開なら `BusinessRuleError("OCCASION_ALREADY_SUSPENDED")` |
| `unsuspend` | `(occasion: Occasion, now: Date) => WithEventDrafts<Occasion, OccasionUnsuspendedEvent>` | 共有カーネルの `Suspension.unsuspend` で運営による非公開を解除し、`occasion.unsuspended` を返す。公開状態と中止は変えない。運営による非公開でなければ `BusinessRuleError("OCCASION_NOT_SUSPENDED")` |
| `takeDownPhotos` | `(occasion: Occasion, photoIds: readonly [PhotoId, ...PhotoId[]], now: Date) => WithEventDrafts<Occasion, PhotosTakenDownEvent \| OccasionUnpublishedEvent \| PhotosReleasedEvent>` | 申立てに基づいて写真を外す（index.md「申立てに基づく写真の削除」）。申立てを受け取らない（削除できるかは、Moderation の `takeDownPhotosByClaim` が `TakedownClaim.authorizePhotoRemoval` で確かめる）。共有カーネルの `PhotoSet.takeDown` で写真を外し、`takenDown` を `true` にする。`photoIds` にイベントの写真でないものがあれば `BusinessRuleError("OCCASION_PHOTO_NOT_FOUND")` になり、1枚も外さない。`published` のイベントの写真がなくなると、共有カーネルの `Publication.unpublish`（`"photoTakedown"`）で `unpublished` にし、`reason: "photoTakedown"` の `occasion.unpublished` を返す。運営による非公開の間も同じ。外した写真を、共有カーネルの `content.photos_taken_down`（`owner` は `{ kind: "occasion"; id }`。`unpublished` は、この削除で `unpublished` になったかどうか）と `photos.released` に載せる |
| `holdingStatus` | `(occasion: Occasion, today: LocalDate) => HoldingStatus \| null` | 開催の状態を返す。`HoldingStatus.of(occasion.content.period, occasion.cancellation, today)` |
| `missingRequirements` | `(content: OccasionContent) => readonly OccasionRequirement[]` | 公開条件のうち欠けている項目を、`OccasionRequirement` の定義の順（`name`、`period`、`venue`、`photos`）に返す。空なら公開条件を満たす |
| `searchableText` | `(occasion: Occasion) => SearchableText` | 1つのキーワードでイベントを探す読み取り（`OccasionRepository.searchForOperation`、Discovery のキーワード検索と対象の選択の候補）の対象の文字列の全体。`primary` は名称（名称のないイベントは空の文字列）、`secondary` はキャッチコピー、紹介、開催場所の所在地の文字列（共有カーネルの `Address.text`）。値のない項目は含めない。一致と関連度は、この値に共有カーネルの `KeywordRelevance` を当てて決める |
| `reconstruct` | `(stored: unknown) => Occasion` | 保存された値から復元する。不変条件を欠く値は `RehydrationError` |

`version` と `updatedAt` の進み方は、index.md「リポジトリの共通の契約」の規則による。置き換えた後のイベント情報が前と等しい（`OccasionContent` の等価性）`updateContent` は、状態を変えない振る舞いに当たる。`cancel`・`revokeCancellation` は、状態を変えるか、エラーになる。

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
| `establish` | `(params: { key: ParticipationKey; details: ParticipationDetails }, now: Date) => WithEventDrafts<Participation, ParticipationEstablishedEvent>` | 参加の申請の承認で参加を成立させる。`details` は申請の内容（提出・再提出のときに `ParticipationDetails.create` で確かめた値）。開催期間と添えられる掲載を確かめ直さない（参加日と添えた掲載の不変条件は、添えた時点で成り立つ）。`participatedAt` は `now` |
| `addDirectly` | `(existing: Participation \| null, params: { key: ParticipationKey; details: ParticipationDetails }, facts: { placeHasSteward: boolean; placeViewable: boolean }, now: Date) => WithEventDrafts<Participation, ParticipationEstablishedEvent>` | イベントの運営者が、店舗を参加店舗として追加する。`existing` があれば `BusinessRuleError("OCCASION_ALREADY_PARTICIPATING")`。店舗管理者のいる店舗は `BusinessRuleError("OCCASION_PLACE_HAS_STEWARD")`。閲覧できない店舗は `BusinessRuleError("OCCASION_PLACE_NOT_VIEWABLE")`（閲覧できない対象を添える要求。index.md「エラーの種類」）。イベントの開催の状態を問わない。`facts.placeViewable` は、ユースケースが、`PlaceRepository.findById` で読んだ店舗に `VisibilityPolicy.isPlaceViewable` を当てて渡す |
| `changeByPlace` | `(p: Participation, details: ParticipationDetails, now: Date) => WithEventDrafts<Participation, ParticipationChangedEvent>` | 店舗管理者が参加内容を置き換える。承認は要らない。`changedBy: "place"` |
| `changeByOccasion` | `(p: Participation, details: ParticipationDetails, facts: { placeHasSteward: boolean }, now: Date) => WithEventDrafts<Participation, ParticipationChangedEvent>` | イベントの運営者が参加内容を置き換える。店舗管理者のいる店舗は `BusinessRuleError("OCCASION_PLACE_HAS_STEWARD")`。参加が成立した経緯を問わない。`changedBy: "occasion"` |
| `withdraw` | `(p: Participation, now: Date) => readonly EventDraft<ParticipationDissolvedEvent>[]` | 店舗管理者が参加を取りやめる。`cause: "withdrawn"`。ユースケースが集約を削除する |
| `exclude` | `(p: Participation, now: Date) => readonly EventDraft<ParticipationDissolvedEvent>[]` | イベントの運営者が店舗を除外する。理由を取らない。店舗管理者の有無と、参加が成立した経緯を問わない。`cause: "excluded"`。ユースケースが集約を削除する |
| `visibleDates` | `(p: Participation, period: DateRange \| null) => readonly LocalDate[]` | 閲覧者に示す参加日を返す。`ParticipationDetails.datesWithin(p.details, period)` |
| `reconstruct` | `(stored: unknown) => Participation` | 保存された値から復元する。不変条件を欠く値は `RehydrationError` |

- `version` と `updatedAt` の進み方は、index.md「リポジトリの共通の契約」の規則による。`changeByPlace` と `changeByOccasion` は、参加内容が前と等しい（`ParticipationDetails` の等価性）なら状態を変えない振る舞いに当たり、ドメインイベントも返さない
- 参加内容の変更・取りやめ・直接の追加・除外は、イベントの開催の状態、公開状態、運営による非公開を問わない。参加の申請だけが、終了も中止もしていない閲覧できるイベントに限られ、その規則は Application の `Premise` と提出の確認が持つ
- どの振る舞いも、店舗と掲載の公開状態・提供状態に触れない

#### 不変条件

- イベントと店舗の組に、参加は1つ
- 添えた掲載の `ListingId` は重複しない。参加日は重複しない
- 参加日は、添えた時点（参加の申請の提出・再提出、直接の追加、参加内容の変更の保存の時点）の開催期間内にある。参加の申請の承認は確かめ直さない。後の開催期間の更新で期間外になった参加日は、参加に残り、閲覧者に示さない
- 添えた掲載は、添えた時点で、その店舗の添えられる掲載（`Listing.attachableIds`）。後に非公開・運営による非公開・削除になった掲載は、参加に残る。表示は Discovery の `VisibilityPolicy` による

#### ライフサイクル

- 生成: 参加の申請の承認（`establish`）、またはイベントの運営者による管理者のいない店舗の直接の追加（`addDirectly`）
- 変更: 店舗管理者のいる店舗は店舗管理者（`changeByPlace`）、管理者のいない店舗はイベントの運営者（`changeByOccasion`）。店舗に店舗管理者が就いても、不在になっても、参加は保たれる
- 解除: 取りやめ（`withdraw`）または除外（`exclude`）で削除する。解除は取り消せない。再び参加するときは、新しい参加として成立する
- 集約の ID は、呼び出し側が決めて送る値ではなく、イベントと店舗の組。index.md の冪等な作成（呼び出し側が ID を決めて送る集約の規約）の対象ではない。成立した後に同じ組の追加を送り直すと、内容が同じでも `BusinessRuleError("OCCASION_ALREADY_PARTICIPATING")` になる

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
type DetachedRegionLink = RegionLinkBase & Readonly<{ status: "detached" }>;

type RegionLink = ActiveRegionLink | DetachedRegionLink;
```

#### 振る舞い

| メソッド | シグネチャ | 処理 |
| --- | --- | --- |
| `link` | `(existing: RegionLink \| null, key: RegionLinkKey, facts: { regionViewable: boolean }, now: Date) => WithEventDrafts<ActiveRegionLink, RegionLinkedEvent>` | イベントの運営者が地域を関連づける。地域運営者の承認は要らない。`existing` が `linked` なら `BusinessRuleError("OCCASION_REGION_ALREADY_LINKED")`、`detached` なら `BusinessRuleError("OCCASION_REGION_LINK_DETACHED")`。閲覧できない地域は `BusinessRuleError("OCCASION_REGION_NOT_VIEWABLE")`（閲覧できない対象を関連づける要求。index.md「エラーの種類」）。`facts.regionViewable` は、ユースケースが、`RegionRepository.findById` で読んだ地域に `VisibilityPolicy.isRegionViewable` を当てて渡す |
| `unlink` | `(link: RegionLink) => RegionLinkKey` | イベントの運営者が関連づけを外す。`detached` の組は `BusinessRuleError("OCCASION_REGION_LINK_DETACHED")`。削除する組の ID を返し、ユースケースが集約を削除する |
| `detach` | `(link: RegionLink, now: Date) => WithEventDrafts<DetachedRegionLink, RegionLinkDetachedEvent>` | 地域の運営者が関連づけを解除する。すでに `detached` なら `BusinessRuleError("OCCASION_REGION_LINK_ALREADY_DETACHED")` |
| `restore` | `(link: RegionLink, now: Date) => WithEventDrafts<ActiveRegionLink, never>` | 地域の運営者が解除を取り消す。`linked` なら `BusinessRuleError("OCCASION_REGION_LINK_NOT_DETACHED")`。`linkedAt` は変えない |
| `reconstruct` | `(stored: unknown) => RegionLink` | 保存された値から復元する。不変条件を欠く値は `RehydrationError` |

- `version` と `updatedAt` の進み方は、index.md「リポジトリの共通の契約」の規則による。`detach`・`restore` は、状態を変えるか、エラーになる
- どの振る舞いも、店舗の所属、参加、店舗と掲載の公開状態・提供状態に触れない

#### 不変条件

- イベントと地域の組に、関連づけは1つ
- `detached` の組は、イベントの運営者が関連づけることも外すこともできない。`linked` に戻せるのは地域の運営者だけ

#### ライフサイクル

- 生成: イベントの運営者の `link`。関連づけた時点で `linked`
- `linked → detached`（地域の運営者の `detach`）、`detached → linked`（地域の運営者の `restore`）。何度でも行き来できる
- 削除: イベントの運営者の `unlink`（`linked` の組だけ）。外した組は、あらためて `link` できる
- 集約の ID は、呼び出し側が決めて送る値ではなく、イベントと地域の組。`Participation` と同じく、index.md の冪等な作成の対象ではない。関連づけた後に同じ組の関連づけを送り直すと `BusinessRuleError("OCCASION_REGION_ALREADY_LINKED")` になる
- 地域・イベントの公開の取り下げと運営による非公開は、関連づけを変えない

## 値オブジェクト

### OccasionName / OccasionDescription

| 型 | バリデーション | 等価性 |
| --- | --- | --- |
| `OccasionName`（名称） | 前後の空白を除いて 1〜100 文字。改行を含まない | 文字列の一致 |
| `OccasionDescription`（紹介） | 前後の空白を除いて 1〜2000 文字 | 文字列の一致 |

未入力は `null` で表し、空の文字列の値オブジェクトは作らない。違反は `BusinessRuleError("OCCASION_INVALID_NAME")`・`("OCCASION_INVALID_DESCRIPTION")`。キャッチコピーは共有カーネルの `Tagline`（`Tagline.create`。違反のコードは index.md「値の生成」）を使う。

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
  photos: PhotoSet<{ photoId: PhotoId }> & Readonly<{ items: readonly [{ photoId: PhotoId }, ...{ photoId: PhotoId }[]] }>;
}>;

type OccasionRequirement = "name" | "period" | "venue" | "photos";
```

- `OccasionContent.create(input: { name: string | null; period: { start: LocalDate; end: LocalDate } | null; venue: Venue; photoIds: readonly PhotoId[]; description: string | null; tagline: string | null }) => OccasionContent`。各項目を値オブジェクトにする。開催期間は `DateRange.create` で作る（終了日が開始日より前なら `COMMON_INVALID_DATE_RANGE`。index.md「値の生成」）。下書きでも、この違反のある開催期間は保存できない。写真の並びは `PhotoSet.of(…, "OCCASION")` で作る（`takenDown` は `false`。`photoIds` の重複は `OCCASION_DUPLICATE_PHOTO`）
- 開催場所の `address` は、ユースケースが Area の `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で作って渡す。解決できない `TownRef` は、ユースケースが `BusinessRuleError("AREA_TOWN_NOT_FOUND")` にする
- 等価性は、すべての項目の一致（写真は `items` の順序と `takenDown` を含む）。冪等な作成の「同じ内容」の判定に使う

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

`today` は `LocalDate.fromInstant(now)`。Application の `Premise` の「イベントが終了・中止でない」と、Discovery の `VisibilityPolicy` の「終了・中止」は、この関数の結果を使う。

`HoldingStatus.nextChangeOn(period: DateRange | null, cancellation: Cancellation, today: LocalDate) => LocalDate | null` は、開催期間と中止が変わらないときに、`HoldingStatus.of` の結果が次に変わる暦日を返す。`of` の結果が `upcoming` なら `period.start`、`ongoing` なら `period.end` の翌日、それ以外（`ended`・`cancelled`・`null`）は `null`（日付の経過では変わらない）。開催の状態の規則は、`of` とこの関数だけが持つ。

### ParticipationDetails

```ts
type ParticipationDetails = Readonly<{
  listingIds: readonly ListingId[]; // 添えた順。重複なし
  dates: readonly LocalDate[];      // 昇順。重複なし
}>;
```

`ParticipationDetails.create(input: { listingIds: readonly ListingId[]; dates: readonly LocalDate[] }, facts: { period: DateRange | null; attachableListingIds: ReadonlySet<ListingId> }, current: ParticipationDetails | null) => ParticipationDetails`

- `listingIds` も `dates` も空でよい。重複は取り除き、`dates` は昇順に並べる
- 参加日がすべて `facts.period` の中にあること。外の日付があれば、または開催期間がないのに参加日があれば `BusinessRuleError("OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD")`。`current` にある参加日にも同じ規則を当てる。開催期間の更新で期間外になった参加日を残したままの保存は成立しない
- 添える掲載がすべて、`facts.attachableListingIds` にあるか、`current.listingIds` にあること。どちらにもなければ `BusinessRuleError("OCCASION_LISTING_NOT_ATTACHABLE")`
- `facts.attachableListingIds` は、その店舗の添えられる掲載の ID。添えられる掲載の規則は Listing の `Listing.attachableIds(listings, placeId, today)` だけが持つ。ユースケースは、入力の `ListingId` を `ListingRepository.findByIds` で読み、この関数の結果を渡す
- `current` は、変更の前の参加内容（参加内容の変更では参加の内容、参加の申請の再提出では差し戻された申請の内容）。すでに添えた掲載は、添えられる掲載でなくなっても（非公開・運営による非公開になった、削除された）添えたままにできる。新しい参加と、参加の申請の提出では `null`
- `ParticipationDetails.datesWithin(details: ParticipationDetails, period: DateRange | null) => readonly LocalDate[]` は、開催期間内の参加日だけを返す。開催期間がなければ空
- 等価性は、`listingIds`（順序を含む）と `dates` の一致
- Application は、参加の申請の内容にこの値オブジェクトを使い、提出と再提出のときに `create` で確かめる（`current` は Application の「種類ごとの内容」が定める）

## ドメインサービス

### HoldingStatusObserver

時間の経過で起きる出来事（イベントの終了）を、開催の状態の記録と今日の開催の状態の比較から取り出す。純粋な関数で、ポートに依存しない。

```ts
type HoldingStatusRecord = Readonly<{
  occasionId: OccasionId;
  lastObserved: HoldingStatus | null; // 確かめた日の開催の状態
  observedVersion: Version;           // 確かめた時点の Occasion.version
  nextChangeOn: LocalDate | null;     // 確かめた日の HoldingStatus.nextChangeOn
}>;
```

`HoldingStatusObserver.observe(record: HoldingStatusRecord | null, occasion: Occasion, today: LocalDate, now: Date) => { record: HoldingStatusRecord; eventDrafts: readonly EventDraft<OccasionEndedEvent>[] }`

- 今日の開催の状態（`Occasion.holdingStatus`）、`occasion.version`、`HoldingStatus.nextChangeOn` を持つ新しい記録を返す
- 今日の状態が `ended` で、`record` がないか `record.lastObserved` が `ended` でなければ、`occasion.ended`（`observedOn` は `today`）を返す。それ以外はドメインイベントを返さない（版だけが変わった記録の置き換えを含む）
- 延期または中止で終了でなくなったイベントは、イベントの版が進むので、次のジョブで記録が `ended` でない状態に戻る。再び終了すると、`occasion.ended` がもう一度出る

イベントの版が記録の `observedVersion` と同じで、今日が記録の `nextChangeOn` より前（`null` なら日付によらない）の間、開催の状態は記録の `lastObserved` から変わらない。確かめ直すイベントは、この2つの比較だけで決まる（`HoldingStatusLedger.findToObserve`）。

## ドメインイベント

消費者のいる出来事だけをドメインイベントにする。イベントの登録・公開、中止の取り消し、関連づけを外す操作、解除の取り消しは、ドメインイベントを出さない。

| 型名 | TS の型 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- | --- |
| `occasion.period_changed` | `OccasionPeriodChangedEvent` | `{ occasionId: OccasionId }` | イベント情報の更新で開催期間が変わった | Application（`reassessApplicationPremises`。そのイベントに関わる進行中の申請の前提を再評価する）、Notification（[notification.md](notification.md) の対応の表） |
| `occasion.unpublished` | `OccasionUnpublishedEvent` | `{ occasionId: OccasionId; reason: "byManager" \| "photoTakedown" }` | 公開の取り下げ。最後の写真の削除による `unpublished` への遷移 | Notification（[notification.md](notification.md) の対応の表） |
| `occasion.cancelled` | `OccasionCancelledEvent` | `{ occasionId: OccasionId }` | 中止にした | Application（`reassessApplicationPremises`。そのイベントに関わる進行中の申請の前提を再評価する）、Notification（[notification.md](notification.md) の対応の表） |
| `occasion.ended` | `OccasionEndedEvent` | `{ occasionId: OccasionId; observedOn: LocalDate }` | 日次のジョブが、開催の状態が終了に変わったことを確かめた | Application（`reassessApplicationPremises`。そのイベントに関わる進行中の申請の前提を再評価する）、Notification（[notification.md](notification.md) の対応の表） |
| `occasion.suspended` | `OccasionSuspendedEvent` | `{ occasionId: OccasionId }` | 運営による非公開にした | Notification（[notification.md](notification.md) の対応の表） |
| `occasion.unsuspended` | `OccasionUnsuspendedEvent` | `{ occasionId: OccasionId }` | 運営による非公開を解除した | Notification（[notification.md](notification.md) の対応の表） |
| `content.photos_taken_down` | `PhotosTakenDownEvent`（共有カーネル） | 共有カーネル（`owner` は `{ kind: "occasion"; id }`） | 申立てに基づいて写真を外した | Notification（[notification.md](notification.md) の対応の表） |
| `occasion.participation_established` | `ParticipationEstablishedEvent` | `{ occasionId: OccasionId; placeId: PlaceId }` | 参加が成立した | Application（`reassessApplicationPremises`。その店舗に関わる進行中の申請の前提を再評価する） |
| `occasion.participation_changed` | `ParticipationChangedEvent` | `{ occasionId: OccasionId; placeId: PlaceId; changedBy: "place" \| "occasion" }` | 参加内容を変更した | Notification（[notification.md](notification.md) の対応の表） |
| `occasion.participation_dissolved` | `ParticipationDissolvedEvent` | `{ occasionId: OccasionId; placeId: PlaceId; cause: "withdrawn" \| "excluded" }` | 参加が解除された | Notification（[notification.md](notification.md) の対応の表） |
| `occasion.region_linked` | `RegionLinkedEvent` | `{ occasionId: OccasionId; regionId: RegionId }` | 開催地域を関連づけた | Notification（[notification.md](notification.md) の対応の表） |
| `occasion.region_link_detached` | `RegionLinkDetachedEvent` | `{ occasionId: OccasionId; regionId: RegionId }` | 地域の運営者が関連づけを解除した | Notification（[notification.md](notification.md) の対応の表） |
| `photos.released` | `PhotosReleasedEvent`（共有カーネル） | 共有カーネル | イベント情報の更新で写真を外した。申立てに基づいて写真を外した | Media |

- このドメインが宣言する TS の型（共有カーネルの型を除く）は、どれも `DomainEventBase<型名, ペイロード>`（例: `type OccasionCancelledEvent = DomainEventBase<"occasion.cancelled", { occasionId: OccasionId }>`）
- `aggregateId` は、イベントの出来事では `OccasionId`、参加と関連づけの出来事では組を表す文字列（`OccasionId` と相手の ID の連結）
- 運営者・店舗管理者が不在の対象への通知の宛先は Notification が決める
- 開催期間の更新で終了になったイベントの進行中の参加の申請は、`occasion.period_changed` の消費で失効する。`occasion.ended` は次の日次のジョブで出る。消費までの間も、参加の申請の提出と承認は、`Premise` が今日の開催の状態の事実で確かめるので成立しない
- 参加の申請の承認の通知は、Application のドメインイベントから作られる

## ポート

### OccasionRepository

イベントの集約を保存し、管理側の読み取りを提供する。`TransactionalRepository<Occasion, OccasionId>` から `delete` を除いて拡張する（イベントは削除されない）。

```ts
interface OccasionRepository extends Omit<TransactionalRepository<Occasion, OccasionId>, "delete"> {
  findByIds(ids: readonly OccasionId[]): Promise<readonly Occasion[]>;
  searchForOperation(keyword: SearchKeyword, pagination: Pagination): Promise<PaginationResult<Occasion>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save` | index.md の「リポジトリの共通の契約」による。`save` は楽観ロックを使う |
| `findByIds` | 指定した ID のイベントを、公開状態・運営による非公開・開催の状態を問わず返す。ない ID は結果に含めない。順序は保証しない。`ids` の件数の扱いは index.md の「リポジトリの共通の契約」による。店舗の参加状況、地域に関連づけられたイベントの状態に使う |
| `searchForOperation` | 公開状態・運営による非公開・開催の状態を問わず、`KeywordRelevance.matches(Occasion.searchableText(occasion), keyword)` が成り立つイベントを返す。並び順は `KeywordRelevance.relevance` の降順、同順位は ID の昇順。一致と並びは保存先の文字列の比較の規則や全文検索の機能によらず、この定義で決まる。サービス運営者が非公開を含めて探す読み取りに使う |

- エラー: `ConflictError`（ID の重複、楽観ロックの競合）、`NotFoundError`（`save` の対象がない）、`BusinessRuleError("COMMON_INVALID_INPUT")`（`findByIds` の 100 件超）
- 一意性: ID の一意性だけをポートが担保する
- 並行性: イベント情報の更新、公開、公開の取り下げ、中止とその取り消し、運営による非公開とその解除、写真の削除は、すべて同じ版で競合を検出する。イベント情報の更新は、編集を始めたときの `Occasion.version` を要求に含め、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする。状態を変えるだけの操作は版を含めず、`save` の楽観ロックで守る
- 可視性: コミットした書き込みは、以後のすべての問い合わせに即座に反映される

### ParticipationRepository

参加の集約を保存し、イベントと店舗のそれぞれから参加を引く。`TransactionalRepository<Participation, ParticipationKey>` を拡張する。

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
| `save` | 楽観ロックを使う。同時の参加内容の変更は、後の要求が `ConflictError` になる。参加内容の変更は、編集を始めたときの `Participation.version` を要求に含め、ユースケースが `findById` の結果の版と比べて、違えば `ConflictError` にする |
| `delete` | 楽観ロックを使う。取りやめと除外が同時に起きると、後の要求は、削除済みの参加への `delete` として `NotFoundError` になる |
| `findByOccasion` | そのイベントに参加中の店舗の参加を返す。店舗の営業状況と非公開を問わない。並び順は参加の新しい順（`participatedAt` の降順）。同順位は `PlaceId` の昇順 |
| `findByPlace` | その店舗が参加中のイベントの参加を返す。イベントの公開状態・運営による非公開・開催の状態を問わない。並び順は参加の新しい順。同順位は `OccasionId` の昇順 |

- 参照整合性: イベント・店舗・添える掲載があることは、ユースケースが書き込みの前に確かめる。後から削除された掲載の `ListingId` は参加に残り、閲覧できない対象として扱う
- 可視性: コミットした成立・変更・解除は、以後の問い合わせに即座に反映される

### RegionLinkRepository

開催地域の関連づけの集約を保存し、イベントと地域のそれぞれから関連づけを引く。`TransactionalRepository<RegionLink, RegionLinkKey>` を拡張する。

```ts
interface RegionLinkRepository extends TransactionalRepository<RegionLink, RegionLinkKey> {
  findByOccasion(occasionId: OccasionId, pagination: Pagination): Promise<PaginationResult<RegionLink>>;
  findByRegion(regionId: RegionId, pagination: Pagination): Promise<PaginationResult<RegionLink>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert` | 同じイベントと地域の組の関連づけがあれば、`linked` でも `detached` でも `ConflictError`。「イベントと地域の組に関連づけは1つ」は、集約の ID の一意性としてポートが担保する。`detached` の組が残る間、同じ組を新しく作れないことも、この一意性で守る |
| `findById` | 組の関連づけを、`linked` でも `detached` でも返す。なければ `null`。ユースケースは、結果を `RegionLink.link` の `existing` に渡す |
| `save`・`delete` | 楽観ロックを使う。イベントの運営者の `unlink` と地域の運営者の `detach` が同時に起きると、`unlink` の `delete` が先に確定すれば、`detach` の `save` は削除済みの関連づけへの `save` として `NotFoundError` になり、`detach` の `save` が先に確定すれば、`unlink` の `delete` は `ConflictError` になる |
| `findByOccasion` | そのイベントの関連づけを、`linked` と `detached` の両方返す。地域の公開状態と運営による非公開を問わない。並び順は関連づけた順（`linkedAt` の昇順）。同順位は `RegionId` の昇順 |
| `findByRegion` | その地域の関連づけを、`linked` と `detached` の両方返す。イベントの公開状態・運営による非公開・開催の状態を問わない。並び順は関連づけの新しい順（`linkedAt` の降順）。同順位は `OccasionId` の昇順 |

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
  find(occasionId: OccasionId): Promise<HoldingStatusRecord | null>;
  put(record: HoldingStatusRecord): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `findToObserve` | 次のどれかに当たるイベントを、記録とともに返す。記録がない。イベントの `version` が記録の `observedVersion` と違う。記録の `nextChangeOn` が `null` でなく、`today` 以前。公開状態と運営による非公開を問わない。開催の状態の規則を持たず、版と暦日の比較だけで決める。並び順は `OccasionId` の昇順。ジョブが記録を置き換えたイベントは、以後の結果から外れる |
| `find` | そのイベントの記録を返す。記録がない、または記録が指すイベントがなければ `null` |
| `put` | そのイベントの記録を置き換える。なければ作る。楽観ロックを使わない。UnitOfWork の中で呼び、同じスコープのドメインイベントの保存と一緒に確定する。`occasionId` の指すイベントがあることを確かめず、書き込みは成功する。指すイベントのない記録は `findToObserve` に現れない（index.md「リポジトリの共通の契約」の参照整合性）。ジョブは `findToObserve` が返したイベントの記録だけを書き込む |

- 記録は集約ではなく、楽観ロックを使わずに置き換える。ジョブがイベントを読んだ後に、記録の置き換えと並行してイベントが更新されると、置き換えた記録の `observedVersion` はイベントの版より古く、次の実行の `findToObserve` が再び返す
- 同じイベントを2つのジョブが同時に確かめると、`occasion.ended` が重ねて出ることがある。消費者は冪等に作る
- エラー: 契約が定めるエラーはない。ジョブは1件ごとの失敗を許し、次の実行でもう一度確かめる

## トランザクション境界

- イベントの登録・更新・公開・公開の取り下げ・中止・中止の取り消し・運営による非公開・解除・写真の削除は、`Occasion` の書き込みとドメインイベントの保存が1つの UnitOfWork で確定する。写真を載せた保存では、Media の写真の持ち主の設定も同じ UnitOfWork で確定する。申立てに基づく写真の削除（Moderation の `takeDownPhotosByClaim`）は、申立てを対応済みにする操作とは別の UnitOfWork で確定する
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
| `updateOccasionContent` | イベントの運営者が、イベント情報を置き換える。延期は開催期間の更新で行う | EVT-04、EVT-13、MOD-03 |
| `publishOccasion` | 公開条件を満たす下書き・公開を取り下げたイベントを公開する | EVT-06、EVT-12、EVT-13、MOD-03 |
| `unpublishOccasion` | 公開中のイベントの公開を取り下げる | EVT-06、EVT-13 |
| `cancelOccasion` | イベントの運営者が、開催の状態にかかわらずイベントを中止にする | EVT-11、EVT-13 |
| `revokeOccasionCancellation` | イベントの運営者が、中止を取り消す。開催の状態は開催期間と日付で決まる状態に戻る | EVT-11、EVT-13 |
| `suspendOccasion` | サービス運営者が、イベントを閲覧できなくする | MOD-07 |
| `unsuspendOccasion` | サービス運営者が、運営による非公開を解除する | MOD-07 |
| `changeParticipationByPlace` | 店舗管理者が、添えた掲載と参加日を承認なしに変更する | EVT-02 |
| `withdrawParticipation` | 店舗管理者が、承認なしに参加を解除する | EVT-03 |
| `addParticipationDirectly` | イベントの運営者が、管理者のいない閲覧できる店舗を、掲載と参加日を添えて参加店舗にする | EVT-10、EVT-13 |
| `changeParticipationByOccasion` | イベントの運営者が、管理者のいない参加店舗の参加内容を変更する | EVT-10、EVT-13 |
| `excludeParticipant` | イベントの運営者が、店舗の参加を解除する | EVT-09、EVT-13 |
| `linkRegion` | イベントの運営者が、閲覧できる地域を開催地域として関連づける | EVT-05、EVT-13 |
| `unlinkRegion` | イベントの運営者が、関連づけ中の地域を外す | EVT-05、EVT-13 |
| `detachRegionLink` | 地域の運営者が、関連づけを解除する | REG-11、REG-13 |
| `restoreRegionLink` | 地域の運営者が、解除を取り消して関連づけを回復する | REG-11、REG-13 |
| `getPlaceParticipations` | 店舗が参加中のイベントを、イベントの状態・開催の状態・参加内容・期間外の参加日とともに返す | EVT-01、EVT-02、EVT-03 |
| `getParticipationDetails` | 1つの店舗と1つのイベントの参加内容を、開催期間、期間外の参加日、店舗管理者の有無とともに返す | EVT-02、EVT-10 |
| `listAttachableListings` | 店舗管理者とイベントの運営者に、その店舗の添えられる掲載を返す | EVT-01、EVT-02、EVT-10 |
| `listOccasionParticipants` | イベントに参加中の店舗を、参加内容と店舗管理者の有無とともに、参加の新しい順に返す | EVT-07、EVT-10、EVT-13 |
| `listOccasionRegionLinks` | イベントの関連づけ中の地域と、地域の運営者が解除した地域を、地域の状態とともに返す | EVT-05、EVT-13 |
| `listRegionOccasionLinks` | 地域の関連づけ中のイベントと解除したイベントを、イベントの状態と開催の状態とともに返す | REG-11、REG-13 |
| `getManagedOccasion` | イベント運営者とサービス運営者に、ID で選んだイベントのイベント情報、公開状態、運営による非公開、開催の状態、閲覧者が閲覧できるかどうか、不足する公開条件、申立てで写真が削除されたこと、イベント運営者の有無を返す。サービス運営者は、イベント運営者のいるイベントも開ける | EVT-04、EVT-05、EVT-06、EVT-07、EVT-09、EVT-11、EVT-13、MOD-07 |
| `searchOccasionsForOperation` | サービス運営者が、キーワードで、閲覧者に表示されないイベントを含めて探す | EVT-12、EVT-13、MEM-01、MOD-07 |
| `recordEndedOccasions` | 日次のジョブが、開催の状態の記録と今日の状態を比べ、終了に変わったイベントの `occasion.ended` を出す | EVT-01、EVT-04、EVT-08 |

参加の成立（EVT-08 の参加の申請の承認）は、Application の承認のユースケースが、`Participation.establish` を呼んで行う。申立てに基づく写真の削除（MOD-02）は、Moderation の `takeDownPhotosByClaim` が `Occasion.takeDownPhotos` を呼んで行う。
