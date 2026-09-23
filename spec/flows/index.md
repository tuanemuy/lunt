# 動的フロー台帳

複数のユースケース・時間をまたいで生きるものの、遷移と実行主体、終端、失敗時の扱いを定める。単一のユースケースの中で完結する処理は [../usecases/](../usecases/) が定める。状態の定義は [../domains/](../domains/) の各エンティティのライフサイクルに従う。

## 共通の前提

- ドメインイベントは、書き込みと同じ UnitOfWork で Outbox に保存され、リレーが配送する。配送は少なくとも1回で、順序を保証しない。消費者は、ペイロードの値ではなく消費の時点の事実を読んで判断し、冪等に作る
- 消費者が失敗（例外）で終わると、リレーが同じドメインイベントを再び配送する。1件ずつ別の UnitOfWork で処理する消費者は、確定した分を残し、残りを再配送で進める
- 再配送の上限に達したドメインイベントは、テンプレートの DLQ に移る。運用が原因を除いて DLQ から再投入し、消費者は冪等なので、再投入で続きが進む。DLQ にある間は、各フローの「失敗時の扱い」が述べる途中の状態が残る。この台帳は、DLQ に移った後のアプリケーション内のフローを持たない
- 失敗したデータベースの操作は再試行しない。利用者の要求は `ConflictError`・`SystemError` を返し、呼び出し側が同じ要求を送り直す。送り直しは、楽観ロックと冪等な作成（呼び出し側が決めた ID）で安全になる
- 結果整合の間（ドメインイベントが消費されるまで）も、提出・再提出・承認は同じ前提を事実で確かめ、読み取りは現在の集約の状態から求める。Discovery はドメインイベントで更新する写しを持たないので、公開状態・運営による非公開・削除は、コミットの時点で閲覧者の読み取りに反映される
- 日次のジョブは、対象を1件ずつ別の UnitOfWork で処理し、1件の失敗で止まらない。処理した対象が結果から外れる問い合わせは先頭のページを読み直して進め、読んだページの全件が失敗したら打ち切る。残りは次の実行が続ける

## フローの一覧

| ID | フロー | 対象 |
| --- | --- | --- |
| F-01 | メールアドレスでのログイン | ログインの確認、ログイン用のメール、アカウント |
| F-02 | ログインの成立と保存 | 端末の保存、アカウントの保存 |
| F-03 | 退会 | アカウントと、その人の管理権限・役割・保存・申請・通知 |
| F-04 | 管理体制と招待 | 管理体制、招待 |
| F-05 | 役割の名簿 | サービス運営者・編集担当者の名簿 |
| F-06 | 写真 | 写真の記録と実体 |
| F-07 | 申請 | 申請 |
| F-08 | 前提の再評価による失効 | 進行中の申請 |
| F-09 | 登録申請に併せた管理権限の申請 | 登録申請と、併せた管理権限の申請 |
| F-10 | 代行と期間超過の通知 | 運営者のいる地域・イベントへの確認中の申請、通知済みの記録 |
| F-11 | カテゴリー | カテゴリーの台帳と、廃止したカテゴリーの読まれ方 |
| F-12 | 公開状態 | 掲載・地域・イベント・読みものの公開状態 |
| F-13 | 運営による非公開 | 掲載・店舗・地域・イベントの運営による非公開 |
| F-14 | 掲載の提供終了の検出 | 掲載の提供状態、提供状態の確認記録 |
| F-15 | 掲載の削除 | 掲載、確認記録、写真、掲載の修正の申請 |
| F-16 | 管理者のいない店舗の代行から店舗管理者への引き継ぎ | 店舗、その掲載・所属・参加、管理体制 |
| F-17 | 所属 | 店舗の所属の集合 |
| F-18 | 参加 | 参加 |
| F-19 | 開催地域の関連づけ | 関連づけ |
| F-20 | イベントの中止・延期・終了 | イベントの開催の状態、開催の状態の記録 |
| F-21 | 取り下げの申立て | 申立て、対象の写真、結果のメール |
| F-22 | 情報の誤り・閉店の連絡 | 連絡 |
| F-23 | 通知とメールの配送 | 通知、通知のメール |
| F-24 | 紹介先の変化 | 公開中の読みものと紹介先 |

## F-01 メールアドレスでのログイン

- 対象: ログインの確認（`LoginChallenge`。`pending`・`redeemed`・`exhausted` と有効期限）、ログイン用のメール（`LoginMailSender`）、アカウント
- トリガー: `startEmailLogin`

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → `pending`（リンクとコードを載せたメールを送り、その後に保存する） | `startEmailLogin` |
| `pending` → `pending`（誤入力の回数が増える） | `completeLoginByCode`（不一致。回数をコミットしてからエラーを返す） |
| `pending` → `exhausted` | `completeLoginByCode`（誤入力が上限に達した） |
| `pending` → `redeemed`（アカウントがなければ同じ UnitOfWork で作る） | `completeLoginByLink`、`completeLoginByCode` |
| `pending`（有効期限の後）→ 使用できない | 状態は変わらない。`completeLoginByLink`・`completeLoginByCode` が現在時刻と比べて `LOGIN_CHALLENGE_INVALID` にする |
| `redeemed`・`exhausted`・有効期限を過ぎた `pending` → 削除 | `purgeClosedLoginChallenges`（日次） |

- 終端: 正常は `redeemed` の後の削除。ログインの成立の後は F-02 に続く。異常は `exhausted`、有効期限切れ、放棄（有効期限切れと同じ）で、どれも日次のジョブが削除する。ログインの確認どうしは独立で、新しい `startEmailLogin` は前の確認を変えない
- 失敗時の扱い
  - メールの送信を引き受けられなければ、何も保存しない（`SystemError`。送り直せる）
  - 送信の後に保存が失敗すると、届いたリンクとコードは対応する確認がなく無効になる。利用者はメールアドレスの入力からやり直す
  - 使用のロールバック（楽観ロックの競合、同じメールアドレスのアカウントの同時の作成）では、確認は `pending` のまま残り、同じリンク・コードでやり直せる。リンクとコードの同時の使用は一方だけが成立する
  - ジョブの失敗は、次の実行が同じ対象を削除する

## F-02 ログインの成立と保存

- 対象: 端末の保存（ブラウザが持つ）、アカウントの保存（`Bookmark`）
- トリガー: `completeLoginByLink`・`completeLoginByCode`・`loginWithExternalAccount` の成立。プレゼンテーション層が、成立したブラウザの端末の保存を `mergeDeviceBookmarks` に渡す

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| 端末の保存 → アカウントの保存（同じ対象は1つになり、先にある保存の日時が残る） | `mergeDeviceBookmarks` |
| 端末の保存 → 空 | 合流の成立を受けた端末の側の処理 |
| なし → 保存済み | `saveBookmark`（閲覧できる対象だけ） |
| 保存済み → なし | `removeBookmark` |
| なし → 保存済み（解除した保存を、保存した日時を保って戻す） | `restoreBookmark` |
| 保存済み（対象が閲覧できなくなった）→ 保存済み | 状態は変わらない。`listBookmarks` が返した参照を Discovery の `resolveReferences` が解決し、読み取りの時点で閲覧できない対象として返す。`removeBookmark` で解除できる |
| 保存済み → 削除 | `purgeBookmarksOnWithdrawal`（`account.withdrawn`） |

- 終端: 解除、または退会に伴う削除。保存は期限を持たない
- 失敗時の扱い: 合流が成立しなければ、アカウントの保存は変わらず、端末の保存は端末に残る。同じ一覧で送り直せ、やり直しても結果は同じになる。外部アカウントの検証の失敗と、同じメールアドレスのアカウントの同時の作成（`ConflictError`）では、ログインが成立せず、合流は始まらない

## F-03 退会

- 対象: アカウントと、その人の管理権限・役割・保存・個人の申請・通知
- トリガー: `withdraw`。先に `previewWithdrawal` で、退会の可否と、管理者不在になる対象を確かめる。後任は F-04 の招待で立てる

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| アカウントあり → 削除。その人のすべての管理権限と役割を同じ UnitOfWork で取り除く。就任・付与（F-04、F-05）とは、アカウントの版で直列になる | `withdraw`（`account.withdrawn`、管理体制ごとの `authority.steward_removed`、管理者不在になった対象ごとの `authority.stewardship_vacated`、名簿ごとの `authority.role_revoked`） |
| 管理者不在になった店舗の、店舗として行った進行中の申請 → `lapsed` | `reassessApplicationPremises`（`authority.stewardship_vacated`。F-08） |
| その人の保存 → 削除 | `purgeBookmarksOnWithdrawal`（`account.withdrawn`） |
| その人が個人として行った進行中の申請 → `withdrawn`（併せた管理権限の申請を含む。写真は `photos.released` で手放す） | `withdrawApplicationsOfWithdrawnAccount`（`account.withdrawn`） |
| その人の通知 → 削除 | `purgeNotificationsOnWithdrawal`（`account.withdrawn`） |

