# Application のユースケース

ドメイン: Application（[../domains/application.md](../domains/application.md)）。申請の前提は `Premise`、新しい申請の提出を受け付ける条件は `SubmissionScope`、判断できる人は `ApproverPolicy` が定める。操作の可否の事実は Authority、閲覧できるかどうかは Discovery の `ReferenceQueries.isViewable`、写真の持ち主の設定と付け替えは Media の `PhotoOwnership`、承認で反映される内容は Place・Listing・Region・Occasion・Authority の集約の振る舞いが定める。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| submitPlaceRegistration（店舗の登録を申請する） | 店舗の情報で登録申請を提出する。管理権限の申請を併せると、2つの申請を提出する | SHP-03、APP-04 / RQ-03 |
| submitPlaceRevision（店舗の情報修正を申請する） | 管理者のいない店舗の、変更する項目と営業状況の変更だけを持つ申請を提出する | SHP-08、APP-04 / RQ-03 |
| submitStewardshipClaim（店舗の管理権限を申請する） | 店舗との関係と、確認に使える連絡先または資料を添えて提出する | SHP-04、APP-04 / RQ-04 |
| submitAffiliationChange（所属・離脱を申請する） | 店舗管理者として、または管理者のいない店舗について個人として、所属または離脱の申請を提出する | REG-01、REG-02、REG-03、APP-04 / RQ-06 |
| submitParticipation（参加を申請する） | 店舗管理者として、掲載と参加日を添えて参加の申請を提出する | EVT-01、APP-04 / RQ-07 |
| submitNewListing（掲載を申請する） | 管理者のいない店舗の、公開条件を満たす掲載の申請を提出する | LST-12、APP-04 / RQ-05 |
| submitListingRevision（掲載の修正を申請する） | 管理者のいない店舗の掲載の、変更する項目だけを持つ申請を提出する | LST-13、APP-04 / RQ-05 |
| previewListingSubmission（申請する掲載の見え方を確かめる） | 提出の前の掲載の内容を、閲覧者に見えるのと同じ形で返す | LST-12、LST-13 / RQ-05、CM-03 |
| checkSubmissionEligibility（申請を始められるか確かめる） | 対象の指定について、提出と同じ受け付ける条件を確かめ、受け付けない理由を返す | SHP-04、SHP-08、LST-12、LST-13、REG-01〜REG-03、EVT-01、APP-04 / RQ-03〜RQ-07、MY-05 |
| resubmitApplication（申請を再提出する） | 差し戻された申請の内容と補足を直して確認中に戻す。前提を欠けば失効にする | APP-02、APP-06 / RQ-03〜RQ-07 |
| withdrawApplication（申請を取り下げる） | 進行中の申請を取り下げる | APP-03、APP-06 / MY-05 |
| listMyApplications（自分の申請を一覧する） | 個人として行った申請と、管理する店舗が行った申請を、提出の新しい順に返す | APP-01、APP-06 / MY-04 |
| listMyActiveApplicationsAboutPlace（店舗について自分が行った進行中の申請を一覧する） | 個人として行った、その店舗に関わる進行中の申請を返す | REG-03 / RQ-06 |
| getMyApplication（申請を確かめる） | 申請者が、1件の申請の内容・補足・状態・結果を読む | APP-01、APP-05、APP-06 / MY-05、RQ-03〜RQ-07 |
| listApplicationsForSubject（対象に関わる申請を一覧する） | 店舗・地域・イベントの管理のために、その対象に関わる申請を、進行中を先に返す | SHP-05、REG-05、REG-08、EVT-07 / SM-01、SM-05、SM-06、RM-01、EM-01 |
| listApplicationsAwaitingReview（対応を待つ申請を一覧する） | サービス運営者が、承認者として判断する申請と、代行できる申請を読む | OPE-01、APP-08 / OM-01 |
| getApplicationForReview（判断する申請を確かめる） | 承認者が、1件の申請の内容と、行える判断を読む | APP-07、APP-08、SHP-09〜SHP-11、LST-14、REG-09、EVT-08 / CM-01 |
| sendBackApplication（申請を差し戻す） | 承認者が、追加で必要な確認を添えて差し戻す | APP-07 / CM-01 |
| rejectApplication（申請を否認する） | 承認者または代行するサービス運営者が、理由を添えて否認する | APP-07、APP-08 / CM-01 |
| approvePlaceRegistration（店舗の登録を承認する） | 店舗を登録して公開する | SHP-09 / CM-01 |
| approvePlaceRevision（店舗の情報修正を承認する） | 申請の項目だけを、店舗の現在の内容に反映する | SHP-11 / CM-01 |
| approveStewardshipClaim（店舗の管理権限を承認する） | 申請者を店舗管理者にする | SHP-10 / CM-01 |
| approveAffiliation（所属を承認する） | 店舗の地域への所属を成立させる | REG-09、REG-13、APP-08 / CM-01 |
| approveLeave（離脱を承認する） | 店舗の地域への所属を解除する | REG-09、REG-13、APP-08 / CM-01 |
| approveParticipation（参加を承認する） | 店舗のイベントへの参加を、申請の掲載と参加日で成立させる | EVT-08、EVT-13、APP-08 / CM-01 |
| approveNewListing（掲載を承認する） | 掲載を公開中の掲載として作る | LST-14 / CM-01 |
| approveListingRevision（掲載の修正を承認する） | 申請の項目だけを、掲載の現在の内容に反映する | LST-14 / CM-01 |
| reassessApplicationPremises（申請の前提を再評価する） | 前提に関わるドメインイベントの消費者。前提を欠く進行中の申請を失効にする | APP-05、SHP-10、REG-09、EVT-01、LST-13、MEM-04 |
| withdrawApplicationsOfWithdrawnAccount（退会した人の申請を取り下げる） | `account.withdrawn` の消費者。個人として行った進行中の申請を取り下げる | ACC-04 |
| notifyOverdueReviews（期間を超えた申請を通知する） | 日次のジョブ。代行できるようになった申請の通知のドメインイベントを出す | APP-08、OPE-01 |

すべてのユースケースに共通すること。

- 画面から呼ぶユースケースは `Actor` を取る（B-18）。ドメインイベントの消費者と日次のジョブは取らない
- 保存された管理体制のない対象は `Stewardship.vacant(target)` として扱う。保存された所属のない店舗は、所属が1つもないものとして扱う
- 今日の暦日は `LocalDate.fromInstant(now)`、`now` は `Clock`
- 判断の設定値（`ReviewPolicy`）は、設定から `ReviewPolicy.create` で作る

前提の事実の読み取り。提出、再提出、承認、再評価、申請を始められるかの確認は、その種類の前提が使う事実（`PremiseFactsOf`）だけを、次のポートから読み、対象の指定とともに `Premise.evaluate` に渡す。

| 事実 | 読み取り |
| --- | --- |
| `placeHasSteward`、`applicantIsSteward` | `StewardshipRepository.findById`（対象は店舗）、`Stewardship.isVacant`、`Stewardship.isSteward` |
| `listing` | `ListingRepository.findById`。掲載がなければ `null`。あれば、掲載が紐づく店舗の `placeHasSteward` |
| `affiliated` | `PlaceAffiliationsRepository.findById`、`PlaceAffiliations.has` |
| `participating` | `ParticipationRepository.findById` |
| `holdingStatus` | `OccasionRepository.findById`、`Occasion.holdingStatus`。イベントがなければ `null` |
| `registration` | `ApplicationRepository.findById`（`target.registrationId`）の状態。`registrationId` が `null` なら `null` |

申請者の立場。個人の申請者は `Actor` の `accountId`（`ActingApplicant` の `individual`、`ApplicationTarget.byIndividual`）。店舗管理者として行う提出と、店舗が行った申請を扱う操作は、`RoleRosterRepository.findRolesOf`、`StewardshipRepository.findById`、`Stewardship.standingOf`、`AccessPolicy.decide`（`act_as_place`）が `allowed` であることを確かめて、`ActingApplicant`（`steward`）と `ApplicationTarget.byPlace` の対象の指定を作る。そうでなければ `ForbiddenError`（サービス運営者の代行はない）。申請を扱う操作は、`Application.isHandledBy` が `false` なら `ForbiddenError`。

提出のユースケース（`submit〜`）に共通すること。

