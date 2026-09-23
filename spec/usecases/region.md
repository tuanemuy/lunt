# Region のユースケース

ドメインは [Region](../domains/region.md)。地域の登録・更新・公開状態・運営による非公開・申立てに基づく写真の削除と、店舗の所属の除外・代表地域の選択、管理側の読み取りを持つ。

- 所属申請・離脱申請の承認（`PlaceAffiliations.affiliate`・`leave`）は Application のユースケースが行う。開催地域の関連づけの解除と解除の取り消しは Occasion のユースケースが行う
- 操作の可否は、どのユースケースも同じ読み方で確かめる。対象の管理の操作は、`StewardshipRepository.findById` の結果（なければ `Stewardship.vacant`）から `Stewardship.standingOf` で作った `TargetStanding` と、`RoleRosterRepository.findRolesOf` の役割を、`AccessPolicy.decide` の `manage_target` に渡す。店舗として行う操作（`chooseRepresentativeRegion`、`getPlaceAffiliationStatus`）は、その店舗の `TargetStanding` を `act_as_place` に渡す（代行はない。index.md「操作の可否」）。サービス運営者だけの操作は、役割を `operate_service` に渡す。`allowed: false` は `ForbiddenError`。ユースケースは `capacity` を見て可否を分けない。書き込みを持つユースケースは、操作の可否の判断に使う読み取りと、ドメインの振る舞いに渡す事実の読み取りを、書き込みと同じ UnitOfWork の中で、書き込みの前に終える（index.md「UnitOfWork ポート」）
- 所在地は、利用者が選んだ町域（`TownRef`）と、町域より後の部分で受け取る。`AreaCatalog` は UnitOfWork に参加しない読み取り専用のポートで、UnitOfWork を始める前に `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で `Address` を作る。`findTown` が `null` を返す `TownRef` は `BusinessRuleError("AREA_TOWN_NOT_FOUND")`
- 地域情報の更新は、編集を始めたときの地域の版を要求に含め、`RegionRepository.findById` の結果の版と違えば `ConflictError` にする。状態を変えるだけの操作（公開、公開の取り下げ、運営による非公開とその解除、写真の削除、代表地域の選択、除外）は版を含めず、すでにその状態であることは `BusinessRuleError` で返し、同時の書き込みは `save` の楽観ロックで守る
- 時刻は `Clock` から読んで、ドメインの振る舞いに渡す

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| registerRegion（地域を登録する） | サービス運営者が、地域情報を入力して下書きの地域を作る | REG-12 / OM-02、RM-02 |
| updateRegionContent（地域情報を更新する） | 地域運営者（不在ならサービス運営者）が、地域情報を置き換える | REG-06、REG-13、MOD-03 / RM-02 |
| publishRegion（地域を公開する） | 公開条件を満たす下書き・公開を取り下げた地域を公開する | REG-07、REG-12、REG-13、MOD-03 / RM-02 |
| unpublishRegion（地域の公開を取り下げる） | 公開中の地域の公開を取り下げる | REG-07、REG-13 / RM-02 |
| suspendRegion（地域を運営による非公開にする） | サービス運営者が、地域を閲覧できなくする | MOD-07 / OM-03 |
| unsuspendRegion（地域の運営による非公開を解除する） | サービス運営者が、運営による非公開を解除する | MOD-07 / OM-03 |
| takeDownRegionPhotos（申立てに基づいて地域の写真を削除する） | サービス運営者が、申立ての対象の地域から写真を外す | MOD-02 / OM-04 |
| chooseRepresentativeRegion（代表地域を選ぶ） | 店舗管理者が、所属中の地域から代表地域を選ぶ | REG-04 / SM-05 |
| excludeAffiliatedPlace（所属店舗を除外する） | 地域運営者（不在ならサービス運営者）が、店舗の所属を解除する | REG-10、REG-13 / RM-01 |
| getPlaceAffiliationStatus（店舗の所属地域の状況を確かめる） | 店舗管理者に、店舗の所属中の地域とその状態、代表地域、閲覧者に示されている地域を返す | REG-01、REG-02、REG-04、REG-05 / SM-05 |
| listAffiliatedPlaces（地域の所属店舗を確かめる） | 地域に所属中の店舗を、所属の新しい順に返す | REG-08、REG-13 / RM-01 |
| getManagedRegion（管理する地域を確かめる） | 地域運営者とサービス運営者に、ID で選んだ地域の地域情報、公開状態、運営による非公開、不足する公開条件、地域運営者の有無を返す | REG-06、REG-07、REG-13、MOD-07 / RM-02、OM-03 |
| searchRegionsForOperation（非公開を含めて地域を探す） | サービス運営者が、キーワードで、閲覧者に表示されない地域を含めて探す | REG-12、REG-13、MOD-07 / OM-02 |

## registerRegion

### 概要

サービス運営者が、地域情報を入力して `draft` の地域を作る。公開条件は確かめない。地域運営者がいなくても作れる。冪等な作成で、同じ ID で同じ地域情報の要求は、書き込みもドメインイベントもなしに成功する。

### 入出力

- 入力: `Actor`、呼び出し側が決めた `RegionId`、地域情報（名称、所在地、位置、写真の `PhotoId` の並び、紹介、キャッチコピー）。どの項目も未入力にできる。所在地は、町域の指定（`TownRef`）と町域より後の部分で受け取る
- 出力: 登録した地域（地域情報、公開状態、不足する公開条件）
- バリデーション: 名称・紹介・キャッチコピー・写真の並びは、`RegionContent.create` の値オブジェクトの規則による

### 使用するドメインの振る舞い・ポート

- Authority: `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- Area: `AreaCatalog.findTown`、`Town.toAddress`（UnitOfWork を始める前）
- Region: `RegionContent.create`、`Region.register`、`Region.missingRequirements`、`RegionContent` の等価性（冪等な作成の判定）、`RegionRepository.findById`・`insert`
- Media: `PhotoAssetRepository.findByIds`・`save`、`PhotoOwnership.claimAll`（持ち主は `{ kind: "region"; id }`、対象は載せたすべての写真）

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、`Region` の `insert` と、載せた写真の持ち主の設定の `save`。スコープ内で使うリポジトリは `roleRosterRepository`、`regionRepository`、`photoAssetRepository`。`PhotoOwnership.claimAll`、ID の重複、写真の楽観ロックの競合のどれで失敗しても、地域も写真の持ち主も1件も残らない。同じ ID で同じ地域情報の地域がすでにあれば、何も書き込まずに成功する。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者でない | `ForbiddenError` |
| 選んだ町域が `AreaCatalog` にない | `BusinessRuleError("AREA_TOWN_NOT_FOUND")` |
| 同じ ID で、地域情報の違う地域がすでにある | `ConflictError` |
| 写真が、ない・削除された・別の人が登録した・すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |

## updateRegionContent

### 概要

地域運営者が、管理する地域の地域情報を置き換える。地域運営者が不在の地域では、サービス運営者が代行する。`published` の地域では、公開条件を欠く内容を保存できない。`draft`・`unpublished` の地域では、公開条件を確かめない。運営による非公開の間も保存できる。公開状態と運営による非公開は変わらない。写真を加えただけでは、公開の取り下げになった地域は公開に戻らない。

### 入出力

- 入力: `Actor`、`RegionId`、編集を始めたときの地域の版、地域情報（地域を登録すると同じ項目。置き換える全体）
- 出力: 更新後の地域（地域情報、公開状態、運営による非公開、不足する公開条件、新しい版）

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`、`Stewardship.vacant`・`standingOf`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`manage_target`）
- Area: `AreaCatalog.findTown`、`Town.toAddress`（UnitOfWork を始める前）
- Region: `RegionContent.create`、`Region.updateContent`、`Region.missingRequirements`、`RegionRepository.findById`・`save`
- Media: `PhotoAssetRepository.findByIds`・`save`、`PhotoOwnership.claimAll`（対象は、この保存で新しく加わった写真だけ）
- `collectEvents`（`photos.released`）

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、`Region` の `save`、新しく加わった写真の持ち主の設定の `save`、外した写真の `photos.released` の保存。スコープ内で使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionRepository`、`photoAssetRepository`。版の不一致、公開条件の不足、`PhotoOwnership.claimAll`、楽観ロックの競合のどれで失敗しても、スコープ全体がロールバックされ、地域・写真の持ち主・ドメインイベントのどれも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域がない | `NotFoundError` |
| 操作する人が地域の管理権限を持たない（編集の途中で解除された場合を含む） | `ForbiddenError` |
| サービス運営者が、地域運営者のいる地域を更新しようとした（操作までの間に運営者が就いた場合を含む） | `ForbiddenError` |
| 選んだ町域が `AreaCatalog` にない | `BusinessRuleError("AREA_TOWN_NOT_FOUND")` |
| `published` の地域で、名称・所在地・位置・写真のいずれかを欠く | `BusinessRuleError("REGION_PUBLISH_CONDITION_UNMET")`。不足する項目は `Region.missingRequirements` で示す |
| 新しく加えた写真が、ない・削除された・別の人が登録した・すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |
| 編集を始めたときの版が、保存されている版と違う。または同時の保存に負けた | `ConflictError` |

