# Occasion のユースケース

ドメイン: Occasion（[../domains/occasion.md](../domains/occasion.md)）

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `registerOccasion` | サービス運営者が、イベント情報を入力して下書きのイベントを作る | EVT-12 / EM-02 |
| `updateOccasionContent` | イベントの運営者が、イベント情報を置き換える。延期は開催期間の更新で行う | EVT-04、EVT-13、MOD-03 / EM-02 |
| `publishOccasion` | イベントの運営者が、公開条件を満たす下書き・公開を取り下げたイベントを公開する | EVT-06、EVT-12、EVT-13、MOD-03 / EM-02 |
| `unpublishOccasion` | イベントの運営者が、公開中のイベントの公開を取り下げる | EVT-06、EVT-13 / EM-02 |
| `cancelOccasion` | イベントの運営者が、開催の状態にかかわらずイベントを中止にする | EVT-11、EVT-13 / EM-02 |
| `revokeOccasionCancellation` | イベントの運営者が、中止を取り消す | EVT-11、EVT-13 / EM-02 |
| `suspendOccasion` | サービス運営者が、イベントを運営による非公開にする | MOD-07 / OM-03 |
| `unsuspendOccasion` | サービス運営者が、運営による非公開を解除する | MOD-07 / OM-03 |
| `changeParticipationByPlace` | 店舗管理者が、添えた掲載と参加日を承認なしに変更する | EVT-02 / CM-04 |
| `withdrawParticipation` | 店舗管理者が、承認なしに参加を取りやめる | EVT-03 / CM-04 |
| `addParticipationDirectly` | イベントの運営者が、管理者のいない閲覧できる店舗を、掲載と参加日を添えて参加店舗にする | EVT-10、EVT-13 / CM-04 |
| `changeParticipationByOccasion` | イベントの運営者が、管理者のいない参加店舗の参加内容を変更する | EVT-10、EVT-13 / CM-04 |
| `excludeParticipant` | イベントの運営者が、店舗の参加を解除する | EVT-09、EVT-13 / EM-01 |
| `linkRegion` | イベントの運営者が、閲覧できる地域を開催地域として関連づける | EVT-05、EVT-13 / EM-03 |
| `unlinkRegion` | イベントの運営者が、関連づけ中の地域を外す | EVT-05、EVT-13 / EM-03 |
| `detachRegionLink` | 地域の運営者が、イベントからの関連づけを解除する | REG-11、REG-13 / RM-03 |
| `restoreRegionLink` | 地域の運営者が、解除を取り消して関連づけを回復する | REG-11、REG-13 / RM-03 |
| `getPlaceParticipations` | 店舗が参加中のイベントを、イベントの状態・開催の状態・参加内容・期間外の参加日とともに返す | EVT-01、EVT-02、EVT-03 / SM-06 |
| `getParticipationDetails` | 1つの店舗と1つのイベントの参加内容を、開催期間、期間外の参加日、店舗管理者の有無とともに返す | EVT-02、EVT-10 / CM-04 |
| `listAttachableListings` | 店舗管理者とイベントの運営者に、その店舗の添えられる掲載を返す | EVT-01、EVT-02、EVT-10 / CM-04、RQ-06 |
| `listOccasionParticipants` | イベントに参加中の店舗を、参加内容と店舗管理者の有無とともに返す | EVT-07、EVT-10、EVT-13 / EM-01、CM-04 |
| `listOccasionRegionLinks` | イベントの関連づけ中の地域と、地域の運営者が解除した地域を、地域の状態とともに返す | EVT-05、EVT-13 / EM-03 |
| `listRegionOccasionLinks` | 地域の関連づけ中のイベントと解除したイベントを、イベントの状態と開催の状態とともに返す | REG-11、REG-13 / RM-03 |
| `getManagedOccasion` | イベント運営者とサービス運営者に、ID で選んだイベントのイベント情報、公開状態、運営による非公開、開催の状態、閲覧者が閲覧できるかどうか、不足する公開条件、申立てで写真が削除されたこと、イベント運営者の有無を返す | EVT-04、EVT-05、EVT-06、EVT-07、EVT-09、EVT-11、EVT-13、MOD-07 / EM-01、EM-02、EM-03、OM-03、イベント運営者が開いた CM-01・CM-02、イベント運営者または不在の代行で開いた CM-04（管理ナビゲーション） |
| `searchOccasionsForOperation` | サービス運営者が、キーワードで、閲覧者に表示されないイベントを含めて探す | EVT-12、EVT-13、MEM-01、MOD-07 / OM-02 |
| `recordEndedOccasions` | 日次のジョブ。開催の状態の記録と今日の状態を比べ、終了に変わったイベントの `occasion.ended` を出す | EVT-01、EVT-04、EVT-08 |

参加の成立（EVT-08 の参加の申請の承認）は、Application の承認のユースケースが `Participation.establish` を呼んで行う。申立てに基づく写真の削除（MOD-02。`Occasion.takeDownPhotos`）は、Moderation の `takeDownPhotosByClaim` が行う。

## 操作の可否の確かめ方

操作の可否は、どのユースケースも Authority の `AccessPolicy.decide` で確かめる。`allowed: false` は `ForbiddenError`。操作する人の役割は `RoleRosterRepository.findRolesOf`、対象の管理体制は `StewardshipRepository.findById`（なければ `Stewardship.vacant`）で読み、`Stewardship.standingOf` で `TargetStanding` にする。ユースケースは `basis` を見て可否を分けない。以下のユースケースは、次の表の立場のどれで確かめるかだけを書き、可否の条件を再掲しない（条件は `AccessPolicy` だけが持つ）。

