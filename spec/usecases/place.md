# Place のユースケース

ドメイン: Place（[../domains/place.md](../domains/place.md)）。操作の可否は Authority の `AccessPolicy`、写真の持ち主の設定は Media の `PhotoOwnership`、写真のない店舗の写真の代用は Discovery の `ViewProjection.substituteCover`、キーワードの一致と関連度は共有カーネルの `KeywordRelevance` が定める。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| matchPlaces（既存店舗を確認する） | 店名・住所で、非公開でない店舗を探し、関連度の高い順に返す | SHP-02 / RQ-01 |
| matchPlacesForOperation（サービス運営者が店名・住所で店舗を探す） | サービス運営者が、店名・住所で、非公開の店舗を含めて店舗を探し、関連度の高い順に返す | SHP-09、SHP-12、SHP-13、LST-15、LST-16、MEM-01、MOD-08、MOD-09 / CM-01、OM-02 |
| listStewardedPlaces（管理する店舗の一覧を読む） | 操作する人が管理権限を持つ店舗を、名称と状態とともに読む | SHP-05、REG-01、EVT-01 / SM-01、RQ-05、RQ-06 |
| getManagedPlace（管理する店舗を読む） | 管理のために、またはサービス運営者が状態と管理者の有無を確かめるために、`PlaceId` で選んだ店舗の情報・営業状況・非公開かどうか・申立てで写真が削除されたこと・管理者の有無・所属中の地域の名称を読む | SHP-05、SHP-06、SHP-07、SHP-13、LST-01、LST-15、LST-16、MOD-08、MOD-09 / SM-01、SM-02、SM-04（新規）、OM-03 |
| registerPlaceByProxy（店舗を代理登録する） | サービス運営者が、公開条件を満たす情報で店舗を登録する | SHP-12 / SM-02 |
| updatePlaceProfile（店舗情報を更新する） | 店舗管理者、または管理者のいない店舗でサービス運営者が、店舗情報を申請なしで置き換える | SHP-06、SHP-13、MOD-06 / SM-02 |
| changeOperatingStatus（営業状況を変更する） | 店舗管理者、または管理者のいない店舗でサービス運営者が、営業中・休業・閉店のどれかに変える | SHP-07、SHP-13、MOD-06 / SM-02 |
| suspendPlace（店舗を非公開にする） | サービス運営者が店舗を非公開にする。重複する店舗の整理でも使う | MOD-08、MOD-09 / OM-03 |
| unsuspendPlace（店舗の非公開を解除する） | サービス運営者が店舗の非公開を解除する | MOD-08、MOD-09 / OM-03 |

登録申請の承認による店舗の登録（SHP-09）と、情報修正の申請の承認による反映（SHP-11）は Application のユースケースで、`Place.register`・`Place.applyRevision` を呼ぶ。申立てに基づく店舗の写真の削除（MOD-02）は Moderation の `takeDownPhotosByClaim` で、`Place.takeDownPhotos` を呼ぶ。

ユースケースに共通すること。

- 所在地は、利用者が選んだ町域（`TownRef`）と、町域より後の部分（`rest`）で受け取る。UnitOfWork を始める前に `AreaCatalog.findTown` で町域を解決し、`Town.toAddress` で `Address` を作る。`findTown` が `null` を返せば `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`）にする
- 集約のリポジトリ（`placeRepository`、`roleRosterRepository`、`stewardshipRepository`、`photoAssetRepository`）は `UnitOfWorkContext` から得る。書き込みを持つユースケースは、可否の判断に使う読み取りと `PlaceRepository.findById` を、書き込みと同じ `run` の中で、書き込みの前に終える。読み取りだけのユースケースは `run` を1つ使い、書き込まずに返す
- UnitOfWork に参加しないポート（`AreaCatalog`、Discovery の `ReferenceQueries`、`PhotoStorage`）はコンテナから得て、`run` の外で呼ぶ
- 保存された管理体制のない店舗は `Stewardship.vacant(target)` として扱う
- `AccessPolicy.decide` が `allowed: false` なら `ForbiddenError`。エラーケースの表は、可否の条件を再掲せず、`AccessPolicy` の拒否と操作の種類だけを書く
- 店舗情報の更新と営業状況の変更は、読んだときの版を要求に含める。非公開と非公開の解除は版を含めず、前提の変化を `BusinessRuleError` で返し、同時の書き込みは `save` の楽観ロックで守る（index.md の「編集の競合」）

## matchPlaces

### 概要

店名・住所から、非公開でない既存の店舗を探す。登録申請の前の既存店舗の確認に使う。ログインせずに行える。一致と関連度は `PlaceMatching` が定め、営業状況では絞り込まない（休業・閉店の店舗も結果に含まれる）。

### 入出力

