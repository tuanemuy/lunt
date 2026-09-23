# Authority のユースケース

ドメイン: Authority（[../domains/authority.md](../domains/authority.md)）

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `viewMembers` | 対象の管理者（メールアドレスつき）と承諾前の招待を返す | MEM-01、MEM-05 / CM-02 |
| `inviteMember` | メールアドレス宛ての招待を加える | MEM-02 / CM-02 |
| `cancelInvitation` | 承諾前の招待を取り除く | MEM-02、MEM-05 / CM-02 |
| `checkInvitation` | 招待の対象と、開いたアカウントが承諾できるかどうかを返す | MEM-03 / MY-06 |
| `acceptInvitation` | 宛先のメールアドレスのアカウントが管理者になる | MEM-03 / MY-06 |
| `resignStewardship` | 自分をその対象の管理者から取り除く | MEM-04 / CM-02 |
| `revokeSteward` | サービス運営者が、選んだ管理者を対象の管理者から取り除く | MEM-05 / CM-02 |
| `grantStewardship` | サービス運営者が、既存のアカウントをメールアドレスで指定して、地域・イベントの管理者にする | REG-12、EVT-12 / CM-02 |
| `getMyAuthority` | ログインしているアカウントが管理する対象（名称つき。ページ）と、持っている役割を返す | MEM-01、OPE-01 / MY-01 |
| `listRoleHolders` | 編集担当者とサービス運営者を、メールアドレスつきで返す | OPE-04、OPE-05 / OM-07 |
| `grantRole` | サービス運営者が、既存のアカウントをメールアドレスで指定して、編集担当者に任命する、またはサービス運営者の役割を付与する | OPE-04、OPE-05 / OM-07 |
| `revokeRole` | サービス運営者が、編集担当者の任命を解く、またはサービス運営者の役割を解除する | OPE-04、OPE-05 / OM-07 |
| `establishFirstOperator` | 開設時に、既存のアカウントをメールアドレスで指定して、最初のサービス運営者を設定する | OPE-05 |

店舗の管理権限の申請の承認による就任（SHP-10）は Application のユースケースが、退会による管理権限・役割の喪失（ACC-04）は Account の `withdraw` が、この集約の振る舞いを同じ UnitOfWork で呼んで行う。

`Actor` のアカウントがあることは、`Actor` を作る境界が確かめている（[../domains/account.md](../domains/account.md)）。

操作の可否を確かめるユースケースは、操作する人の役割（`RoleRosterRepository.findRolesOf`）と対象の管理体制（`StewardshipRepository.findById`。なければ `Stewardship.vacant(target)`）を読み、`Stewardship.standingOf` の結果とともに `AccessPolicy.decide` に渡す。`allowed: false` は `ForbiddenError`。書き込みを持つユースケースは、この読み取りを書き込みと同じ UnitOfWork の中で、書き込みの前に行う。先にコミットされた解除・辞任は判断に反映され、役割・管理権限を失った人の操作は成立しない。

管理権限・役割を結ぶユースケース（`acceptInvitation`、`grantStewardship`、`grantRole`、`establishFirstOperator`）は、相手のアカウントを読んだ `expectedVersion` で、`Account.markReferenced` の結果を同じ UnitOfWork で `accountRepository.save` する。相手の退会が先にコミットしていれば `NotFoundError` または `ConflictError` でロールバックし、退会したアカウントは管理者・持ち主にならない（[../domains/account.md](../domains/account.md)）。

対象の名称と、対象があることは、`StewardedTargetDirectory.describe` だけで読む。公開状態と運営による非公開を問わず、名称が未入力の下書きの地域・イベントは名称なしで返る。

## viewMembers

### 概要