- 提出は、対象の指定（`ApplicationTarget`）を入力から作り、受け付ける条件を確かめ、内容を作り、`Application.submit` で申請を作る、の順に進む。受け付ける条件は内容を使わないので、内容を作るのに要る対象（情報修正の店舗、掲載の修正の掲載、参加のイベント）がない提出は、内容を作る前に、前提または閲覧できない対象として拒まれる
- 受け付ける条件。前提の事実を読んで `Premise.evaluate` し、`SubmissionScope.targets` の対象ごとに `ReferenceQueries.isViewable` を確かめ（存在しない対象は閲覧できない）、枠を持つ種類は `ApplicationSlot.of` の枠を `ApplicationRepository.findActiveBySlot` で読む。この3つを `SubmissionFindings` にして `SubmissionScope.admit` に渡す。枠の一意性は `ApplicationRepository.insert` が担保する
- 冪等な作成。呼び出し側が `ApplicationId` を決めて送る。同じ ID の申請があれば、受け付ける条件を確かめず、内容を作って `Application.matchesSubmission` で比べ、同じ内容なら書き込みもドメインイベントもなしに、保存されている申請を返す。違う内容（内容を作るのに要る対象がなくなっている場合を含む）なら `ConflictError`
- 判定の順は、申請者の立場（`ForbiddenError`）、同じ ID の申請（冪等な作成）、前提、閲覧できない対象、重ねた申請、内容の値、写真の持ち主
- 補足は、入力があれば `ApplicantNote.create`、なければ `null`
- `claimedPhotoIds` の写真を `PhotoAssetRepository.findByIds` で読み、`PhotoOwnership.claimAll`（持ち主は `{ kind: "application"; id }`、`by` は `Actor`）の結果を `PhotoAssetRepository.save` する
- 出力は、確認中になった申請（ID、種類、対象、状態）
- トランザクション境界: UnitOfWork を1つ使う。書き込みは、申請の `insert`、写真の `save`、`application.submitted` の保存。事実の読み取りは、書き込みの前に終える。ロールバック: 申請者の立場・受け付ける条件が成り立たない、内容の値を作れない、写真の持ち主を設定できない、ID または枠の一意性の違反、楽観ロックの競合。申請も写真の持ち主もドメインイベントも残らない
- 共通のエラーケース

| 条件 | 種類 |
| --- | --- |
| 同じ `ApplicationId` で、違う内容の申請がある | `ConflictError` |
| 前提が成り立たない | `BusinessRuleError`（`Premise` の表のコード） |
| `SubmissionScope.targets` の対象が閲覧できない（非公開、公開の取り下げ、削除、存在しない） | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`） |
| 同じ申請者・同じ種類・同じ対象の進行中の申請がある | `BusinessRuleError`（`APPLICATION_ALREADY_ACTIVE`） |
| 同じ枠への同時の提出で、後からコミットした | `ConflictError` |
| 補足が空白だけ | `BusinessRuleError`（`APPLICATION_NOTE_EMPTY`） |
| 添えた写真を登録した人が `Actor` でない、持ち主がすでにある、または写真がない | `BusinessRuleError`（`MEDIA_PHOTO_NOT_REGISTRANT`、`MEDIA_PHOTO_ALREADY_OWNED`、`MEDIA_PHOTO_NOT_AVAILABLE`） |

判断のユースケース（`sendBackApplication`、`rejectApplication`、`approve〜`）に共通すること。

- 判断できる人は、`ApplicationRepository.findById` で読んだ申請について、`Application.approverSeat` の席に応じた事実（`ApproverFacts`）を読んで `ApproverPolicy.decide` に渡して決める。どちらの席も `RoleRosterRepository.findRolesOf` と `AccessPolicy.decide`（`operate_service`）を読む。席が `steward` なら、対象の `StewardshipRepository.findById`、`Stewardship.standingOf`、`AccessPolicy.decide`（`manage_target`）を、席が `operator` なら、併せた登録申請の状態を加える。`notApprover` でなければ、`Application.requireUnderReview` で確認中であることを確かめ、`ApproverPolicy.reviewer` で判断する人を作る
- 申請者が `Actor` と同じアカウントでも、同じ手順で判断できる
- 入力は、`Actor`、`ApplicationId`、承認者が申請を確かめたときの版（`getApplicationForReview` が返す版）を含む。保存されている版と違えば `ConflictError`（確かめた後に、再提出で申請が変わった。再読み込みして判断し直す）
- 判定の順は、申請がない、`notApprover`、申請の状態（`Application.requireUnderReview`）、`awaitingStewards`・`registrationPending`（`ApproverPolicy.reviewer`）、版の比較。確認中でない申請は、サービス運営者が代行できない場合にも、現在の状態のコードで返る
- 共通のエラーケース

| 条件 | 種類 |
| --- | --- |
| 申請がない | `NotFoundError` |
| その申請の承認者でも、代行できるサービス運営者でもない（`notApprover`） | `ForbiddenError` |
| 申請が確認中でない（別の承認者が先に判断した、取り下げられた、失効した、差し戻し中） | `BusinessRuleError`（現在の状態のコード。`APPLICATION_RETURNED`、`APPLICATION_ALREADY_APPROVED`、`APPLICATION_ALREADY_REJECTED`、`APPLICATION_ALREADY_WITHDRAWN`、`APPLICATION_ALREADY_LAPSED`） |
| 運営者がいて、代行できる期間を過ぎていない申請を、サービス運営者が判断する（`awaitingStewards`） | `BusinessRuleError`（`APPLICATION_AWAITING_STEWARDS`） |
| 併せた登録申請が確認中または差し戻しの、管理権限の申請を判断する（`registrationPending`） | `BusinessRuleError`（`APPLICATION_REGISTRATION_PENDING`） |
| 確かめたときの版と、保存されている版が違う（確かめた後に再提出された） | `ConflictError` |
| 同じ申請への同時の操作で、後からコミットした | `ConflictError` |

承認のユースケース（`approve〜`）に共通すること。

- 入力は `Actor`、`ApplicationId`、確かめたときの申請の版。申請の種類がそのユースケースの種類と違えば `NotFoundError`（申請がない場合と同じ扱いで、可否の判定より先）
- 前提の事実を読み直して `Premise.evaluate` し、`Application.reassess` に渡す。失効になれば、申請の `save` と `application.lapsed`・`PhotosReleased` の保存をコミットし、例外を投げずに、失効したことと成り立たない前提を返す。内容は反映しない
- 失効しなければ、反映先の集約の振る舞いを呼び、その `adoptedPhotoIds`（登録と掲載の申請はすべての写真、写真を持たない種類は空）を `Application.approve` に渡す
- 採用した写真は、`PhotoAssetRepository.findByIds` で読み、`PhotoOwnership.transferAll`（`from` は申請、`to` は反映先）の結果を `PhotoAssetRepository.save` する
- 出力は、承認になった申請と `Application.reflectedRef` の反映先。失効した場合は、失効した申請と成り立たない前提
- トランザクション境界: UnitOfWork を1つ使う。書き込みは、申請の `save`、反映先の集約の書き込み、採用した写真の `save`、`application.approved`・反映先の集約が返すドメインイベント・`PhotosReleased` の保存。事実と反映先の集約と写真の読み取りは、書き込みの前に終える。ロールバック: 判断できない、反映先の振る舞いの `BusinessRuleError`、どれかの書き込みの `ConflictError`。申請は確認中のまま残り、反映先も写真も変わらない。反映先でない集約の事実（店舗管理者の有無、イベントの開催の状態、掲載があること）を読んでから書き込むまでの間の変化は防がない
- 対象が運営による非公開、店舗の非公開、一時非公開でも承認できる。反映した内容は、閲覧できるようになるまで閲覧者に表示されない

## submitPlaceRegistration

### 概要

利用者が、新しい店舗の登録を申請する。承認者はサービス運営者。登録申請は前提を持たず、閲覧できなければならない対象も、枠も持たない（同じ店舗への登録申請を重ねて出せる）。店舗の ID を予約し、承認はその ID で店舗を作る。

管理権限の申請を併せると、登録申請を参照する管理権限の申請を、別の申請として同時に提出する。2つの申請はそれぞれ確認中になり、`application.submitted` がそれぞれ出る。併せた申請の対象の指定は、登録申請から `ApplicationTarget.companion` で作る（`placeId` は予約した店舗の ID）。

### 入出力

- 入力: `Actor`、登録申請の `ApplicationId`、店舗の情報（種別、名称、写真の並び、紹介、町域と町域より後の部分、位置、営業時間、連絡先）、補足。併せる場合は、管理権限の申請の `ApplicationId`、店舗との関係、確認に使える連絡先または資料、その補足
- 出力: 確認中になった申請（併せた場合は2件）
- 種別・名称・所在地・位置は必須。写真、紹介、営業時間、連絡先は任意
- 予約する `PlaceId` は `IdGenerator` で決める
- 再送（同じ `ApplicationId` の登録申請が保存されている）では、新しい ID を予約せず、保存されている登録申請から `ApplicationTarget.companion` で併せた申請の対象の指定を作って `Application.matchesSubmission` で比べる。冪等な作成の判定は申請ごとに行い、どちらかが違う内容なら `ConflictError` で、どちらの申請も書き込まれない

### 使用するドメインの振る舞い・ポート

- `AreaCatalog.findTown`、`Town.toAddress`
- `ApplicationTarget.byIndividual`、`ApplicationTarget.companion`
- `PlaceProfile.create`、`StewardshipClaim.create`、`ApplicantNote.create`
- `ApplicationRepository.findById`、`Application.matchesSubmission`
- `Premise.evaluate`、`SubmissionScope.admit`（併せた申請の前提は `applicantNotSteward` と `registrationStanding`。事実は、`applicantIsSteward` が `false`、`registration` が `"underReview"`）
- `Application.submit`（2回）、`ApplicationRepository.insert`
- `PhotoAssetRepository.findByIds`、`save`、`PhotoOwnership.claimAll`
- `collectEvents`（`application.submitted`）
- `IdGenerator`、`Clock`

### トランザクション境界

提出に共通の境界。併せた場合は、2つの申請の `insert` を同じスコープで確定し、どちらかが成立しなければ、どちらの申請も作られない。使うリポジトリは `applicationRepository`、`photoAssetRepository`。

### エラーケース

提出に共通のエラーケースのうち、ID の重複、補足、写真が当たる。加えて次のもの。

| 条件 | 種類 |
| --- | --- |
| 種別・名称・位置を欠く、または値が正しくない | `BusinessRuleError`（`PlaceProfile.create` のコード） |
| 町域を解決できない（`AreaCatalog.findTown` が `null`） | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`） |
| 併せた管理権限の申請で、店舗との関係、または連絡先・資料を欠く | `BusinessRuleError`（`APPLICATION_CLAIM_REQUIRED`） |

