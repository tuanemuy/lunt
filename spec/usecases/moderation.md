# Moderation のユースケース

ドメイン: Moderation（[../domains/moderation.md](../domains/moderation.md)）。取り下げの申立てと、情報の誤り・閉店の連絡の、受け付けから対応済みまでを実現する。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `submitTakedownClaim` | ログインなしで、取り下げの申立てを受け付ける | MOD-01 / RQ-07 |
| `listOpenTakedownClaims` | サービス運営者に、未対応の申立てを対応を待ち始めた日時の古い順で返す | OPE-01 / OM-01 |
| `getTakedownClaim` | サービス運営者に、申立て1件と、対象の現在の状態と写真を返す | MOD-02 / OM-04 |
| `takeDownPhotosByClaim` | サービス運営者が、申立てに基づいて、対象から写真を削除する | MOD-02 / OM-04 |
| `resolveTakedownClaim` | サービス運営者が、結果を添えて申立ての対応を終える | MOD-02 / OM-04 |
| `submitInfoReport` | ログインした利用者の、情報の誤り・閉店の連絡を受け付ける | MOD-04 / RQ-08 |
| `listUnresolvedInfoReports` | サービス運営者に、未対応と確認依頼中の連絡を対応を待ち始めた日時の古い順で返す | OPE-01 / OM-01 |
| `getInfoReport` | サービス運営者に、連絡1件と、対象の店舗の店舗管理者の有無を返す | MOD-05 / OM-05 |
| `requestInfoReportConfirmation` | サービス運営者が、店舗管理者に確認を依頼し、連絡を確認依頼中にする | MOD-05 / OM-05 |
| `resolveInfoReport` | サービス運営者が、連絡の対応を終える | MOD-05 / OM-05 |
| `listConfirmationRequestsForPlace` | 店舗管理者に、その店舗の確認依頼中の依頼を返す | MOD-06 / SM-01 |
| `getConfirmationRequest` | 店舗管理者に、確認の依頼1件を返す | MOD-06 / SM-07 |

申立て・連絡への措置のうち、掲載の運営による非公開と店舗の非公開（申立てへの措置の非公開は掲載と店舗だけ）、管理者の権限の解除、店舗と掲載の更新は、対象のドメインと Authority のユースケースが持つ。申立てに基づく写真の削除は `takeDownPhotosByClaim` が、対象のドメインの集約の振る舞いを呼んで行う。申立人への結果のメールは、`takedown_claim.resolved` を消費する Notification の `sendTakedownOutcome` が送る。

## 共通の扱い

- サービス運営者の確認: `roleRosterRepository.findRolesOf` で操作する人の役割を読み、`AccessPolicy.decide` に `{ kind: "operate_service" }` を渡す。`allowed: false` なら `ForbiddenError`
- 店舗管理者の確認: `stewardshipRepository.findById` で対象の店舗の管理体制を読み（なければ `Stewardship.vacant`）、`Stewardship.standingOf` の結果と、`roleRosterRepository.findRolesOf` の役割を、`AccessPolicy.decide` に `{ kind: "act_as_place", standing }` として渡す。`allowed: false` なら `ForbiddenError`
- 店舗管理者の有無: `stewardshipRepository.findByTargets` に対象の店舗を渡す。結果に管理体制がないか、`Stewardship.isVacant` なら、店舗管理者はいない
- 対象が閲覧できるかどうか: 定義と、求める経路は index.md の「閲覧できる対象」による。対象の集約を読まない申立ての提出と、申立て・連絡の詳細は、Discovery の `ReferenceQueries.isViewable` に対象（`ContentRef`）を渡す。対象の集約を読む連絡の提出は、読んだ集約に Discovery の `VisibilityPolicy` を当てる（`submitInfoReport`）。削除された対象と存在しない対象は、閲覧できない対象になる
- 対象の名称、対象があるかどうか、対象の現在の写真: `ContentDirectory.describe` に対象を渡す。閲覧できない対象も返る。一覧は、読んだページの対象をまとめて渡し、100件を超えるときは分けて呼ぶ。結果にない対象は、削除された対象として、名称なしで返す。掲載が対象の連絡は、掲載と `target.placeId` の店舗の両方を渡し、掲載の名称と店舗の名称を添える
- 連絡した人のメールアドレス: `accountRepository.findByIds` に、連絡の `reporter` を渡す。結果にない人は、退会した人として、メールアドレスなしで返す
- UnitOfWork の使い方は index.md の「UnitOfWork ポート」による。集約のリポジトリ（`roleRosterRepository`、`stewardshipRepository`、`accountRepository`、`takedownClaimRepository`、`infoReportRepository`、`listingRepository`、`placeRepository`、`regionRepository`、`occasionRepository`、`articleRepository`）は `run` の中で読み、読み取りだけのユースケースも `run` を1つ使って書き込まずに返す。UnitOfWork に参加しない読み取り専用のポート（`ReferenceQueries`、`ContentDirectory`、Media の `PhotoStorage`）は `run` の外で呼ぶ。各節の「トランザクション境界」は、`run` の中で読むリポジトリと、`run` の外で呼ぶポートを挙げる
- 状態を変える要求（対応を終える、確認の依頼）は、版を含めない。すでにその状態であること（別のサービス運営者が先に対応を終えた、先に確認を依頼した）は、前提の変化として状態の `BusinessRuleError` で返し、現在の状態を示す。同時の要求は `save` の楽観ロックで `ConflictError` になる
- 申立て・連絡の ID を受け取るユースケースは、`findById` が `null` を返せば `NotFoundError` にする。各ユースケースの節に重ねて書かない

