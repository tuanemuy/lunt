# Notification

出来事から宛先を決め、サービス内の通知とメールを届ける。共有カーネルの型（`NotificationId`、`ContentRef`、`StewardedRef`、`ShowcaseRef`、`EmailAddress`、`LocalDate`）、ドメインイベントの配送の規約、UnitOfWork ポートは [index.md](index.md) が定める。

- 通知する出来事は契約 P-91〜P-100 に限る。どの出来事も、他のドメインのドメインイベントから作る。Notification は自分の操作を持たず、ドメインイベントを出さない
- 1つの出来事は、サービス内の通知とメールの両方で届く（P-90、B-39）。正はサービス内の通知で、メールが届かなくても通知一覧で同じ通知を確かめられる
- 通知は既読・保持期間・停止設定を持たない。作られた通知は、宛先のアカウントが退会するまで残る
- 申立人への結果のメール（Moderation の `TakedownOutcomeMailer`）と、ログイン用のメール（Account の `LoginMailSender`）は、Notification を通らない
- 通知と、そのメールが開く画面は pages が定める。Notification は、画面を決めるのに要る値（出来事、出来事が指す対象、届いた経路）を通知に持たせる。メールの文面と行き先は `NotificationMailRenderer` が組み立て、`Mailer` は送るだけを担う

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Occurrence | 出来事 | 通知する出来事。宛先の立場と、立場ごとの事柄で表す。P-91〜P-100 に1対1で対応する |
| Matter | 事柄 | 1つの宛先の立場の中で、何が起きたかを表す値 |
| Announcement | 告知 | ドメインイベントから取り出した、宛先を決める前の出来事。出来事と、その出どころを持つ |
| Origin | 出どころ | 告知を生んだドメインイベント、または出来事の内容。同じ出来事を見分ける元になる |
| OccurrenceKey | 出来事のキー | 同じ出来事が同じ値になる文字列。通知とメールの重複を防ぐ元になる |
| Audience | 届け先の立場 | 出来事から決まる、通知を受ける立場（アカウント、対象の管理者の全員、役割を持つ全員、メールアドレス） |
| Addressing | 宛先の決定 | 届け先の立場と、管理体制・名簿の事実から、宛先を決めること |
| Addressee | 宛先 | 通知を届ける相手。アカウント、またはアカウントのないメールアドレス |
| Delivery | 届いた経路 | 宛先の立場どおりに届いたか（`direct`）、管理者不在のためにサービス運営者が代わりに受けたか（`proxy`） |
| Notification | 通知 | 1つのアカウントに届いた、1つの出来事の記録。サービス内の通知一覧に並ぶ |
| NotificationMail | 通知のメール | 通知と同じ出来事を、宛先のメールアドレスに送るメール |
| RenderedMail | 組み立てたメール | 通知のメールから組み立てた、宛先・件名・本文 |
| MailDispatch | 送信済みの記録 | 通知のメールを送ったことの記録。メールのキーごとに1つ |
| ShowcaseChange | 紹介先の変化 | 公開中の読みものが紹介する対象に起きた、非公開・公開の取り下げ・削除・閉店・提供終了・終了・中止 |

## エンティティ

### Notification（集約ルート）

```ts
type Notification = Readonly<{
  id: NotificationId;
  recipient: AccountId;
  occurrence: Occurrence;
  delivery: Delivery;
  occurrenceKey: OccurrenceKey;
  createdAt: Date;
}>;
```

| フィールド | 型 | 制約 |
| --- | --- | --- |
| `id` | `NotificationId` | |
| `recipient` | `AccountId` | 宛先のアカウント |
| `occurrence` | `Occurrence` | 出来事の種類と、出来事が指す対象 |
| `delivery` | `Delivery` | 届いた経路 |
| `occurrenceKey` | `OccurrenceKey` | `recipient` との組が、通知の重複を防ぐ一意のキーになる |
| `createdAt` | `Date` | 通知を作った日時。通知一覧の並び順の基準 |

どのフィールドも、作成の後に変わらない。版を持たない。

