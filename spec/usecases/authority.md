# Authority のユースケース

ドメイン: Authority（[../domains/authority.md](../domains/authority.md)）

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `viewMembers` | 対象の管理者（メールアドレスつき）と承諾前の招待を返す | MEM-01、MEM-02、MEM-05 / CM-02、OM-03 |
| `inviteMember` | メールアドレス宛ての招待を加える | MEM-02 / CM-02 |
| `cancelInvitation` | 承諾前の招待を取り除く | MEM-02 / CM-02 |
| `checkInvitation` | 招待の対象と、開いたアカウントが承諾できるかどうかを返す | MEM-03 / MY-06 |
| `acceptInvitation` | 宛先のメールアドレスのアカウントが管理者になる | MEM-03 / MY-06 |
| `resignStewardship` | 自分をその対象の管理者から取り除く | MEM-04 / CM-02 |
| `revokeSteward` | サービス運営者が、選んだ管理者を対象の管理者から取り除く | MEM-05 / CM-02 |
| `grantStewardship` | サービス運営者が、既存のアカウントをメールアドレスで指定して、地域・イベントの管理者にする | REG-12、EVT-12 / CM-02 |
| `getMyAuthority` | ログインしているアカウントが管理する対象（名称つき。ページ）と、持っている役割を返す | MEM-01、SHP-05、EDT-01、OPE-01 / MY-01 |
| `listRoleHolders` | 編集担当者とサービス運営者を、メールアドレスつきで返す | OPE-04、OPE-05 / OM-07 |
| `grantRole` | サービス運営者が、既存のアカウントをメールアドレスで指定して、編集担当者に任命する、またはサービス運営者の役割を付与する | OPE-04、OPE-05 / OM-07 |
| `revokeRole` | サービス運営者が、編集担当者の任命を解く、またはサービス運営者の役割を解除する | OPE-04、OPE-05 / OM-07 |
| `establishFirstOperator` | 開設時に、既存のアカウントをメールアドレスで指定して、最初のサービス運営者を設定する | OPE-05 |

店舗の管理権限の申請の承認による就任（SHP-10）は Application のユースケースが、退会による管理権限・役割の喪失（ACC-04）は Account の `withdraw` が、この集約の振る舞いを同じ UnitOfWork で呼んで行う。

`Actor` のアカウントがあることは、`Actor` を作る境界が確かめている。退会したアカウントの要求は、ログインしていない要求として扱われる（[../domains/account.md](../domains/account.md)）。境界が `Actor` を作った後に本人の退会がコミットしたとき（`checkInvitation`・`acceptInvitation` が本人のアカウントを読んで `null`、または `acceptInvitation` が本人のアカウントを読んだ後にアカウントの書き込みが失敗してロールバックする。書き込みの失敗の種類は `AccountRepository` の契約のとおり）の扱いは、[../domains/index.md](../domains/index.md)「操作する人」が定める。

操作の可否を確かめるユースケースは、操作する人の役割（`RoleRosterRepository.findRolesOf`）と対象の管理体制（`StewardshipRepository.findById`。なければ `Stewardship.vacant(target)`）を読み、`Stewardship.standingOf` の結果とともに `AccessPolicy.decide` に渡す。`allowed: false` は `ForbiddenError`。書き込みを持つユースケースは、この読み取りを書き込みと同じ UnitOfWork の中で、書き込みの前に行う。先にコミットされた解除・辞任は判断に反映され、役割・管理権限を失った人の操作は成立しない。

管理権限・役割を結ぶユースケース（`acceptInvitation`、`grantStewardship`、`grantRole`、`establishFirstOperator`）は、相手のアカウントを読んだ `expectedVersion` で、`Account.markReferenced` の結果を同じ UnitOfWork で `accountRepository.save` する。相手の退会が先にコミットしていれば、就任・付与は成立せず、退会したアカウントは管理者・持ち主にならない（[../domains/account.md](../domains/account.md)）。`grantStewardship`・`grantRole`・`establishFirstOperator` は、相手のアカウントを読めなければ `NotFoundError` にする。読んだ後の `accountRepository.save` が失敗すれば、そのエラーでロールバックする（種類は `AccountRepository` の契約のとおり）。`acceptInvitation` の相手は操作する本人で、[../domains/index.md](../domains/index.md)「操作する人」の規則に従う。

対象の名称と、対象があることは、`StewardedTargetDirectory.describe` だけで読む。UnitOfWork に参加しない読み取り専用のポートなので、`run` の外で呼ぶ。公開状態と運営による非公開を問わず、名称が未入力の下書きの地域・イベントは名称なしで返る。

## viewMembers

### 概要

1つの対象の管理者と承諾前の招待を返す。可否は `AccessPolicy` の `view_members` が決める。

