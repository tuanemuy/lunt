# Account

メールアドレスを持つアカウントと、パスワードを使わないログイン、退会を管理する。ドメインの境界、共有カーネル、ドメインをまたぐ規約は [index.md](index.md) が定める。

ログインが成立した後にブラウザをログイン中として扱う方法は、このドメインの外にある。このドメインは、ログインを成立させてよいかどうかと、成立したアカウント（`AccountId`）を決める。

`Actor` を作る境界（プレゼンテーション層）は、`AccountRepository.findById` でアカウントがあることを確かめてから `Actor` を作る。退会したアカウントのログインは無効で、その要求はログインしていない要求として扱われる。

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Account | アカウント | メールアドレスを1つ持つ利用者の登録。通知と招待の宛先になる |
| EmailAddress | メールアドレス | アカウントを一意に指す値。ログインの方法にかかわらず、同じメールアドレスは同じアカウントを指す |
| LoginChallenge | ログインの確認 | メールアドレスでのログインのために発行する、ワンタイムのリンクとコードの組。1通のログイン用メールに対応する |
| LinkToken | リンクの鍵 | ログイン用メールのリンクに載せる秘密の値 |
| LoginCode | コード | ログイン用メールに載せ、メールアドレスを入力したブラウザで入力する秘密の値 |
| SecretDigest | 秘密の値の要約 | リンクの鍵またはコードから一方向に求めた値。ログインの確認は要約だけを持つ |
| Redeem | 使用 | リンクまたはコードでログインを成立させること。1つのログインの確認につき1回だけ成立する |
| Exhausted | 誤入力の上限 | コードの誤入力が設定値の回数に達し、そのログインの確認がリンクでもコードでも使用できなくなった状態（I-18） |
| ExternalIdentity | 外部アカウントの検証結果 | 外部アカウントの提供元が確認済みとしたメールアドレス、またはそれを受け取れなかった事情 |
| Registration | アカウントの作成 | 初めてログインが成立した時点で、そのメールアドレスのアカウントを作ること |
| Withdrawal | 退会 | アカウントを削除すること。取り消せない |

## エンティティ

### Account（集約）

| フィールド | 型 | 制約 |
| --- | --- | --- |
| `id` | `AccountId` | |
| `email` | `EmailAddress` | 必須（P-33、B-40）。作成の後に変わらない（I-17） |
| `registeredAt` | `Date` | 最初のログインが成立した日時 |
| `version` | `Version` | |

振る舞い。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Account.register` | `params: { id: string; email: string }, now: Date` | `Account` | `AccountId` と `EmailAddress` を生成してアカウントを作る。値が不正なら `BusinessRuleError` |
| `Account.markReferenced` | `account: Account` | `Account` | 版だけを進めたアカウントを返す。このアカウントを指す権限（管理権限、役割）を新しく結ぶユースケースが、その書き込みと同じ UnitOfWork で呼んで `save` する。退会（`delete`）と同じ楽観ロックに乗るので、権限を結ぶ書き込みと退会は、どちらか一方だけが先に確定する |
| `Account.withdraw` | `account: Account, now: Date` | `readonly EventDraft<AccountWithdrawnEvent>[]` | 退会のドメインイベントの下書きを返す。後続のエンティティはない。削除はユースケースがリポジトリの `delete` で行う |
| `Account.reconstruct` | 永続化された値 | `Account` | 値オブジェクトを検証し直して復元する。失敗は `RehydrationError` |

不変条件。

- メールアドレスを必ず1つ持つ
- 存在するアカウントの間で、メールアドレスは重複しない（`AccountRepository` が担保する）
- 退会したアカウントは残らない。退会の後に同じメールアドレスでログインすると、別の `AccountId` のアカウントが作られ、以前の保存・管理権限・役割・申請とは結びつかない
- 退会したアカウントを指す管理権限・役割は残らない。退会は、その人の管理権限と役割を同じ UnitOfWork で取り除く。管理権限・役割を結ぶ書き込みは、相手のアカウントの `markReferenced` を同じ UnitOfWork で保存するので、退会と同時に確定しない（退会が先なら、結ぶ側が `NotFoundError`。結ぶ側が先なら、退会が `ConflictError` になり、送り直した退会が新しい管理権限・役割を含めて取り除く）

ライフサイクル。

- 生成: メールアドレスでのログイン、または外部アカウントでのログインが成立した時点で、そのメールアドレスのアカウントがなければ作る。ログインの成立より前には作らない。`AccountId` はユースケースが `IdGenerator` で決める（利用者は自分のアカウントの有無を知らずにログインする）。作成の冪等性はメールアドレスの一意性が担う
- 状態遷移: 状態を持たない。`markReferenced` は版だけを進める
- 消滅: 退会で削除する。唯一のサービス運営者は退会できない（規則は Authority の `RoleRoster.removeHolder` が持つ）。退会の後、そのアカウントの `Actor` は作られない

### LoginChallenge（集約）

```ts
type LoginChallengeBase = Readonly<{
  id: LoginChallengeId;
  email: EmailAddress;
  linkTokenDigest: SecretDigest;
  codeDigest: SecretDigest;
  issuedAt: Date;
  expiresAt: Date; // issuedAt より後
  version: Version;
}>;

