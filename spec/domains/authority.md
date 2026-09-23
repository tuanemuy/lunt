# Authority

店舗・地域・イベントの管理権限と招待、編集担当者・サービス運営者の役割、操作の可否の判断を管理する。ドメインの境界、共有カーネル、ドメインをまたぐ規約は [index.md](index.md) が定める。ドメイン層は共有カーネルの型（`AccountId`、`EmailAddress`、`StewardedRef`、`Actor`）だけを参照し、他のドメインに依存しない。

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Target | 対象 | 管理権限が及ぶ店舗・地域・イベント。`StewardedRef` で指す |
| Steward | 管理者 | 対象の管理権限を持つアカウント。店舗の店舗管理者、地域の地域運営者、イベントのイベント運営者の総称。同じ対象の管理者は全員が同じ操作範囲を持つ |
| Stewardship | 管理体制 | 1つの対象の、管理者の集合と承諾前の招待 |
| Vacant | 管理者不在 | 対象に管理者が1人もいない状態。公開は続き、サービス運営者が代行する |
| Invitation | 招待 | 管理者がメールアドレス宛てに送る、管理者になることの誘い。承諾前のものだけが存在する。期限はない |
| Accept | 承諾 | 招待の宛先のメールアドレスのアカウントが、招待を受けて管理者になること |
| Grant | 付与 | サービス運営者が、地域・イベントの管理権限、または役割を与えること。相手の承諾は要らない |
| Appoint | 就任 | アカウントが対象の管理者になること。招待の承諾、管理権限の申請の承認（店舗）、付与（地域・イベント）で起きる |
| Resign | 辞任 | 管理者が自分の管理権限を手放すこと |
| Revoke | 解除 | サービス運営者が、管理者の管理権限、または役割を取り除くこと |
| Role | 役割 | 対象に結びつかない権限。編集担当者（`editor`）とサービス運営者（`operator`） |
| RoleRoster | 役割の名簿 | 1つの役割を持つアカウントの集合 |
| Proxy | 代行 | 管理者不在の対象を、サービス運営者が管理者に代わって管理すること |
| AccessPolicy | 操作の可否 | 操作する人の管理権限・役割と、対象の管理者の有無から、操作を行えるかどうかを決める規則 |

## エンティティ

### Stewardship（集約）

対象ごとに1つ。集約の ID は `target`。

```ts
type Steward = Readonly<{ accountId: AccountId; since: Date }>;

type Invitation = Readonly<{
  id: InvitationId;
  email: EmailAddress;
  invitedAt: Date;
}>;

type StewardshipBase = Readonly<{
  target: StewardedRef;
  invitations: readonly Invitation[];
  version: Version;
}>;

type StewardedStewardship = StewardshipBase &
  Readonly<{ status: "stewarded"; stewards: readonly [Steward, ...Steward[]] }>;
type VacantStewardship = StewardshipBase & Readonly<{ status: "vacant" }>;

type Stewardship = StewardedStewardship | VacantStewardship;
```

| フィールド | 型 | 制約 |
| --- | --- | --- |
| `target` | `StewardedRef` | 集約の ID。変わらない |
| `stewards` | `readonly [Steward, ...Steward[]]` | `stewarded` だけが持つ。`accountId` の重複はない。就任の古い順 |
| `invitations` | `readonly Invitation[]` | 承諾前の招待。`id` の重複も `email` の重複もない。招待の古い順。`vacant` でも持てる |
| `version` | `Version` | |

招待は、対象（`target`）と `InvitationId` の組で引く。`InvitationId` だけから管理体制を解決する問い合わせはない。招待を確認・承諾・取り消す要求と、`"authority.invitation_issued"` のペイロードは、両方を持つ。

振る舞い。どれも操作する人の権限を確かめない（`AccessPolicy` が確かめる）。状態を変える振る舞いは `WithEventDrafts<Stewardship, AuthorityEvent>` を返す。