## submitTakedownClaim

### 概要

店舗本人または写真の権利者の、取り下げの申立てを受け付ける。ログインを求めない。受け付けた申立ては未対応になり、サービス運営者への通知は `takedown_claim.submitted` を消費する Notification が届ける。申立人に受け付けのメールは送らない。

同じ ID の申立てがすでにあれば、`TakedownClaim.submit` を呼ばずに `TakedownClaim.sameSubmission` で判定する。同じ内容なら書き込みもドメインイベントもなしに成功とし、違う内容なら `ConflictError` にする。

### 入出力

- 入力: 申立ての ID（要求する側が決める）、立場、対象（`ContentRef`）、削除を求める写真の `PhotoId` の並び、理由、メールアドレス。`Actor` を取らない
- 立場・対象・写真の組、理由、メールアドレスの規則は、値オブジェクトが確かめる
- 出力: 受け付けたこと。申立ての状況を確かめる手段は返さない

### 使用するドメインの振る舞い・ポート

- `takedownClaimRepository.findById`、`TakedownClaim.sameSubmission`
- `ReferenceQueries.isViewable`（Discovery）。`false` なら `TakedownTargetFacts` は `{ viewable: false }` で、`ContentDirectory.describe` を呼ばない
- `ContentDirectory.describe`（閲覧できる対象の現在の写真を `TakedownTargetFacts.photoIds` に渡す。結果に対象がなければ空）
- `TakedownClaim.submit`
- `takedownClaimRepository.insert`、`collectEvents`（`takedown_claim.submitted`）
- `Clock`

### トランザクション境界

- `run` の前に `ReferenceQueries.isViewable` と、閲覧できる対象について `ContentDirectory.describe` を呼ぶ
- `run` を1つ使う
- `run` に含まれる書き込みは、申立ての `insert` と `takedown_claim.submitted` の保存
- `run` の中で使うリポジトリは `takedownClaimRepository`
- ドメインの振る舞いが `BusinessRuleError` を投げたとき、同じ ID で違う内容の申立てがあったとき、`insert` が `ConflictError` になったときにロールバックし、申立てもドメインイベントも残らない
- 対象の集約は書き換えない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 写真の権利者が写真を示していない。店舗本人が掲載・店舗のほかを対象にした。店舗本人が写真を示した | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_GROUND`） |
| 理由が空。メールアドレスの形式が正しくない | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_REASON`、`COMMON_INVALID_EMAIL_ADDRESS`） |
| 提出の時点で、対象が閲覧できない（非公開、公開の取り下げ、一時非公開、削除、存在しない対象） | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`） |
| 示した写真が、対象の現在の写真にない（入力の間に対象から外された写真を含む） | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET`）。含まれない写真を示す |
| 同じ ID で、違う内容の申立てがある | `ConflictError` |