| 立場 | `Operation` |
| --- | --- |
| イベントの運営者 | `manage_target`（`standing` はそのイベント） |
| 店舗管理者 | `act_as_place`（`standing` はその店舗） |
| 地域の運営者 | `manage_target`（`standing` はその地域） |
| サービス運営者 | `operate_service` |
| イベントを ID で開いて状態とイベント運営者の有無を確かめる人（`getManagedOccasion`） | `inspect_target`（`standing` はそのイベント） |

- 書き込みを持つユースケースは、操作の可否の判断に使う読み取りと、ドメインの振る舞いに渡す事実の読み取りを、書き込みと同じ UnitOfWork の中で、書き込みの前に終える。読み取りだけのユースケースも、集約のリポジトリ（Authority・Place・Listing・Region のリポジトリを含む）は、書き込まない UnitOfWork を1つ使って読む（index.md「UnitOfWork ポート」）。操作の途中で管理権限を失った人と、イベント運営者・地域運営者が就いた後に代行しようとしたサービス運営者は、この読み取りの時点の管理体制で拒否される
- 店舗管理者の有無の事実（`placeHasSteward`）は、店舗の管理体制の `Stewardship.isVacant` から求める
- 店舗・地域が閲覧できるかの事実（`placeViewable`・`regionViewable`）は、`PlaceRepository.findById`・`RegionRepository.findById` で読んだ集約に、Discovery の `VisibilityPolicy.isPlaceViewable`・`isRegionViewable` を当てて求める。閲覧できない店舗を添える・地域を関連づける要求は、振る舞いの `BusinessRuleError` になる（index.md「エラーの種類」）
- 添えられる掲載の事実（`attachableListingIds`）は、入力の `ListingId` を `ListingRepository.findByIds` で読み、Listing の `Listing.attachableIds(listings, placeId, today)` で求める。添えられる掲載の規則は、この関数だけが持つ
- 添えた掲載を返す読み取りは、参加内容の掲載をすべて、添えた順に返す。`ListingRepository.findByIds` の結果にある掲載は、名称、公開状態、運営による非公開、提供状態、閲覧者に表示されているか（Discovery の `VisibilityPolicy.isListingViewable`。紐づく店舗は参加の店舗）とともに返す。結果にない掲載は、削除された掲載として返す
- 開催場所の所在地は、利用者が選んだ町域（`TownRef`）と、町域より後の部分で受け取る。`AreaCatalog` は UnitOfWork に参加しない読み取り専用のポートで、UnitOfWork を始める前に `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で `Address` を作る。`findTown` が `null` を返す `TownRef` は `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）
- 版の扱いは index.md「編集の競合」による。版を含めるのは内容を編集して保存する要求（`updateOccasionContent`、`changeParticipationByPlace`、`changeParticipationByOccasion`）だけ。ほかの書き込みは版を含めず、同時の書き込みは `insert` の一意性と `save`・`delete` の楽観ロックで守る
- 参加と関連づけの集約の ID は、イベントと店舗、イベントと地域の組で、呼び出し側が決めて送る値ではない。`addParticipationDirectly` と `linkRegion` は index.md の冪等な作成の対象ではなく、成立した後の同じ組の要求の送り直しは、`BusinessRuleError`（`OCCASION_ALREADY_PARTICIPATING`・`OCCASION_REGION_ALREADY_LINKED`）で返す

## registerOccasion

### 概要

サービス運営者が、イベント情報を入力して下書きのイベントを作る。公開条件を確かめない。イベント運営者がいなくても作れる。写真を載せた登録は、写真の持ち主をこのイベントに設定する。

冪等な作成。同じ `OccasionId` で、保存されたイベント情報と等しい（`OccasionContent` の等価性）要求は、書き込みもドメインイベントもなしに成功として扱う。

### 入出力

- 入力: `Actor`、呼び出し側が決めた `OccasionId`、イベント情報（名称、開催期間、開催場所の町域の選択と町域より後の部分、位置、写真の `PhotoId` の並び、紹介、キャッチコピー。どれも空でよい）
- 出力: 登録したイベント（イベント情報、公開状態、不足する公開条件）
- 立場: サービス運営者
- 終了日が開始日より前の開催期間は、下書きでも保存できない

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.findTown`、`Town.toAddress`
- `OccasionContent.create`、`Occasion.register`、`Occasion.missingRequirements`
- `OccasionRepository.findById`、`insert`
- `PhotoAssetRepository.findByIds`、`save`、`PhotoOwnership.claimAll`（持ち主は `{ kind: "occasion"; id }`）
- `Clock`

### トランザクション境界

UnitOfWork が要る。町域の解決と `Address` の組み立ては、UnitOfWork を始める前に行う。

- スコープに含まれる書き込み: `Occasion` の `insert`、載せた写真の持ち主の設定（`PhotoAsset` の `save`）
- 使うリポジトリ: `roleRosterRepository`、`occasionRepository`、`photoAssetRepository`
- 写真の持ち主の設定が成立しなければ、イベントの書き込みごとロールバックされる

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者の操作を行えない | `ForbiddenError` |
| 選んだ町域が `AreaCatalog` にない | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`） |
| 開催期間の終了日が開始日より前 | `BusinessRuleError`（`COMMON_INVALID_DATE_RANGE`） |
| 載せた写真が、ない・削除された・別の人が登録した・すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |
| 同じ `OccasionId` で、イベント情報の違うイベントがある | `ConflictError` |

## updateOccasionContent

### 概要

イベントの運営者が、イベント情報を置き換える。延期は開催期間の更新で行い、開催期間が前と違えば `occasion.period_changed` が出る。公開中のイベントは公開条件を確かめる。公開状態・運営による非公開・中止・参加・参加日・開催地域の関連づけを変えない。運営による非公開の間も、中止の間も行える。新しく載せた写真の持ち主をこのイベントに設定し、外した写真を `photos.released` で手放す。