## submitPlaceRevision

### 概要

利用者が、管理者のいない店舗の情報の修正と、営業状況の変更を申請する。申請は、店舗の現在の内容と違う項目だけを持つ。営業状況の変更は、情報の修正と併せても、単独でも申請できる。承認者はサービス運営者。前提は、その店舗に店舗管理者がいないこと。申請が持ち主になる写真は、新たに添えた写真だけ。

### 入出力

- 入力: `Actor`、`ApplicationId`、`PlaceId`、修正後の店舗の情報（登録と同じ項目）と営業状況、補足
- 出力: 確認中になった申請

### 使用するドメインの振る舞い・ポート

- `PlaceRepository.findById`
- `AreaCatalog.findTown`、`Town.toAddress`、`PlaceProfile.create`、`PlaceRevision.between`
- 提出に共通の振る舞い・ポート（前提の事実は `placeHasSteward`。閲覧できなければならない対象は店舗）

### トランザクション境界

提出に共通の境界。使うリポジトリは `applicationRepository`、`photoAssetRepository`。`placeRepository`・`stewardshipRepository` は読み取りだけ。

### エラーケース

提出に共通のエラーケースに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| その店舗に店舗管理者がいる | `BusinessRuleError`（`APPLICATION_PLACE_HAS_STEWARD`） |
| 現在の内容から何も変えていない | `BusinessRuleError`（`PLACE_REVISION_EMPTY`） |
| 名称・位置を空にする修正 | `BusinessRuleError`（`PlaceProfile.create` のコード） |
| 町域を解決できない（`AreaCatalog.findTown` が `null`） | `BusinessRuleError`（`AREA_TOWN_NOT_FOUND`） |
| 店舗がない | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`） |

## submitStewardshipClaim

### 概要

利用者が、店舗の管理権限を申請する。店舗管理者がいる店舗にも、いない店舗にも申請できる。代理登録された店舗を店舗本人が引き継ぐ場合も同じ。承認者はサービス運営者。前提は、申請者がその店舗の店舗管理者でないこと。ファイルを添えない。

登録申請に併せた申請が取り下げ・否認・失効になった後の再申請は、同じ登録申請を参照する新しい申請になる。この場合、前提に「登録申請が承認されずに終わっていないこと」が加わり、閲覧できなければならない対象はない。

### 入出力

- 入力: `Actor`、`ApplicationId`、対象（`PlaceId`、または併せた申請の再申請では参照する登録申請の `ApplicationId`）、店舗との関係、確認に使える連絡先または資料、補足
- 出力: 確認中になった申請
- 登録申請を参照するときは、対象の指定を `ApplicationTarget.companion` で作る。対象の店舗は、その登録申請の予約した `reservedPlaceId` に決まる

### 使用するドメインの振る舞い・ポート

- `ApplicationTarget.byIndividual`、または `ApplicationRepository.findById`（参照する登録申請）と `ApplicationTarget.companion`
- `StewardshipClaim.create`
- 提出に共通の振る舞い・ポート（前提の事実は `applicantIsSteward` と、参照する登録申請の状態）

### トランザクション境界

提出に共通の境界。使うリポジトリは `applicationRepository`。

### エラーケース

提出に共通のエラーケースに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| 店舗との関係、または連絡先・資料を欠く | `BusinessRuleError`（`APPLICATION_CLAIM_REQUIRED`） |
| すでにその店舗の店舗管理者である | `BusinessRuleError`（`APPLICATION_ALREADY_STEWARD`） |
| 参照する登録申請が、否認または取り下げになっている | `BusinessRuleError`（`APPLICATION_REGISTRATION_NOT_STANDING`） |
| 参照する登録申請がない、登録申請でない、または他の人の登録申請である（`ApplicationTarget.companion` が `null`） | `NotFoundError` |

## submitAffiliationChange

### 概要

店舗の地域への所属、または地域からの離脱を申請する。地域ごとに独立した申請になる。承認者は対象の地域の運営者で、運営者が不在の地域ではサービス運営者。承認されるまで、所属は変わらない。

店舗管理者は、管理する店舗について店舗管理者として申請する（申請者は店舗）。利用者は、管理者のいない店舗について個人として申請する。店舗管理者として行う離脱の申請は、公開を取り下げた地域・運営による非公開の地域についても提出できる。

### 入出力

- 入力: `Actor`、`ApplicationId`、申請の種類（所属または離脱）、申請者の立場（店舗管理者として、または個人として）、`PlaceId`、`RegionId`、補足
- 出力: 確認中になった申請

### 使用するドメインの振る舞い・ポート

- 申請者の立場（店舗管理者として行う場合）
- 提出に共通の振る舞い・ポート（前提の事実は `placeHasSteward` と `affiliated`。閲覧できなければならない対象は `SubmissionScope` の表のとおり）

### トランザクション境界

提出に共通の境界。使うリポジトリは `applicationRepository`。`roleRosterRepository`・`stewardshipRepository`・`placeAffiliationsRepository` は読み取りだけ。

### エラーケース

提出に共通のエラーケースに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| 店舗管理者として申請する店舗の管理権限がない（申請の途中で失った場合を含む） | `ForbiddenError` |
| 個人として申請する店舗に、店舗管理者がいる | `BusinessRuleError`（`APPLICATION_PLACE_HAS_STEWARD`） |
| 所属の申請で、すでにその地域に所属中 | `BusinessRuleError`（`APPLICATION_ALREADY_AFFILIATED`） |
| 離脱の申請で、その所属がない（除外、または別の離脱の申請の承認で解除されている） | `BusinessRuleError`（`APPLICATION_NOT_AFFILIATED`） |

## submitParticipation

### 概要

店舗管理者が、管理する店舗のイベントへの参加を、店舗管理者として申請する。イベントで提供する掲載と参加日を添えられ、どちらも複数添えられ、添えずに申請できる。承認者は対象のイベントの運営者で、運営者が不在のイベントではサービス運営者。前提は、その店舗に店舗管理者がいること、イベントが開催前または開催中であること、その店舗の参加がまだないこと。個人としては申請できない。

### 入出力

- 入力: `Actor`、`ApplicationId`、`PlaceId`、`OccasionId`、添える掲載の `ListingId` の並び、参加日の並び、補足
- 出力: 確認中になった申請
- 添える掲載は、その店舗の添えられる掲載（`Listing.attachableIds`）に限る。参加日は開催期間内に限る

### 使用するドメインの振る舞い・ポート

- 申請者の立場（店舗管理者として）
- `OccasionRepository.findById`（開催期間の事実。受け付ける条件が成り立てば、イベントはある）
- `ListingRepository.findByIds`、`Listing.attachableIds`（`attachableListingIds`。添えられる掲載の規則は、Listing のこの関数だけが持つ）
- `ParticipationDetails.create`（`current` は `null`）
- 提出に共通の振る舞い・ポート（前提の事実は `placeHasSteward`、`holdingStatus`、`participating`。閲覧できなければならない対象はイベント）

### トランザクション境界

提出に共通の境界。使うリポジトリは `applicationRepository`。`occasionRepository`・`listingRepository`・`participationRepository` は読み取りだけ。

### エラーケース

提出に共通のエラーケースに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| その店舗の管理権限がない（申請の途中で失った場合を含む） | `ForbiddenError` |
| イベントが終了または中止している | `BusinessRuleError`（`APPLICATION_OCCASION_NOT_OPEN`） |
| その店舗がすでに参加中 | `BusinessRuleError`（`APPLICATION_ALREADY_PARTICIPATING`） |
| 開催期間の外の日付を参加日にした | `BusinessRuleError`（`PARTICIPATION_DATE_OUT_OF_PERIOD`） |
| 添える掲載が、その店舗の公開中で提供中または提供開始前の掲載でない | `BusinessRuleError`（`LISTING_NOT_ATTACHABLE`） |

## submitNewListing

### 概要

利用者が、管理者のいない店舗の新しい掲載を申請する。内容は公開条件（写真・名称・カテゴリー）を満たす。再申請も、写真を新しく登録して添える（前の申請の写真は、申請が終わったときに手放されている）。価格とキャッチコピーを持たない。承認者はサービス運営者。前提は、その店舗に店舗管理者がいないこと。掲載の ID を予約し、承認はその ID で掲載を作る。枠を持たず、同じ店舗に重ねて申請できる。添えた写真のすべてが、申請が持ち主の写真になる。承認されても、申請者は掲載の管理権限を得ない。

### 入出力

- 入力: `Actor`、`ApplicationId`、`PlaceId`、掲載の内容（写真の並びと見せる範囲、名称、説明、カテゴリー、提供の設定）、補足
- 出力: 確認中になった申請
- 予約する `ListingId` は `IdGenerator` で決める
- カテゴリーは現役のカテゴリーに限る

### 使用するドメインの振る舞い・ポート

- `ListingContent.create`、`ListingContent.toPublishable`
- `CategoryCatalogRepository.find`、`CategoryCatalog.requireActive`
- 提出に共通の振る舞い・ポート（前提の事実は `placeHasSteward`。閲覧できなければならない対象は店舗）
- `IdGenerator`

### トランザクション境界

提出に共通の境界。使うリポジトリは `applicationRepository`、`photoAssetRepository`。

### エラーケース

提出に共通のエラーケースのうち、重ねた申請を除くものに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| その店舗に店舗管理者がいる | `BusinessRuleError`（`APPLICATION_PLACE_HAS_STEWARD`） |
| 写真・名称・カテゴリーのいずれかを欠く | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`） |
| カテゴリーが現役でない | `BusinessRuleError`（`LISTING_CATEGORY_NOT_AVAILABLE`） |