`BusinessRuleError` の判定の順は `TakedownClaim.submit` が定める（上の表の順）。

## listOpenTakedownClaims

### 概要

サービス運営者の対応を待つ、未対応の申立てを返す。対応済みの申立ては含まない。

### 入出力

- 入力: `Actor`、`Pagination`
- 出力: 未対応の申立ての並び（それぞれの立場、対象とその名称、申立人のメールアドレス）と、未対応の全件数。並び順は受け付けた日時の古い順。削除された対象の申立ては、名称なしで返す

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `takedownClaimRepository.findOpen`
- 対象の名称（共通の扱い。`ContentDirectory.describe`）

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `roleRosterRepository`、`takedownClaimRepository` を読む
- `ContentDirectory.describe` は `run` の外で呼ぶ

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |

## getTakedownClaim

### 概要

申立て1件の内容と、対象の現在の状態と写真を返す。未対応の申立ても対応済みの申立ても返す。対象の現在の写真のうち、申立人が示した写真がどれかが分かる形で返す。対象の写真は、閲覧できない対象のものも返す（運営による非公開の間の対象の写真も削除できるため）。

### 入出力

- 入力: `Actor`、申立ての ID
- 出力: 申立て（立場、状態。対応済みなら結果）、対象の名称、対象の現在の状態（対象があるかどうか、閲覧できるかどうか。読みものは公開状態（下書き・公開中・公開の取り下げと、取り下げの理由）も。読みものの公開状態は `articleRepository.findById` で読む）、対象の現在の写真のうちどれが申立人の示した写真か。対象がなければ写真は空。示された写真のうち対象の現在の写真にないものは、削除済みとして分かる

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `takedownClaimRepository.findById`
- 対象の名称・有無・現在の写真（共通の扱い。`ContentDirectory.describe`）
- `ReferenceQueries.isViewable`（Discovery。対象が閲覧できるかどうか）
- `PhotoStorage.displayRefs`（Media。対象の現在の写真の表示用の参照）

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `roleRosterRepository`、`takedownClaimRepository` を読む。対象が読みものなら `articleRepository` も読む（公開状態）
- `ContentDirectory.describe`、`ReferenceQueries.isViewable`、`PhotoStorage.displayRefs` は `run` の外で呼ぶ

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |

対象または示された写真が削除されていること、対象が閲覧できないことは、エラーにせず、出力の対象の状態で伝える。

## takeDownPhotosByClaim

### 概要

サービス運営者が、取り下げの申立てに基づいて、申立ての対象（掲載・店舗・地域・イベント・読みもの）から写真を1枚以上削除する（[../domains/index.md](../domains/index.md)「申立てに基づく写真の削除」）。削除できる写真は、申立人が示した写真に限らない。申立てで削除できるかは `TakedownClaim.authorizePhotoRemoval` が、写真を外す規則と公開条件を欠いたときの扱いは対象の集約の `takeDownPhotos` が持ち、このユースケースは対象の種類で呼び分けるだけで、規則を述べない。対象が運営による非公開の間も行える。店舗管理者・運営者・編集担当者の有無を問わない。

申立ては書き込まない。申立てを対応済みにする `resolveTakedownClaim` とは別の UnitOfWork で確定し、削除は確定の時点で反映される。削除した写真は戻せない。

### 入出力

- 入力: `Actor`、申立ての ID、対象（`ContentRef`）、削除する写真の `PhotoId`（重複のない1つ以上）。版を含めない
- 出力: 削除の後の対象の公開状態（店舗は公開状態を持たない）と、この削除で公開していない状態になったかどうか

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `takedownClaimRepository.findById`
- `TakedownClaim.authorizePhotoRemoval(claim, target, photoIds)`
- 対象の種類（`target.kind`）で、次のリポジトリと集約の振る舞いを呼び分ける。リポジトリは `UnitOfWorkContext` から得て、`findById` が返した版で `save` する