| メソッド | 引数 | 処理 |
| --- | --- | --- |
| `Stewardship.vacant` | `target: StewardedRef` | 管理者も招待もない `VacantStewardship` を返す（`version` は初期値）。保存された管理体制のない対象を表す |
| `Stewardship.isVacant` | `s: Stewardship` | `status === "vacant"` |
| `Stewardship.isSteward` | `s: Stewardship, accountId: AccountId` | そのアカウントが管理者かどうか |
| `Stewardship.isSoleSteward` | `s: Stewardship, accountId: AccountId` | そのアカウントが唯一の管理者かどうか（辞任・解除・退会で管理者不在になるかの確認に使う） |
| `Stewardship.standingOf` | `s: Stewardship, accountId: AccountId` | `AccessPolicy` に渡す `TargetStanding` を返す |
| `Stewardship.classifyInvite` | `s, params: { invitationId: InvitationId; email: EmailAddress }` | 冪等な作成の判定。`id` も `email` も同じ招待があれば `"replay"`、同じ `id` で `email` が違う招待があれば `"conflict"`、どちらでもなければ `"new"` を返す。ユースケースは `replay` を書き込みなしの成功に、`conflict` を `ConflictError` にし、`new` のときだけ `invite` を呼ぶ |
| `Stewardship.invite` | `s, params: { invitationId: string; email: string }, addressee: AccountId \| null, now: Date` | `addressee` は、そのメールアドレスのアカウント（事実。なければ `null`）。`addressee` が管理者なら `BusinessRuleError("ALREADY_STEWARD")`。同じ `email` の招待があれば `BusinessRuleError("INVITATION_ALREADY_PENDING")`。成立すると招待を加え、`"authority.invitation_issued"` を返す。メールアドレスの形式が正しくなければ `BusinessRuleError("COMMON_INVALID_EMAIL_ADDRESS")`。`vacant` の対象にも加えられるが、`AccessPolicy` は管理者にだけ招待を許す |
| `Stewardship.cancelInvitation` | `s, invitationId: InvitationId` | その招待がなければ `BusinessRuleError("INVITATION_NOT_FOUND")`。あれば取り除く。ドメインイベントは出さない |
| `Stewardship.invitationStatusFor` | `s, invitationId: InvitationId, viewer: { accountId: AccountId; email: EmailAddress }` | `"already_steward"`（閲覧した人が管理者）、`"not_found"`（招待がない。取り消された）、`"addressed_to_other"`（宛先が閲覧した人のメールアドレスと違う）、`"acceptable"` のどれかを、この順に判定して返す |
| `Stewardship.acceptInvitation` | `s, invitationId: InvitationId, acceptor: { accountId: AccountId; email: EmailAddress }, now: Date` | `invitationStatusFor` が `acceptable` でなければ、順に `BusinessRuleError("ALREADY_STEWARD")`、`("INVITATION_NOT_FOUND")`、`("INVITATION_EMAIL_MISMATCH")`。成立すると就任（下の共通の処理、`via: "invitation"`）。`vacant` の対象でも成立する |
| `Stewardship.appointByApproval` | `s: Stewardship & { target: { kind: "place" } }, appointee: { accountId; email }, now: Date` | 店舗の管理権限の申請の承認による就任（`via: "application"`）。Application の承認のユースケースが、申請の承認と同じ UnitOfWork で呼ぶ。すでに管理者なら `BusinessRuleError("ALREADY_STEWARD")` |
| `Stewardship.grant` | `s: Stewardship & { target: { kind: "region" \| "occasion" } }, appointee: { accountId; email }, now: Date` | サービス運営者の付与による就任（`via: "grant"`）。店舗は型で受け付けない。すでに管理者なら `BusinessRuleError("ALREADY_STEWARD")` |
| `Stewardship.removeSteward` | `s, accountId: AccountId, reason: "resigned" \| "revoked" \| "withdrawn", now: Date` | 管理者でなければ `BusinessRuleError("NOT_A_STEWARD")`。管理者から取り除き、`"authority.steward_removed"` を返す。最後の管理者なら `vacant` にして、`"authority.stewardship_vacated"` も返す。招待は変えない。最後の管理者も取り除ける |
| `Stewardship.reconstruct` | 永続化された値 | 不変条件を検証して復元する。失敗は `RehydrationError` |