### 入出力

- 入力: `Actor`、`OccasionId`、編集を始めたときのイベントの版、イベント情報（`registerOccasion` と同じ項目）
- 出力: 更新後のイベント（イベント情報、公開状態、運営による非公開、開催の状態、不足する公開条件）
- 立場: イベントの運営者
- 編集を始めたときの版が、保存されている版と違えば、他の人が先に保存した内容を上書きせず、競合にする

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.findTown`、`Town.toAddress`
- `OccasionContent.create`、`Occasion.updateContent`、`Occasion.holdingStatus`、`Occasion.missingRequirements`、`LocalDate.fromInstant`
- `OccasionRepository.findById`、`save`
- `PhotoAssetRepository.findByIds`、`save`、`PhotoOwnership.claimAll`（この保存で新しく加わった写真だけ）
- `Clock`

### トランザクション境界

UnitOfWork が要る。町域の解決は UnitOfWork を始める前に行う。

- スコープに含まれる書き込み: `Occasion` の `save`、新しく加わった写真の持ち主の設定、`occasion.period_changed`・`photos.released` の保存
- 使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`occasionRepository`、`photoAssetRepository`
- ロールバック: 公開条件の不足、写真の持ち主の設定の不成立、楽観ロックの競合
- 参加（`Participation`）は書き込まない。期間外になった参加日は参加に残る

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| イベントがない | `NotFoundError` |
| 選んだ町域が `AreaCatalog` にない | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`） |
| 公開中のイベントで、名称・開催期間・開催場所・写真のいずれかを欠く | `BusinessRuleError`（`OCCASION_PUBLISH_CONDITION_UNMET`）。`Occasion.missingRequirements` の不足する項目を添える |
| 開催期間の終了日が開始日より前 | `BusinessRuleError`（`COMMON_INVALID_DATE_RANGE`） |
| 載せた写真が、ない・削除された・別の人が登録した・すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |
| 他の人が先に保存した（編集を始めたときの版と違う、または楽観ロックの競合） | `ConflictError` |

## publishOccasion

### 概要

イベントの運営者が、下書きまたは公開を取り下げたイベントを公開する。公開条件（名称・開催期間・開催場所・写真）を満たすときだけ成立する。イベント運営者がいなくても、開催の状態が何であっても公開できる。写真の削除で公開の取り下げになったイベントの再公開も、この操作による。ドメインイベントは出ない。

### 入出力

- 入力: `Actor`、`OccasionId`
- 出力: 公開後のイベントの公開状態と開催の状態
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `Occasion.publish`、`Occasion.missingRequirements`、`Occasion.holdingStatus`
- `OccasionRepository.findById`、`save`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは `Occasion` の `save` だけ。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`occasionRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| イベントがない | `NotFoundError` |
| 運営による非公開の間。不正な遷移と公開条件より先に判定する | `BusinessRuleError`（`OCCASION_SUSPENDED`） |
| すでに公開中（他の人が先に公開した）。公開条件より先に判定する | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`） |
| 名称・開催期間・開催場所・写真のいずれかを欠く | `BusinessRuleError`（`OCCASION_PUBLISH_CONDITION_UNMET`）。`Occasion.missingRequirements` の不足する項目を添える |
| 他の人が先に保存した | `ConflictError` |

## unpublishOccasion

### 概要

イベントの運営者が、公開中のイベントの公開を取り下げる。`reason: "byManager"` の `occasion.unpublished` が出る。参加と開催地域の関連づけ、店舗と掲載の公開状態・提供状態を変えない。

### 入出力

- 入力: `Actor`、`OccasionId`
- 出力: 取り下げ後のイベントの公開状態
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `Occasion.unpublish`
- `OccasionRepository.findById`、`save`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`Occasion` の `save` と `occasion.unpublished` の保存。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`occasionRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| イベントがない | `NotFoundError` |
| 運営による非公開の間。不正な遷移より先に判定する | `BusinessRuleError`（`OCCASION_SUSPENDED`） |
| 公開中でない（下書き。他の人が先に取り下げた。写真の削除で取り下げになった） | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`） |
| 他の人が先に保存した | `ConflictError` |

## cancelOccasion

### 概要

イベントの運営者が、イベントを中止にする。開催の状態（開催前・開催中・終了）、公開状態、運営による非公開を問わない。`occasion.cancelled` が出る。参加は保たれる。確認中・差し戻し中の参加の申請の失効と通知は、ドメインイベントの消費で起きる。

### 入出力

- 入力: `Actor`、`OccasionId`
- 出力: 中止後のイベントの開催の状態（`cancelled`）
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `Occasion.cancel`、`Occasion.holdingStatus`
- `OccasionRepository.findById`、`save`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`Occasion` の `save` と `occasion.cancelled` の保存。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`occasionRepository`。`Participation` と申請は書き込まない。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| イベントがない | `NotFoundError` |
| すでに中止になっている（別の運営者が先に中止にした。中止の取り消しと同時に実行し、取り消す前のイベントを読んだ） | `BusinessRuleError`（`OCCASION_ALREADY_CANCELLED`） |
| 同時の中止、またはイベントの別の保存に負けた | `ConflictError` |

## revokeOccasionCancellation

### 概要

イベントの運営者が、中止を取り消す。開催期間を過ぎていても、運営による非公開の間も取り消せる。開催の状態は、開催期間と今日の日付で決まる状態に戻る。ドメインイベントは出ない。失効した参加の申請は戻らない。

### 入出力