振る舞い。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Notification.issue` | `params: { id: string; announcement: Announcement; addressee: AccountAddressee }`, `now: Date` | `Notification` | `occurrenceKey` を `OccurrenceKey.of(announcement)` で求め、`createdAt` を `now` にした通知を作る。下の不変条件を欠けば `BusinessRuleError("NOTIFICATION_ADDRESSEE_MISMATCH")` |
| `Notification.pointedContent` | `n: Notification` | `ContentRef \| null` | 通知が指す対象を返す（下の表）。指す対象が `ContentRef` でない出来事は `null` |
| `Notification.vacantTarget` | `n: Notification` | `StewardedRef \| null` | `delivery` が `proxy` なら、管理者が不在の対象（`Addressing.audienceOf(n.occurrence)` の `stewards` の `target`）を返す。`direct` なら `null` |
| `Notification.reconstruct` | 保存された値 | `Notification` | 値を確かめて組み立て直す。失敗は `RehydrationError` |

`pointedContent` が返す対象。

| `occurrence.to` | 返す対象 |
| --- | --- |
| `placeStewards` | 事柄が掲載を持てば（`listing_suspended`、`listing_unsuspended`、`listing_photos_taken_down`、掲載への `confirmation_requested`）その掲載。ほかは店舗 |
| `regionStewards` | 地域 |
| `occasionStewards` | イベント |
| `editors` | 読みもの |
| `invitee` | 招待の対象 |
| `grantee`、`self` | 管理権限ならその対象。役割なら `null` |
| `applicant`、`approver`、`operators` | `null`（指す対象は申請、申立て、連絡） |

不変条件。

- 同じ `occurrenceKey` と `recipient` の通知は1つ。`NotificationRepository` が担保する
- `delivery` が `proxy` の通知は、届け先の立場が対象の管理者の全員（`Audience` の `stewards`）である出来事だけが持つ。管理者不在のためにサービス運営者が受けた通知は、不在の対象（`vacantTarget`）と、出来事が指す対象（`pointedContent`、または `occurrence` の申請）を、どちらも `occurrence` から求められる
- `occurrence.to` が `grantee`・`self` の通知の `recipient` は、`occurrence.accountId` と一致する
- 通知は、宛先が後から管理権限・役割を失っても、指す対象が閲覧できなくなっても、削除されても残る。通知から進んだ先の可否は、進んだ先の操作が確かめる

ライフサイクル。

- 生成: ドメインイベントの消費で、宛先のアカウントごとに作る。利用者の操作では作られない
- 状態遷移: 状態を持たない
- 消滅: 宛先のアカウントの退会で、そのアカウントの通知をすべて削除する。ほかに削除はない

## 値オブジェクト

### Occurrence

通知する出来事。宛先の立場（`to`）ごとの直和で、P-91〜P-100 の出来事を過不足なく持つ。

```ts
type Occurrence =
  | Readonly<{ to: "applicant"; applicant: Applicant; applicationId: ApplicationId;
      matter: "returned" | "approved" | "rejected" | "lapsed" }>                       // P-91
  | Readonly<{ to: "approver"; approver: ApproverSeat; applicationId: ApplicationId;
      matter: "submitted" | "resubmitted" | "withdrawn" }>                             // P-92
  | Readonly<{ to: "placeStewards"; placeId: PlaceId; matter: PlaceMatter }>           // P-93
  | Readonly<{ to: "regionStewards"; regionId: RegionId; matter: RegionMatter }>       // P-94
  | Readonly<{ to: "occasionStewards"; occasionId: OccasionId; matter: OccasionMatter }> // P-95
  | Readonly<{ to: "editors"; articleId: ArticleId; matter: ArticleMatter }>           // P-96
  | Readonly<{ to: "operators"; matter: OperatorMatter }>                              // P-97
  | Readonly<{ to: "invitee"; email: EmailAddress; target: StewardedRef;
      invitationId: InvitationId }>                                                    // P-98
  | Readonly<{ to: "grantee"; accountId: AccountId; granted: GrantedAuthority }>       // P-99
  | Readonly<{ to: "self"; accountId: AccountId; revoked: RevokedAuthority }>;         // P-100

type PlaceMatter =
  | Readonly<{ kind: "excluded_from_region"; regionId: RegionId }>
  | Readonly<{ kind: "excluded_from_occasion"; occasionId: OccasionId }>
  | Readonly<{ kind: "occasion_cancelled"; occasionId: OccasionId }>
  | Readonly<{ kind: "occasion_period_changed"; occasionId: OccasionId }>
  | Readonly<{ kind: "place_suspended" }>
  | Readonly<{ kind: "place_unsuspended" }>
  | Readonly<{ kind: "listing_suspended"; listingId: ListingId }>
  | Readonly<{ kind: "listing_unsuspended"; listingId: ListingId }>
  | Readonly<{ kind: "place_photos_taken_down" }>
  | Readonly<{ kind: "listing_photos_taken_down"; listingId: ListingId }>
  | Readonly<{ kind: "confirmation_requested"; reportId: InfoReportId; listingId: ListingId | null }>
  | Readonly<{ kind: "categories_reassigned"; retiredCategoryId: CategoryId }>
  | Readonly<{ kind: "steward_added"; appointee: AccountId }>;

type RegionMatter =
  | Readonly<{ kind: "occasion_linked"; occasionId: OccasionId }>
  | Readonly<{ kind: "region_suspended" }>
  | Readonly<{ kind: "region_unsuspended" }>
  | Readonly<{ kind: "region_photos_taken_down" }>;