就任の共通の処理: `appointee` を `since: now` で管理者に加え、`stewarded` にする。`appointee.email` 宛ての招待があれば取り除く。`"authority.steward_appointed"` を返す（`wasVacant` は就任の前の `status`）。

不変条件。

- 管理者の `accountId` は重複しない。招待の `id` と `email` はそれぞれ重複しない
- `status` は管理者の有無と一致する（`stewarded` は1人以上、`vacant` は0人）
- 管理者のメールアドレス宛ての招待はない（招待のときは `addressee` で確かめ、就任のときは宛先の招待を取り除く。アカウントのメールアドレスは変わらない）
- 招待は、招待した管理者の辞任・解除・退会でも、対象が管理者不在になっても残る。消えるのは、承諾、取り消し、宛先のアカウントの別の経路での就任だけ
- 招待を承諾できるのは、宛先のメールアドレスのアカウントだけ
- 管理権限は、時間の経過や利用状況では失われない（B-32）。管理者が減るのは `removeSteward` だけ
- 1つのアカウントは複数の対象の管理者になれる。対象ごとの管理体制は互いに独立している
- 管理者は、存在するアカウントだけ。就任の書き込みは、相手のアカウントの版を同じ UnitOfWork で進め（Account の `Account.markReferenced`）、退会は、その人のすべての管理権限を同じ UnitOfWork で取り除く。就任と退会は Account の楽観ロックで直列になる

ライフサイクル。

- 生成: 保存された管理体制のない対象は `Stewardship.vacant(target)` として扱う。最初の書き込み（店舗は管理権限の申請の承認、地域・イベントは付与）で `insert` する。対象の登録とは別に作られる
- 状態遷移: `vacant → stewarded`（就任）、`stewarded → vacant`（最後の管理者の辞任・解除・退会）。`stewarded` の間の就任と `removeSteward` は `stewarded` のまま
- 消滅: 削除しない

### RoleRoster（集約）

役割ごとに1つ。集約の ID は `role`。

```ts
type Role = "editor" | "operator";

type RoleHolder = Readonly<{ accountId: AccountId; since: Date }>;

type UnestablishedOperatorRoster = Readonly<{
  role: "operator";
  status: "unestablished"; // 開設時の設定の前。サービス運営者は誰もいない
  version: Version;
}>;
type EstablishedOperatorRoster = Readonly<{
  role: "operator";
  status: "established";
  holders: readonly [RoleHolder, ...RoleHolder[]];
  version: Version;
}>;
type OperatorRoster = UnestablishedOperatorRoster | EstablishedOperatorRoster;

type EditorRoster = Readonly<{
  role: "editor";
  holders: readonly RoleHolder[];
  version: Version;
}>;

type RoleRoster = OperatorRoster | EditorRoster;
```

| フィールド | 型 | 制約 |
| --- | --- | --- |
| `role` | `Role` | 集約の ID。変わらない |
| `status` | `"unestablished" \| "established"` | `operator` だけが持つ。`established` から `unestablished` へは戻らない |
| `holders` | `RoleHolder[]` | `accountId` の重複はない。付与の古い順。`established` の `operator` は1人以上（型で表す）。`editor` は0人でもよい |
| `version` | `Version` | |

振る舞い。状態を変える振る舞いは `WithEventDrafts<RoleRoster, AuthorityEvent>` を返す。

