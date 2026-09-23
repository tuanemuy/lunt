# 独立した読み 1: domains/index.md、Account、Authority

区分: `spec/domains/index.md`（全文）、`spec/domains/account.md`・`authority.md`、`spec/usecases/account.md`・`authority.md`、`spec/testcases/account/`・`authority/`、`spec/testcases/ports/` のうち `accountRepository`・`loginChallengeRepository`・`loginSecretGenerator`・`loginMailSender`・`externalIdentityVerifier`・`stewardshipRepository`・`roleRosterRepository`・`unitOfWork`。上流は `spec/scenario/account.md`・`membership.md`・`operation.md`、`spec/pages/account.md`（MY-01・MY-02・MY-06・MY-07）・`shared.md`（CM-02）・`operation.md`（OM-02・OM-03・OM-07）。区分の外は、参照の確認のために `flows/index.md`（F-01〜F-05）、`domains/notification.md`・`bookmark.md`・`place.md`・`listing.md`・`moderation.md` の該当箇所だけを読んだ。

## 条件 1 要求を取りこぼしていない

反例なし。

## 条件 2 足しすぎていない

### 2-1 コードの誤入力の上限（`exhausted`）に上流がない

- 引用: `domains/account.md` ユビキタス言語「Exhausted | 誤入力の上限 | コードの誤入力が設定値の回数に達し、そのログインの確認がリンクでもコードでも使用できなくなった状態」。同 LoginChallenge「`pending → exhausted`（誤入力の上限）」。`usecases/account.md` completeLoginByCode「コードが一致せず、誤入力の回数が上限に達した | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）」。`testcases/account/completeLoginByCode.md`「`maxCodeAttempts` は 3 とする」
- 上流に引用元がない。`scenario/account.md` ACC-01 の異常系は「入力したコードが正しくない。ログインは成立せず、誤りが示される | メールのコードを確かめて入力し直す」だけで、入力し直しに回数の限りを置かない。無効になる事情は「有効期間を過ぎているか、一方の使用で無効になっている」の2つ。`pages/account.md` MY-02「リンク・コード無効」も同じ2つだけを挙げる。`requirements.md`・契約にも「誤入力」「上限」「回数」の語はない
- 利用者に見える振る舞い（3回目の誤入力で、メールのリンクも使えなくなる）が、技術設計の層で初めて現れている

### 2-2 ユースケースのエラーとユースケーステストに、技術的に起こりうるだけの競合がある

層の表の「書かない」（usecases:「技術的に起こりうるだけのエラー」、testcases/${domain}:「技術的なエッジケース」）に当たる。上流（scenario / pages）が振る舞いを定めていない同時実行で、同じ楽観ロック・一意性はポート適合テスト（`ports/accountRepository.md`・`loginChallengeRepository.md`・`stewardshipRepository.md`・`roleRosterRepository.md`・`unitOfWork.md`）がすでに確かめている。

- `usecases/account.md` completeLoginByLink・completeLoginByCode・loginWithExternalAccount「同じメールアドレスのアカウントの同時の作成 | `ConflictError`」。completeLoginByCode「同じログインの確認の同時の使用、同時のコードの入力 | 一方だけが成立し（数えられ）、他方は `ConflictError`」
- `testcases/account/completeLoginByCode.md`「正しくないコードでの実行を、2つ同時に行う」、`completeLoginByLink.md`「2つのリンクの鍵で同時に実行し、両方がアカウントの作成に進む」、`loginWithExternalAccount.md`「2つの実行を同時に行い、両方がアカウントの作成に進む」
- `testcases/account/withdraw.md`「A の `withdraw` が読み取りを終えた後、書き込みの前に、R の管理体制が他の要求（別の管理者の招待）で更新される」
- `testcases/authority/sweepWithdrawnAccount.md`「消費の途中で、R の管理体制が他の要求で更新され、R の保存が楽観ロックの競合になる」
- `testcases/authority/grantRole.md`「O1 による U への `operator` の付与と、O2 による V への `operator` の付与を同時に実行する」、`grantStewardship.md`「O1 による U への付与と、O2 による V への付与を同時に実行する」、`inviteMember.md`「A の D 宛ての招待と、B の C 宛ての招待の取り消しを同時に実行する」、`establishFirstOperator.md`「U のメールアドレスでの実行と、V のメールアドレスでの実行を同時に行う」

