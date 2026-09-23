# Account のユースケース

ドメイン: Account（[../domains/account.md](../domains/account.md)）

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `startEmailLogin` | メールアドレスを受け取り、ログインの確認を発行して、リンクとコードを載せたメールを送る | ACC-01 / MY-02 |
| `completeLoginByLink` | リンクの鍵でログインの確認を使用し、アカウントがなければ作って、ログインするアカウントを返す | ACC-01、KEP-04 / MY-02 |
| `completeLoginByCode` | ログインの確認の ID とコードでログインの確認を使用し、アカウントがなければ作って、ログインするアカウントを返す。誤入力は回数を保存し、上限に達するとログインの確認を無効にする（I-18） | ACC-01、KEP-04 / MY-02 |
| `loginWithExternalAccount` | 外部アカウントの検証結果から確認済みのメールアドレスを得て、アカウントがなければ作って、ログインするアカウントを返す | ACC-02、KEP-04 / MY-02 |
| `getMyAccount` | ログインしているアカウントのメールアドレスを返す | ACC-01 / MY-01、MY-02 |
| `previewWithdrawal` | 退会できるかどうかと、退会で管理者不在になる対象（名称つき）を返す | ACC-04 / MY-07 |
| `withdraw` | アカウントを削除し、その人の管理権限と役割を同じ UnitOfWork で取り除き、退会のドメインイベントを出す | ACC-04 / MY-07 |
| `purgeClosedLoginChallenges` | 日次のジョブ。使用済み、誤入力の上限に達した、または有効期間を過ぎたログインの確認を削除する | ACC-01 |

ログインが成立した後にブラウザをログイン中として扱うこと、元の操作へ戻ること、端末の保存の合流（Bookmark の `mergeDeviceBookmarks`）を呼ぶことは、プレゼンテーション層が行う。ログインを成立させるユースケースは、ログインするアカウントを返すところまでを担う。

`Actor` を取るユースケースの `Actor` は、`Actor` を作る境界（プレゼンテーション層）が `AccountRepository.findById` でアカウントがあることを確かめて作る。退会したアカウントのログインは無効で、その要求はログインしていない要求として扱われる。

退会に伴う保存の削除、個人の申請の取り下げ、サービス内の通知の停止は、`"account.withdrawn"` の消費者（Bookmark、Application、Notification）が行う。

## startEmailLogin

### 概要

メールアドレスを受け取り、リンクの鍵とコードを作って、両方を載せた1通のログイン用メールを送り、ログインの確認を `pending` で保存する。アカウントの有無を確かめず、応答もアカウントの有無で変えない。アカウントは作らない。

冪等な作成。ブラウザは、利用者がメールアドレスを送る操作（メールが届かないときの送り直しを含む）ごとに新しい `LoginChallengeId` を作り、同じ操作の要求を送り直すときだけ同じ ID を使う。同じ `LoginChallengeId`・同じメールアドレスの要求は、すでに保存されていれば、送信も書き込みもなしに成功として扱う。ログインの確認どうしは独立していて、同じメールアドレスへの別の ID の発行は、前のログインの確認を変えない。

### 入出力

- 入力: ブラウザが決めた `LoginChallengeId`、メールアドレス
- 出力: ログインの確認の有効期限。秘密の値と、アカウントの有無は返さない
- メールアドレスは `EmailAddress.create` の形式を満たす
- `Actor` を取らない（ログイン中の利用者の、別のメールアドレスでのログインも同じ）

### 使用するドメインの振る舞い・ポート

- `EmailAddress.create`
- `LoginChallengeRepository.findById`、`insert`
- `LoginChallenge.isReplayOf`、`LoginChallenge.issue`（`validForMs` は設定値）
- `LoginSecretGenerator.generate`、`digest`
- `LoginMailSender.send`
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。メールの送信は UnitOfWork に入らず、UnitOfWork の前に行う。