| メソッド | 引数 | 処理 |
| --- | --- | --- |
| `RoleRoster.initial` | `role: Role` | 保存された名簿がないときの名簿を返す（`version` は初期値）。`operator` は `unestablished`、`editor` は持ち主が0人 |
| `RoleRoster.establishOperators` | `roster: OperatorRoster, first: AccountId, now: Date` | 開設時の設定だけが使う。`unestablished` の名簿を、`first` だけを持ち主に持つ `established` にする。`established` で、持ち主が `first` だけなら、変更なし・下書きなしで返す（送り直し）。それ以外の `established` は `BusinessRuleError("OPERATORS_ALREADY_ESTABLISHED")`。`"authority.role_granted"` は返さない |
| `RoleRoster.holders` | `roster: RoleRoster` | 持ち主の並びを返す。`unestablished` は空 |
| `RoleRoster.holds` | `roster: RoleRoster, accountId: AccountId` | そのアカウントが役割を持つかどうか |
| `RoleRoster.isSoleHolder` | `roster: RoleRoster, accountId: AccountId` | そのアカウントが唯一の持ち主かどうか |
| `RoleRoster.grant` | `roster: RoleRoster, accountId: AccountId, now: Date` | `unestablished` なら `BusinessRuleError("OPERATORS_NOT_ESTABLISHED")`。すでに持っていれば `BusinessRuleError("ROLE_ALREADY_HELD")`。加えて `"authority.role_granted"` を返す。自分自身にも付与できる |
| `RoleRoster.removeHolder` | `roster: RoleRoster, accountId: AccountId, reason: "revoked" \| "withdrawn", now: Date` | 持っていなければ `BusinessRuleError("ROLE_NOT_HELD")`。`operator` の最後の1人なら `BusinessRuleError("LAST_OPERATOR")`（解除も退会も同じ）。取り除いて `"authority.role_revoked"` を返す。`editor` は最後の1人も取り除ける。サービス運営者が2人以上なら自分自身も取り除ける |
| `RoleRoster.reconstruct` | 永続化された値 | 不変条件を検証して復元する。失敗は `RehydrationError` |

不変条件。

- `established` の `OperatorRoster` は、常に1人以上の持ち主を持つ（O-23、B-58、V-53）。持ち主を減らす振る舞いは `removeHolder` だけで、最後の1人を取り除かない。解除と退会は名簿の楽観ロックで直列になるので、同時の操作でも0人にならない
- 持ち主は、存在するアカウントだけ。付与と開設時の設定は、相手のアカウントの版を同じ UnitOfWork で進め（Account の `Account.markReferenced`）、退会は、その人のすべての役割を同じ UnitOfWork で取り除く。付与と退会は Account の楽観ロックで直列になる
- 同じ役割の持ち主は全員が同じ操作範囲を持つ
- 役割は管理権限から独立している。役割の付与・解除は `Stewardship` を変えず、`Stewardship` の変更は `RoleRoster` を変えない。一方の役割の付与・解除は、他方の役割を変えない

ライフサイクル。

- 生成: 役割ごとに常に1つある。保存された名簿がない間は `RoleRoster.initial(role)` として読まれ、最初の `save`（開設時の設定、最初の任命）で保存される
- 状態遷移: `OperatorRoster` は `unestablished → established`（開設時の設定）。`established` の間は、持ち主の増減だけ。`EditorRoster` は持ち主の増減だけ
- 消滅: 削除しない

## 値オブジェクト

### EmailAddress

共有カーネルの型（[index.md](index.md) の「メールアドレス」）。招待の宛先に使う。

### TargetStanding

操作する人から見た、対象の管理体制の事実。`Stewardship.standingOf` が作る。

```ts
type TargetStanding =
  | Readonly<{ target: StewardedRef; status: "stewarded"; actorIsSteward: boolean }>
  | Readonly<{ target: StewardedRef; status: "vacant" }>;
```

等価性: 全フィールドの一致。

### ActorAuthority

操作する人の役割。

```ts
type ActorAuthority = Readonly<{ actor: Actor; roles: ReadonlySet<Role> }>;
```

等価性: `actor.accountId` と `roles` の一致。

### Operation

可否を判断する操作の種類。index.md の「操作の可否」の表の行に対応する。

```ts
type Operation =
  | Readonly<{ kind: "manage_target"; standing: TargetStanding }>
  | Readonly<{ kind: "act_as_place"; standing: TargetStanding }>
  | Readonly<{ kind: "view_members"; standing: TargetStanding }>
  | Readonly<{ kind: "invite_member"; standing: TargetStanding }>
  | Readonly<{ kind: "cancel_invitation"; standing: TargetStanding }>
  | Readonly<{ kind: "resign"; standing: TargetStanding }>
  | Readonly<{ kind: "operate_service" }>
  | Readonly<{ kind: "edit_articles" }>;
```