- 終端: 正常は、3つの消費者がすべて成立した状態。承諾前の招待、その人が連絡した連絡（`InfoReport`）、店舗として行った申請は残る。退会の後の同じメールアドレスでのログインは、別の `AccountId` のアカウントを作る（F-01）。異常は `LAST_OPERATOR`（唯一のサービス運営者。何も確定しない）と `ConflictError`（何も確定しない。送り直せる）
- 失敗時の扱い
  - 3つの消費者は互いに独立で、失敗した消費者だけが再配送でやり直す。消費までの間も、退会したアカウントではログインできないので、保存と通知は読まれない
  - `withdrawApplicationsOfWithdrawnAccount` は、1件ごとの UnitOfWork で確定した分を残し、競合した残りを再配送が処理する
  - 就任・付与（`acceptInvitation`、`approveStewardshipClaim`、`grantStewardship`、`grantRole`、`establishFirstOperator`）は、相手のアカウントの版を同じ UnitOfWork で進める（`Account.markReferenced`）ので、退会と同時には確定しない。就任・付与が先なら、`withdraw` が `ConflictError` になり、送り直した `withdraw` が新しい管理権限・役割も取り除く。退会が先なら、就任・付与は `NotFoundError` または `ConflictError` で成立しない。退会したアカウントは、管理者にも役割の持ち主にも残らない
  - 消費者のどれかで `account.withdrawn` が再配送の上限に達すると、その消費者の対象（保存、個人の進行中の申請、通知）は、DLQ からの再投入まで残る。残った進行中の申請は、その間も承認者の一覧に現れる
  - 退会と同時の `saveBookmark`・`mergeDeviceBookmarks` が、保存の削除の後にコミットした保存は残る。`AccountId` は再び使われないので、どの保存一覧にも現れない
  - 削除の後に退会したアカウントを宛先にする告知が消費されても、`deliverNotifications` は存在しないアカウントを宛先から外す
  - その人が登録して持ち主のないままの写真は、`sweepUnownedPhotos` が削除する（F-06）

## F-04 管理体制と招待

- 対象: 管理体制（`Stewardship`。`vacant`・`stewarded`、管理者、承諾前の招待）。店舗・地域・イベントに共通。保存された管理体制のない対象は `vacant`。招待は期限を持たない
- トリガー: `inviteMember`、`approveStewardshipClaim`（店舗）、`grantStewardship`（地域・イベント）

招待。

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → 承諾前 | `inviteMember`（対象の管理者。`authority.invitation_issued` → `deliverNotifications` が宛先にメールを送り、アカウントがあればサービス内の通知も届ける） |
| 承諾前 → 承諾（宛先のアカウントが就任し、招待は消える） | `acceptInvitation`（先に `checkInvitation` で承諾できるかを読む） |
| 承諾前 → 取り消し | `cancelInvitation`（対象の管理者。管理者不在の対象ではサービス運営者） |
| 承諾前 → 消滅（宛先のアカウントが別の経路で就任した） | `approveStewardshipClaim`、`grantStewardship` |
| 承諾前 → 承諾前（招待した管理者の辞任・解除・退会、対象の管理者不在） | 状態は変わらない。承諾は成立する |

管理体制。

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| `vacant` → `stewarded` | `acceptInvitation`、`approveStewardshipClaim`、`grantStewardship`（`authority.steward_appointed`。`wasVacant: true`。就任する人のアカウントの版を同じ UnitOfWork で進める） |
| `stewarded` → `stewarded`（管理者が増える） | 同上 |
| `stewarded` → `stewarded`（最後でない管理者が減る） | `resignStewardship`、`revokeSteward`、`withdraw`（`authority.steward_removed`） |
| `stewarded` → `vacant` | 同上（最後の管理者。`authority.steward_removed` と `authority.stewardship_vacated`） |

波及。

| ドメインイベント | 消費者と結果 |
| --- | --- |
| `authority.steward_appointed`（対象が店舗） | `reassessApplicationPremises`。個人が管理者のいない店舗に行った進行中の申請と、就任した人のその店舗への管理権限の申請が `lapsed`（F-08） |
| `authority.steward_appointed` | `deliverNotifications`。`via: "grant"` は付与された人へ、`via: "application"` はその店舗の他の店舗管理者へ。`via: "invitation"` は告知なし |
| `authority.stewardship_vacated`（対象が店舗） | `reassessApplicationPremises`。店舗として行った進行中の申請が `lapsed`。失効の通知は、サービス運営者に `proxy` で届く（F-23） |
| `authority.steward_removed` | `deliverNotifications`。`reason: "revoked"` は本人へ。`resigned`・`withdrawn` は告知なし |

- 終端: 管理体制は削除せず、終端を持たない。`vacant` の間は、サービス運営者が対象の管理を代行し、招待を取り消せる。`stewarded` に戻ると、代行は `ForbiddenError` になる。招待の終端は、承諾・取り消し・消滅。放棄された招待は承諾前のまま残り、`cancelInvitation` で取り除ける
- 失敗時の扱い
  - 同じ対象への同時の操作（承諾と取り消し、最後の2人の同時の辞任、招待の承諾と申請の承認による同時の就任）は、管理体制の楽観ロックで一方が `ConflictError` になる
  - 就任は、就任する人のアカウントの版を同じ UnitOfWork で進める（`Account.markReferenced`）。就任と相手の退会は同時には確定しない（F-03）
  - 招待のメールの送信の失敗は F-23 の再配送による
  - 前提の再評価の消費までの間も、承認は前提を事実で確かめるので、前提を欠く申請は承認されない（F-08）

## F-05 役割の名簿

- 対象: 役割ごとの名簿（`RoleRoster`。`operator` は `unestablished`・`established`、`editor` は持ち主の増減だけ）
- トリガー: 開設の手順の `establishFirstOperator`

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| `operator`: `unestablished` → `established`（最初の持ち主が1人） | `establishFirstOperator` |
| 持ち主が増える | `grantRole`（`authority.role_granted` → `deliverNotifications` が付与された人へ。付与される人のアカウントの版を同じ UnitOfWork で進める） |
| 持ち主が減る | `revokeRole`（`authority.role_revoked`。`reason: "revoked"` → `deliverNotifications` が本人へ）、`withdraw`（`reason: "withdrawn"`。告知なし） |

- 終端: 名簿は削除せず、終端を持たない。`established` の `operator` の名簿は0人にならない（`LAST_OPERATOR`）。`editor` は0人になれ、その間の編集担当者宛ての告知は、宛先なしで成立する
- 失敗時の扱い: 同じ名簿への同時の付与・解除・退会・開設時の設定は、楽観ロックで一方が `ConflictError` になる。付与と開設時の設定は、相手のアカウントの版を同じ UnitOfWork で進める（`Account.markReferenced`）ので、相手の退会と同時には確定しない（F-03）

## F-06 写真

