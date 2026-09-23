# Place のユースケース

ドメイン: Place（[../domains/place.md](../domains/place.md)）。操作の可否は Authority の `AccessPolicy`、写真の持ち主の設定は Media の `PhotoOwnership`、申立てに基づく写真の削除の前提は Moderation の `TakedownClaim.authorizePhotoRemoval`、写真のない店舗の写真の代用は Discovery の `ViewProjection.substituteCover` が定める。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| matchPlaces（既存店舗を確認する） | 店名・住所で、非公開でない店舗を探し、関連度の高い順に返す | SHP-02 / RQ-02 |
| searchPlacesForOperation（サービス運営者が店舗を探す） | サービス運営者が、店名・住所で、非公開の店舗を含めて店舗を探し、関連度の高い順に返す | SHP-09、SHP-12、SHP-13、MOD-08、MOD-09 / OM-02、CM-01 |
| listStewardedPlaces（管理する店舗の一覧を読む） | 操作する人が管理権限を持つ店舗を、名称と状態とともに読む | SHP-05 / SM-01 |
| getManagedPlace（管理する店舗を読む） | 管理のために、またはサービス運営者が状態と管理者の有無を確かめるために、`PlaceId` で選んだ店舗の情報・営業状況・非公開かどうか・管理者の有無を読む | SHP-05、SHP-06、SHP-07、SHP-13、MOD-08、MOD-09 / SM-01、SM-02、OM-03 |
| registerPlaceByProxy（店舗を代理登録する） | サービス運営者が、公開条件を満たす情報で店舗を登録する | SHP-12 / SM-02 |
| updatePlaceProfile（店舗情報を更新する） | 店舗管理者、または管理者のいない店舗でサービス運営者が、店舗情報を申請なしで置き換える | SHP-06、SHP-13、MOD-06 / SM-02 |
| changeOperatingStatus（営業状況を変更する） | 店舗管理者、または管理者のいない店舗でサービス運営者が、営業中・休業・閉店のどれかに変える | SHP-07、SHP-13、MOD-06 / SM-02 |
| suspendPlace（店舗を非公開にする） | サービス運営者が店舗を非公開にする。重複する店舗の整理でも使う | MOD-08、MOD-09 / OM-03 |
| unsuspendPlace（店舗の非公開を解除する） | サービス運営者が店舗の非公開を解除する | MOD-08、MOD-09 / OM-03 |
| takeDownPlacePhotos（申立てに基づいて店舗の写真を削除する） | サービス運営者が、申立ての対象の店舗の写真を削除する | MOD-02 / OM-04 |

登録申請の承認による店舗の登録（SHP-09）と、情報修正の申請の承認による反映（SHP-11）は Application のユースケースで、`Place.register`・`Place.applyRevision` を呼ぶ。

書き込みを持つユースケースに共通すること。

- 所在地は、利用者が選んだ町域（`TownRef`）と、町域より後の部分（`rest`）で受け取る。UnitOfWork を始める前に `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で `Address` を作る。`findTown` が `null` を返せば `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にする
- 可否の判断に使う読み取り（`RoleRosterRepository.findRolesOf`、対象の `Stewardship`）と `PlaceRepository.findById` は、UnitOfWork の中で、書き込みの前に終える
- 保存された管理体制のない店舗は `Stewardship.vacant(target)` として扱う
- `AccessPolicy.decide` が `allowed: false` なら `ForbiddenError`
- 店舗情報の更新と営業状況の変更は、読んだときの版を要求に含める。非公開、非公開の解除、申立てに基づく写真の削除は版を含めず、前提の変化を `BusinessRuleError` で返し、同時の書き込みは `save` の楽観ロックで守る（index.md の「編集の競合」）

## matchPlaces

### 概要

店名・住所から、非公開でない既存の店舗を探す。登録申請の前の既存店舗の確認に使う。ログインせずに行える。一致と関連度は `PlaceMatching` が定め、営業状況では絞り込まない（休業・閉店の店舗も結果に含まれる）。

### 入出力