- `manage_target`: 対象の管理（店舗・地域・イベントの情報と状態、店舗の掲載、所属・参加の管理）。掲載の操作は、掲載が紐づく店舗の `standing` で判断する
- `act_as_place`: 店舗として行う操作（代表地域の選択、店舗の所属状況・参加状況の確認、参加内容の変更、参加の取りやめ、店舗管理者として行う申請）。`standing` はその店舗のもの。その店舗の管理権限を持つ人だけが行え、管理者のいない店舗でもサービス運営者の代行はない
- `operate_service`: サービス運営者だけが行う操作のすべて（対象（店舗・掲載・地域・イベント）を ID やキーワードで開き、状態と管理者の有無を確かめる読み取り、管理者の権限の解除、地域・イベントの管理権限の付与、役割の付与・解除、運営による非公開、代理登録、地域・イベントの登録、カテゴリーの管理、申立て・連絡への対応）。対象の管理者の有無を問わない
- `edit_articles`: 読みものの作成・編集・公開

### AccessDecision

```ts
type AccessDecision =
  | Readonly<{ allowed: true; capacity: "steward" | "operator" | "editor" }>
  | Readonly<{ allowed: false }>;
```

`capacity` は、どの立場で行えるかを表す。`manage_target` と `cancel_invitation` の `operator` は代行を表す。

## ドメインサービス

### AccessPolicy

責務: 操作の可否を決める。index.md の「操作の可否」の規則を持つ唯一の場所。ポートに依存しない純粋な関数。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `AccessPolicy.decide` | `authority: ActorAuthority, operation: Operation` | `AccessDecision` | 下の表で判断する。例外を投げない。`allowed: false` のとき、ユースケースが `ForbiddenError` を投げる |

| `operation.kind` | 行える条件（上から順に判定する） | `capacity` |
| --- | --- | --- |
| `manage_target` | `standing` が `stewarded` で `actorIsSteward` | `steward` |
| | `standing` が `vacant` で、`roles` に `operator` がある | `operator` |
| `view_members` | `standing` が `stewarded` で `actorIsSteward` | `steward` |
| | `roles` に `operator` がある（管理者の有無を問わない。権限の解除と付与は、管理者と招待の確認から始まる） | `operator` |
| `act_as_place`、`invite_member`、`resign` | `standing` が `stewarded` で `actorIsSteward` | `steward` |
| `cancel_invitation` | `standing` が `stewarded` で `actorIsSteward` | `steward` |
| | `standing` が `vacant` で、`roles` に `operator` がある | `operator` |
| `operate_service` | `roles` に `operator` がある | `operator` |
| `edit_articles` | `roles` に `editor` がある | `editor` |

どの条件にも当たらなければ `allowed: false`。

- 権限は対象ごとに独立している。判断に使うのは、渡された `standing` の対象の管理権限だけ
- 役割の兼任は範囲を広げない。管理者のいる対象を、管理者でないサービス運営者は管理できない。サービス運営者は、編集担当者の役割がなければ読みものを編集できない
- 自分が出した申請の判断を妨げる条件はない（P-04、B-42）。申請の判断の可否は Application の `ApproverPolicy` が、`manage_target`（地域・イベントの承認者）と `operate_service`（サービス運営者の承認と代行）の結果を使って決める
- ログインしていない操作は `Actor` がなく、`AccessPolicy` を通らない

## ドメインイベント