- 対象: 写真の記録（`PhotoAsset`。`accepted`・`stored`・`discarded` と持ち主）と、写真の実体（`PhotoStorage`）
- トリガー: `registerPhoto`、`duplicatePhotos`

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → `accepted`（同意とファイルを確かめた記録） | `registerPhoto`（1つ目の UnitOfWork）、`duplicatePhotos`（複製の記録） |
| `accepted` → `stored`（持ち主なし。実体を置いた後） | `registerPhoto`（`PhotoStorage.put` の後の2つ目の UnitOfWork） |
| `accepted`（複製。実体は `PhotoStorage.copy` で置く）→ `stored`（持ち主は新しい掲載） | `duplicateListing`（新しい掲載の `insert` と同じ UnitOfWork） |
| `stored`（持ち主なし）→ `stored`（持ち主は集約） | `createListingDraft`、`updateListing`、`registerPlaceByProxy`、`updatePlaceProfile`、`registerRegion`、`updateRegionContent`、`registerOccasion`、`updateOccasionContent`、`createArticle`、`reviseArticle`（集約の書き込みと同じ UnitOfWork。登録した人の操作だけが設定できる） |
| `stored`（持ち主なし）→ `stored`（持ち主は申請） | `submitPlaceRegistration`、`submitPlaceRevision`、`submitNewListing`、`submitListingRevision`、`resubmitApplication` |
| `stored`（持ち主は申請）→ `stored`（持ち主は反映先の集約） | `approvePlaceRegistration`、`approvePlaceRevision`、`approveNewListing`、`approveListingRevision`（承認と同じ UnitOfWork） |
| `stored`（持ち主あり）→ 手放された（`photos.released` に載る。記録はまだ変わらない） | 内容の更新で写真が外れた: `updateListing`、`updatePlaceProfile`、`updateRegionContent`、`updateOccasionContent`、`reviseArticle`。集約の削除: `deleteListing`。申立てに基づく削除: `takeDownListingPhotos`、`takeDownPlacePhotos`、`takeDownRegionPhotos`、`takeDownOccasionPhotos`、`takeDownArticlePhotos`。申請: `resubmitApplication`（外した写真）、`withdrawApplication`、`rejectApplication`、`reassessApplicationPremises`、`withdrawApplicationsOfWithdrawnAccount`、承認のユースケース（失効した場合のすべての写真、採用されなかった写真、`approvePlaceRevision` で置き換えられた店舗の写真） |
| 手放された → `discarded` → 実体の削除 → 記録の削除 | `discardReleasedPhotos`（`photos.released`。写真1枚ごとに、`discard` の UnitOfWork、`PhotoStorage.delete`、記録の削除の UnitOfWork） |
| `accepted`、または持ち主のない `stored`（登録から保持期間を過ぎた）→ `discarded` → 削除 | `sweepUnownedPhotos`（日次） |
| `discarded`（削除の途中で残った）→ 削除 | `sweepUnownedPhotos`、または `photos.released` の再配送 |

- 参照: 写真を返す読み取りのユースケースが、集約の持つ `PhotoId` から `PhotoStorage.displayRefs` で表示用の参照を得る。集約が写真を外す書き込みと `photos.released` の保存は同じ UnitOfWork なので、外れた写真はコミットの時点で表示されなくなり、実体の削除だけが結果整合になる
- 終端: 正常は記録の削除。削除した写真は戻せない。手放された写真は、どの集約にも載せ直せない。異常（登録の途中の失敗、保存・提出に使われなかった写真、成立しなかった複製）は、持ち主のない写真として `sweepUnownedPhotos` が削除する
- 失敗時の扱い
  - `registerPhoto` の `put` 以降の失敗は `accepted` の記録を残す。同じ `PhotoId` の送り直しが `put` から続け、送り直されなければ `sweepUnownedPhotos` が削除する
  - `duplicatePhotos` の `copy` の途中の失敗と、`duplicateListing` の不成立は、持ち主のない複製を残し、`sweepUnownedPhotos` が削除する。`duplicateListing` の送り直しは写真を複製し直す
  - 持ち主の設定（保存・提出）がロールバックすれば、写真は持ち主のないまま残り、同じ写真で保存・提出をやり直せる。やり直さなければ `sweepUnownedPhotos` が削除する
  - `PhotoStorage.delete` 以降の失敗は `discarded` の記録を残し、再配送または `sweepUnownedPhotos` が実体の削除から続ける。1枚の失敗は他の写真の削除を妨げない。記録のない写真は削除済みとして扱う
  - `photos.released` が、写真の破棄（`discard`）の前に再配送の上限に達すると、その写真は持ち主が設定された `stored` のまま残る。`sweepUnownedPhotos` は持ち主のある写真を対象にしないので、実体と記録の削除は DLQ からの再投入で進む。集約はすでに写真を外しているので、その間も写真は表示されない
  - 持ち主の設定と掃除の競合は、楽観ロックで掃除の側が成立せず、実体は削除されない

## F-07 申請

- 対象: 申請（`Application`。`underReview`・`returned`・`approved`・`rejected`・`withdrawn`・`lapsed`）。8種に共通
- トリガー: 提出のユースケース（`submitPlaceRegistration`、`submitPlaceRevision`、`submitStewardshipClaim`、`submitAffiliationChange`、`submitParticipation`、`submitNewListing`、`submitListingRevision`）。先に `checkSubmissionEligibility` で始められるかを読む

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → `underReview`（写真の持ち主は申請） | 提出のユースケース（`application.submitted`） |
| `underReview` → `returned` | `sendBackApplication`（承認者だけ。代行はできない。`application.returned`） |
| `returned` → `underReview`（確認中になった日時が替わり、代行の期間を数え直す） | `resubmitApplication`（`application.resubmitted`） |
| `returned` → `lapsed` | `resubmitApplication`（前提を欠く。失効をコミットし、例外を投げない）、`reassessApplicationPremises` |
| `underReview` → `approved`（内容の反映、写真の付け替えと同じ UnitOfWork） | 種類ごとの承認のユースケース（`application.approved` と、反映先のドメインイベント） |
| `underReview` → `lapsed` | 種類ごとの承認のユースケース（前提を欠く。内容は反映しない）、`reassessApplicationPremises`（`application.lapsed`） |
| `underReview` → `rejected` | `rejectApplication`（承認者または代行。`application.rejected`） |
| `underReview`・`returned` → `withdrawn` | `withdrawApplication`、`withdrawApplicationsOfWithdrawnAccount`（`application.withdrawn`） |

- 反映先: 店舗の登録（F-16）、店舗の内容と営業状況、管理体制（F-04）、所属（F-17）、参加（F-18）、掲載（F-12）
- 通知: 承認者へ `submitted`・`resubmitted`・`withdrawn`、申請者へ `returned`・`approved`・`rejected`・`lapsed`（`deliverNotifications`。F-23）。店舗として行った申請の申請者宛ては、消費の時点のその店舗のすべての店舗管理者
- 終端: `approved`・`rejected`・`withdrawn`・`lapsed`。申請は削除しない。失効した申請は、前提が再び成り立っても戻らない。再申請は新しい申請になる。放棄された `returned` は期限を持たず、取り下げ・失効・退会まで `returned` のまま残る
- 失敗時の扱い
  - 提出は冪等な作成で、同じ `ApplicationId`・同じ内容の送り直しは、書き込みなしに保存されている申請を返す。同じ枠への同時の提出は、後からコミットした側が `ConflictError`
  - 承認のロールバック（反映先の振る舞いのエラー、どれかの書き込みの `ConflictError`）では、申請は確認中のまま残り、反映先も写真も変わらない。判断し直せる
  - 同じ申請への同時の判断・再提出・取り下げは、版の比較と楽観ロックで一方だけが成立する。店舗が行った申請は、その店舗のどの店舗管理者も扱え、先に操作した側が成立する
  - 申請が終わるときに手放す写真は F-06 による

## F-08 前提の再評価による失効

- 対象: 進行中（`underReview`・`returned`）の申請
- トリガー: 前提に関わるドメインイベント。失効は「申請の種類ごとの前提が成り立たなくなった」という1つの規則による（P-77、I-19）。下の表は、前提ごとのドメインイベントを挙げる

| ドメインイベント（出す主体） | 関わる申請 | 失効する申請 |
| --- | --- | --- |
| `authority.steward_appointed`（F-04。対象が店舗） | その店舗 | 個人が管理者のいない店舗に行った申請、就任した人のその店舗への管理権限の申請 |
| `authority.stewardship_vacated`（F-04。対象が店舗） | その店舗 | 店舗として行った申請 |
| `region.affiliation_established`（`approveAffiliation`） | その店舗 | 同じ店舗とその地域への他の所属の申請 |
| `region.affiliation_dissolved`（`approveLeave`、`excludeAffiliatedPlace`） | その店舗 | その所属の離脱の申請 |
| `occasion.participation_established`（`approveParticipation`、`addParticipationDirectly`） | その店舗 | その店舗のそのイベントへの参加の申請 |
| `occasion.cancelled`（`cancelOccasion`）、`occasion.ended`（`recordEndedOccasions`） | そのイベント | そのイベントへの参加の申請 |
| `listing.deleted`（`deleteListing`） | その掲載 | その掲載の修正の申請 |
| `application.rejected`（`rejectApplication`）、`application.withdrawn`（`withdrawApplication`、`withdrawApplicationsOfWithdrawnAccount`） | 登録申請なら、その登録申請 | 併せた管理権限の申請（F-09） |

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| `underReview`・`returned`（前提を欠く）→ `lapsed` | `reassessApplicationPremises`（申請1件ごとの UnitOfWork。`application.lapsed` と `photos.released`） |
| `underReview`・`returned`（前提が成り立つ）→ 変わらない | `reassessApplicationPremises`（書き込まない） |

