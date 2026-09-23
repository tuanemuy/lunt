# 1周目の直しで「範囲の外」として返ってきた依頼の集約

直しが全部終わってから、担当ごとにまとめて依頼する。

## Article+Moderation+Bookmark の担当から

- index.md: 参照整合性の規則を「保存の条件にするかどうかは各ポートが定める。条件にする場合はユースケースが確かめる」に。版を持たず書き込みが冪等な記録のポート（Bookmark）の扱いを共通の契約に足す。「ID の昇順」はコードポイント順。「申立てに基づく写真の削除」の節に統一の形を1か所で定める。開発の順序に段階2の Moderation が扱う対象の種類を示す
- discovery.md: Moderation の名称の解決元は対象のドメインのリポジトリ（576行付近）。`ReferenceQueries.resolve` を入力の全件に対する直和型に。`Card` の語彙の見直し。`testcases/discovery/resolveReferences.md` に AC-07・AC-20・AC-42 を添える
- flows/index.md: listBookmarks は参照を返す（76行付近）。旧名 removeArticlePhotoByTakedown（303・609行付近）。メールの重複の防止は outcomeSentAt の記録（470〜477・555行付近）。F-21・F-22 の ConflictError
- testcases/media/discardReleasedPhotos.md: 旧名（10行付近）
- scenario/moderation.md（1-2: MOD-02 の対応を終えた後の次の操作）、scenario/keep.md（2-2:「同じ行に残る」は UI パターン寄り）

## Region+Occasion の担当から

- index.md: 共有カーネルに `Publication` と `Suspension` の組を受ける `Publication.publish`・`unpublish`（公開条件の不足の一覧を受け取り、判定順「運営による非公開 → 不正な遷移 → 公開条件」を持つ）と `Suspension.suspend`・`unsuspend` を置く。コードはドメイン別（`{対象}_SUSPENDED`・`_ALREADY_SUSPENDED`・`_NOT_SUSPENDED`・`_PUBLISH_CONDITION_UNMET`）。「閲覧できる対象」に、書き込みのユースケースは読んだ集約に VisibilityPolicy の述語を当てる、と書く
- 操作の可否の確認は UnitOfWork を始める前に行う（読み取りを終えてから書き込む）で全ドメイン統一: usecases/authority.md 26行付近、usecases/listing.md 47・54行付近、usecases/place.md 23行付近が「同じ UnitOfWork の中」と書いている
- authority: `act_as_place` を足す（Account+Authority の再直しに依頼済み）
- listing.md: `Listing.attachableIds(listings, placeId, today)` を定義する（添えられる掲載の規則の唯一の置き場所）
- usecases/application.md 267行付近: submitParticipation の添えられる掲載の規則を `Listing.attachableIds` に。RQ-07 の候補は Occasion の `listAttachableListings`
- discovery.md 577行付近: Occasion が isViewable を使うと書いた行を消す
- flows/index.md: liftRegionSuspension・liftOccasionSuspension（323・593・602行付近）を新しい名前に。chooseRepresentativeRegion の「不在ならサービス運営者」（393行付近）を消す
- spec/index.md: 自分でスクリプトで作り直す

## Account+Authority の担当から

- flows/index.md: sweepWithdrawnAccount への参照をなくす（91・99・127・142・156・158・159・564・567・570行付近）。authority.role_revoked の発行元から establishFirstOperator を外す。就任・付与の遷移に相手のアカウントの版の更新（Account.markReferenced）を足す
- usecases/application.md（785行付近）と domains/application.md（571行付近）: 管理権限の申請の承認に `Account.markReferenced` と `accountRepository.save` を同じ UnitOfWork で足す
- usecases/application.md（514行付近）と usecases/place.md（99・103行付近）: findAllBySteward → findPageBySteward（すべてのページを読む）
- index.md「ドメインイベントの名前」: 段落の前半（主語はドメイン名か集約名）と後半（`listing.category_retired` などの例）が矛盾していれば、後半を削る（イベント名は変えない決定が正）
- index.md の依存の表: Authority は Account のドメインイベントを消費しなくなった（sweep をなくした）→ Authority の行を「なし」に戻す

## Area+Place+Listing+Media の担当から

