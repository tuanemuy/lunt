# Application

承認を求める8種の申請の内容と前提、確認中から承認・否認・取り下げ・失効までの進み方、承認者の判断を管理する。

共有カーネルの `ApplicationId`・`AccountId`・`PlaceId`・`ListingId`・`RegionId`・`OccasionId`・`PhotoId`・`ContentRef`・`StewardedRef`・`EmailAddress`・`LocalDate`・`Version`・`PhotosReleasedEvent`・`FieldPatch` を使う。申請の内容に Place の `PlaceProfile`・`PlaceState`・`PlaceRevision`（`FieldPatch<PlaceChange>`）、Listing の `ListingContent`・`PublishableListingContent`・`ListingPatch`（`FieldPatch<ListingChange>`）、Occasion の `ParticipationDetails`・`HoldingStatus` を使い、承認者の判断に Authority の `AccessDecision` を使う。申請を示す読み取りは、対象の名称を Moderation の `ContentDirectory` で読む。規約は [index.md](index.md) が定める。

Application が持たないもの: 承認で反映される内容そのもの（店舗、管理権限、所属、参加、掲載は、それぞれのドメインの集約の振る舞いが作る）、操作の可否（Authority の `AccessPolicy`）、閲覧できるかどうかの判定（Discovery の `VisibilityPolicy` と `ReferenceQueries.isViewable`。提出のユースケースが受け付ける条件の事実として読み、判断する人の読み取りが表示のために読む。承認の可否には使わない）、通知の宛先（Notification）、取り下げの申立てと情報の誤り・閉店の連絡（Moderation。申請の進み方を適用しない。P-79）。

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Application | 申請 | 承認者の承認を求める依頼。種類、申請者、内容、状態を持つ |
| ApplicationKind | 申請の種類 | 店舗の新規登録、情報修正（営業状況の変更を含む）、管理権限、所属、離脱、参加、掲載、掲載の修正の8種（P-70） |
| Applicant | 申請者 | 個人（アカウント）、または店舗管理者としての店舗。店舗管理者として行った申請は、その店舗のどの店舗管理者も扱う（P-76） |
| ApplicationTarget | 対象の指定 | 申請の種類、申請者、対象の ID の組。内容を作る前に入力から決まり、申請の間は変わらない |
| Content | 申請の内容 | 種類ごとに決まる、承認で反映される内容 |
| Companion | 併せた申請 | 登録申請と同時に出す管理権限の申請。登録申請とは別の申請で、登録申請を参照する（M-45）。取り下げ・否認・失効の後の再申請は、登録申請が承認されていない間は同じ登録申請を参照し、承認の後は登録申請を参照しない管理権限の申請になる（`ApplicationTarget.companion`） |
| Desired | 修正後の内容 | 情報修正・掲載の修正の申請の、提出・再提出で入力された修正後の内容の全体。申請の内容（変更する項目）はここから作る。冪等な作成の比較に使う |
| Reserved ID | 予約した ID | 登録申請の `reservedPlaceId` と掲載の申請の `reservedListingId`。提出のときに決まり、承認で作られる店舗・掲載の ID になる |
| Under review | 確認中 | 承認者の判断を待つ状態 |
| Return | 差し戻し | 承認者が、追加で必要な確認を添えて申請者に戻すこと |
| Resubmit | 再提出 | 申請者が、差し戻された申請の内容を直し、回答を添えて確認中に戻すこと |
| ReturnReply | 回答 | 再提出に添える、差し戻しの追加で必要な確認に答える自由記述。任意。最初の提出には添えない（P-71、P-72） |
| Reapplication | 再申請 | 否認・取り下げ・失効で終わった申請と同じ種類・同じ対象について、前の申請の内容から始めて新しい申請を提出すること（P-74）。前の申請の写真は複製して新しい申請に添える |
| Approve / Reject | 承認 / 否認 | 承認者の判断。承認は内容を反映し、否認は理由を持つ |
| Withdraw | 取り下げ | 申請者が申請をやめること。退会でも起きる（I-01） |
| Lapse | 失効 | 前提が成り立たなくなった申請が終わること |
| Active | 進行中 | 確認中または差し戻しの申請 |
| Premise | 前提 | 申請の種類ごとに決まる、申請が有効である条件（`spec/scenario/index.md`「申請の前提」） |
| Reassessment | 再評価 | 進行中の申請の前提を、その時点の事実で確かめ直すこと |
| Slot | 申請の枠 | 申請者・種類・対象の組。1つの枠に、進行中の申請は1つまで（I-10） |
| Admission | 受け付け | 新しい申請の提出を受け付ける条件（前提、閲覧できる対象、重ねた申請）を確かめた結果 |
| Subject | 関わる対象 | 申請が指す店舗・地域・イベント・掲載・登録申請 |
| ApproverSeat | 承認者の席 | 種類で決まる承認者の所在。サービス運営者、または対象の地域・イベントの運営者。運営者が不在のときのサービス運営者への切り替えは含まない |
| ReviewAs | 判断の立場 | 判断を、承認者として行ったか、期間超過の代行をするサービス運営者として行ったか |
| Absence proxy | 不在の代行 | index.md の用語。申請では、運営者が不在の地域・イベントへの申請を、サービス運営者が承認者として判断すること |
| Overdue proxy | 期間超過の代行 | index.md の用語。期間は `ReviewPolicy` の関数（`proxyableAt`・`overdueCutoff`）が決める |
| ReviewPolicy | 判断の設定値 | 期間超過の代行ができるようになるまでの期間 |
| Overdue notice | 期間超過の通知 | 期間超過の代行ができるようになった申請を、サービス運営者に知らせること（P-97） |

## エンティティ

### Application（集約）

集約ルート。種類ごとに、対象の指定と内容の組（`CaseOf<K>`）と、その種類がとりうる状態（`StatusOf<K>`）を持つ直和型。前提・閲覧できなければならない対象・枠・承認者の席は対象の指定（`ApplicationTarget`）だけから決まり、内容を使わない。

```ts
type ApplicationBase = Readonly<{
  id: ApplicationId;
  submittedAt: Date;          // 最初の提出の日時。再提出で変わらない
  version: Version;
}>;

type CaseFields = {
  registration: Readonly<{ reservedPlaceId: PlaceId; content: PlaceProfile }>;
  revision: Readonly<{ content: PlaceRevision; desired: PlaceState }>;
  stewardship: Readonly<{ content: StewardshipClaim }>;
  affiliation: Readonly<{ content: null }>;
  leave: Readonly<{ content: null }>;
  participation: Readonly<{ content: ParticipationDetails }>;
  listing: Readonly<{ reservedListingId: ListingId; content: PublishableListingContent }>;
  listingRevision: Readonly<{ placeId: PlaceId; content: ListingPatch; desired: ListingContent }>;
};

type CaseOf<K extends ApplicationKind> = Readonly<{ target: TargetOf<K> }> & CaseFields[K];
type ApplicationCase = { [K in ApplicationKind]: CaseOf<K> }[ApplicationKind];
type ContentOf<K extends ApplicationKind> = CaseOf<K>["content"];

type ApplicationOf<K extends ApplicationKind> = ApplicationBase & CaseOf<K> & Readonly<{ status: StatusOf<K> }>;
type Application = { [K in ApplicationKind]: ApplicationOf<K> }[ApplicationKind];

type UnderReviewApplication = Application & { status: { kind: "underReview" } };
type ReturnedApplication = Application & { status: { kind: "returned" } };
type ActiveApplication = UnderReviewApplication | ReturnedApplication;
type ClosedApplication = Application & { status: { kind: "rejected" | "withdrawn" | "lapsed" } };
```

| フィールド | 型 | 制約 |
| --- | --- | --- |
| `id` | `ApplicationId` | 不変 |
| `target` | `ApplicationTarget` | 不変。申請の種類（`target.kind`）、申請者（`target.applicant`）、対象の ID |
| `reservedPlaceId`・`reservedListingId` | `PlaceId`・`ListingId` | 不変。予約した ID。提出のユースケースが `IdGenerator` の値を渡す。承認は、この ID で店舗・掲載を作る |
| `placeId`（掲載の修正） | `PlaceId` | 不変。対象の掲載が紐づく店舗。提出のユースケースが、読んだ掲載の `placeId` を渡す |
| `content` | 種類ごとの内容 | 再提出だけが変える。所属・離脱は内容を持たない（`null`） |
| `desired`（情報修正、掲載の修正） | `PlaceState`・`ListingContent` | 修正後の内容。`content` は、これと対象のその時点の内容を `FieldPatch.between` で比べて作った値。`content` とともに再提出だけが変える。冪等な作成の比較（`matchesSubmission`）だけに使う |
| `status` | `StatusOf<K>` | 「ライフサイクル」の遷移だけを取る。種類ごとにとりうる状態は「ApplicationStatus / ReviewAs」 |
| `submittedAt` | `Date` | 不変。申請者の一覧の「提出の新しい順」の基準 |
| `version` | `Version` | 提出の時点は初期値。進み方は index.md「リポジトリの共通の契約」による |

#### 振る舞い

すべて純粋な関数。版の進み方は index.md「リポジトリの共通の契約」による。前提・閲覧できるか・重ねた申請の有無は、ユースケースが読んだ事実を受け取る。状態を限る振る舞いは、その状態の申請の型（`UnderReviewApplication`・`ReturnedApplication`・`ActiveApplication`・`ClosedApplication`）を引数に取り、ユースケースは `requireUnderReview`・`requireReturned`・`requireActive`・`requireClosed` で確かめた申請を渡す。