1つの対象の管理者と承諾前の招待を返す。対象の管理者と、サービス運営者が行える。サービス運営者は、管理者の有無にかかわらず確認できる。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）
- 出力: 管理者の一覧（就任の古い順。`AccountId`、メールアドレス、自分かどうか）、承諾前の招待の一覧（招待の古い順。`InvitationId`、宛先のメールアドレス）、対象が管理者不在かどうか、確認できる立場（`steward` / `operator`）

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findById`、`Stewardship.vacant`
- `RoleRosterRepository.findRolesOf`
- `Stewardship.standingOf`、`AccessPolicy.decide`（`view_members`）
- `AccountRepository.findByIds`（Account。管理者のメールアドレス。100件ずつに分けて呼ぶ）

### トランザクション境界

UnitOfWork を使わない。読み取りだけを行う。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 対象の管理者でもサービス運営者でもない（権限を手放した、解除された後を含む） | `ForbiddenError` |

## inviteMember

### 概要

対象の管理者が、メールアドレス宛ての招待を加える。サービス運営者の承認は要らない。そのメールアドレスのアカウントがなくても招待できる。招待に期限はない。

冪等な作成。呼び出し側が `InvitationId` を決めて送る。同じ `InvitationId`・同じメールアドレスの送り直しは、書き込みもドメインイベントもなしに成功として扱う。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）、呼び出し側が決めた `InvitationId`、招待する相手のメールアドレス
- 出力: なし
- メールアドレスは `EmailAddress.create` の形式を満たす

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findById`、`save`、`Stewardship.vacant`
- `RoleRosterRepository.findRolesOf`
- `Stewardship.standingOf`、`AccessPolicy.decide`（`invite_member`）
- `EmailAddress.create`
- `Stewardship.classifyInvite`、`Stewardship.invite`
- `AccountRepository.findByEmail`（Account。`addressee` の事実）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `stewardshipRepository.save` と、`"authority.invitation_issued"` の保存
- スコープ内で使うリポジトリ: `stewardshipRepository`、`roleRosterRepository`、`accountRepository`（読み取り）
- ロールバックが起きる条件: `AccessPolicy` の拒否、`invite` のエラー、`classifyInvite` の `conflict`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 対象の管理者でない（サービス運営者を含む） | `ForbiddenError` |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| そのメールアドレスのアカウントが、すでに同じ対象の管理者である | `BusinessRuleError`（`ALREADY_STEWARD`） |
| そのメールアドレスへの承諾前の招待がすでにある | `BusinessRuleError`（`INVITATION_ALREADY_PENDING`） |
| 同じ `InvitationId` の招待が、違うメールアドレスで存在する | `ConflictError` |

## cancelInvitation

### 概要

承諾前の招待を取り除く。対象のどの管理者も取り消せる。管理者不在の対象では、サービス運営者が取り消す。取り消した招待では承諾できない。ドメインイベントは出さない。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）、`InvitationId`
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findById`、`save`、`Stewardship.vacant`
- `RoleRosterRepository.findRolesOf`
- `Stewardship.standingOf`、`AccessPolicy.decide`（`cancel_invitation`）
- `Stewardship.cancelInvitation`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `stewardshipRepository.save`
- ロールバックが起きる条件: `AccessPolicy` の拒否、`INVITATION_NOT_FOUND`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 対象の管理者でない。管理者のいる対象を、管理者でないサービス運営者が操作した場合を含む | `ForbiddenError` |
| 招待がない（すでに承諾された、取り消された、宛先のアカウントが別の経路で就任した） | `BusinessRuleError`（`INVITATION_NOT_FOUND`） |
| 取り消しと、その招待の承諾が同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `INVITATION_NOT_FOUND` |

## checkInvitation

### 概要

対象と `InvitationId` の組で招待を引き、招待を開いたアカウントについて、その招待を承諾できるかどうかを返す。承諾できるときは、招待の対象（店舗・地域・イベントの別と名称）を併せて返す。対象は、閲覧者に公開されていないもの（下書きの地域・イベント、非公開の対象）でも返す。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）、`InvitationId`
- 出力: `"acceptable"`（承諾できる）、`"addressed_to_other"`（別のメールアドレス宛て）、`"not_found"`（取り消された）、`"already_steward"`（すでに管理者）のどれか。`"acceptable"` のときは、対象の種類と名称
- 操作の可否を確かめない。ログインしたどのアカウントも行える

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findById`、`Stewardship.vacant`
- `AccountRepository.findById`（Account。開いたアカウントのメールアドレス）
- `Stewardship.invitationStatusFor`
- `StewardedTargetDirectory.describe`（`"acceptable"` のときの対象の名称）