- 送り直しの判定（`findById` と `isReplayOf`）は、送信の前に行う
- スコープに含まれる書き込み: `loginChallengeRepository.insert`
- 送信に失敗すれば、何も保存しない
- 送信の後に保存が失敗すると、送ったリンクとコードに対応するログインの確認がなく、どちらも無効として扱われる。利用者はメールアドレスの入力からやり直す

### エラーケース

| 条件 | 種類 |
| --- | --- |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`）。メールは送られず、何も保存されない |
| 同じ `LoginChallengeId` のログインの確認が、違うメールアドレスで保存されている | `ConflictError`。メールは送られない |
| メールの送信を引き受けられない | `SystemError`（再試行できる）。何も保存されない |

## completeLoginByLink

### 概要

ログイン用メールのリンクの鍵でログインの確認を使用し、そのメールアドレスのアカウントを返す。アカウントがなければ、このときに作る。使用が成立するのは、1つのログインの確認につき1回だけ。リンクで使用すると、同じログインの確認のコードも使用できなくなる。

### 入出力

- 入力: リンクの鍵
- 出力: ログインするアカウント（`AccountId`、メールアドレス）と、このときに作ったかどうか
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `LinkToken.create`
- `LoginSecretGenerator.digest`
- `LoginChallengeRepository.findByLinkTokenDigest`、`save`
- `LoginChallenge.redeemByLink`（ログインの確認が見つからなければ `null` を渡す）
- `AccountRepository.findByEmail`、`insert`
- `LoginPolicy.resolve`
- `Clock`、`IdGenerator`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `loginChallengeRepository.save`（使用）と、アカウントがないときの `accountRepository.insert`
- 読み取り（ログインの確認、アカウント）をすべて終えてから書き込む
- ドメインイベントは出さない
- ロールバックが起きる条件: `redeemByLink` のエラー、楽観ロックの競合、`insert` の一意性の違反。ロールバックでは使用も取り消され、同じリンクでやり直せる

### エラーケース

| 条件 | 種類 |
| --- | --- |
| リンクの鍵に対応するログインの確認がない | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`） |
| ログインの確認が使用済み、誤入力の上限に達した、または有効期間を過ぎた | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。アカウントは作られない |

## completeLoginByCode

### 概要

メールアドレスを入力したブラウザが、発行のときと同じ `LoginChallengeId` とコードを送り、ログインの確認を使用して、そのメールアドレスのアカウントを返す。アカウントがなければ、このときに作る。コードで使用すると、同じログインの確認のリンクも使用できなくなる。

コードが一致しなければ、誤入力の回数を保存してからエラーを返す。誤入力が設定値の回数に達すると、ログインの確認は `exhausted` になり、リンクでもコードでも使用できなくなる（I-18）。どのエラーを返すかは `LoginChallenge.redeemByCode` が決め、`CodeRedemption` の `error` で返す。

### 入出力

- 入力: `LoginChallengeId`、コード
- 出力: ログインするアカウント（`AccountId`、メールアドレス）と、このときに作ったかどうか
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `LoginCode.create`
- `LoginSecretGenerator.digest`
- `LoginChallengeRepository.findById`、`save`
- `LoginChallenge.redeemByCode`（`maxCodeAttempts` は設定値。ログインの確認が見つからなければ `null` を渡す）
- `AccountRepository.findByEmail`、`insert`
- `LoginPolicy.resolve`
- `Clock`、`IdGenerator`

### トランザクション境界

UnitOfWork を1つ使う。

- `outcome: "redeemed"` のスコープに含まれる書き込み: `loginChallengeRepository.save`（使用）と、アカウントがないときの `accountRepository.insert`
- `outcome: "mismatch"` のスコープに含まれる書き込み: `loginChallengeRepository.save`（誤入力の回数、または `exhausted`）。コミットした後に、`CodeRedemption` の `error` をそのまま投げる。誤入力の保存はロールバックされない
- 読み取りをすべて終えてから書き込む。ドメインイベントは出さない
- ロールバックが起きる条件: `redeemByCode` が投げる `LOGIN_CHALLENGE_INVALID`、楽観ロックの競合、`insert` の一意性の違反

