# 動的フローの候補（usecases の書き手からの申告の集約）

重なりをまとめ、`spec/flows/index.md` の台帳にする入力。ユースケース名は camelCase に統一済みなので、`spec/usecases/*.md` の現在の名前で書く。

## アカウント・権限

- メールアドレスでのログイン: startEmailLogin → completeLoginByLink / completeLoginByCode（誤入力の回数、一方を使うと他方も無効、有効期間）→ Bookmark の mergeDeviceBookmarks → purgeClosedLoginChallenges（日次）
- 外部アカウントでのログイン: loginWithExternalAccount → mergeDeviceBookmarks
- 退会: previewWithdrawal → （後任の inviteMember）→ withdraw → `account.withdrawn` の消費（Authority の sweepWithdrawnAccount、Bookmark の purgeBookmarksOnWithdrawal、Application の個人の申請の取り下げ、Notification の通知の削除）、`authority.stewardship_vacated` → Application の前提の再評価。退会と就任の競合を含む
- 管理メンバーの招待: inviteMember → 通知（アカウントのない宛先はメールだけ）→ checkInvitation → acceptInvitation → `authority.steward_appointed` → Application の前提の再評価。招待した管理者の辞任・退会の後の承諾、cancelInvitation との競合
- 引き継ぎと管理者不在: inviteMember → resignStewardship / revokeSteward → 管理者不在 → サービス運営者の代行と招待の取り消し → acceptInvitation / grantStewardship で再び管理者がいる状態へ
- 役割: establishFirstOperator、grantRole、revokeRole、withdraw。最後のサービス運営者の保護

## 写真

- 写真のライフサイクル: registerPhoto → 各ドメインの保存・申請の提出で持ち主を設定（claimAll）→ 申請の承認で付け替え（transferAll）→ `photos.released` → discardReleasedPhotos。持ち主のない写真は sweepUnownedPhotos（日次）
- 掲載の複製: duplicatePhotos → duplicateListing。成立しなければ sweepUnownedPhotos

## 申請

- 登録申請と併せた管理権限の申請: submitPlaceRegistration → approvePlaceRegistration → approveStewardshipClaim。登録の否認・取り下げ → 併せた申請の失効
- 差し戻しと再提出の往復（代行の期間の数え直し）
- 前提の再評価による失効と、承認時の前提の確認の競合（結果整合・再配送）
- 店舗管理者の就任・不在による一括の失効
- 代行: notifyOverdueReviews（日次）→ 対応を待つ申請の一覧（代行できる申請）→ 承認・否認。運営者の判断との競合
- カテゴリーの廃止: retireCategory → `category.retired` → Listing の付け替えの消費者、Application の申請の内容の付け替え → 店舗ごとにまとめた通知
- 提出前の確認から提出まで（冪等な再送を含む）

## 店舗・掲載

- 代理登録から店舗本人への引き継ぎ
- 営業状況の変更の波及（通知、発見の場面と参照の場面）
- 店舗の非公開と解除、重複する店舗の整理
- 提供終了の検出と通知: endListingOffering または期日の経過 → detectEndedOfferings（日次）→ `listing.offering_ended` → 通知。先に提供中へ戻した掲載は出さない
- 掲載の削除と修正の申請の失効: deleteListing → `listing.deleted` → Application、`photos.released` → Media
- 保存してからの公開（掲載・地域・イベント・読みものに共通。2つの UnitOfWork。公開が成立しなくても保存は残る）

## 地域・イベント

- 除外と離脱申請の失効（代表地域も替わる）
- 地域・イベントの登録から運営者の就任まで（就任の後は代行が ForbiddenError）
- 参加の申請の承認による参加の成立と、直接の追加との同時実行
- 中止・終了と参加の申請の失効: cancelOccasion、recordEndedOccasions（日次）。中止の取り消しの後も失効した申請は戻らない
- 延期: `occasion.period_changed` → 通知 → 参加内容の変更。期間外の参加日の非表示。終了からの復帰
- 開催地域の関連づけ・解除・解除の取り消し（同時実行を含む）
- 直接の追加から店舗管理者の就任後の引き継ぎ

## 申立て・連絡・運営による非公開

- 申立ての受け付けから結果のメールまで（メールの送信失敗と再配送）
- 申立てに基づく写真の削除から再公開まで（対象ごとの写真の削除 → Media の削除と通知 → 申立てを対応済みにする操作は別の UnitOfWork → 写真の登録 → 保存 → 公開。運営による非公開の間の最後の写真の削除を含む）
- 連絡の受け付けから対応済みまで（確認の依頼、店舗管理者の更新、サービス運営者が対応済みにする）
- 店舗管理者の対応がない場合（権限の解除 → 管理者不在 → 申請の失効 → 代行での更新 → 対応済み）
- 運営による非公開と解除（その間の公開状態の変更の拒否）

## 通知

- 出来事から通知とメールが届くまで（失敗と再配送。重複の防止は deliverAll と Mailer.send のキーの一意性）
- 最後の店舗管理者の退会・辞任・解除から、サービス運営者への失効の通知まで
- 退会と通知の削除（同時の配送との前後）
- 日次のジョブの重なりと通知の一意性（提供終了、イベントの終了、期間超過）
- 紹介先の変化の通知（対象のドメインイベント → 紹介している公開中の読みもの → 編集担当者）

## 閲覧・保存

- ログインと端末の保存の合流（失敗したら同じ一覧で送り直す）
- 保存一覧の解決（閲覧できなくなった保存）
- フィードの続きの読み込み（ページの間の一貫性）
- 公開状態の変更の即時反映と、開くまでの間に閲覧できなくなる場合