- 終端: `lapsed`。申請者への通知は `application.lapsed` から（F-23）。中止の取り消し・延期・再度の管理者不在で前提が再び成り立っても、失効した申請は戻らない
- 失敗時の扱い
  - 消費の時点の事実で判定し、終わった申請は読み取りに現れないので、配送の順序と重複に影響されない
  - 1件の保存が競合しても、他の申請の失効は確定する。競合した申請が残れば消費を失敗として終え、再配送が処理する
  - 消費までの間に前提を欠いた申請が承認・再提出されると、その操作が前提を確かめて失効にする。前提を欠く申請は承認されない
  - 開催期間の更新で終了になったイベントの `occasion.ended` は、次の日次のジョブで出る（F-20）。それまでの間も、参加の申請の提出と承認は今日の開催の状態で確かめる
  - 承認のユースケースは、反映先でない集約の事実を読んでから書き込むまでの間の変化を防がない。同じ反映先への同時の成立（所属、参加、就任）は、反映先の集約の楽観ロック・一意性が守る

## F-09 登録申請に併せた管理権限の申請

- 対象: 登録申請と、併せた管理権限の申請（別の申請。それぞれ F-07 の状態を持つ）
- トリガー: 管理権限の申請を併せた `submitPlaceRegistration`（2つの申請を同じ UnitOfWork で作る。店舗の ID を予約する）

| 登録申請 | 併せた管理権限の申請 | 実行主体 |
| --- | --- | --- |
| `underReview`・`returned` | `underReview`（判断できない。`APPLICATION_REGISTRATION_PENDING`） | 判断のユースケースが拒む |
| `underReview` → `approved`（予約した ID で店舗を作る） | `underReview`（判断できるようになる） | `approvePlaceRegistration` |
| `approved` | `underReview` → `approved`（申請者が店舗管理者になる。F-04） | `approveStewardshipClaim` |
| `approved` | `underReview` → `returned`・`rejected`・`withdrawn` | `sendBackApplication`、`rejectApplication`、`withdrawApplication` |
| `underReview` → `rejected`、`underReview`・`returned` → `withdrawn` | 進行中 → `lapsed` | `rejectApplication`・`withdrawApplication` の後の `reassessApplicationPremises`（`application.rejected`・`application.withdrawn`） |
| 進行中 → `withdrawn`（申請者の退会） | 進行中 → `withdrawn` | `withdrawApplicationsOfWithdrawnAccount`（どちらも同じ人の個人の申請） |

- 終端: 2つの申請のそれぞれが F-07 の終端に達する。併せた申請だけを取り下げても、登録申請は変わらない。登録申請は前提を持たず、失効しない
- 失敗時の扱い: 提出は2つの申請がどちらも作られるか、どちらも作られないかのどちらか。送り直しは、保存されている登録申請の予約した ID で内容を比べる。登録申請の否認・取り下げから併せた申請の失効までは別の UnitOfWork で、その間の併せた申請の判断は、前提（登録申請の状態）を確かめて失効にする

## F-10 代行と期間超過の通知

- 対象: 運営者のいる地域・イベントへの確認中の申請（所属・離脱・参加）と、通知済みの記録（`OverdueNoticeLedger`。申請ごとに1つ）
- トリガー: スケジュール（日次）

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| 確認中（期間内）→ 確認中（期間を過ぎた。代行できる） | 保存された遷移を持たない。`ApproverPolicy` が、確認中になった日時と現在時刻から決める |
| 記録なし、または記録が前の確認中のもの → その確認中について通知済み | `notifyOverdueReviews`（記録の更新と `application.review_overdue` を、申請1件ごとの UnitOfWork で確定する） |
| `application.review_overdue` → サービス運営者への通知 | `deliverNotifications` |
| 確認中（代行できる）→ `approved`・`rejected`・`lapsed` | `listApplicationsAwaitingReview` で読んだサービス運営者の `approveAffiliation`・`approveLeave`・`approveParticipation`・`rejectApplication`。差し戻しはできない |
| `returned` → `underReview`（期間を数え直し、期間を過ぎるともう一度通知する） | `resubmitApplication` |

- 終端: 申請が F-07 の終端に達する。期間を過ぎる前のサービス運営者の判断は `APPLICATION_AWAITING_STEWARDS`。運営者が不在になった対象の申請は、サービス運営者が承認者として判断する（代行ではない）。記録は削除しない
- 失敗時の扱い: 1件の書き込みの失敗は記録もドメインイベントも残さず、次の実行が同じ申請を取り出す。2つのジョブの同時の実行で `application.review_overdue` が重ねて出ても、通知は `pendingSince` から作るキーで1つになる。運営者の判断と代行の同時の判断は、申請の楽観ロックで一方だけが成立する

## F-11 カテゴリー

- 対象: カテゴリーの台帳（`CategoryCatalog`。カテゴリーは `active`・`retired`）、掲載と進行中の申請の内容に保存された `CategoryId` の読まれ方
- トリガー: 開設の手順の `provisionInitialCategories`（F-05 の `establishFirstOperator` と並ぶ開設の手順。画面からは呼ばない）、サービス運営者の `addCategory`

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → カテゴリー: `active`（初期の4カテゴリー。台帳が空のときだけ入れる） | `provisionInitialCategories` |
| なし → カテゴリー: `active` | `addCategory` |
| カテゴリー: `active` → `active`（名称の変更） | `renameCategory` |
| カテゴリー: `active` → `retired`（移行先を記録する） | `retireCategory`（`category.retired`） |
| 廃止したカテゴリーの掲載・進行中の申請 → 移行先のカテゴリーのものとして読まれる | 読み取りと承認が `CategoryCatalog.resolve` を通す（廃止の確定の時点から）。掲載と申請に保存された `CategoryId` は書き換えない |
| `category.retired` → 廃止したカテゴリーの掲載を持つ店舗の店舗管理者への通知（店舗と廃止したカテゴリーの組ごとに1つ） | `deliverNotifications` |

- 終端: `retired`（戻らない）。移行先は、読み取りの時点の台帳で解決した現役のカテゴリー（移行先がさらに廃止されていれば、その先）。編集して保存した掲載は、その時点の現役の `CategoryId` を保存する
- 失敗時の扱い: 廃止は台帳の書き込みだけで確定し、掲載と申請の書き込みを持たないので、途中の状態はない。台帳の同時の保存は `ConflictError`。通知の失敗は F-23 の再配送による

## F-12 公開状態

- 対象: 掲載・地域・イベント・読みものの公開状態（`Publication`。`draft`・`published`・`unpublished`（`byManager`・`photoTakedown`））。店舗は公開状態を持たない
- トリガー: 下書きの作成（`createListingDraft`、`duplicateListing`、`registerRegion`、`registerOccasion`、`createArticle`）。掲載の申請の承認（`approveNewListing`）は `published` の掲載を作る

| 遷移元 → 遷移先 | 掲載 | 地域 | イベント | 読みもの |
| --- | --- | --- | --- | --- |
| `draft`・`unpublished` → 同じ状態（内容の保存） | `updateListing` | `updateRegionContent` | `updateOccasionContent` | `reviseArticle` |
| `draft` → `published`、`unpublished` → `published` | `publishListing` | `publishRegion` | `publishOccasion` | `publishArticle` |
| `published` → `published`（内容の保存。公開条件を確かめ、保存の時点で反映する） | `updateListing`、`approveListingRevision` | `updateRegionContent` | `updateOccasionContent` | `reviseArticle` |
| `published` → `unpublished`（`byManager`） | `unpublishListing` | `unpublishRegion` | `unpublishOccasion` | `unpublishArticle` |
| `published` → `unpublished`（`photoTakedown`。最後の写真の削除） | `takeDownListingPhotos` | `takeDownRegionPhotos` | `takeDownOccasionPhotos` | `takeDownArticlePhotos` |
| どの状態でも → 削除 | `deleteListing`（F-15） | なし | なし | なし |

- 未保存の変更を伴う公開は、保存と公開の2つの要求（2つの UnitOfWork）になる。公開が成立しなくても、保存した内容は公開していない状態のまま残る。公開の前の見え方は `previewListing`・`previewArticle`・`previewListingSubmission` が読む
- 波及: `listing.unpublished`・`region.unpublished`・`occasion.unpublished` は、その対象を紹介する公開中の読みものの編集担当者への通知になる（F-24）。公開と再公開はドメインイベントを出さない
- 終端: 掲載は削除。地域・イベント・読みものは削除されず、終端を持たない。`draft` へは戻らない。放棄された下書きは `draft` のまま残る
- 失敗時の扱い
  - 公開条件を欠く公開は、不足する項目を添えた `BusinessRuleError` で、状態は変わらない
  - 運営による非公開の間の公開状態の変更は `BusinessRuleError`（F-13）。公開条件を欠いたことによる `unpublished` への遷移は、運営による非公開の間も起きる
  - すでにその状態であることは `BusinessRuleError`、同時の保存は `ConflictError`。内容の保存は、編集を始めたときの版と違えば `ConflictError`
  - `photoTakedown` の対象は、写真を登録して保存し、公開の操作で戻す（F-21）。写真を加えて保存しただけでは公開に戻らない