| `target.kind` | リポジトリ | 集約の振る舞い |
| --- | --- | --- |
| `listing` | `listingRepository.findById`、`save` | `Listing.takeDownPhotos` |
| `place` | `placeRepository.findById`、`save` | `Place.takeDownPhotos` |
| `region` | `regionRepository.findById`、`save` | `Region.takeDownPhotos` |
| `occasion` | `occasionRepository.findById`、`save` | `Occasion.takeDownPhotos` |
| `article` | `articleRepository.findById`、`save` | `Article.takeDownPhotos` |

- `collectEvents`（集約の振る舞いが返す下書き: `content.photos_taken_down`、`photos.released`、公開していない状態になった掲載・地域・イベントの `{domain}.unpublished`）
- `Clock`

### トランザクション境界

- `run` を1つ使う
- `run` に含まれる書き込み: 対象の集約の `save`（写真の削除と、公開条件を欠いたときの `unpublished`）と、ドメインイベントの保存。申立ては読むだけで書き込まない
- `run` の中で使うリポジトリ: `roleRosterRepository`、`takedownClaimRepository`、対象の種類のリポジトリ（上の表）
- 途中で失敗したときに残る状態: 可否、申立ての有無と `authorizePhotoRemoval`、対象の有無、写真の有無のどれかが成り立たない、または対象の楽観ロックが競合するとロールバックし、対象もドメインイベントも変わらない
- 写真の実体と記録の削除（Media）、管理する人への通知（Notification）は、ドメインイベントの消費で結果整合になる

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 申立てがない | `NotFoundError` |
| 申立てが対応済み（別のサービス運営者が先に対応を終えた）、または申立ての対象が `target` でない | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`、`MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH`。判定の順は `authorizePhotoRemoval` が定める） |
| 対象が対応の前に削除されている | `NotFoundError` |
| 削除する写真に、対象の写真でないものがある（対応の前に管理する人が外した写真、別のサービス運営者がすでに削除した写真を含む）。1枚も外さない | `BusinessRuleError`（`{LISTING\|PLACE\|REGION\|OCCASION\|ARTICLE}_PHOTO_NOT_FOUND`） |
| 管理する人の保存と同時に確定した | `ConflictError` |

判定は、可否、申立ての有無、`authorizePhotoRemoval`、対象の有無、写真の有無の順。

## resolveTakedownClaim

### 概要

サービス運営者が、行った措置または措置を行わないことを結果として添え、申立てを対応済みにする。措置（写真の削除、非公開）を行ったかどうかを問わず、対象の状態も確かめない。結果のメールは、`takedown_claim.resolved` を消費する Notification の `sendTakedownOutcome` が送る。

### 入出力

- 入力: `Actor`、申立ての ID、結果。版を含めない
- 結果の規則は、値オブジェクトが確かめる
- 出力: 対応済みの申立て

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `takedownClaimRepository.findById`、`TakedownClaim.resolve`、`takedownClaimRepository.save`
- `collectEvents`（`takedown_claim.resolved`）
- `Clock`

### トランザクション境界

- `run` を1つ使う
- `run` に含まれる書き込みは、申立ての `save` と `takedown_claim.resolved` の保存
- `run` の中で使うリポジトリは `roleRosterRepository`、`takedownClaimRepository`
- `ForbiddenError`、`BusinessRuleError`、`ConflictError` でロールバックし、申立ては未対応のまま残る
- 対象の集約は書き換えない
- 写真の削除（`takeDownPhotosByClaim`）と掲載・店舗の非公開（`suspendListing`、`suspendPlace`）は、別の UnitOfWork で先に確定していて、このロールバックで戻らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`。操作の途中で役割を解除された場合を含む） | `ForbiddenError` |
| 申立てがすでに対応済み（別のサービス運営者が先に対応を終えた）。結果の規則より先に判定する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。申立ては先に添えられた結果のまま変わらない |
| 結果が空 | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_OUTCOME`） |
| 同時の要求が `save` で競合した | `ConflictError` |

## submitInfoReport

### 概要

ログインした利用者の、店舗管理者のいる店舗またはその掲載についての、情報の誤り・閉店の連絡を受け付ける。受け付けた連絡は未対応になり、サービス運営者への通知は `info_report.submitted` を消費する Notification が届ける。連絡した人に結果の通知は届かない。

掲載が対象のときは、掲載を読んで紐づく店舗を事実（`InfoReportSubmissionFacts` の `placeId`）として渡し、`InfoReport.submit` が `InfoReportTarget` を組み立てる。対象の掲載が削除されていれば、閲覧できない対象と同じに扱う。同じ ID の連絡がすでにあれば、`InfoReport.submit` を呼ばずに `InfoReport.sameSubmission` で判定する。同じ内容なら書き込みもドメインイベントもなしに成功とし、違う内容なら `ConflictError` にする。同じ利用者が、同じ対象に別の ID で重ねて連絡できる。

### 入出力

- 入力: `Actor`、連絡の ID（要求する側が決める）、対象（店舗の ID、または掲載の ID）、種類（情報の誤り、閉店）、内容
- 種類と内容の規則は、値オブジェクトが確かめる
- 出力: 受け付けたこと。連絡の状況を確かめる手段は返さない

### 使用するドメインの振る舞い・ポート

- `infoReportRepository.findById`、`InfoReport.sameSubmission`
- 掲載が対象のとき: `listingRepository.findByIds`（掲載と、紐づく店舗の `placeId`）
- `placeRepository.findById`（対象の店舗。掲載が対象のときは掲載が紐づく店舗）
- 閲覧できるかどうか: 読んだ集約に Discovery の `VisibilityPolicy` を当てる。店舗が対象なら `isPlaceViewable`、掲載が対象なら掲載とその店舗に `isListingViewable`。店舗・掲載がない、または閲覧できなければ、`InfoReportSubmissionFacts` は `{ kind: "unavailable" }` で、店舗管理者の有無を読まない
- 店舗管理者の有無（`InfoReportSubmissionFacts` の `placeHasSteward`）: `stewardshipRepository.findByTargets`、`Stewardship.isVacant`
- `InfoReport.submit`
- `infoReportRepository.insert`、`collectEvents`（`info_report.submitted`）
- `Clock`

### トランザクション境界

- `run` を1つ使う
- `run` に含まれる書き込みは、連絡の `insert` と `info_report.submitted` の保存
- `run` の中で使うリポジトリは、書き込む `infoReportRepository` と、事実を読む `listingRepository`、`placeRepository`、`stewardshipRepository`
- ドメインの振る舞いが `BusinessRuleError` を投げたとき、同じ ID で違う内容の連絡があったとき、`insert` が `ConflictError` になったときにロールバックし、連絡もドメインイベントも残らない
- 店舗管理者の有無は提出の時点の事実で、提出の後に店舗管理者が不在になっても連絡は残る

### エラーケース

| 条件 | 種類 |
| --- | --- |
| ログインせずに呼んだ | `UnauthorizedError` |
| 種類が2つの値のどちらでもない。内容が空 | `BusinessRuleError`（`MODERATION_INVALID_INFO_REPORT_CATEGORY`、`MODERATION_INVALID_INFO_REPORT_CONTENT`） |
| 提出の時点で、対象の店舗または掲載が閲覧できない（店舗の非公開、掲載の一時非公開・運営による非公開、削除された掲載、存在しない対象） | `BusinessRuleError`（`MODERATION_INFO_REPORT_TARGET_UNAVAILABLE`） |
| 対象の店舗に店舗管理者がいない（連絡ではなく修正の申請の対象） | `BusinessRuleError`（`MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`） |
| 同じ ID で、違う内容の連絡がある（連絡した人・対象・種類・内容のいずれかが違う） | `ConflictError` |

`BusinessRuleError` の判定の順は `InfoReport.submit` が定める（上の表の順）。

## listUnresolvedInfoReports

### 概要

サービス運営者の対応を待つ、未対応と確認依頼中の連絡を返す。対応済みの連絡は含まない。連絡した人が退会している連絡と、対象の掲載が削除されている連絡も含む。

### 入出力

- 入力: `Actor`、`Pagination`
- 出力: 連絡の並び（それぞれの対象とその名称、種類、状態、連絡した人のメールアドレス）と、対応を終えていない全件数。並び順は受け付けた日時の古い順。削除された掲載は名称なしで、退会した人はメールアドレスなしで返す

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findUnresolved`
- 対象の名称（共通の扱い。`ContentDirectory.describe`）
- 連絡した人のメールアドレス（共通の扱い。`accountRepository.findByIds`）

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `roleRosterRepository`、`infoReportRepository`、`accountRepository` を読む
- `ContentDirectory.describe` は `run` の外で呼ぶ

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |

## getInfoReport

### 概要

連絡1件の内容と、対象の名称と現在の状態、連絡した人のメールアドレス、対象の店舗に店舗管理者がいるかどうかを返す。未対応・確認依頼中・対応済みのどの連絡も返す。対象の掲載が削除されていること、対象が閲覧できないことは、エラーにせず、出力の対象の状態で伝える。店舗管理者の有無は、読んだ時点の事実で、連絡の後に不在になっていれば「いない」を返す。

### 入出力

- 入力: `Actor`、連絡の ID
- 出力: 連絡（種類、状態、確認の依頼を経たかどうか）、対象の名称、対象の現在の状態（対象があるかどうか、閲覧できるかどうか）、連絡した人のメールアドレス（退会した人はなし）、対象の店舗の店舗管理者の有無

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findById`、`InfoReport.confirmationRequestOf`
- 対象の名称と有無（共通の扱い。`ContentDirectory.describe`）
- `ReferenceQueries.isViewable`（Discovery。対象が閲覧できるかどうか）
- 連絡した人のメールアドレス（共通の扱い。`accountRepository.findByIds`）
- 店舗管理者の有無: `stewardshipRepository.findByTargets`、`Stewardship.isVacant`

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `roleRosterRepository`、`infoReportRepository`、`accountRepository`、`stewardshipRepository` を読む
- `ContentDirectory.describe` と `ReferenceQueries.isViewable` は `run` の外で呼ぶ

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |

## requestInfoReportConfirmation

### 概要

サービス運営者が、未対応の連絡について、その店舗の店舗管理者に情報の確認を依頼する。連絡は確認依頼中になる。依頼の通知は、`info_report.confirmation_requested` を消費する Notification が、その店舗のすべての店舗管理者に届ける。依頼は取り消せない。対象が閲覧できるかどうかと、対象の掲載があるかどうかは確かめない。

### 入出力

- 入力: `Actor`、連絡の ID。版を含めない
- 出力: 確認依頼中の連絡

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findById`
- 店舗管理者の有無（連絡の `target.placeId` の店舗）: `stewardshipRepository.findByTargets`、`Stewardship.isVacant`
- `InfoReport.requestConfirmation`、`infoReportRepository.save`
- `collectEvents`（`info_report.confirmation_requested`）
- `Clock`

