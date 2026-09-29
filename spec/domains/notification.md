# Notification

出来事から宛先を決め、サービス内の通知とメールを届ける。申立人への結果のメールも送る。共有カーネルの型（`NotificationId`、`ContentRef`、`StewardedRef`、`ShowcaseRef`、`EmailAddress`、`LocalDate`）、ドメインイベントの配送の規約、UnitOfWork ポートは [index.md](index.md) が定める。

- 通知する出来事は契約 P-91〜P-100 に限る。どの出来事も、他のドメインのドメインイベントから作る。Notification は自分の操作を持たず、ドメインイベントを出さない
- 1つの出来事は、サービス内の通知とメールの両方で届く（P-90、B-39）。正はサービス内の通知で、メールが届かなくても通知一覧で同じ通知を確かめられる
- 通知は既読・保持期間・停止設定を持たない。作られた通知は、宛先のアカウントが退会するまで残る
- 申立人への結果のメール（MOD-01、MOD-02）は、Moderation の `takedown_claim.resolved` から作るメールだけの届け物で、出来事（`Occurrence`）でもサービス内の通知でもない。申立人はアカウントを持たない。送信済みの記録、文面の組み立て、送信は、通知のメールと同じポートを使う
- ログイン用のメール（Account の `LoginMailSender`）は、Notification を通らない
- 通知とそのメールから開く行き先は、Notification の値 `NotificationDestination`（行き先の種類と対象の ID）で、`NotificationDestination.of` が出来事と届いた経路から決める。行き先から画面の URL への写しは presentation がポートの外で行う。メールの文面は `NotificationMailRenderer` が組み立て、`Mailer` は送るだけを担う

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Occurrence | 出来事 | 通知する出来事。宛先の立場と、立場ごとの事柄で表す。P-91〜P-100 の出来事を過不足なく持つ |
| Matter | 事柄 | 1つの宛先の立場の中で、何が起きたかを表す値 |
| ContentMatter | 対象の事柄 | 店舗・掲載・地域・イベント・読みものに、対象の種類をまたいで同じ語で起きる事柄（運営による非公開、その解除、申立てによる写真の削除）。届け先の立場は、対象を管理する人（対象の種類で決まる） |
| Announcement | 告知 | ドメインイベントから取り出した、宛先を決める前の出来事。出来事と、その出どころを持つ |
| Origin | 出どころ | 告知を生んだドメインイベント、または出来事の内容。同じ出来事を見分ける元になる |
| OccurrenceKey | 出来事のキー | 同じ出来事が同じ値になる文字列。通知とメールの重複を防ぐ元になる |
| Audience | 届け先の立場 | 出来事から決まる、通知を受ける立場（アカウント、対象の管理者の全員、役割を持つ全員、メールアドレス） |
| Addressing | 宛先の決定 | 届け先の立場と、管理体制・名簿の事実から、宛先を決めること |
| Addressee | 宛先 | 通知を届ける相手。アカウント、またはアカウントのないメールアドレス |
| Delivery | 届いた経路 | 宛先の立場どおりに届いたか（`direct`）、管理者不在のためにサービス運営者が代わりに受けたか（`proxy`） |
| DeliveredOccurrence | 届いた出来事 | 出来事と、それが届いた経路の組。通知とメールが持つ |
| Notification | 通知 | 1つのアカウントに届いた、1つの出来事の記録。サービス内の通知一覧に並ぶ |
| NotificationMail | 通知のメール | 通知と同じ出来事を、宛先のメールアドレスに送るメール |
| TakedownOutcomeMail | 申立ての結果のメール | 対応済みの申立ての結果を、申立人のメールアドレスに送るメール |
| NotificationDestination | 行き先 | 通知とそのメールから開く先。行き先の種類と対象の ID で表す |
| RenderedMail | 組み立てたメール | 通知のメール・申立ての結果のメールから組み立てた、宛先・件名・本文・行き先 |
| MailDispatch | 送信済みの記録 | 通知のメールまたは申立ての結果のメールを送ったことの記録。メールのキーごとに1つ |
| ShowcaseChange | 紹介先の変化 | 公開中の読みものが紹介する対象に起きた、非公開・公開の取り下げ・削除・閉店・提供終了・終了・中止 |

## エンティティ

### Notification（集約ルート）

```ts
type Notification = Readonly<{
  id: NotificationId;
  recipient: AccountId;
  occurrenceKey: OccurrenceKey;
  createdAt: Date;
}> & DeliveredOccurrence;
```

| フィールド | 型 | 制約 |
| --- | --- | --- |
| `id` | `NotificationId` | |
| `recipient` | `AccountId` | 宛先のアカウント |
| `occurrence`、`delivery` | `DeliveredOccurrence` | 出来事と届いた経路。`proxy` は、届け先の立場が対象の管理者の全員である出来事だけが持つ（型が限る） |
| `occurrenceKey` | `OccurrenceKey` | `recipient` との組が、通知の重複を防ぐ一意のキーになる |
| `createdAt` | `Date` | 通知を作った日時。通知一覧の並び順の基準 |

どのフィールドも、作成の後に変わらない。版を持たない。

振る舞い。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Notification.issue` | `params: { id: NotificationId; origin: Origin; delivered: DeliveredOccurrence; recipient: AccountId }`, `now: Date` | `Notification` | `occurrenceKey` を `OccurrenceKey.of(origin, delivered.occurrence)` で求め、`createdAt` を `now` にした通知を作る |
| `Notification.reconstruct` | 保存された値 | `Notification` | 値を確かめて組み立て直す。型が表せない値（届け先の立場が管理者の全員でない出来事の `proxy` など）は `RehydrationError` |

不変条件。

- 同じ `occurrenceKey` と `recipient` の通知は1つ。`NotificationRepository` が担保する
- 通知は、宛先が後から管理権限・役割を失っても、指す対象が閲覧できなくなっても、削除されても残る。通知から進んだ先の可否は、進んだ先の操作が確かめる

ライフサイクル。

- 生成: ドメインイベントの消費で、宛先のアカウントごとに作る。利用者の操作では作られない
- 状態遷移: 状態を持たない
- 消滅: 宛先のアカウントの退会で、そのアカウントの通知をすべて削除する。ほかに削除はない

## 値オブジェクト

### Occurrence

通知する出来事。宛先の立場（`to`）ごとの直和で、P-91〜P-100 の出来事を過不足なく持つ。届け先の立場が対象の管理者の全員である出来事（`StewardAudienceOccurrence`）と、ほかの出来事（`DirectAudienceOccurrence`）に分かれる。宛先のアカウントそのもの（申請した人、付与・解除された人）は出来事に持たず、告知（`Announcement`）が持ち、通知では `recipient` が持つ。

```ts
type ApplicantMatter = "returned" | "approved" | "rejected" | "lapsed";
type ApproverMatter = "submitted" | "resubmitted" | "withdrawn";

