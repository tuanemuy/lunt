# Moderation

取り下げの申立てと、情報の誤り・閉店の連絡の、受け付けから対応済みまでを管理する。共有カーネルの型（`TakedownClaimId`、`InfoReportId`、`ContentRef`、`PhotoId`、`PlaceId`、`ListingId`、`AccountId`、`EmailAddress`）、リポジトリの共通の契約、申立てに基づく写真の削除の分担は [index.md](index.md) が定める。

- 申立てと連絡は申請ではない。差し戻し・再提出・取り下げ・再申請・失効を持たず、Application の進み方と `Premise` を使わない（P-79、B-49、B-59）
- 措置そのもの（写真の削除、掲載の運営による非公開、店舗の非公開、管理者の権限の解除、店舗と掲載の更新）は、対象のドメインと Authority の振る舞いが行う。Moderation は、対応の記録、措置の前提の判断、申立人への結果のメールを持つ
- 対応（対応を終える、確認の依頼）はサービス運営者の役割で行う。可否は Authority の `AccessPolicy` が判断する。連絡を対応済みにするのはサービス運営者だけで、店舗管理者が連絡の状態を変える振る舞いはない
- 申立てと連絡を削除する振る舞いはない。対象が削除されても、連絡した人が退会しても、記録は残る

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| TakedownClaim | 取り下げの申立て | 店舗本人または写真の権利者が、ログインせずに、掲載・店舗の取り下げまたは写真の取り下げを求めるもの |
| Claimant | 申立人 | 申立てを出した人。アカウントを持たず、メールアドレスで連絡する |
| ClaimantStanding | 申立人の立場 | 店舗本人（`proprietor`）または写真の権利者（`photoRightsHolder`） |
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
    resolvedAt: Date;
    outcomeSentAt: Date | null;
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
| `outcome`、`resolvedAt` | `TakedownOutcome`、`Date` | 対応済みだけが持つ |
| `outcomeSentAt` | `Date \| null` | 対応済みだけが持つ。結果のメールの送信を記録した日時。記録する前は `null` |

#### 振る舞い

