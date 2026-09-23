# Moderation のユースケース

ドメイン: Moderation（[../domains/moderation.md](../domains/moderation.md)）。取り下げの申立てと、情報の誤り・閉店の連絡の、受け付けから対応済みまでを実現する。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `submitTakedownClaim` | ログインなしで、取り下げの申立てを受け付ける | MOD-01、RQ-08 |
| `listOpenTakedownClaims` | サービス運営者に、未対応の申立てを対応を待ち始めた日時の古い順で返す | OPE-01、OM-01 |
| `getTakedownClaim` | サービス運営者に、申立て1件と、対象の現在の状態と写真を返す | MOD-02、OM-04 |
| `resolveTakedownClaim` | サービス運営者が、結果を添えて申立ての対応を終える | MOD-02、OM-04 |
| `sendTakedownOutcome` | `takedown_claim.resolved` を消費して、申立人に結果のメールを送り、送信を申立てに記録する | MOD-02 |
| `submitInfoReport` | ログインした利用者の、情報の誤り・閉店の連絡を受け付ける | MOD-04、RQ-09 |
| `listUnresolvedInfoReports` | サービス運営者に、未対応と確認依頼中の連絡を対応を待ち始めた日時の古い順で返す | OPE-01、OM-01 |
| `getInfoReport` | サービス運営者に、連絡1件と、対象の店舗の店舗管理者の有無を返す | MOD-05、OM-05 |
| `requestInfoReportConfirmation` | サービス運営者が、店舗管理者に確認を依頼し、連絡を確認依頼中にする | MOD-05、OM-05 |
| `resolveInfoReport` | サービス運営者が、連絡の対応を終える | MOD-05、OM-05 |
| `listConfirmationRequestsForPlace` | 店舗管理者に、その店舗の確認依頼中の依頼を返す | MOD-06、SM-01 |
| `getConfirmationRequest` | 店舗管理者に、確認の依頼1件を返す | MOD-06、SM-07 |

申立てに基づく写真の削除、運営による非公開と店舗の非公開、管理者の権限の解除、店舗と掲載の更新は、対象のドメインと Authority のユースケースが持つ。

## 共通の扱い

- サービス運営者の確認: `roleRosterRepository.findRolesOf` で操作する人の役割を読み、`AccessPolicy.decide` に `{ kind: "operate_service" }` を渡す。`allowed: false` なら `ForbiddenError`
- 店舗の管理権限の確認: `stewardshipRepository.findById` で対象の店舗の管理体制を読み（なければ `Stewardship.vacant`）、`Stewardship.standingOf` の結果と、`roleRosterRepository.findRolesOf` の役割を、`AccessPolicy.decide` に `{ kind: "manage_target", standing }` として渡す。`allowed: false` なら `ForbiddenError`。`manage_target` なので、店舗管理者のいない店舗の依頼は、サービス運営者が代行として読める
- 店舗管理者の有無: `stewardshipRepository.findByTargets` に対象の店舗を渡す。結果に管理体制がないか、`Stewardship.isVacant` なら、店舗管理者はいない
- 対象が閲覧できるかどうか: Discovery の `ReferenceQueries.isViewable` に対象（`ContentRef`）を渡す。定義は index.md の「閲覧できる対象」。削除された対象と存在しない対象は、閲覧できない対象になる
- 対象の名称と、対象があるかどうか: 対象のドメインのリポジトリで、閲覧できない対象を含めて読む。店舗は `placeRepository.findByIds`、掲載は `listingRepository.findByIds`、地域は `regionRepository.findByIds`、イベントは `occasionRepository.findByIds`、読みものは `articleRepository.findById`。一覧は、読んだページの対象を種類ごとにまとめて渡す（1ページは100件までなので、`findByIds` の件数の上限に収まる）。結果にない対象は、削除された対象として、名称なしで返す。掲載が対象の連絡は、掲載の名称と、`target.placeId` の店舗の名称を添える
- 連絡した人のメールアドレス: `accountRepository.findByIds` に、連絡の `reporter` を渡す。結果にない人は、退会した人として、メールアドレスなしで返す
- 書き込みを持つユースケースは、可否の判断に使う読み取りと事実の読み取りを、書き込みと同じ UnitOfWork の中で、書き込みの前に終える
- 状態を変える要求（対応を終える、確認の依頼）は、版を含めない。すでにその状態であること（別のサービス運営者が先に対応を終えた、先に確認を依頼した）は、前提の変化として状態の `BusinessRuleError` で返し、現在の状態を示す。同時の要求は `save` の楽観ロックで `ConflictError` になる
- 申立て・連絡の ID を受け取るユースケースは、`findById` が `null` を返せば `NotFoundError` にする。各ユースケースの節に重ねて書かない