### トランザクション境界

UnitOfWork を使わない。読み取りだけを行う。確認の後に招待が取り消されれば、`acceptInvitation` が確定の時点の状態で判断する。

### エラーケース

承諾できない事情は、エラーではなく出力で返す。

| 条件 | 種類 |
| --- | --- |
| 開いたアカウントがない（退会している） | `NotFoundError` |

## acceptInvitation

### 概要

招待の宛先のメールアドレスのアカウントが、招待を承諾して対象の管理者になる。招待で管理者になったアカウントは、他の管理者と同じ操作範囲を持つ。管理者不在の対象でも成立し、対象に管理者が就く。招待した管理者が辞任・退会していても成立する。承諾した招待は、承諾前の招待から消える。

就任による申請の失効（承諾した人のその店舗への管理権限の申請、個人が管理者のいない店舗に行った申請）は、`"authority.steward_appointed"` の消費者（Application）が行う。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）、`InvitationId`
- 出力: なし
- 操作の可否を `AccessPolicy` で確かめない。承諾できるのが宛先のアカウントだけであることは、`Stewardship.acceptInvitation` が確かめる

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findById`、`save`、`Stewardship.vacant`
- `AccountRepository.findById`、`save`（Account。承諾する人のメールアドレスと `expectedVersion`）
- `Stewardship.acceptInvitation`
- `Account.markReferenced`（Account）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `stewardshipRepository.save`、`accountRepository.save`（`markReferenced`）、`"authority.steward_appointed"`（`via: "invitation"`）の保存
- スコープ内で使うリポジトリ: `stewardshipRepository`、`accountRepository`
- 読み取り（承諾するアカウント、管理体制）をすべて終えてから書き込む
- ロールバックが起きる条件: 承諾するアカウントがない、`acceptInvitation` のエラー、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 承諾するアカウントがない（退会している） | `NotFoundError` |
| すでにその対象の管理者である | `BusinessRuleError`（`ALREADY_STEWARD`） |
| 招待が取り消されている | `BusinessRuleError`（`INVITATION_NOT_FOUND`） |
| 招待の宛先と異なるメールアドレスのアカウントである | `BusinessRuleError`（`INVITATION_EMAIL_MISMATCH`） |
| 承諾と、その招待の取り消しが同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `INVITATION_NOT_FOUND` |

## resignStewardship

### 概要

管理者が、自分をその対象の管理者から取り除く。元に戻せない。最後の管理者なら対象は管理者不在になり、承諾前の招待は残る。後任の招待が承諾される前でも辞任できる。他の管理者を辞任させる入力は持たない。

管理者不在による申請の失効は、`"authority.stewardship_vacated"` の消費者（Application）が行う。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findById`、`save`、`Stewardship.vacant`
- `RoleRosterRepository.findRolesOf`
- `Stewardship.standingOf`、`AccessPolicy.decide`（`resign`）
- `Stewardship.removeSteward`（`reason: "resigned"`）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `stewardshipRepository.save` と、`"authority.steward_removed"`、最後の管理者なら `"authority.stewardship_vacated"` の保存
- ロールバックが起きる条件: `AccessPolicy` の拒否、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 対象の管理者でない（すでに辞任した、解除された後を含む） | `ForbiddenError` |
| 辞任と、サービス運営者によるその人の解除が同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `ForbiddenError` |

## revokeSteward

### 概要