type StewardAudienceOccurrence =
  | Readonly<{ to: "applicant"; applicant: Readonly<{ kind: "place"; placeId: PlaceId }>;
      applicationId: ApplicationId; matter: ApplicantMatter }>                            // P-91。店舗管理者として行った申請
  | Readonly<{ to: "approver"; approver: Extract<ApproverSeat, { kind: "steward" }>;
      applicationId: ApplicationId; matter: ApproverMatter }>                             // P-92。承認者が地域運営者・イベント運営者
  | Readonly<{ to: "placeStewards"; placeId: PlaceId; subject: PlaceSubject }>            // P-93
  | Readonly<{ to: "regionStewards"; regionId: RegionId; matter: RegionMatter }>          // P-94
  | Readonly<{ to: "occasionStewards"; occasionId: OccasionId; matter: OccasionMatter }>  // P-95
  | Exclude<ContentOccurrence, { content: { kind: "article" } }>;                         // P-93〜P-95

type DirectAudienceOccurrence =
  | Readonly<{ to: "applicant"; applicant: Readonly<{ kind: "individual" }>;
      applicationId: ApplicationId; matter: ApplicantMatter }>                            // P-91。個人として行った申請
  | Readonly<{ to: "approver"; approver: Extract<ApproverSeat, { kind: "operator" }>;
      applicationId: ApplicationId; matter: ApproverMatter }>                             // P-92。承認者がサービス運営者
  | Readonly<{ to: "editors"; articleId: ArticleId; matter: ArticleMatter }>              // P-96
  | Extract<ContentOccurrence, { content: { kind: "article" } }>                          // P-96
  | Readonly<{ to: "operators"; matter: OperatorMatter }>                                 // P-97
  | Readonly<{ to: "invitee"; email: EmailAddress; target: StewardedRef;
      invitationId: InvitationId }>                                                       // P-98
  | Readonly<{ to: "grantee"; granted: GrantedAuthority }>                                // P-99
  | Readonly<{ to: "self"; revoked: RevokedAuthority }>;                                  // P-100

type Occurrence = StewardAudienceOccurrence | DirectAudienceOccurrence;

// 対象の種類をまたぐ事柄。届け先の立場は、対象を管理する人（content.kind で決まる）
type ContentMatter =
  | Readonly<{ kind: "suspended" }>          // 運営による非公開（店舗は非公開）
  | Readonly<{ kind: "unsuspended" }>        // その解除
  | Readonly<{ kind: "photos_taken_down" }>; // 申立てによる写真の削除

type ContentOccurrence =
  | Readonly<{ to: "contentManagers"; content: Extract<ContentRef, { kind: "place" | "region" | "occasion" }>;
      matter: ContentMatter }>
  | Readonly<{ to: "contentManagers"; content: Extract<ContentRef, { kind: "listing" }>; placeId: PlaceId;
      matter: ContentMatter }>                                                            // placeId は掲載が紐づく店舗
  | Readonly<{ to: "contentManagers"; content: Extract<ContentRef, { kind: "article" }>;
      matter: Extract<ContentMatter, { kind: "photos_taken_down" }> }>;                   // 読みものは運営による非公開を持たない

// 店舗管理者宛ての、店舗と掲載に固有の事柄の対象。店舗についての事柄と、その店舗の掲載についての事柄
type PlaceSubject =
  | Readonly<{ kind: "place"; matter: PlaceMatter }>
  | Readonly<{ kind: "listing"; listingId: ListingId; matter: ListingMatter }>;

type PlaceMatter =
  | Readonly<{ kind: "excluded_from_region"; regionId: RegionId }>
  | Readonly<{ kind: "excluded_from_occasion"; occasionId: OccasionId }>
  | Readonly<{ kind: "occasion_cancelled"; occasionId: OccasionId }>
  | Readonly<{ kind: "occasion_period_changed"; occasionId: OccasionId }>
  | Readonly<{ kind: "confirmation_requested"; reportId: InfoReportId }>
  | Readonly<{ kind: "categories_reassigned"; retiredCategoryId: CategoryId }>
  | Readonly<{ kind: "steward_added"; appointee: AccountId }>;

type ListingMatter =
  | Readonly<{ kind: "confirmation_requested"; reportId: InfoReportId }>;

type RegionMatter =
  | Readonly<{ kind: "occasion_linked"; occasionId: OccasionId }>;

type OccasionMatter =
  | Readonly<{ kind: "participation_withdrawn"; placeId: PlaceId }>
  | Readonly<{ kind: "participation_changed"; placeId: PlaceId }>
  | Readonly<{ kind: "region_link_detached"; regionId: RegionId }>;

type ArticleMatter =
  | Readonly<{ kind: "showcase_changed"; change: ShowcaseChange }>;

type OperatorMatter =
  | Readonly<{ kind: "application_review_period_elapsed"; applicationId: ApplicationId }>
  | Readonly<{ kind: "takedown_claim_received"; claimId: TakedownClaimId }>
  | Readonly<{ kind: "info_report_received"; reportId: InfoReportId }>;

type GrantedAuthority =
  | Readonly<{ kind: "stewardship"; target: Extract<StewardedRef, { kind: "region" | "occasion" }> }>
  | Readonly<{ kind: "role"; role: Role }>;

type RevokedAuthority =
  | Readonly<{ kind: "stewardship"; target: StewardedRef }>
  | Readonly<{ kind: "role"; role: Role }>;