## submitListingRevision

### 概要

利用者が、管理者のいない店舗の公開された掲載の修正を申請する。申請は、掲載の現在の内容と違う項目（名称、説明、カテゴリー、写真、提供の設定）だけを持つ。承認者はサービス運営者。前提は、その店舗に店舗管理者がいないことと、対象の掲載があること。申請が持ち主になる写真は、新たに添えた写真だけ。

### 入出力

- 入力: `Actor`、`ApplicationId`、`ListingId`、修正後の掲載の内容、補足
- 出力: 確認中になった申請
- 対象の指定は `ListingId` だけを持つ。掲載が紐づく店舗（申請の `placeId`）は、読んだ掲載から決まる

### 使用するドメインの振る舞い・ポート

- `ListingRepository.findById`
- `ListingContent.create`、`ListingContent.toPublishable`、`ListingPatch.between`
- `CategoryCatalogRepository.find`、`CategoryCatalog.requireActive`（カテゴリーを変える場合）
- 提出に共通の振る舞い・ポート（前提の事実は `listing`。閲覧できなければならない対象は掲載）

### トランザクション境界

提出に共通の境界。使うリポジトリは `applicationRepository`、`photoAssetRepository`。`listingRepository` は読み取りだけ。

### エラーケース

提出に共通のエラーケースに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| 掲載が削除されている | `BusinessRuleError`（`APPLICATION_LISTING_NOT_FOUND`） |
| 掲載が一時非公開・運営による非公開になっている、または店舗が非公開になっている | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`） |
| その店舗に店舗管理者がいる | `BusinessRuleError`（`APPLICATION_PLACE_HAS_STEWARD`） |
| 現在の内容から何も変えていない | `BusinessRuleError`（`LISTING_PATCH_EMPTY`） |
| 修正後の内容が公開条件を欠く（写真をすべて外した、名称を空にした） | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`） |

## previewListingSubmission

### 概要

掲載の申請と掲載の修正の申請の提出の前に、入力中の内容（修正の申請は修正後の内容）を、閲覧者向けの掲載の要約と掲載詳細と同じ形で返す。店舗名と地域名は、対象の店舗の情報から引く。価格とキャッチコピーを含まない。公開条件を欠く内容も投影する。何も書き込まず、申請は作られない。公開の操作に当たる結果を返さない。

### 入出力

- 入力: `Actor`、`PlaceId`、入力中の掲載の内容（写真の並びと見せる範囲、名称、説明、カテゴリー、提供の設定）
- 出力: 写真の並びと見せる範囲と表示用の参照（1枚目が代表写真）、名称、店舗名、閲覧者に示す地域の名称、現役に解決したカテゴリー、説明、提供の設定と提供状態
- 対象は、申請者本人の入力だけ。保存された申請と掲載を読まない

### 使用するドメインの振る舞い・ポート

- `ReferenceQueries.isViewable`（店舗）
- `ListingContent.create`
- `PlaceRepository.findById`、`PlaceAffiliationsRepository.findById`、`RegionRepository.findByIds`
- `ViewProjection.previewListing`
- `CategoryCatalogRepository.find`、`CategoryCatalog.resolve`
- `PhotoStorage.displayRefs`
- `LocalDate.fromInstant`、`Clock`

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗が閲覧できない（非公開、存在しない） | `NotFoundError` |

## checkSubmissionEligibility

### 概要

申請の入力を始める前と、再申請を始める前に、その対象の指定の申請を受け付けるかどうかを確かめる。入力から提出と同じ `ApplicationTarget` を作り、提出と同じ `SubmissionFindings` を読んで、例外を投げずに、受け付けない理由のすべてを返す。何も書き込まない。提出の時点の確認は、提出のユースケースが行う。

### 入出力

- 入力: `Actor`、申請の種類、申請者の立場、対象（種類に応じて `PlaceId`、`RegionId`、`OccasionId`、`ListingId`、参照する登録申請の `ApplicationId`）
- 出力: 受け付けるかどうか（`SubmissionScope.accepts`）。受け付けない場合は、成り立たない前提（`PremiseKey`）、閲覧できない対象、重ねている進行中の申請の ID。管理権限の申請では、店舗管理者の有無を併せて返す
- 登録申請は、常に受け付ける

### 使用するドメインの振る舞い・ポート

- 申請者の立場、`ApplicationTarget.byIndividual`・`byPlace`・`companion`
- 前提の事実の読み取り、`Premise.evaluate`
- `SubmissionScope.targets`、`ReferenceQueries.isViewable`
- `ApplicationSlot.of`、`ApplicationRepository.findActiveBySlot`
- `SubmissionScope.accepts`
- `StewardshipRepository.findById`、`Stewardship.isVacant`（管理権限の申請の案内）

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 店舗管理者として申請する店舗の管理権限がない | `ForbiddenError` |
| 参照する登録申請がない、登録申請でない、または他の人の登録申請である | `NotFoundError` |

## resubmitApplication

### 概要