`aggregateId` は、`Stewardship` では `"<target.kind>:<target.id>"`、`RoleRoster` では `role`。

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `"authority.invitation_issued"` | `{ target: StewardedRef; invitationId: InvitationId; email: EmailAddress }` | 招待が加わったとき | Notification（招待された利用者へ。メールは `email` に届け、そのメールアドレスのアカウントがあればサービス内の通知にも届ける。P-98） |
| `"authority.steward_appointed"` | `{ target: StewardedRef; accountId: AccountId; via: "invitation" \| "application" \| "grant"; wasVacant: boolean }` | 管理者が就任したとき | Application（店舗の申請の前提を再評価する。個人が管理者のいない店舗に行った申請と、就任した人のその店舗への管理権限の申請が失効する。P-77 a・d）、Notification（`grant` は付与された利用者へ。P-99。`application` は、就任した本人を除く、その店舗の他の店舗管理者へ。P-93） |
| `"authority.steward_removed"` | `{ target: StewardedRef; accountId: AccountId; reason: "resigned" \| "revoked" \| "withdrawn" }` | 管理者が辞任した、解除された、退会したとき | Notification（`revoked` は本人へ。P-100） |
| `"authority.stewardship_vacated"` | `{ target: StewardedRef }` | 最後の管理者がいなくなり、対象が管理者不在になったとき。`"authority.steward_removed"` と同時に出る | Application（店舗管理者として行った確認中・差し戻しの申請が失効する。P-77 b、P-34） |
| `"authority.role_granted"` | `{ role: Role; accountId: AccountId }` | 役割が付与されたとき。開設時の設定では出ない | Notification（付与された利用者へ。P-99） |
| `"authority.role_revoked"` | `{ role: Role; accountId: AccountId; reason: "revoked" \| "withdrawn" }` | 役割が解除されたとき、役割を持つ人が退会したとき | Notification（`revoked` は本人へ。P-100） |

消費者は、ペイロードの値ではなく、消費の時点の管理体制・名簿を読んで判断する（配送の順序は保証されない）。

他のドメインのドメインイベントは消費しない。

## ポート

### StewardshipRepository

目的: 管理体制の永続化と、対象・アカウントからの解決。管理体制は削除されず、`delete` を持たない。

```ts
interface StewardshipRepository
  extends Omit<TransactionalRepository<Stewardship, StewardedRef>, "delete"> {
  findByTargets(targets: readonly StewardedRef[]): Promise<readonly Stewardship[]>;
  findPageBySteward(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Versioned<Stewardship>>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert` | 同じ `target`（`kind` と `id` の組）の管理体制があれば `ConflictError`。対象ごとに1つであることはポートが担保する |
| `findById` | `target` の管理体制を返す。なければ `null`（呼び出し側は `Stewardship.vacant(target)` として扱う） |
| `save` | 楽観ロック。`findById`・`findPageBySteward` が返した `expectedVersion` と保存されている版が違えば `ConflictError`（同じ対象への同時の操作は、一方だけが成立する）。保存された管理体制がなければ、版にかかわらず `NotFoundError`。管理者と招待の一意性は集約の不変条件で、この楽観ロックが守る |
| `findByTargets` | 渡した対象のうち、保存された管理体制を返す。ないものは結果に含めない（管理者不在として扱う）。`targets` は 0〜100 件。0件は空を返し、100件を超えると `BusinessRuleError`（`COMMON_INVALID_INPUT`）。並び順は問わない。他のドメインのユースケースが、管理者の有無（申請の前提、代行の可否、案内の出し分け）と、管理者宛ての通知の宛先を読むのに使う |
| `findPageBySteward` | そのアカウントが管理者である管理体制を、`expectedVersion` とともにページで返す。`count` は、そのアカウントが管理者である管理体制の全件数。招待の宛先であるだけの管理体制は含めない。並び順は `target.kind`（`place`、`region`、`occasion` の順）、次に `target.id` の昇順。範囲の外の `page` は空の `items` を返す。全件が要る呼び出し側（退会、管理する店舗の読み取り）は、すべてのページを読む |

参照整合性: `target` の指す店舗・地域・イベントがあることと、就任の相手のアカウントがあることは、ユースケースが書き込みの前に確かめる。`grantStewardship` は、対象があることを `StewardedTargetDirectory.describe` で確かめ、なければ `NotFoundError` にする。店舗の管理体制の最初の書き込みは Application の承認のユースケースが行い、店舗があることはそのユースケースが確かめる。就任の相手のアカウントがあることは、`Account.markReferenced` の `save` がコミットの時点まで守る。コミットした書き込みは即座に読める。

エラー: `ConflictError`、`NotFoundError`（`save` の対象がない）、`BusinessRuleError`（`COMMON_INVALID_INPUT`。`findByTargets` の件数の超過）。

### RoleRosterRepository