### トランザクション境界

- `run` を1つ使う
- `run` に含まれる書き込みは、連絡の `save` と `info_report.confirmation_requested` の保存
- `run` の中で使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`infoReportRepository`
- `ForbiddenError`、`BusinessRuleError`、`ConflictError` でロールバックし、連絡は未対応のまま残り、依頼の通知は出ない
- 管理体制は書き換えない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 連絡が未対応でない（別のサービス運営者が先に確認を依頼した、または対応を終えた）。店舗管理者の有無より先に判定する | `BusinessRuleError`（`MODERATION_INFO_REPORT_NOT_OPEN`） |
| 依頼の時点で、店舗に店舗管理者がいない（連絡の後の辞任・解除・退会で不在になった） | `BusinessRuleError`（`MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`） |
| 同時の要求が `save` で競合した | `ConflictError` |

## resolveInfoReport

### 概要

サービス運営者が、連絡の対応を終える。未対応の連絡は依頼せずに終えられ、確認依頼中の連絡は、サービス運営者が店舗と掲載の現在の内容を見て判断した時期に終える。別のサービス運営者が先に確認を依頼した連絡も、確認依頼中の連絡として対応を終えられる。結果を持たず、ドメインイベントを出さない。連絡した人にも店舗管理者にも通知は届かない。店舗管理者の有無、対象が閲覧できるかどうか、対象の掲載があるかどうかは確かめない。権限の解除と、店舗・掲載の更新とは結びつけない。

