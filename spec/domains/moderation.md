# Moderation

取り下げの申立てと、情報の誤り・閉店の連絡の、受け付けから対応済みまでを管理する。共有カーネルの型（`TakedownClaimId`、`InfoReportId`、`ContentRef`、`PhotoId`、`PlaceId`、`ListingId`、`AccountId`、`EmailAddress`）、リポジトリの共通の契約、申立てに基づく写真の削除の分担は [index.md](index.md) が定める。

- 申立てと連絡は申請ではない。差し戻し・再提出・取り下げ・再申請・失効を持たず、Application の進み方と `Premise` を使わない（P-79、B-49、B-59）
- 措置そのもの（写真の削除、掲載の運営による非公開、店舗の非公開、管理者の権限の解除、店舗と掲載の更新）は、対象のドメインと Authority の振る舞いが行う。Moderation は、対応の記録と、措置の前提の判断を持つ。申立てに基づく写真の削除は、Moderation のユースケース `takeDownPhotosByClaim` が、申立てで削除できることを確かめてから、対象のドメインの集約の振る舞い `takeDownPhotos` を呼ぶ（application 層の合成。index.md「申立てに基づく写真の削除」）
- 申立人への結果のメール、サービス運営者への通知、確認の依頼の通知は、Moderation のドメインイベントを消費する Notification が届ける。Moderation は通知とメールのポートを持たない
- 対応（対応を終える、確認の依頼）はサービス運営者の役割で行う。可否は Authority の `AccessPolicy` が判断する。連絡を対応済みにするのはサービス運営者だけで、店舗管理者が連絡の状態を変える振る舞いはない
- 申立てと連絡を削除する振る舞いはない。対象が削除されても、連絡した人が退会しても、記録は残る

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| TakedownClaim | 取り下げの申立て | 店舗本人または写真の権利者が、ログインせずに、掲載・店舗の非公開または写真の削除を求めるもの |
| Claimant | 申立人 | 申立てを出した人。アカウントを持たず、メールアドレスで連絡する |
| ClaimantStanding | 申立人の立場 | 店舗本人（`proprietor`）または写真の権利者（`photoRightsHolder`）。`TakedownGround` の `standing` |
| TakedownGround | 申立ての立場と対象 | 立場と、その立場で申し立てられる対象の組 |
| TakedownOutcome | 結果 | サービス運営者が対応を終えるときに添える、行った措置または措置を行わないことの記述 |
| InfoReport | 情報の誤り・閉店の連絡 | 利用者が、店舗管理者のいる店舗またはその掲載について、情報の誤りまたは閉店をサービス運営者に知らせるもの |
| Reporter | 連絡した人 | 連絡を出した利用者 |
| ConfirmationRequest | 確認の依頼 | サービス運営者が、連絡の内容を添えて、その店舗の店舗管理者に情報の確認を求めること |
| Open | 未対応 | 受け付けた後、対応を終えていない状態 |
| ConfirmationRequested | 確認依頼中 | 連絡について、確認の依頼を出した後、対応を終えていない状態 |
| Resolved | 対応済み | サービス運営者が対応を終えた状態 |
| AwaitingSince | 対応を待ち始めた日時 | 申立てと連絡では、受け付けた日時 |

## エンティティ

### TakedownClaim（集約ルート）

```ts
type TakedownClaimBase = Readonly<{
  id: TakedownClaimId;
  ground: TakedownGround;
  reason: TakedownReason;
  email: EmailAddress;
  receivedAt: Date;
  version: Version;
}>;

type OpenTakedownClaim = TakedownClaimBase & Readonly<{ status: "open" }>;

type ResolvedTakedownClaim = TakedownClaimBase &
  Readonly<{
    status: "resolved";
    outcome: TakedownOutcome;
  }>;

type TakedownClaim = OpenTakedownClaim | ResolvedTakedownClaim;
```

#### フィールド

| 名前 | 型 | 制約 |
| --- | --- | --- |
| `id` | `TakedownClaimId` | 提出を要求する側が決める |
| `ground` | `TakedownGround` | 提出の後は変わらない |
| `reason` | `TakedownReason` | 提出の後は変わらない |
| `email` | `EmailAddress` | 共有カーネルの型。結果のメールの宛先。提出の後は変わらない |
| `receivedAt` | `Date` | 受け付けた日時。対応を待ち始めた日時 |
| `outcome` | `TakedownOutcome` | 対応済みだけが持つ |