### 入出力

- 入力: `Actor`、対象（`StewardedRef`）
- 出力: 管理者の一覧（メールアドレス、自分かどうか）、承諾前の招待の一覧（宛先のメールアドレス）、対象が管理者不在かどうか。並びは `Stewardship` の `stewards`・`invitations` の順

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findById`、`Stewardship.vacant`
- `RoleRosterRepository.findRolesOf`
- `Stewardship.standingOf`、`AccessPolicy.decide`（`view_members`）
- `AccountRepository.findByIds`（Account。管理者のメールアドレス。100件ずつに分けて呼ぶ）

### トランザクション境界

UnitOfWork を1つ使い、管理体制、役割、管理者のアカウントを読む。書き込まない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否 | `ForbiddenError` |

## inviteMember

### 概要

メールアドレス宛ての招待を加える。可否は `AccessPolicy` の `invite_member` が決め、サービス運営者の承認は要らない。そのメールアドレスのアカウントがなくても招待できる。招待に期限はない。

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
| `AccessPolicy` の拒否 | `ForbiddenError` |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| そのメールアドレスのアカウントが、すでに同じ対象の管理者である | `BusinessRuleError`（`AUTHORITY_ALREADY_STEWARD`） |
| そのメールアドレスへの承諾前の招待がすでにある | `BusinessRuleError`（`AUTHORITY_INVITATION_ALREADY_PENDING`） |
| 同じ `InvitationId` の招待が、違うメールアドレスで存在する | `ConflictError` |

## cancelInvitation

### 概要

承諾前の招待を取り除く。可否は `AccessPolicy` の `cancel_invitation` が決める。取り消した招待では承諾できない。ドメインイベントは出さない。

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
- ロールバックが起きる条件: `AccessPolicy` の拒否、`AUTHORITY_INVITATION_NOT_FOUND`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否 | `ForbiddenError` |
| 招待がない（すでに承諾された、取り消された、宛先のアカウントが別の経路で就任した） | `BusinessRuleError`（`AUTHORITY_INVITATION_NOT_FOUND`）。管理者不在の対象でサービス運営者が取り消すとき、先に招待が承諾されて管理者が就いていれば、不在の代行ができないので `AccessPolicy` の拒否（`ForbiddenError`）が先に当たる |
| 取り消しと、その招待の承諾が同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `AUTHORITY_INVITATION_NOT_FOUND` |

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

UnitOfWork を1つ使い、管理体制と開いたアカウントを読む。書き込まない。`"acceptable"` のときの対象の名称は、`run` を終えた後に読む。確認の後に招待が取り消されれば、`acceptInvitation` が確定の時点の状態で判断する。

### エラーケース

なし。承諾できない事情は、エラーではなく出力で返す。

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
- ロールバックが起きる条件: `acceptInvitation` のエラー、楽観ロックの競合、承諾する人のアカウントの `save` の失敗（種類は `AccountRepository` の契約のとおり）

### エラーケース

| 条件 | 種類 |
| --- | --- |
| すでにその対象の管理者である | `BusinessRuleError`（`AUTHORITY_ALREADY_STEWARD`） |
| 招待が取り消されている | `BusinessRuleError`（`AUTHORITY_INVITATION_NOT_FOUND`） |
| 招待の宛先と異なるメールアドレスのアカウントである | `BusinessRuleError`（`AUTHORITY_INVITATION_EMAIL_MISMATCH`） |
| 承諾と、その招待の取り消しが同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `AUTHORITY_INVITATION_NOT_FOUND` |
| 境界が `Actor` を作った後に、承諾する人の退会がコミットした | [../domains/index.md](../domains/index.md)「操作する人」のとおり |

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
| `AccessPolicy` の拒否（すでに辞任した、解除された後を含む） | `ForbiddenError` |
| 辞任と、サービス運営者によるその人の解除が同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `ForbiddenError` |

## revokeSteward

### 概要

サービス運営者が、選んだ管理者を対象の管理者から取り除く。元に戻せない。最後の管理者の解除で対象は管理者不在になり、承諾前の招待は残る。解除された人の他の対象の管理権限と役割は変わらない。

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
- ロールバックが起きる条件: `AccessPolicy` の拒否、`AUTHORITY_NOT_A_STEWARD`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（確定までの間に役割を解除された場合を含む） | `ForbiddenError` |
| 選んだアカウントが管理者でない（確定の前に、自分で辞任した、または退会した） | `BusinessRuleError`（`AUTHORITY_NOT_A_STEWARD`） |
| 解除と、その管理者の辞任が同時に確定しようとした | 一方だけが成立し、他方は `ConflictError`。送り直すと `AUTHORITY_NOT_A_STEWARD` |

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

UnitOfWork を1つ使う。対象があることは、`run` の前に `StewardedTargetDirectory.describe` で確かめ、なければ `run` を始めずに `NotFoundError` にする。

- スコープに含まれる書き込み: 保存された管理体制がなければ `stewardshipRepository.insert`、あれば `save`。`accountRepository.save`（`markReferenced`）。`"authority.steward_appointed"`（`via: "grant"`）の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`stewardshipRepository`、`accountRepository`
- 読み取り（役割、相手のアカウント、管理体制）をすべて終えてから書き込む
- ロールバックが起きる条件: `AccessPolicy` の拒否、相手のアカウントがない、`AUTHORITY_ALREADY_STEWARD`、楽観ロックの競合、`insert` の一意性の違反

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否 | `ForbiddenError` |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| 指定したメールアドレスのアカウントがない | `NotFoundError` |
| 対象の地域・イベントがない | `NotFoundError` |
| 指定したアカウントが、すでにその対象の管理者である | `BusinessRuleError`（`AUTHORITY_ALREADY_STEWARD`） |

## getMyAuthority

### 概要

ログインしているアカウントが管理する対象と、持っている役割を返す。管理・編集・運営の入口の出し分けと、他のドメインの「管理する対象」の読み取りの起点になる。招待の宛先であるだけの対象は含めない。

### 入出力

- 入力: `Actor`、`Pagination`（管理する対象の一覧のページ）
- 出力: 管理する対象（種類と名称）のページと全件数、持っている役割。並びは `findPageBySteward` の契約による
- 操作の可否を確かめない。自分の管理権限と役割だけを読む

### 使用するドメインの振る舞い・ポート

- `StewardshipRepository.findPageBySteward`
- `RoleRosterRepository.findRolesOf`
- `StewardedTargetDirectory.describe`（そのページの対象の名称）

### トランザクション境界

UnitOfWork を1つ使い、管理体制のページと役割を読む。書き込まない。名称は、`run` を終えた後に読む。

### エラーケース

なし。

## listRoleHolders

### 概要

編集担当者とサービス運営者を、役割ごとに返す。可否は `AccessPolicy` の `operate_service` が決める。

### 入出力

- 入力: `Actor`
- 出力: 役割ごとの持ち主の一覧（メールアドレス、自分かどうか）。並びは `RoleRoster.holders` の順。編集担当者は0人でもよい

### 使用するドメインの振る舞い・ポート

- `RoleRosterRepository.findRolesOf`、`find`（`ROLES` の各役割）
- `AccessPolicy.decide`（`operate_service`）
- `RoleRoster.holders`
- `AccountRepository.findByIds`（Account。持ち主のメールアドレス。100件ずつに分けて呼ぶ）

### トランザクション境界

UnitOfWork を1つ使い、役割、`ROLES` の各役割の名簿、持ち主のアカウントを読む。書き込まない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否 | `ForbiddenError` |

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
- ロールバックが起きる条件: `AccessPolicy` の拒否、相手のアカウントがない、`AUTHORITY_ROLE_ALREADY_HELD`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（確定までの間に役割を解除された場合を含む） | `ForbiddenError` |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| 指定したメールアドレスのアカウントがない | `NotFoundError` |
| 指定したアカウントが、すでにその役割を持つ | `BusinessRuleError`（`AUTHORITY_ROLE_ALREADY_HELD`）。何も変わらない |

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
- ロールバックが起きる条件: `AccessPolicy` の拒否、`AUTHORITY_ROLE_NOT_HELD`、`AUTHORITY_LAST_OPERATOR`、楽観ロックの競合
- 同時の解除・退会は、名簿の楽観ロックで直列になる。サービス運営者の名簿は0人にならない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| `AccessPolicy` の拒否（確定までの間に役割を解除された場合を含む） | `ForbiddenError` |
| 選んだアカウントがその役割を持たない（すでに解除されている、または退会している） | `BusinessRuleError`（`AUTHORITY_ROLE_NOT_HELD`） |
| サービス運営者が1人だけで、その役割を解除しようとする（確定の時点で1人だけになっている場合を含む） | `BusinessRuleError`（`AUTHORITY_LAST_OPERATOR`） |
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
- ロールバックが起きる条件: アカウントがない、`AUTHORITY_OPERATORS_ALREADY_ESTABLISHED`、楽観ロックの競合

### エラーケース

| 条件 | 種類 |
| --- | --- |
| メールアドレスの形式が正しくない | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） |
| 指定したメールアドレスのアカウントがない | `NotFoundError` |
| 名簿がすでに `established` で、持ち主が指定したアカウントだけではない | `BusinessRuleError`（`AUTHORITY_OPERATORS_ALREADY_ESTABLISHED`） |