| メソッド | 引数 | 戻り値 | 処理内容 |
| --- | --- | --- | --- |
| `submit` | `params: { id: ApplicationId; admission: Admission<K>; reserved: ReservedOf<K>; content: ContentOf<K> } & DesiredOf<K>`, `now: Date` | `WithEventDrafts<UnderReviewApplication, ApplicationSubmittedEvent> & { claimedPhotoIds: readonly PhotoId[] }` | 確認中の申請を作る（`since` と `submittedAt` は `now`、`answering` は `null`）。回答を持たない。対象の指定は `admission.target`。`Admission` は `SubmissionScope.admit` だけが作るので、受け付ける条件（前提、閲覧できる対象、重ねた申請）を確かめずに提出できない。`ReservedOf<K>` は、登録は `{ reservedPlaceId }`、掲載は `{ reservedListingId }`、掲載の修正は `{ placeId }`、ほかの種類は `{}`。`DesiredOf<K>` は、情報修正は `{ desired: PlaceState }`、掲載の修正は `{ desired: ListingContent }`、ほかの種類は `{}`。`claimedPhotoIds` は `ApplicationCase.ownedPhotoIds` のすべて。再申請も同じ振る舞いで、前の申請との結びつきを持たない（前の申請の写真は、複製した別の写真として添えられる） |
| `matchesSubmission` | `app: Application`, `request: SubmissionRequest` | `boolean` | 冪等な作成の「同じ内容」の判定。送られてきた要求（`SubmissionRequest`）と保存されている申請だけを比べ、対象の現在の状態を使わない。比べ方は「SubmissionRequest」の表 |
| `requireUnderReview` | `app: Application` | `UnderReviewApplication` | 確認中でなければ、下の表の現在の状態のコードの `BusinessRuleError`。差し戻し・否認・承認のユースケースが使う |
| `requireReturned` | `app: Application` | `ReturnedApplication` | 差し戻しでなければ、現在の状態のコードの `BusinessRuleError`。再提出のユースケースが使う |
| `requireActive` | `app: Application` | `ActiveApplication` | 進行中でなければ、現在の状態のコードの `BusinessRuleError`。取り下げのユースケースが使う |
| `requireClosed` | `app: Application` | `ClosedApplication` | 否認・取り下げ・失効でなければ、現在の状態のコードの `BusinessRuleError`。再申請を始めるユースケースが使う |
| `sendBack` | `app: UnderReviewApplication`, `as: "approver"`, `request: ReturnRequest`, `now: Date` | `WithEventDrafts<ReturnedApplication, ApplicationReturnedEvent>` | 差し戻しにする。差し戻せるのは承認者だけで、`as` は `ApproverPolicy.returnAs` の結果（期間超過の代行は型で渡せない）。追加で必要な確認は引数の型で必須 |
| `resubmit` | `app: ReturnedApplication & CaseOf<K>`, `amended: { content: ContentOf<K>; reply: ReturnReply \| null } & DesiredOf<K>`, `premise: PremiseHolds`, `now: Date` | `WithEventDrafts<UnderReviewApplication, ApplicationResubmittedEvent \| PhotosReleasedEvent> & { claimedPhotoIds: readonly PhotoId[] }` | 内容（情報修正・掲載の修正は `desired` も）を置き換え、確認中に戻す（`since` は `now`、`answering` は差し戻しの `request` と `reply`）。対象の指定、予約した ID、掲載の修正の `placeId` は引数になく、変わらない。所属・離脱は内容を持たないので、回答だけを添える。`claimedPhotoIds` は新しい内容の `ownedPhotoIds` のうち前の内容の `ownedPhotoIds` になかった写真。前の内容の `ownedPhotoIds` にあって新しい内容の `ownedPhotoIds` にない写真を `photos.released` で返す |
| `approve` | `app: UnderReviewApplication & ApplicationOf<K>`, `as: ReviewAsOf<K>`, `premise: PremiseHolds`, `now: Date` | `WithEventDrafts<ApplicationOf<K>, ApplicationApprovedEvent>` | 承認にする（状態は「ApplicationStatus / ReviewAs」の、その種類の `approved`）。申請が持ち主の写真（`ApplicationCase.ownedPhotoIds`）は、すべて反映先の写真になる（持ち主の付け替えは、ユースケースが Media の `PhotoOwnership.transferAll` で行う）。写真を手放さない。申請者が判断する人と同じアカウントでも成立する（P-04、B-42） |
| `reject` | `app: UnderReviewApplication & ApplicationOf<K>`, `as: ReviewAsOf<K>`, `reason: RejectionReason`, `now: Date` | `WithEventDrafts<ApplicationOf<K>, ApplicationRejectedEvent>` | 否認にする。理由は引数の型で必須（B-22）。写真を手放さない |
| `withdraw` | `app: ActiveApplication`, `now: Date` | `WithEventDrafts<Application, ApplicationWithdrawnEvent>` | 取り下げにする。写真を手放さない。申請者の操作と、退会の消費の両方が使う |
| `reassess` | `app: ActiveApplication & ApplicationOf<K>`, `result: PremiseResultOf<K>`, `now: Date` | `WithEventDrafts<ApplicationOf<K>, ApplicationLapsedEvent>` | `result.holds` が `true` なら、`app` をそのまま返し、ドメインイベントを出さない。`false` なら失効にする（`brokenPremises` は `result.broken`）。前提を持たない種類（登録）の `result` は、型で `PremiseHolds` だけになる。写真を手放さない。ドメインイベントの消費、再提出、承認が使う |
| `isHandledBy` | `app: Application`, `acting: ActingApplicant` | `boolean` | その人が申請を扱える（確かめる、再提出する、取り下げる、再申請を始める）かどうか。個人の申請は `accountId` の一致、店舗管理者として行った申請は `placeId` の一致。`false` のとき、ユースケースが `ForbiddenError` を投げる |
| `requireApplicantAccount` | `app: ApplicationOf<"stewardship">`, `account: { accountId: AccountId; email: EmailAddress } \| null` | `{ accountId: AccountId; email: EmailAddress }` | 管理権限の承認で就任する人（`Stewardship.appointByApproval` の `appointee`）を返す。`account` は、ユースケースが Account のポートから読んだ申請者のアカウント。`null`（申請者が退会している）なら `BusinessRuleError`（`APPLICATION_APPLICANT_WITHDRAWN`）。申請は確認中のまま残り、`account.withdrawn` の消費が取り下げる |
| `slotOf` | `app: Application` | `ApplicationSlot \| null` | 申請の枠を返す（`ApplicationSlot.of(app.target)`） |
| `subjects` | `case: ApplicationCase` | `readonly ApplicationSubject[]` | 関わる対象を返す（`ApplicationSubject` の表） |
| `approverSeat` | `app: Application` | `ApproverSeat` | 承認者の席を返す（`ApproverPolicy.seatOf(app.target)`） |
| `reflectedRef` | `case: ApplicationCase` | `ContentRef` | 承認で反映された先。登録は予約した `reservedPlaceId` の店舗、情報修正・管理権限は `target.placeId` の店舗、掲載は予約した `reservedListingId` の掲載、掲載の修正は `target.listingId` の掲載、所属・離脱は地域、参加はイベント |
| `reconstruct` | 永続化された値 | `Application` | 不変条件を検証して復元する。失敗は `RehydrationError` |

状態が合わない操作は、現在の状態を表すコードの `BusinessRuleError` になる。コードは、別の人が先に操作した（承認、否認、取り下げ、再提出、差し戻し）のか、前提を欠いて失効したのかを区別する。状態とコードの対応は、`requireUnderReview`・`requireReturned`・`requireActive`・`requireClosed` だけが持つ。

| 現在の状態 | コード | 投げる関数 |
| --- | --- | --- |
| 確認中 | `APPLICATION_UNDER_REVIEW` | `requireReturned`、`requireClosed` |
| 差し戻し | `APPLICATION_RETURNED` | `requireUnderReview`、`requireClosed` |
| 承認 | `APPLICATION_ALREADY_APPROVED` | 4つのすべて |
| 否認 | `APPLICATION_ALREADY_REJECTED` | `requireUnderReview`、`requireReturned`、`requireActive` |
| 取り下げ | `APPLICATION_ALREADY_WITHDRAWN` | 同上 |
| 失効 | `APPLICATION_ALREADY_LAPSED` | 同上 |

再提出・取り下げ・差し戻し・否認・承認の要求は、操作する人が申請を確かめたときの版を含む（index.md「編集の競合」）。ユースケースは、状態を先に確かめ、次に保存されている版と比べ、違えば `ConflictError` にする。再提出で内容が変わった申請を、前の内容を見たまま判断することはできない。

#### 不変条件

- 種類と申請者の組は `ApplicationTarget` の型のとおり。店舗管理者として行えるのは所属・離脱・参加だけで、参加は店舗管理者としてだけ行える（E-05）
- 店舗管理者として行った申請の `target.applicant.placeId` は、`target.placeId` と一致する（`ApplicationTarget.byPlace` が両方を同じ値から作る）
- 承認・否認・取り下げ・失効の申請は、それ以上変わらない
- 否認は理由を、差し戻しは追加で必要な確認を、失効は成り立たなくなった前提を1つ以上持つ
- 確認中の申請の内容は変えられない。変えられるのは、差し戻しからの再提出だけ（P-72）。回答は再提出にだけ添える
- 申請が持ち主の写真は `ApplicationCase.ownedPhotoIds` のとおり。再提出で内容から外した写真は手放す。承認では、申請が持ち主のすべての写真の持ち主が反映先に替わる。否認・取り下げ・失効で終わった申請は写真を手放さず、内容の写真はすべて残る
- 種類と状態の組は `StatusOf<K>` のとおり。承認者の席が `operator` の種類の承認・否認は判断の立場を持たず、登録の判断待ちは管理権限の種類だけに当たり（`ReviewPermissionOf<K>`）、失効は前提を持つ種類だけがとり、`brokenPremises` はその申請の `Premise.required(target)` の鍵だけを持つ
- 併せた管理権限の申請と登録申請は、申請者が同じで、併せた申請の `target.placeId` は登録申請の `reservedPlaceId` と同じ（`ApplicationTarget.companion` だけが、`registrationId` を持つ対象の指定を作る）
- 申請の対象が運営による非公開・店舗の非公開になっても、状態は変わらない

#### ライフサイクル

- 生成: `submit` で確認中として作る。差し戻しと再提出を経ても、同じ申請のまま
- 遷移: `underReview → returned`（`sendBack`）、`returned → underReview`（`resubmit`）、`underReview → approved`（`approve`）、`underReview → rejected`（`reject`）、`underReview`・`returned → withdrawn`（`withdraw`）、`underReview`・`returned → lapsed`（`reassess`）
- 終わり: `approved`・`rejected`・`withdrawn`・`lapsed`。削除しない。失効した申請は、前提が再び成り立っても戻らない（I-08）
- 再申請は新しい申請で、前の申請はそのまま残る。前の申請の写真は、前の申請が持ち主のまま残り、再申請には複製した写真を添える（1つの写真の持ち主は1つ以下）