## F-13 運営による非公開

- 対象: 掲載・店舗・地域・イベントの `Suspension`（公開状態に重なる別の状態）
- トリガー: サービス運営者の `suspendListing`、`suspendPlace`、`suspendRegion`、`suspendOccasion`

| 遷移元 → 遷移先 | 掲載 | 店舗 | 地域 | イベント |
| --- | --- | --- | --- | --- |
| 非公開でない → 運営による非公開 | `suspendListing` | `suspendPlace` | `suspendRegion` | `suspendOccasion` |
| 運営による非公開 → 非公開でない（公開状態がそのまま現れる） | `unsuspendListing` | `unsuspendPlace` | `unsuspendRegion` | `unsuspendOccasion` |
| 運営による非公開 → 削除 | `deleteListing` | なし | なし | なし |

- 運営による非公開の間: 対象は閲覧できない。店舗の非公開は、その店舗の掲載も閲覧できなくする（`VisibilityPolicy`）。公開・一時非公開・公開の取り下げ・再公開は `BusinessRuleError`。情報の更新、削除、提供終了、中止、申立てに基づく写真の削除、申請の承認による反映はできる。運営による非公開の間に最後の写真が削除された対象は、解除すると `unpublished`（`photoTakedown`）として現れる
- 波及: `*.suspended` は、対象の管理者（店舗管理者、地域運営者、イベント運営者。不在ならサービス運営者に `proxy`）と、対象を紹介する公開中の読みものの編集担当者への通知になる。`place.suspended` は、その店舗の掲載を紹介する読みものにも及ぶ。`*.unsuspended` は、対象の管理者への通知だけになる（`deliverNotifications`）
- 終端: 掲載は削除。店舗・地域・イベントは終端を持たず、何度でも行き来できる。重複する店舗の整理は、一方の店舗への `suspendPlace` で行い、解除しないかぎり非公開のまま残る
- 失敗時の扱い: すでにその状態であることは `BusinessRuleError`（別のサービス運営者が先に行った）。同時の保存は `ConflictError`。所属・参加・保存・関連づけは書き換えないので、補償するものはない

## F-14 掲載の提供終了の検出

- 対象: 公開中の掲載の提供状態（保存せず、提供の設定・`manualEnd`・今日の暦日から求める）と、提供状態の確認記録（`OfferingPhaseLedger`。掲載ごとに1つ）
- トリガー: スケジュール（日次）。状態を変える操作は `endListingOffering`、`resumeListingOffering`、`updateListing`（提供の設定）、期日の経過

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| 提供中 → 提供終了（`cause: "manual"`） | `endListingOffering`（`manualEnd` を記録する。ドメインイベントなし） |
| 提供終了（`manual`）→ 提供の設定と今日の暦日から決まる状態 | `resumeListingOffering` |
| 提供開始前 → 提供中 → 提供終了（`cause: "schedule"`） | 日付の経過。保存された遷移を持たない |
| 記録が提供終了でない（記録なしを含む）、今日が提供終了 → 記録が提供終了 | `detectEndedOfferings`（記録の更新と `listing.offering_ended` を、掲載1件ごとの UnitOfWork で確定する） |
| 記録と今日の段階が違う（提供終了への変化を除く）→ 記録が今日の段階 | `detectEndedOfferings`（記録だけを更新する） |
| `listing.offering_ended` → その掲載を紹介する公開中の読みものの編集担当者への通知 | `deliverNotifications`（F-24） |
| 記録 → 削除 | `deleteListing`（掲載の削除と同じ UnitOfWork） |

- 終端: 記録は掲載の削除で消える。提供終了にして次の実行までに提供中へ戻した掲載は、ドメインイベントを出さない。公開していない間に提供終了になった掲載は、公開中になった後の実行で検出する
- 失敗時の扱い: 1件の書き込みの失敗は記録もドメインイベントも残さず、次の実行が同じ掲載を取り出す。記録を更新した掲載は結果から外れるので、同じ日に何度実行しても、1つの提供終了について出るドメインイベントは1つ。2つのジョブの同時の実行で `listing.offering_ended` が重ねて出ても、通知は `observedOn` から作るキーで1つになる

## F-15 掲載の削除

- 対象: 掲載、確認記録、掲載の写真、その掲載の修正の申請
- トリガー: `deleteListing`（公開状態・提供状態・運営による非公開を問わない）

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| 掲載あり → 削除（確認記録の削除、`listing.deleted` と `photos.released` の保存と同じ UnitOfWork） | `deleteListing` |
| その掲載の修正の進行中の申請 → `lapsed` | `reassessApplicationPremises`（`listing.deleted`。F-08） |
| 掲載の写真 → 削除 | `discardReleasedPhotos`（`photos.released`。F-06） |
| その掲載を紹介する公開中の読みものの編集担当者への通知 | `deliverNotifications`（`listing.deleted`。F-24） |

- 終端: 削除（復元できない）。掲載を指す保存、参加に添えた掲載、読みものの紹介先、連絡、申立ては書き換えず、読み取りが閲覧できない対象として扱う
- 失敗時の扱い: 別の人が先に削除していれば `NotFoundError`、同時の保存・削除は `ConflictError`。消費者は互いに独立で、失敗した消費者だけが再配送でやり直す。申請の失効までの間も、掲載の修正の承認は、掲載があることを確かめて失効にする

## F-16 管理者のいない店舗の代行から店舗管理者への引き継ぎ

- 対象: 店舗（削除されない。営業状況と `Suspension` を持つ）、その掲載・所属・参加、管理体制
- トリガー: `approvePlaceRegistration`、または `registerPlaceByProxy`（どちらも、管理者のいない、営業中の公開された店舗を作る）

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → 管理者のいない店舗 | `approvePlaceRegistration`、`registerPlaceByProxy` |
| 管理者のいない店舗の内容・掲載の変更 | サービス運営者の代行（`updatePlaceProfile`、`changeOperatingStatus`、`createListingDraft`、`updateListing`、`publishListing`、`unpublishListing`、`endListingOffering`、`resumeListingOffering`、`deleteListing`）、個人の申請の承認（`approvePlaceRevision`、`approveNewListing`、`approveListingRevision`、`approveAffiliation`、`approveLeave`） |
| 管理者のいない店舗の参加 | イベントの側の `addParticipationDirectly`、`changeParticipationByOccasion`、`excludeParticipant` |
| 管理者のいない店舗 → 店舗管理者のいる店舗 | `submitStewardshipClaim` の後の `approveStewardshipClaim`（F-04） |
| 個人がその店舗に行った進行中の申請 → `lapsed` | `reassessApplicationPremises`（`authority.steward_appointed`。F-08） |
| 店舗管理者のいる店舗の内容・掲載・参加の変更 | 店舗管理者の同じユースケースと、`changeParticipationByPlace`、`withdrawParticipation`、店舗として行う申請（`submitAffiliationChange`、`submitParticipation`） |
| 店舗管理者のいる店舗 → 管理者のいない店舗 | `resignStewardship`、`revokeSteward`、`withdraw`（F-04） |

- 営業状況の波及: `place.operating_status_changed` は、`to` が閉店のときだけ、その店舗とその掲載を紹介する公開中の読みものの編集担当者への通知になる（F-24）。営業状況は掲載の公開状態・提供状態を変えず、発見の場面と参照の場面の表示は `VisibilityPolicy` が読み取りの時点で決める
- 終端: 店舗は削除されず、終端を持たない。就任の前に作られた掲載・所属・参加は、就任の後も保たれ、店舗管理者の管理下に入る。就任の後のサービス運営者の代行と、イベントの側の参加内容の変更は `ForbiddenError`・`PLACE_HAS_STEWARD` になる
- 失敗時の扱い: 就任と、代行・直接の追加・個人の申請の承認との行き違いは防がない（成立した書き込みは保たれる）。就任の後に残った個人の進行中の申請は、再評価の消費か、承認の操作の前提の確認で失効する

## F-17 所属