申請者が、差し戻された申請の内容と補足を直して、確認中に戻す。種類によらず1つのユースケースが担う。入力は対象の指定を持たず、対象の指定と予約した ID は変わらない。所属・離脱の申請は、補足だけを直す。内容は、提出と同じ関数で作る（情報修正と掲載の修正は、対象の現在の内容と比べて作り直す）。再提出で新たに添えた写真は申請が持ち主になり、外した写真は `PhotosReleased` で手放す。`application.resubmitted` が出る。確認中になった日時が変わるので、代行の期間は数え直しになる。

再提出は前提を確かめる。前提を欠けば、申請を失効にしてコミットし、例外を投げずに、失効したことと成り立たない前提を返す。対象が閲覧できるかどうかは確かめない。

店舗が行った申請は、その店舗のどの店舗管理者も再提出できる。

### 入出力

- 入力: `Actor`、`ApplicationId`、確かめたときの申請の版、直した内容（種類ごとに、提出と同じ入力。対象の指定を除く）、補足
- 出力: 確認中に戻った申請。失効した場合は、失効した申請と成り立たない前提

### 使用するドメインの振る舞い・ポート

- `ApplicationRepository.findById`、`save`
- 申請者の立場、`Application.isHandledBy`、`Application.requireReturned`
- 内容の値を作る関数（`PlaceProfile.create`・`PlaceRevision.between`、`StewardshipClaim.create`、`ParticipationDetails.create`、`ListingContent.toPublishable`、`ListingPatch.between`、`CategoryCatalog.requireActive`）と、そのための読み取り（`PlaceRepository.findById`、`ListingRepository.findById`・`findByIds`、`OccasionRepository.findById`、`CategoryCatalogRepository.find`、`AreaCatalog.findTown`）
- 前提の事実の読み取り、`Premise.evaluate`、`Application.reassess`
- `Application.resubmit`、`ApplicantNote.create`
- `PhotoAssetRepository.findByIds`、`save`、`PhotoOwnership.claimAll`
- `collectEvents`（`application.resubmitted`、`photos.released`、失効では `application.lapsed`）

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 申請の `save`、新たに添えた写真の `save`、ドメインイベントの保存。失効の場合は、申請の `save`（`reassess`）と `application.lapsed`・`PhotosReleased` の保存だけ
- リポジトリ: `applicationRepository`、`photoAssetRepository`。ほかは読み取りだけ
- 判定の順は、申請がない、申請を扱えない、申請の状態、版の比較、前提（失効）、内容の値。前提を欠く申請は、直した内容を確かめずに失効にする（削除された掲載の修正の申請は、内容を作れない）
- ロールバック: 申請を扱えない、差し戻しでない、版の不一致、内容の値を作れない、写真の持ち主を設定できない、楽観ロックの競合。申請は差し戻しのまま残る

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 申請がない、または直した内容の種類が申請の種類と違う | `NotFoundError` |
| その申請を扱えない（他の利用者の申請、管理権限を失った店舗の申請） | `ForbiddenError` |
| 申請が差し戻しでない（すでに再提出された、取り下げ・失効・判断済み） | `BusinessRuleError`（現在の状態のコード。`APPLICATION_UNDER_REVIEW`、`APPLICATION_ALREADY_LAPSED` など） |
| 差し戻しの間に、同じ店舗の別の店舗管理者が先に操作した（確かめたときの版と違う）、または同時の保存 | `ConflictError` |
| 直した内容が、その申請の必須の内容を欠く | `BusinessRuleError`（提出と同じコード） |

## withdrawApplication

### 概要

申請者が、確認中または差し戻しの申請を取り下げる。取り下げは元に戻せない。申請の内容は反映されず、申請が持ち主の写真はすべて `PhotosReleased` で手放す。`application.withdrawn` が出る。

登録申請を取り下げると、併せた管理権限の申請は `reassessApplicationPremises` が失効にする（別の UnitOfWork）。併せた管理権限の申請だけを取り下げても、登録申請は変わらない。店舗が行った申請は、その店舗のどの店舗管理者も取り下げられる。

### 入出力

- 入力: `Actor`、`ApplicationId`、確かめたときの申請の版
- 出力: 取り下げになった申請

### 使用するドメインの振る舞い・ポート

- `ApplicationRepository.findById`、`save`
- 申請者の立場、`Application.isHandledBy`、`Application.requireActive`
- `Application.withdraw`
- `collectEvents`（`application.withdrawn`、`photos.released`）

### トランザクション境界

UnitOfWork を1つ使う。

- 書き込み: 申請の `save`、ドメインイベントの保存
- リポジトリ: `applicationRepository`。`roleRosterRepository`・`stewardshipRepository` は読み取りだけ
- 判定の順は、申請がない、申請を扱えない、申請の状態、版の比較
- ロールバック: 申請を扱えない、進行中でない、版の不一致、楽観ロックの競合。申請は変わらない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 申請がない | `NotFoundError` |
| その申請を扱えない | `ForbiddenError` |
| 取り下げる前に、承認者が承認・否認した、申請が失効した、または別の店舗管理者が取り下げた | `BusinessRuleError`（現在の状態のコード） |
| 進行中の申請を、同じ店舗の別の店舗管理者が先に再提出した（確かめたときの版と違う）、または同時の保存 | `ConflictError` |

## listMyApplications

### 概要

`Actor` が個人として行った申請と、`Actor` が今管理する店舗が店舗管理者として行った申請を、状態を問わず、1つの一覧で返す。同じ店舗の別の店舗管理者が出した申請を含む。管理権限を手放した店舗、解除された店舗が行った申請は含まない。登録申請に併せた管理権限の申請は、別の申請として並ぶ。1つの店舗に絞ると、その店舗が行った申請だけを返す。

### 入出力

- 入力: `Actor`、絞り込む `PlaceId`（任意）、`Pagination`
- 出力: 申請の一覧（種類、対象とその名称、申請者、状態、提出の日時）と、条件に合う全件数。提出の新しい順、同順位は ID の昇順。申請がなければ空の一覧

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findPageBySteward`（すべてのページを読み、対象が店舗のものを使う）
- `ApplicationRepository.findPageByApplicants`（`places` は管理する店舗のすべてで、件数に上限を持たない。1つの店舗に絞るときは `individual` を `null`、`places` をその店舗だけにする）
- `Application.subjects`、対象の名称の読み取り（`PlaceRepository.findByIds`、`RegionRepository.findByIds`、`OccasionRepository.findByIds`、`ListingRepository.findByIds`。1ページの申請の対象は、種類ごとに100件以内）。存在しない対象（承認の前の予約した ID の店舗、削除された対象）は、名称を添えずに返す

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 絞り込む店舗の管理権限を持たない | `ForbiddenError` |

## listMyActiveApplicationsAboutPlace

### 概要

`Actor` が個人として行った、その店舗に関わる進行中の申請（確認中と差し戻し）を返す。管理者のいない店舗について、個人がすでに申請している対象（所属・離脱の申請の地域など）を、重ねて申請する前に確かめるために使う。他の利用者の申請と、店舗が店舗管理者として行った申請は返さない（店舗が行った進行中の申請は `listApplicationsForSubject` が返す）。終わった申請は返さない。

### 入出力

- 入力: `Actor`、`PlaceId`
- 出力: 申請の一覧（ID、種類、対象、状態）。ID の昇順。なければ空の一覧

### 使用するドメインの振る舞い・ポート

- `ApplicationRepository.findActiveBySubject`（`place`）
- `Application.isHandledBy`（`ActingApplicant` の `individual`。`true` の申請だけを返す）

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

要件が振る舞いを定めるエラーはない。店舗がない場合は空の一覧を返す。

## getMyApplication

### 概要

申請者が、1件の申請を確かめる。状態に応じて、差し戻しは承認者が求める追加の確認、否認は理由、失効は成り立たなくなった前提、承認は反映先を返す。情報修正と掲載の修正の申請は、変更する項目だけを、対象の現在の値と申請の値を並べて返し、対象の現在の内容に申請の項目を重ねた内容を併せて返す。登録申請と、併せた管理権限の申請は、互いの ID を返す。

否認・取り下げ・失効の申請は、申請が手放して削除された写真（`Application.releasedPhotoIds`）を、内容にも、見比べにも、重ねた内容にも含めずに返す。再提出は、差し戻しの申請のこの出力の内容（修正の申請は重ねた内容）と補足から始める。再申請は、終わった申請のこの出力の内容と補足から始めるので、前の申請の写真を引き継がず、申請者は写真を登録し直す。

反映先が閲覧できなくなっていても、申請の結果は返す。店舗が行った申請は、その店舗のどの店舗管理者にも同じ内容を返す。

### 入出力

- 入力: `Actor`、`ApplicationId`
- 出力: 申請の種類、対象、申請者（店舗が行った申請は店舗）、内容、補足、状態と結果、版、修正の申請の見比べと重ねた内容、併せた申請または参照する登録申請の ID、承認された申請の `Application.reflectedRef`。写真は、`Application.releasedPhotoIds` を除いて表示用の参照を、カテゴリーは現役に解決したものを返す

### 使用するドメインの振る舞い・ポート

- `ApplicationRepository.findById`
- 申請者の立場、`Application.isHandledBy`
- `PlaceRepository.findById`、`PlaceRevision.compare`、`PlaceRevision.preview`（情報修正）
- `ListingRepository.findById`、`ListingPatch.compare`、`ListingPatch.preview`（掲載の修正）
- `Application.releasedPhotoIds`
- `ApplicationRepository.findPageBySubject`（`registration`。登録申請から併せた申請をたどる）
- `Application.reflectedRef`
- `CategoryCatalogRepository.find`、`CategoryCatalog.resolve`
- `PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 申請がない | `NotFoundError` |
| 他の利用者の申請、または管理権限を失った店舗の申請 | `ForbiddenError`（申請の内容を返さない） |