- 入力: `Actor`、`OccasionId`
- 出力: 取り消し後のイベントの開催の状態（開催前・開催中・終了のいずれか）
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `Occasion.revokeCancellation`、`Occasion.holdingStatus`、`LocalDate.fromInstant`
- `OccasionRepository.findById`、`save`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは `Occasion` の `save` だけ。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`occasionRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| イベントがない | `NotFoundError` |
| 中止になっていない（別の運営者が先に取り消した。中止と同時に実行し、中止にする前のイベントを読んだ） | `BusinessRuleError`（`OCCASION_NOT_CANCELLED`） |
| 同時の中止の取り消し、またはイベントの別の保存に負けた | `ConflictError` |

## suspendOccasion

### 概要

サービス運営者が、イベントを運営による非公開にする。イベント運営者の有無と、公開状態を問わない。公開状態と中止を書き換えない。`occasion.suspended` が出る。

### 入出力

- 入力: `Actor`、`OccasionId`
- 出力: 運営による非公開になったイベントの公開状態と運営による非公開の状態
- 立場: サービス運営者

### 使用するドメインの振る舞い・ポート

- `Occasion.suspend`
- `OccasionRepository.findById`、`save`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`Occasion` の `save` と `occasion.suspended` の保存。使うリポジトリは `roleRosterRepository`、`occasionRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者の操作を行えない | `ForbiddenError` |
| イベントがない | `NotFoundError` |
| 別のサービス運営者がすでに運営による非公開にしていた | `BusinessRuleError`（`OCCASION_ALREADY_SUSPENDED`） |
| 他の人が先に保存した | `ConflictError` |

## unsuspendOccasion

### 概要

サービス運営者が、運営による非公開を解除する。公開状態を書き換えないので、その時点の公開状態がそのまま現れる。運営による非公開の間に最後の写真が削除されたイベントは、公開の取り下げ（`photoTakedown`）のまま現れる。`occasion.unsuspended` が出る。

### 入出力

- 入力: `Actor`、`OccasionId`
- 出力: 解除後のイベントの公開状態
- 立場: サービス運営者

### 使用するドメインの振る舞い・ポート

- `Occasion.unsuspend`
- `OccasionRepository.findById`、`save`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`Occasion` の `save` と `occasion.unsuspended` の保存。使うリポジトリは `roleRosterRepository`、`occasionRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者の操作を行えない | `ForbiddenError` |
| イベントがない | `NotFoundError` |
| 別のサービス運営者がすでに解除していた | `BusinessRuleError`（`OCCASION_NOT_SUSPENDED`） |
| 他の人が先に保存した | `ConflictError` |

## changeParticipationByPlace

### 概要

店舗管理者が、参加中のイベントに添えた掲載と参加日を置き換える。承認は要らない。イベントの開催の状態、公開状態、運営による非公開を問わない。店舗管理者のいなかった時期にイベントの運営者が追加した参加も対象になる。内容が変われば `changedBy: "place"` の `occasion.participation_changed` が出る。内容が前と同じなら、書き込みもドメインイベントもない。店舗と掲載の公開状態・提供状態に触れない。

### 入出力

- 入力: `Actor`、`OccasionId`、`PlaceId`、編集を始めたときの参加の版、添える掲載の `ListingId` の並び、参加日の並び（どちらも空でよい）
- 出力: 変更後の参加内容と、閲覧者に示す参加日
- 立場: 店舗管理者
- 新しく添える掲載は、その店舗の添えられる掲載に限る。すでに添えた掲載は、添えられる掲載でなくなっても添えたままにできる（`ParticipationDetails.create`）。参加日は開催期間内に限る。開催期間の更新で期間外になった参加日を残したままの保存は成立しない

### 使用するドメインの振る舞い・ポート

- `ParticipationRepository.findById`、`save`
- `OccasionRepository.findById`（開催期間の事実）
- `ListingRepository.findByIds`、`Listing.attachableIds`（`attachableListingIds`）
- `ParticipationDetails.create`（`current` は変更の前の参加内容）、`Participation.changeByPlace`、`Participation.visibleDates`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

UnitOfWork が要る。

- スコープに含まれる書き込み: `Participation` の `save`、`occasion.participation_changed` の保存
- 使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`participationRepository`、`occasionRepository`（読み取りだけ）、`listingRepository`（読み取りだけ）
- 事実（開催期間、添えられる掲載）を読んでから書き込むまでの間の、開催期間の更新との行き違いは防がない。期間外になった参加日は `Participation.visibleDates` が除く
- どのエラーでも、スコープ全体がロールバックされ、参加もドメインイベントも残らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者の操作を行えない | `ForbiddenError` |
| 保存するまでの間に、除外または取りやめで参加が解除されていた | `NotFoundError` |
| 開催期間の外の日付を参加日にした（期間外になった参加日を残したままの保存を含む）。開催期間がないのに参加日を添えた | `BusinessRuleError`（`OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`） |
| 新しく添える掲載が、その店舗の添えられる掲載でない | `BusinessRuleError`（`OCCASION_LISTING_NOT_ATTACHABLE`） |
| 他の人が先に保存した（編集を始めたときの版と違う、または楽観ロックの競合） | `ConflictError` |

## withdrawParticipation

### 概要

店舗管理者が、参加を取りやめる。承認は要らない。イベントの開催の状態、公開状態、運営による非公開を問わない。参加の集約を削除し、`cause: "withdrawn"` の `occasion.participation_dissolved` が出る。取りやめは取り消せない。店舗と掲載の公開状態・提供状態に触れない。

### 入出力

- 入力: `Actor`、`OccasionId`、`PlaceId`
- 出力: なし
- 立場: 店舗管理者

### 使用するドメインの振る舞い・ポート

- `ParticipationRepository.findById`、`delete`
- `Participation.withdraw`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`Participation` の `delete` と `occasion.participation_dissolved` の保存。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`participationRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者の操作を行えない | `ForbiddenError` |
| 取りやめるまでの間に、除外または別の店舗管理者の取りやめで参加が解除されていた（同時に起きて、後に確定する場合を含む） | `NotFoundError` |