#### 振る舞い

```ts
type TakedownClaimInput = Readonly<{
  id: TakedownClaimId;
  standing: string;
  target: ContentRef;
  photoIds: readonly PhotoId[];
  reason: string;
  email: string;
}>;

type TakedownTargetFacts =
  | Readonly<{ viewable: false }> // Discovery の ReferenceQueries.isViewable が false
  | Readonly<{
      viewable: true;
      photoIds: readonly PhotoId[]; // 対象の現在の写真（ContentDirectory.describe）
    }>;
```

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `TakedownClaim.submit` | `input: TakedownClaimInput`, `facts: TakedownTargetFacts`, `now: Date` | `WithEventDrafts<OpenTakedownClaim, TakedownClaimSubmittedEvent>` | 値オブジェクトを組み立て、未対応の申立てを作る。判定は次の順で、最初に当たったエラーを返す。(1) 値オブジェクトの規則（立場と対象と写真の組、理由、メールアドレスの順）。(2) 対象が閲覧できない（`facts.viewable` が `false`。`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`）。(3) 写真の権利者が示した写真が、対象の現在の写真（`facts.photoIds`）に含まれない（`MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET`。含まれない写真の `PhotoId` を添える）。操作する人を取らない |
| `TakedownClaim.resolve` | `claim: TakedownClaim`, `outcome: string`, `now: Date` | `WithEventDrafts<ResolvedTakedownClaim, TakedownClaimResolvedEvent>` | 結果を添えて対応済みにする。措置を行ったかどうかを問わない。対応済みの申立てには `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。結果が規則を満たさなければ `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_OUTCOME`）。対応済みを先に判定する |
| `TakedownClaim.authorizePhotoRemoval` | `claim: TakedownClaim`, `owner: ContentRef`, `photoIds: readonly [PhotoId, ...PhotoId[]]` | `void` | 申立てに基づいて `owner` から `photoIds` の写真を削除できるかを確かめる。申立てと写真の関係の規則は、この振る舞いだけが持つ。申立てが未対応で、`owner` が申立ての対象と等しければ成立する。対応済みなら `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`）、`owner` が対象と違えば `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH`）。対応済みを先に判定する。`photoIds` は成立の判定に使わない（申立人が示した写真に限らず、対象のどの写真でもよい）。`photoIds` が対象の写真であることは、対象の集約の `takeDownPhotos` が確かめる |
| `TakedownClaim.sameSubmission` | `claim: TakedownClaim`, `input: TakedownClaimInput` | `boolean` | 立場・対象・写真・理由・メールアドレスが等しいかを返す。冪等な作成の判定に使う |
| `TakedownClaim.reconstruct` | 保存された値 | `TakedownClaim` | 値オブジェクトを通して組み立て直す。不変条件を欠く値は `RehydrationError` |

エラー（すべて `BusinessRuleError`）は次のとおり。

| コード | 状況 |
| --- | --- |
| `MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE` | 提出の時点で対象が閲覧できない（非公開、公開していない状態、削除済み、存在しない） |
| `MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET` | 示した写真が対象の現在の写真にない。含まれない写真の `PhotoId` を添える |
| `MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED` | 対応済みの申立てへの `resolve`・`authorizePhotoRemoval` |
| `MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH` | `authorizePhotoRemoval` の `owner` が申立ての対象と違う |
| `MODERATION_INVALID_TAKEDOWN_GROUND`、`MODERATION_INVALID_TAKEDOWN_REASON`、`MODERATION_INVALID_TAKEDOWN_OUTCOME`、`COMMON_INVALID_EMAIL_ADDRESS`（共有カーネル） | 立場と対象と写真の組、理由、結果、メールアドレスが値オブジェクトの規則を満たさない（下の「値オブジェクト」） |

#### 不変条件

- 結果は、対応済みの申立てだけが持つ。対応済みの申立ては必ず結果を持つ
- 提出した内容は変わらない。申立人が申立てを取り消す振る舞いはない（P-47）
- 対応済みは終わりの状態で、未対応に戻らない

#### ライフサイクル

- 生成: `submit` で未対応として生まれる
- 遷移: `open → resolved`（`resolve`）。写真の削除と非公開の措置は、申立ての状態を変えない

### InfoReport（集約ルート）

```ts
type InfoReportBase = Readonly<{
  id: InfoReportId;
  target: InfoReportTarget;
  category: InfoReportCategory;
  content: InfoReportContent;
  reporter: AccountId;
  receivedAt: Date;
  version: Version;
}>;