目的: 役割の名簿の永続化と、アカウントの役割の解決。名簿は役割ごとに1つで、決まったキー（`Role`）で読み書きする（index.md「リポジトリの共通の契約」の、決まった少数しかない集約）。`insert`・`delete` を持たない。

```ts
interface RoleRosterRepository {
  find(role: Role): Promise<Versioned<RoleRoster>>;
  save(roster: RoleRoster, expectedVersion: ExpectedVersion<RoleRoster>): Promise<void>;
  findRolesOf(accountId: AccountId): Promise<ReadonlySet<Role>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `find` | `role` の名簿を返す。保存された名簿がなければ、`RoleRoster.initial(role)` と、まだ保存がないことを表す `expectedVersion` を返す。`null` を返さない |
| `save` | 楽観ロック。`find` が返した `expectedVersion` と保存されている版が違えば `ConflictError`。まだ保存がないことを表す `expectedVersion` での `save` は、保存された名簿がないときだけ成立する（開設時の設定の重複と、最初の任命の競合は、一方が `ConflictError` になる）。役割ごとに1つであることはポートが担保する。同時の付与・解除・退会は、一方が `ConflictError` になり、最後のサービス運営者の保護は、この楽観ロックと `removeHolder` が守る |
| `findRolesOf` | そのアカウントが持つ役割の集合を返す。保存された名簿がなければ空。`ActorAuthority` を作るのに使う |

エラー: `ConflictError`。

### StewardedTargetDirectory

目的: 管理権限の対象（店舗・地域・イベント）があることと、その名称を返す。店舗・地域・イベントにまたがる読み取りで、ドメインの語彙で定め、アダプターが実現する（index.md「読み取り」）。管理権限の対象の名称を返すユースケース（`checkInvitation`、`getMyAuthority`、Account の `previewWithdrawal`）と、対象があることを確かめるユースケース（`grantStewardship`）は、この読み取りだけを使う。

```ts
type StewardedTargetSummary = Readonly<{
  target: StewardedRef;
  name: string | null; // 名称が未入力の下書きの地域・イベントは null
}>;