## addParticipationDirectly

### 概要

イベントの運営者が、管理者のいない閲覧できる店舗を、掲載と参加日を添えて参加店舗にする。承認は要らず、追加した時点で参加が成立する。イベントの開催の状態、公開状態、運営による非公開を問わない。`occasion.participation_established` が出る。店舗と掲載の公開状態・提供状態に触れない。

### 入出力

- 入力: `Actor`、`OccasionId`、`PlaceId`、添える掲載の `ListingId` の並び、参加日の並び（どちらも空でよい）
- 出力: 成立した参加の参加内容
- 立場: イベントの運営者
- 添える掲載は、その店舗の添えられる掲載に限る。参加日は開催期間内に限る

### 使用するドメインの振る舞い・ポート

- `OccasionRepository.findById`（イベントがあることと、開催期間の事実）
- `PlaceRepository.findById`（店舗があること）、Discovery の `VisibilityPolicy.isPlaceViewable`（`placeViewable`）
- `StewardshipRepository.findById`、`Stewardship.isVacant`（`placeHasSteward`）
- `ListingRepository.findByIds`、`Listing.attachableIds`（`attachableListingIds`）
- `ParticipationRepository.findById`（`existing`）、`insert`
- `ParticipationDetails.create`（`current` は `null`）、`Participation.addDirectly`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

UnitOfWork が要る。

- スコープに含まれる書き込み: `Participation` の `insert`、`occasion.participation_established` の保存
- 使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`participationRepository`、`occasionRepository`（読み取りだけ）、`placeRepository`（読み取りだけ）、`listingRepository`（読み取りだけ）
- 店舗管理者の就任と直接の追加の行き違いは防がない。成立した参加は、店舗管理者が就いた後も保たれる
- どのエラーでも、スコープ全体がロールバックされ、参加もドメインイベントも残らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| イベントまたは店舗がない | `NotFoundError` |
| 店舗管理者のいる店舗 | `BusinessRuleError`（`OCCASION_PLACE_HAS_STEWARD`） |
| 店舗が非公開で閲覧できない | `BusinessRuleError`（`OCCASION_PLACE_NOT_VIEWABLE`） |
| 店舗がすでに参加中（同じ内容の追加の送り直しを含む） | `BusinessRuleError`（`OCCASION_ALREADY_PARTICIPATING`） |
| 開催期間の外の日付を参加日にした | `BusinessRuleError`（`OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`） |
| 添える掲載が、その店舗の添えられる掲載でない | `BusinessRuleError`（`OCCASION_LISTING_NOT_ATTACHABLE`） |
| 参加の申請の承認と同時に起きた | 後の要求が `ConflictError` |

## changeParticipationByOccasion

### 概要

イベントの運営者が、管理者のいない参加店舗の参加内容を置き換える。参加が成立した経緯（直接の追加、店舗管理者の申請の承認）を問わない。イベントの開催の状態、公開状態、運営による非公開を問わない。内容が変われば `changedBy: "occasion"` の `occasion.participation_changed` が出る。内容が前と同じなら、書き込みもドメインイベントもない。

### 入出力

- 入力: `Actor`、`OccasionId`、`PlaceId`、編集を始めたときの参加の版、添える掲載の `ListingId` の並び、参加日の並び
- 出力: 変更後の参加内容と、閲覧者に示す参加日
- 立場: イベントの運営者
- 添える掲載と参加日の条件は `changeParticipationByPlace` と同じ

### 使用するドメインの振る舞い・ポート

- `ParticipationRepository.findById`、`save`
- `OccasionRepository.findById`（開催期間の事実）
- `StewardshipRepository.findById`、`Stewardship.isVacant`（`placeHasSteward`）
- `ListingRepository.findByIds`、`Listing.attachableIds`（`attachableListingIds`）
- `ParticipationDetails.create`（`current` は変更の前の参加内容）、`Participation.changeByOccasion`、`Participation.visibleDates`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`Participation` の `save` と `occasion.participation_changed` の保存。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`participationRepository`、`occasionRepository`（読み取りだけ）、`listingRepository`（読み取りだけ）。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| 保存するまでの間に、店舗に店舗管理者が就いた。店舗管理者のいる店舗 | `BusinessRuleError`（`OCCASION_PLACE_HAS_STEWARD`）。参加は保たれる。版の比較より先に判定する |
| 参加が解除されていた | `NotFoundError` |
| 開催期間の外の日付を参加日にした（期間外になった参加日を残したままの保存を含む） | `BusinessRuleError`（`OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`） |
| 新しく添える掲載が、その店舗の添えられる掲載でない | `BusinessRuleError`（`OCCASION_LISTING_NOT_ATTACHABLE`） |
| 他の人が先に保存した（編集を始めたときの版と違う、または楽観ロックの競合） | `ConflictError` |

## excludeParticipant

### 概要

イベントの運営者が、店舗の参加を解除する。承認は要らず、理由を取らない。店舗管理者の有無、参加が成立した経緯、イベントの開催の状態を問わない。参加の集約を削除し、`cause: "excluded"` の `occasion.participation_dissolved` が出る。除外は取り消せない。店舗と掲載の公開状態・提供状態に触れない。

### 入出力