## publishRegion

### 概要

地域運営者（不在ならサービス運営者）が、`draft` または `unpublished` の地域を公開する。公開条件（名称・所在地・位置・写真）を満たすときだけ成立する。地域運営者がいなくても公開できる。ドメインイベントは出ない。申立てによる写真の削除で公開の取り下げになった地域は、写真を載せて保存した後に、この操作で公開に戻る。

### 入出力

- 入力: `Actor`、`RegionId`
- 出力: 公開後の地域の公開状態

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`、`Stewardship.vacant`・`standingOf`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`manage_target`）
- Region: `Region.publish`、`Region.missingRequirements`、`RegionRepository.findById`・`save`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `Region` の `save` だけ。スコープ内で使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionRepository`。どのエラーでも地域は変わらない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域がない | `NotFoundError` |
| 操作する人が地域の管理権限を持たない。またはサービス運営者が、地域運営者のいる地域を公開しようとした | `ForbiddenError` |
| 地域が運営による非公開になっている。不正な遷移と公開条件より先に判定する | `BusinessRuleError("REGION_SUSPENDED")` |
| すでに `published`（他の人が先に公開した）。公開条件より先に判定する | `BusinessRuleError("PUBLICATION_INVALID_TRANSITION")` |
| 名称・所在地・位置・写真のいずれかを欠く | `BusinessRuleError("REGION_PUBLISH_CONDITION_UNMET")`。不足する項目は `Region.missingRequirements` で示す |
| 同時の保存に負けた | `ConflictError` |

## unpublishRegion

### 概要

地域運営者（不在ならサービス運営者）が、`published` の地域を `unpublished`（`byManager`）にする。所属と開催地域の関連づけ、店舗と掲載の公開状態・提供状態は変わらない。`region.unpublished`（`reason: "byManager"`）が出る。

### 入出力

- 入力: `Actor`、`RegionId`
- 出力: 取り下げ後の地域の公開状態

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`、`Stewardship.vacant`・`standingOf`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`manage_target`）
- Region: `Region.unpublish`、`RegionRepository.findById`・`save`
- `collectEvents`（`region.unpublished`）

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、`Region` の `save` と `region.unpublished` の保存。スコープ内で使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`regionRepository`。どのエラーでも、地域もドメインイベントも残らない。`PlaceAffiliations` と Occasion の関連づけは書き込まない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域がない | `NotFoundError` |
| 操作する人が地域の管理権限を持たない。またはサービス運営者が、地域運営者のいる地域の公開を取り下げようとした | `ForbiddenError` |
| 地域が運営による非公開になっている。不正な遷移より先に判定する | `BusinessRuleError("REGION_SUSPENDED")` |
| `published` でない（`draft`。他の人が先に取り下げた。写真の削除で取り下げになった） | `BusinessRuleError("PUBLICATION_INVALID_TRANSITION")` |
| 同時の保存に負けた | `ConflictError` |

## suspendRegion

### 概要

サービス運営者が、地域を運営による非公開にする。地域運営者の有無と、地域の公開状態を問わない。公開状態は書き換えない。`region.suspended` が出る。

### 入出力

- 入力: `Actor`、`RegionId`
- 出力: 地域の公開状態と運営による非公開

### 使用するドメインの振る舞い・ポート

- Authority: `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- Region: `Region.suspend`、`RegionRepository.findById`・`save`
- `collectEvents`（`region.suspended`）

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、`Region` の `save` と `region.suspended` の保存。スコープ内で使うリポジトリは `roleRosterRepository`、`regionRepository`。どのエラーでも、地域もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者でない | `ForbiddenError` |
| 地域がない | `NotFoundError` |
| すでに運営による非公開（別のサービス運営者が先に非公開にした） | `BusinessRuleError("REGION_ALREADY_SUSPENDED")` |
| 同時の保存に負けた | `ConflictError` |