### 入出力

- 入力: `Actor`、連絡の ID。版を含めない
- 出力: 対応済みの連絡

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findById`、`InfoReport.resolve`、`infoReportRepository.save`

### トランザクション境界

- `run` を1つ使う
- `run` に含まれる書き込みは、連絡の `save` だけ
- `run` の中で使うリポジトリは `roleRosterRepository`、`infoReportRepository`
- `ForbiddenError`、`BusinessRuleError`、`ConflictError` でロールバックし、連絡の状態は変わらない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`operate_service`） | `ForbiddenError` |
| 連絡がすでに対応済み（別のサービス運営者が先に対応を終えた） | `BusinessRuleError`（`MODERATION_INFO_REPORT_ALREADY_RESOLVED`） |
| 同時の要求が `save` で競合した | `ConflictError` |

## listConfirmationRequestsForPlace

### 概要

店舗管理者に、その店舗の確認依頼中の依頼を返す。店舗を対象にした連絡と、その店舗の掲載を対象にした連絡の両方を含む。対象の掲載が削除されている連絡も含む。未対応の連絡と対応済みの連絡は含まない。その店舗のどの店舗管理者にも同じ内容を返す。

### 入出力

- 入力: `Actor`、店舗の ID、`Pagination`
- 出力: 依頼の並び（それぞれの対象とその名称、種類）と、確認依頼中の全件数。並び順は依頼の日時の新しい順。対象の掲載が削除されている依頼は、掲載の名称なしで返す

### 使用するドメインの振る舞い・ポート

- 店舗管理者の確認（`stewardshipRepository.findById`、`Stewardship.standingOf`、`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findConfirmationRequestedByPlace`、`InfoReport.confirmationRequestOf`
- 対象の名称（共通の扱い。`ContentDirectory.describe`）

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `stewardshipRepository`、`roleRosterRepository`、`infoReportRepository` を読む
- `ContentDirectory.describe` は `run` の外で呼ぶ

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（`act_as_place`。依頼を受けた後に店舗管理者を辞任した場合を含む） | `ForbiddenError` |

## getConfirmationRequest

### 概要

店舗管理者に、確認の依頼1件を返す。依頼を持つ連絡（確認依頼中と、依頼を経た対応済み）だけを返し、サービス運営者が対応を終えた後も依頼の内容を読める。依頼を持たない連絡（未対応と、依頼を経ていない対応済み）は、存在しない連絡と同じに扱う。確認の結果を伝える操作と、連絡の状態を変える操作は持たない。

### 入出力

- 入力: `Actor`、連絡の ID
- 出力: 対象（店舗、または掲載とその店舗）とその名称、対象の掲載があるかどうか、連絡の種類と内容、連絡が確認依頼中か対応済みか

### 使用するドメインの振る舞い・ポート

- `infoReportRepository.findById`、`InfoReport.confirmationRequestOf`
- 店舗管理者の確認（連絡の `target.placeId` の店舗について、`stewardshipRepository.findById`、`Stewardship.standingOf`、`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- 対象の名称と有無（共通の扱い。`ContentDirectory.describe`）

判定の順は、連絡がない（`NotFoundError`）、店舗管理者の確認（`ForbiddenError`）、依頼を持たない（`NotFoundError`）の順。可否の判断に連絡の `target.placeId` を使うため、連絡を先に読む。

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `infoReportRepository`、`stewardshipRepository`、`roleRosterRepository` を読む
- `ContentDirectory.describe` は `run` の外で呼ぶ

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（連絡の `target.placeId` の店舗についての `act_as_place`。依頼を受けた後に店舗管理者を辞任した場合を含む） | `ForbiddenError` |
| 連絡が依頼を持たない（未対応、依頼を経ていない対応済み）。連絡の内容を返さない | `NotFoundError` |