サービス運営者が、選んだ管理者を対象の管理者から取り除く。元に戻せない。対象の管理者は、他の管理者の権限を解除できない。最後の管理者の解除で対象は管理者不在になり、承諾前の招待は残る。解除された人の他の対象の管理権限と役割は変わらない。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）、解除する管理者の `AccountId`
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`
- `AccessPolicy.decide`（`operate_service`）
- `StewardshipRepository.findById`、`save`、`Stewardship.vacant`
- `Stewardship.removeSteward`（`reason: "revoked"`）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `stewardshipRepository.save` と、`"authority.steward_removed"`、最後の管理者なら `"authority.stewardship_vacated"` の保存
- ロールバックが起きる条件: `AccessPolicy` の拒否、`NOT_A_STEWARD`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない（対象の管理者を含む。確定までの間に役割を解除された場合を含む） | `ForbiddenError` |
| 選んだアカウントが管理者でない（確定の前に、自分で辞任した、または退会した） | `BusinessRuleError`（`NOT_A_STEWARD`） |
| 解除と、その管理者の辞任が同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `NOT_A_STEWARD` |

## grantStewardship

### 概要

サービス運営者が、既存のアカウントをメールアドレスで指定して、地域またはイベントの管理者にする。相手の承諾は要らず、確定の時点で効く。対象の公開状態を問わない。相手のメールアドレス宛ての承諾前の招待があれば、就任とともに消える。店舗は対象にできない。

### 入出力

- 入力: `Actor`、対象（`StewardedRef` のうち `region`・`occasion`）、付与する相手のメールアドレス
- 出力: なし
- メールアドレスは `EmailAddress.create` の形式を満たす

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`
- `AccessPolicy.decide`（`operate_service`）
- `EmailAddress.create`
- `AccountRepository.findByEmail`、`save`（Account）
- `Account.markReferenced`（Account）
- `StewardedTargetDirectory.describe`（対象があることの確認）
- `StewardshipRepository.findById`、`insert`、`save`、`Stewardship.vacant`
- `Stewardship.grant`
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: 保存された管理体制がなければ `stewardshipRepository.insert`、あれば `save`。`accountRepository.save`（`markReferenced`）。`"authority.steward_appointed"`（`via: "grant"`）の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`accountRepository`
- 読み取り（役割、相手のアカウント、対象、管理体制）をすべて終えてから書き込む
- ロールバックが起きる条件: `AccessPolicy` の拒否、相手のアカウントまたは対象がない、`ALREADY_STEWARD`、楽観ロックの競合、`insert` の一意性の違反

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない（対象の管理者を含む） | `ForbiddenError` |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| 指定したメールアドレスのアカウントがない | `NotFoundError` |
| 対象の地域・イベントがない | `NotFoundError` |
| 指定したアカウントが、すでにその対象の管理者である | `BusinessRuleError`（`ALREADY_STEWARD`） |

## getMyAuthority

### 概要

ログインしているアカウントが管理する対象と、持っている役割を返す。管理・編集・運営の入口の出し分けと、他のドメインの「管理する対象」の読み取りの起点になる。招待の宛先であるだけの対象は含めない。

### 入出力