- 入力: `Actor`、`OccasionId`、`PlaceId`
- 出力: なし
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `ParticipationRepository.findById`、`delete`
- `Participation.exclude`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`Participation` の `delete` と `occasion.participation_dissolved` の保存。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`participationRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| 除外するまでの間に、取りやめまたは別の運営者の除外で参加が解除されていた（同時に起きて、後に確定する場合を含む） | `NotFoundError` |

## linkRegion

### 概要

イベントの運営者が、閲覧できる地域を開催地域として関連づける。地域運営者の承認は要らず、関連づけた時点で `linked` になる。1つのイベントに複数の地域を関連づけられる。`occasion.region_linked` が出る。地域の運営者が解除した組（`detached`）は、再び関連づけられない。店舗の所属、参加、店舗と掲載の公開状態・提供状態に触れない。

### 入出力

- 入力: `Actor`、`OccasionId`、`RegionId`
- 出力: 成立した関連づけ
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `OccasionRepository.findById`（イベントがあること）
- `RegionRepository.findById`（地域があること）、Discovery の `VisibilityPolicy.isRegionViewable`（`regionViewable`）
- `RegionLinkRepository.findById`（`existing`）、`insert`
- `RegionLink.link`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`RegionLink` の `insert` と `occasion.region_linked` の保存。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionLinkRepository`、`occasionRepository`（読み取りだけ）、`regionRepository`（読み取りだけ）。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| イベントまたは地域がない | `NotFoundError` |
| すでに関連づけている地域（同じ関連づけの送り直しを含む） | `BusinessRuleError`（`OCCASION_REGION_ALREADY_LINKED`） |
| 地域の運営者が解除した地域 | `BusinessRuleError`（`OCCASION_REGION_LINK_DETACHED`） |
| 地域が、公開の取り下げまたは運営による非公開で閲覧できない | `BusinessRuleError`（`OCCASION_REGION_NOT_VIEWABLE`） |
| 同じ組の関連づけが同時に起きた | 後の要求が `ConflictError` |

## unlinkRegion

### 概要

イベントの運営者が、関連づけ中（`linked`）の地域を外す。関連づけの集約を削除する。外した地域は、あらためて関連づけられる。閲覧できない地域との関連づけも外せる。ドメインイベントは出ない。

### 入出力

- 入力: `Actor`、`OccasionId`、`RegionId`
- 出力: なし
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `RegionLinkRepository.findById`、`delete`
- `RegionLink.unlink`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは `RegionLink` の `delete` だけ。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionLinkRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |
| 外そうとした関連づけがすでにない | `NotFoundError` |
| 地域の運営者が解除した組 | `BusinessRuleError`（`OCCASION_REGION_LINK_DETACHED`） |
| 地域の運営者の解除と同時に起き、解除が先に確定した | `ConflictError` |

## detachRegionLink

### 概要

地域の運営者が、イベントからの関連づけを解除する。組は `detached` として残り、イベントの運営者は同じ組を再び関連づけることも外すこともできない。閲覧できないイベントとの関連づけも解除できる。`occasion.region_link_detached` が出る。店舗の所属、参加、店舗と掲載の公開状態・提供状態に触れない。

### 入出力

- 入力: `Actor`、`RegionId`、`OccasionId`
- 出力: 解除後の関連づけ
- 立場: 地域の運営者

### 使用するドメインの振る舞い・ポート

- `RegionLinkRepository.findById`、`save`
- `RegionLink.detach`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは、`RegionLink` の `save` と `occasion.region_link_detached` の保存。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionLinkRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域の運営者の操作を行えない | `ForbiddenError` |
| 解除するまでの間に、イベントの運営者が関連づけを外していた（外す操作と同時に起き、外す操作が先に確定した場合を含む） | `NotFoundError` |
| すでに解除している | `BusinessRuleError`（`OCCASION_REGION_LINK_ALREADY_DETACHED`） |
| 同時の解除に負けた | `ConflictError` |

## restoreRegionLink

### 概要

地域の運営者が、解除を取り消して関連づけを `linked` に戻す。`linkedAt` は変わらない。取り消した後に、再び解除できる。ドメインイベントは出ない。

### 入出力

- 入力: `Actor`、`RegionId`、`OccasionId`
- 出力: 回復した関連づけ
- 立場: 地域の運営者

### 使用するドメインの振る舞い・ポート

- `RegionLinkRepository.findById`、`save`
- `RegionLink.restore`
- `Clock`

### トランザクション境界

UnitOfWork が要る。スコープに含まれる書き込みは `RegionLink` の `save` だけ。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionLinkRepository`。どのエラーでも、スコープ全体がロールバックされ、集約もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域の運営者の操作を行えない | `ForbiddenError` |
| 関連づけがない | `NotFoundError` |
| 解除されていない（`linked`） | `BusinessRuleError`（`OCCASION_REGION_LINK_NOT_DETACHED`） |
| 他の人が先に保存した | `ConflictError` |

## getPlaceParticipations

### 概要

店舗管理者が、店舗が参加中のイベントを確かめる。公開を取り下げたイベント、運営による非公開のイベント、終了・中止したイベントの参加も、その状態とともに返す。店舗管理者のいなかった時期にイベントの運営者が追加した参加を含む。申請中のイベントは Application の読み取りが返す。

### 入出力

- 入力: `Actor`、`PlaceId`、`Pagination`
- 出力: 参加の新しい順の参加の一覧と全件数。参加ごとに、イベントの名称・開催期間・公開状態・運営による非公開・開催の状態、添えた掲載（状態とともに。削除された掲載を含む）、参加日、開催期間の外になった参加日
- 立場: 店舗管理者

### 使用するドメインの振る舞い・ポート

- `ParticipationRepository.findByPlace`
- `OccasionRepository.findByIds`、`Occasion.holdingStatus`
- `Participation.visibleDates`（参加日のうち、返らなかった日付が期間外の参加日）
- `PlaceRepository.findById`、`ListingRepository.findByIds`、`Listing.offeringStatus`、Discovery の `VisibilityPolicy.isListingViewable`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`participationRepository`、`occasionRepository`、`placeRepository`、`listingRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者の操作を行えない | `ForbiddenError` |

## getParticipationDetails

### 概要