- 入力: 店名、住所（どちらか一方でよい）、ページング。`Actor` を取らない
- 出力: 一致した店舗の一覧（関連度の降順、同順位は `PlaceId` の昇順）と、条件に合う全件数。店舗ごとに、種別、名称、所在地、営業状況、代表写真の表示用の参照、関連度を返す。非公開の店舗と、管理者の有無は返さない
- 写真のない店舗には、Discovery の `ReferenceQueries.resolve` が返す `PlaceEntry.substituteCover`（その店舗の閲覧できる掲載の代表写真）を添える。`substituteCover` が `null` の店舗は、写真なしで返す（P-43）。代用の規則はこのユースケースに持たない
- 一致する店舗がなければ、空の一覧と件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `PlaceMatchCriteria.create`（`includeSuspended: false`）
- `PlaceRepository.match`
- 写真の代用: 結果のページに写真のない店舗があるとき、その店舗の `{ kind: "place", id }` を `ReferenceQueries.resolve` に渡す（1ページは100件以下）
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店名も住所も空（空白だけを含む） | `BusinessRuleError`（`PLACE_MATCH_TEXT_REQUIRED`） |

## searchPlacesForOperation

### 概要

サービス運営者が、店名・住所から、非公開の店舗を含めて店舗を探す。登録申請の照合、代理登録の前の確認、運営による非公開・連絡への対応のために店舗を探す操作に共通の読み取り。一致と関連度は `matchPlaces` と同じく `PlaceMatching` が定め、営業状況では絞り込まない。

### 入出力

- 入力: `Actor`、店名、住所（どちらか一方でよい）、ページング。1つのキーワードで探す操作は、同じ語を店名と住所の両方に入れる
- 出力: 一致した店舗の一覧（関連度の降順、同順位は `PlaceId` の昇順）と、条件に合う全件数。店舗ごとに、種別、名称、所在地、営業状況、代表写真の表示用の参照、関連度、非公開かどうか、管理者の有無を返す。写真のない店舗は写真なしで返す
- 一致する店舗がなければ、空の一覧と件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- `PlaceMatchCriteria.create`（`includeSuspended: true`）
- `PlaceRepository.match`
- `StewardshipRepository.findByTargets`（一致した店舗があるとき。結果にない店舗は管理者不在）、`Stewardship.isVacant`、`Place.isSuspended`
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない | `ForbiddenError` |
| 店名も住所も空（空白だけを含む） | `BusinessRuleError`（`PLACE_MATCH_TEXT_REQUIRED`） |

## listStewardedPlaces

### 概要

操作する人が管理権限を持つ店舗を読む。店舗の管理を始めるときの店舗の選択に使う。非公開の店舗も含める。

### 入出力