## unsuspendRegion

### 概要

サービス運営者が、運営による非公開を解除する。公開状態は書き換えず、その時点の公開状態がそのまま現れる。運営による非公開の間に最後の写真が削除された地域は、`unpublished`（`photoTakedown`）のまま現れる。`region.unsuspended` が出る。

### 入出力

- 入力: `Actor`、`RegionId`
- 出力: 地域の公開状態と運営による非公開

### 使用するドメインの振る舞い・ポート

- Authority: `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- Region: `Region.unsuspend`、`RegionRepository.findById`・`save`
- `collectEvents`（`region.unsuspended`）

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、`Region` の `save` と `region.unsuspended` の保存。スコープ内で使うリポジトリは `roleRosterRepository`、`regionRepository`。どのエラーでも、地域もドメインイベントも残らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者でない | `ForbiddenError` |
| 地域がない | `NotFoundError` |
| 運営による非公開でない（別のサービス運営者が先に解除した） | `BusinessRuleError("REGION_NOT_SUSPENDED")` |
| 同時の保存に負けた | `ConflictError` |

## takeDownRegionPhotos

### 概要

サービス運営者が、未対応の取り下げの申立ての対象になっている地域から、選んだ写真を外す。外せる写真は、申立人が示した写真に限らない。選んだ写真に地域の写真でないものが混じっていれば、1枚も外さない。写真が残る地域は公開が続き、1枚目を外すと次の写真が代表写真になる。`published` の地域の写真がなくなると `unpublished`（`photoTakedown`）になる。運営による非公開の間も同じ。申立ての状態は変えない。申立てを対応済みにする操作（Moderation）とは別の UnitOfWork で確定する。

### 入出力

- 入力: `Actor`、`TakedownClaimId`、`RegionId`、外す写真の `PhotoId`（1枚以上）
- 出力: 削除後の地域の写真と公開状態

### 使用するドメインの振る舞い・ポート

- Authority: `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- Moderation: `TakedownClaimRepository.findById`、`TakedownClaim.authorizePhotoRemoval`（`owner` は `{ kind: "region"; id }`）
- Region: `Region.takeDownPhotos`、`RegionRepository.findById`・`save`
- `collectEvents`（`region.photos_taken_down`（`unpublished` は、この削除で `unpublished` になったかどうか）、`photos.released`、公開条件を欠いたときの `region.unpublished`（`reason: "photoTakedown"`））

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、`Region` の `save` と、返されたドメインイベントの保存。申立ては、同じスコープの中で、書き込みの前に読んで確かめる。スコープ内で使うリポジトリは `roleRosterRepository`、`takedownClaimRepository`（読み取りだけ）、`regionRepository`。どのエラーでも、地域もドメインイベントも残らない。写真の実体と記録の削除は、`photos.released` の消費（Media）で結果整合になる。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者でない | `ForbiddenError` |
| 申立てがない。または地域がない | `NotFoundError` |
| 申立てが対応済み（別のサービス運営者が先に対応を終えた）。申立ての対象の一致より先に判定する | `BusinessRuleError("TAKEDOWN_CLAIM_ALREADY_RESOLVED")` |
| 申立ての対象が、この地域でない | `BusinessRuleError("TAKEDOWN_TARGET_MISMATCH")` |
| 選んだ写真に、地域の写真でないものがある（対応の前に削除されている場合を含む）。1枚も外さない | `BusinessRuleError("REGION_PHOTO_NOT_FOUND")` |
| 同時の保存に負けた | `ConflictError` |

## chooseRepresentativeRegion

### 概要