type PendingLoginChallenge = LoginChallengeBase &
  Readonly<{ status: "pending"; failedCodeAttempts: number }>; // 0 以上、上限未満の整数
type RedeemedLoginChallenge = LoginChallengeBase &
  Readonly<{ status: "redeemed"; redeemedAt: Date; redeemedBy: "link" | "code" }>;
type ExhaustedLoginChallenge = LoginChallengeBase &
  Readonly<{ status: "exhausted"; exhaustedAt: Date }>;

type LoginChallenge =
  | PendingLoginChallenge
  | RedeemedLoginChallenge
  | ExhaustedLoginChallenge;

type CodeRedemption =
  | Readonly<{ outcome: "redeemed"; challenge: RedeemedLoginChallenge }>
  | Readonly<{
      outcome: "mismatch";
      challenge: PendingLoginChallenge | ExhaustedLoginChallenge;
      error: BusinessRuleError; // 保存してコミットした後に、ユースケースが投げるエラー
    }>;
```

有効期間を過ぎたかどうかは保存せず、`expiresAt` と `now` から求める。コードの誤入力の回数の上限（`maxCodeAttempts`）は設定値で、正の整数（I-18）。

振る舞い。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `LoginChallenge.issue` | `params: { id: string; email: string; linkTokenDigest: SecretDigest; codeDigest: SecretDigest; validForMs: number }, now: Date` | `PendingLoginChallenge` | `expiresAt = now + validForMs`、`failedCodeAttempts = 0` のログインの確認を作る。`validForMs` は設定値で、正の整数。メールアドレスの形式が正しくなければ `BusinessRuleError("COMMON_INVALID_EMAIL_ADDRESS")` |
| `LoginChallenge.redeemByLink` | `challenge: LoginChallenge \| null, linkTokenDigest: SecretDigest, now: Date` | `RedeemedLoginChallenge` | `challenge` は、ユースケースがリポジトリから読んだ結果。見つからなければ `null`。使用できるのは、`pending` で `now < expiresAt` のログインの確認だけ。`null`、または使用できなければ（使用済み、誤入力の上限に達した、または有効期間を過ぎた）`BusinessRuleError("LOGIN_CHALLENGE_INVALID")`。要約が一致しなければ同じエラー。成立すると `redeemed`（`redeemedBy: "link"`）にする |
| `LoginChallenge.redeemByCode` | `challenge: LoginChallenge \| null, codeDigest: SecretDigest, maxCodeAttempts: number, now: Date` | `CodeRedemption` | `null`、または使用できなければ `BusinessRuleError("LOGIN_CHALLENGE_INVALID")`。要約が一致すれば `redeemed`（`redeemedBy: "code"`）にして `outcome: "redeemed"` を返す。一致しなければ例外を投げず、`failedCodeAttempts` を1つ進めた `pending`、進めた値が `maxCodeAttempts` に達するなら `exhausted` を、`outcome: "mismatch"` で返す。`error` は、返す `challenge` が `pending` なら `BusinessRuleError("LOGIN_CODE_MISMATCH")`（入力し直せる）、`exhausted` なら `BusinessRuleError("LOGIN_CHALLENGE_INVALID")`。ユースケースは `challenge` を保存してコミットした後に、`error` をそのまま投げる |
| `LoginChallenge.isReplayOf` | `existing: LoginChallenge, email: EmailAddress` | `boolean` | 同じ ID の発行の要求が、同じメールアドレスの送り直しかどうかを返す |
| `LoginChallenge.reconstruct` | 永続化された値 | `LoginChallenge` | 復元する。失敗は `RehydrationError` |

不変条件。

- リンクとコードは同じログインの確認に属し、どちらかで使用が成立すると `redeemed` になる。`redeemed` のログインの確認は、リンクでもコードでも使用できない（一方を使うと他方も無効）
- コードの誤入力が `maxCodeAttempts` 回に達すると `exhausted` になり、リンクでもコードでも使用できない。誤入力は保存されるので、同時の入力でも数え落とさない（楽観ロックで一方だけが数えられ、他方は `ConflictError`）
- 使用が成立するのは1回だけ。同時の使用は、楽観ロックで一方だけが成立する
- 秘密の値そのものを持たない。持つのは要約だけ
- 見つからないログインの確認と、使用できないログインの確認は、同じエラー（`LOGIN_CHALLENGE_INVALID`）になる。応答で区別しない
- ログインの確認どうしは独立している。同じメールアドレスに送り直しても、前のログインの確認は有効期間まで使用できる

ライフサイクル。

- 生成: メールアドレスが送られた時点で `pending` として作る。アカウントの有無を確かめない（応答もアカウントの有無で変えない）。`LoginChallengeId` はブラウザが決めて送り、コードの入力のときに同じ ID を送る
- 状態遷移: `pending → redeemed`（使用）、`pending → exhausted`（誤入力の上限）。ほかの遷移はない
- 消滅: `redeemed`・`exhausted`、または有効期間を過ぎたログインの確認は、日次のジョブが削除する

## 値オブジェクト

### EmailAddress

共有カーネルの型（[index.md](index.md) の「メールアドレス」）。`EmailAddress.create(raw: string)` が、前後の空白を除き、小文字にそろえ、形式と長さを確かめる。満たさなければ `BusinessRuleError("COMMON_INVALID_EMAIL_ADDRESS")`。

### LoginChallengeId

- 型: 不透明な空でない文字列のブランド型。形式は `IdGenerator` ポートが決める。Account の中だけで使う
- 等価性: 文字列の一致

### LinkToken、LoginCode

- 型: それぞれ不透明な空でない文字列のブランド型。形式と長さは `LoginSecretGenerator` ポートが決める
- 生成: `LinkToken.create(raw)`、`LoginCode.create(raw)`。前後の空白を除く。空なら `BusinessRuleError("INVALID_LOGIN_SECRET")`
- 保存しない。ログイン用メールに載せる間と、利用者の入力を要約に変える間だけ存在する

### SecretDigest

- 型: 不透明な空でない文字列のブランド型。`LoginSecretGenerator.digest` だけが作る
- 等価性: 文字列の一致

### ExternalProviderKey

- 型: 外部アカウントの提供元を指す、空でない文字列のブランド型。使える提供元は設定が定める
- 生成: `ExternalProviderKey.create(raw)`。前後の空白を除く。空なら `BusinessRuleError("UNKNOWN_EXTERNAL_PROVIDER")`。設定にあるかどうかは `ExternalIdentityVerifier` が確かめる
- 等価性: 文字列の一致

### ExternalIdentity

```ts
type ExternalIdentity =
  | { outcome: "verified"; email: EmailAddress }
  | { outcome: "email_unavailable" } // メールアドレスがない、または提供元で確認済みでない
  | { outcome: "not_authenticated" }; // 利用者が認証または承認をやめた、証明が無効