- 入力: `Actor`
- 出力: 管理する店舗の一覧。店舗ごとに、名称、代表写真の表示用の参照、営業状況、非公開かどうかを返す。`PlaceId` の昇順。管理する店舗がなければ空の一覧
- 管理する店舗の ID は、`StewardshipRepository.findPageBySteward` のすべてのページを読んだ結果のうち、対象が店舗のもの。`PlaceRepository.findByIds` には100件ごとに分けて渡す

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findPageBySteward`（すべてのページを読む）
- `PlaceRepository.findByIds`
- `Place.isSuspended`
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

要件・シナリオが振る舞いを定めるエラーはない。管理する店舗がないことは、空の一覧で表す。

## getManagedPlace

### 概要

`PlaceId` で選んだ1つの店舗を、非公開かどうかにかかわらず読む。店舗管理者と、サービス運営者が読める。サービス運営者は、管理者の有無にかかわらず店舗を開いて、状態と管理者の有無を確かめられる（index.md の「操作の可否」の、サービス運営者が対象を開いて確かめる読み取り）。代行できるのは管理者のいない店舗だけで、その区別を結果に含める。

### 入出力

- 入力: `Actor`、`PlaceId`
- 出力: 店舗情報（種別、名称、写真の並びと表示用の参照、紹介、所在地、位置、営業時間、連絡先）、営業状況、非公開かどうか、登録の日時、版（編集を始めたときの版として、更新の要求に含める）、管理者の有無、操作する人が対象を管理できるかどうかとその立場（`manage_target` の `AccessDecision`）

### 使用するドメインの振る舞い・ポート

- `PlaceRepository.findById`
- `StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.standingOf`、`Stewardship.isVacant`
- `RoleRosterRepository.findRolesOf`
- `AccessPolicy.decide`（`manage_target` と `operate_service`。どちらかが `allowed: true` なら読める。結果に含める管理できるかどうかは `manage_target` の `AccessDecision`）
- `Place.isSuspended`
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者でもサービス運営者でもない（管理権限を手放した・解除された人を含む） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |

## registerPlaceByProxy

### 概要

サービス運営者が、申請なしで店舗を登録する。登録した店舗は、管理者のいない店舗として、営業中・非公開でない状態で公開される。管理体制は作らない。冪等な作成で、呼び出し側が `PlaceId` を決めて送る。既存の店舗との重複は機械的に拒まない（重複の確認は、登録の前の照合の結果を見たサービス運営者が行う）。

### 入出力

- 入力: `Actor`、`PlaceId`、種別、名称、写真の `PhotoId` の並び、紹介、町域（`TownRef`）と町域より後の部分、位置、営業時間、連絡先。名称・所在地・位置と種別は必須で、写真・紹介・営業時間・連絡先は任意
- 写真は、操作する人が先に登録した写真（Media の registerPhoto）の `PhotoId` を渡す
- 出力: 登録した店舗
- 同じ `PlaceId` の店舗があり、その店舗の現在の店舗情報と入力の店舗情報が `PlaceProfile.equals` で等しければ、書き込みも持ち主の設定もなしに既存の店舗を返す。等しくなければ `ConflictError`

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.findTown`、`Town.toAddress`
- `PlaceProfile.create`、`PlaceProfile.equals`、`Place.register`
- `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- `PlaceRepository.findById`、`PlaceRepository.insert`
- 写真があるとき: `PhotoAssetRepository.findByIds`、`PhotoOwnership.claimAll`（持ち主は `{ kind: "place", id }`）、`PhotoAssetRepository.save`

### トランザクション境界

UnitOfWork が必要。

- スコープに含まれる書き込み: 店舗の `insert`、店舗の写真の持ち主の設定（`claimAll` の結果のすべての `save`）
- スコープ内で使うリポジトリ: `roleRosterRepository`、`placeRepository`、`photoAssetRepository`
- ロールバックの条件: 可否の判断、`claimAll` の `BusinessRuleError`、`PlaceId` の重複または写真の楽観ロックの競合（`ConflictError`）。ロールバックでは、店舗も持ち主の設定も残らない
- 町域の解決は UnitOfWork を始める前に行う

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない | `ForbiddenError` |
| 種別が列挙にない、名称が空 | `BusinessRuleError`（`PLACE_INVALID_KIND`、`PLACE_NAME_REQUIRED`） |
| 町域を解決できない（`AreaCatalog.findTown` が `null`。所在地が決まらない） | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`） |
| 写真が存在しない・破棄されている、操作する人が登録した写真でない、すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |
| 同じ `PlaceId` で内容の違う店舗がある | `ConflictError` |

## updatePlaceProfile

### 概要

店舗情報を、申請なしで入力の内容に置き換える。店舗管理者が行い、管理者のいない店舗ではサービス運営者が代行する。保存した時点で公開内容に反映され、所在地を変えると店舗のエリアも新しい所在地で決まる。営業状況は変えない。店舗が非公開の間も行える。

### 入出力