### エラーケース

| 条件 | 種類 |
| --- | --- |
| コードが一致せず、誤入力の回数が上限に達していない | `BusinessRuleError`（`LOGIN_CODE_MISMATCH`）。誤入力の回数は保存される。入力し直せる |
| コードが一致せず、誤入力の回数が上限に達した | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。ログインの確認は `exhausted` で保存される |
| `LoginChallengeId` に対応するログインの確認がない | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`） |
| ログインの確認が使用済み、誤入力の上限に達した、または有効期間を過ぎた | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。アカウントは作られない |

## loginWithExternalAccount

### 概要

外部アカウントの提供元での認証の結果を検証し、提供元が確認済みとしたメールアドレスのアカウントを返す。アカウントがなければ、このときに作る。すでにあれば、ログインの方法にかかわらず同じアカウントを返す。外部アカウントとアカウントの結びつきは保存しない。

提供元への遷移の開始と、戻りの受け取りは、プレゼンテーション層とアダプターが行う。

### 入出力

- 入力: 提供元、提供元での認証から戻ったときに受け取った証明
- 提供元は `ExternalProviderKey.create` を通す
- 出力: ログインするアカウント（`AccountId`、メールアドレス）と、このときに作ったかどうか
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `ExternalProviderKey.create`
- `ExternalIdentityVerifier.verify`
- `LoginPolicy.fromExternal`、`LoginPolicy.resolve`
- `AccountRepository.findByEmail`、`insert`
- `Clock`、`IdGenerator`

### トランザクション境界

UnitOfWork を1つ使う。検証（`verify`）は UnitOfWork に入らず、UnitOfWork の前に行う。

- スコープに含まれる書き込み: アカウントがないときの `accountRepository.insert`。アカウントがあれば書き込まない
- ドメインイベントは出さない
- ロールバックが起きる条件: `insert` の一意性の違反

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 提供元が空、または設定にない | `BusinessRuleError`（`UNKNOWN_EXTERNAL_PROVIDER`）。アカウントは作られない |
| 確認済みのメールアドレスを受け取れない（メールアドレスがない、または提供元で確認済みでない） | `BusinessRuleError`（`VERIFIED_EMAIL_REQUIRED`）。アカウントは作られない |
| 利用者が認証または承認をやめた、証明が無効 | `BusinessRuleError`（`EXTERNAL_LOGIN_NOT_AUTHENTICATED`）。アカウントは作られない |
| 提供元の障害、通信エラー | `SystemError`（再試行できる）。アカウントは作られない |

## getMyAccount

### 概要

ログインしているアカウントのメールアドレスを返す。

### 入出力

- 入力: `Actor`
- 出力: アカウントのメールアドレス
- 操作の可否を確かめない。自分のアカウントだけを読む

### 使用するドメインの振る舞い・ポート

- `AccountRepository.findById`

### トランザクション境界

UnitOfWork を使わない。1回の読み取りだけを行う。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| アカウントがない（退会している） | `NotFoundError` |

## previewWithdrawal

### 概要

退会の確認のために、退会できるかどうかと、退会で管理者不在になる対象を返す。退会できないのは、唯一のサービス運営者である間だけ。管理者不在になる対象は、自分が唯一の管理者である店舗・地域・イベントで、名称を添えて返す。

管理者不在になる対象の判断（`isSoleSteward`）と退会の可否の判断（`isSoleHolder`）は、`withdraw` が同じ集約の `removeSteward`・`removeHolder` で確定する内容を、書き込みなしに先に読むもの。

### 入出力

- 入力: `Actor`
- 出力: 退会できるかどうか（できないときは、唯一のサービス運営者であること）、退会で管理者不在になる対象（`StewardedRef` と名称）の一覧（店舗、地域、イベントの順。同じ種類の中は ID の昇順）。名称は `StewardedTargetDirectory.describe` の結果のとおり（名称が未入力の下書きの地域・イベントは、名称なし）
- 操作の可否を確かめない。自分の管理権限と役割だけを読む

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findPageBySteward`（Authority。すべてのページを読む）
- `Stewardship.isSoleSteward`（Authority）
- `RoleRosterRepository.find`（Authority。`operator`）
- `RoleRoster.isSoleHolder`（Authority）
- `StewardedTargetDirectory.describe`（Authority。管理者不在になる対象の名称。100件ずつに分けて呼ぶ）