上流に引用元がある同時実行は、この反例に含めない（最後のサービス運営者: OPE-05「確定の時点で1人だけになっている場合を含む」、承諾と取り消し: MY-06「承諾の時点で招待が取り消されている」、解除と辞任: MEM-05「確定する前に、その管理者が自分で権限を手放した」）。

## 条件 3 Issue をまたぐ決定が決まりきっている

### 3-1 退会の消費の後にコミットした就任・付与で残る管理者・持ち主に、出る遷移の主体がない

- 状態: 退会したアカウントが、管理体制の管理者または名簿の持ち主として残っている状態
- 引用: `domains/authority.md` トランザクション境界「付与・承諾・承認による就任と、相手の退会が同時に起きると、退会したアカウントが管理者・持ち主として残り得る。残ったものは `"account.withdrawn"` の消費が取り除く」。`flows/index.md` F-04「就任と相手の退会が同時に起きて残った管理者は、`sweepWithdrawnAccount` が取り除く（F-03）」
- 欠けている遷移: 就任の側（`grantStewardship`・`grantRole`・`acceptInvitation`・管理権限の申請の承認）は、相手のアカウントを UnitOfWork の中で読み、その後にコミットする。`domains/index.md` UnitOfWork ポートは、スコープ内の読み取りとコミットの間の隔離を約束しない（「書き込みをコミット時にまとめて反映するアダプターがある」）。読み取りとコミットの間に `withdraw` がコミットし、`"account.withdrawn"` が配送されて `sweepWithdrawnAccount` が「何も書き込まない」で成立した後に、就任がコミットすると、残った管理者・持ち主を取り除く主体がない（`"account.withdrawn"` は再び配送されない）
- 依存する 2 か所: (a) `AccessPolicy.decide` の `manage_target`（残った管理者が唯一なら `stewarded` のままで、サービス運営者の代行が `ForbiddenError` になり続ける）と Application の `Premise`（管理者のいる店舗として、個人の申請を受け付けない）。(b) `viewMembers`・`listRoleHolders` の「アカウントのない管理者…は、`AccountId` だけで返す」（「`sweepWithdrawnAccount` が取り除く前のもの」と書くが、取り除かれない場合がある）
- 手で出る遷移（`revokeSteward`・`revokeRole`）はあるが、その状態に気づく主体（ジョブ・通知）がない。7-1 の代案はこの状態そのものをなくす

## 条件 4 矛盾がなく、現在形で単体で読める

### 4-1 依存方向の表と、ユースケースが使う他のドメインの型・ポートが食い違う

- 引用 A: `domains/index.md` 依存方向「依存は、他のドメインの型（値オブジェクト、エンティティ、ドメインイベントの型）の参照を指す」「Area、Media、Account、Moderation | なし」「循環はない。Account・Area は何にも依存しない。Discovery と Notification は最下流にあり、どのドメインからも依存されない」。同じ表は、ユースケースによるドメインイベントの消費を依存に数えている（「Authority | Account | 退会のドメインイベントを消費して…」「Bookmark | Account | 退会のドメインイベントを消費して保存を削除する」）
- 引用 B: `usecases/account.md` withdraw「`Stewardship.removeSteward`（Authority。`reason: "withdrawn"`）」「`RoleRoster.holds`、`RoleRoster.removeHolder`（Authority…）」、previewWithdrawal「`PlaceRepository.findByIds`（Place）、`RegionRepository.findByIds`（Region）、`OccasionRepository.findByIds`（Occasion）」。`usecases/authority.md` getMyAuthority・checkInvitation・grantStewardship も Place・Region・Occasion のリポジトリを使う（表の Authority の行は Account だけ）。`domains/bookmark.md`「`targetViewable` は、Discovery の `ReferenceQueries.isViewable` の結果をユースケースが渡す」、`domains/place.md`「照合のユースケースは、一致した店舗を Discovery の `ReferenceQueries.resolve` に渡し」
- 食い違い: 表がユースケースの参照を数えるなら、Account → Authority・Place・Region・Occasion、Authority → Place・Region・Occasion、Bookmark・Place・Moderation・Application・Article・Occasion → Discovery が表にない。数えないなら、Authority → Account、Bookmark → Account、Application の2行目の理由（ドメインイベントの消費）が表にあることと合わない。どちらの読みでも「Account は何にも依存しない」「Discovery は…どのドメインからも依存されない」のどちらかが成り立たない