## 値オブジェクト

### Applicant / ActingApplicant

```ts
type IndividualApplicant = Readonly<{ kind: "individual"; accountId: AccountId }>;
type PlaceApplicant = Readonly<{ kind: "place"; placeId: PlaceId }>;
type Applicant = IndividualApplicant | PlaceApplicant;

type ActingApplicant =
  | Readonly<{ kind: "individual"; accountId: AccountId }>
  | Readonly<{ kind: "steward"; accountId: AccountId; placeId: PlaceId }>;
```

- 店舗管理者として行った申請は、提出した店舗管理者を持たない。提出した人が辞任しても退会しても、他の店舗管理者がいる間は続く（P-76）
- `ActingApplicant` の `steward` は、ユースケースが `AccessPolicy.decide`（`act_as_place`）の結果が `allowed` であることを確かめて作る。作れる人は `AccessPolicy` だけが決める
- 等価性: すべてのフィールドの一致

### ApplicationTarget

```ts
type ApplicationTarget =
  | Readonly<{ kind: "registration"; applicant: IndividualApplicant }>
  | Readonly<{ kind: "revision"; applicant: IndividualApplicant; placeId: PlaceId }>
  | Readonly<{ kind: "stewardship"; applicant: IndividualApplicant; placeId: PlaceId; registrationId: ApplicationId | null }>
  | Readonly<{ kind: "affiliation"; applicant: Applicant; placeId: PlaceId; regionId: RegionId }>
  | Readonly<{ kind: "leave"; applicant: Applicant; placeId: PlaceId; regionId: RegionId }>
  | Readonly<{ kind: "participation"; applicant: PlaceApplicant; placeId: PlaceId; occasionId: OccasionId }>
  | Readonly<{ kind: "listing"; applicant: IndividualApplicant; placeId: PlaceId }>
  | Readonly<{ kind: "listingRevision"; applicant: IndividualApplicant; listingId: ListingId }>;

type ApplicationKind = ApplicationTarget["kind"];
type TargetOf<K extends ApplicationKind> = Extract<ApplicationTarget, { kind: K }>;
```

申請の種類、申請者、対象の ID の組。内容を作る前に、入力だけから決まる。前提（`Premise`）、閲覧できなければならない対象と受け付ける条件（`SubmissionScope`）、枠（`ApplicationSlot`）、承認者の席（`ApproverPolicy.seatOf`）は、この値だけを引数に取る。

- `registrationId` は、併せた登録申請。登録申請に併せない管理権限の申請は `null`
- 掲載の修正の対象の指定は、店舗を持たない。掲載が紐づく店舗は、掲載を読んで決まる（`ApplicationCase` の `placeId`）
- `ApplicationTarget.byIndividual(accountId: AccountId, input)`: 個人の申請の対象の指定を作る。`input` は、種類と対象の ID（登録は種類だけ）。`registrationId` は `null`
- `ApplicationTarget.byPlace(placeId: PlaceId, input: { kind: "affiliation" | "leave"; regionId: RegionId } | { kind: "participation"; occasionId: OccasionId })`: 店舗管理者として行う申請の対象の指定を作る。`applicant` と `placeId` を同じ `placeId` から作る
- `ApplicationTarget.companion(registration: ApplicationOf<"registration">, accountId: AccountId): TargetOf<"stewardship"> | null`: 登録申請を参照する管理権限の申請の対象の指定を作る。`placeId` は `registration.reservedPlaceId`。`registrationId` は、登録申請が承認されていなければ `registration.id`、承認されていれば `null`（予約した ID の店舗への、`byIndividual` と同じ対象の指定。閲覧できなければならない対象と前提は、ふつうの管理権限の申請と同じになる）。登録申請の申請者が `accountId` の個人でなければ `null`（ユースケースは、登録申請がない場合と同じ `NotFoundError` にする）。登録申請と同時の提出、その再送、登録申請を参照する提出（併せた申請の再申請）、申請を始められるかの確認、再申請の用意が使う
- 等価性: すべてのフィールドの一致

### 種類ごとの内容

| 種類 | 内容 | 作る関数 |
| --- | --- | --- |
| 登録 | `PlaceProfile` | `PlaceProfile.create` |
| 情報修正 | `PlaceRevision` | `FieldPatch.between(PlaceRevision.schema, …)`（店舗の現在の内容と、入力された内容を比べる） |
| 管理権限 | `StewardshipClaim` | `StewardshipClaim.create` |
| 所属、離脱 | なし（`null`） | |
| 参加 | `ParticipationDetails` | `ParticipationDetails.create`（`current` は、提出では `null`、再提出では差し戻された申請の内容。申請に添えた掲載は、添えられる掲載でなくなっても添えたまま再提出できる） |
| 掲載 | `PublishableListingContent` | `ListingContent.toPublishable` |
| 掲載の修正 | `ListingPatch` | `FieldPatch.between(ListingPatch.schema, …)`（掲載の現在の内容と、入力された内容を比べる） |

- 内容の値は、対象のドメインの関数で作る。名称・所在地・位置を欠く登録、何も変えない修正、公開条件を欠く掲載、開催期間の外の参加日は、これらの関数が拒む（M-27、M-34）
- 登録申請は、併せた申請への参照を持たない。登録申請から併せた申請へは、`ApplicationRepository.findPageBySubject`（`registration`）でたどる。登録申請が承認されていない間の、併せた申請の取り下げ・否認・失効の後の再申請は、同じ登録申請を参照する新しい申請になるので、1つの登録申請を参照する管理権限の申請は複数ありうる。進行中のものは、枠により1つまで
- 登録申請の「併せた申請」は、その登録申請を参照する管理権限の申請のうち、`findPageBySubject`（`registration`）の並びの先頭の1件（進行中のものがあればそれ、なければ最も新しく提出されたもの）。登録申請の読み取りと承認の出力が示す併せた申請は、どれもこの1件
- 掲載の申請の内容のカテゴリーと、掲載の修正の申請がカテゴリーを変える項目は、提出と再提出のユースケースが Listing の `CategoryCatalog.requireActive` で現役であることを確かめる（廃止済みなら `LISTING_CATEGORY_NOT_AVAILABLE`）。提出の後に廃止されたカテゴリーは、申請の内容を書き換えず、読み取りと承認が `CategoryCatalog.resolve` で現役のカテゴリーにする
- `ApplicationCase.ownedPhotoIds(case): readonly PhotoId[]`: 申請が持ち主の写真。登録は `content.photos` のすべて、情報修正は `FieldPatch.addedPhotoIds(PlaceRevision.schema, content)`、掲載の修正は `FieldPatch.addedPhotoIds(ListingPatch.schema, content)`、掲載は `content.photos` のすべて、ほかの種類は空
- 等価性: すべての項目の一致（対象のドメインの値オブジェクトの等価性による）

### SubmissionRequest

```ts
type SubmissionRequest =
  | Readonly<{ target: TargetOf<"registration">; content: PlaceProfile }>
  | Readonly<{ target: TargetOf<"revision">; desired: PlaceState }>
  | Readonly<{ target: TargetOf<"stewardship">; content: StewardshipClaim }>
  | Readonly<{ target: TargetOf<"affiliation"> }>
  | Readonly<{ target: TargetOf<"leave"> }>
  | Readonly<{ target: TargetOf<"participation">; listingIds: readonly ListingId[]; dates: readonly LocalDate[] }>
  | Readonly<{ target: TargetOf<"listing">; content: ListingContent }>
  | Readonly<{ target: TargetOf<"listingRevision">; desired: ListingContent }>;
```

冪等な作成（index.md「リポジトリの共通の契約」）で、同じ ID の申請が保存されているときに比べる、送られてきた要求。提出のユースケースが、入力と、入力だけから値を作る関数（`ApplicationTarget` の関数、`PlaceProfile.create`、`StewardshipClaim.create`、`ListingContent.create`、町域の解決の `AreaCatalog.findTown`）で作る。対象の現在の状態を使う検査（受け付ける条件、`FieldPatch.between`、`ParticipationDetails.create`、`CategoryCatalog.requireActive`）を通さない。情報修正と掲載の修正の `desired` は、入力された修正後の内容で、保存されている申請の `desired` と比べる。

| 種類 | `Application.matchesSubmission` が `true` になる条件 |
| --- | --- |
| すべて | 保存されている申請の `target` と `request.target` が等しい。管理権限は `registrationId` を比べず、申請者と `placeId` を比べる（登録申請の承認の後は、同じ要求から作る対象の指定の `registrationId` が `null` になる。`ApplicationTarget.companion`）。予約した ID と、掲載の修正の `placeId` は比べない |
| 登録、管理権限、掲載 | `content` が保存されている内容と等しい（対象のドメインの値オブジェクトの等価性。掲載は `ListingContent` の等価性） |
| 所属、離脱 | 対象の指定だけを比べる |
| 参加 | `listingIds`（添えた順で、重複を除く）と `dates`（重複を除いて昇順）が、保存されている `ParticipationDetails` と等しい |
| 情報修正、掲載の修正 | `desired` が、保存されている申請の `desired` と等しい（対象のドメインの値オブジェクトの等価性。`PlaceState` は `profile` と `operatingStatus` の両方）。変更する項目だけでなく、入力の全体を比べる |

### StewardshipClaim

```ts
type ClaimText = string & { readonly [claimTextBrand]: true };
type StewardshipClaim = Readonly<{
  relationship: ClaimText;   // 店舗との関係
  evidence: ClaimText;       // 確認に使える連絡先または資料。文章で記す
}>;
```

`StewardshipClaim.create(input: { relationship: string; evidence: string })`: 前後の空白を除き、どちらかが空なら `BusinessRuleError`（`APPLICATION_INVALID_STEWARDSHIP_CLAIM`）。ファイルを持たない。等価性は両方の一致。

### ReturnReply / ReturnRequest / RejectionReason

```ts
type ReturnReply = string & { readonly [returnReplyBrand]: true };         // 回答
type ReturnRequest = string & { readonly [returnRequestBrand]: true };     // 追加で必要な確認
type RejectionReason = string & { readonly [rejectionReasonBrand]: true }; // 否認の理由
```