```

- 事柄の型は、対象の種類をまたいで同じ語で起きる事柄を `ContentMatter` に、対象の種類に固有の事柄を種類ごとの `…Matter` に持つ。`contentManagers` の出来事は、対象（`content`）の種類で届け先の立場と行き先が決まる。読みもの（`article`）の出来事は編集担当者宛てで、`DirectAudienceOccurrence` に入る
- `categories_reassigned` は、店舗と廃止したカテゴリーの組ごとに1つの出来事。カテゴリーの廃止で、保存された `CategoryId` を書き換えずに移行先のカテゴリーのものとして読まれるようになった掲載を、その店舗が持つことを表す。移行先は持たない。通知一覧を返すユースケースが、表示の時点の移行先を Listing の `CategoryCatalog.resolve(catalog, retiredCategoryId)` で求めて添える。廃止済みのカテゴリーは台帳から消えないので、`resolve` は必ず成立する。メールは移行先を載せない
- `confirmation_requested` は、連絡の対象（Moderation の `InfoReportTarget`）が掲載なら掲載の事柄、店舗なら店舗の事柄
- `steward_added` は、管理権限の申請の承認による店舗管理者の追加。`appointee` は就任した人
- `photos_taken_down` は、外した写真（`photoIds`）と、削除で公開していない状態になったかどうか（`unpublished`）を持たない。現在の写真と公開状態は、通知から進んだ先が示す
- `ApproverSeat`（下の「ApproverSeat」）と `ApplicationKind` は Application の型、`Role` は Authority の型、`InfoReportId`・`TakedownClaimId`・`InvitationId` は共有カーネルの ID
- 等価性: 全フィールドの一致

`Occurrence.pointedContent(o: Occurrence): ContentRef | null` は、出来事が指す対象を返す。指す対象が `ContentRef` でない出来事は `null`。

| `o.to` | 返す対象 |
| --- | --- |
| `contentManagers` | `content` |
| `placeStewards` | `subject` が `listing` ならその掲載、`place` ならその店舗 |
| `regionStewards` | 地域 |
| `occasionStewards` | イベント |
| `editors` | 読みもの |
| `invitee` | 招待の対象 |
| `grantee`、`self` | 管理権限ならその対象。役割なら `null` |
| `applicant`、`approver`、`operators` | `null`（指す対象は申請、申立て、連絡） |

`Occurrence.refsOf(o: Occurrence): readonly OccurrenceRef[]` は、出来事が持つ参照を列挙する。通知一覧とメールに示す名称の解決に使う。出来事が持つ ID のうち `InvitationId` を除くすべて（`ShowcaseChange.showcase` の対象、`applicant`・`approver`・`invitee`・`grantee`・`self` の対象を含む）を、ID の種類の参照にする。同じ参照は1回だけ、出来事の型のフィールドの順に並べる。

```ts
type OccurrenceRef =
  | ContentRef
  | Readonly<{ kind: "category"; id: CategoryId }>       // categories_reassigned の retiredCategoryId
  | Readonly<{ kind: "application"; id: ApplicationId }>
  | Readonly<{ kind: "takedownClaim"; id: TakedownClaimId }>
  | Readonly<{ kind: "infoReport"; id: InfoReportId }>
  | Readonly<{ kind: "account"; id: AccountId }>; // steward_added の appointee

type ApplicationLabel = Readonly<{
  applicationKind: ApplicationKind; // Application の型
  subjects: readonly Readonly<{ kind: "place" | "listing" | "region" | "occasion"; name: string | null }>[];
}>;

type RefLabel =
  | Readonly<{ ref: Extract<OccurrenceRef, { kind: "application" }>; label: ApplicationLabel | null }>
  | Readonly<{ ref: Exclude<OccurrenceRef, { kind: "application" }>; label: string | null }>;
```

`label` は、参照の指す先の名称（店舗・掲載・地域・イベントの名称、読みもののタイトル、カテゴリーの名称、申立て・連絡の対象の名称、アカウントのメールアドレス）。申請の参照は、申請の種類と、対象ごとの名称を構造で持ち、文面への連結は表示する側が行う。指す先がなくなっていれば `null`。名称は、対象が閲覧できるかどうかを問わず解決する。店舗・掲載・地域・イベント・読みもの（`ContentRef`）の名称は、出来事の参照、申請の対象、申立て・連絡の対象のどれでも、Moderation の `ContentDirectory.describe` の `name` だけで決まる。申請の対象と名称は、Application の「申請の対象の名称」（[application.md](application.md)）の規則による。`category` の参照は、`categories_reassigned` の廃止したカテゴリーだけが持つ。

### ApproverSeat

Application が定める型（[application.md](application.md)）で、サービス運営者の席（`operator`）と、地域・イベントの運営者の席（`steward`）の直和。申請の種類から承認者を決める規則は Application が持つ。Notification は、ドメインイベントのペイロードの `approver` を使い、規則を持たない。申請者は、ペイロードの `applicant`（Application の `Applicant`）から、店舗管理者として行った申請は店舗の `PlaceId` を出来事に、個人として行った申請は申請した人の `AccountId` を告知に移して使う。

### ShowcaseChange

公開中の読みものが紹介する対象に起きた変化。紹介先の種類ごとに、起こりうる変化だけを持つ。

```ts
type ShowcaseChange =
  | Readonly<{ showcase: { kind: "listing"; id: ListingId };
      change: "suspended" | "unpublished" | "deleted" | "offering_ended" | "place_suspended" | "place_closed" }>
  | Readonly<{ showcase: { kind: "place"; id: PlaceId }; change: "suspended" | "closed" }>
  | Readonly<{ showcase: { kind: "region"; id: RegionId }; change: "suspended" | "unpublished" }>
  | Readonly<{ showcase: { kind: "occasion"; id: OccasionId };
      change: "suspended" | "unpublished" | "ended" | "cancelled" }>;
```

- `suspended` は運営による非公開（店舗は非公開）、`unpublished` は掲載の一時非公開と地域・イベントの公開の取り下げ（事由を問わない）
- `place_suspended`・`place_closed` は、紹介先の掲載が紐づく店舗の非公開・閉店
- 店舗・地域・イベントは削除されないので、`deleted` は掲載だけが持つ

### Delivery / DeliveredOccurrence

```ts
type Delivery = "direct" | "proxy";

type DeliveredOccurrence =
  | Readonly<{ occurrence: StewardAudienceOccurrence; delivery: Delivery }>
  | Readonly<{ occurrence: DirectAudienceOccurrence; delivery: "direct" }>;
```

`proxy` は、対象に管理者がいないために、サービス運営者が管理者の代わりに受けたことを表す（I-16）。`proxy` を持てるのは、届け先の立場が対象の管理者の全員である出来事だけ。

`DeliveredOccurrence.vacantTarget(d: DeliveredOccurrence): StewardedRef | null` は、`delivery` が `proxy` なら管理者が不在の対象（`Addressing.stewardsOf(d.occurrence).target`）を、`direct` なら `null` を返す。管理者不在のためにサービス運営者が受けた通知とメールは、不在の対象（`vacantTarget`）と、出来事が指す対象（`Occurrence.pointedContent`、または出来事の申請）を、どちらも出来事から求められる。

### NotificationDestination

通知とそのメールから開く先。画面を持たず、行き先の種類と対象の ID で表す。

```ts
type PlaceFacet = "overview" | "profile" | "listings" | "affiliations" | "participations" | "members";