```ts
type TakedownClaimInput = Readonly<{
  id: string;
  standing: string;
  target: ContentRef;
  photoIds: readonly string[];
  reason: string;
  email: string;
}>;

type TakedownTargetFacts = Readonly<{
  viewable: boolean; // Discovery の ReferenceQueries.isViewable の結果
  photoIds: readonly PhotoId[]; // 対象の現在の写真
}>;
```

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `TakedownClaim.submit` | `input: TakedownClaimInput`, `facts: TakedownTargetFacts`, `now: Date` | `WithEventDrafts<OpenTakedownClaim, TakedownClaimSubmittedEvent>` | 値オブジェクトを組み立て、未対応の申立てを作る。対象が閲覧できなければ `BusinessRuleError`。写真の権利者が示した写真は、対象の現在の写真に含まれなければ `BusinessRuleError`。操作する人を取らない |
| `TakedownClaim.resolve` | `claim: TakedownClaim`, `outcome: string`, `now: Date` | `WithEventDrafts<ResolvedTakedownClaim, TakedownClaimResolvedEvent>` | 結果を添えて対応済みにする。`outcomeSentAt` は `null`。措置を行ったかどうかを問わない。結果が空なら `BusinessRuleError`。対応済みの申立てには `BusinessRuleError` |
| `TakedownClaim.recordOutcomeSent` | `claim: ResolvedTakedownClaim`, `now: Date` | `ResolvedTakedownClaim` | 結果のメールの送信を記録する（`outcomeSentAt` を `now` にする）。すでに記録があれば、同じ値を返し、版を進めない |
| `TakedownClaim.authorizePhotoRemoval` | `claim: TakedownClaim`, `owner: ContentRef` | `void` | 申立てに基づく写真の削除の前提を確かめる。写真を持つ各ドメイン（Place、Listing、Region、Occasion、Article）の写真の削除のユースケースが、`TakedownClaimRepository.findById` で申立てを読んで呼ぶ。申立てが未対応で、`owner` が申立ての対象と等しければ成立する。対応済みなら `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）、`owner` が対象と違えば `BusinessRuleError`（`TAKEDOWN_TARGET_MISMATCH`）。対応済みを先に判定する。削除できる写真は、申立人が示した写真に限らず、対象のどの写真でもよい |
| `TakedownClaim.sameSubmission` | `claim: TakedownClaim`, `input: TakedownClaimInput` | `boolean` | 立場・対象・写真・理由・メールアドレスが等しいかを返す。冪等な作成の判定に使う |
| `TakedownClaim.reconstruct` | 保存された値 | `TakedownClaim` | 値オブジェクトを通して組み立て直す |

エラー（すべて `BusinessRuleError`）は次のとおり。

| コード | 状況 |
| --- | --- |
| `TAKEDOWN_TARGET_UNAVAILABLE` | 提出の時点で対象が閲覧できない（非公開、公開していない状態、削除済み、存在しない） |
| `TAKEDOWN_PHOTO_NOT_IN_TARGET` | 示した写真が対象の現在の写真にない |
| `TAKEDOWN_CLAIM_ALREADY_RESOLVED` | 対応済みの申立てへの `resolve`・`authorizePhotoRemoval` |
| `TAKEDOWN_TARGET_MISMATCH` | `authorizePhotoRemoval` の `owner` が申立ての対象と違う |
| 値オブジェクトのコード | 立場と対象の組、写真の指定、理由、メールアドレス（共有カーネルの `EmailAddress`）、結果が規則を満たさない |

#### 不変条件

- 結果、対応した日時、結果のメールの送信の記録は、対応済みの申立てだけが持つ。対応済みの申立ては必ず結果を持つ
- 提出した内容は変わらない。申立人が申立てを取り消す振る舞いはない（P-47）
- 対応済みは終わりの状態で、未対応に戻らない

#### ライフサイクル

- 生成: `submit` で未対応として生まれる
- 遷移: `open → resolved`（`resolve`）。写真の削除と非公開の措置は、申立ての状態を変えない。結果のメールの送信の記録（`recordOutcomeSent`）は、`resolved` のまま `outcomeSentAt` だけを変える

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
    resolvedAt: Date;
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
| `resolvedAt` | `Date` | 対応済みだけが持つ |

#### 振る舞い

```ts
type InfoReportInput = Readonly<{
  id: string;
  target:
    | Readonly<{ kind: "place"; placeId: PlaceId }>
    | Readonly<{ kind: "listing"; listingId: ListingId }>;
  category: string;
  content: string;
}>;