## listApplicationsForSubject

### 概要

対象を管理する人が、その対象に関わる申請を読む。地域は所属・離脱の申請、イベントは参加の申請を、状態を問わず返す。サービス運営者が代行で判断した申請は、判断する人の立場（`capacity`）で分かる。店舗は、その店舗が店舗管理者として行った進行中の申請（所属・離脱・参加）を返し、店舗と地域・イベントの「申請中」の関係の表示に使う。

### 入出力

- 入力: `Actor`、対象（店舗・地域・イベントのどれか）、`Pagination`
- 出力: 申請の一覧（種類、対象の店舗、申請者、状態、判断した人の立場、参加の申請は添えた掲載と参加日）と全件数。進行中の申請を先に、次に提出の新しい順、同順位は ID の昇順。地域とイベントは、確認中の申請の件数を併せて返す

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`StewardshipRepository.findById`、`Stewardship.standingOf`、`AccessPolicy.decide`（地域・イベントは `manage_target`。運営者が不在の地域・イベントでのサービス運営者の代行を含む。店舗は `act_as_place`。代行はない）
- `ApplicationRepository.findPageBySubject`（地域は `kinds` が所属・離脱、イベントは参加、店舗は `applicant` が `"place"` で `statuses` が確認中・差し戻し）
- `ApplicationReviewDesk.findPageAwaiting`（`region`・`occasion`。確認中の件数）
- `PlaceRepository.findByIds`（店舗の名称）

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| その対象を管理できない | `ForbiddenError` |

## listApplicationsAwaitingReview

### 概要

サービス運営者が、対応を待つ確認中の申請を、2つの区分で読む。承認者として判断する申請（サービス運営者が承認者の5種、併せた管理権限の申請、運営者が不在の地域・イベントへの申請）と、代行できる申請（運営者のいる地域・イベントへの申請で、確認中になってから `ReviewPolicy` の期間を過ぎたもの）。2つの区分は重ならない。差し戻し中の申請と終わった申請は現れない。

### 入出力