type DirectDestination =
  | Readonly<{ kind: "ownApplication"; applicationId: ApplicationId }>      // 申請者として確かめる申請
  | Readonly<{ kind: "applicationReview"; applicationId: ApplicationId }>   // 承認者として判断する申請
  | Readonly<{ kind: "placeManagement"; placeId: PlaceId; facet: PlaceFacet }>
  | Readonly<{ kind: "participationEditing"; placeId: PlaceId; occasionId: OccasionId }>
  | Readonly<{ kind: "listingManagement"; listingId: ListingId; placeId: PlaceId }> // placeId は掲載の店舗。掲載が削除された後も店舗の掲載の一覧へ入れる
  | Readonly<{ kind: "confirmationRequest"; reportId: InfoReportId }>
  | Readonly<{ kind: "regionManagement"; regionId: RegionId; facet: "content" | "occasionLinks" }>
  | Readonly<{ kind: "occasionManagement"; occasionId: OccasionId; facet: "content" | "regionLinks" }>
  | Readonly<{ kind: "occasionParticipant"; occasionId: OccasionId; placeId: PlaceId }> // イベントの参加店舗を、その店舗の現在の参加内容を示して開く
  | Readonly<{ kind: "articleEditing"; articleId: ArticleId }>
  | Readonly<{ kind: "takedownClaimHandling"; claimId: TakedownClaimId }>
  | Readonly<{ kind: "infoReportHandling"; reportId: InfoReportId }>
  | Readonly<{ kind: "invitation"; target: StewardedRef; invitationId: InvitationId }> // 招待は対象と InvitationId の組で引く（Authority）
  | Readonly<{ kind: "grantedAuthority"; granted: GrantedAuthority }>;

type NotificationDestination =
  | DirectDestination
  | Readonly<{ kind: "proxyOperation"; target: StewardedRef; direct: DirectDestination }>; // 管理者不在の代わりに、サービス運営者として管理者が不在の対象を運営する
```

`proxyOperation` の `target` は管理者が不在の対象（`DeliveredOccurrence.vacantTarget`）で、`direct` は、同じ出来事が管理者に届いたときの行き先そのもの。Notification は、サービス運営者がその行き先を不在の代行で開けるかどうかで絞らない。開けるかどうかは、行き先から画面への写しを持つ presentation が決める。

`NotificationDestination.of(d: DeliveredOccurrence): NotificationDestination | null` は、次の表で行き先を決める（`spec/pages/index.md`「通知から開く画面」）。行き先を決める対応は、この関数だけが持つ。通知一覧（`listNotifications`）の行き先と、メールの行き先（`RenderedMail.link`）は、どちらもこの関数の値。

| 出来事 | 行き先 |
| --- | --- |
| `delivery` が `proxy` の `approver` | `applicationReview` |
| `delivery` が `proxy` の、ほかの `StewardAudienceOccurrence` | `proxyOperation`。`target` は `DeliveredOccurrence.vacantTarget(d)`。`direct` は `of({ occurrence: d.occurrence, delivery: "direct" })`（`StewardAudienceOccurrence` の `direct` の行き先は `null` にならない） |
| `applicant` | `ownApplication` |
| `approver` | `applicationReview` |
| `contentManagers` / 店舗の `suspended`・`unsuspended` | `placeManagement`（`overview`） |
| `contentManagers` / 店舗の `photos_taken_down` | `placeManagement`（`profile`） |
| `contentManagers` / 掲載 | `listingManagement`（`placeId` は出来事が指す掲載の店舗） |
| `contentManagers` / 地域 | `regionManagement`（`content`） |
| `contentManagers` / イベント | `occasionManagement`（`content`） |
| `contentManagers` / 読みもの | `articleEditing` |
| `placeStewards` / 店舗の `excluded_from_region` | `placeManagement`（`affiliations`） |
| `placeStewards` / 店舗の `excluded_from_occasion` | `placeManagement`（`participations`） |
| `placeStewards` / 店舗の `occasion_cancelled`・`occasion_period_changed` | `participationEditing`（その店舗とイベント） |
| `placeStewards` / 店舗の `categories_reassigned` | `placeManagement`（`listings`） |
| `placeStewards` / 店舗の `steward_added` | `placeManagement`（`members`） |
| `placeStewards` / 店舗または掲載の `confirmation_requested` | `confirmationRequest` |
| `regionStewards` / `occasion_linked` | `regionManagement`（`occasionLinks`） |
| `occasionStewards` / `participation_withdrawn`・`participation_changed` | `occasionParticipant`（そのイベントと、事柄の店舗） |
| `occasionStewards` / `region_link_detached` | `occasionManagement`（`regionLinks`） |
| `editors` | `articleEditing` |
| `operators` / `application_review_period_elapsed` | `applicationReview` |
| `operators` / `takedown_claim_received` | `takedownClaimHandling` |
| `operators` / `info_report_received` | `infoReportHandling` |
| `invitee` | `invitation`（出来事の `target` と `invitationId`） |
| `grantee` | `grantedAuthority` |
| `self` | `null`（開く先を持たない） |

表の上の行が先に当たる。

### Announcement / Origin

```ts
type Origin =
  | Readonly<{ by: "event"; eventId: EventId }>
  | Readonly<{ by: "content"; token: string }>;

// 届け先の立場がアカウントそのものである出来事
type AccountAudienceOccurrence =
  | Extract<DirectAudienceOccurrence, { to: "applicant" | "grantee" | "self" }>;

type Announcement =
  | Readonly<{ occurrence: AccountAudienceOccurrence; accountId: AccountId; origin: Origin }>
  | Readonly<{ occurrence: Exclude<Occurrence, AccountAudienceOccurrence>; origin: Origin }>;
```

- `accountId` は届け先のアカウント（個人として申請した人、管理権限・役割を付与・解除された人）
- `by: "event"`: 1つのドメインイベントが1つの出来事を表す。出どころはそのドメインイベントの ID
- `by: "content"`: 同じ出来事を表すドメインイベントが複数出うる。出どころは出来事の内容から決まる `token`。日次のジョブが出すドメインイベント（同時のジョブで重ねて出うる）が当たる

### OccurrenceKey

空でない文字列のブランド型。等価性は文字列の一致。

- `OccurrenceKey.of(origin: Origin, occurrence: Occurrence): OccurrenceKey` は、出どころ（`eventId` または `token`）と、出来事の指紋（`to`、事柄の種類、出来事が持つすべての ID（`ContentRef` は種類とともに）とメールアドレスを、決まった順に連結した文字列）を連結して作る
  - 同じドメインイベントを重ねて消費しても、同じ出来事は同じキーになる
  - 1つのドメインイベントから複数の出来事（店舗管理者宛てと編集担当者宛て、参加店舗ごと、廃止したカテゴリーの掲載を持つ店舗ごと、読みものと紹介先の組ごと）が出ても、出来事ごとに違うキーになる
- `OccurrenceKey.ofTakedownOutcome(claimId: TakedownClaimId): OccurrenceKey` は、申立ての結果のメールのキーを作る。申立ての結果は申立てごとに1つなので、キーは申立ての ID だけで決まる
- `of` と `ofTakedownOutcome` は、種類を表す別々の接頭辞で始まり、互いに等しい値を作らない

通知の一意のキーは `occurrenceKey` と `recipient` の組、メールの一意のキーは `occurrenceKey` と宛先のメールアドレスの組。

```ts
type MailKey = Readonly<{ occurrenceKey: OccurrenceKey; to: EmailAddress }>;
```

### Audience / Addressees

```ts
type Audience =
  | Readonly<{ kind: "account"; accountId: AccountId }>
  | Readonly<{ kind: "stewards"; target: StewardedRef; except: AccountId | null }>
  | Readonly<{ kind: "role"; role: Role }>
  | Readonly<{ kind: "email"; email: EmailAddress }>;