- どれも `create(input: string)` が前後の空白を除く。結果が空なら `BusinessRuleError`（`APPLICATION_INVALID_RETURN_REPLY`、`APPLICATION_INVALID_RETURN_REQUEST`、`APPLICATION_INVALID_REJECTION_REASON`）
- 回答の未入力は `null` で表し、空の文字列を持たない
- 等価性: 値の一致

### ApplicationStatus / ReviewAs

```ts
type ReviewAs = "approver" | "overdue_proxy";

type StewardSeatKind = "affiliation" | "leave" | "participation"; // 承認者の席が steward の種類
type ReviewAsOf<K extends ApplicationKind> = K extends StewardSeatKind ? ReviewAs : "approver";

type ActiveStatus =
  | Readonly<{ kind: "underReview"; since: Date; answering: Readonly<{ request: ReturnRequest; reply: ReturnReply | null }> | null }>
  | Readonly<{ kind: "returned"; request: ReturnRequest }>;

type DecisionOf<K extends ApplicationKind> = K extends StewardSeatKind
  ?
      | Readonly<{ kind: "approved"; reviewAs: ReviewAs }>
      | Readonly<{ kind: "rejected"; reason: RejectionReason; reviewAs: ReviewAs }>
  :
      | Readonly<{ kind: "approved" }>
      | Readonly<{ kind: "rejected"; reason: RejectionReason }>;

type LapsedOf<K extends ApplicationKind> = [PremiseKeyOf<K>] extends [never]
  ? never
  : Readonly<{ kind: "lapsed"; brokenPremises: readonly [PremiseKeyOf<K>, ...PremiseKeyOf<K>[]] }>;

type StatusOf<K extends ApplicationKind> =
  | ActiveStatus
  | DecisionOf<K>
  | Readonly<{ kind: "withdrawn" }>
  | LapsedOf<K>;

type ApplicationStatus = StatusOf<ApplicationKind>;
```

- `since` は確認中になった日時（提出または再提出）。期間超過の代行の期間（`ReviewPolicy.proxyableAt`）と、承認者の一覧の「待ち始めた日時」の基準（I-13）
- `answering` は、再提出された申請が答えている、前の差し戻しの追加で必要な確認と、再提出に添えた回答。承認者が併せて確かめる。最初の提出は `null`。確認中の状態だけが持ち、確認中でない申請（差し戻し・承認・否認・取り下げ・失効）は回答を持たない
- `reviewAs` は、承認者の判断と期間超過の代行を区別する（期間超過の代行で判断された申請はそれと分かる）。期間超過の代行は承認者の席が `steward` の種類にだけあるので、`reviewAs` はその種類の承認・否認だけが持つ。承認者の席が `operator` の種類の承認・否認は、承認者の判断。不在の代行をするサービス運営者は承認者なので `"approver"`。差し戻しは承認者だけが行うので、差し戻しの状態は立場を持たない
- 失効（`lapsed`）は、前提を持つ種類（登録を除く7種）だけがとる。`PremiseKeyOf<K>` は「Premise」の表の、その種類に当たりうる鍵
- 判断の振る舞い（`approve`・`reject`・`sendBack`）に渡す立場は、`ApproverPolicy.reviewAs`・`returnAs` の結果

### ApplicationSlot

```ts
type ApplicationSlot =
  | Exclude<ApplicationTarget, { kind: "registration" | "listing" | "stewardship" }>
  | Readonly<{ kind: "stewardship"; applicant: IndividualApplicant; placeId: PlaceId }>;
```

- 同じ申請者・同じ種類・同じ対象を表す。管理権限の枠は、併せた登録申請（`registrationId`）を持たない（併せた管理権限の申請と、同じ店舗への管理権限の申請は同じ枠）。店舗管理者として行う申請は、店舗を1人の申請者として数える（P-74、I-10）。別の申請者の枠は別の枠（P-75）
- 新しく対象を作る申請（登録、掲載）は枠を持たず、重ねて申請できる（I-10）
- `ApplicationSlot.of(target: ApplicationTarget): ApplicationSlot | null`: 対象の指定から枠を求める唯一の場所。登録と掲載は `null`。管理権限は `registrationId` を除く。`Application.slotOf` は同じ関数の結果を返す
- `ApplicationSlot.key(slot): string`: 申請者・種類・対象の ID から、枠を一意に表す文字列を作る。等価性はすべてのフィールドの一致で、`key` の一致と同じ。`ApplicationRepository` が一意性の判定に使う

### ApplicationSubject

```ts
type ApplicationSubject =
  | Readonly<{ kind: "place"; id: PlaceId }>
  | Readonly<{ kind: "region"; id: RegionId }>
  | Readonly<{ kind: "occasion"; id: OccasionId }>
  | Readonly<{ kind: "listing"; id: ListingId }>
  | Readonly<{ kind: "registration"; id: ApplicationId }>;
```

`Application.subjects` が返す値。

| 種類 | 関わる対象 |
| --- | --- |
| 登録 | `place`（`reservedPlaceId`） |
| 情報修正、掲載 | `place`（`target.placeId`） |
| 管理権限 | `place`。併せた申請は `registration`（`target.registrationId`）も |
| 所属、離脱 | `place`、`region` |
| 参加 | `place`、`occasion` |
| 掲載の修正 | `place`（`ApplicationCase` の `placeId`）、`listing` |

### 申請の対象の名称

申請を示す読み取り（申請者の一覧と詳細、承認者の一覧と詳細、対象を管理する人の一覧）と、Notification の通知が示す申請の対象の名称は、この規則だけで決まる。

- 対象の名称は、`Application.subjects` の店舗・地域・イベント・掲載ごとの名称。`registration` は名称を持たない
- 対象がまだない申請は、名称を申請の内容から取り、承認で店舗・掲載が作られた後もそのまま使う。店舗の登録申請は `content`（`PlaceProfile`）の名称を店舗の名称にする。掲載の申請は `content`（`PublishableListingContent`）の名称を掲載の名称にし、店舗の名称はその店舗の名称。登録申請に併せた管理権限の申請は、併せた登録申請の `content` の名称を店舗の名称にする
- ほかの申請は、読んだ時点の対象の名称。読んだ時点の名称（掲載の申請の店舗の名称を含む）は、閲覧できるかどうかを問わず、Moderation の `ContentDirectory.describe` の `name` だけで決まる。結果にない対象（削除された掲載）は名称を持たず、名称を添えずに示す

### まだない対象

申請を示す読み取り（申請者の一覧と詳細、承認者の一覧と詳細）は、`Application.subjects` の店舗のうち次のものを「対象はまだない」として示す。どちらも予約した ID の店舗で、登録申請の承認がその店舗を作る。閲覧できるかどうかを問わず（`ReferenceQueries.isViewable` で読まない）、名称は上の「申請の対象の名称」の規則で申請の内容から取る。

- 登録申請の `place`（`reservedPlaceId`）: その登録申請が承認されていない間
- 登録申請に併せた管理権限の申請の `place`: 併せた登録申請（`target.registrationId`）が承認されていない間

ユースケースは、併せた登録申請の状態を `ApplicationRepository.findById`・`findByIds` で読んで判定する。

### ApproverSeat / SubmissionTarget

```ts
type ApproverSeat =
  | Readonly<{ kind: "operator" }>
  | Readonly<{ kind: "steward"; target: Extract<StewardedRef, { kind: "region" | "occasion" }> }>;

type SubmissionTarget = Extract<ContentRef, { kind: "place" | "listing" | "region" | "occasion" }>;
```

`ApproverSeat` は対象の指定だけで決まり、申請の間は変わらない。`steward` の対象に運営者が不在のとき、サービス運営者が承認者になることは、`ApproverPolicy.decide`（判断の可否）、`ApplicationReviewDesk`（対応を待つ申請）、Notification の宛先の決め方が、それぞれ管理体制の事実から決める。

### PremiseKey / PremiseFacts / PremiseResult

```ts
type PremiseKey =
  | "placeHasNoSteward"     // その店舗に店舗管理者がいない
  | "placeHasSteward"       // その店舗に店舗管理者がいる
  | "listingExists"         // 対象の掲載がある
  | "notAffiliated"         // その店舗とその地域の所属がまだない
  | "affiliated"            // その所属がある
  | "occasionOpen"          // イベントが終了・中止でない（開催期間のないイベントを含む）
  | "notParticipating"      // その店舗の参加がまだない
  | "applicantNotSteward"   // 申請者がその店舗の店舗管理者でない
  | "registrationStanding"; // 併せた登録申請が、承認されずに終わっていない

type PremiseKeyOf<K extends ApplicationKind> = {
  registration: never;
  revision: "placeHasNoSteward";
  listing: "placeHasNoSteward";
  listingRevision: "placeHasNoSteward" | "listingExists";
  stewardship: "applicantNotSteward" | "registrationStanding";
  affiliation: "placeHasNoSteward" | "placeHasSteward" | "notAffiliated";
  leave: "placeHasNoSteward" | "placeHasSteward" | "affiliated";
  participation: "placeHasSteward" | "occasionOpen" | "notParticipating";
}[K];

type PremiseFactsOf<K extends ApplicationKind> = {
  registration: Readonly<{}>;
  revision: Readonly<{ placeHasSteward: boolean }>;
  listing: Readonly<{ placeHasSteward: boolean }>;
  listingRevision: Readonly<{ listing: Readonly<{ placeHasSteward: boolean }> | null }>;
  stewardship: Readonly<{ applicantIsSteward: boolean; registration: ApplicationStatus["kind"] | null }>;
  affiliation: Readonly<{ placeHasSteward: boolean; affiliated: boolean }>;
  leave: Readonly<{ placeHasSteward: boolean; affiliated: boolean }>;
  participation: Readonly<{ placeHasSteward: boolean; holdingStatus: HoldingStatus | null; participating: boolean }>;
}[K];

type PremiseHolds = Readonly<{ holds: true }>;
type PremiseBrokenOf<K extends ApplicationKind> = Readonly<{ holds: false; broken: readonly [PremiseKeyOf<K>, ...PremiseKeyOf<K>[]] }>;
type PremiseResultOf<K extends ApplicationKind> = [PremiseKeyOf<K>] extends [never] ? PremiseHolds : PremiseHolds | PremiseBrokenOf<K>;
type PremiseResult = PremiseResultOf<ApplicationKind>;
```