### 4-2 ドメインイベントの名前の規約と、実際の名前が食い違う

- 引用 A: `domains/index.md` ドメインイベントの名前「ドメインイベントの型名は `"{ドメイン}.{出来事}"`」
- 引用 B: `domains/listing.md`「`category.retired`」（ドメインは Listing）、`domains/moderation.md`「`takedown_claim.submitted`」「`takedown_claim.resolved`」「`info_report.submitted`」「`info_report.confirmation_requested`」（ドメインは Moderation）、`domains/index.md` 写真の解放「`"photos.released"`」（ドメインを持たない共有カーネル）
- 接頭辞がドメイン名のもの（`account.`・`authority.`・`listing.`・`place.`…）と集約名のもの（`category.`・`takedown_claim.`・`info_report.`）が混ざり、規約からは新しいドメインイベントの接頭辞が決まらない

### 4-3 一覧の問い合わせの共通の契約と、`findAllBySteward` が食い違う

- 引用 A: `domains/index.md` リポジトリの共通の契約「一覧の問い合わせはテンプレートの `Pagination`（`page` は1始まり、`limit` は 1〜100）を取り、`PaginationResult`（…）を返す」
- 引用 B: `domains/authority.md` StewardshipRepository「`findAllBySteward` | …退会が全件を1つの UnitOfWork で書き換えるので、ページングせず全件を返す。管理する対象の一覧にも使う」。`testcases/ports/stewardshipRepository.md`「A が管理者の管理体制が101件ある | `findAllBySteward(A)` | 101件をすべて返す。ページングしない」
- 共通の契約は例外を置いていない。「管理する対象の一覧」（`getMyAuthority`）は一覧の問い合わせで、件数に上限のない結果を返す

### 4-4 承認による店舗管理者の追加の通知の宛先が、Authority と Notification・flows で食い違う

- 引用 A: `domains/authority.md` ドメインイベント `"authority.steward_appointed"` の消費者「Notification（…`application` はその店舗の店舗管理者へ。P-93）」
- 引用 B: `domains/notification.md`「`placeStewards` | `stewards`（その店舗）。`steward_added` だけ `except` が `appointee`」、`flows/index.md` F-04「`via: "application"` はその店舗の他の店舗管理者へ」、`testcases/notification/deliverNotifications.md`「S3 には届かない」
- Authority の記述は、就任した本人を含む全員に届くと読める

## 条件 5 体験設計

区分は技術設計の層。scenario / pages は上流として参照しただけで、代案との比較はしていない。

## 条件 6 アーキテクチャ制約、アダプターの差し替え

### 6-1 ドメイン間の非循環: Account ⇄ Authority、Place ⇄ Discovery