## submitTakedownClaim

### 概要

店舗本人または写真の権利者の、取り下げの申立てを受け付ける。ログインを求めない。受け付けた申立ては未対応になり、サービス運営者への通知は `takedown_claim.submitted` を消費する Notification が届ける。申立人に受け付けのメールは送らない。

同じ ID の申立てがすでにあれば、`TakedownClaim.submit` を呼ばずに `TakedownClaim.sameSubmission` で判定する。同じ内容なら書き込みもドメインイベントもなしに成功とし、違う内容なら `ConflictError` にする。

### 入出力

- 入力: 申立ての ID（要求する側が決める）、立場、対象（`ContentRef`）、取り下げを求める写真の `PhotoId` の並び、理由、メールアドレス。`Actor` を取らない
- 立場・対象・写真の組、理由（1〜2,000文字）、メールアドレスの規則は、値オブジェクトが確かめる
- 出力: 受け付けた申立ての ID。申立ての状況を確かめる手段は返さない

### 使用するドメインの振る舞い・ポート

- `takedownClaimRepository.findById`、`TakedownClaim.sameSubmission`
- `ReferenceQueries.isViewable`（Discovery。結果を `TakedownTargetFacts.viewable` に渡す）
- 対象の現在の写真（`TakedownTargetFacts.photoIds`）: 対象の種類に応じて `listingRepository.findByIds`、`placeRepository.findByIds`、`regionRepository.findByIds`、`occasionRepository.findByIds`、`articleRepository.findById`。対象がなければ空
- `TakedownClaim.submit`
- `takedownClaimRepository.insert`、`collectEvents`（`takedown_claim.submitted`）
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、申立ての `insert` と `takedown_claim.submitted` の保存。スコープ内で使うリポジトリは、書き込む `takedownClaimRepository` と、対象の現在の写真を読む対象のリポジトリ。Discovery の読み取りも書き込みの前に終える。ドメインの振る舞いが `BusinessRuleError` を投げたとき、同じ ID で違う内容の申立てがあったとき、`insert` が `ConflictError` になったときにロールバックし、申立てもドメインイベントも残らない。対象の集約は書き換えない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 提出の時点で、対象が閲覧できない（非公開、公開の取り下げ、一時非公開、削除、存在しない対象） | `BusinessRuleError`（`TAKEDOWN_TARGET_UNAVAILABLE`） |
| 写真の権利者が写真を示していない。店舗本人が掲載・店舗のほかを対象にした。店舗本人が写真を示した | `BusinessRuleError`（`TAKEDOWN_GROUND_INVALID`） |
| 示した写真が、対象の現在の写真にない | `BusinessRuleError`（`TAKEDOWN_PHOTO_NOT_IN_TARGET`） |
| 理由が空または2,000文字を超える。メールアドレスの形式が正しくない | `BusinessRuleError`（値オブジェクトのコード） |
| 同じ ID で、違う内容の申立てがある | `ConflictError` |

## listOpenTakedownClaims

### 概要

サービス運営者の対応を待つ、未対応の申立てを返す。対応済みの申立ては含まない。

### 入出力

- 入力: `Actor`、`Pagination`
- 出力: 未対応の申立ての並び（ID、立場、対象とその名称、申立人のメールアドレス、受け付けた日時）と、未対応の全件数。並び順は受け付けた日時の古い順。削除された対象の申立ては、名称なしで返す

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `takedownClaimRepository.findOpen`
- 対象の名称（共通の扱い。対象のドメインのリポジトリ）

### トランザクション境界