- 対象: 店舗の所属の集合（`PlaceAffiliations`。集約の ID は `PlaceId`。所属と代表地域）
- トリガー: `submitAffiliationChange`（所属）の承認

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| 所属なし → 所属中 | `approveAffiliation`（地域運営者、不在ならサービス運営者、または代行。`region.affiliation_established`） |
| 所属中 → 所属なし（離脱） | `approveLeave`（`region.affiliation_dissolved`。`cause: "left"`） |
| 所属中 → 所属なし（除外） | `excludeAffiliatedPlace`（`cause: "excluded"`） |
| 代表地域: 選び直す | `chooseRepresentativeRegion`（店舗管理者だけ。代行はない） |
| 代表地域: 選んだ地域との所属が解除された → 最初に所属した地域 | `approveLeave`、`excludeAffiliatedPlace`（同じ書き込みの中で決まる） |

- 波及: `region.affiliation_established` は、同じ店舗とその地域への他の所属の申請を失効にする。`region.affiliation_dissolved` は、その所属の離脱の申請を失効にし（F-08）、`excluded` は店舗管理者への通知になる（不在ならサービス運営者に `proxy`）
- 終端: 所属の解除。解除した所属は記録に残らず、再度の所属は新しい所属として成立する。集約は削除せず、すべての所属が解除された店舗は空の集合を持つ。地域の公開の取り下げと運営による非公開は、所属を変えない
- 失敗時の扱い: 同じ店舗の所属の同時の変更（承認と除外、2つの承認）は、集約の楽観ロックと `ALREADY_AFFILIATED`・`NOT_AFFILIATED` が守り、承認の側がロールバックすれば申請は確認中のまま残る。その後の承認は前提を確かめて失効にする

## F-18 参加

- 対象: 参加（`Participation`。集約の ID はイベントと店舗の組。参加中の間だけ存在する）
- トリガー: `submitParticipation` の承認、または `addParticipationDirectly`

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → 参加中 | `approveParticipation`（店舗管理者のいる店舗）、`addParticipationDirectly`（店舗管理者のいない閲覧できる店舗）。`occasion.participation_established` |
| 参加中 → 参加中（添えた掲載・参加日の変更） | `changeParticipationByPlace`（店舗管理者のいる店舗）、`changeParticipationByOccasion`（店舗管理者のいない店舗）。`occasion.participation_changed` |
| 参加中 → 参加中（店舗管理者の就任・不在） | 状態は変わらない。変更できる側が替わる |
| 参加中 → 参加中（開催期間の更新で参加日が期間外になった） | 状態は変わらない。`Participation.visibleDates` が読み取りの時点で除く（F-20） |
| 参加中 → なし（取りやめ） | `withdrawParticipation`（`occasion.participation_dissolved`。`cause: "withdrawn"`） |
| 参加中 → なし（除外） | `excludeParticipant`（`cause: "excluded"`） |

- 波及: `occasion.participation_established` は、その店舗のそのイベントへの他の参加の申請を失効にする（F-08）。`participation_changed`（`changedBy: "place"`）と `participation_dissolved`（`withdrawn`）はイベント運営者への通知、`participation_dissolved`（`excluded`）は店舗管理者への通知になる
- 終端: 解除（集約の削除。取り消せない）。再び参加するときは新しい参加になる。イベントの公開の取り下げ・運営による非公開・中止・終了は、参加を変えない
- 失敗時の扱い: 申請の承認と直接の追加の同時の成立は、`insert` の一意性で後からコミットした側が `ConflictError` になり、承認の側なら申請は確認中のまま残って、その後の承認が失効にする。成立した後の同じ追加の送り直しは `ALREADY_PARTICIPATING`。取りやめと除外の同時の実行は、後の要求が `ConflictError` または `NotFoundError`。添えた掲載の削除と提供終了は参加を書き換えず、読み取りが扱う

## F-19 開催地域の関連づけ

- 対象: 関連づけ（`RegionLink`。集約の ID はイベントと地域の組。`linked`・`detached`）
- トリガー: `linkRegion`（イベントの側。閲覧できる地域だけ）

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → `linked` | `linkRegion`（`occasion.region_linked` → 地域運営者への通知） |
| `linked` → なし（あらためて関連づけられる） | `unlinkRegion`（イベントの側。ドメインイベントなし） |
| `linked` → `detached` | `detachRegionLink`（地域の側。`occasion.region_link_detached` → イベント運営者への通知） |
| `detached` → `linked`（`linkedAt` は変わらない） | `restoreRegionLink`（地域の側。ドメインイベントなし） |

- 終端: `unlinkRegion` による削除。`detached` の組は、イベントの側からは再び関連づけることも外すこともできず（`REGION_LINK_DETACHED`）、地域の側の `restoreRegionLink` だけが脱出になる。地域・イベントの公開の取り下げと運営による非公開は、関連づけを変えない
- 失敗時の扱い: 同じ組の同時の関連づけは、後の要求が `ConflictError`。外す操作と解除の同時の実行は、後の要求が `ConflictError` または `NotFoundError`。運営者が不在の地域・イベントでは、サービス運営者が代行する

## F-20 イベントの中止・延期・終了

- 対象: イベントの開催の状態（開催前・開催中・終了は、保存せず、開催期間と今日の暦日から求める。中止は `cancelled` として保存する）と、開催の状態の記録（`HoldingStatusLedger`。イベントごとに1つ）
- トリガー: `cancelOccasion`、`updateOccasionContent`（開催期間の更新）、日付の経過、スケジュール（日次）

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| 開催前・開催中・終了 → 中止 | `cancelOccasion`（`occasion.cancelled`） |
| 中止 → 開催期間と今日の暦日から決まる状態 | `revokeOccasionCancellation`（ドメインイベントなし） |
| 開催期間が替わる（延期。終了からの復帰を含む） | `updateOccasionContent`（`occasion.period_changed`） |
| 開催前 → 開催中 → 終了 | 日付の経過。保存された遷移を持たない |
| 記録と今日の状態が違う → 記録が今日の状態。今日が終了なら `occasion.ended` | `recordEndedOccasions`（記録の更新とドメインイベントを、イベント1件ごとの UnitOfWork で確定する） |

波及。

| ドメインイベント | 消費者と結果 |
| --- | --- |
| `occasion.cancelled` | `reassessApplicationPremises`（進行中の参加の申請が `lapsed`）。`deliverNotifications`（参加中の店舗ごとの店舗管理者、紹介する公開中の読みものの編集担当者） |
| `occasion.ended` | `reassessApplicationPremises`（同上）。`deliverNotifications`（編集担当者） |
| `occasion.period_changed` | `deliverNotifications`（参加中の店舗ごとの店舗管理者）。店舗管理者は `changeParticipationByPlace` で参加日を直す（F-18） |

- 終端: イベントは削除されず、終端を持たない。中止と中止の取り消しは何度でも行き来でき、延期または中止の取り消しで終了でなくなったイベントは、再び終了すると `occasion.ended` がもう一度出る。中止の取り消しの後も、失効した参加の申請は戻らない。中止・終了・延期は、参加と関連づけを変えない
- 失敗時の扱い: ジョブの1件の失敗は記録を変えず、次の実行がもう一度確かめる。2つのジョブの同時の実行で `occasion.ended` が重ねて出ても、再評価は冪等で、通知は `observedOn` から作るキーで1つになる。開催期間の更新で終了になったイベントの `occasion.ended` は次の実行で出て、それまでの間の参加の申請は、提出と承認が今日の開催の状態で確かめる。中止と中止の取り消しの同時の実行は、後の要求が `ConflictError`

## F-21 取り下げの申立て

- 対象: 申立て（`TakedownClaim`。`open`・`resolved`）、対象（掲載・店舗・地域・イベント・読みもの）の写真、申立人への結果のメール（`TakedownOutcomeMailer`）
- トリガー: `submitTakedownClaim`（ログインなし。提出の時点で閲覧できる対象だけ）

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → `open` | `submitTakedownClaim`（`takedown_claim.submitted` → サービス運営者への通知） |
| `open` のまま: 対象の写真の削除（写真がなくなった `published` の対象は `unpublished`（`photoTakedown`）。F-12） | `getTakedownClaim` で読んだサービス運営者の `takeDownListingPhotos`、`takeDownPlacePhotos`、`takeDownRegionPhotos`、`takeDownOccasionPhotos`、`takeDownArticlePhotos`（未対応の申立ての対象であることを確かめる。申立ては書き込まない） |
| `open` のまま: 対象の運営による非公開 | `suspendListing`、`suspendPlace`、`suspendRegion`、`suspendOccasion`（F-13） |
| 削除した写真 → 実体と記録の削除 | `discardReleasedPhotos`（`photos.released`。F-06） |
| 写真の削除 → 対象の管理者への通知（読みものは、すべての編集担当者） | `deliverNotifications`（`*.photos_taken_down`。`*.unpublished` は F-24） |
| `open` → `resolved`（措置の有無を問わず、結果を添える） | `resolveTakedownClaim`（`takedown_claim.resolved`） |
| `resolved`（送信の記録なし）→ 結果のメールが申立人に届く → `resolved`（送信の記録あり。`outcomeSentAt`） | `sendTakedownOutcome`（`takedown_claim.resolved`。`TakedownOutcomeMailer.send` の後に、送信の記録を保存する） |
| `unpublished`（`photoTakedown`）の対象 → `published` | 対象の管理者の `registerPhoto` → 内容の保存 → 公開（F-12。店舗は公開状態を持たず、写真がなくなっても公開が続く） |