type ConfirmationRequest = Readonly<{ requestedAt: Date }>;

type OpenInfoReport = InfoReportBase & Readonly<{ status: "open" }>;

type ConfirmationRequestedInfoReport = InfoReportBase &
  Readonly<{ status: "confirmationRequested"; request: ConfirmationRequest }>;

type ResolvedInfoReport = InfoReportBase &
  Readonly<{
    status: "resolved";
    request: ConfirmationRequest | null;
  }>;

type InfoReport =
  | OpenInfoReport
  | ConfirmationRequestedInfoReport
  | ResolvedInfoReport;
```

#### フィールド

| 名前 | 型 | 制約 |
| --- | --- | --- |
| `id` | `InfoReportId` | 提出を要求する側が決める |
| `target` | `InfoReportTarget` | 店舗、または掲載とその店舗。提出の後は変わらない |
| `category` | `InfoReportCategory` | 提出の後は変わらない |
| `content` | `InfoReportContent` | 提出の後は変わらない |
| `reporter` | `AccountId` | 連絡した人。退会の後は指す先がない |
| `receivedAt` | `Date` | 受け付けた日時。対応を待ち始めた日時 |
| `request` | `ConfirmationRequest` | 確認依頼中は必ず持つ。対応済みは、依頼を経たときだけ持つ |

#### 振る舞い

```ts
type InfoReportInput = Readonly<{
  id: InfoReportId;
  target:
    | Readonly<{ kind: "place"; placeId: PlaceId }>
    | Readonly<{ kind: "listing"; listingId: ListingId }>;
  category: string;
  content: string;
}>;

type InfoReportSubmissionFacts =
  | Readonly<{ kind: "unavailable" }> // 対象の店舗または掲載がない、または閲覧できない（読んだ集約に Discovery の VisibilityPolicy を当てた結果）
  | Readonly<{
      kind: "available";
      placeId: PlaceId; // 対象の店舗。掲載が対象のときは、その掲載が紐づく店舗
      placeHasSteward: boolean; // placeId の店舗に店舗管理者がいる
    }>;