UnitOfWork による原子性は要らない。書き込みを持たない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者の役割を持たない | `ForbiddenError` |

## getTakedownClaim

### 概要

申立て1件の内容と、対象の現在の状態と写真を返す。未対応の申立ても対応済みの申立ても返す。対象の現在の写真のうち、申立人が示した写真がどれかが分かる形で返す。対象の写真は、閲覧できない対象のものも返す（運営による非公開の間の対象の写真も削除できるため）。

### 入出力

- 入力: `Actor`、申立ての ID
- 出力: 申立て（立場、対象、示された写真、理由、メールアドレス、受け付けた日時、状態。対応済みなら結果と対応した日時）、対象の名称、対象の現在の状態（対象があるかどうか、閲覧できるかどうか）、対象の現在の写真（申立人が示した写真かどうかを添える）。対象がなければ写真は空。示された写真のうち対象の現在の写真にないものは、削除済みとして分かる

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `takedownClaimRepository.findById`
- 対象の名称・有無・現在の写真: 対象の種類に応じて `listingRepository.findByIds`、`placeRepository.findByIds`、`regionRepository.findByIds`、`occasionRepository.findByIds`、`articleRepository.findById`
- `ReferenceQueries.isViewable`（Discovery。対象が閲覧できるかどうか）
- `PhotoStorage.displayRefs`（Media。対象の現在の写真の表示用の参照）

### トランザクション境界

UnitOfWork による原子性は要らない。書き込みを持たない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者の役割を持たない | `ForbiddenError` |

対象または示された写真が削除されていること、対象が閲覧できないことは、エラーにせず、出力の対象の状態で伝える。

## resolveTakedownClaim

### 概要

サービス運営者が、行った措置または措置を行わないことを結果として添え、申立てを対応済みにする。措置（写真の削除、非公開）を行ったかどうかを問わず、対象の状態も確かめない。結果のメールは、`takedown_claim.resolved` を消費する `sendTakedownOutcome` が送る。

### 入出力

- 入力: `Actor`、申立ての ID、結果。版を含めない
- 結果（1〜2,000文字）の規則は、値オブジェクトが確かめる
- 出力: 対応済みの申立て（結果、対応した日時）

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `takedownClaimRepository.findById`、`TakedownClaim.resolve`、`takedownClaimRepository.save`
- `collectEvents`（`takedown_claim.resolved`）
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、申立ての `save` と `takedown_claim.resolved` の保存。スコープ内で使うリポジトリは `roleRosterRepository`、`takedownClaimRepository`。`ForbiddenError`、`BusinessRuleError`、`ConflictError` でロールバックし、申立ては未対応のまま残る。対象の集約は書き換えない。写真の削除と非公開は、対象のドメインの別の UnitOfWork で先に確定していて、このロールバックで戻らない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者の役割を持たない（操作の途中で役割を解除された場合を含む） | `ForbiddenError` |
| 結果が空または2,000文字を超える | `BusinessRuleError`（値オブジェクトのコード） |
| 申立てがすでに対応済み（別のサービス運営者が先に対応を終えた） | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。申立ては先に添えられた結果のまま変わらない |
| 同時の要求が `save` で競合した | `ConflictError` |

## sendTakedownOutcome

### 概要

`takedown_claim.resolved` の消費者。申立てを読み、結果のメールを申立人のメールアドレスに送り、送信を申立てに記録する。措置を行わなかった申立ての結果も送る。

冪等である。送信の記録（`outcomeSentAt`）のある申立てには、メールを送らずに成功する。メールを送れなければエラーをそのまま返し、リレーが再び配送する。申立ての対応済みは取り消さない。送信の引き受けの後に記録の保存が成立しなかった場合は、再配送で同じメールがもう1通届きうる（少なくとも1回の配送）。

### 入出力