- 入力: 店名、住所（どちらか一方でよい）、ページング。`Actor` を取らない
- 出力: 一致した店舗の一覧（`PlaceRepository.match` の並び）と、条件に合う全件数。店舗ごとに、店舗を見分ける情報（名称・所在地・代表写真）と営業状況を返す。非公開の店舗と、管理者の有無は返さない
- 写真のない店舗には、Discovery の `ReferenceQueries.resolve` が返す `PlaceEntry.substituteCover` を添える。`substituteCover` が `null` の店舗は、写真なしで返す（P-43）。代用の規則はこのユースケースに持たない
- 一致する店舗がなければ、空の一覧と件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `PlaceMatchCriteria.create`（`includeSuspended: false`）
- `PlaceRepository.match`
- 写真の代用: 結果のページに写真のない店舗があるとき、その店舗の `{ kind: "place", id }` を `ReferenceQueries.resolve` に渡す（1ページは100件以下）
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork を1つ使い、`PlaceRepository.match` を読んで、書き込まずに返す。`ReferenceQueries.resolve` と `PhotoStorage.displayRefs` は、その後に `run` の外で呼ぶ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店名も住所も空（空白だけを含む） | `BusinessRuleError`（`PLACE_INVALID_MATCH_CRITERIA`） |

## matchPlacesForOperation

### 概要

サービス運営者が、店名・住所で、非公開の店舗を含めて店舗を探す。サービス運営者が店舗を探す操作はすべてこの読み取りを使う（`scenario/index.md`「探し方」の名称・所在地で探す）。登録申請の照合でサービス運営者が自分でも確かめる操作、代理登録の前に登録する店舗が非公開の店舗を含めて存在しないことを確かめる操作、管理者のいない店舗の更新、掲載の代理作成と管理、管理メンバーの確認、運営による非公開のために店舗を開く操作に当たる。一致と関連度は `PlaceMatching` が定め、営業状況では絞り込まない。

`matchPlaces` との違いは、非公開の店舗を含めること、サービス運営者だけが行うこと、店舗ごとに非公開かどうかと管理者の有無を返すこと、写真を代用しないこと。

### 入出力

- 入力: `Actor`、店名、住所（どちらか一方でよい）、ページング
- 出力: 一致した店舗の一覧（`PlaceRepository.match` の並び）と、条件に合う全件数。店舗ごとに、店舗を見分ける情報（名称・所在地・代表写真）、営業状況、非公開かどうか、管理者がいるかどうかを返す。写真のない店舗は写真なしで返す
- 一致する店舗がなければ、空の一覧と件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- `PlaceMatchCriteria.create`（`includeSuspended: true`）
- `PlaceRepository.match`
- `StewardshipRepository.findByTargets`（一致した店舗があるとき。結果にない店舗は管理者不在）、`Stewardship.isVacant`、`Place.isSuspended`
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork を1つ使い、可否の判断、`PlaceRepository.match`、`StewardshipRepository.findByTargets` を読んで、書き込まずに返す。`PhotoStorage.displayRefs` は `run` の外で呼ぶ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 店名も住所も空（空白だけを含む） | `BusinessRuleError`（`PLACE_INVALID_MATCH_CRITERIA`） |

## listStewardedPlaces

### 概要

操作する人が管理権限を持つ店舗を読む。店舗の管理を始めるときの店舗の選択に使う。非公開の店舗も含める。

### 入出力