| 事実 | 意味 |
| --- | --- |
| `placeHasSteward` | その店舗に店舗管理者がいる（Authority の `Stewardship.isVacant` の否定） |
| `listing` | 対象の掲載。掲載がなければ `null`。あれば、掲載が紐づく店舗の `placeHasSteward` |
| `applicantIsSteward` | 申請者がその店舗の店舗管理者である（Authority の `Stewardship.isSteward`） |
| `registration` | 併せた登録申請の状態。`target.registrationId` が `null` なら `null` |
| `affiliated` | その店舗とその地域の所属がある（Region の `PlaceAffiliations.has`） |
| `participating` | その店舗のそのイベントへの参加がある（Occasion の `ParticipationRepository.findById`） |
| `holdingStatus` | イベントの今日の暦日の開催の状態（Occasion の `Occasion.holdingStatus`。開催期間のないイベントは `null`）。イベントがなければ `null` |

- ユースケースは、その種類に要る事実だけを読む。種類に合わない事実の組は、型で渡せない
- `PremiseHolds` は `Premise.evaluate` と `Premise.require` だけが作る。`SubmissionScope.admit`・`resubmit`・`approve` はこの値を要るので、前提を確かめずに提出も承認もできない
- 参加の前提「イベントが終了も中止もしていなくて、その店舗の参加がまだない」は、失効の事情を示し分けるために2つの鍵に分ける（APP-05、I-19）

### ReviewPolicy / ReviewPermission

```ts
type ReviewPolicy = Readonly<{ proxyAfterMs: number }>; // 正の整数。確認中になってから期間超過の代行ができるまでの期間（X-04）

type ReviewPermissionOf<K extends ApplicationKind> = K extends StewardSeatKind
  ?
      | Readonly<{ allowed: true; reviewAs: ReviewAs }>
      | Readonly<{ allowed: false; reason: "notApprover" | "awaitingStewards" }>
  : K extends "stewardship"
    ?
        | Readonly<{ allowed: true; reviewAs: "approver" }>
        | Readonly<{ allowed: false; reason: "notApprover" | "registrationPending" }>
    :
        | Readonly<{ allowed: true; reviewAs: "approver" }>
        | Readonly<{ allowed: false; reason: "notApprover" }>;

type ReviewPermission = ReviewPermissionOf<ApplicationKind>;
```

- `ReviewPolicy.create(input)`: 制約を欠けば `BusinessRuleError`（`APPLICATION_INVALID_REVIEW_POLICY`）
- `ReviewPolicy.proxyableAt(app: UnderReviewApplication, policy: ReviewPolicy): Date`: 期間超過の代行ができるようになる時刻（`status.since` に `policy.proxyAfterMs` を足した時刻）。`ApproverPolicy.decide` と `OverdueReviewWatch.detect` は、この時刻が `now` 以前かどうかで判定する
- `ReviewPolicy.overdueCutoff(policy: ReviewPolicy, now: Date): Date`: `now` の時点で期間超過の代行ができる確認中の申請の、`status.since` の上限（`now` から `policy.proxyAfterMs` を引いた時刻）。`status.since` がこの時刻以前であることは、`proxyableAt` が `now` 以前であることと同値。ユースケースは、`ApplicationReviewDesk` の `asOverdueProxy` に渡す `pendingSinceBefore` をこの関数で求める
- 期間超過の代行の期間の規則は、`proxyableAt` と `overdueCutoff` の2つの関数だけが持つ。ポートとアダプターは期間を持たず、日時の比較だけを持つ
- `awaitingStewards`（期間超過の前）は、運営者がいて期間を過ぎていない申請を開いたサービス運営者。`registrationPending` は、併せた登録申請がまだ承認されていない管理権限の申請を開いたサービス運営者。どちらも、申請を確かめることはでき、判断はできない

### OverdueNotice

```ts
type OverdueNotice = Readonly<{ applicationId: ApplicationId; pendingSince: Date }>;
```

期間超過の通知を出した記録。`pendingSince` は、通知した時点の申請の `status.since`。集約の外に持つ。

## ドメインサービス

どれも純粋な関数で、ポートに依存しない。

### Premise

責務: 申請の前提（`spec/scenario/index.md`「申請の前提」の表）を定める唯一の場所。提出・再提出・承認・再評価・申請を始められるかの確認が同じ関数を使う。

| メソッド | 処理内容 |
| --- | --- |
| `required<K>(target: TargetOf<K>): readonly PremiseKeyOf<K>[]` | その対象の指定に当たる前提を返す（下の表）。複数の行に当たる申請は、当たる前提のすべて。順序は表の上からの順 |
| `evaluate<K>(target: TargetOf<K>, facts: PremiseFactsOf<K>): PremiseResultOf<K>` | `required` の前提をすべて確かめ、成り立たないものを、`required` の順で `broken` に載せる |
| `require(result: PremiseResult): PremiseHolds` | `holds` が `false` なら、`broken` の最初の前提のコードの `BusinessRuleError` |

| 当たる申請 | 前提 | 成り立つ条件 | コード |
| --- | --- | --- | --- |
| 登録 | なし | 常に成り立つ（失効しない） | |
| 申請者が個人の、情報修正・掲載・所属・離脱 | `placeHasNoSteward` | `placeHasSteward` が `false` | `APPLICATION_PLACE_HAS_STEWARD` |
| 掲載の修正 | `placeHasNoSteward` | `listing` が `null`（店舗が決まらないので、この前提は問わない）、または `listing.placeHasSteward` が `false` | `APPLICATION_PLACE_HAS_STEWARD` |
| 申請者が店舗の、所属・離脱・参加 | `placeHasSteward` | `placeHasSteward` が `true` | `APPLICATION_PLACE_HAS_NO_STEWARD` |
| 掲載の修正 | `listingExists` | `listing` が `null` でない | `APPLICATION_LISTING_NOT_FOUND` |
| 所属 | `notAffiliated` | `affiliated` が `false` | `APPLICATION_ALREADY_AFFILIATED` |
| 離脱 | `affiliated` | `affiliated` が `true`（I-19） | `APPLICATION_NOT_AFFILIATED` |
| 参加 | `occasionOpen` | `holdingStatus` が `"ended"` でも `"cancelled"` でもない（開催期間のないイベントの `null` を含む） | `APPLICATION_OCCASION_NOT_OPEN` |
| 参加 | `notParticipating` | `participating` が `false`（I-19） | `APPLICATION_ALREADY_PARTICIPATING` |
| 管理権限 | `applicantNotSteward` | `applicantIsSteward` が `false` | `APPLICATION_ALREADY_STEWARD` |
| 併せた管理権限（`registrationId` が `null` でない） | `registrationStanding` | `registration` が `"underReview"`・`"returned"`・`"approved"` のどれか | `APPLICATION_REGISTRATION_NOT_STANDING` |

- 前提は、対象の運営による非公開・店舗の非公開を含まない。閲覧できない対象への申請は、提出だけが拒む（`SubmissionScope`）
- 登録申請の承認の前は、予約した `reservedPlaceId` の店舗も管理体制もない。`applicantIsSteward` は `false`（`Stewardship.vacant` として扱う）

### SubmissionScope

責務: 新しい申請（再申請を含む）の提出を受け付ける条件を定める唯一の場所。条件は、前提、閲覧できなければならない対象、重ねた申請の3つで、どれも対象の指定だけから確かめる（内容を作る前に確かめ終わる）。提出と、申請を始められるかの確認が同じ関数を使う。再提出・承認・再評価は使わない（前提だけを確かめる）。

```ts
type SubmissionFindings = Readonly<{
  premise: PremiseResult;
  unviewable: readonly SubmissionTarget[];   // targets のうち、閲覧できない対象
  activeDuplicate: ApplicationId | null;     // 同じ枠の進行中の申請
}>;

type Admission<K extends ApplicationKind> = Readonly<{ target: TargetOf<K>; premise: PremiseHolds }>;
```

| メソッド | 処理内容 |
| --- | --- |
| `targets(target: ApplicationTarget): readonly SubmissionTarget[]` | 閲覧できなければならない対象を返す（下の表） |
| `accepts(findings: SubmissionFindings): boolean` | 前提が成り立ち、`unviewable` が空で、`activeDuplicate` が `null` なら `true` |
| `admit<K>(target: TargetOf<K>, findings: SubmissionFindings): Admission<K>` | 前提（`Premise.require`）、閲覧できない対象（`BusinessRuleError` の `APPLICATION_TARGET_NOT_VIEWABLE`）、重ねた申請（`APPLICATION_ALREADY_ACTIVE`）の順に判定し、どれにも当たらなければ `Admission` を返す。`Admission` はこの関数だけが作る |

| 申請 | 閲覧できなければならない対象 |
| --- | --- |
| 登録、併せた管理権限（`registrationId` が `null` でない。`ApplicationTarget.companion` が作るのは、予約した ID の店舗がまだない間だけ） | なし |
| 申請者が個人の、情報修正・管理権限・掲載・所属 | 店舗。所属は地域も |
| 掲載の修正 | 掲載（掲載が閲覧できることは、紐づく店舗が非公開でないことを含む。index.md「閲覧できる対象」） |
| 申請者が個人の離脱 | 店舗、地域 |
| 申請者が店舗の所属 | 地域 |
| 申請者が店舗の離脱 | なし（公開を取り下げた地域・運営による非公開の地域からも離脱を申請できる） |
| 参加 | イベント |

ユースケースは、`targets` の対象が閲覧できるかどうかを事実として読み、閲覧できない対象を `unviewable` に渡す。存在しない対象は閲覧できない。読み方は index.md「閲覧できる対象」による。前提の事実または内容のために集約を読む対象は、読んだ集約に Discovery の `VisibilityPolicy` の `is…Viewable` を当て（掲載は、紐づく店舗も読んで当てる）、同じ対象を `ReferenceQueries.isViewable` で読み直さない。ほかの対象は `ReferenceQueries.isViewable` で読む。どの対象がどちらに当たるかは、各ユースケースが定める。`activeDuplicate` は `ApplicationSlot.of` の枠の `ApplicationRepository.findActiveBySlot` の結果で、枠を持たない種類は `null`。受け付けた申請の内容を作るのに要る対象（情報修正の店舗、掲載の修正の掲載、参加のイベント）は、受け付ける条件が成り立てば存在する。