type InfoReportSubmissionFacts = Readonly<{
  targetViewable: boolean; // 対象の店舗または掲載についての、Discovery の ReferenceQueries.isViewable の結果
  listingPlaceId: PlaceId | null; // 掲載が対象のとき、その掲載が紐づく店舗。掲載がない（削除済み）、または店舗が対象のときは null
  placeHasSteward: boolean; // 対象の店舗（掲載が対象のときは listingPlaceId の店舗）に店舗管理者がいる。店舗が決まらなければ false
}>;
```

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `InfoReport.submit` | `input: InfoReportInput`, `reporter: Actor`, `facts: InfoReportSubmissionFacts`, `now: Date` | `WithEventDrafts<OpenInfoReport, InfoReportSubmittedEvent>` | 未対応の連絡を作る。掲載が対象のときは、`facts.listingPlaceId` から `InfoReportTarget` を組み立てる。対象が閲覧できない、または対象の掲載がない（`listingPlaceId` が `null`）なら `BusinessRuleError`（`INFO_REPORT_TARGET_UNAVAILABLE`）。店舗に店舗管理者がいなければ `BusinessRuleError`（`INFO_REPORT_PLACE_WITHOUT_STEWARD`。連絡ではなく修正の申請の対象）。対象が閲覧できないことを、店舗管理者の有無より先に判定する |
| `InfoReport.requestConfirmation` | `report: InfoReport`, `facts: { placeHasSteward: boolean }`, `now: Date` | `WithEventDrafts<ConfirmationRequestedInfoReport, InfoReportConfirmationRequestedEvent>` | 未対応の連絡を確認依頼中にする。未対応でない連絡には `BusinessRuleError`（`INFO_REPORT_NOT_OPEN`）。店舗管理者がいなければ `BusinessRuleError`（`INFO_REPORT_PLACE_WITHOUT_STEWARD`）。連絡の状態を先に判定する。依頼は取り消せない |
| `InfoReport.resolve` | `report: InfoReport`, `now: Date` | `ResolvedInfoReport` | 未対応または確認依頼中の連絡を対応済みにする。確認依頼中の `request` を引き継ぐ。結果を持たない。対応済みの連絡には `BusinessRuleError`。ドメインイベントは出さない |
| `InfoReport.confirmationRequestOf` | `report: InfoReport` | `ConfirmationRequest \| null` | 確認の依頼を返す。店舗管理者が読めるのは、依頼を持つ連絡だけ |
| `InfoReport.sameSubmission` | `report: InfoReport`, `input: InfoReportInput`, `reporter: Actor` | `boolean` | 連絡した人・対象（種類と、店舗または掲載の ID）・種類・内容が等しいかを返す。冪等な作成の判定に使う。事実を取らないので、対象の掲載が削除された後の送り直しも判定できる |
| `InfoReport.reconstruct` | 保存された値 | `InfoReport` | 値オブジェクトを通して組み立て直す |

エラー（すべて `BusinessRuleError`）は次のとおり。

| コード | 状況 |
| --- | --- |
| `INFO_REPORT_TARGET_UNAVAILABLE` | 提出の時点で対象が閲覧できない（店舗の非公開、掲載の一時非公開・運営による非公開、削除済みの掲載、存在しない対象） |
| `INFO_REPORT_PLACE_WITHOUT_STEWARD` | 提出または確認の依頼の時点で、店舗に店舗管理者がいない |
| `INFO_REPORT_NOT_OPEN` | 未対応でない連絡への確認の依頼 |
| `INFO_REPORT_ALREADY_RESOLVED` | 対応済みの連絡への `resolve` |
| 値オブジェクトのコード | 種類、内容が規則を満たさない |

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
| `TakedownGround` | `TakedownGround.create(standing, target, photoIds)` で作る。店舗本人の対象は掲載と店舗だけで、写真を持たない。写真の権利者は写真を1枚以上示し、`PhotoId` は重複しない。規則を満たさなければ `BusinessRuleError`（`TAKEDOWN_GROUND_INVALID`） | 立場、対象、写真の集合の一致 |
| `TakedownReason` | 前後の空白を除いて1〜2,000文字 | 文字列の一致 |
| `TakedownOutcome` | 前後の空白を除いて1〜2,000文字 | 文字列の一致 |
| `InfoReportTarget` | `kind: "listing"` の `placeId` は、その掲載が紐づく店舗。`InfoReport.submit` が、ユースケースが掲載から読んだ事実（`listingPlaceId`）で組み立てる | すべてのフィールドの一致 |
| `InfoReportCategory` | 2つの値のどちらか | 値の一致 |
| `InfoReportContent` | 前後の空白を除いて1〜2,000文字 | 文字列の一致 |

`InfoReportTarget` が掲載の対象にも `placeId` を持つため、掲載が削除された後も、依頼の宛先の店舗と、店舗管理者が読む依頼の一覧が決まる。

## ドメインサービス

持たない。規則は2つの集約と値オブジェクトの純粋な関数で足りる。

## ドメインイベント

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `takedown_claim.submitted` | `{ claimId: TakedownClaimId; target: ContentRef; standing: "proprietor" \| "photoRightsHolder" }` | `TakedownClaim.submit` | Notification（サービス運営者への通知。P-97） |
| `takedown_claim.resolved` | `{ claimId: TakedownClaimId }` | `TakedownClaim.resolve` | Moderation（申立人への結果のメール） |
| `info_report.submitted` | `{ reportId: InfoReportId; target: InfoReportTarget; category: InfoReportCategory }` | `InfoReport.submit` | Notification（サービス運営者への通知。P-97） |
| `info_report.confirmation_requested` | `{ reportId: InfoReportId; target: InfoReportTarget; category: InfoReportCategory }` | `InfoReport.requestConfirmation` | Notification（その店舗のすべての店舗管理者への通知。P-93） |

`aggregateId` は `TakedownClaimId` または `InfoReportId`。連絡の対応済みは、連絡した人にも店舗管理者にも通知しないため、ドメインイベントを出さない。申立てによる写真の削除の通知は、対象のドメインのドメインイベント（読みものでは `article.photos_taken_down`）が担う。

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
- 並行性: 対応を終える要求と確認の依頼の要求は、状態を変えるだけの要求で、版を含めない。ユースケースは `findById` が返した版で `save` する。すでにその状態であること（別のサービス運営者が先に対応を終えた、先に確認を依頼した）は、前提の変化として状態のエラー（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`、`INFO_REPORT_ALREADY_RESOLVED`、`INFO_REPORT_NOT_OPEN`）で返し、同時の書き込みは `save` の楽観ロックで `ConflictError` になる。申立てと連絡は、内容を編集して保存する操作を持たない。申立てに基づく写真の削除は、申立てを読むだけで、申立ての版を進めない
- 可視性: コミットした書き込みは、以後の読み取りに即座に反映される。対応済みになった申立て・連絡は、次の `findOpen`・`findUnresolved` に現れない
- 参照整合性: 対象があること、示した写真が対象にあること、掲載が店舗に紐づくことは、提出のユースケースが書き込みの前に事実として読み、`submit` が判断する。提出の後に対象が削除されても、記録は残る