- 入力: `Actor`、区分（承認者として、または代行できる）、`Pagination`
- 出力: 申請の一覧（種類、対象、申請者、確認中になった日時）と、その区分の全件数。確認中になった日時の古い順、同順位は ID の昇順。1件もなければ空の一覧

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`（`operate_service`）
- `ApplicationReviewDesk.findPageAwaiting`（`service` の `asApprover`、または `proxyable`。`pendingSinceOrBefore` は `now - policy.proxyAfterMs`）
- `Application.subjects`、対象の名称の読み取り

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない | `ForbiddenError` |

## getApplicationForReview

### 概要

判断する人が、1件の申請を確かめる。申請の内容・補足・状態と、再提出された申請が答えている前の差し戻しの追加で必要な確認、行える判断（承認者、代行、代行できない、登録の判断待ち）を返す。確認中でない申請は、現在の状態と、判断した人の立場を返す。対象が閲覧できない（運営による非公開、店舗の非公開など）場合は、そのことを併せて返す。

種類ごとに、判断に要る事実を返す。登録申請は、併せた管理権限の申請の有無と、名称・所在地が近い既存の店舗（非公開の店舗を含む）。管理権限の申請は、既存の店舗管理者の有無と、併せた登録申請。情報修正と掲載の修正は、変更する項目ごとの、読んだ時点の対象の現在の値と申請の値。内容のカテゴリーは、現役に解決したものを返す。否認・取り下げ・失効の申請は、申請が手放して削除された写真（`Application.releasedPhotoIds`）を含めずに返す。

### 入出力

- 入力: `Actor`、`ApplicationId`
- 出力: 申請の種類、対象、申請者、内容、補足、状態、版、前の差し戻しの追加で必要な確認、`ReviewPermission`、対象が閲覧できるかどうか、種類ごとの事実。版は、差し戻し・否認・承認の要求に含める

### 使用するドメインの振る舞い・ポート

- `ApplicationRepository.findById`
- 判断できる人の決め方（`ApproverPolicy.decide`）
- `ReferenceQueries.isViewable`（`Application.subjects` の店舗・掲載・地域・イベント）
- 登録: `PlaceMatchCriteria.create`（`includeSuspended: true`）、`PlaceRepository.match`、`ApplicationRepository.findPageBySubject`（`registration`）
- 管理権限: `StewardshipRepository.findById`、`Stewardship.isVacant`
- 情報修正: `PlaceRepository.findById`、`PlaceRevision.compare`
- 掲載の修正: `ListingRepository.findById`、`ListingPatch.compare`
- 参加: `ListingRepository.findByIds`（添えた掲載）
- `CategoryCatalogRepository.find`、`CategoryCatalog.resolve`
- `Application.releasedPhotoIds`、`PhotoStorage.displayRefs`

### トランザクション境界

UnitOfWork は不要。読み取りだけ。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 申請がない | `NotFoundError` |
| その申請の承認者でも、サービス運営者でもない（`notApprover`） | `ForbiddenError` |

`awaitingStewards` と `registrationPending` は、エラーにせず `ReviewPermission` として返す。

## sendBackApplication

### 概要

承認者が、確認中の申請を、追加で必要な確認を添えて差し戻す。申請は差し戻しになり、申請者の再提出を待つ。`application.returned` が出る。代行するサービス運営者は差し戻せない。種類によらず1つのユースケースが担う。

### 入出力

- 入力: `Actor`、`ApplicationId`、確かめたときの申請の版、追加で必要な確認（必須）
- 出力: 差し戻しになった申請

### 使用するドメインの振る舞い・ポート

- 判断に共通の振る舞い・ポート
- `ReturnRequest.create`、`Application.sendBack`
- `ApplicationRepository.save`
- `collectEvents`（`application.returned`）

### トランザクション境界

UnitOfWork を1つ使う。書き込みは、申請の `save` と `application.returned` の保存。リポジトリは `applicationRepository`（`roleRosterRepository`・`stewardshipRepository` は読み取りだけ）。ロールバック: 判断に共通のエラー、追加で必要な確認がない、代行。申請は確認中のまま残る。

### エラーケース

判断に共通のエラーケースに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| 追加で必要な確認を添えていない | `BusinessRuleError`（`APPLICATION_RETURN_REQUEST_REQUIRED`） |
| 代行するサービス運営者が差し戻す | `BusinessRuleError`（`APPLICATION_PROXY_CANNOT_RETURN`） |

## rejectApplication

### 概要

承認者、または代行するサービス運営者が、確認中の申請を、理由を添えて否認する。内容は反映されず、申請が持ち主の写真はすべて `PhotosReleased` で手放す。`application.rejected` が出る。否認は変えられない。登録申請を否認すると、併せた管理権限の申請は `reassessApplicationPremises` が失効にする（別の UnitOfWork）。種類によらず1つのユースケースが担う。

### 入出力

- 入力: `Actor`、`ApplicationId`、確かめたときの申請の版、否認の理由（必須）
- 出力: 否認になった申請（判断した人の立場を含む）

### 使用するドメインの振る舞い・ポート

- 判断に共通の振る舞い・ポート
- `RejectionReason.create`、`Application.reject`
- `ApplicationRepository.save`
- `collectEvents`（`application.rejected`、`photos.released`）

### トランザクション境界

UnitOfWork を1つ使う。書き込みは、申請の `save` とドメインイベントの保存。リポジトリは `applicationRepository`。ロールバック: 判断に共通のエラー、理由がない。申請は確認中のまま残る。

### エラーケース

判断に共通のエラーケースに加えて、次のもの。

| 条件 | 種類 |
| --- | --- |
| 理由を添えていない | `BusinessRuleError`（`APPLICATION_REJECTION_REASON_REQUIRED`） |

## approvePlaceRegistration

### 概要

サービス運営者が登録申請を承認する。予約した `reservedPlaceId` で店舗を作る。店舗は、管理者や掲載がなくても、営業中の公開された店舗になる。申請者に管理権限は付かない。申請の写真はすべて店舗に採用され、持ち主が申請から店舗に付け替わる。併せた管理権限の申請は確認中のまま残り、この承認の後に判断できるようになる。既存の店舗との重複は、承認者が照合して判断する（重複していれば否認する）。

### 入出力

承認に共通の入出力。出力に、併せた管理権限の申請の ID（あれば）を添える。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提はなく、失効しない）
- `Place.register`（ID は予約した `reservedPlaceId`）、`PlaceRepository.insert`
- `PhotoOwnership.transferAll`（`to` は店舗）
- `Application.approve`、`ApplicationRepository.save`、`findPageBySubject`（`registration`）
- `collectEvents`（`application.approved`）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、店舗の `insert`、写真の `save`。リポジトリは `applicationRepository`、`placeRepository`、`photoAssetRepository`。

### エラーケース

判断に共通のエラーケース。

## approvePlaceRevision

### 概要

サービス運営者が情報修正の申請を承認する。申請の項目だけを、店舗のその時点の内容に反映する。ほかの項目は現在の内容のまま残る。営業状況が変われば `place.operating_status_changed` が出る。申請が新たに添えた写真のうち採用されたものは、持ち主が店舗に付け替わる。置き換えで外れた店舗の写真と、採用されなかった申請の写真は `PhotosReleased` で手放す。前提（その店舗に店舗管理者がいない）を欠けば失効にする。

### 入出力

承認に共通の入出力。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提の事実は `placeHasSteward`）
- `PlaceRepository.findById`、`Place.applyRevision`、`PlaceRepository.save`
- `PhotoOwnership.transferAll`（`adoptedPhotoIds`。`to` は店舗）
- `Application.approve`、`ApplicationRepository.save`
- `collectEvents`（`application.approved`、`place.operating_status_changed`、`photos.released`）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、店舗の `save`、写真の `save`。リポジトリは `applicationRepository`、`placeRepository`、`photoAssetRepository`。店舗の楽観ロックが競合すれば、申請は確認中のまま残る。

### エラーケース

判断に共通のエラーケース。前提を欠く場合は、エラーにせず失効を返す。

## approveStewardshipClaim

### 概要

サービス運営者が管理権限の申請を承認する。申請者はその店舗の店舗管理者になり、その店舗のすべての掲載が管理下に入る。既存の店舗管理者がいる店舗では、同じ操作範囲の店舗管理者が加わる。非公開の店舗でも承認できる。`authority.steward_appointed`（`via: "application"`）が出て、管理者のいなかった店舗では、個人がその店舗に行った進行中の申請を `reassessApplicationPremises` が失効にする。

併せた申請は、登録申請が承認された後にだけ判断できる。前提（申請者が店舗管理者でない、併せた登録申請が承認されずに終わっていない）を欠けば失効にする。

### 入出力

承認に共通の入出力。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提の事実は `applicantIsSteward` と `registration`）
- `StewardshipRepository.findById`、`Stewardship.vacant`、`Stewardship.appointByApproval`、`StewardshipRepository.insert` または `save`
- `AccountRepository.findById`（申請者のアカウント。退会していれば `null`）、`Application.requireApplicantAccount`（結果が `appointee`）、`Account.markReferenced`、`AccountRepository.save`（就任と退会を、アカウントの版で直列にする）
- `Application.approve`、`ApplicationRepository.save`
- `collectEvents`（`application.approved`、`authority.steward_appointed`）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、管理体制の `insert` または `save`、申請者のアカウントの `save`（`Account.markReferenced`）。リポジトリは `applicationRepository`、`stewardshipRepository`、`accountRepository`。招待の承諾との同時の就任は、管理体制の楽観ロックと `ALREADY_STEWARD` が守る。申請者の同時の退会は、アカウントの楽観ロックが守り、後からコミットした側が `ConflictError` になる。

### エラーケース

判断に共通のエラーケース（`APPLICATION_REGISTRATION_PENDING` を含む）に加えて、次のもの。前提を欠く場合は、エラーにせず失効を返す。

| 条件 | 種類 |
| --- | --- |
| 申請者のアカウントが退会している（`account.withdrawn` の消費による取り下げがまだ届いていない） | `BusinessRuleError`（`APPLICATION_APPLICANT_WITHDRAWN`）。申請は確認中のまま残り、管理体制は変わらない |

## approveAffiliation

### 概要

対象の地域の運営者、運営者が不在の地域のサービス運営者、または代行するサービス運営者が、所属の申請を承認する。店舗とその地域の所属が成立し、`region.affiliation_established` が出る。すでに所属がある店舗の選んだ代表地域は変わらない。店舗の他の地域への所属と、店舗・掲載の公開状態・提供状態は変わらない。同じ店舗とこの地域への他の所属の申請は、`reassessApplicationPremises` が失効にする。

### 入出力

承認に共通の入出力。出力の申請は、判断した人の立場（承認者または代行）を含む。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提の事実は、申請者の種類に応じた `placeHasSteward` と、`affiliated`）
- `PlaceAffiliationsRepository.findById`、`PlaceAffiliations.empty`、`PlaceAffiliations.affiliate`、`PlaceAffiliationsRepository.insert` または `save`
- `Application.approve`、`ApplicationRepository.save`
- `collectEvents`（`application.approved`、`region.affiliation_established`）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、`PlaceAffiliations` の `insert` または `save`。リポジトリは `applicationRepository`、`placeAffiliationsRepository`。同じ店舗の所属の同時の変更は、`PlaceAffiliations` の楽観ロックと `ALREADY_AFFILIATED` が守る。

### エラーケース

判断に共通のエラーケース（`APPLICATION_AWAITING_STEWARDS` を含む）。前提を欠く場合は、エラーにせず失効を返す。

## approveLeave

### 概要

所属の承認と同じ人が、離脱の申請を承認する。店舗とその地域の所属が解除され、`region.affiliation_dissolved`（`cause: "left"`）が出る。解除した地域が選んだ代表地域なら、代表地域は残る所属のうち最初に所属した地域になる。同じ所属への他の離脱の申請は、`reassessApplicationPremises` が失効にする。公開を取り下げた地域・運営による非公開の地域からの離脱も承認できる。

### 入出力

承認に共通の入出力。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提の事実は、申請者の種類に応じた `placeHasSteward` と、`affiliated`）
- `PlaceAffiliationsRepository.findById`、`PlaceAffiliations.leave`、`PlaceAffiliationsRepository.save`
- `Application.approve`、`ApplicationRepository.save`
- `collectEvents`（`application.approved`、`region.affiliation_dissolved`）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、`PlaceAffiliations` の `save`。リポジトリは `applicationRepository`、`placeAffiliationsRepository`。除外との同時の解除は、`PlaceAffiliations` の楽観ロックと `NOT_AFFILIATED` が守る。

### エラーケース

判断に共通のエラーケース。前提を欠く場合は、エラーにせず失効を返す。

## approveParticipation

### 概要

対象のイベントの運営者、運営者が不在のイベントのサービス運営者、または代行するサービス運営者が、参加の申請を承認する。申請の掲載と参加日で参加が成立し、`occasion.participation_established` が出る。店舗と掲載の公開状態・提供状態は変わらない。前提（その店舗に店舗管理者がいる、イベントが開催前または開催中、その店舗の参加がまだない）を欠けば失効にする。

### 入出力

承認に共通の入出力。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提の事実は `placeHasSteward`、`holdingStatus`、`participating`）
- `Participation.establish`（`details` は申請の内容）、`ParticipationRepository.insert`
- `Application.approve`、`ApplicationRepository.save`
- `collectEvents`（`application.approved`、`occasion.participation_established`）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、`Participation` の `insert`。リポジトリは `applicationRepository`、`participationRepository`。直接の追加との同時の成立は、`Participation` の `insert` の一意性が守り、後からコミットした側が `ConflictError` になる。

### エラーケース

判断に共通のエラーケース。前提を欠く場合は、エラーにせず失効を返す。

## approveNewListing

### 概要

サービス運営者が掲載の申請を承認する。予約した `reservedListingId` で、公開中の掲載を作る。内容のカテゴリーが廃止されていれば、現役のカテゴリーに置き換える。掲載はサービス運営者の管理下に入り、申請者は管理権限を得ない。申請の写真はすべて掲載に採用され、持ち主が掲載に付け替わる。店舗が非公開でも承認でき、掲載は非公開の解除まで閲覧者に表示されない。前提（その店舗に店舗管理者がいない）を欠けば失効にする。

### 入出力

承認に共通の入出力。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提の事実は `placeHasSteward`）
- `CategoryCatalogRepository.find`、`Listing.createPublished`（ID は予約した `reservedListingId`）、`ListingRepository.insert`
- `PhotoOwnership.transferAll`（`to` は掲載）
- `Application.approve`、`ApplicationRepository.save`
- `collectEvents`（`application.approved`。`Listing.createPublished` はドメインイベントを出さず、申請の写真はすべて採用されるので `photos.released` も出ない）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、掲載の `insert`、写真の `save`。リポジトリは `applicationRepository`、`listingRepository`、`photoAssetRepository`。

### エラーケース

判断に共通のエラーケース。前提を欠く場合は、エラーにせず失効を返す。

## approveListingRevision

### 概要

サービス運営者が掲載の修正の申請を承認する。申請の項目だけを、掲載のその時点の内容に反映する。変更していない項目は、承認の時点の掲載の内容のまま。掲載の公開状態と運営による非公開を問わず反映する。申請の写真の項目は、提出の後に掲載から外された写真を除いて反映する（`ListingPatch.preview`）。申請が新たに添えた写真のうち採用されたものは、持ち主が掲載に付け替わる。前提（その店舗に店舗管理者がいない、対象の掲載がある）を欠けば失効にする。

### 入出力

承認に共通の入出力。

### 使用するドメインの振る舞い・ポート

- 判断・承認に共通の振る舞い・ポート（前提の事実は `listing`）
- `ListingRepository.findById`、`CategoryCatalogRepository.find`、`Listing.applyPatch`、`ListingRepository.save`
- `PhotoOwnership.transferAll`（`adoptedPhotoIds`。`to` は掲載）
- `Application.approve`、`ApplicationRepository.save`
- `collectEvents`（`application.approved`、`photos.released`）

### トランザクション境界

承認に共通の境界。書き込みは、申請の `save`、掲載の `save`、写真の `save`。リポジトリは `applicationRepository`、`listingRepository`、`photoAssetRepository`。

### エラーケース

判断に共通のエラーケースに加えて、次のもの。前提を欠く場合は、エラーにせず失効を返す。

| 条件 | 種類 |
| --- | --- |
| 申請の写真の項目の写真が、1枚も反映できない | `BusinessRuleError`（`LISTING_PATCH_PHOTOS_UNAVAILABLE`）。申請は確認中のまま残る |

## reassessApplicationPremises

### 概要

前提に関わるドメインイベントの消費者。ドメインイベントから関わる対象（`ApplicationSubject`）を決め、その対象に関わる進行中の申請（確認中と差し戻し）を読み、申請ごとに、消費の時点の事実を読み直して前提を確かめる。前提を欠く申請を失効にし、`application.lapsed` と `PhotosReleased` を出す。前提が成り立つ申請は書き込まない。失効した申請は、前提が再び成り立っても戻らない。対象の運営による非公開・店舗の非公開は、前提に含まれない。

| ドメインイベント | 関わる対象 |
| --- | --- |
| `authority.steward_appointed`、`authority.stewardship_vacated`（対象が店舗のとき） | その店舗 |
| `region.affiliation_established`、`region.affiliation_dissolved`、`occasion.participation_established` | その店舗 |
| `occasion.cancelled`、`occasion.ended` | そのイベント |
| `listing.deleted` | その掲載 |
| `application.rejected`、`application.withdrawn` | `applicationId` の申請が登録申請なら、その登録申請 |

冪等。ペイロードの値ではなく消費の時点の事実で判定し、終わった申請は `findActiveBySubject` に現れないので、配送の順序と重複に影響されない。1件の `save` が楽観ロックで競合しても、他の申請の処理は確定する。競合した申請が残れば、消費を失敗として終え、ドメインイベントの再配送が処理する。

### 入出力

- 入力: 上の表のドメインイベント
- 出力: なし
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `ApplicationRepository.findById`（`application.rejected`・`application.withdrawn`）、`findActiveBySubject`、`save`
- 前提の事実の読み取り、`Premise.evaluate`、`Application.reassess`
- `collectEvents`（`application.lapsed`、`photos.released`）

### トランザクション境界

申請1件ごとに UnitOfWork を1つ使う。

- 書き込み: 申請の `save`、`application.lapsed` と `PhotosReleased` の保存
- リポジトリ: `applicationRepository`。ほかは読み取りだけ
- 途中で失敗した場合に残る状態: 失効を終えた申請は確定している。残りの申請は進行中のまま残り、再配送が処理する。その間も、提出・再提出・承認は同じ前提を確かめるので、前提を欠く申請は承認されない

### エラーケース

要件が振る舞いを定めるエラーはない。

## withdrawApplicationsOfWithdrawnAccount

### 概要

`account.withdrawn` の消費者。退会した人が個人として行った進行中の申請を、すべて取り下げにする。申請ごとに `application.withdrawn`（承認者に通知される）と `PhotosReleased` が出る。店舗管理者として行った申請は取り下げない（他の店舗管理者がいる間は続き、最後の店舗管理者の退会では `reassessApplicationPremises` が失効にする）。取り下げた登録申請に併せた管理権限の申請も、同じ人の個人の申請として取り下げになる。

冪等。取り下げた申請は `findActiveByIndividual` に現れない。1件の `save` が競合しても、他の申請の取り下げは確定し、残りは再配送が処理する。

### 入出力

- 入力: `account.withdrawn`
- 出力: なし
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `ApplicationRepository.findActiveByIndividual`、`save`
- `Application.withdraw`
- `collectEvents`（`application.withdrawn`、`photos.released`）

### トランザクション境界

申請1件ごとに UnitOfWork を1つ使う。書き込みは、申請の `save` とドメインイベントの保存。リポジトリは `applicationRepository`。途中で失敗した場合、取り下げを終えた申請は確定し、残りは進行中のまま残って再配送が処理する。

### エラーケース

要件が振る舞いを定めるエラーはない。

## notifyOverdueReviews

### 概要

日次のジョブ。入力はスケジュール。運営者のいる地域・イベントへの確認中の申請のうち、確認中になってから `ReviewPolicy` の期間を過ぎ、その確認中についてまだ通知していない申請ごとに、通知した記録を更新して `application.review_overdue` を出す。申請は書き込まず、申請の版を進めない。再提出で確認中に戻った申請は、期間を過ぎるともう一度通知される。

冪等。記録の更新とドメインイベントの保存を、申請1件ごとに1つの UnitOfWork で確定する。記録した申請は `findPageDue` の結果から外れるので、同じ日に何度実行しても、1回の確認中について出るドメインイベントは1つ。先頭のページを、結果が空になるまで読み直して進める。1件の失敗は他の申請の処理を妨げない。読んだページの全件が失敗したら打ち切り、残りは次の実行が続ける。

### 入出力

- 入力: なし（スケジュール）
- 出力: なし
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `OverdueNoticeLedger.findPageDue`（`pendingSinceOrBefore` は `now - policy.proxyAfterMs`。`page: 1` を読み直す）、`record`
- `OverdueReviewWatch.detect`
- `collectEvents`（`application.review_overdue`）
- `ReviewPolicy.create`、`Clock`

### トランザクション境界

申請1件ごとに UnitOfWork を1つ使う。

- 書き込み: `OverdueNoticeLedger.record`、`application.review_overdue` の保存。申請は書き込まない
- リポジトリ: `overdueNoticeLedger`
- ロールバック: その申請の書き込みの失敗。記録もドメインイベントも残らず、次の実行が同じ申請を取り出す

### エラーケース

要件が振る舞いを定めるエラーはない。