- 終端: `resolved`。申立ては削除しない。申立人に受け付けのメールと、状況を確かめる手段はない。対象が対応の前に削除されても申立ては `open` のまま残り、`resolveTakedownClaim` で終える
- 失敗時の扱い
  - 写真の削除と、申立てを対応済みにする操作は、別の UnitOfWork で確定する。対応済みにする操作のロールバックで、写真の削除と非公開は戻らず、申立ては `open` のまま残って対応し直せる
  - 写真の削除は、申立てが対応済み、対象がこの申立ての対象でない、写真がすでに外れている場合に `BusinessRuleError`。対応済みにする操作は版を含めず、すでに対応済みなら `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`。別のサービス運営者が先に終えた）、同時の保存は `ConflictError`
  - 結果のメールを送れなければ、消費は `SystemError` で終わり、リレーが再び配送する。送信の記録のある申立ての再配送は、メールを送らない。送信の引き受けの後に記録の保存が成立しなかった場合は、再配送で同じメールがもう1通届きうる（少なくとも1回の配送として許容する）。送信の失敗で、申立ての対応済みは取り消さない
  - `takedown_claim.resolved` が再配送の上限に達すると、申立ては `resolved` のまま、結果のメールは届いていない。送信は DLQ からの再投入で進み、ほかに送り直す主体はない
  - 削除した写真の実体の削除が進まない場合は F-06 による

## F-22 情報の誤り・閉店の連絡

- 対象: 連絡（`InfoReport`。`open`・`confirmationRequested`・`resolved`）。店舗管理者のいる店舗と、その掲載が対象
- トリガー: `submitInfoReport`（ログインした利用者）

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| なし → `open` | `submitInfoReport`（`info_report.submitted` → サービス運営者への通知） |
| `open` → `confirmationRequested` | `requestInfoReportConfirmation`（依頼の時点で店舗管理者がいること。`info_report.confirmation_requested` → その店舗のすべての店舗管理者への通知） |
| `confirmationRequested` のまま: 店舗管理者が確かめて直す | `listConfirmationRequestsForPlace`・`getConfirmationRequest` で読んだ店舗管理者の `updatePlaceProfile`、`changeOperatingStatus`、`updateListing`（連絡は書き込まない） |
| `confirmationRequested` のまま: 店舗管理者の対応がない | サービス運営者の `revokeSteward` → 管理者不在（F-04）→ 代行での `updatePlaceProfile`・`changeOperatingStatus`・`updateListing`（連絡は書き込まない） |
| `open` → `resolved`（依頼せずに終える） | `resolveInfoReport` |
| `confirmationRequested` → `resolved` | `resolveInfoReport`（サービス運営者が、店舗と掲載の現在の内容を見て判断した時期） |

- 終端: `resolved`。連絡は削除せず、期間を持たない。対応済みは、連絡した人にも店舗管理者にも通知しない。連絡の後に店舗管理者が不在になっても、連絡した人が退会しても、対象の掲載が削除されても、連絡は残り、`resolveInfoReport` で終える
- 失敗時の扱い: 状態を変える要求は版を含めず、すでにその状態なら状態の `BusinessRuleError`（別のサービス運営者が先に依頼した、または終えた）、同時の保存は `ConflictError`。ロールバックでは連絡の状態は変わらず、依頼の通知は出ない。依頼の時点で店舗管理者が不在なら `INFO_REPORT_PLACE_WITHOUT_STEWARD` で、サービス運営者が代行で直して `open` から終える。依頼の通知の失敗は F-23 の再配送による

## F-23 通知とメールの配送

- 対象: 通知（`Notification`。状態を持たない。`occurrenceKey` と宛先の組で一意）と、通知のメール（文面と行き先は `NotificationMailRenderer` が組み立て、`Mailer` は送るだけ。送信済みの記録は `MailDispatchLedger` が `occurrenceKey` と送り先の組で一意に持つ）
- トリガー: 末尾の表で `deliverNotifications` が消費するドメインイベント

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| ドメインイベント → 告知（0個以上。事実を読んで取り出す。`category.retired` は、廃止したカテゴリーの掲載を持つ店舗ごとに1つ） | `deliverNotifications` |
| 告知 → 宛先（消費の時点の管理体制・名簿で決める。管理者不在の対象はサービス運営者に `proxy`。存在しないアカウントは外す） | `deliverNotifications` |
| 告知 → 宛先のアカウントごとの通知（告知1つごとの UnitOfWork） | `deliverNotifications`（`NotificationRepository.deliverAll`） |
| 通知の記録のコミットの後 → 宛先ごとのメール（アカウントのない招待の宛先はメールだけ）→ 送信済みの記録 | `deliverNotifications`（`MailDispatchLedger.findDispatched` で送信済みの記録のない送り先を求め、その送り先にだけ、`NotificationMailRenderer.render` の結果を `Mailer.send` に渡す。送信が成立した送り先ごとに、`MailDispatchLedger.record` を1つの UnitOfWork で確定する。送信は UnitOfWork の外） |
| 通知 → 読まれる | `listNotifications`（指す先がなくなった参照は名称なしで返す） |
| 通知 → 削除 | `purgeNotificationsOnWithdrawal`（`account.withdrawn`） |

- 終端: 通知は、宛先のアカウントの退会まで残る。既読・保持期間を持たない。宛先が後から管理権限・役割を失っても、指す対象が閲覧できなくなっても残り、進んだ先の操作が可否を確かめる
- 失敗時の扱い
  - すべての告知の記録と送信が成立したときだけ、消費は成功になる。1つでも失敗すれば消費は失敗になり、リレーが同じドメインイベントを再び配送する。1つの宛先・1つの告知の失敗は、他の宛先・他の告知を止めない
  - 記録の前の失敗は、通知もメールも残さず、再配送が最初から行う。通知の記録の後の失敗は、サービス内の通知を残し、再配送が送信済みの記録のないメールだけを送る。同じキーの2回目の通知の記録は、何もせずに成功になる。送信の引き受けの後に送信済みの記録が成立しなかった場合は、再配送で同じメールがもう1通届きうる（少なくとも1回の配送として許容する）。消費の前にドメインイベントを処理済みとして記録しない
  - メールが引き受けられないまま再配送の上限に達すると、サービス内の通知だけが残り、利用者は通知一覧で確かめる。届いていないメールは、DLQ からの再投入で送られる
  - 宛先は消費のたびに決め直す。再配送までに管理者・役割を持つ人が替わっていれば、新しい宛先にも届き、先に届いた通知は取り消さない
  - 最後の店舗管理者の退会・辞任・解除で失効した申請の通知は、消費の時点で店舗管理者が不在なので、サービス運営者に `proxy` で届く
  - 退会による通知の削除の後に、退会したアカウントを宛先にする告知が消費されても、存在しないアカウントは宛先から外れる。宛先を確かめた後に退会したアカウントの通知は残るが、`AccountId` は再び使われず、どの通知一覧にも現れない
  - 日次のジョブが重ねて出したドメインイベント（提供終了、イベントの終了、期間超過）は、内容から作るキーで1つの通知になる

## F-24 紹介先の変化

- 対象: 公開中の読みものと、その紹介先（掲載・店舗・地域・イベント）
- トリガー: 紹介先のドメインイベント。掲載は `listing.suspended`・`listing.unpublished`・`listing.deleted`・`listing.offering_ended`、店舗は `place.suspended`・閉店の `place.operating_status_changed`（その店舗の掲載の紹介にも及ぶ）、地域は `region.suspended`・`region.unpublished`、イベントは `occasion.suspended`・`occasion.unpublished`・`occasion.cancelled`・`occasion.ended`