- 制約: 「ドメイン間の非循環: ドメイン間に循環依存を作らない」
- 違反箇所: `domains/index.md` は Authority → Account を依存に数える（「Authority | Account | 退会のドメインイベントを消費して…」）。一方 `usecases/account.md` withdraw は Authority の集約を読み、振る舞いを呼び、保存する（「その人が管理者であるすべての管理体制の `stewardshipRepository.save`、その人が持ち主である名簿の `roleRosterRepository.save`」「`Stewardship.removeSteward`（Authority…）」）。同じ数え方で Account → Authority が成り立ち、循環する。`domains/account.md` も「唯一のサービス運営者は退会できない（規則は Authority の `RoleRoster.removeHolder` が持つ）」と Authority の振る舞いを名指しする
- 同じ形: 表は Discovery → Place を数え（「Discovery | Area、Place、…」）、`domains/place.md` は Place の照合のユースケースが Discovery の `ReferenceQueries.resolve`・`PlaceEntry.substituteCover` を使うと定める
- 4-1 の読み（ユースケースの参照を依存に数えるか）が決まれば、この反例が残るかどうかが決まる。数える読みでは、`withdraw`・`previewWithdrawal` を Authority より下流に置く、対象の名称の解決を1つの読み取りのポートにまとめる（7-2）などの組み替えが要る

### 6-2 ビジネスロジックの配置: コードの不一致のエラーの選択をユースケースが持つ

- 制約: 「ビジネスルールはエンティティまたはドメインサービスに置く。ユースケース層はオーケストレーションのみ」
- 違反箇所: `domains/account.md` `LoginChallenge.redeemByCode`「ユースケースは `mismatch` の `challenge` を保存してコミットした後に、`pending` なら `BusinessRuleError("LOGIN_CODE_MISMATCH")`（入力し直せる）、`exhausted` なら `BusinessRuleError("LOGIN_CHALLENGE_INVALID")` を投げる」。`usecases/account.md` completeLoginByCode「コミットした後に、ユースケースがエラーを投げる」
- 状態からエラーコードを選ぶ規則（入力し直せるか、無効か）と、ドメインのエラー（`BusinessRuleError`）の生成がユースケースにある。コミットの後に投げる順序はオーケストレーションだが、どのエラーかは `CodeRedemption` の `mismatch` がエラーを持って返せば、ドメインに置ける

## 条件 7 次の改訂が前より高くつかない

### 7-1 退会と同時の就任・付与の後始末が、例外の列挙で成り立っている

- 引用:
  - `domains/authority.md` `Stewardship.sweepWithdrawn`「退会のドメインイベントの消費が使う。そのアカウントが管理者でなければ、変更なし・下書きなしで返す」
  - 同 `RoleRoster.sweepWithdrawn`「`operator` の最後の1人なら、取り除かずに変更なしで返す（名簿を0人にしない）」
  - 同 `RoleRoster.establishOperators`「`established` で、持ち主の全員が退会済み（`existingHolders` が空）なら、持ち主を `first` だけに置き換え、取り除いた持ち主ごとに `"authority.role_revoked"`（`reason: "withdrawn"`）を返す」
  - `usecases/authority.md` viewMembers・listRoleHolders「アカウントのない管理者（…`sweepWithdrawnAccount` が取り除く前のもの）は、`AccountId` だけで返す」