type OccasionMatter =
  | Readonly<{ kind: "participation_withdrawn"; placeId: PlaceId }>
  | Readonly<{ kind: "participation_changed"; placeId: PlaceId }>
  | Readonly<{ kind: "region_link_detached"; regionId: RegionId }>
  | Readonly<{ kind: "occasion_suspended" }>
  | Readonly<{ kind: "occasion_unsuspended" }>
  | Readonly<{ kind: "occasion_photos_taken_down" }>;

type ArticleMatter =
  | Readonly<{ kind: "showcase_changed"; change: ShowcaseChange }>
  | Readonly<{ kind: "article_photos_taken_down" }>;

type OperatorMatter =
  | Readonly<{ kind: "application_review_overdue"; applicationId: ApplicationId }>
  | Readonly<{ kind: "takedown_claim_received"; claimId: TakedownClaimId }>
  | Readonly<{ kind: "info_report_received"; reportId: InfoReportId }>;

type GrantedAuthority =
  | Readonly<{ kind: "stewardship"; target: Extract<StewardedRef, { kind: "region" | "occasion" }> }>
  | Readonly<{ kind: "role"; role: Role }>;

type RevokedAuthority =
  | Readonly<{ kind: "stewardship"; target: StewardedRef }>
  | Readonly<{ kind: "role"; role: Role }>;
```

- `categories_reassigned` は、店舗と廃止したカテゴリーの組ごとに1つの出来事。カテゴリーの廃止で、保存された `CategoryId` を書き換えずに移行先のカテゴリーのものとして読まれるようになった掲載を、その店舗が持つことを表す。移行先は持たない。通知一覧を返すユースケースが、表示の時点の移行先を Listing の `CategoryCatalog.resolve(catalog, retiredCategoryId)` で求めて添える。廃止済みのカテゴリーは台帳から消えないので、`resolve` は必ず成立する。メールは移行先を載せない
- `confirmation_requested` の `listingId` は、連絡の対象が掲載のときだけ持つ（Moderation の `InfoReportTarget`）
- `steward_added` は、管理権限の申請の承認による店舗管理者の追加。`appointee` は就任した人
- 写真の削除の事柄（`…_photos_taken_down`）は、外した写真（`photoIds`）と、削除で公開していない状態になったかどうか（`unpublished`）を持たない。現在の写真と公開状態は、通知から進んだ先が示す
- `Role` は Authority の型、`InfoReportId`・`TakedownClaimId`・`InvitationId` は共有カーネルの ID
- 等価性: 全フィールドの一致

`Occurrence.refsOf(o: Occurrence): readonly OccurrenceRef[]` は、出来事が持つ参照を列挙する。通知一覧とメールに示す名称の解決に使う。

```ts
type OccurrenceRef =
  | ContentRef
  | Readonly<{ kind: "category"; id: CategoryId }>       // categories_reassigned の retiredCategoryId
  | Readonly<{ kind: "application"; id: ApplicationId }>
  | Readonly<{ kind: "takedownClaim"; id: TakedownClaimId }>
  | Readonly<{ kind: "infoReport"; id: InfoReportId }>
  | Readonly<{ kind: "account"; id: AccountId }>; // steward_added の appointee

type RefLabel = Readonly<{ ref: OccurrenceRef; label: string | null }>;
```

`label` は、参照の指す先の名称（店舗・掲載・地域・イベントの名称、読みもののタイトル、カテゴリーの名称、申請の種類と対象の名称、申立て・連絡の対象の名称、アカウントのメールアドレス）。指す先がなくなっていれば `null`。名称は、対象が閲覧できるかどうかを問わず、各ドメインの管理側の読み取りから解決する。

申請の対象の名称は、`Application.subjects` の対象の名称。対象がまだない申請は、申請の内容から取る。店舗の登録申請（`registration`）は `content`（`PlaceProfile`）の店名、掲載の申請（`listing`）は `content`（`PublishableListingContent`）の名称と、その店舗の名称。登録申請に併せた管理権限の申請（`target.registrationId` を持つ `stewardship`）は、併せた登録申請の `content`（`PlaceProfile`）の店名。承認で店舗・掲載が作られた後も、この3つは申請の内容から取る。`Application.subjects` は店舗・地域・イベント・掲載・登録申請だけを返し、カテゴリーを返さない。`category` の参照は、`categories_reassigned` の廃止したカテゴリーだけが持つ。

### Applicant / ApproverSeat

Application が定める型（[application.md](application.md)）。形は次のとおり。

```ts
type Applicant =
  | Readonly<{ kind: "individual"; accountId: AccountId }>
  | Readonly<{ kind: "place"; placeId: PlaceId }>; // 店舗管理者として行った申請

type ApproverSeat =
  | Readonly<{ kind: "operator" }>
  | Readonly<{ kind: "steward"; target: Extract<StewardedRef, { kind: "region" | "occasion" }> }>;