- 入力: ドメインイベント `takedown_claim.resolved`（`claimId`）。`Actor` を取らない
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `takedownClaimRepository.findById`
- `TakedownOutcomeMailer.send`（宛先、対象、受け付けた日時、結果）
- `TakedownClaim.recordOutcomeSent`、`takedownClaimRepository.save`
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、送信を記録した申立ての `save` だけ。スコープ内で使うリポジトリは `takedownClaimRepository`。送信の記録の確認と `TakedownOutcomeMailer.send` は、スコープの前に、スコープの外で行う。送信が失敗するとスコープを開かず、申立ては対応済みで送信の記録のないまま残る。重ねて配送された消費どうしが `save` で競合すると、負けた側は `ConflictError` になり、再配送では送信の記録を見てメールを送らない。ドメインイベントは出ない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| メールの送信を引き受けられない | `SystemError`。送信を記録しない。リレーが再び配送する |

## submitInfoReport

### 概要

ログインした利用者の、店舗管理者のいる店舗またはその掲載についての、情報の誤り・閉店の連絡を受け付ける。受け付けた連絡は未対応になり、サービス運営者への通知は `info_report.submitted` を消費する Notification が届ける。連絡した人に結果の通知は届かない。

掲載が対象のときは、掲載が紐づく店舗を読んで事実（`listingPlaceId`）として渡し、`InfoReport.submit` が `InfoReportTarget` を組み立てる。対象の掲載が削除されていれば、閲覧できない対象と同じに扱う。同じ ID の連絡がすでにあれば、`InfoReport.submit` を呼ばずに `InfoReport.sameSubmission` で判定する。同じ内容なら書き込みもドメインイベントもなしに成功とし、違う内容なら `ConflictError` にする。同じ利用者が、同じ対象に別の ID で重ねて連絡できる。

### 入出力

- 入力: `Actor`、連絡の ID（要求する側が決める）、対象（店舗の ID、または掲載の ID）、種類（情報の誤り、閉店）、内容
- 種類と内容（1〜2,000文字）の規則は、値オブジェクトが確かめる
- 出力: 受け付けた連絡の ID。連絡の状況を確かめる手段は返さない

### 使用するドメインの振る舞い・ポート

- `infoReportRepository.findById`、`InfoReport.sameSubmission`
- 掲載が対象のとき: `listingRepository.findByIds`（紐づく店舗の `placeId` を `InfoReportSubmissionFacts.listingPlaceId` に渡す。掲載がなければ `null`）
- `ReferenceQueries.isViewable`（Discovery。対象の店舗、または対象の掲載について読み、`InfoReportSubmissionFacts.targetViewable` に渡す）
- 店舗管理者の有無（`InfoReportSubmissionFacts.placeHasSteward`）: `stewardshipRepository.findByTargets`、`Stewardship.isVacant`。対象の掲載がなく、店舗が決まらなければ、読まずに `false` を渡す
- `InfoReport.submit`
- `infoReportRepository.insert`、`collectEvents`（`info_report.submitted`）
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、連絡の `insert` と `info_report.submitted` の保存。スコープ内で使うリポジトリは、書き込む `infoReportRepository` と、事実を読む `listingRepository`、`stewardshipRepository`。Discovery の読み取りも書き込みの前に終える。ドメインの振る舞いが `BusinessRuleError` を投げたとき、同じ ID で違う内容の連絡があったとき、`insert` が `ConflictError` になったときにロールバックし、連絡もドメインイベントも残らない。店舗管理者の有無は提出の時点の事実で、提出の後に店舗管理者が不在になっても連絡は残る。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 提出の時点で、対象の店舗または掲載が閲覧できない（店舗の非公開、掲載の一時非公開・運営による非公開、削除された掲載、存在しない対象）。店舗管理者の有無より先に判定する | `BusinessRuleError`（`INFO_REPORT_TARGET_UNAVAILABLE`） |
| 対象の店舗に店舗管理者がいない（連絡ではなく修正の申請の対象） | `BusinessRuleError`（`INFO_REPORT_PLACE_WITHOUT_STEWARD`） |
| 種類が2つの値のどちらでもない。内容が空または2,000文字を超える | `BusinessRuleError`（値オブジェクトのコード） |
| 同じ ID で、違う内容の連絡がある（連絡した人・対象・種類・内容のいずれかが違う） | `ConflictError` |

## listUnresolvedInfoReports

### 概要

サービス運営者の対応を待つ、未対応と確認依頼中の連絡を返す。対応済みの連絡は含まない。連絡した人が退会している連絡と、対象の掲載が削除されている連絡も含む。