- 入力: `Actor`、`Pagination`（管理する対象の一覧のページ）
- 出力: 管理する対象（`StewardedRef` と名称）のページ（店舗、地域、イベントの順。同じ種類の中は ID の昇順）と、管理する対象の全件数、持っている役割の集合
- 操作の可否を確かめない。自分の管理権限と役割だけを読む

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findPageBySteward`
- `RoleRosterRepository.findRolesOf`
- `StewardedTargetDirectory.describe`（そのページの対象の名称）

### トランザクション境界

UnitOfWork を使わない。読み取りだけを行う。

### エラーケース

なし。

## listRoleHolders

### 概要

編集担当者とサービス運営者を、役割ごとに返す。サービス運営者が行える。

### 入出力

- 入力: `Actor`
- 出力: 役割ごとの持ち主の一覧（付与の古い順。`AccountId`、メールアドレス、自分かどうか）。編集担当者は0人でもよい

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`find`（`editor` と `operator`）
- `AccessPolicy.decide`（`operate_service`）
- `RoleRoster.holders`
- `AccountRepository.findByIds`（Account。持ち主のメールアドレス。100件ずつに分けて呼ぶ）

### トランザクション境界

UnitOfWork を使わない。読み取りだけを行う。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない | `ForbiddenError` |

## grantRole

### 概要

サービス運営者が、既存のアカウントをメールアドレスで指定して、編集担当者に任命する、またはサービス運営者の役割を付与する。相手の承諾は要らず、確定の時点で効く。自分自身にも付与できる。相手が持つ管理権限と他の役割は変わらない。

### 入出力

- 入力: `Actor`、役割（`Role`）、付与する相手のメールアドレス
- 出力: なし
- メールアドレスは `EmailAddress.create` の形式を満たす

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`find`、`save`
- `AccessPolicy.decide`（`operate_service`）
- `EmailAddress.create`
- `AccountRepository.findByEmail`、`save`（Account）
- `RoleRoster.grant`
- `Account.markReferenced`（Account）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: 1つの名簿の `roleRosterRepository.save`、`accountRepository.save`（`markReferenced`）、`"authority.role_granted"` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`accountRepository`
- 読み取り（役割、相手のアカウント、名簿）をすべて終えてから書き込む
- ロールバックが起きる条件: `AccessPolicy` の拒否、相手のアカウントがない、`ROLE_ALREADY_HELD`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない（確定までの間に役割を解除された場合を含む） | `ForbiddenError` |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| 指定したメールアドレスのアカウントがない | `NotFoundError` |
| 指定したアカウントが、すでにその役割を持つ | `BusinessRuleError`（`ROLE_ALREADY_HELD`）。何も変わらない |

## revokeRole

### 概要

サービス運営者が、編集担当者の任命を解く、またはサービス運営者の役割を解除する。確定の時点で効く。最後の編集担当者の任命も解ける。サービス運営者は、2人以上いる間は自分自身も解除でき、1人だけの間は解除できない。解除された人が持つ管理権限と他の役割は変わらない。

### 入出力

- 入力: `Actor`、役割（`Role`）、解除する持ち主の `AccountId`
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`find`、`save`
- `AccessPolicy.decide`（`operate_service`）
- `RoleRoster.removeHolder`（`reason: "revoked"`）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: 1つの名簿の `roleRosterRepository.save` と、`"authority.role_revoked"` の保存
- ロールバックが起きる条件: `AccessPolicy` の拒否、`ROLE_NOT_HELD`、`LAST_OPERATOR`、楽観ロックの競合
- 同時の解除・退会は、名簿の楽観ロックで直列になる。サービス運営者の名簿は0人にならない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| サービス運営者でない（確定までの間に役割を解除された場合を含む） | `ForbiddenError` |
| 選んだアカウントがその役割を持たない（すでに解除されている、または退会している） | `BusinessRuleError`（`ROLE_NOT_HELD`） |
| サービス運営者が1人だけで、その役割を解除しようとする（確定の時点で1人だけになっている場合を含む） | `BusinessRuleError`（`LAST_OPERATOR`） |
| 最後の2人のサービス運営者の解除・退会が同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。サービス運営者の名簿は0人にならない |

## establishFirstOperator

### 概要

サービスの開設時に、既存のアカウントをメールアドレスで指定して、サービス運営者の名簿を `established` にする。画面からは呼ばず、開設の手順が呼ぶ。成立するのは、名簿が `unestablished` のときだけ。`"authority.role_granted"` は出さない。

冪等。同じアカウントでの送り直しは、書き込みもドメインイベントもなしに成功として扱う。

### 入出力

- 入力: 最初のサービス運営者にするアカウントのメールアドレス
- 出力: なし
- `Actor` を取らない。操作の可否を確かめない（サービス運営者がまだいない）

### 使用するドメインの振る舞い・ポート

- `EmailAddress.create`
- `AccountRepository.findByEmail`、`save`（Account）
- `RoleRosterRepository.find`（`operator`）、`save`
- `RoleRoster.establishOperators`
- `Account.markReferenced`（Account）
- `Clock`

### トランザクション境界

UnitOfWork を1つ使う。

- スコープに含まれる書き込み: `operator` の名簿の `roleRosterRepository.save` と、`accountRepository.save`（`markReferenced`）。名簿が変わらなければ（送り直し）どちらも書き込まない。ドメインイベントは出さない
- スコープ内で使うリポジトリ: `roleRosterRepository`、`accountRepository`
- 読み取り（指定したアカウント、名簿）をすべて終えてから書き込む
- ロールバックが起きる条件: アカウントがない、`OPERATORS_ALREADY_ESTABLISHED`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| 指定したメールアドレスのアカウントがない | `NotFoundError` |
| 名簿がすでに `established` で、持ち主が指定したアカウントだけではない | `BusinessRuleError`（`OPERATORS_ALREADY_ESTABLISHED`） |