### ApproverPolicy

責務: 申請を判断できる人と、行える判断を決める（index.md「操作の可否」の「申請の判断」）。

| メソッド | 処理内容 |
| --- | --- |
| `seatOf(target: ApplicationTarget): ApproverSeat` | 登録・情報修正・管理権限・掲載・掲載の修正は `operator`、所属・離脱は `steward`（対象は `regionId` の地域）、参加は `steward`（対象は `occasionId` のイベント）（P-70） |
| `decide<K>(app: ApplicationOf<K>, facts: ApproverFactsOf<K>, policy: ReviewPolicy, now: Date): ReviewPermissionOf<K>` | 下の順に判定する。例外を投げない。`notApprover` のとき、ユースケースが `ForbiddenError` を投げる |
| `reviewAs<K>(app: UnderReviewApplication & ApplicationOf<K>, permission: Exclude<ReviewPermissionOf<K>, { reason: "notApprover" }>): ReviewAsOf<K>` | 承認・否認に渡す判断の立場を返す（`permission.reviewAs`）。`awaitingStewards` なら `BusinessRuleError`（`APPLICATION_AWAITING_STEWARDS`）、`registrationPending` なら `BusinessRuleError`（`APPLICATION_REGISTRATION_PENDING`）。確認中の申請の型を引数に取るので、確認中でない申請は、サービス運営者が期間超過の代行をできない場合にも、先に現在の状態のコードで返る（`Application.requireUnderReview`） |
| `returnAs<K>(app: UnderReviewApplication & ApplicationOf<K>, permission: Exclude<ReviewPermissionOf<K>, { reason: "notApprover" }>): "approver"` | 差し戻しに渡す立場を返す。`reviewAs` と同じ判定の後、結果が `"overdue_proxy"` なら `BusinessRuleError`（`APPLICATION_OVERDUE_PROXY_CANNOT_RETURN`）。期間超過の代行は承認と否認だけを行える（I-13）という規則は、この関数と `Application.sendBack` の引数の型だけが持つ |

```ts
type ApproverFactsOf<K extends ApplicationKind> = K extends StewardSeatKind
  ? Readonly<{
      seat: "steward";
      targetManagement: AccessDecision;               // 承認者の席の対象への manage_target の結果
      serviceOperation: AccessDecision;               // operate_service の結果
    }>
  : K extends "stewardship"
    ? Readonly<{
        seat: "operator";
        serviceOperation: AccessDecision;
        registration: ApplicationStatus["kind"] | null; // 併せた登録申請の状態。target.registrationId が null なら null
      }>
    : Readonly<{
        seat: "operator";
        serviceOperation: AccessDecision;
      }>;
```

`facts.seat` は `Application.approverSeat` の `kind`。ユースケースは、席に応じた事実だけを読み、併せた登録申請の状態は管理権限の申請についてだけ読む。

1. `seat` が `operator`: `serviceOperation.allowed` でなければ `notApprover`。管理権限の申請で `registration` が `"underReview"` または `"returned"` なら `registrationPending`。それ以外は `approver`
2. `seat` が `steward` で `targetManagement.allowed`: `approver`。`targetManagement.basis` が `"steward"` ならその対象の運営者、`"absence_proxy"` なら不在の代行をするサービス運営者（R-11、E-09）
3. `seat` が `steward` で、2 に当たらず `serviceOperation.allowed`: 申請が確認中で、`ReviewPolicy.proxyableAt(app, policy)` が `now` 以前なら `overdue_proxy`。そうでなければ `awaitingStewards`
4. どれにも当たらなければ `notApprover`

- 判定は、判断の時点の事実だけで決まる。不在の代行で申請を確かめ始めたサービス運営者は、判断の前に対象に運営者が就くと 2 に当たらなくなり、3 で決まる（期間を過ぎていれば `overdue_proxy` になり、その時点の承認・否認は、その1回で期間超過の代行として成立する。差し戻しは `returnAs` が拒む。過ぎていなければ `awaitingStewards`）
- 申請者が誰であるかは判定に使わない。承認者は自分の申請も判断できる（P-04）
- 同じ申請を判断できる人が複数いる（同じ対象の複数の運営者、複数のサービス運営者、運営者と期間超過の代行をするサービス運営者）。先にコミットした判断が有効になる（「ポート」の並行性）

### OverdueReviewWatch

責務: 期間超過の代行ができるようになった申請の通知を、1回の確認中につき1回だけ取り出す。

```ts
OverdueReviewWatch.detect(
  app: Application,
  recorded: OverdueNotice | null,
  policy: ReviewPolicy,
  now: Date,
): { notice: OverdueNotice; eventDrafts: readonly EventDraft<ApplicationReviewPeriodElapsedEvent>[] } | null
```

- 申請が確認中で、承認者の席が `steward` で、`ReviewPolicy.proxyableAt(app, policy)` が `now` 以前で、`recorded` がないか `recorded.pendingSince` が `status.since` と違うとき、記録（`pendingSince` は `status.since`）と `application.review_period_elapsed` を返す。それ以外は `null`
- 再提出で確認中に戻った申請は `since` が変わるので、期間を過ぎるともう一度通知される
- 対象に運営者がいることは、`ApplicationReviewDesk` の `asOverdueProxy` が絞り込む

## ドメインイベント

`aggregateId` は `ApplicationId`。ペイロードは、宛先を決めるのに要る値（申請者宛ては `applicant`、承認者宛ては `approver`）と、期間超過の通知を1つにまとめる `pendingSince` だけを持つ。申請の種類・対象・結果は、消費者が `ApplicationRepository.findById`・`findByIds` で読む。

```ts
type ToApplicant = Readonly<{ applicationId: ApplicationId; applicant: Applicant }>;
type ToApprover = Readonly<{ applicationId: ApplicationId; approver: ApproverSeat }>;

type ApplicationSubmittedEvent = DomainEventBase<"application.submitted", ToApprover>;
type ApplicationResubmittedEvent = DomainEventBase<"application.resubmitted", ToApprover>;
type ApplicationWithdrawnEvent = DomainEventBase<"application.withdrawn", ToApprover>;
type ApplicationReturnedEvent = DomainEventBase<"application.returned", ToApplicant>;
type ApplicationApprovedEvent = DomainEventBase<"application.approved", ToApplicant>;
type ApplicationRejectedEvent = DomainEventBase<"application.rejected", ToApplicant>;
type ApplicationLapsedEvent = DomainEventBase<"application.lapsed", ToApplicant>;
type ApplicationReviewPeriodElapsedEvent = DomainEventBase<
  "application.review_period_elapsed",
  Readonly<{ applicationId: ApplicationId; pendingSince: Date }>
>;
```

| 名前 | 型 | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `application.submitted` | `ApplicationSubmittedEvent` | `submit`（再申請を含む。併せた管理権限の申請は、別の申請として別に出る） | Notification（[notification.md](notification.md) の対応の表） |
| `application.resubmitted` | `ApplicationResubmittedEvent` | `resubmit` | Notification（[notification.md](notification.md) の対応の表） |
| `application.withdrawn` | `ApplicationWithdrawnEvent` | `withdraw`（申請者の操作と、退会による取り下げの両方） | Notification（[notification.md](notification.md) の対応の表）、Application（登録申請なら、併せた管理権限の申請の前提を再評価する。P-77 c） |
| `application.returned` | `ApplicationReturnedEvent` | `sendBack` | Notification（[notification.md](notification.md) の対応の表） |
| `application.approved` | `ApplicationApprovedEvent` | `approve`（期間超過の代行を含む） | Notification（[notification.md](notification.md) の対応の表） |
| `application.rejected` | `ApplicationRejectedEvent` | `reject`（期間超過の代行を含む） | Notification（[notification.md](notification.md) の対応の表）、Application（登録申請なら、併せた管理権限の申請の前提を再評価する。P-77 c） |
| `application.lapsed` | `ApplicationLapsedEvent` | `reassess` で失効した（再提出・承認の操作で前提を欠いた場合を含む） | Notification（[notification.md](notification.md) の対応の表） |
| `application.review_period_elapsed` | `ApplicationReviewPeriodElapsedEvent` | `OverdueReviewWatch.detect` が取り出した。`pendingSince` は確認中になった日時 | Notification（[notification.md](notification.md) の対応の表） |
| `photos.released`（共有カーネル） | `PhotosReleasedEvent` | 再提出で写真が外れた（承認・否認・取り下げ・失効では出ない） | Media |

- `approver` は `Application.approverSeat` の値。通知の宛先は Notification が決める
- 管理権限の申請の承認による店舗管理者の追加の通知は、Authority の `authority.steward_appointed`（`via: "application"`）から作られる。Application はそのためのドメインイベントを出さない

消費するドメインイベント。

| 型名 | 出すドメイン | 消費の内容 |
| --- | --- | --- |
| `account.withdrawn` | Account | その人が個人として行った進行中の申請を取り下げる（I-01）。店舗管理者として行った申請は取り下げない |
| `authority.steward_appointed`、`authority.stewardship_vacated` | Authority | 対象が店舗のとき、その店舗に関わる進行中の申請を再評価する（P-77 a・b・d、I-02） |
| `region.affiliation_established`、`region.affiliation_dissolved` | Region | その店舗に関わる進行中の申請を再評価する（P-77 f、I-19） |
| `occasion.participation_established` | Occasion | その店舗に関わる進行中の申請を再評価する（I-19） |
| `occasion.cancelled`、`occasion.ended`、`occasion.period_changed` | Occasion | そのイベントに関わる進行中の申請を再評価する（P-77 g） |
| `listing.deleted` | Listing | その掲載に関わる進行中の申請を再評価する（P-77 e） |
| `application.rejected`、`application.withdrawn` | Application | `applicationId` の申請を読み、登録申請なら、その登録申請に関わる進行中の申請を再評価する（P-77 c） |

- 再評価は、ペイロードの値ではなく、消費の時点の事実を読み直して `Premise.evaluate` を行う。配送の順序と重複に影響されない（冪等）
- 参加の解除（`occasion.participation_dissolved`）は、どの前提も成り立たなくしないので消費しない
- カテゴリーの廃止（`category.retired`）は消費しない。申請の内容のカテゴリーは書き換えず、読み取りと承認が `CategoryCatalog.resolve` で現役のカテゴリーにする