```

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `InfoReport.submit` | `input: InfoReportInput`, `reporter: Actor`, `facts: InfoReportSubmissionFacts`, `now: Date` | `WithEventDrafts<OpenInfoReport, InfoReportSubmittedEvent>` | 未対応の連絡を作る。`InfoReportTarget` は、入力の対象と `facts.placeId` から組み立てる。`facts.kind` が `unavailable` なら `BusinessRuleError`（`MODERATION_INFO_REPORT_TARGET_UNAVAILABLE`）。`facts.placeHasSteward` が `false` なら `BusinessRuleError`（`MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`。連絡ではなく修正の申請の対象）。判定は、値オブジェクトの規則（種類、内容の順）、対象が閲覧できない、店舗管理者がいないの順で、最初に当たったエラーを返す |
| `InfoReport.requestConfirmation` | `report: InfoReport`, `facts: { placeHasSteward: boolean }`, `now: Date` | `WithEventDrafts<ConfirmationRequestedInfoReport, InfoReportConfirmationRequestedEvent>` | 未対応の連絡を確認依頼中にする。未対応でない連絡には `BusinessRuleError`（`MODERATION_INFO_REPORT_NOT_OPEN`）。店舗管理者がいなければ `BusinessRuleError`（`MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`）。連絡の状態を先に判定する。依頼は取り消せない |
| `InfoReport.resolve` | `report: InfoReport` | `ResolvedInfoReport` | 未対応または確認依頼中の連絡を対応済みにする。確認依頼中の `request` を引き継ぐ。結果を持たない。対応済みの連絡には `BusinessRuleError`（`MODERATION_INFO_REPORT_ALREADY_RESOLVED`）。ドメインイベントは出さない |
| `InfoReport.confirmationRequestOf` | `report: InfoReport` | `ConfirmationRequest \| null` | 確認の依頼を返す。店舗管理者が読めるのは、依頼を持つ連絡だけ |
| `InfoReport.sameSubmission` | `report: InfoReport`, `input: InfoReportInput`, `reporter: Actor` | `boolean` | 連絡した人・対象（種類と、店舗または掲載の ID）・種類・内容が等しいかを返す。冪等な作成の判定に使う。事実を取らないので、対象の掲載が削除された後の送り直しも判定できる |
| `InfoReport.reconstruct` | 保存された値 | `InfoReport` | 値オブジェクトを通して組み立て直す。不変条件を欠く値は `RehydrationError` |

エラー（すべて `BusinessRuleError`）は次のとおり。

| コード | 状況 |
| --- | --- |
| `MODERATION_INFO_REPORT_TARGET_UNAVAILABLE` | 提出の時点で対象が閲覧できない（店舗の非公開、掲載の一時非公開・運営による非公開、削除済みの掲載、存在しない対象） |
| `MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD` | 提出または確認の依頼の時点で、店舗に店舗管理者がいない |
| `MODERATION_INFO_REPORT_NOT_OPEN` | 未対応でない連絡への確認の依頼 |
| `MODERATION_INFO_REPORT_ALREADY_RESOLVED` | 対応済みの連絡への `resolve` |
| `MODERATION_INVALID_INFO_REPORT_CATEGORY`、`MODERATION_INVALID_INFO_REPORT_CONTENT` | 種類、内容が値オブジェクトの規則を満たさない（下の「値オブジェクト」） |

#### 不変条件

- 確認依頼中の連絡は、確認の依頼を必ず持つ。未対応の連絡は持たない
- 提出した内容は変わらない。連絡した人が連絡を取り消す振る舞いはない
- 対応済みは終わりの状態。確認依頼中から未対応に戻らない
- 同じ利用者が同じ対象に重ねて連絡できる。連絡は互いに独立して対応する
- 提出の後に店舗管理者が不在になっても、連絡は残り、サービス運営者が対応を終える

#### ライフサイクル

- 生成: `submit` で未対応として生まれる
- 遷移

| 遷移 | きっかけ |
| --- | --- |
| `open → confirmationRequested` | `requestConfirmation` |
| `open → resolved` | `resolve`（依頼せずに終える） |
| `confirmationRequested → resolved` | `resolve` |

店舗管理者が対応したかどうかの判断と、その時期は、サービス運営者が店舗と掲載の現在の内容を見て決める。Moderation は期間を持たない（I-03）。

## 値オブジェクト

```ts
type ProprietorTarget = Extract<ContentRef, { kind: "listing" | "place" }>;

type ClaimantStanding = "proprietor" | "photoRightsHolder";

type TakedownGround =
  | Readonly<{ standing: "proprietor"; target: ProprietorTarget }>
  | Readonly<{
      standing: "photoRightsHolder";
      target: ContentRef;
      photoIds: readonly [PhotoId, ...PhotoId[]];
    }>;

type InfoReportTarget =
  | Readonly<{ kind: "place"; placeId: PlaceId }>
  | Readonly<{ kind: "listing"; placeId: PlaceId; listingId: ListingId }>;

type InfoReportCategory = "incorrectInfo" | "closure";
```

| 名前 | バリデーション | 等価性 |
| --- | --- | --- |
| `TakedownGround` | `TakedownGround.create(standing, target, photoIds)` で作る。店舗本人の対象は掲載と店舗だけで、写真を持たない。写真の権利者は写真を1枚以上示し、`PhotoId` は重複しない。`standing` が `ClaimantStanding` のどちらでもない場合を含め、規則を満たさなければ `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_GROUND`） | 立場、対象、写真の集合の一致 |
| `TakedownReason` | 前後の空白を除いて1〜2,000文字。満たさなければ `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_REASON`） | 文字列の一致 |
| `TakedownOutcome` | 前後の空白を除いて1〜2,000文字。満たさなければ `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_OUTCOME`） | 文字列の一致 |
| `InfoReportTarget` | `kind: "listing"` の `placeId` は、その掲載が紐づく店舗。`InfoReport.submit` が、ユースケースが掲載から読んだ事実（`InfoReportSubmissionFacts` の `placeId`）で組み立てる | すべてのフィールドの一致 |
| `InfoReportCategory` | 2つの値のどちらか。どちらでもなければ `BusinessRuleError`（`MODERATION_INVALID_INFO_REPORT_CATEGORY`） | 値の一致 |
| `InfoReportContent` | 前後の空白を除いて1〜2,000文字。満たさなければ `BusinessRuleError`（`MODERATION_INVALID_INFO_REPORT_CONTENT`） | 文字列の一致 |

`InfoReportTarget` が掲載の対象にも `placeId` を持つため、掲載が削除された後も、依頼の宛先の店舗と、店舗管理者が読む依頼の一覧が決まる。

## ドメインサービス

持たない。規則は2つの集約と値オブジェクトの純粋な関数で足りる。

## ドメインイベント

```ts
type TakedownClaimSubmittedEvent = DomainEventBase<"takedown_claim.submitted", { claimId: TakedownClaimId }>;
type TakedownClaimResolvedEvent = DomainEventBase<"takedown_claim.resolved", { claimId: TakedownClaimId }>;
type InfoReportSubmittedEvent = DomainEventBase<"info_report.submitted", { reportId: InfoReportId }>;
type InfoReportConfirmationRequestedEvent = DomainEventBase<
  "info_report.confirmation_requested",
  { reportId: InfoReportId; target: InfoReportTarget }