```

申請の種類から承認者を決める規則は Application が持つ。Notification は、ドメインイベントのペイロードの `approver` を使い、規則を持たない。

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

### Delivery

```ts
type Delivery = "direct" | "proxy";
```

`proxy` は、対象に管理者がいないために、サービス運営者が管理者の代わりに受けたことを表す（I-16）。管理者が不在の対象は `occurrence` から決まるので、`Delivery` は持たない（`Notification.vacantTarget`）。

### Announcement / Origin

```ts
type Origin =
  | Readonly<{ by: "event"; eventId: EventId }>
  | Readonly<{ by: "content"; token: string }>;

type Announcement = Readonly<{ occurrence: Occurrence; origin: Origin }>;
```

- `by: "event"`: 1つのドメインイベントが1つの出来事を表す。出どころはそのドメインイベントの ID
- `by: "content"`: 同じ出来事を表すドメインイベントが複数出うる。出どころは出来事の内容から決まる `token`。日次のジョブが出すドメインイベント（同時のジョブで重ねて出うる）が当たる

### OccurrenceKey

空でない文字列のブランド型。`OccurrenceKey.of(a: Announcement): OccurrenceKey` は、出どころ（`eventId` または `token`）と、出来事の指紋（`to`、事柄の種類、出来事が持つすべての ID とメールアドレスを、決まった順に連結した文字列）を連結して作る。

- 同じドメインイベントを重ねて消費しても、同じ出来事は同じキーになる
- 1つのドメインイベントから複数の出来事（店舗管理者宛てと編集担当者宛て、参加店舗ごと、廃止したカテゴリーの掲載を持つ店舗ごと、読みものと紹介先の組ごと）が出ても、出来事ごとに違うキーになる
- 等価性: 文字列の一致

通知の一意のキーは `occurrenceKey` と `recipient` の組、メールの一意のキーは `occurrenceKey` と宛先のメールアドレスの組。

```ts
type MailKey = Readonly<{ occurrenceKey: OccurrenceKey; to: EmailAddress }>;
```

### Audience / Addressee

```ts
type Audience =
  | Readonly<{ kind: "account"; accountId: AccountId }>
  | Readonly<{ kind: "stewards"; target: StewardedRef; except: AccountId | null }>
  | Readonly<{ kind: "role"; role: Role }>
  | Readonly<{ kind: "email"; email: EmailAddress }>;

type AccountAddressee = Readonly<{ kind: "account"; accountId: AccountId; delivery: Delivery }>;
type EmailOnlyAddressee = Readonly<{ kind: "emailOnly"; email: EmailAddress }>;
type Addressee = AccountAddressee | EmailOnlyAddressee;
```

`EmailOnlyAddressee` は、アカウントのないメールアドレスへの招待だけが当たる。サービス内の通知を持たず、メールだけが届く。

### NotificationMail

```ts
type NotificationMail = Readonly<{
  key: MailKey;
  occurrence: Occurrence;
  delivery: Delivery;
  labels: readonly RefLabel[];
}>;
```

`NotificationMail.compose(announcement: Announcement, to: EmailAddress, delivery: Delivery, labels: readonly RefLabel[]): NotificationMail` が作る。`EmailOnlyAddressee` のメールの `delivery` は `direct`。宛先は `key.to`。

```ts
type RenderedMail = Readonly<{ to: EmailAddress; subject: string; body: string }>;
```

`RenderedMail` は、`NotificationMailRenderer` が `NotificationMail` から組み立てた、送る形のメール。

## ドメインサービス

どちらも純粋な関数で、ポートに依存しない。事実はユースケースが他のドメインのポートから読んで渡す。

### Announcements

責務: 他のドメインのドメインイベントから、告知を取り出す。ドメインイベントと出来事の対応（「ドメインイベント」の節の表）を持つ唯一の場所。

```ts
type AnnouncementFacts = Readonly<{
  participatingPlaces: readonly PlaceId[];
  placesOfRetiredCategory: readonly PlaceId[]; // 廃止したカテゴリーの掲載を持つ店舗。重複なし
  showcasingArticles: readonly Readonly<{ articleId: ArticleId; showcases: readonly ShowcaseRef[] }>[];
}>;
```

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Announcements.showcaseRefsOf` | `event: NotifiableEvent, placeListings: readonly ListingId[]` | `readonly ShowcaseRef[]` | そのドメインイベントで変化した紹介先の候補を返す。掲載・地域・イベントのドメインイベントはその対象。店舗のドメインイベント（非公開、閉店）は、その店舗と `placeListings` のすべての掲載。紹介先の変化に当たらないドメインイベントは空 |
| `Announcements.from` | `event: NotifiableEvent, facts: AnnouncementFacts` | `readonly Announcement[]` | 対応の表に従って告知を取り出す。条件に当たらないドメインイベント（`via: "invitation"` の就任、`resigned`・`withdrawn` の解除、閉店でない営業状況の変更、`changedBy: "occasion"` の変更、`left` の所属の解除）は空。参加店舗宛ての出来事は `facts.participatingPlaces` の店舗ごとに1つ、カテゴリーの廃止は `facts.placesOfRetiredCategory` の店舗ごとに1つ、紹介先の変化は `facts.showcasingArticles` の読みものと、その読みものが持つ候補の紹介先の組ごとに1つ取り出す |