interface StewardedTargetDirectory {
  describe(targets: readonly StewardedRef[]): Promise<readonly StewardedTargetSummary[]>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `describe` | 渡した対象のうち、存在するものを、名称とともに返す。存在しない対象は結果に含めない。公開状態と運営による非公開を問わず、閲覧者に公開されていない対象（下書きの地域・イベント、非公開の対象）も返す。名称が未入力の下書きの地域・イベントは `name: null` で返す。並び順は `target.kind`（`place`、`region`、`occasion` の順）、次に `target.id` の昇順。`targets` は 0〜100 件。0件は空を返し、100件を超えると `BusinessRuleError`（`COMMON_INVALID_INPUT`）。コミットした書き込み（対象の登録、名称の更新）は即座に反映される |

エラー: `BusinessRuleError`（`COMMON_INVALID_INPUT`。件数の超過）。

## トランザクション境界

`UnitOfWorkContext` は `stewardshipRepository` と `roleRosterRepository` を持つ。就任・付与のユースケースは、Account の `accountRepository` も同じスコープで使う。

| 書き込み | 原子的に確定する範囲 |
| --- | --- |
| 招待、招待の取り消し、辞任、解除 | 1つの `Stewardship` の `save` と、ドメインイベントの保存 |
| 承諾、付与（就任） | 1つの `Stewardship` の `insert` または `save`、就任する `Account` の `save`（`Account.markReferenced`）、ドメインイベントの保存 |
| 役割の解除 | 1つの `RoleRoster` の `save` と、ドメインイベントの保存 |
| 役割の付与、開設時の設定 | 1つの `RoleRoster` の `save`、相手の `Account` の `save`（`Account.markReferenced`）、ドメインイベントの保存 |
| 店舗の管理権限の申請の承認（Application のユースケース） | 申請の `save`、その店舗の `Stewardship` の `insert` または `save`、就任する `Account` の `save`（`Account.markReferenced`）、両方のドメインイベントの保存 |
| 退会（Account のユースケース） | `Account` の `delete`、その人が管理者であるすべての `Stewardship` の `save`（`removeSteward(..., "withdrawn")`）、その人が持ち主である `RoleRoster` の `save`（`removeHolder(..., "withdrawn")`）、ドメインイベントの保存。`LAST_OPERATOR` なら何も確定しない |

- 可否の判断に使う読み取り（`findRolesOf`、対象の `Stewardship`）は、書き込みと同じ UnitOfWork の中で、書き込みの前に行う。先にコミットされた解除・辞任は判断に反映され、役割・管理権限を失った人の操作は成立しない
- 付与・任命・招待の相手のアカウントの有無は、ユースケースが Account のポートから読んで確かめる。アカウントのないメールアドレスには付与・任命できない（招待はできる）
- 就任（承諾、付与、承認）と役割の付与・開設時の設定は、相手のアカウントを読んだ `expectedVersion` で、`Account.markReferenced` の結果を同じ UnitOfWork で `save` する。相手の退会が先にコミットしていれば、就任・付与は `NotFoundError` または `ConflictError` でロールバックする。就任・付与が先にコミットしていれば、退会の `delete` が `ConflictError` になり、送り直した退会が新しい管理権限・役割を含めて取り除く。退会したアカウントは、管理者・持ち主として残らない
- 管理者・持ち主のメールアドレスは、ユースケースが Account の `AccountRepository.findByIds` で読んで添える
- 対象の名称と、対象があることは、ユースケースが `StewardedTargetDirectory.describe` で読む
- 結果整合にするもの: 就任・管理者不在による申請の失効、通知

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `viewMembers` | 対象の管理者（メールアドレスつき）と承諾前の招待を返す。管理者と、サービス運営者が行える | MEM-01、MEM-05 |
| `inviteMember` | メールアドレス宛ての招待を加える。すでに管理者のメールアドレスと、承諾前の招待があるメールアドレスには加えない | MEM-02 |
| `cancelInvitation` | 承諾前の招待を取り除く。対象の管理者が行い、管理者不在の対象ではサービス運営者が行う | MEM-02、MEM-05 |
| `checkInvitation` | 対象と `InvitationId` で招待を引き、開いたアカウントが承諾できるかどうか（承諾できる、別のメールアドレス宛て、取り消された、すでに管理者）を返す。承諾できるときは、対象の名称を `StewardedTargetDirectory.describe` で解決して添える | MEM-03 |
| `acceptInvitation` | 宛先のメールアドレスのアカウントが管理者になる。管理者不在の対象でも成立する | MEM-03 |
| `resignStewardship` | 自分をその対象の管理者から取り除く。最後の管理者なら対象は管理者不在になる | MEM-04 |
| `revokeSteward` | サービス運営者が、選んだ管理者を対象の管理者から取り除く | MEM-05 |
| `grantStewardship` | サービス運営者が、既存のアカウントをメールアドレスで指定して、地域・イベントの管理者にする。対象の地域・イベントがあることを `StewardedTargetDirectory.describe` で確かめる | REG-12、EVT-12 |
| `getMyAuthority` | ログインしているアカウントが管理する対象（ページ）と、持っている役割を返す。対象の名称は、`StewardedTargetDirectory.describe` で解決して添える | MEM-01、OPE-01 |
| `listRoleHolders` | 編集担当者とサービス運営者を、メールアドレスつきで返す | OPE-04、OPE-05 |
| `grantRole` | サービス運営者が、既存のアカウントをメールアドレスで指定して、編集担当者に任命する、またはサービス運営者の役割を付与する | OPE-04、OPE-05 |
| `revokeRole` | サービス運営者が、編集担当者の任命を解く、またはサービス運営者の役割を解除する。最後のサービス運営者は解除できない | OPE-04、OPE-05 |
| `establishFirstOperator` | 開設時に、既存のアカウントをメールアドレスで指定して、サービス運営者の名簿を `established` にする。名簿が `unestablished` のときに成立する（同じ設定の送り直しは成功）。画面からは呼ばない | OPE-05 |

店舗の管理権限の申請の承認による就任（SHP-10）は Application のユースケースが、退会による管理権限・役割の喪失（ACC-04）は Account の `withdraw` が、この集約の振る舞いを同じ UnitOfWork で呼んで行う。