- index.md: 共有カーネルに `RevisedPhotos<P>`（between・overlay・addedPhotoIds）を定義する（place.md と listing.md が参照）。運営の検索のキーワードの正規化の契約を Region・Occasion の search にも当てる（共有カーネルに正規化を置く）
- Application: カテゴリーの廃止は読み取りの `resolve` だけで実現し、書き込みの付け替えをなくした → `replaceRetiredCategoryInApplications` と `Application.replaceCategory` を削除（testcases/application/replaceRetiredCategoryInApplications.md、ports/applicationRepository.md 69行付近）。ValidationError（usecases/application.md 147・180行付近）。掲載の修正の申請の承認は applyPatch の新しいシグネチャ（facts なし）に
- Notification: `listing.category_reassigned` の消費を `category.retired` の消費に替える（domains/notification.md 379行付近、testcases/notification/deliverNotifications.md 83〜84行、listNotifications.md 21行。読み取りは predecessorsOf と ListingRepository.findPageByCategories）
- flows/index.md: F-11（285〜287行）とドメインイベントの表（582〜590行）の旧名と付け替え。303行の removeListingPhotoByTakedown。開設の手順に provisionInitialCategories
- Discovery: 「申請の判断での店舗の照合」は searchPlacesForOperation（domains/discovery.md 575行、usecases/discovery.md 33行）
- pages/shop.md 124行: 運営による非公開の状態で「複製を示さない」→ 複製できる（LST-09 と合わせる）

## 体験側（scenario+pages）の担当から

- testcases/listing/suspendListing.md 8行付近: 「複製は LISTING_SUSPENDED で成立しない」→ 複製できる（duplicateListing.md・domains/listing.md と合わせる）
- usecases/application.md の申請の詳細の読み取り: 再申請の初めの内容から写真を除く。終わった申請の内容の表示に写真を含めない（Application の再直しに依頼済み。結果を確かめる）
- 確かめる: 申請の承認・取り下げで、先に判断・取り下げ済みは状態のエラー（CS-08）、再提出で内容が変わった場合だけ ConflictError（CS-07）。状態を変える操作が版を含めていないこと
- pages の決定: SM-01 から店舗の選択をなくした（MY-01 と管理ナビゲーションが担う）。検索の入口は5つのタブ画面。CF-08「公開状態の操作」を新設。共通の状態の「当てはまる画面」の列をなくし、各画面が宣言する

## Discovery+Notification の担当から

- pages/index.md の DT-02 の地域の行: 「代表地域を先頭に」→「一覧に示す地域を先頭に」
- Bookmark: listBookmarks は参照を返すだけ（Bookmark の再直しで対応済みのはず。確かめる）。domains/bookmark.md の「サーバーに送らない」、usecases/bookmark.md の ValidationError の残り
- flows/index.md F-23 に MailDispatchLedger・NotificationMailRenderer の名前を足す。findInitialMapExtent → findMapExtent、readMapPins → readMapCells
- Discovery の改名: findMapExtent / readMapCells / findPlaceCells / resolveReferences（新設）。新しいポート: MailDispatchLedger、NotificationMailRenderer

## flows+index の担当から（index.md が正）

- 読み取りの位置: index.md は「集約のリポジトリからの読み取りは、書き込みと同じ `run` の中で、書き込みの前に終える」（テンプレートのユースケースと同じ形）。Region・Occasion の usecases（usecases/occasion.md 48・346行付近、usecases/region.md 236行付近）を「UnitOfWork を始める前」から index に合わせ直す。authority/listing/place の「同じ UnitOfWork の中」はそのままでよい
- 閲覧できるかの求め方: `ContentRef` で受けるユースケース（保存、申立て、連絡、申請）は `ReferenceQueries.isViewable`。特定の種類の集約を自分で読むユースケース（直接の追加、開催地域の関連づけ、店舗の所属地域の状況）は読んだ集約に `VisibilityPolicy` の述語を当てる
- Place: testcases/place/matchPlaces.md に AC-56（対応済みのはず）。place.md に UnitOfWorkContext の `placeRepository`。PlaceMatching.normalize は共有カーネルの `TextNormalization.normalize` を使う
- Listing・Region・Occasion の運営の検索の契約は `TextNormalization.normalize` で定める
- Listing・Article・Place（・Region・Occasion）: publish・unpublish・suspend・unsuspend・takeDownPhotos を共有カーネルの関数（Publication.*・Suspension.*・PhotoSet.takeDown）を使う形にする
- Article: `Article.create` の id の型を ArticleId に
- Application: checkSubmissionEligibility のテストケースに AC-56。参加の成立による失効に I-19
- ポートのエラーの列挙から SystemError を外す（Application など残り）