## ポート

### ApplicationRepository

目的: 申請の集約の保存、重ねた申請の制限、申請者・対象からの問い合わせ。`UnitOfWorkContext` に `applicationRepository` として入る。

```ts
interface ApplicationRepository
  extends Omit<TransactionalRepository<Application, ApplicationId>, "delete"> {
  findByIds(ids: readonly ApplicationId[]): Promise<readonly Application[]>;
  findActiveBySlot(slot: ApplicationSlot): Promise<ActiveApplication | null>;
  findActiveBySubject(subject: ApplicationSubject, pagination: Pagination): Promise<PaginationResult<Versioned<ActiveApplication>>>;
  findActiveByIndividual(accountId: AccountId, pagination: Pagination): Promise<PaginationResult<Versioned<ActiveApplication>>>;
  findPageByApplicants(
    criteria: { individual: AccountId | null; places: readonly PlaceId[] },
    pagination: Pagination,
  ): Promise<PaginationResult<Application>>;
  findPageBySubject(
    subject: ApplicationSubject,
    filter: { kinds?: readonly ApplicationKind[]; statuses?: readonly ApplicationStatus["kind"][]; applicant?: Applicant["kind"] },
    pagination: Pagination,
  ): Promise<PaginationResult<Application>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert` | 同じ ID の申請があれば `ConflictError`。加えて、`Application.slotOf` が `null` でない申請について、`ApplicationSlot.key` が等しい進行中の申請がすでにあれば `ConflictError`。「1つの枠に進行中の申請は1つ」は、ポートが担保する。同じ枠への同時の提出は、後からコミットする側が `ConflictError` になる |
| `findById`・`save` | index.md の共通の契約。`save` は楽観ロック。枠は変わらず、終わった申請は進行中に戻らないので、`save` が枠の一意性を破ることはない。終わった申請の枠は、`save` のコミットの時点で空く |
| `delete` | 持たない。申請は削除されない |
| `findByIds` | 与えた ID のうち、存在する申請を、状態を問わず返す。順序は保証しない。存在しない ID は結果に現れない。`ids` は 0〜100件で、0件は空を返し、100件を超えると `BusinessRuleError`（`COMMON_INVALID_INPUT`。index.md の共通の契約）。Notification が、通知一覧とメールに示す申請の種類と対象を読むのに使う |
| `findActiveBySlot` | その枠の進行中の申請を返す。なければ `null`。提出と、申請を始められるかの確認が、重ねた申請を理由として返すために使う（`SubmissionFindings.activeDuplicate`）。一意性の根拠にはしない |
| `findActiveBySubject` | `Application.subjects` に `subject` を含む進行中の申請を、楽観ロックの版とともに返す。並び順は ID の昇順。再評価の消費者と、個人がその店舗について行った進行中の申請の読み取りが使い、どちらもすべてのページを読む |
| `findActiveByIndividual` | 申請者がその個人である進行中の申請を、楽観ロックの版とともに返す。並び順は ID の昇順。退会の消費者が使い、すべてのページを読む |
| `findPageByApplicants` | 申請者が `individual` の個人である申請と、申請者が `places` のどれかの店舗である申請を、状態を問わず返す。並び順は `submittedAt` の新しい順、同順位は ID の昇順。`places` は絞り込みの条件に使う ID の集合で、件数に上限を持たない。どちらも空（`individual` が `null` で `places` が空）なら空を返す。ユースケースは、操作する人に Authority の `AccessPolicy`（`act_as_place`）が許す店舗だけを `places` に渡す。1つの店舗について店舗管理者として行った申請に絞るときは、`individual` を `null`、`places` をその店舗だけにする |
| `findPageBySubject` | `Application.subjects` に `subject` を含む申請を、`filter` で絞って返す。`filter` の項目は、省くと絞り込まない。並び順は、進行中の申請を先に、次に `submittedAt` の新しい順、同順位は ID の昇順。対象を管理する人の申請の一覧、店舗管理者として行った進行中の申請の読み取り、登録申請から併せた申請をたどる読み取りに使う |

- 参照整合性: 内容が指す店舗・地域・イベント・掲載・登録申請があることは、提出のユースケースが書き込みの前に確かめる。予約した ID の指す店舗・掲載は、承認まで存在しない。参照先が後から消えた申請は、前提の再評価で失効するか、承認者が判断する
- 並行性: 同じ申請への同時の操作（承認と取り下げ、2人の承認者の判断、2人の店舗管理者の再提出と取り下げ、判断と失効）は、後からコミットする側が `ConflictError` になり、先の操作が有効になる
- 可視性: コミットした書き込みは、以後のすべての問い合わせに即座に反映される
- エラー: `ConflictError`（ID の重複、枠の一意性の違反、楽観ロックの競合）、`NotFoundError`（`save` の対象がない）、`BusinessRuleError`（`COMMON_INVALID_INPUT`。`findByIds` の100件を超える入力）

### ApplicationReviewDesk

目的: サービス運営者の対応を待つ申請の読み取り。問い合わせは、申請の状態と、Authority の管理体制（地域・イベントの運営者の有無）にまたがる。Discovery のポートと同じく、問い合わせをドメインの語彙で定め、アダプターが保存先に合わせて実現する。読み取り専用で、UnitOfWork の外で使う。

```ts
type ReviewDesk =
  | Readonly<{ section: "asApprover" }>
  | Readonly<{ section: "asOverdueProxy"; pendingSinceBefore: Date }>;

interface ApplicationReviewDesk {
  findPageAwaiting(desk: ReviewDesk, pagination: Pagination): Promise<PaginationResult<Application>>;
}
```

| `desk` | 返す申請 |
| --- | --- |
| `asApprover` | 承認者の席が `operator` である確認中の申請と、承認者の席の地域・イベントが管理者不在（保存された管理体制がない、または `vacant`）である確認中の申請。併せた登録申請がまだ承認されていない管理権限の申請を含む |
| `asOverdueProxy` | 承認者の席の地域・イベントに運営者がいて、`status.since` が `pendingSinceBefore` 以前（等しいものを含む）の確認中の申請 |

- 並び順は `status.since` の古い順、同順位は ID の昇順。差し戻し中の申請と終わった申請は返さない
- `count` は、その `desk` の条件に合う全件数
- 2つの区分は重ならない。どちらも、承認者の席の地域・イベントの運営者を兼ねないサービス運営者から見た区分。`asApprover` は、`ApproverPolicy.decide` がそのサービス運営者に `approver` または `registrationPending` を返す確認中の申請と一致し、`asOverdueProxy` は、`pendingSinceBefore` が `ReviewPolicy.overdueCutoff(policy, now)` のとき、同じ `policy` と `now` でそのサービス運営者に `overdue_proxy` を返す確認中の申請と一致する
- 期間超過の代行ができる申請を、申請と管理体制にまたがって問い合わせるのは、このポートの `asOverdueProxy` だけ（`listApplicationsAwaitingReview` と `notifyOverdueReviews` が使う）
- 可視性: コミットした申請の書き込みと管理体制の書き込みは、以後の問い合わせに即座に反映される

### OverdueNoticeLedger

目的: 期間超過の通知を出した記録を、集約とは別に持つ（index.md「時間の経過で起きる出来事」）。`UnitOfWorkContext` に `overdueNoticeLedger` として入る。