店舗管理者が、店舗の所属中の地域から1つを、選んだ代表地域にする。店舗として行う操作で、サービス運営者の代行はない。承認は要らず、確定の時点で反映される。地域の公開状態と運営による非公開を問わない。選び直すと、前の選択に戻せる。ドメインイベントは出ない。

### 入出力

- 入力: `Actor`、`PlaceId`、`RegionId`
- 出力: 選んだ後の代表地域

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`（対象は `{ kind: "place"; id }`）、`Stewardship.vacant`・`standingOf`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`act_as_place`）
- Region: `PlaceAffiliationsRepository.findById`・`save`、`PlaceAffiliations.empty`（記録のない店舗）、`PlaceAffiliations.chooseRepresentative`・`representative`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `PlaceAffiliations` の `save` だけ。スコープ内で使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`placeAffiliationsRepository`。どのエラーでも、店舗の所属は変わらない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人が店舗の管理権限を持たない（地域の管理権限だけを持つ人と、サービス運営者を含む。店舗管理者のいない店舗でも同じ） | `ForbiddenError` |
| 選んだ地域に所属中でない（選ぶまでの間に、離脱の承認または除外で解除された。所属の記録のない店舗を含む） | `BusinessRuleError("NOT_AFFILIATED")` |
| 同じ店舗への同時の成立・解除・選択に負けた | `ConflictError` |

## excludeAffiliatedPlace

### 概要

地域運営者（不在ならサービス運営者）が、承認も理由もなしに、店舗のその地域への所属を解除する。解除した地域が選んだ代表地域なら、選んだ代表地域はなくなり、最初に所属した地域が代表地域になる。店舗の他の地域への所属と、店舗・掲載の公開状態・提供状態は変わらない。`region.affiliation_dissolved`（`cause: "excluded"`）が出る。その店舗のこの地域からの離脱申請の失効と、店舗管理者への通知は、このドメインイベントの消費で結果整合になる。

### 入出力

- 入力: `Actor`、`RegionId`、`PlaceId`
- 出力: なし

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`（対象は `{ kind: "region"; id }`）、`Stewardship.vacant`・`standingOf`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`manage_target`）
- Region: `PlaceAffiliationsRepository.findById`・`save`、`PlaceAffiliations.empty`（記録のない店舗）、`PlaceAffiliations.exclude`
- `collectEvents`（`region.affiliation_dissolved`）

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、`PlaceAffiliations` の `save` と `region.affiliation_dissolved` の保存。スコープ内で使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`placeAffiliationsRepository`。どのエラーでも、所属もドメインイベントも残らない。`Region`、店舗、掲載、申請は書き込まない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人が地域の管理権限を持たない。またはサービス運営者が、地域運営者のいる地域の店舗を除外しようとした（操作までの間に運営者が就いた場合を含む） | `ForbiddenError` |
| 店舗がその地域に所属中でない（離脱の承認または別の運営者の除外で、すでに解除されている） | `BusinessRuleError("NOT_AFFILIATED")` |
| 同じ店舗への同時の成立・解除・選択に負けた | `ConflictError` |

## getPlaceAffiliationStatus

### 概要

店舗管理者に、店舗の所属中の地域とその状態、代表地域、閲覧者に示されている地域を返す。店舗として行う操作で、サービス運営者の代行はない。店舗管理者のいなかった時期に成立した所属を含む。公開を取り下げた地域と運営による非公開の地域との所属も、地域の状態とともに返す。所属の集合、地域の状態、代表地域、閲覧者に示す地域は、`PlaceAffiliations` の規則で1つの結果に合成する。申請中の地域は Application の読み取りが返し、この読み取りに含めない。

### 入出力