type InviteeDelivered = Readonly<{
  occurrence: Extract<DirectAudienceOccurrence, { to: "invitee" }>;
  delivery: "direct";
}>;

type Addressees =
  | Readonly<{
      delivered: DeliveredOccurrence;                                    // 告知の出来事と、届いた経路
      to: Readonly<{ kind: "accounts"; accountIds: readonly AccountId[] }>; // 同じアカウントは1回だけ。空は宛先なし
    }>
  | Readonly<{
      delivered: InviteeDelivered;                                        // 招待だけが作れる
      to: Readonly<{ kind: "emailOnly"; email: EmailAddress }>;           // アカウントのないメールアドレス
    }>;
```

`emailOnly` の宛先は、サービス内の通知を持たず、メールだけが届く。`emailOnly` を持てるのは招待の出来事だけで、型が限る。

### NotificationMail / TakedownOutcomeMail / RenderedMail

```ts
type NotificationMail = Readonly<{
  key: MailKey;
  labels: readonly RefLabel[];
}> & DeliveredOccurrence;

type TakedownOutcomeMail = Readonly<{
  key: MailKey;
  target: RefLabel;         // 申立ての対象（ContentRef）と、その名称
  receivedAt: Date;         // 申立てを受け付けた日時
  outcome: TakedownOutcome; // Moderation の型
}>;

type RenderedMail = Readonly<{
  to: EmailAddress;
  subject: string;
  body: string;
  link: NotificationDestination | null; // 本文が載せる行き先。開く先を持たないメールは null
}>;
```

- `NotificationMail.compose(origin: Origin, delivered: DeliveredOccurrence, to: EmailAddress, labels: readonly RefLabel[]): NotificationMail` が作る。`key` は `{ occurrenceKey: OccurrenceKey.of(origin, delivered.occurrence), to }`。宛先は `key.to`
- `TakedownOutcomeMail.compose(claim: ResolvedTakedownClaim, targetLabel: string | null): TakedownOutcomeMail` が作る。`key` は `{ occurrenceKey: OccurrenceKey.ofTakedownOutcome(claim.id), to: claim.email }`。`target` は `claim.ground` の対象と `targetLabel`、`receivedAt` と `outcome` は申立ての値。`ResolvedTakedownClaim` は Moderation の型
- `RenderedMail` は、`NotificationMailRenderer` が組み立てた、送る形のメール

## ドメインサービス

どちらも純粋な関数で、ポートに依存しない。事実はユースケースが他のドメインのポートから読んで渡す。

### Announcements

責務: 他のドメインのドメインイベントから、告知を取り出す。ドメインイベントと出来事の対応（「ドメインイベント」の節の表）を持つ唯一の場所。

```ts
type AnnouncementFacts = Readonly<{
  participatingPlaces: readonly PlaceId[];
  ownerListingPlace: PlaceId | null;           // content.photos_taken_down の owner が掲載のとき、その掲載が紐づく店舗
  placesOfRetiredCategory: readonly PlaceId[]; // 廃止したカテゴリーの掲載を持つ店舗。重複なし
  showcasingArticles: readonly Readonly<{ articleId: ArticleId; showcases: readonly ShowcaseRef[] }>[];
}>;
```

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Announcements.showcaseRefsOf` | `event: NotifiableEvent, placeListings: readonly ListingId[]` | `readonly ShowcaseRef[]` | そのドメインイベントで変化した紹介先の候補を返す。掲載・地域・イベントのドメインイベントはその対象。店舗のドメインイベント（非公開、閉店）は、その店舗と `placeListings` のすべての掲載。紹介先の変化に当たらないドメインイベントは空 |
| `Announcements.from` | `event: NotifiableEvent, facts: AnnouncementFacts` | `readonly Announcement[]` | 対応の表に従って告知を取り出す。対応の表の条件に当たらないドメインイベントは空。参加店舗宛ての出来事は `facts.participatingPlaces` の店舗ごとに1つ、カテゴリーの廃止は `facts.placesOfRetiredCategory` の店舗ごとに1つ、紹介先の変化は `facts.showcasingArticles` の読みものと、その読みものが持つ候補の紹介先の組ごとに1つ取り出す |

`NotifiableEvent` は、対応の表の P-91〜P-100 の行にあるドメインイベントの型の直和。各型は、そのドメインイベントを出すドメインのファイル（共有カーネルのドメインイベントは [index.md](index.md)）が宣言する。

### Addressing

責務: 出来事から届け先の立場を決め、管理体制・名簿の事実から宛先を決める。宛先の規則（I-05、I-16）を持つ唯一の場所。

```ts
type AddressingFacts = Readonly<{
  stewardship: Stewardship | null;      // 届け先の立場が stewards のとき、その対象の管理体制。保存がなければ null（管理者不在）
  operators: OperatorRoster;            // サービス運営者の名簿。開設前は unestablished（持ち主は0人）
  editors: EditorRoster;                // 編集担当者の名簿。持ち主は0人でもよい
  inviteeAccount: AccountId | null;     // 届け先の立場が email のとき、そのメールアドレスのアカウント
}>;
```