`NotifiableEvent` は、対応の表にあるドメインイベントの型の直和。

### Addressing

責務: 出来事から届け先の立場を決め、管理体制・名簿の事実から宛先を決める。宛先の規則（I-05、I-16）を持つ唯一の場所。

```ts
type AddressingFacts = Readonly<{
  stewardship: Stewardship | null;      // audience が stewards のとき、その対象の管理体制。保存がなければ null（管理者不在）
  operators: OperatorRoster;            // サービス運営者の名簿。開設前は unestablished（持ち主は0人）
  editors: EditorRoster;                // 編集担当者の名簿。持ち主は0人でもよい
  inviteeAccount: AccountId | null;     // audience が email のとき、そのメールアドレスのアカウント
}>;
```

`Stewardship`・`OperatorRoster`・`EditorRoster` は Authority の型。名簿の持ち主は Authority の `RoleRoster.holders` で読む（`unestablished` は空）。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Addressing.audienceOf` | `o: Occurrence` | `Audience` | 下の表で届け先の立場を決める |
| `Addressing.resolve` | `audience: Audience, facts: AddressingFacts` | `readonly Addressee[]` | 下の規則で宛先を決める。同じアカウントは1回だけ現れる。例外を投げない |

届け先の立場。

| `occurrence.to` | `Audience` |
| --- | --- |
| `applicant`（`individual`） | `account`（申請した人） |
| `applicant`（`place`） | `stewards`（その店舗。`except: null`） |
| `approver`（`operator`） | `role`（`operator`） |
| `approver`（`steward`） | `stewards`（その地域・イベント。`except: null`） |
| `placeStewards` | `stewards`（その店舗）。`steward_added` だけ `except` が `appointee` |
| `regionStewards`、`occasionStewards` | `stewards`（その地域・イベント。`except: null`） |
| `editors` | `role`（`editor`） |
| `operators` | `role`（`operator`） |
| `invitee` | `email` |
| `grantee`、`self` | `account`（`occurrence.accountId`） |

宛先の規則。

| `Audience` | 宛先 |
| --- | --- |
| `account` | そのアカウント。`direct` |
| `stewards` | 管理体制が `stewarded` なら、`except` を除くすべての管理者。`direct`。除いた結果が0人なら宛先なし |
| | 管理体制が `vacant`（保存がない場合を含む）なら、すべてのサービス運営者。`proxy`。サービス運営者の名簿が `unestablished`（開設前）なら宛先なし |
| `role` | 名簿のすべての持ち主。`direct`。持ち主が0人（編集担当者が0人、サービス運営者の名簿が `unestablished`）なら宛先なし |
| `email` | `inviteeAccount` があればそのアカウント（`direct`）。なければ `EmailOnlyAddressee` |

- 宛先は、消費の時点の管理体制・名簿で決める（店舗管理者として行った申請の申請者宛ての通知は、その時点のその店舗のすべての店舗管理者に届く）。ドメインイベントのペイロードにある就任・解除の前後の状態は使わない
- 最後の店舗管理者がいなくなって失効した申請（P-77 b）の失効の通知は、`stewards` の規則により、サービス運営者に `proxy` で届く
- 運営者が不在の地域・イベントへの申請の、承認者宛ての通知も `proxy` で届く。サービス運営者はこの申請の承認者でもある
- 複数の管理権限と役割を持つアカウントは、出来事ごとに別の通知を受ける。出来事をまたいでまとめない
- 出来事を起こした人を宛先から除く規則は、`steward_added` の `appointee` のほかにない（自分が出した申請の承認者宛ての通知、自分への役割の付与の通知も届く）

## ドメインイベント

Notification はドメインイベントを出さない。

消費するドメインイベントと、出来事の対応は次のとおり。`Origin` の欄が空の行は `by: "event"`。

| 契約 | 出来事（`to` / 事柄） | ドメインイベント | 条件と `Origin` |
| --- | --- | --- | --- |
| P-91 | `applicant` / `returned` | `application.returned` | |
| P-91 | `applicant` / `approved` | `application.approved` | 代行による承認を含む |
| P-91 | `applicant` / `rejected` | `application.rejected` | 代行による否認を含む |
| P-91 | `applicant` / `lapsed` | `application.lapsed` | |
| P-92 | `approver` / `submitted` | `application.submitted` | 再申請を含む。登録申請に併せた管理権限の申請は、別の申請として別に出る |
| P-92 | `approver` / `resubmitted` | `application.resubmitted` | |
| P-92 | `approver` / `withdrawn` | `application.withdrawn` | 申請者の操作と、退会による取り下げの両方 |
| P-93 | `placeStewards` / `excluded_from_region` | `region.affiliation_dissolved` | `cause` が `excluded` |
| P-93 | `placeStewards` / `excluded_from_occasion` | `occasion.participation_dissolved` | `cause` が `excluded` |
| P-93 | `placeStewards` / `occasion_cancelled` | `occasion.cancelled` | 参加中の店舗ごとに1つ |
| P-93 | `placeStewards` / `occasion_period_changed` | `occasion.period_changed` | 参加中の店舗ごとに1つ |
| P-93 | `placeStewards` / `place_suspended`、`place_unsuspended` | `place.suspended`、`place.unsuspended` | |
| P-93 | `placeStewards` / `listing_suspended`、`listing_unsuspended` | `listing.suspended`、`listing.unsuspended` | |
| P-93 | `placeStewards` / `place_photos_taken_down` | `place.photos_taken_down` | |
| P-93 | `placeStewards` / `listing_photos_taken_down` | `listing.photos_taken_down` | `unpublished` の値にかかわらず1つ |
| P-93 | `placeStewards` / `confirmation_requested` | `info_report.confirmation_requested` | |
| P-93 | `placeStewards` / `categories_reassigned` | `category.retired` | 廃止したカテゴリーの掲載を持つ店舗ごとに1つ。`retiredCategoryId` はペイロードの `categoryId`。店舗が複数の掲載を持っても、店舗と廃止したカテゴリーの組ごとに1つの通知になる（カテゴリーは1回だけ廃止される） |
| P-93 | `placeStewards` / `steward_added` | `authority.steward_appointed` | `via` が `application` |
| P-94 | `regionStewards` / `occasion_linked` | `occasion.region_linked` | |
| P-94 | `regionStewards` / `region_suspended`、`region_unsuspended` | `region.suspended`、`region.unsuspended` | |
| P-94 | `regionStewards` / `region_photos_taken_down` | `region.photos_taken_down` | `unpublished` の値にかかわらず1つ |
| P-95 | `occasionStewards` / `participation_withdrawn` | `occasion.participation_dissolved` | `cause` が `withdrawn` |
| P-95 | `occasionStewards` / `participation_changed` | `occasion.participation_changed` | `changedBy` が `place` |
| P-95 | `occasionStewards` / `region_link_detached` | `occasion.region_link_detached` | |
| P-95 | `occasionStewards` / `occasion_suspended`、`occasion_unsuspended` | `occasion.suspended`、`occasion.unsuspended` | |
| P-95 | `occasionStewards` / `occasion_photos_taken_down` | `occasion.photos_taken_down` | `unpublished` の値にかかわらず1つ |
| P-96 | `editors` / `showcase_changed`（掲載: `suspended`、`unpublished`、`deleted`） | `listing.suspended`、`listing.unpublished`、`listing.deleted` | その掲載を紹介する公開中の読みものごと |
| P-96 | `editors` / `showcase_changed`（掲載: `offering_ended`） | `listing.offering_ended` | `by: "content"`。`token` は `observedOn`。期日による提供終了（`cause` が `schedule`）と、操作による提供終了（`manual`）の両方 |
| P-96 | `editors` / `showcase_changed`（店舗: `suspended`、掲載: `place_suspended`） | `place.suspended` | その店舗、またはその店舗の掲載を紹介する公開中の読みものと、紹介先の組ごと |
| P-96 | `editors` / `showcase_changed`（店舗: `closed`、掲載: `place_closed`） | `place.operating_status_changed` | `to` が `permanentlyClosed`。組は上と同じ |
| P-96 | `editors` / `showcase_changed`（地域: `suspended`、`unpublished`） | `region.suspended`、`region.unpublished` | |
| P-96 | `editors` / `showcase_changed`（イベント: `suspended`、`unpublished`、`cancelled`） | `occasion.suspended`、`occasion.unpublished`、`occasion.cancelled` | |
| P-96 | `editors` / `showcase_changed`（イベント: `ended`） | `occasion.ended` | `by: "content"`。`token` は `observedOn` |
| P-96 | `editors` / `article_photos_taken_down` | `article.photos_taken_down` | `unpublished` の値にかかわらず1つ |
| P-97 | `operators` / `application_review_overdue` | `application.review_overdue` | `by: "content"`。`token` は `pendingSince` |
| P-97 | `operators` / `takedown_claim_received` | `takedown_claim.submitted` | |
| P-97 | `operators` / `info_report_received` | `info_report.submitted` | |
| P-98 | `invitee` | `authority.invitation_issued` | |
| P-99 | `grantee` / `stewardship` | `authority.steward_appointed` | `via` が `grant`（対象は地域・イベント） |
| P-99 | `grantee` / `role` | `authority.role_granted` | |
| P-100 | `self` / `stewardship` | `authority.steward_removed` | `reason` が `revoked` |
| P-100 | `self` / `role` | `authority.role_revoked` | `reason` が `revoked` |
| — | （通知の削除） | `account.withdrawn` | そのアカウントの通知をすべて削除する |

- 1つのドメインイベントが、複数の宛先の立場の出来事になる（`place.suspended`・`listing.suspended`・`region.suspended`・`occasion.suspended`・`occasion.cancelled` は、管理者宛てと編集担当者宛ての両方）
- 紹介先の変化は、消費の時点で公開中の読みものにだけ出る。下書きと公開を取り下げた読みものには出ない
- 運営による非公開の解除、再公開、提供中への復帰、中止の取り消しは、編集担当者への通知にならない
- 申立てに基づく写真の削除のドメインイベントは `{domain}.photos_taken_down`（`takeDown{Place|Listing|Region|Occasion|Article}Photos` が出す）。ペイロードの対象の ID だけを使う。写真の削除で公開していない状態になった掲載・地域・イベントの、編集担当者への紹介先の変化は、同じ操作が出す `listing.unpublished`・`region.unpublished`・`occasion.unpublished` から作る

Application のドメインイベントのペイロードは [application.md](application.md) が定める。Notification は、`application.submitted`・`application.resubmitted`・`application.withdrawn` の `applicant`・`approver`、`application.returned`・`application.approved`・`application.rejected`・`application.lapsed` の `applicant`、`application.review_overdue` の `pendingSince`（確認中になった日時）を使う。

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

通知のメールの文面と行き先を組み立てる。I/O を持たない関数のポートで、実装は presentation が持ち、DI で渡す。

```ts
interface NotificationMailRenderer {
  render(mail: NotificationMail): RenderedMail;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `render` | `to` は `mail.key.to`。件名と本文を、`occurrence`・`delivery`・`labels` から組み立てる。同じ `mail` からは同じ結果になる。例外を投げない |

- 本文は、サービス内の通知と同じ画面を開く行き先を1つ載せる。行き先は `spec/pages/index.md`「通知から開く画面」に従い、`occurrence` と `delivery`（`proxy` の通知は `Notification.vacantTarget` と同じ対象）から決まる。開く画面を持たない出来事（`self`）は行き先を載せない
- 出来事から開く画面を決める対応は、presentation の1か所が持つ。通知一覧と、このポートの実装が、同じ対応を使う。Notification のドメインと `Mailer` は、画面を知らない
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
| `send` | `mail.to` に、`subject` と `body` のメールを1通送る。送信を引き受けた時点で解決する。引き受けられなければ `SystemError`（再び呼べる）。呼ぶたびに1通を送り、同じ内容の `send` を重複として扱わない |

- 重複の防止は `Mailer` の契約に含めない。送信済みかどうかは `MailDispatchLedger` が持ち、ユースケースが送る前に確かめる
- 宛先のメールアドレスは、ユースケースが Account の `AccountRepository.findByIds` から読んで渡す。`Mailer` はアカウントを読まない
- ログイン用のメールと、申立人への結果のメールには使わない

### MailDispatchLedger

通知のメールの送信済みの記録を持つ。`UnitOfWorkContext` に `mailDispatchLedger` として現れる。

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

### 他のドメインのポートから読む事実

| 事実 | ポート | 使う場面 |
| --- | --- | --- |
| 対象の管理体制 | Authority の `StewardshipRepository.findById` | `Audience` が `stewards` |
| 役割の名簿 | Authority の `RoleRosterRepository.find`（`null` を返さない。保存がなければ `RoleRoster.initial(role)`） | `Audience` が `role`、`stewards` の `proxy` |
| 招待の宛先のアカウント | Account の `AccountRepository.findByEmail` | `Audience` が `email` |
| 宛先のメールアドレス | Account の `AccountRepository.findByIds`（100件ずつ） | すべての宛先。存在しないアカウントは宛先から外す |
| イベントに参加中の店舗 | Occasion の `ParticipationRepository.findByOccasion`（すべてのページ） | `occasion.cancelled`、`occasion.period_changed` |
| 店舗の掲載 | Listing の `ListingRepository.findPageByPlace`（`shelf` は `null`。すべてのページ） | `place.suspended`、閉店の `place.operating_status_changed` |
| 廃止したカテゴリーの掲載を持つ店舗 | Listing の `CategoryCatalogRepository.find` の台帳に `CategoryCatalog.predecessorsOf(catalog, categoryId)` を当てた `CategoryId` の集合を、`ListingRepository.findPageByCategories` に渡す（すべてのページ。公開状態と運営による非公開を問わない）。結果の掲載の `placeId` を、重複を除いて集める | `category.retired` |
| 紹介している公開中の読みもの | Article の `ArticleRepository.findPublishedByShowcases`（候補を100件ずつ、すべてのページ） | `Announcements.showcaseRefsOf` が空でないドメインイベント |
| 参照の名称 | Place・Listing・Region・Occasion・Application・Account のリポジトリの `findByIds`（100件ずつ）、Article の `ArticleRepository.findById`、Moderation の `TakedownClaimRepository.findById`・`InfoReportRepository.findById`、Listing の `CategoryCatalogRepository.find` | メールと通知一覧の `labels` |
| 表示の時点の移行先のカテゴリー | Listing の `CategoryCatalogRepository.find` と `CategoryCatalog.resolve` | 通知一覧の `categories_reassigned` |

申請者と承認者は、Application のドメインイベントのペイロードから決まる。宛先の決定に Application のポートは使わない。

## トランザクション境界

`UnitOfWorkContext` は `notificationRepository` と `mailDispatchLedger` を持つ。

| 書き込み | 1つの UnitOfWork で確定する範囲 |
| --- | --- |
| 通知の記録 | 1つの告知の、すべての宛先のアカウントへの通知の `deliverAll` |
| 送信済みの記録 | 1通のメールの `MailDispatchLedger.record` |
| 退会に伴う削除 | `removeAllByRecipient` |

Notification の UnitOfWork は、他のドメインの集約を書き換えず、ドメインイベントを保存しない。メールの送信は UnitOfWork の外で行う。

1つのドメインイベントの消費は、次の順に進む。

1. 事実を読み、`Announcements.from` で告知を取り出す
2. 告知ごとに、`Addressing` で宛先を決め、宛先のアカウントのメールアドレスを読む。存在しないアカウントは宛先から外す
3. 告知ごとに、宛先のアカウントへの通知を1つの UnitOfWork で記録する
4. 記録がコミットした後に、その告知のすべての宛先（`EmailOnlyAddressee` を含む）の `MailKey` を `MailDispatchLedger.findDispatched` で確かめる。記録のない宛先ごとに、`NotificationMailRenderer.render` の結果を `Mailer.send` に渡し、送信が成立したら `MailDispatchLedger.record` を1つの UnitOfWork で確定する。1つの宛先への送信の失敗で、他の宛先への送信を止めない
5. 1つの告知の失敗で、他の告知の処理を止めない。すべての告知の記録と送信が成立したときだけ、消費は成功になる。1つでも失敗すれば消費は失敗になり、リレーが同じドメインイベントを再び配送する

重複の防ぎ方と、途中で失敗したときに残る状態。

- 同じドメインイベントを重ねて消費すると、同じ告知は同じ `occurrenceKey` になる。通知は `deliverAll` が同じキーの2回目を何もせずに成功にするので、重複しない。メールは、`MailDispatchLedger` に記録のあるキーを送らない。消費の前にドメインイベントを処理済みとして記録する方式を使わない（失敗した消費の続きを、再配送で行えるようにする）
- メールは少なくとも1回の配送として扱う。送信が成立した後に送信済みの記録が成立しなかった場合と、同じドメインイベントの消費が同時に重なった場合は、再配送または重なった消費で、同じメールがもう1通届きうる。サービス内の通知は重複しない
- 記録の前に失敗: 通知もメールもない。再配送で最初から行う
- 記録がコミットした後、メールの送信の前または途中で失敗: サービス内の通知は届いていて、メールは一部または全部が届いていない。再配送で、通知の記録は何もせず、送信済みの記録のないメールだけが送られる
- メールが引き受けられないままリレーの再配送の上限に達した: サービス内の通知だけが残る。利用者は通知一覧で確かめる（B-39）
- 宛先は消費のたびに決め直す。再配送までに管理者・役割を持つ人が替わっていれば、新しい宛先にも届く。先に届いた通知は取り消さない。記録の後に宛先でなくなったアカウントに、送れていなかったメールは送らない
- 退会に伴う削除は、`account.withdrawn` の消費で結果整合にする。退会したアカウントではログインできないため、削除までの間も通知は読まれない。退会の後に同じメールアドレスで作られるアカウントは別の `AccountId` を持ち、以前の通知を引き継がない
- 配送の順序は保証されない。告知は消費の時点の事実で作るので、先に起きた出来事の通知が後から届くことがある。通知一覧の並びは `createdAt`（通知を作った日時）による

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `deliverNotifications` | 対応の表にあるドメインイベントを消費し、告知を取り出し、宛先を決め、サービス内の通知を記録して、同じ出来事のメールを送る。重ねて消費しても、通知は重複せず、送信済みのメールは送り直さない | ACC-03（通知の表のすべての出来事）、APP-05、MEM-02、OPE-03、EDT-06、MOD-02、MOD-05 |
| `listNotifications` | ログインしたアカウントの通知を、新しい順で返す。通知ごとに、出来事、届いた経路、指す対象、参照の名称（`labels`）を返す。`categories_reassigned` の通知には、表示の時点の移行先のカテゴリーを添える。他のアカウントの通知は返さない | ACC-03、APP-05 |
| `purgeNotificationsOnWithdrawal` | `account.withdrawn` を消費し、そのアカウントの通知をすべて削除する | ACC-04 |