- 入力: `Actor`、`PlaceId`、編集を始めたときの版、店舗情報の全体（種別、名称、写真の `PhotoId` の並び、紹介、町域と町域より後の部分、位置、営業時間、連絡先）
- 写真の並びは、残す写真と新しく加える写真を、表示する順に持つ。新しく加える写真は、操作する人が先に登録した写真。並びから外れた写真は店舗から外れる
- 出力: 更新後の店舗
- 内容が現在と変わらなければ、書き込みもドメインイベントもなしに、現在の店舗を返す

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.findTown`、`Town.toAddress`
- `PlaceProfile.create`、`Place.updateProfile`
- `RoleRosterRepository.findRolesOf`、`StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.standingOf`、`AccessPolicy.decide`（`manage_target`）
- `PlaceRepository.findById`、`PlaceRepository.save`
- 新しく加える写真があるとき: `PhotoAssetRepository.findByIds`、`PhotoOwnership.claimAll`（`photoIds` は新しく加わった写真だけ）、`PhotoAssetRepository.save`
- `collectEvents`（`PhotosReleased`）

### トランザクション境界

UnitOfWork が必要。

- スコープに含まれる書き込み: 店舗の `save`、新しく加えた写真の持ち主の設定、`PhotosReleased` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`placeRepository`、`photoAssetRepository`
- ロールバックの条件: 可否の判断、版の不一致、`claimAll` の `BusinessRuleError`、店舗または写真の楽観ロックの競合。ロールバックでは、店舗情報も持ち主の設定もドメインイベントも残らない
- 外れた写真の実体の削除は、`PhotosReleased` の消費（Media）で結果整合にする

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者でない。サービス運営者だが店舗に管理者がいる（代行の途中で管理者が就いた場合を含む） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |
| 編集を始めたときの版と現在の版が違う（他の人が先に保存した）、または保存が楽観ロックで競合した | `ConflictError` |
| 名称が空、種別が列挙にない、写真の `PhotoId` が重なる | `BusinessRuleError`（`PLACE_NAME_REQUIRED`、`PLACE_INVALID_KIND`、`PLACE_DUPLICATE_PHOTO`） |
| 町域を解決できない（`AreaCatalog.findTown` が `null`。所在地が決まらない） | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`） |
| 新しく加える写真が存在しない・破棄されている、操作する人が登録した写真でない、すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |

## changeOperatingStatus

### 概要

店舗の営業状況を、営業中・休業・閉店のどれかに変える。どれからどれへも変えられ、申請なしで確定した時点で反映される。店舗管理者が行い、管理者のいない店舗ではサービス運営者が代行する。掲載の公開状態・提供状態は変えない。店舗が非公開の間も行える。

### 入出力

- 入力: `Actor`、`PlaceId`、現在の営業状況を読んだときの版、変更後の営業状況
- 出力: 変更後の店舗
- 版が一致し、現在と同じ営業状況なら、書き込みもドメインイベントもなしに、現在の店舗を返す

### 使用するドメインの振る舞い・ポート

- `OperatingStatus.create`、`Place.changeOperatingStatus`
- `RoleRosterRepository.findRolesOf`、`StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.standingOf`、`AccessPolicy.decide`（`manage_target`）
- `PlaceRepository.findById`、`PlaceRepository.save`
- `collectEvents`（`place.operating_status_changed`）

### トランザクション境界

UnitOfWork が必要。

- スコープに含まれる書き込み: 店舗の `save`、`place.operating_status_changed` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`placeRepository`
- ロールバックの条件: 可否の判断、版の不一致、楽観ロックの競合
- 通知（閉店のときの編集担当者への通知）は、ドメインイベントの消費で結果整合にする

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者でない。サービス運営者だが店舗に管理者がいる | `ForbiddenError` |
| 店舗がない | `NotFoundError` |
| 読んだときの版と現在の版が違う（他の人が先に営業状況または店舗情報を保存した）、または保存が楽観ロックで競合した | `ConflictError` |

## suspendPlace

### 概要

サービス運営者が店舗を非公開にする。店舗管理者の有無と営業状況を問わない。店舗情報と営業状況は変わらず、掲載・所属・参加・保存は書き換えない（それらが閲覧できなくなることは、Discovery の `VisibilityPolicy` が店舗の `Suspension` を読んで決める）。重複する店舗の整理は、一方の店舗へのこの操作で行う。

### 入出力

- 入力: `Actor`、`PlaceId`。版を含めない
- 出力: 非公開になった店舗

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- `PlaceRepository.findById`、`Place.suspend`、`PlaceRepository.save`
- `collectEvents`（`place.suspended`）

### トランザクション境界

UnitOfWork が必要。