`Stewardship`・`OperatorRoster`・`EditorRoster` は Authority の型。名簿の持ち主は Authority の `RoleRoster.holders` で読む（`unestablished` は空）。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Addressing.stewardsOf` | `o: StewardAudienceOccurrence` | `{ target: StewardedRef; except: AccountId \| null }` | 下の表で、管理者の全員を宛先にする対象と、除く人を決める |
| `Addressing.audienceOf` | `a: Announcement` | `Audience` | 下の表で届け先の立場を決める |
| `Addressing.resolve` | `a: Announcement, facts: AddressingFacts` | `Addressees` | 下の規則で宛先と届いた経路を決める。例外を投げない |

管理者の全員を宛先にする対象（`stewardsOf`）。

| `o.to` | `target` | `except` |
| --- | --- | --- |
| `applicant`（`place`） | その店舗 | `null` |
| `approver`（`steward`） | その地域・イベント | `null` |
| `placeStewards` | その店舗 | `steward_added` だけ `appointee`。ほかは `null` |
| `regionStewards`、`occasionStewards` | その地域・イベント | `null` |
| `contentManagers`（読みもの以外） | 店舗・地域・イベントはその対象、掲載は `placeId` の店舗 | `null` |

届け先の立場（`audienceOf`）。

| `a.occurrence.to` | `Audience` |
| --- | --- |
| `applicant`（`individual`）、`grantee`、`self` | `account`（`a.accountId`） |
| `StewardAudienceOccurrence` のすべて | `stewards`（`stewardsOf(a.occurrence)`） |
| `approver`（`operator`）、`operators` | `role`（`operator`） |
| `editors`、`contentManagers`（読みもの） | `role`（`editor`） |
| `invitee` | `email` |

宛先の規則（`resolve`）。`delivered.occurrence` は `a.occurrence`。

| `Audience` | 宛先 | `delivery` |
| --- | --- | --- |
| `account` | そのアカウント | `direct` |
| `stewards` | 管理体制が `stewarded` なら、`except` を除くすべての管理者。除いた結果が0人なら宛先なし | `direct` |
| | 管理体制が `vacant`（保存がない場合を含む）なら、すべてのサービス運営者。サービス運営者の名簿が `unestablished`（開設前）なら宛先なし | `proxy` |
| `role` | 名簿のすべての持ち主。持ち主が0人（編集担当者が0人、サービス運営者の名簿が `unestablished`）なら宛先なし | `direct` |
| `email` | `inviteeAccount` があれば `accounts` にそのアカウント。なければ `emailOnly` にそのメールアドレス | `direct` |

- 宛先は、消費の時点の管理体制・名簿で決める（店舗管理者として行った申請の申請者宛ての通知は、その時点のその店舗のすべての店舗管理者に届く）。ドメインイベントのペイロードにある就任・解除の前後の状態は使わない
- 最後の店舗管理者がいなくなって失効した申請（P-77 b）の失効の通知は、`stewards` の規則により、サービス運営者に `proxy` で届く
- 運営者が不在の地域・イベントへの申請の、承認者宛ての通知も `proxy` で届く。サービス運営者はこの申請の承認者でもある
- 複数の管理権限と役割を持つアカウントは、出来事ごとに別の通知を受ける。出来事をまたいでまとめない
- 出来事を起こした人を宛先から除く規則は、`steward_added` の `appointee` のほかにない（自分が出した申請の承認者宛ての通知、自分への役割の付与の通知も届く）

## ドメインイベント

Notification はドメインイベントを出さない。

消費するドメインイベントと、出来事の対応は次のとおり。告知になる条件は、この表の「条件と `Origin`」の列だけが定める。条件に当たらないドメインイベントは告知を持たない。`Origin` の欄に `by: "content"` とない行は `by: "event"`。

| 契約 | 出来事（`to` / 事柄） | ドメインイベント | 条件と `Origin` |
| --- | --- | --- | --- |
| P-91 | `applicant` / `returned` | `application.returned` | |
| P-91 | `applicant` / `approved` | `application.approved` | 代行による承認を含む |
| P-91 | `applicant` / `rejected` | `application.rejected` | 代行による否認を含む |
| P-91 | `applicant` / `lapsed` | `application.lapsed` | |
| P-92 | `approver` / `submitted` | `application.submitted` | 再申請を含む。登録申請に併せた管理権限の申請は、別の申請として別に出る |
| P-92 | `approver` / `resubmitted` | `application.resubmitted` | |
| P-92 | `approver` / `withdrawn` | `application.withdrawn` | 申請者の操作と、退会による取り下げの両方 |
| P-93 | `placeStewards` / 店舗の `excluded_from_region` | `region.affiliation_dissolved` | `cause` が `excluded` |
| P-93 | `placeStewards` / 店舗の `excluded_from_occasion` | `occasion.participation_dissolved` | `cause` が `excluded` |
| P-93 | `placeStewards` / 店舗の `occasion_cancelled` | `occasion.cancelled` | 参加中の店舗ごとに1つ |
| P-93 | `placeStewards` / 店舗の `occasion_period_changed` | `occasion.period_changed` | 参加中の店舗ごとに1つ |
| P-93〜P-95 | `contentManagers` / `suspended`、`unsuspended` | `place.suspended`、`place.unsuspended`、`listing.suspended`、`listing.unsuspended`、`region.suspended`、`region.unsuspended`、`occasion.suspended`、`occasion.unsuspended` | `content` はドメインイベントの対象。掲載の `placeId` はペイロードの `placeId` |
| P-93〜P-96 | `contentManagers` / `photos_taken_down` | `content.photos_taken_down` | `content` はペイロードの `owner`。`owner` の対象について1つ。`unpublished` の値にかかわらない。掲載の `placeId` は `facts.ownerListingPlace` で、`null`（掲載がない）なら告知を持たない |
| P-93 | `placeStewards` / 店舗または掲載の `confirmation_requested` | `info_report.confirmation_requested` | ペイロードの `target` が掲載なら掲載の事柄、店舗なら店舗の事柄 |
| P-93 | `placeStewards` / 店舗の `categories_reassigned` | `category.retired` | 廃止したカテゴリーの掲載を持つ店舗ごとに1つ。`retiredCategoryId` はペイロードの `categoryId`。店舗が複数の掲載を持っても、店舗と廃止したカテゴリーの組ごとに1つの通知になる（カテゴリーは1回だけ廃止される） |
| P-93 | `placeStewards` / 店舗の `steward_added` | `authority.steward_appointed` | `via` が `application` |
| P-94 | `regionStewards` / `occasion_linked` | `occasion.region_linked` | |
| P-95 | `occasionStewards` / `participation_withdrawn` | `occasion.participation_dissolved` | `cause` が `withdrawn` |
| P-95 | `occasionStewards` / `participation_changed` | `occasion.participation_changed` | `changedBy` が `place` |
| P-95 | `occasionStewards` / `region_link_detached` | `occasion.region_link_detached` | |
| P-96 | `editors` / `showcase_changed`（掲載: `suspended`、`unpublished`、`deleted`） | `listing.suspended`、`listing.unpublished`、`listing.deleted` | その掲載を紹介する公開中の読みものごと |
| P-96 | `editors` / `showcase_changed`（掲載: `offering_ended`） | `listing.offering_ended` | `by: "content"`。`token` は `observedOn`。期日による提供終了と操作による提供終了を区別しない |
| P-96 | `editors` / `showcase_changed`（店舗: `suspended`、掲載: `place_suspended`） | `place.suspended` | その店舗、またはその店舗の掲載を紹介する公開中の読みものと、紹介先の組ごと |
| P-96 | `editors` / `showcase_changed`（店舗: `closed`、掲載: `place_closed`） | `place.operating_status_changed` | `to` が `permanentlyClosed`。組は上と同じ |
| P-96 | `editors` / `showcase_changed`（地域: `suspended`、`unpublished`） | `region.suspended`、`region.unpublished` | |
| P-96 | `editors` / `showcase_changed`（イベント: `suspended`、`unpublished`、`cancelled`） | `occasion.suspended`、`occasion.unpublished`、`occasion.cancelled` | |
| P-96 | `editors` / `showcase_changed`（イベント: `ended`） | `occasion.ended` | `by: "content"`。`token` は `observedOn` |
| P-97 | `operators` / `application_review_period_elapsed` | `application.review_period_elapsed` | `by: "content"`。`token` は `pendingSince` |
| P-97 | `operators` / `takedown_claim_received` | `takedown_claim.submitted` | |
| P-97 | `operators` / `info_report_received` | `info_report.submitted` | |
| P-98 | `invitee` | `authority.invitation_issued` | |
| P-99 | `grantee` / `stewardship` | `authority.steward_appointed` | `via` が `grant`（対象は地域・イベント） |
| P-99 | `grantee` / `role` | `authority.role_granted` | |
| P-100 | `self` / `stewardship` | `authority.steward_removed` | `reason` が `revoked` |
| P-100 | `self` / `role` | `authority.role_revoked` | `reason` が `revoked` |
| — | （申立ての結果のメール。通知を作らない） | `takedown_claim.resolved` | 申立人のメールアドレスに1通 |
| — | （通知の削除） | `account.withdrawn` | そのアカウントの通知をすべて削除する |

- 1つのドメインイベントが、複数の宛先の立場の出来事になる（`place.suspended`・`listing.suspended`・`region.suspended`・`occasion.suspended` は `contentManagers` と `editors` の紹介先の変化の両方、`occasion.cancelled` は `placeStewards` と `editors` の両方）
- 紹介先の変化は、消費の時点で公開中の読みものにだけ出る。下書きと公開を取り下げた読みものには出ない
- 申立てに基づく写真の削除のドメインイベントは、共有カーネルの `content.photos_taken_down`（Moderation の `takeDownPhotosByClaim` が出す）。ペイロードの `owner` だけを使う。写真の削除で公開していない状態になった掲載・地域・イベントの、編集担当者への紹介先の変化は、同じ操作が出す `listing.unpublished`・`region.unpublished`・`occasion.unpublished` から作る

Application のドメインイベントのペイロードは [application.md](application.md) が定める。Notification は、`application.submitted`・`application.resubmitted`・`application.withdrawn` の `approver`、`application.returned`・`application.approved`・`application.rejected`・`application.lapsed` の `applicant`、`application.review_period_elapsed` の `pendingSince`（確認中になった日時）を使う。

承認による店舗管理者の追加は、Authority の `authority.steward_appointed`（`via: "application"`）から作る。Application のドメインイベントからは作らない。

## ポート

### NotificationRepository

アカウントに届いた通知を持つ。`UnitOfWorkContext` に `notificationRepository` として現れる。`TransactionalRepository` を拡張しない。通知は内容が変わらず、書き込みはどれも冪等なので、楽観ロックを使わない。

```ts
interface NotificationRepository {
  deliverAll(notifications: readonly Notification[]): Promise<void>;
  removeAllByRecipient(recipient: AccountId): Promise<void>;
  findByRecipient(
    recipient: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Notification>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `deliverAll` | `notifications` のそれぞれについて、同じ `occurrenceKey` と `recipient` の通知がなければ加える。あれば何もせず、先にある通知（`id` と `createdAt`）を残す。どちらも成功として返り、`ConflictError` にしない。一意性はポートが担保し、呼び出し側は事前に検索しない。同時に届いた同じキーの2つの書き込みは、1つの通知になる。1つの UnitOfWork の中で、すべて反映されるか、1つも反映されないかのどちらかになる。空の一覧は何もしない |
| `removeAllByRecipient` | そのアカウントの通知をすべて削除する。1件もなければ何もしない。繰り返し呼んでも結果は同じ |
| `findByRecipient` | そのアカウントの通知を返す。並び順は `createdAt` の新しい順、同順位は `id` の昇順。`count` はそのアカウントの通知の全件数。出来事の種類、届いた経路、指す対象が閲覧できるかどうかで絞らない。他のアカウントの通知は返さない |

- エラー: `ConflictError` と `NotFoundError` は返さない
- 可視性: コミットした書き込みは、以後の `findByRecipient` に即座に反映される
- 参照整合性: 宛先のアカウントと、出来事が指す先があることを、ポートは保存の条件にしない。宛先のアカウントがあることは、ユースケースが書き込みの前に確かめる。確かめた後に退会したアカウントの通知は残るが、`AccountId` は再び使われないので、どの通知一覧にも現れない

### NotificationMailRenderer

通知のメールと申立ての結果のメールの、文面と行き先を組み立てる。I/O を持たない関数のポートで、実装は presentation が持ち、DI で渡す。

```ts
interface NotificationMailRenderer {
  render(mail: NotificationMail): RenderedMail;
  renderTakedownOutcome(mail: TakedownOutcomeMail): RenderedMail;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `render` | `to` は `mail.key.to`。`link` は `NotificationDestination.of(mail)` の値。件名と本文を、`occurrence`・`delivery`・`labels` から組み立て、本文は `link` が `null` でなければ、その行き先を開く URL を含む。同じ `mail` からは同じ結果になる。例外を投げない |
| `renderTakedownOutcome` | `to` は `mail.key.to`。`link` は `null`（申立人はアカウントを持たず、開く画面がない）。件名と本文を、`target`・`receivedAt`・`outcome` から組み立て、本文は `outcome` の全文を含む。同じ `mail` からは同じ結果になる。例外を投げない |

- 行き先から URL への写しは実装が持ち、契約は写し方を定めない。通知一覧が行き先を開く写しと、同じ写しを使う。Notification のドメインと `Mailer` は、画面と URL を知らない
- `label` が `null` の参照は、名称なしで組み立てる。`categories_reassigned` のメールは移行先を載せない

### Mailer

組み立てたメールを送る。

```ts
interface Mailer {
  send(mail: RenderedMail): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `send` | `mail.to` に、`subject` と `body` のメールを1通送る。送信を引き受けた時点で解決する。呼ぶたびに1通を送り、同じ内容の `send` を重複として扱わない。行き先（`link`）の URL は `body` に含まれていて、`link` を別に扱わない |

- 重複の防止は `Mailer` の契約に含めない。送信済みかどうかは `MailDispatchLedger` が持ち、ユースケースが送る前に確かめる
- 宛先のメールアドレスは、ユースケースが読んで渡す（通知のメールは Account の `AccountRepository.findByIds`、申立ての結果のメールは申立ての `email`）。`Mailer` はアカウントを読まない
- ログイン用のメールには使わない

### MailDispatchLedger

通知のメールと申立ての結果のメールの、送信済みの記録を持つ。`UnitOfWorkContext` に `mailDispatchLedger` として現れる。

```ts
interface MailDispatchLedger {
  findDispatched(keys: readonly MailKey[]): Promise<readonly MailKey[]>;
  record(key: MailKey): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `findDispatched` | `keys`（0〜100件）のうち、記録があるキーを返す。0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。呼び出し側が分けて呼ぶ |
| `record` | そのキーの記録を加える。すでにあれば何もせず、成功として返る。`ConflictError` にしない。一意性（キーごとに1つ）はポートが担保し、同時に届いた同じキーの2つの `record` は1つの記録になる。UnitOfWork の中で呼ぶ |

- キーの一致は、`occurrenceKey` と `to` の値の一致による
- 可視性: コミットした記録は、以後の `findDispatched` に即座に反映される
- 台帳は、キーに記録があるかどうかだけを答える。記録の一覧と削除を持たない
- 参照整合性: index.md「リポジトリの共通の契約」の規則による。キーは集約を指さない（`occurrenceKey` は文字列、`to` はメールアドレス）ので、指す先のない記録はなく、記録は、宛先のアカウントの退会や、出来事が指す対象の削除の後も `findDispatched` に現れる

### 他のドメインのポートから読む事実

| 事実 | ポート | 使う場面 |
| --- | --- | --- |
| 対象の管理体制 | Authority の `StewardshipRepository.findById` | `Audience` が `stewards` |
| 役割の名簿 | Authority の `RoleRosterRepository.find`（`null` を返さない。保存がなければ `RoleRoster.initial(role)`） | `Audience` が `role`、`stewards` の `proxy` |
| 招待の宛先のアカウント | Account の `AccountRepository.findByEmail` | `Audience` が `email` |
| 宛先のメールアドレス | Account の `AccountRepository.findByIds`（100件ずつ） | すべての宛先のアカウント。存在しないアカウントは宛先から外す |
| イベントに参加中の店舗 | Occasion の `ParticipationRepository.findByOccasion`（すべてのページ） | `occasion.cancelled`、`occasion.period_changed` |
| 写真を外された掲載が紐づく店舗 | Listing の `ListingRepository.findById` の `placeId` | `owner` が掲載の `content.photos_taken_down` |
| 店舗の掲載 | Listing の `ListingRepository.findPageByPlace`（`shelf` は `{ publication: null, phase: null }`。すべてのページ） | `place.suspended`、閉店の `place.operating_status_changed` |
| 廃止したカテゴリーの掲載を持つ店舗 | Listing の `CategoryCatalogRepository.find` の台帳に `CategoryCatalog.predecessorsOf(catalog, categoryId)` を当てた `CategoryId` の集合を、`ListingRepository.findPageByCategories` に渡す（すべてのページ。公開状態と運営による非公開を問わない）。結果の掲載の `placeId` を、重複を除いて集める | `category.retired` |
| 紹介している公開中の読みもの | Article の `ArticleRepository.findPublishedByShowcases`（候補のすべてを1回で渡し、すべてのページを読む） | `Announcements.showcaseRefsOf` が空でないドメインイベント |
| 参照の名称 | 店舗・掲載・地域・イベント・読みもの（出来事の参照、申請の対象、申立て・連絡の対象）は Moderation の `ContentDirectory.describe`（100件ずつ。閲覧できるかどうかを問わない。結果にない対象は名称 `null`）。申請は Application の `ApplicationRepository.findByIds`、申立て・連絡の対象は Moderation の `TakedownClaimRepository.findById`・`InfoReportRepository.findById`、カテゴリーは Listing の `CategoryCatalogRepository.find`、アカウントは Account の `AccountRepository.findByIds`（100件ずつ） | メールと通知一覧の `labels` |
| 表示の時点の移行先のカテゴリー | Listing の `CategoryCatalogRepository.find` と `CategoryCatalog.resolve` | 通知一覧の `categories_reassigned` |
| 対応済みの申立て | Moderation の `TakedownClaimRepository.findById` | `takedown_claim.resolved` |
| 申立ての対象の名称 | Moderation の `ContentDirectory.describe`（閲覧できるかどうかを問わない。対象がなければ名称は `null`） | `takedown_claim.resolved` |

申請者と承認者は、Application のドメインイベントのペイロードから決まる。宛先の決定に Application のポートは使わない。

## トランザクション境界

`UnitOfWorkContext` は `notificationRepository` と `mailDispatchLedger` を持つ。

| 書き込み | 1つの UnitOfWork で確定する範囲 |
| --- | --- |
| 通知の記録 | 1つの告知の、すべての宛先のアカウントへの通知の `deliverAll` |
| 送信済みの記録 | 1通のメール（通知のメール、申立ての結果のメール）の `MailDispatchLedger.record` |
| 退会に伴う削除 | `removeAllByRecipient` |

Notification の UnitOfWork は、他のドメインの集約を書き換えず、ドメインイベントを保存しない。メールの送信は UnitOfWork の外で行う。ポートの契約が次の性質を持ち、ドメインイベントの重ねた消費を安全にする。

- 同じドメインイベントの同じ告知は、同じ `occurrenceKey` になる。`deliverAll` は同じキーと宛先の2回目を何もせずに成功にするので、通知は重複しない
- 送信済みかどうかは `MailDispatchLedger` がメールのキー（`MailKey`）ごとに持つ。`Mailer` は重複を防がない

`run` の数と順序、送信との前後、途中で失敗したときに残る状態は、各ユースケースのトランザクション境界（[../usecases/notification.md](../usecases/notification.md)）だけが定める。

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `deliverNotifications` | 対応の表の P-91〜P-100 の行にあるドメインイベントを消費し、告知を取り出し、宛先を決め、サービス内の通知を記録して、同じ出来事のメールを送る。重ねて消費しても、通知は重複せず、送信済みのメールは送り直さない | ACC-03（通知の表のすべての出来事）、APP-05、MEM-02、OPE-03、EDT-06、MOD-02、MOD-05 |
| `sendTakedownOutcome` | `takedown_claim.resolved` を消費し、対応済みの申立ての結果を申立人のメールアドレスに送る。送信済みの記録のあるメールは送り直さない。申立ては書き込まない | MOD-01、MOD-02 |
| `listNotifications` | ログインしたアカウントの通知を、新しい順で返す。通知ごとに、出来事、届いた経路、指す対象、参照の名称（`labels`）、行き先（`NotificationDestination.of`）を返す。`categories_reassigned` の通知には、表示の時点の移行先のカテゴリーを添える。他のアカウントの通知は返さない | ACC-03、APP-05 |
| `purgeNotificationsOnWithdrawal` | `account.withdrawn` を消費し、そのアカウントの通知をすべて削除する | ACC-04 |