- 入力: `Actor`
- 出力: 管理する店舗の一覧（`PlaceId` の昇順）。店舗ごとに、店舗を見分ける情報（名称・代表写真）、営業状況、非公開かどうかを返す。管理する店舗がなければ空の一覧
- 管理する店舗の ID は、`StewardshipRepository.findPageBySteward` のすべてのページを読んだ結果のうち、対象が店舗のもの。`PlaceRepository.findByIds` には100件ごとに分けて渡し、結果を `PlaceId` の昇順に並べて返す

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findPageBySteward`（すべてのページを読む）
- `PlaceRepository.findByIds`
- `Place.isSuspended`
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork を1つ使い、`StewardshipRepository.findPageBySteward` と `PlaceRepository.findByIds` を読んで、書き込まずに返す。`PhotoStorage.displayRefs` は `run` の外で呼ぶ。

### エラーケース

要件・シナリオが振る舞いを定めるエラーはない。管理する店舗がないことは、空の一覧で表す。

## getManagedPlace

### 概要

`PlaceId` で選んだ1つの店舗を、非公開かどうかにかかわらず読む。読めるかどうかは `inspect_target`（対象を開いて状態と管理者の有無を確かめる読み取り。index.md の「操作の可否」）で確かめる。店舗管理者と、サービス運営者が読める。サービス運営者は、管理者の有無にかかわらず店舗を開いて、状態と管理者の有無を確かめられる。代行できるのは管理者のいない店舗だけで、その区別を `manage_target` の結果で返す。掲載の作成を始めるとき（SM-04 の新規）は、この読み取りが、紐づく店舗と、店舗情報から引いた所在地・所属地域を返す。

### 入出力

- 入力: `Actor`、`PlaceId`
- 出力: 店舗1件を、店舗情報と営業状況、非公開かどうか、申立てで写真が削除されたこと（写真の並びの `takenDown`。写真の `PhotoId` の並びが変わるまで）、所属中の地域の名称（最初に所属した順）、管理者がいるかどうか、操作する人が店舗を管理できるかどうかとその立場（`manage_target` の `AccessDecision`）とともに返す
- 所属地域の読み取りは、Region が入る段階から加わり、それまでの所属地域は空（[../domains/index.md](../domains/index.md)「開発の順序との対応」）

### 使用するドメインの振る舞い・ポート

- `PlaceRepository.findById`
- `StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.standingOf`、`Stewardship.isVacant`
- `RoleRosterRepository.findRolesOf`
- `AccessPolicy.decide`（`{ kind: "inspect_target"; standing }`。`allowed: false` なら `ForbiddenError`）。結果に含める管理できるかどうかとその立場は `AccessPolicy.decide`（`{ kind: "manage_target"; standing }`）の `AccessDecision`
- `Place.isSuspended`
- `PlaceAffiliationsRepository.findById`（なければ所属なし）、`RegionRepository.findByIds`（所属中の地域の名称）
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork を1つ使い、店舗、管理体制、役割、所属、地域を読んで、書き込まずに返す。`PhotoStorage.displayRefs` は `run` の外で呼ぶ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`inspect_target`） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |

## registerPlaceByProxy

### 概要

サービス運営者が、申請なしで店舗を登録する。登録した店舗は、管理者のいない店舗として、営業中・非公開でない状態で公開される。管理体制は作らない。冪等な作成で、呼び出し側が `PlaceId` を決めて送る。既存の店舗との重複は機械的に拒まない（重複の確認は、登録の前の照合の結果を見たサービス運営者が行う）。

### 入出力

- 入力: `Actor`、`PlaceId`、名称、写真の `PhotoId` の並び、紹介、町域（`TownRef`）と町域より後の部分、位置、営業時間、連絡先。名称・所在地・位置は必須で、写真・紹介・営業時間・連絡先は任意
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
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 名称が空、写真の `PhotoId` が重なる | `BusinessRuleError`（`PLACE_INVALID_NAME`、`PLACE_DUPLICATE_PHOTO`） |
| 町域を解決できない（`AreaCatalog.findTown` が `null`。所在地が決まらない） | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`） |
| 写真が存在しない・破棄されている、操作する人が登録した写真でない、すでに持ち主がある | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`） |
| 同じ `PlaceId` で内容の違う店舗がある | `ConflictError` |

## updatePlaceProfile

### 概要

店舗情報を、申請なしで入力の内容に置き換える。店舗管理者が行い、管理者のいない店舗ではサービス運営者が代行する。保存した時点で公開内容に反映され、所在地を変えると店舗のエリアも新しい所在地で決まる。営業状況は変えない。店舗が非公開の間も行える。

### 入出力

- 入力: `Actor`、`PlaceId`、編集を始めたときの版、店舗情報の全体（名称、写真の `PhotoId` の並び、紹介、町域と町域より後の部分、位置、営業時間、連絡先）
- 写真の並びは、残す写真と新しく加える写真を、表示する順に持つ。新しく加える写真は、操作する人が先に登録した写真。並びから外れた写真は店舗から外れる
- 出力: 更新後の店舗
- 内容が現在と変わらなければ、書き込みもドメインイベントもなしに、現在の店舗を返す

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.findTown`、`Town.toAddress`
- `PlaceProfile.create`、`Place.updateProfile`
- `RoleRosterRepository.findRolesOf`、`StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.standingOf`、`AccessPolicy.decide`（`manage_target`）
- `PlaceRepository.findById`、`PlaceRepository.save`
- 新しく加える写真があるとき: `PhotoAssetRepository.findByIds`、`PhotoOwnership.claimAll`（`photoIds` は新しく加わった写真だけ）、`PhotoAssetRepository.save`
- `collectEvents`（`photos.released`）

### トランザクション境界

UnitOfWork が必要。

- スコープに含まれる書き込み: 店舗の `save`、新しく加えた写真の持ち主の設定、`photos.released` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`placeRepository`、`photoAssetRepository`
- ロールバックの条件: 可否の判断、版の不一致、`claimAll` の `BusinessRuleError`、店舗または写真の楽観ロックの競合。ロールバックでは、店舗情報も持ち主の設定もドメインイベントも残らない
- 外れた写真の実体の削除は、`photos.released` の消費（Media）で結果整合にする

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |
| 編集を始めたときの版と現在の版が違う（他の人が先に保存した）、または保存が楽観ロックで競合した | `ConflictError` |
| 名称が空、写真の `PhotoId` が重なる | `BusinessRuleError`（`PLACE_INVALID_NAME`、`PLACE_DUPLICATE_PHOTO`） |
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
- 通知は、ドメインイベントの消費で結果整合にする

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`manage_target`） | `ForbiddenError` |
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
- 通知は、ドメインイベントの消費で結果整合にする

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
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
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 店舗がない | `NotFoundError` |
| 非公開でない（別のサービス運営者が先に解除した） | `BusinessRuleError`（`PLACE_NOT_SUSPENDED`） |
| 同時の保存と競合した | `ConflictError` |