```ts
interface OverdueNoticeLedger {
  findByApplicationIds(ids: readonly ApplicationId[]): Promise<readonly OverdueNotice[]>;
  record(notice: OverdueNotice): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `findByApplicationIds` | 与えた申請 ID のうち、記録のある申請の記録を返す。順序は保証しない。記録のない ID は結果に現れない。件数は index.md の共通の契約（0〜100件。超えると `BusinessRuleError`（`COMMON_INVALID_INPUT`）） |
| `record` | その申請の記録を置き換える。なければ作る。申請の版を進めない。楽観ロックを持たない。同じスコープのドメインイベントの保存と一緒に確定する |

- 記録の読み書きだけを持ち、申請の状態と管理体制を問い合わせない。どの申請が期間超過の代行の対象かは `ApplicationReviewDesk` の `asOverdueProxy` が決める
- 記録の一意性（申請ごとに1つ）はポートが担保する。参照整合性は index.md「リポジトリの共通の契約」の、集約とは別のポートで持つ記録の規則による
- どちらのメソッドも `UnitOfWorkContext` から得て、`run` の中で呼ぶ
- 可視性: コミットした記録は、以後の `findByApplicationIds` に即座に反映される
- 同じ申請を2つのジョブが同時に確かめると、`application.review_period_elapsed` が重ねて出ることがある。消費者は冪等に作る

## トランザクション境界

1つの UnitOfWork で原子的に確定する範囲。ユースケースは、事実の読み取り（前提の事実、閲覧できるか、重ねた申請、`AccessPolicy` と `ApproverPolicy` の判断、反映先の集約、写真）をすべて終えてから書き込む。

| 書き込み | 同じスコープで確定するもの |
| --- | --- |
| 提出 | 申請の `insert`、`claimedPhotoIds` の持ち主の設定（Media の `PhotoOwnership.claimAll`。持ち主は `{ kind: "application"; id }`）、`application.submitted` の保存。管理権限の申請を併せた登録申請は、2つの申請の `insert` を同じスコープで確定する |
| 再提出 | 申請の `save`、`claimedPhotoIds` の持ち主の設定、`application.resubmitted` と `photos.released` の保存 |
| 差し戻し、否認、取り下げ | 申請の `save`、ドメインイベントの保存 |
| 再提出・承認の時点で前提を欠いた申請の失効 | 申請の `save`（`reassess`）、`application.lapsed` の保存。ユースケースは例外を投げずにコミットし、失効したことと成り立たない前提を結果として返す。内容は反映しない |
| 登録の承認 | 申請の `save`、店舗の `insert`（`Place.register`。ID は予約した `reservedPlaceId`）、すべての写真の持ち主の付け替え（`PhotoOwnership.transferAll`） |
| 情報修正の承認 | 申請の `save`、店舗の `save`（`Place.applyRevision`）、申請が持ち主の写真（`ApplicationCase.ownedPhotoIds`）の持ち主の付け替え |
| 管理権限の承認 | 申請の `save`、その店舗の `Stewardship` の `insert` または `save`（`Stewardship.appointByApproval`。`appointee` は `Application.requireApplicantAccount` の結果。申請者が退会していれば承認は成立しない）、申請者のアカウントの `save`（Account の `Account.markReferenced`。就任と退会を、アカウントの版で直列にする。同時のときの結果は Account の `AccountRepository` の契約による） |
| 所属の承認 | 申請の `save`、`PlaceAffiliations` の `insert` または `save`（記録がなければ `empty` から `affiliate`） |
| 離脱の承認 | 申請の `save`、`PlaceAffiliations` の `save`（`leave`） |
| 参加の承認 | 申請の `save`、`Participation` の `insert`（`Participation.establish`。内容は申請の `details`） |
| 掲載の承認 | 申請の `save`、掲載の `insert`（`Listing.createPublished`。ID は予約した `reservedListingId`）、すべての写真の持ち主の付け替え |
| 掲載の修正の承認 | 申請の `save`、掲載の `save`（`Listing.applyPatch`）、申請が持ち主の写真の持ち主の付け替え |
| 再評価による失効（ドメインイベントの消費） | 申請1件ごとに、申請の `save` とドメインイベントの保存 |
| 退会による取り下げ（ドメインイベントの消費） | 申請1件ごとに、申請の `save` とドメインイベントの保存。登録申請と、それに併せた進行中の管理権限の申請は、2つの申請の `save` を同じスコープで確定する |
| 期間超過の通知（日次のジョブ） | 申請1件ごとに、`OverdueNoticeLedger.record` と `application.review_period_elapsed` の保存。申請は書き込まない |
| 再申請の写真の用意 | 前の申請の写真を Media の `duplicatePhotos` で複製した後に、複製した写真の `markStored` の保存。持ち主は設定せず、再申請の提出が設定する |

- どの承認も、申請と反映先の両方のドメインイベント（`application.approved`、反映先の集約が返すドメインイベント）を同じスコープで保存する。反映先の集約の振る舞いが `BusinessRuleError` を投げるか、どれかの書き込みが `ConflictError` になると、申請は確認中のまま残る
- 承認と同時に成り立たなくなりうる前提のうち、反映先の集約が同じスコープで書き込まれるもの（所属の有無、参加の有無、申請者が店舗管理者でないこと）は、反映先の振る舞い（`REGION_ALREADY_AFFILIATED`、`REGION_NOT_AFFILIATED`、`AUTHORITY_ALREADY_STEWARD`）と楽観ロック、`Participation` の `insert` の一意性が守る
- 反映先でない集約の事実（店舗管理者の有無、イベントの開催の状態、掲載があること）を読んでから書き込むまでの間の変化は防がない。成立した反映は保たれる
- 消費者の1件の `save` が楽観ロックで競合しても、他の申請の処理は確定する。競合した申請は、ドメインイベントの再配送で処理する
- 登録申請の否認と、申請者の操作による取り下げの後の、併せた管理権限の申請の失効は、別の UnitOfWork で確定する（結果整合）。その間、併せた申請は `ApproverPolicy` と `Premise` によって承認できない。退会による取り下げでは、併せた申請も同じスコープで取り下げになり、再評価の消費者が読む時点で、併せた申請はすでに終わっている
- 通知と写真の削除は、ドメインイベントの消費で結果整合にする

## ユースケース（概要）

提出・再提出・承認・再評価・申請を始められるかの確認は、種類に応じた前提の事実を他のドメインのポートから読む同じ手順を使う。提出は「対象の指定を作る → `SubmissionScope.admit` で受け付ける条件を確かめる → 内容を作る → `Application.submit`」の順に進む。申請者の操作は `Application.isHandledBy`、承認者の操作は `ApproverPolicy.decide` で可否を確かめる。すべての操作にログインが要る（B-18）。

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `submitPlaceRegistration` | 店舗の情報で登録申請を提出する。管理権限の申請を併せると、2つの申請を提出する。冪等な作成（`Application.matchesSubmission`）。併せた申請の対象の指定は `ApplicationTarget.companion` で作る（再送では、保存されている登録申請から作る） | SHP-03、APP-04 |
| `submitPlaceRevision` | 管理者のいない店舗の、変更する項目と営業状況の変更だけを持つ申請を提出する | SHP-08、APP-04 |
| `submitStewardshipClaim` | 店舗との関係と、確認に使える連絡先または資料を添えて提出する。併せた申請の再申請は、登録申請が承認されていない間は同じ登録申請を参照し、承認の後はふつうの管理権限の申請になる（`ApplicationTarget.companion`） | SHP-04、APP-04 |
| `submitAffiliationChange` | 店舗管理者として、または管理者のいない店舗について個人として、所属または離脱の申請を提出する | REG-01、REG-02、REG-03、APP-04 |
| `submitParticipation` | 店舗管理者として、掲載と参加日を添えて参加の申請を提出する | EVT-01、APP-04 |
| `submitNewListing` | 管理者のいない店舗の、公開条件を満たす掲載の申請を提出する | LST-12、APP-04 |
| `submitListingRevision` | 管理者のいない店舗の掲載の、変更する項目だけを持つ申請を提出する | LST-13、APP-04 |
| `previewListingSubmission` | 掲載の申請・掲載の修正の申請の提出の前に、入力中の内容を、閲覧者に見えるのと同じ形で返す（Discovery の `ViewProjection.previewListing`）。何も書き込まない。店舗が閲覧できなければ `NotFoundError` | LST-12、LST-13 |
| `checkSubmissionEligibility` | 対象の指定について、提出と同じ受け付ける条件（`SubmissionFindings`）を確かめ、受け付けない理由を返す | SHP-04、SHP-08、LST-12、LST-13、REG-01〜REG-03、EVT-01、APP-04 |
| `resubmitApplication` | 差し戻された申請の内容を直し、回答を添えて確認中に戻す。前提を欠けば失効にする | APP-02、APP-06 |
| `withdrawApplication` | 進行中の申請を取り下げる | APP-03、APP-06 |
| `prepareReapplication` | 否認・取り下げ・失効で終わった申請から再申請を始めるために、前の申請の写真を複製し、再申請の入力の初めの内容を返す。参加の申請は、添えられなくなった掲載と開催期間の外の参加日を初めの内容から外し、外したものを返す | APP-04 |
| `listMyApplications` | 個人として行った申請と、管理する店舗が店舗管理者として行った申請を、提出の新しい順に返す。1つの店舗に絞れる | APP-01、APP-06 |
| `listMyActiveApplicationsAboutPlace` | 個人として行った、その店舗に関わる進行中の申請を返す | REG-03 |
| `getMyApplication` | 申請者が、1件の申請の内容・状態・結果、修正の申請の現在の値との見比べ（`FieldPatch.compare`）と重ねた内容（`FieldPatch.preview`）、併せた申請、反映先を読む | APP-01、APP-02、APP-05、APP-06 |
| `listApplicationsForSubject` | 店舗・地域・イベントの管理のために、その対象に関わる申請を、進行中を先に返す | SHP-05、REG-05、REG-08、EVT-01、EVT-07 |
| `listApplicationsAwaitingReview` | サービス運営者が、承認者として判断する申請と、期間超過の代行ができる申請を、待ち始めた日時の古い順に読む | OPE-01、APP-08 |
| `getApplicationForReview` | 承認者が、1件の申請の内容・前の差し戻しと回答（確認中の再提出された申請だけ）、行える判断（承認者、期間超過の代行、期間超過の前、登録の判断待ち）、修正の申請の現在の値との見比べと承認で反映される内容、登録申請の既存店舗との照合を読む | APP-07、APP-08、SHP-09〜SHP-11、LST-14、REG-09、REG-13、EVT-08、EVT-13 |
| `sendBackApplication` | 承認者が、追加で必要な確認を添えて差し戻す。期間超過の代行では行えない | APP-07 |
| `rejectApplication` | 承認者または期間超過の代行をするサービス運営者が、理由を添えて否認する | APP-07、APP-08 |
| `approvePlaceRegistration` | 店舗を登録して公開する。申請者に管理権限は付かない | SHP-09 |
| `approvePlaceRevision` | 申請の項目だけを、店舗の現在の内容に反映する | SHP-11 |
| `approveStewardshipClaim` | 申請者を店舗管理者にする。併せた申請は、登録の承認の後に判断できる。申請者が退会していれば成立しない（`Application.requireApplicantAccount`） | SHP-10 |
| `approveAffiliation` | 店舗の地域への所属を成立させる | REG-09、REG-13、APP-08 |
| `approveLeave` | 店舗の地域への所属を解除する | REG-09、REG-13、APP-08 |
| `approveParticipation` | 店舗のイベントへの参加を、申請の掲載と参加日で成立させる | EVT-08、EVT-13、APP-08 |
| `approveNewListing` | 掲載を公開中の掲載として作る | LST-14 |
| `approveListingRevision` | 申請の項目だけを、掲載の現在の内容に反映する | LST-14 |
| `reassessApplicationPremises` | 前提に関わるドメインイベントの消費者。関わる進行中の申請の事実を読み直し、前提を欠く申請を失効にする | APP-05、SHP-03、SHP-10、LST-11、LST-13、LST-16、REG-09、REG-10、EVT-01、EVT-04、EVT-11、MEM-03、MEM-04 |
| `withdrawApplicationsOfWithdrawnAccount` | `account.withdrawn` の消費者。個人として行った進行中の申請を取り下げる | ACC-04 |
| `notifyOverdueReviews` | 日次のジョブ。`ApplicationReviewDesk` の `asOverdueProxy` の申請ごとに、記録と `OverdueReviewWatch.detect` で通知するかを決め、記録を更新して、`application.review_period_elapsed` を出す | APP-08、OPE-01 |

8種の承認のユースケースは、どれも「再評価 → 失効したら結果を返して終わる → 反映先の振る舞い → `Application.approve`」の順に進む。種類ごとの承認のユースケースに、種類の違う申請の ID を渡すと `NotFoundError` になる。差し戻し・否認・取り下げ・再提出・再申請の用意は、種類によらず1つのユースケースが担う。