1つの店舗と1つのイベントについて、参加内容と、参加内容の入力に要る事実（開催期間、店舗管理者の有無）を返す。店舗管理者は変更と取りやめの前に、イベントの運営者は直接の追加と変更の前に使う。参加していない組では、参加内容なしで返す（直接の追加の入力と、通知から開いた時点で参加が解除されていた場合）。閲覧できないイベントの参加も返す。添えられる掲載の候補は `listAttachableListings` が返す。

### 入出力

- 入力: `Actor`、`OccasionId`、`PlaceId`
- 出力: イベントの名称・開催期間・公開状態・運営による非公開・開催の状態、参加内容（参加していなければなし）、添えた掲載（状態とともに。削除された掲載を含む）、開催期間の外になった参加日、店舗管理者の有無
- 立場: 店舗管理者、またはイベントの運営者。どちらかで行えれば成立する

### 使用するドメインの振る舞い・ポート

- `ParticipationRepository.findById`
- `OccasionRepository.findById`、`Occasion.holdingStatus`
- `PlaceRepository.findById`
- `StewardshipRepository.findById`、`Stewardship.isVacant`
- `ListingRepository.findByIds`、`Listing.offeringStatus`
- Discovery の `VisibilityPolicy.isListingViewable`（添えた掲載が閲覧できるか）
- `Participation.visibleDates`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`participationRepository`、`occasionRepository`、`placeRepository`、`listingRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者の操作もイベントの運営者の操作も行えない | `ForbiddenError` |
| イベントまたは店舗がない | `NotFoundError` |

## listAttachableListings

### 概要

店舗管理者とイベントの運営者に、その店舗の添えられる掲載を返す。参加内容の変更、直接の追加、参加の申請の入力で、添える掲載の候補になる。候補は `ListingRepository.findPageAttachable` の結果と全件数をそのまま返す。このポートの契約は「`Listing.attachableIds` が返す掲載」なので、候補と、参加の操作・申請の確認（`Listing.attachableIds`）は同じ規則で決まる。

### 入出力

- 入力: `Actor`、`OccasionId`、`PlaceId`、`Pagination`
- 出力: 添えられる掲載の一覧（掲載ごとに、名称と提供状態）と全件数。なければ空。並び順は `findPageAttachable` による
- 立場: 店舗管理者、またはイベントの運営者（`OccasionId` のイベント）。どちらかで行えれば成立する

### 使用するドメインの振る舞い・ポート

- `OccasionRepository.findById`、`PlaceRepository.findById`（イベントと店舗があること）
- `ListingRepository.findPageAttachable`、`Listing.offeringStatus`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`occasionRepository`、`placeRepository`、`listingRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者の操作もイベントの運営者の操作も行えない | `ForbiddenError` |
| イベントまたは店舗がない | `NotFoundError` |

## listOccasionParticipants

### 概要

イベントの運営者が、イベントに参加中の店舗を確かめる。店舗の追加で、すでに参加中の店舗を選べない対象として示すのにも使う。店舗の営業状況と非公開を問わず返す。参加店舗の情報と掲載を更新する手段は返さない。

### 入出力

- 入力: `Actor`、`OccasionId`、`Pagination`
- 出力: 参加の新しい順の参加店舗の一覧と全件数。店舗ごとに、店舗の名称と状態（営業状況、非公開）、添えた掲載（状態とともに。削除された掲載を含む）、参加日、開催期間の外になった参加日、店舗管理者の有無
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `ParticipationRepository.findByOccasion`
- `OccasionRepository.findById`（開催期間）、`Participation.visibleDates`
- `PlaceRepository.findByIds`
- `StewardshipRepository.findByTargets`（参加店舗が1件以上のとき。結果にない店舗は店舗管理者不在）、`Stewardship.isVacant`
- `ListingRepository.findByIds`、`Listing.offeringStatus`、Discovery の `VisibilityPolicy.isListingViewable`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`participationRepository`、`occasionRepository`、`placeRepository`、`listingRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |

## listOccasionRegionLinks

### 概要

イベントの運営者が、イベントの開催地域の関連づけを確かめる。関連づけ中（`linked`）の地域と、地域の運営者が解除した（`detached`）地域を、区別して返す。公開の取り下げ中または運営による非公開の地域との関連づけも、地域の状態とともに返す。

### 入出力

- 入力: `Actor`、`OccasionId`、`Pagination`
- 出力: 関連づけた順の関連づけの一覧と全件数。関連づけごとに、状態（`linked`・`detached`）、地域の名称・公開状態・運営による非公開
- 立場: イベントの運営者

### 使用するドメインの振る舞い・ポート

- `RegionLinkRepository.findByOccasion`
- `RegionRepository.findByIds`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionLinkRepository`、`regionRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| イベントの運営者の操作を行えない | `ForbiddenError` |

## listRegionOccasionLinks

### 概要

地域の運営者が、地域に関連づけられたイベントを確かめる。関連づけ中のイベントと、解除したイベントを区別して返す。公開の取り下げ中または運営による非公開のイベントとの関連づけも、イベントの状態とともに返す。

### 入出力

- 入力: `Actor`、`RegionId`、`Pagination`
- 出力: 関連づけの新しい順の関連づけの一覧と全件数。関連づけごとに、状態、イベントの名称・開催期間・公開状態・運営による非公開・開催の状態
- 立場: 地域の運営者

### 使用するドメインの振る舞い・ポート

- `RegionLinkRepository.findByRegion`
- `OccasionRepository.findByIds`、`Occasion.holdingStatus`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionLinkRepository`、`occasionRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域の運営者の操作を行えない | `ForbiddenError` |

## getManagedOccasion

### 概要

イベント運営者とサービス運営者が、ID で選んだ1つのイベントの現在の内容と状態を確かめる。イベント運営の管理ナビゲーションが示すイベントの名称・状態と不在の代行中かどうか（`basis` が `absence_proxy`）の元にもなる。管理ナビゲーションを示す画面（EM のすべての画面と、イベント運営者が開いた CM-01・CM-02・CM-04、サービス運営者が不在の代行で開いた CM-04）は、画面の主なユースケースと併せてこれを読む。読めるかどうかは `inspect_target` の1回の判断で決まる。イベントの運営者の判断（`manage_target`。管理できるかどうかと立場）を結果に含める。公開状態と開催の状態は独立していて、併せて返す。写真の削除による公開の取り下げは、公開状態の `reason`（`photoTakedown`）で区別できる。

### 入出力

- 入力: `Actor`、`OccasionId`
- 出力: イベント情報、公開状態（`reason` を含む）、運営による非公開、中止、開催の状態、閲覧者が閲覧できるかどうか、不足する公開条件、申立てで写真が削除されたこと（`PhotoSet` の `takenDown`）、イベント運営者の有無、操作する人がイベントを管理できるかどうかとその立場（`manage_target` の `AccessDecision` の `basis`。`steward` か `absence_proxy` か）
- 立場: イベントを ID で開いて確かめる人（`inspect_target`）

### 使用するドメインの振る舞い・ポート

- `OccasionRepository.findById`
- `Occasion.holdingStatus`、`Occasion.missingRequirements`
- `Stewardship.isVacant`（イベント運営者の有無）、`AccessPolicy.decide`（`inspect_target` で読めるかどうかを決め、`manage_target` の結果を出力の管理できるかどうかと立場にする）
- Discovery の `VisibilityPolicy.isOccasionViewable`（閲覧者が閲覧できるかどうか）
- `PhotoStorage.displayRefs`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`occasionRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `inspect_target` が拒否した | `ForbiddenError` |
| イベントがない | `NotFoundError` |