- スコープに含まれる書き込み: 店舗の `save`、`place.suspended` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`placeRepository`
- ロールバックの条件: 可否の判断、`Place.suspend` の `BusinessRuleError`、楽観ロックの競合
- 店舗管理者と編集担当者への通知は、ドメインイベントの消費で結果整合にする

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない（店舗管理者を含む） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |
| すでに非公開（別のサービス運営者が先に非公開にした） | `BusinessRuleError`（`PLACE_ALREADY_SUSPENDED`） |
| 同時の保存と競合した | `ConflictError` |

## unsuspendPlace

### 概要

サービス運営者が店舗の非公開を解除する。店舗情報と営業状況は、非公開の間に更新された内容のまま現れる。掲載は書き換えず、解除の時点の公開状態に従って閲覧できる。

### 入出力

- 入力: `Actor`、`PlaceId`。版を含めない
- 出力: 非公開を解除した店舗

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- `PlaceRepository.findById`、`Place.unsuspend`、`PlaceRepository.save`
- `collectEvents`（`place.unsuspended`）

### トランザクション境界

UnitOfWork が必要。

- スコープに含まれる書き込み: 店舗の `save`、`place.unsuspended` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`placeRepository`
- ロールバックの条件: 可否の判断、`Place.unsuspend` の `BusinessRuleError`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない（店舗管理者を含む） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |
| 非公開でない（別のサービス運営者が先に解除した） | `BusinessRuleError`（`PLACE_NOT_SUSPENDED`） |
| 同時の保存と競合した | `ConflictError` |

## takeDownPlacePhotos

### 概要

サービス運営者が、取り下げの申立てに基づいて、店舗から選んだ写真を外す（index.md の「申立てに基づく写真の削除」）。外せるのは、未対応の申立ての対象である店舗の写真で、申立人が示した写真に限らない。削除は確定の時点で反映され、申立ての状態は変えない（対応を終える操作は Moderation の別のユースケース）。写真がなくなっても店舗の公開は続く。店舗が非公開の間も行える。

### 入出力

- 入力: `Actor`、申立ての ID（`TakedownClaimId`）、`PlaceId`、削除する写真の `PhotoId`（重複のない1つ以上）。版を含めない
- 出力: 写真を削除した後の店舗（残る写真の並びを含む）

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- 申立ての事実（未対応で、対象がその店舗であること）: Moderation の `TakedownClaimRepository.findById` で申立てを読み、`TakedownClaim.authorizePhotoRemoval`（`owner` は `{ kind: "place", id }`）で確かめる。申立てがなければ `NotFoundError`。不成立は、対応済み（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）を、対象の不一致（`TAKEDOWN_TARGET_MISMATCH`）より先に判定する
- `PlaceRepository.findById`、`Place.takeDownPhotos`、`PlaceRepository.save`
- `collectEvents`（`place.photos_taken_down`、`PhotosReleased`）

### トランザクション境界

UnitOfWork が必要。

- スコープに含まれる書き込み: 店舗の `save`、`place.photos_taken_down` と `PhotosReleased` の保存。申立ては読むだけで書き換えない
- スコープ内で使うリポジトリ: `roleRosterRepository`、`takedownClaimRepository`、`placeRepository`
- ロールバックの条件: 可否の判断、`authorizePhotoRemoval`・`takeDownPhotos` の `BusinessRuleError`、楽観ロックの競合
- 申立てを対応済みにする操作とは別の UnitOfWork で確定する。写真の削除だけが成立して対応を終える操作が成立しなかった場合、写真は削除されたまま、申立ては未対応のまま残る
- 写真の実体の削除（Media）と店舗管理者への通知は、ドメインイベントの消費で結果整合にする

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない | `ForbiddenError` |
| 申立てがない、店舗がない | `NotFoundError` |
| 申立てが対応済み（別のサービス運営者が先に対応を終えた） | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`） |
| 申立ての対象がその店舗でない | `BusinessRuleError`（`TAKEDOWN_TARGET_MISMATCH`） |
| 削除する写真に、店舗の写真でないものがある（先に外された・削除された写真を含む）。1枚も外さない | `BusinessRuleError`（`PLACE_PHOTO_NOT_FOUND`） |
| 同時の保存と競合した | `ConflictError` |