- 内容: 「退会で管理権限・役割を失う」という1つの規則が、`withdraw`（`removeSteward`・`removeHolder` の `"withdrawn"`）と `sweepWithdrawnAccount`（2つの `sweepWithdrawn`）の2か所に、最後のサービス運営者の扱いだけ違う形で定義されている（前者は `LAST_OPERATOR`、後者は黙って残す）。さらに、残った持ち主のために開設時の設定（`establishOperators`）が3つ目の分岐を持ち、読み取りの出力が「アカウントのない管理者・持ち主」を持つ。それでも 3-1 の順序では残る
- 代案: 就任・付与の相手のアカウントを、就任の書き込みの集合に入れて、退会と直列にする
  - `AccountRepository` に、`findById`・`findByEmail` が返した `expectedVersion` でアカウントがまだあることをコミットの時点で確かめる書き込み（版を進める `save`、または同じ楽観ロックの契約を持つ確認のメソッド）を足す。`Account` は `version` をすでに持つ
  - `grantStewardship`・`grantRole`・`acceptInvitation`・`establishFirstOperator`・管理権限の申請の承認は、相手のアカウントを読んだ `expectedVersion` で、就任と同じ UnitOfWork の中でこれを呼ぶ。退会が先にコミットしていれば就任が `ConflictError`／`NotFoundError` でロールバックし、就任が先なら `withdraw` の `delete` が `ConflictError` になり、送り直しで `findAllBySteward`・名簿が新しい就任を含む
  - 消えるもの: `sweepWithdrawnAccount`、`Stewardship.sweepWithdrawn`、`RoleRoster.sweepWithdrawn`、`establishOperators` の「持ち主の全員が退会済み」の分岐と `existingHolders`、`viewMembers`・`listRoleHolders` の「`AccountId` だけで返す」、F-03・F-05 の該当する失敗時の扱い、対応するテストケース（`sweepWithdrawnAccount.md` の全件、`establishFirstOperator.md` の3件、`listRoleHolders.md`・`viewMembers.md` の各1件）。Authority → Account の依存の理由（退会のドメインイベントの消費）も消える
  - 次の要求の想定: 「対象に結びつく権限の種類が増える（例: 読みものごとの担当）」。今の構造では `withdraw`・`previewWithdrawal`・`sweepWithdrawnAccount`・新しい集約の `sweepWithdrawn` の4か所に広がる。代案では `withdraw`・`previewWithdrawal` の2か所

### 7-2 管理権限の対象の名称の解決が、3つのユースケースに別々に定義されている

- 引用: `usecases/account.md` previewWithdrawal「`PlaceRepository.findByIds`（Place）、`RegionRepository.findByIds`（Region）、`OccasionRepository.findByIds`（Occasion）。管理者不在になる対象の名称。公開状態と運営による非公開を問わない。100件ずつに分けて呼ぶ」「名称が未入力の下書きの地域・イベントは、名称なしで返す」。`usecases/authority.md` getMyAuthority に同じ文、checkInvitation に `findById` での同じ規則
- 代案: `StewardedRef` の集合から名称を返す読み取りを1つ（Authority のポート、またはドメインの語彙で定める読み取りのポート。`ApplicationReviewDesk` と同じ扱い）にまとめ、3つのユースケースはそれを呼ぶ。「名称なしで返す」「公開状態を問わない」「種類ごとに分けて呼ぶ」の規則が1か所になり、Account・Authority のユースケースから Place・Region・Occasion のリポジトリへの参照が消える（6-1 の循環の一部も消える）
- 次の要求の想定: 「管理権限の対象の種類が増える」。今は3つのユースケースとそのテストケースに広がる。代案では読み取り1つ

## 7 条件の外

- `domains/index.md` エラーの種類「テンプレートの `NotFoundError`・`ConflictError`・`ValidationError`・`SystemError` に…`ForbiddenError` を加える」。テンプレートのコード（`packages/core/src/application/errors.ts`）には `ForbiddenError`・`UnauthorizedError` がすでにあり、`ValidationError` はない（`docs/backend_implementation_example.md` の表にだけある。presentation に `InputValidationError` がある）。`findByIds`・`findByTargets` の「100件を超えると `ValidationError`」を投げるクラスの置き場所は、テンプレートの側の食い違いで決まらない
- `startEmailLogin` の送り直し。同じ `LoginChallengeId`・同じメールアドレスは「送信も書き込みもなしに成功」なので、MY-02 コード入力の「メールアドレスを確かめて送り直せる」（メールが届かない場合）は、ブラウザが新しい `LoginChallengeId` を作るときだけメールが送られる。テストケース（「同じメールアドレスと、別の `LoginChallengeId` で実行する」）からは導けるが、どの操作で ID を作り直すかを述べた記述はない
- `LoginChallenge.isRedeemable` はどのユースケースの「使用するドメインの振る舞い・ポート」にも現れない。`Stewardship.cancelInvitation` の引数 `now` は処理に使われない