```

`verified` の `email` は、提供元が確認済みとしたメールアドレスだけ（P-33、B-40）。

## ドメインサービス

### LoginPolicy

責務: ログインの成立で、どのアカウントにログインするかを決める。ポートに依存しない純粋な関数。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `LoginPolicy.resolve` | `email: EmailAddress, existing: Account \| null, newAccountId: string, now: Date` | `{ account: Account; registered: boolean }` | そのメールアドレスのアカウントがあればそれを返す。なければ `Account.register` で作って返す。メールアドレスでのログインと外部アカウントでのログインが同じ関数を使う（同じメールアドレスは同じアカウント） |
| `LoginPolicy.fromExternal` | `identity: ExternalIdentity` | `EmailAddress` | `verified` ならメールアドレスを返す。`email_unavailable` は `BusinessRuleError("VERIFIED_EMAIL_REQUIRED")`、`not_authenticated` は `BusinessRuleError("EXTERNAL_LOGIN_NOT_AUTHENTICATED")`。どちらもログインは成立せず、アカウントも作られない |

## ドメインイベント

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `"account.withdrawn"` | `{ accountId: AccountId }` | 退会が確定したとき。`aggregateId` は `accountId` | Bookmark（その人の保存を削除する）、Application（その人が個人として行った確認中・差し戻しの申請を取り下げる）、Notification（その人のサービス内の通知を届けなくする） |

アカウントの作成とログインの成立は、消費者がなく、ドメインイベントを出さない。端末の保存の合流は、ログインが成立したブラウザが Bookmark のユースケースを呼んで行う（KEP-04）。

## ポート

### AccountRepository

目的: アカウントの永続化と、メールアドレス・ID によるアカウントの解決。

```ts
interface AccountRepository
  extends TransactionalRepository<Account, AccountId> {
  findByEmail(email: EmailAddress): Promise<Versioned<Account> | null>;
  findByIds(ids: readonly AccountId[]): Promise<readonly Account[]>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert` | 同じ `id`、または同じ `email` のアカウントがあれば `ConflictError`。メールアドレスの一意性はポートが担保する。呼び出し側の事前の `findByEmail` は一意性の根拠にしない |
| `findById`、`findByEmail` | 存在するアカウントだけを返す。退会したアカウントは返さない。コミットした書き込みは即座に読める |
| `findByIds` | 渡した ID のうち、存在するアカウントを返す。存在しない ID（退会したアカウントを含む）は結果に含めない。並び順は `AccountId` の昇順。`ids` は 0〜100 件。0件は空を返し、100件を超えると `BusinessRuleError`（`COMMON_INVALID_INPUT`）。他のドメインのユースケースが、管理者・役割を持つ人のメールアドレスの表示と、通知の宛先の解決に使う |
| `save` | 楽観ロック。`findById`・`findByEmail` が返した `expectedVersion` と保存されている版が違えば `ConflictError`。対象がなければ（退会済みを含む）、版にかかわらず `NotFoundError`。`markReferenced` の保存に使う。`save` が成立すると、それより前に得た `expectedVersion` での `delete`・`save` は `ConflictError` になる |
| `delete` | 楽観ロック。対象がなければ（削除済みを含む）、版にかかわらず `NotFoundError`。削除の後、同じ `email` の `insert` は成立する |

エラー: `ConflictError`（一意性の違反、楽観ロックの競合）、`NotFoundError`（`save`・`delete` の対象がない）、`BusinessRuleError`（`COMMON_INVALID_INPUT`。`findByIds` の件数の超過）。

### LoginChallengeRepository

目的: ログインの確認の永続化と、リンクの鍵の要約による解決。1件ずつの削除はなく、`delete` を持たない。

```ts
interface LoginChallengeRepository
  extends Omit<TransactionalRepository<LoginChallenge, LoginChallengeId>, "delete"> {
  findByLinkTokenDigest(digest: SecretDigest): Promise<Versioned<LoginChallenge> | null>;
  deleteClosedBefore(threshold: Date): Promise<number>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert` | 同じ `id`、または同じ `linkTokenDigest` のログインの確認があれば `ConflictError`。一意性はポートが担保する |
| `findByLinkTokenDigest` | 要約が一致するログインの確認を返す。状態と有効期間で絞らない（無効の判断は `LoginChallenge` の振る舞いが行う） |
| `save` | 楽観ロック。リンクとコードの同時の使用、同時のコードの入力は、一方が `ConflictError` になる。対象がなければ（`deleteClosedBefore` で削除済みを含む）、版にかかわらず `NotFoundError` |
| `deleteClosedBefore` | `redeemed`・`exhausted`、または `expiresAt < threshold` のログインの確認を削除し、削除した件数を返す。集約の版を確かめない。繰り返し呼んでも、残るログインの確認は同じ |

エラー: `ConflictError`、`NotFoundError`。

### LoginSecretGenerator

目的: リンクの鍵とコードを作り、秘密の値を要約に変える。

```ts
interface LoginSecretGenerator {
  generate(): Promise<{ linkToken: LinkToken; code: LoginCode }>;
  digest(secret: LinkToken | LoginCode): Promise<SecretDigest>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `generate` | リンクの鍵とコードを、呼び出しごとに新しく作る。リンクの鍵は、呼び出しの間で重複しない（値だけでログインの確認を特定できる）。リンクの鍵とコードは、`LinkToken.create`・`LoginCode.create` が同じ値として受け付ける（空でなく、前後に空白を持たない） |
| `digest` | 同じ入力に同じ要約を返す。違う入力には違う要約を返す（要約どうしの一致で、入力の一致を判断できる）。要約は空でなく、入力と違う値。`generate` によらない値（利用者が入力した値）も要約にできる |

値を推測できないこと、要約から入力を求められないこと、コードが手で入力できる形であることは、アダプターの責務。

### LoginMailSender

目的: ログイン用メールを送る。

```ts
interface LoginMailSender {
  send(mail: {
    to: EmailAddress;
    linkToken: LinkToken;
    code: LoginCode;
    expiresAt: Date;
  }): Promise<void>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `send` | リンクとコードの両方を載せた1通のメールを `to` に送る。リンクは、開いたブラウザが `linkToken` を Lunt に渡す行き先を指す。送信を引き受けた時点で解決する。引き受けられなければ `SystemError`（再試行できる）。秘密の値を記録に残さない。Notification を経由しない（秘密の値を Outbox に保存しない） |

### ExternalIdentityVerifier

目的: 外部アカウントの提供元での認証の結果を検証し、確認済みのメールアドレスを得る。

```ts
interface ExternalIdentityVerifier {
  verify(provider: ExternalProviderKey, proof: string): Promise<ExternalIdentity>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `verify` | `proof` は、提供元での認証から Lunt に戻ったときに受け取る、不透明な証明。提供元が確認済みとしたメールアドレスを得られたときだけ `verified` を返す。メールアドレスがない、または確認済みでないときは `email_unavailable`。証明が無効、または利用者が認証・承認をやめたときは `not_authenticated`。設定にない `provider` は `BusinessRuleError("UNKNOWN_EXTERNAL_PROVIDER")`。提供元の障害と通信エラーは `SystemError`（再試行できる） |

提供元への遷移の開始と、戻りの受け取りは、プレゼンテーション層とアダプターが行う。ドメインは検証結果だけを受け取る。外部アカウントとアカウントの結びつきは保存しない。アカウントを決めるのはメールアドレスだけ。

## トランザクション境界

`UnitOfWorkContext` は `accountRepository` と `loginChallengeRepository` を持つ。

| 書き込み | 原子的に確定する範囲 |
| --- | --- |
| ログインの確認の発行 | `LoginChallenge` の `insert`。メールの送信は UnitOfWork の前に行う。送信に失敗すれば何も保存しない。保存に失敗すれば、送ったリンクとコードは無効として扱われる。同じ `LoginChallengeId`・同じメールアドレスの送り直しで、すでに保存されていれば、送信も書き込みもなしに成功とする（保存されているなら送信は済んでいる）。同じ ID で違うメールアドレスは `ConflictError` |
| リンク・コードでのログインの成立 | `LoginChallenge` の `save`（使用）と、アカウントがないときの `Account` の `insert`。同じメールアドレスの同時の作成で `insert` が `ConflictError` になると、使用も取り消され、同じリンク・コードでやり直せる |
| コードの誤入力 | `LoginChallenge` の `save`（誤入力の回数、または `exhausted`）。コミットした後に、ユースケースが `CodeRedemption` の `error` を投げる |
| 外部アカウントでのログインの成立 | アカウントがないときの `Account` の `insert`。検証（`ExternalIdentityVerifier.verify`）は UnitOfWork の前に行う |
| 退会 | `Account` の `delete`、その人が管理者であるすべての `Stewardship` の `save`、その人が役割を持つ `RoleRoster` の `save`（Authority の `RoleRosterRepository.find` で読む）、`"account.withdrawn"` と Authority のドメインイベントの保存。唯一のサービス運営者なら `RoleRoster.removeHolder` が `BusinessRuleError("LAST_OPERATOR")` を投げ、何も確定しない。読み取り（アカウント、`StewardshipRepository.findPageBySteward` の全ページ、2つの `RoleRoster`）をすべて終えてから書き込む。管理権限・役割を結ぶ書き込みは `Account` の版を進めるので、読み取りの後に結ばれた管理権限・役割があれば `delete` が `ConflictError` になる |

他のドメインのユースケースが、管理権限・役割を結ぶ書き込みと同じ UnitOfWork で、相手の `Account` の `save`（`markReferenced`）を行う（Authority の `grantStewardship`・`grantRole`・`acceptInvitation`・`establishFirstOperator`、Application の管理権限の申請の承認）。

結果整合にするもの: 退会に伴う保存の削除、個人として行った申請の取り下げ、管理者不在になった店舗の申請の失効（`"account.withdrawn"` と `"authority.stewardship_vacated"` の消費者が行う）。

## ユースケース（概要）

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `startEmailLogin` | メールアドレスを受け取り、ログインの確認を発行して、リンクとコードを載せたメールを送る | ACC-01 |
| `completeLoginByLink` | リンクの鍵でログインの確認を使用し、アカウントがなければ作って、ログインするアカウントを返す | ACC-01、KEP-04 |
| `completeLoginByCode` | ログインの確認の ID とコードでログインの確認を使用し、アカウントがなければ作って、ログインするアカウントを返す。誤入力は回数を保存し、上限に達するとログインの確認を無効にする（I-18） | ACC-01、KEP-04 |
| `loginWithExternalAccount` | 外部アカウントの検証結果から確認済みのメールアドレスを得て、アカウントがなければ作って、ログインするアカウントを返す | ACC-02、KEP-04 |
| `getMyAccount` | ログインしているアカウントのメールアドレスを返す | ACC-01 |
| `previewWithdrawal` | 退会できるかどうか（唯一のサービス運営者でないか）と、退会で管理者不在になる対象を返す。対象の名称は、Authority の `StewardedTargetDirectory.describe` で解決して添える | ACC-04 |
| `withdraw` | アカウントを削除し、その人の管理権限と役割を同じ UnitOfWork で取り除き、退会のドメインイベントを出す | ACC-04 |
| `purgeClosedLoginChallenges` | 使用済み、誤入力の上限に達した、または有効期間を過ぎたログインの確認を削除する（日次のジョブ） | ACC-01 |