| 遷移元 → 遷移先 | 実行主体 |
| --- | --- |
| 紹介先のドメインイベント → その紹介先を紹介する、消費の時点で公開中の読みもの | `deliverNotifications`（`ArticleRepository.findPublishedByShowcases`） |
| 読みものと紹介先の組 → すべての編集担当者への通知 | `deliverNotifications`（F-23） |
| 通知 → 紹介内容の修正、または公開の取り下げ | 編集担当者の `getArticleForEditing`（紹介先の現在の状態を読む）→ `reviseArticle`、`unpublishArticle` |

- 終端: 通知が届いた状態。読みものは書き換えない。閲覧できない紹介先は、`readArticle` が読み取りの時点で除く。下書きと公開を取り下げた読みものには通知しない。運営による非公開の解除、再公開、提供中への復帰、中止の取り消しは通知にならない
- 失敗時の扱い: F-23 による。編集担当者が0人なら、宛先なしで成立する

## 日次のジョブ

| ジョブ | 対象と処理 | フロー |
| --- | --- | --- |
| `purgeClosedLoginChallenges` | 使用済み・誤入力の上限・有効期限切れのログインの確認を削除する | F-01 |
| `sweepUnownedPhotos` | 保持期間を過ぎた持ち主のない写真と、削除の途中で残った写真を削除する | F-06 |
| `notifyOverdueReviews` | 代行できるようになった申請の `application.review_overdue` を出す | F-10 |
| `detectEndedOfferings` | 公開中の掲載の提供終了の `listing.offering_ended` を出す | F-14 |
| `recordEndedOccasions` | 終了に変わったイベントの `occasion.ended` を出す | F-20 |

ジョブどうしに順序の依存はない。どのジョブも、保存された状態と現在時刻だけで対象を決め、繰り返し実行しても結果は同じになる。

## ファイル・外部リソース

| リソース | 生成 | 参照 | 削除 |
| --- | --- | --- | --- |
| 写真の実体（`PhotoStorage`） | `registerPhoto`（`put`）、`duplicatePhotos`（`copy`） | 写真を返す読み取りのユースケース（`displayRefs`） | `discardReleasedPhotos`、`sweepUnownedPhotos`（`delete`） |
| ログイン用のメール（`LoginMailSender`） | `startEmailLogin` | `completeLoginByLink`、`completeLoginByCode`（リンクの鍵とコード） | 送ったメールは取り消さない。ログインの確認の無効と削除が、リンクとコードを使えなくする（F-01） |
| 通知のメール（`NotificationMailRenderer`、`Mailer`） | `deliverNotifications` | メールの行き先は、サービス内の通知と同じ画面 | 送ったメールは取り消さない。重複は、`MailDispatchLedger` の送信済みの記録の一意性が防ぐ（F-23） |
| 申立人への結果のメール（`TakedownOutcomeMailer`） | `sendTakedownOutcome` | なし | 送ったメールは取り消さない。重複は、申立ての送信の記録が防ぐ（F-21） |
| 端末の保存（ブラウザ） | 端末の側 | `mergeDeviceBookmarks` の入力 | 合流の成立を受けた端末の側（F-02） |

## ドメインイベントと消費者

ドメインイベントは50種。すべてに消費者のユースケースがあり、すべての消費者に出す主体がある。

| ドメインイベント | 出す主体 | 消費者のユースケース |
| --- | --- | --- |
| `account.withdrawn` | `withdraw` | `purgeBookmarksOnWithdrawal`、`withdrawApplicationsOfWithdrawnAccount`、`purgeNotificationsOnWithdrawal` |
| `authority.invitation_issued` | `inviteMember` | `deliverNotifications` |
| `authority.steward_appointed` | `acceptInvitation`、`approveStewardshipClaim`、`grantStewardship` | `reassessApplicationPremises`、`deliverNotifications` |
| `authority.steward_removed` | `resignStewardship`、`revokeSteward`、`withdraw` | `deliverNotifications` |
| `authority.stewardship_vacated` | 同上（最後の管理者） | `reassessApplicationPremises` |
| `authority.role_granted` | `grantRole` | `deliverNotifications` |
| `authority.role_revoked` | `revokeRole`、`withdraw` | `deliverNotifications` |
| `application.submitted` | 提出のユースケース（7つ） | `deliverNotifications` |
| `application.resubmitted` | `resubmitApplication` | `deliverNotifications` |
| `application.withdrawn` | `withdrawApplication`、`withdrawApplicationsOfWithdrawnAccount` | `deliverNotifications`、`reassessApplicationPremises` |
| `application.returned` | `sendBackApplication` | `deliverNotifications` |
| `application.approved` | 承認のユースケース（8つ） | `deliverNotifications` |
| `application.rejected` | `rejectApplication` | `deliverNotifications`、`reassessApplicationPremises` |
| `application.lapsed` | `reassessApplicationPremises`、`resubmitApplication`、承認のユースケース（前提を欠く場合） | `deliverNotifications` |
| `application.review_overdue` | `notifyOverdueReviews` | `deliverNotifications` |
| `place.operating_status_changed` | `changeOperatingStatus`、`approvePlaceRevision` | `deliverNotifications` |
| `place.suspended` | `suspendPlace` | `deliverNotifications` |
| `place.unsuspended` | `unsuspendPlace` | `deliverNotifications` |
| `place.photos_taken_down` | `takeDownPlacePhotos` | `deliverNotifications` |
| `listing.unpublished` | `unpublishListing`、`takeDownListingPhotos` | `deliverNotifications` |
| `listing.suspended` | `suspendListing` | `deliverNotifications` |
| `listing.unsuspended` | `unsuspendListing` | `deliverNotifications` |
| `listing.photos_taken_down` | `takeDownListingPhotos` | `deliverNotifications` |
| `listing.deleted` | `deleteListing` | `reassessApplicationPremises`、`deliverNotifications` |
| `listing.offering_ended` | `detectEndedOfferings` | `deliverNotifications` |
| `category.retired` | `retireCategory` | `deliverNotifications` |
| `region.unpublished` | `unpublishRegion`、`takeDownRegionPhotos` | `deliverNotifications` |
| `region.suspended` | `suspendRegion` | `deliverNotifications` |
| `region.unsuspended` | `unsuspendRegion` | `deliverNotifications` |
| `region.photos_taken_down` | `takeDownRegionPhotos` | `deliverNotifications` |
| `region.affiliation_established` | `approveAffiliation` | `reassessApplicationPremises` |
| `region.affiliation_dissolved` | `approveLeave`、`excludeAffiliatedPlace` | `reassessApplicationPremises`、`deliverNotifications` |
| `occasion.period_changed` | `updateOccasionContent` | `deliverNotifications` |
| `occasion.unpublished` | `unpublishOccasion`、`takeDownOccasionPhotos` | `deliverNotifications` |
| `occasion.cancelled` | `cancelOccasion` | `reassessApplicationPremises`、`deliverNotifications` |
| `occasion.ended` | `recordEndedOccasions` | `reassessApplicationPremises`、`deliverNotifications` |
| `occasion.suspended` | `suspendOccasion` | `deliverNotifications` |
| `occasion.unsuspended` | `unsuspendOccasion` | `deliverNotifications` |
| `occasion.photos_taken_down` | `takeDownOccasionPhotos` | `deliverNotifications` |
| `occasion.participation_established` | `approveParticipation`、`addParticipationDirectly` | `reassessApplicationPremises` |
| `occasion.participation_changed` | `changeParticipationByPlace`、`changeParticipationByOccasion` | `deliverNotifications` |
| `occasion.participation_dissolved` | `withdrawParticipation`、`excludeParticipant` | `deliverNotifications` |
| `occasion.region_linked` | `linkRegion` | `deliverNotifications` |
| `occasion.region_link_detached` | `detachRegionLink` | `deliverNotifications` |
| `article.photos_taken_down` | `takeDownArticlePhotos` | `deliverNotifications` |
| `takedown_claim.submitted` | `submitTakedownClaim` | `deliverNotifications` |
| `takedown_claim.resolved` | `resolveTakedownClaim` | `sendTakedownOutcome` |
| `info_report.submitted` | `submitInfoReport` | `deliverNotifications` |
| `info_report.confirmation_requested` | `requestInfoReportConfirmation` | `deliverNotifications` |
| `photos.released`（共有カーネル） | F-06 の「手放された」の行のユースケース | `discardReleasedPhotos` |

- `deliverNotifications` は、条件に当たらないドメインイベント（招待の承諾による就任、辞任・退会による解除、閉店でない営業状況の変更、イベント運営者による参加内容の変更、離脱の承認による所属の解除）を、告知なしで成功にする
- Area、Media、Bookmark、Discovery、Notification はドメインイベントを出さない。Discovery はドメインイベントを消費しない