### 入出力

- 入力: `Actor`、`Pagination`
- 出力: 連絡の並び（ID、対象とその名称、種類、連絡した人の `AccountId` とメールアドレス、受け付けた日時、状態）と、対応を終えていない全件数。並び順は受け付けた日時の古い順。削除された掲載は名称なしで、退会した人はメールアドレスなしで返す

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findUnresolved`
- 対象の名称（共通の扱い。`placeRepository.findByIds`、`listingRepository.findByIds`）
- 連絡した人のメールアドレス（共通の扱い。`accountRepository.findByIds`）

### トランザクション境界

UnitOfWork による原子性は要らない。書き込みを持たない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者の役割を持たない | `ForbiddenError` |

## getInfoReport

### 概要

連絡1件の内容と、対象の名称と現在の状態、連絡した人のメールアドレス、対象の店舗に店舗管理者がいるかどうかを返す。未対応・確認依頼中・対応済みのどの連絡も返す。対象の掲載が削除されていること、対象が閲覧できないことは、エラーにせず、出力の対象の状態で伝える。店舗管理者の有無は、読んだ時点の事実で、連絡の後に不在になっていれば「いない」を返す。

### 入出力

- 入力: `Actor`、連絡の ID
- 出力: 連絡（対象、種類、内容、連絡した人の `AccountId`、受け付けた日時、状態。依頼を持つ連絡は依頼の日時、対応済みなら対応した日時）、対象の名称、対象の現在の状態（対象があるかどうか、閲覧できるかどうか）、連絡した人のメールアドレス（退会した人はなし）、対象の店舗の店舗管理者の有無

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findById`、`InfoReport.confirmationRequestOf`
- 対象の名称と有無（共通の扱い。`placeRepository.findByIds`、`listingRepository.findByIds`）
- `ReferenceQueries.isViewable`（Discovery。対象が閲覧できるかどうか）
- 連絡した人のメールアドレス（共通の扱い。`accountRepository.findByIds`）
- 店舗管理者の有無: `stewardshipRepository.findByTargets`、`Stewardship.isVacant`

### トランザクション境界

UnitOfWork による原子性は要らない。書き込みを持たない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者の役割を持たない | `ForbiddenError` |

## requestInfoReportConfirmation

### 概要

サービス運営者が、未対応の連絡について、その店舗の店舗管理者に情報の確認を依頼する。連絡は確認依頼中になる。依頼の通知は、`info_report.confirmation_requested` を消費する Notification が、その店舗のすべての店舗管理者に届ける。依頼は取り消せない。対象が閲覧できるかどうかと、対象の掲載があるかどうかは確かめない。

### 入出力