- 入力: `Actor`、`PlaceId`
- 出力: 所属中の地域の並び（最初に所属した順。地域ごとに、名称、公開状態、運営による非公開、閲覧できるかどうか、所属が成立した日時）、代表地域と、それが店舗管理者の選んだ地域かどうか、閲覧者に示されている地域。所属のない店舗は、空の並びと、代表地域なしを返す

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`（対象は `{ kind: "place"; id }`）、`Stewardship.vacant`・`standingOf`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`act_as_place`）
- Region: `PlaceAffiliationsRepository.findById`（`null` は所属のない店舗）、`RegionRepository.findByIds`、`PlaceAffiliations.representative`・`displayedRegion`
- Discovery: `VisibilityPolicy.isRegionViewable`（`RegionRepository.findByIds` で読んだ地域から `viewableRegionIds` を求める）

### トランザクション境界

書き込みがなく、原子的に確定するものはない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人が店舗の管理権限を持たない（手放した、解除された場合と、サービス運営者を含む。店舗管理者のいない店舗でも同じ） | `ForbiddenError` |

## listAffiliatedPlaces

### 概要

地域運営者（不在ならサービス運営者）に、地域に所属中の店舗を、所属の新しい順に返す。店舗の営業状況と非公開を問わずに含め、店舗の状態とともに返す。所属・離脱の申請は Application の読み取りが返し、この読み取りに含めない。

### 入出力

- 入力: `Actor`、`RegionId`、`Pagination`
- 出力: 所属店舗の並び（店舗ごとに、名称、営業状況、非公開かどうか、所属が成立した日時）と、所属店舗の全件数。所属店舗がなければ空

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`（対象は `{ kind: "region"; id }`）、`Stewardship.vacant`・`standingOf`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`manage_target`）
- Region: `PlaceAffiliationsRepository.findAffiliatedPlaces`
- Place: `PlaceRepository.findByIds`

### トランザクション境界

書き込みがなく、原子的に確定するものはない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人が地域の管理権限を持たない。またはサービス運営者が、地域運営者のいる地域の所属店舗を確かめようとした | `ForbiddenError` |

## getManagedRegion

### 概要

地域運営者とサービス運営者に、ID で選んだ1つの地域の現在の内容と状態を返す。地域情報の編集、公開、公開の取り下げ、運営による非公開とその解除の始まりの値になる。サービス運営者は、地域運営者のいる地域も読める（運営による非公開とその解除は、地域運営者の有無を問わない）が、代行できるのは地域運営者のいない地域だけで、その区別を結果に含める。`unpublished` の理由（`byManager`・`photoTakedown`）を区別して返す。

### 入出力

- 入力: `Actor`、`RegionId`
- 出力: 地域情報（写真は表示用の参照つき）、公開状態（`unpublished` は理由を含む）、運営による非公開、不足する公開条件、版（編集を始めたときの版として、更新の要求に含める）、地域運営者の有無、操作する人が地域を管理できるかどうかとその立場（`manage_target` の `AccessDecision`。管理者か、サービス運営者の代行か）

### 使用するドメインの振る舞い・ポート

- Authority: `StewardshipRepository.findById`、`Stewardship.vacant`・`standingOf`・`isVacant`、`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`manage_target` と `operate_service`。どちらかが `allowed: true` なら読める。`manage_target` の `capacity` が操作する人の立場になる）
- Region: `RegionRepository.findById`、`Region.missingRequirements`
- Media: `PhotoStorage.displayRefs`

### トランザクション境界

書き込みがなく、原子的に確定するものはない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 地域がない | `NotFoundError` |
| 操作する人が、地域運営者でもサービス運営者でもない（管理権限を手放した・解除された人を含む） | `ForbiddenError` |

## searchRegionsForOperation

### 概要

サービス運営者が、キーワードで、`draft`・`unpublished`・運営による非公開の地域を含めて地域を探す。一致は `RegionRepository.search` の契約が定める正規化（共有カーネルの `TextNormalization.normalize`）を当てた名称の部分一致で、保存先によらない。結果は関連度の高い順で、地域ごとに状態と、地域運営者の有無を添える。正規化した結果が空のキーワード（空白だけを含む）は、空の結果を返す。

### 入出力

- 入力: `Actor`、キーワード、`Pagination`
- 出力: 地域の並び（地域ごとに、名称、公開状態、運営による非公開、地域運営者の有無）と、条件に合う全件数。合う地域がなければ空

### 使用するドメインの振る舞い・ポート

- Authority: `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）、`StewardshipRepository.findByTargets`（結果が1件以上のとき。結果にない対象は管理者不在）、`Stewardship.isVacant`
- Region: `RegionRepository.search`

### トランザクション境界

書き込みがなく、原子的に確定するものはない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者でない | `ForbiddenError` |