### TakedownOutcomeMailer

対応済みの申立ての結果を、申立人のメールアドレスに送る。

```ts
type TakedownOutcomeMessage = Readonly<{
  to: EmailAddress;
  target: ContentRef;
  receivedAt: Date;
  outcome: TakedownOutcome;
}>;

interface TakedownOutcomeMailer {
  send(message: TakedownOutcomeMessage): Promise<void>;
}
```

- `send` は、送信を引き受けた時点で成立する。引き受けられなければ `SystemError` で、同じ内容で送り直せる
- `send` は送るだけで、送信の重なりを除かない。重なりは、申立ての `outcomeSentAt` の記録を見て `sendTakedownOutcome` が除く
- 適合テストは、テスト用の実装では送信の記録で、本番の実装では送信先の検証用の環境で、同じケースを通す
- 文面と、対象を指す表現は、アダプターが `target` と `outcome` から組み立てる。受け付けのメールは送らない

サービス運営者への通知と、確認の依頼の通知は、Notification が届ける。Moderation はアカウント宛ての通知のポートを持たない。

## トランザクション境界

| 書き込み | 1つの UnitOfWork で確定する範囲 |
| --- | --- |
| 申立ての提出 | 申立ての `insert`、`takedown_claim.submitted` の保存 |
| 申立ての対応を終える | 申立ての `save`、`takedown_claim.resolved` の保存 |
| 連絡の提出 | 連絡の `insert`、`info_report.submitted` の保存 |
| 確認の依頼 | 連絡の `save`、`info_report.confirmation_requested` の保存 |
| 連絡の対応を終える | 連絡の `save` |
| 結果のメールの送信の記録 | 申立ての `save` |

- 結果のメールは、`takedown_claim.resolved` の消費で結果整合にする。メールが送れなくても、対応済みは取り消さず、リレーが再び配送する。送信の記録のある申立ての再配送は、メールを送らない。送信の引き受けの後に記録の保存が成立しなかった場合は、再配送で同じメールがもう1通届きうる（少なくとも1回の配送として許容する）
- 1つの申立てへの対応は、写真の削除（対象のドメイン）、非公開（対象のドメイン）、対応を終える要求の、別々の UnitOfWork になる。写真の削除は確定の時点で反映し、対応を終える要求を待たない。Moderation の UnitOfWork は対象の集約を書き換えない
- 連絡への対応に伴う権限の解除（Authority）と、店舗・掲載の更新（Place、Listing）は、それぞれのドメインの UnitOfWork で確定し、連絡の状態と結びつけない