### トランザクション境界

UnitOfWork を使わない。読み取りだけを行う。確認の後に状況が変われば、`withdraw` が確定の時点の状態で判断する。

### エラーケース

なし。退会できないことは、エラーではなく出力で返す。

## withdraw

### 概要

アカウントを削除し、その人が持つすべての管理権限と役割を、同じ UnitOfWork で取り除く。取り消せない。最後の管理者だった対象は管理者不在になり、承諾前の招待は残る。唯一のサービス運営者は退会できず、何も確定しない。

退会の後、同じメールアドレスでログインすると、別の `AccountId` のアカウントが作られ、以前の保存・管理権限・役割・申請とは結びつかない。

### 入出力

- 入力: `Actor`
- 出力: なし
- 操作の可否を確かめない。自分のアカウントだけを退会させる

### 使用するドメインの振る舞い・ポート

- `AccountRepository.findById`、`delete`
- `Account.withdraw`
- `StewardshipRepository.findPageBySteward`（すべてのページを読む）、`save`（Authority）
- `Stewardship.removeSteward`（Authority。`reason: "withdrawn"`）
- `RoleRosterRepository.find`、`save`（Authority。`operator` と `editor`）
- `RoleRoster.holds`、`RoleRoster.removeHolder`（Authority。`reason: "withdrawn"`）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `accountRepository.delete`、その人が管理者であるすべての管理体制の `stewardshipRepository.save`、その人が持ち主である名簿の `roleRosterRepository.save`、ドメインイベント（`"account.withdrawn"`、管理体制ごとの `"authority.steward_removed"`、管理者不在になった対象ごとの `"authority.stewardship_vacated"`、名簿ごとの `"authority.role_revoked"`）の保存
- スコープ内で使うリポジトリ: `accountRepository`、`stewardshipRepository`、`roleRosterRepository`
- 読み取り（アカウント、`findPageBySteward` のすべてのページ、2つの名簿）をすべて終えてから書き込む
- ロールバックが起きる条件: `removeHolder` の `LAST_OPERATOR`、いずれかの集約の楽観ロックの競合。ロールバックでは、アカウントも、どの管理体制・名簿も変わらず、ドメインイベントも残らない。送り直せる
- 管理権限・役割を結ぶ書き込み（就任、役割の付与、開設時の設定）は、相手の `Account` の版を同じ UnitOfWork で進める（`Account.markReferenced`）。読み取りの後に結ばれた管理権限・役割があれば、`accountRepository.delete` が楽観ロックの競合になり、送り直した退会が、それを含めて取り除く。退会したアカウントを指す管理権限・役割は残らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| アカウントがない（すでに退会している） | `NotFoundError` |
| サービス運営者が自分1人だけである（確定の時点で1人だけになっている場合を含む） | `BusinessRuleError`（`LAST_OPERATOR`）。何も確定しない |

## purgeClosedLoginChallenges

### 概要

日次のジョブ。`redeemed`・`exhausted` のログインの確認と、有効期間を過ぎたログインの確認を削除する。入力はスケジュールで、削除の基準は実行の時点の現在時刻。

冪等。削除の対象は保存された状態と現在時刻だけで決まり、繰り返し実行しても結果は同じ。使用できるログインの確認（`pending` で有効期間内）は削除しない。

### 入出力

- 入力: なし（スケジュール）
- 出力: 削除した件数
- `Actor` を取らない

### 使用するドメインの振る舞い・ポート

- `LoginChallengeRepository.deleteClosedBefore`
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `loginChallengeRepository.deleteClosedBefore`
- ドメインイベントは出さない。失敗した実行は、次の実行が同じ対象を削除する

### エラーケース

なし。