- 入力: `Actor`、連絡の ID。版を含めない
- 出力: 確認依頼中の連絡（依頼の日時）

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findById`
- 店舗管理者の有無（連絡の `target.placeId` の店舗）: `stewardshipRepository.findByTargets`、`Stewardship.isVacant`
- `InfoReport.requestConfirmation`、`infoReportRepository.save`
- `collectEvents`（`info_report.confirmation_requested`）
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、連絡の `save` と `info_report.confirmation_requested` の保存。スコープ内で使うリポジトリは `roleRosterRepository`、`stewardshipRepository`、`infoReportRepository`。`ForbiddenError`、`BusinessRuleError`、`ConflictError` でロールバックし、連絡は未対応のまま残り、依頼の通知は出ない。管理体制は書き換えない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者の役割を持たない（店舗管理者であっても同じ） | `ForbiddenError` |
| 連絡が未対応でない（別のサービス運営者が先に確認を依頼した、または対応を終えた）。店舗管理者の有無より先に判定する | `BusinessRuleError`（`INFO_REPORT_NOT_OPEN`） |
| 依頼の時点で、店舗に店舗管理者がいない（連絡の後の辞任・解除・退会で不在になった） | `BusinessRuleError`（`INFO_REPORT_PLACE_WITHOUT_STEWARD`） |
| 同時の要求が `save` で競合した | `ConflictError` |

## resolveInfoReport

### 概要

サービス運営者が、連絡の対応を終える。未対応の連絡は依頼せずに終えられ、確認依頼中の連絡は、サービス運営者が店舗と掲載の現在の内容を見て判断した時期に終える。別のサービス運営者が先に確認を依頼した連絡も、確認依頼中の連絡として対応を終えられる。結果を持たず、ドメインイベントを出さない。連絡した人にも店舗管理者にも通知は届かない。店舗管理者の有無、対象が閲覧できるかどうか、対象の掲載があるかどうかは確かめない。権限の解除と、店舗・掲載の更新とは結びつけない。

### 入出力

- 入力: `Actor`、連絡の ID。版を含めない
- 出力: 対応済みの連絡（対応した日時）

### 使用するドメインの振る舞い・ポート

- サービス運営者の確認（`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findById`、`InfoReport.resolve`、`infoReportRepository.save`
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは、連絡の `save` だけ。スコープ内で使うリポジトリは `roleRosterRepository`、`infoReportRepository`。`ForbiddenError`、`BusinessRuleError`、`ConflictError` でロールバックし、連絡の状態は変わらない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者の役割を持たない（店舗管理者であっても同じ） | `ForbiddenError` |
| 連絡がすでに対応済み（別のサービス運営者が先に対応を終えた） | `BusinessRuleError`（`INFO_REPORT_ALREADY_RESOLVED`） |
| 同時の要求が `save` で競合した | `ConflictError` |

## listConfirmationRequestsForPlace

### 概要

店舗管理者に、その店舗の確認依頼中の依頼を返す。店舗を対象にした連絡と、その店舗の掲載を対象にした連絡の両方を含む。対象の掲載が削除されている連絡も含む。未対応の連絡と対応済みの連絡は含まない。その店舗のどの店舗管理者にも同じ内容を返す。

### 入出力

- 入力: `Actor`、店舗の ID、`Pagination`
- 出力: 依頼の並び（連絡の ID、対象とその名称、種類、内容、依頼の日時）と、確認依頼中の全件数。並び順は依頼の日時の新しい順。対象の掲載が削除されている依頼は、掲載の名称なしで返す

### 使用するドメインの振る舞い・ポート

- 店舗の管理権限の確認（`stewardshipRepository.findById`、`Stewardship.standingOf`、`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）
- `infoReportRepository.findConfirmationRequestedByPlace`、`InfoReport.confirmationRequestOf`
- 対象の名称（共通の扱い。`placeRepository.findByIds`、`listingRepository.findByIds`）

### トランザクション境界

UnitOfWork による原子性は要らない。書き込みを持たない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人が、その店舗の管理権限を持たない | `ForbiddenError` |

## getConfirmationRequest

### 概要

店舗管理者に、確認の依頼1件を返す。依頼を持つ連絡（確認依頼中と、依頼を経た対応済み）だけを返し、サービス運営者が対応を終えた後も依頼の内容を読める。依頼を持たない連絡（未対応と、依頼を経ていない対応済み）は、存在しない連絡と同じに扱う。確認の結果を伝える操作と、連絡の状態を変える操作は持たない。

### 入出力

- 入力: `Actor`、連絡の ID
- 出力: 対象（店舗、または掲載とその店舗）とその名称、対象の掲載があるかどうか、種類、内容、依頼の日時、連絡が確認依頼中か対応済みか

### 使用するドメインの振る舞い・ポート

- `infoReportRepository.findById`、`InfoReport.confirmationRequestOf`
- 対象の名称と有無（共通の扱い。`placeRepository.findByIds`、`listingRepository.findByIds`）
- 店舗の管理権限の確認（連絡の `target.placeId` の店舗について、`stewardshipRepository.findById`、`Stewardship.standingOf`、`roleRosterRepository.findRolesOf`、`AccessPolicy.decide`）

### トランザクション境界

UnitOfWork による原子性は要らない。書き込みを持たない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人が、連絡の対象の店舗の管理権限を持たない（依頼を受けた後に管理権限を手放した場合を含む） | `ForbiddenError` |
| 連絡が依頼を持たない（未対応、依頼を経ていない対応済み）。連絡の内容を返さない | `NotFoundError` |