## ユースケース（概要）

サービス運営者のユースケースは、書き込みの前に、操作する人の役割を Authority のポートから読み、`AccessPolicy` で確かめる。

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `submitTakedownClaim` | ログインなしで申立てを受け付ける。対象が閲覧できるかどうか（Discovery の `ReferenceQueries.isViewable`）と対象の現在の写真を読んで、事実として渡す。同じ ID で同じ内容の要求は成功として扱う | MOD-01 |
| `listOpenTakedownClaims` | 未対応の申立てを、対応を待ち始めた日時の古い順で、対象の名称を添えて返す | OPE-01 |
| `getTakedownClaim` | 申立て1件を返す。対象の名称・現在の写真・対象があるかどうかは対象のドメインのリポジトリで、閲覧できるかどうかは `ReferenceQueries.isViewable` で補う | MOD-02 |
| `resolveTakedownClaim` | 結果を添えて、申立ての対応を終える | MOD-02 |
| `sendTakedownOutcome` | `takedown_claim.resolved` を消費し、申立てを読んで、結果のメールを送り、送信を申立てに記録する。送信の記録のある申立てには送らない | MOD-02 |
| `submitInfoReport` | ログインした利用者の連絡を受け付ける。対象が閲覧できるかどうか（`ReferenceQueries.isViewable`）、掲載が紐づく店舗、店舗管理者の有無を読んで、事実として渡す | MOD-04 |
| `listUnresolvedInfoReports` | 未対応と確認依頼中の連絡を、対応を待ち始めた日時の古い順で、対象の名称と連絡した人のメールアドレスを添えて返す | OPE-01 |
| `getInfoReport` | 連絡1件と、対象の名称と現在の状態、連絡した人のメールアドレス、対象の店舗の店舗管理者の有無を返す | MOD-05 |
| `requestInfoReportConfirmation` | 店舗管理者に確認を依頼し、連絡を確認依頼中にする | MOD-05 |
| `resolveInfoReport` | 連絡の対応を終える。未対応からも確認依頼中からも行える | MOD-05 |
| `listConfirmationRequestsForPlace` | 店舗管理者に、その店舗の確認依頼中の依頼を、対象の名称を添えて返す | MOD-06 |
| `getConfirmationRequest` | 店舗管理者に、依頼1件（対象とその名称、対象の掲載があるかどうか、連絡の種類と内容、確認依頼中か対応済みか）を返す。依頼を持たない連絡は `NotFoundError`。操作する人がその店舗の管理権限を持つことを確かめる | MOD-06 |

- 対象の名称は、ユースケースが対象のドメインのリポジトリ（Place・Listing・Region・Occasion は `findByIds`、Article は `findById`）で、閲覧できない対象を含めて解決する。連絡した人のメールアドレスは、Account の `AccountRepository.findByIds` で解決する。退会した人と削除された対象は、名称・メールアドレスなしで返す。Moderation のドメインの振る舞いは、これらのポートを呼ばない
- 申立てと連絡の入力を始められるかどうか（対象が閲覧できること、店舗管理者の有無）は、Discovery の詳細の読み取りが添える事実（手続きの入口の事実）で決まる。Moderation は入口のためのユースケースを持たず、提出の時点で同じ事実を確かめる
- 申立てに基づく写真の削除（MOD-02）、掲載・地域・イベントの運営による非公開と店舗の非公開（MOD-07、MOD-08、MOD-09）、写真を登録して再び公開する操作（MOD-03）は、対象のドメインのユースケースが持つ。写真の削除のユースケースは、`TakedownClaimRepository.findById` で申立てを読み（なければ `NotFoundError`）、`TakedownClaim.authorizePhotoRemoval` を通してから対象の集約の振る舞いを呼ぶ。対象のドメインは Moderation の型に依存しない