>;
```

| 型 | いつ出るか | 消費者 |
| --- | --- | --- |
| `TakedownClaimSubmittedEvent` | `TakedownClaim.submit` | Notification（[notification.md](notification.md) の対応の表） |
| `TakedownClaimResolvedEvent` | `TakedownClaim.resolve` | Notification（[notification.md](notification.md) の対応の表） |
| `InfoReportSubmittedEvent` | `InfoReport.submit` | Notification（[notification.md](notification.md) の対応の表） |
| `InfoReportConfirmationRequestedEvent` | `InfoReport.requestConfirmation` | Notification（[notification.md](notification.md) の対応の表） |

`aggregateId` は `TakedownClaimId` または `InfoReportId`。連絡の対応済みは、連絡した人にも店舗管理者にも通知しないため、ドメインイベントを出さない。申立てによる写真の削除の通知は、対象の集約の `takeDownPhotos` が出す共有カーネルの `content.photos_taken_down` が担う。

Moderation は他のドメインのドメインイベントを消費しない。

## ポート

### TakedownClaimRepository

`UnitOfWorkContext` に `takedownClaimRepository` として現れる。

```ts
interface TakedownClaimRepository
  extends Omit<TransactionalRepository<TakedownClaim, TakedownClaimId>, "delete"> {
  findOpen(pagination: Pagination): Promise<PaginationResult<OpenTakedownClaim>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save` | リポジトリの共通の契約による。`save` は楽観ロックを使う。ID のほかに一意性はない。記録は削除しないので、`delete` を持たない |
| `findOpen` | 未対応の申立てを返す。並び順は `receivedAt` の古い順、同順位は ID の昇順。`count` は未対応の全件数 |

### InfoReportRepository

`UnitOfWorkContext` に `infoReportRepository` として現れる。

```ts
interface InfoReportRepository
  extends Omit<TransactionalRepository<InfoReport, InfoReportId>, "delete"> {
  findUnresolved(
    pagination: Pagination,
  ): Promise<PaginationResult<OpenInfoReport | ConfirmationRequestedInfoReport>>;

  findConfirmationRequestedByPlace(
    placeId: PlaceId,
    pagination: Pagination,
  ): Promise<PaginationResult<ConfirmationRequestedInfoReport>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save` | リポジトリの共通の契約による。`save` は楽観ロックを使う。ID のほかに一意性はない。記録は削除しないので、`delete` を持たない |
| `findUnresolved` | 未対応と確認依頼中の連絡を返す。並び順は `receivedAt` の古い順、同順位は ID の昇順。`count` は対応を終えていない全件数 |
| `findConfirmationRequestedByPlace` | `target.placeId` が `placeId` の、確認依頼中の連絡を返す。店舗を対象にした連絡と、その店舗の掲載を対象にした連絡の両方を含む。並び順は `request.requestedAt` の新しい順、同順位は ID の昇順 |

2つのリポジトリに共通する契約は次のとおり。

- エラー: `ConflictError`（同じ ID の `insert`、版の違う `save`）、`NotFoundError`（対象のない `save`）。保存先の障害の扱いはアダプターの責務で、契約の項目にしない
- 並行性: 対応を終える要求と確認の依頼の要求は、状態を変えるだけの要求で、版を含めない。ユースケースは `findById` が返した版で `save` する。すでにその状態であること（別のサービス運営者が先に対応を終えた、先に確認を依頼した）は、前提の変化として状態のエラー（`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`、`MODERATION_INFO_REPORT_ALREADY_RESOLVED`、`MODERATION_INFO_REPORT_NOT_OPEN`）で返し、同時の書き込みは `save` の楽観ロックで `ConflictError` になる。申立てと連絡は、内容を編集して保存する操作を持たない。申立てに基づく写真の削除は、申立てを読むだけで、申立ての版を進めない
- 可視性: コミットした書き込みは、以後の読み取りに即座に反映される。対応済みになった申立て・連絡は、次の `findOpen`・`findUnresolved` に現れない
- 参照整合性: 対象があること、示した写真が対象にあること、掲載が店舗に紐づくことは、提出のユースケースが書き込みの前に事実として読み、`submit` が判断する。提出の後に対象が削除されても、記録は残る

### ContentDirectory

目的: 対象（`ContentRef`）を、閲覧できるかどうかを問わず、名称と現在の写真に解決する。申立てと連絡の対象の解決と、Notification が通知に添える対象の名称・Application が申請を示す読み取りの対象の名称の解決に使う。掲載・店舗・地域・イベント・読みものにまたがる読み取りで、ドメインの語彙で定め、アダプターが実現する（index.md「読み取り」）。Moderation のユースケースが対象の名称と現在の写真を得るのは、この読み取りだけ（連絡の提出が掲載の紐づく店舗を読むのは Listing の `ListingRepository.findByIds`）。UnitOfWork に参加しない。

```ts
type ContentSummary = Readonly<{
  target: ContentRef;
  name: string | null; // 掲載・店舗・地域・イベントの名称、読みもののタイトル。未入力なら null
  photoIds: readonly PhotoId[]; // 対象の現在の写真。対象が持つ順
}>;

interface ContentDirectory {
  describe(targets: readonly ContentRef[]): Promise<readonly ContentSummary[]>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `describe` | 渡した対象のうち、存在するものを、名称と現在の写真とともに返す。存在しない対象（削除された対象を含む）は結果に含めない。公開状態、運営による非公開、店舗の非公開を問わず返す。写真は、対象が持つすべての写真の `PhotoId` を、対象が持つ順で返す。対象は `kind` と `id` の組で区別する。並び順は `target.kind`（`listing`、`place`、`region`、`occasion`、`article` の順）、次に `target.id` の昇順。`targets` は 0〜100 件。0件は空を返し、100件を超えると `BusinessRuleError`（`COMMON_INVALID_INPUT`）。コミットした書き込み（名称の更新、写真の追加・削除、対象の削除）は即座に反映される |

エラー: `BusinessRuleError`（`COMMON_INVALID_INPUT`。件数の超過）。

## トランザクション境界

| 書き込み | 1つの UnitOfWork で確定する範囲 |
| --- | --- |
| 申立ての提出 | 申立ての `insert`、`takedown_claim.submitted` の保存 |
| 申立ての対応を終える | 申立ての `save`、`takedown_claim.resolved` の保存 |
| 連絡の提出 | 連絡の `insert`、`info_report.submitted` の保存 |
| 確認の依頼 | 連絡の `save`、`info_report.confirmation_requested` の保存 |
| 連絡の対応を終える | 連絡の `save` |
| 申立てに基づく写真の削除（`takeDownPhotosByClaim`） | 対象の集約の `save`、`content.photos_taken_down` と `photos.released` の保存。公開していない状態になった掲載・地域・イベントは、`{domain}.unpublished` の保存も含む。申立ては読むだけで書き込まない |

- 結果のメールは、Notification が `takedown_claim.resolved` の消費で結果整合に送る。メールが送れなくても、対応済みは取り消さない。結果のメールの送信は、申立てを書き換えない
- 1つの申立てへの対応は、写真の削除（`takeDownPhotosByClaim`）、掲載・店舗の非公開（Listing の `suspendListing`、Place の `suspendPlace`）、対応を終える要求（`resolveTakedownClaim`）の、別々の UnitOfWork になる。写真の削除は確定の時点で反映し、対応を終える要求を待たない。申立ての提出と対応を終える要求の UnitOfWork は、対象の集約を書き換えない
- 連絡への対応に伴う権限の解除（Authority）と、店舗・掲載の更新（Place、Listing）は、それぞれのドメインの UnitOfWork で確定し、連絡の状態と結びつけない

## ユースケース（概要）

操作の可否は、操作する人の役割と管理体制を Authority のポートから読み、`AccessPolicy` で確かめる。申立て・連絡への対応と、その読み取りは `operate_service`、確認の依頼の読み取りは `act_as_place`（その店舗）で判断する。

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `submitTakedownClaim` | ログインなしで申立てを受け付ける。対象が閲覧できるかどうか（Discovery の `ReferenceQueries.isViewable`）と対象の現在の写真（`ContentDirectory.describe`）を読んで、事実として渡す。同じ ID で同じ内容の要求は成功として扱う | MOD-01 |
| `listOpenTakedownClaims` | 未対応の申立てを、対応を待ち始めた日時の古い順で、対象の名称と申立人のメールアドレスを添えて返す | OPE-01 |
| `getTakedownClaim` | 申立て1件を返す。対象の名称・現在の写真・対象があるかどうかは `ContentDirectory.describe` で、閲覧できるかどうかは `ReferenceQueries.isViewable` で補う | MOD-02 |
| `takeDownPhotosByClaim` | 申立てに基づいて、対象（掲載・店舗・地域・イベント・読みもの）から写真を1枚以上削除する。申立てを読んで `TakedownClaim.authorizePhotoRemoval` で確かめ、対象の種類で対象のドメインのリポジトリと集約の振る舞い `takeDownPhotos` を呼び分ける。申立ては書き込まない | MOD-02 |
| `resolveTakedownClaim` | 結果を添えて、申立ての対応を終える | MOD-02 |
| `submitInfoReport` | ログインした利用者の連絡を受け付ける。対象の店舗・掲載と店舗管理者の有無を読み、閲覧できるかどうか（読んだ集約に Discovery の `VisibilityPolicy` を当てる）、掲載が紐づく店舗、店舗管理者の有無を事実として渡す | MOD-04 |
| `listUnresolvedInfoReports` | 未対応と確認依頼中の連絡を、対応を待ち始めた日時の古い順で、対象の名称と連絡した人のメールアドレスを添えて返す | OPE-01 |
| `getInfoReport` | 連絡1件と、対象の名称と現在の状態、連絡した人のメールアドレス、対象の店舗の店舗管理者の有無を返す | MOD-05 |
| `requestInfoReportConfirmation` | 店舗管理者に確認を依頼し、連絡を確認依頼中にする | MOD-05 |
| `resolveInfoReport` | 連絡の対応を終える。未対応からも確認依頼中からも行える | MOD-05 |
| `listConfirmationRequestsForPlace` | 店舗管理者に、その店舗の確認依頼中の依頼を、対象の名称を添えて返す | MOD-06 |
| `getConfirmationRequest` | 店舗管理者に、依頼1件（対象とその名称、対象の掲載があるかどうか、連絡の種類と内容、確認依頼中か対応済みか）を返す。依頼を持たない連絡は `NotFoundError` | MOD-06 |

- 対象の名称は、ユースケースが `ContentDirectory.describe` で、閲覧できない対象を含めて解決する。連絡した人のメールアドレスは、Account の `AccountRepository.findByIds` で解決する。退会した人と削除された対象は、名称・メールアドレスなしで返す。Moderation のドメインの振る舞いは、これらのポートを呼ばない
- 申立てと連絡の入力を始められるかどうか（対象が閲覧できること、店舗管理者の有無）は、Discovery の詳細の読み取りが添える事実（手続きの入口の事実）で決まる。Moderation は入口のためのユースケースを持たず、提出の時点で同じ事実を確かめる
- 掲載・地域・イベントの運営による非公開と店舗の非公開（MOD-07、MOD-08、MOD-09）、写真を登録して再び公開する操作（MOD-03）は、対象のドメインのユースケースが持つ。申立てに基づく写真の削除（MOD-02）は `takeDownPhotosByClaim` が持ち、対象のドメインの集約の振る舞いを呼ぶ。対象のドメインは Moderation の型に依存しない