## searchOccasionsForOperation

### 概要

サービス運営者が、キーワードで、閲覧者に表示されないイベント（下書き、公開の取り下げ、運営による非公開、終了、中止）を含めて探す。キーワードの対象の文字列は `Occasion.searchableText` が定め、一致と関連度は共有カーネルの `KeywordRelevance` が定める。結果に、イベント運営者の有無とイベントの状態を添える。

### 入出力

- 入力: `Actor`、キーワード、`Pagination`
- 出力: 関連度の高い順のイベントの一覧と全件数。イベントごとに、名称、公開状態、運営による非公開、開催の状態、イベント運営者の有無
- 立場: サービス運営者
- キーワードは `SearchKeyword.parse` で確かめる。結果が `null`（空、または空白だけ）なら、ポートを呼ばずに、空の一覧と件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `SearchKeyword.parse`
- `OccasionRepository.searchForOperation`
- `Occasion.holdingStatus`
- `StewardshipRepository.findByTargets`（結果が1件以上のとき。結果にない対象は管理者不在）、`Stewardship.isVacant`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

書き込まない UnitOfWork を1つ使い、読んだ結果を返す。使うリポジトリは `roleRosterRepository`、`occasionRepository`、`stewardshipRepository`。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者の操作を行えない | `ForbiddenError` |

## recordEndedOccasions

### 概要

日次のジョブ。確かめ直すイベント（`HoldingStatusLedger.findToObserve`）を読み、イベントごとに `HoldingStatusObserver.observe` の記録に置き換える。記録の開催の状態が終了に変わったときだけ `occasion.ended` を出す。公開状態と運営による非公開を問わない。`Occasion` の集約を書き込まず、版を進めない。

冪等。記録を置き換えたイベントは読み取りの結果から外れるので、同じ日に繰り返し実行しても、2回目以降は書き込みもドメインイベントもない。2つのジョブが同じイベントを同時に確かめると `occasion.ended` が重ねて出ることがあり、消費者が冪等に扱う。延期または中止で終了でなくなったイベントは、版が進むので次の実行で確かめ直され、記録が終了でない状態に戻る。再び終了すると `occasion.ended` がもう一度出る。

### 入出力

- 入力: スケジュールによる起動。今日の日付は `Clock` の現在時刻から日本時間で求める
- 出力: 確かめたイベントの件数と、失敗した件数
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `HoldingStatusLedger.findToObserve`（結果が空になるまで `page: 1` を読み直す。読んだページの全件が失敗したら打ち切る）、`find`（書き込みのスコープでの読み直し）、`put`
- `OccasionRepository.findById`（書き込みのスコープでの読み直し）
- `HoldingStatusObserver.observe`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

`findToObserve` のページを読むたびに、書き込まない UnitOfWork を1つ使う。書き込みは、イベント1件ごとに UnitOfWork を1つ使う（index.md「UnitOfWork ポート」の、複数の `run` を使うユースケース）。

- スコープに含まれる書き込み: `HoldingStatusLedger.put` と、`occasion.ended` の保存
- 使うポート: `holdingStatusLedger`、`occasionRepository`（読み取りだけ）
- 書き込みのスコープの中で、`OccasionRepository.findById` でイベントを、`HoldingStatusLedger.find` で記録を読み直し、読み直したイベントと記録を `observe` に渡す。読み直した後にイベントが更新された場合の扱いは、[HoldingStatusLedger](../domains/occasion.md) の契約による
- 1件の失敗は、そのイベントのスコープだけをロールバックし、他のイベントの確認を妨げない。失敗したイベントは記録が変わらないので、読み直したページに再び現れ、次の実行でもう一度確かめられる
- 読んだページの全件が失敗したら、ジョブを打ち切る。残りは次の実行で確かめる

### エラーケース

要求が振る舞いを定めるエラーはない。1件ごとの失敗は記録して続ける。
