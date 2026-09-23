# 独立した読み 1: flows・domains/index・unitOfWork・層とドメインの突き合わせ

区分: `spec/domains/index.md`、`spec/flows/index.md`、`spec/testcases/ports/unitOfWork.md`、`spec/index.md`、層と層・ドメインとドメインの突き合わせ。

読んでいる間に `spec/index.md`・`spec/domains/index.md`・`spec/flows/index.md`・`spec/domains/place.md`・`spec/ledger.md` が更新された。下の反例は、書き出しの直前にすべて現在のファイルで引用を確かめ直した。行番号はその時点のもの。

## 突き合わせの結果（反例にならなかったもの）

反例の有無を決めた機械的な突き合わせ。成立の認定ではなく、どこを比べたかの記録。

- ユースケース 178 件: `usecases/*.md` の一覧表・見出し、`testcases/${domain}/*.md`、`spec/index.md` のリンクが 1:1 で一致。`spec/index.md` のリンク 274 件に切れたリンクはなく、リンクされていない spec のファイルもない
- ドメインイベント 51 種: 型名が domains・usecases・flows・testcases で一致。flows の「ドメインイベントと消費者」の表の消費者は、各ドメインの「ドメインイベント」の節、`domains/notification.md` の対応表、`testcases/notification/deliverNotifications.md`、`testcases/application/reassessApplicationPremises.md` と一致
- usecases・flows・testcases が引くポートメソッドと振る舞い（`Xxx.yyy` の形の 373 組）は、すべて domains に定義がある。エラーコードと定数も、すべて domains に定義がある
- flows が引くユースケース名はすべて usecases にある。flows に現れないユースケースは、読み取りと、単一のユースケースで閉じるもの（`addCategory`、`renameCategory`、`provisionInitialCategories`）だけ
- シナリオの ID 114 件は、すべて pages と usecases の「実現する」に現れる。画面の ID 57 件は、`RQ-01`（操作を持たない案内）を除いて usecases に現れる。下流が引く未定義のシナリオ ID・画面 ID・CS/CF はない
- 依存方向の表と実際の参照: ドメインのファイルに現れる他ドメインの型は、どれもユースケースが事実として読んで渡す記述（`ReferenceQueries.isViewable`、`StewardshipRepository.findById` など）の中にあり、エンティティ・値オブジェクト・ポートのシグネチャが表にない依存を持つ箇所は見つからなかった
- flows の「失敗時の扱い」22 か所を testcases と突き合わせ、対応するケースがあった

## 条件 1 要求を取りこぼしていない

### 1-1 AC-56 がどのテストケースにも添えられていない

- 引用（契約「体験の確認基準」）: 「AC-01〜AC-80 は関連要件の確認基準（文面は REQ 12）。各 AC は、関連要件の辿り先の testcases で確認できる」「AC-56: M-01、M-02、B-04」
- 引用（`spec/requirements.md` AC-56）: 「店舗詳細と店舗向け案内から、管理権限の申請に進める。申請の前に、店名・住所で既存店舗を確認できる」
- 落ちている場所: `spec/testcases/` のどのファイルにも `AC-56` が現れない（他の 79 件は1件以上のケースに添えられている）。scenario は `scenario/shop.md` の SHP-01・SHP-02 が AC-56 を引いている。内容に当たるケースは `testcases/place/matchPlaces.md` の先頭3行（店名・住所の照合）と `testcases/discovery/viewPlace.md`（店舗管理者の有無を添える）にあるが、AC-56 を添えたケースがなく、「管理権限の申請に進める」（管理者の有無に応じて `checkSubmissionEligibility` が始められると返す）を AC-56 として確かめるケースがない

## 条件 2 足しすぎていない

### 2-1 参加の成立による参加申請の失効（契約 P-77 の7つの外）

- 引用（契約 P-77）: 「失効の場合は次の7つ」（a〜g。参加申請は g「参加申請の対象のイベントが終了または中止した」だけ）
- 引用（`flows/index.md` F-08）: 「`occasion.participation_established`（`approveParticipation`、`addParticipationDirectly`）| その店舗 | その店舗のそのイベントへの参加の申請」
- 引用（`domains/application.md`「消費するドメインイベント」）: 「`occasion.participation_established` | Occasion | その店舗に関わる進行中の申請を再評価する」（他の行はすべて P-77 の項を添えているが、この行だけ引用元がない）
- 内容: 8つ目の失効の場合。上流は `scenario/index.md`「申請の前提」の「参加 | …その店舗の参加がまだない」までで、契約に引用元がない。I-10（同じ店舗・同じイベントの進行中の参加申請は1つ）と、直接の追加が管理者のいない店舗に限られること（E-11）から、この失効に到達するのは P-77 b（管理者不在）と重なる行き違いだけ。提出を拒む条件（すでに参加中）としては要るが、失効の原因・消費者・テストケース（`reassessApplicationPremises`）としては契約に辿れない
- 補足: 離脱申請が「離脱の承認」による解除でも失効する点（F-08「`region.affiliation_dissolved`（`approveLeave`、`excludeAffiliatedPlace`）」）も、契約 P-77 f は「除外で解除された」だけを挙げる。こちらは P-75（別の申請者の離脱申請が並ぶ）から到達でき、失効にしなければ申請が終端に達しないので、反例には数えない

## 条件 3 Issue をまたぐ決定が決まりきっている

### 3-1 F-11: カテゴリーの `active` に入る遷移がない

- 引用（`flows/index.md` F-11）: 「対象: カテゴリーの台帳（`CategoryCatalog`。カテゴリーは `active`・`retired`）」「トリガー: `retireCategory`」。遷移の表は「カテゴリー: `active` → `retired`」から始まる
- 欠けているもの: 状態 `active` に入る遷移と実行主体（`provisionInitialCategories`、`addCategory`）。他のフロー（F-12 の「トリガー: 下書きの作成（…）」、F-16 の「なし → 管理者のいない店舗」）は生成の遷移を持つ。`provisionInitialCategories`（初期の4カテゴリー。B-45）は開設の手順で、`establishFirstOperator`（F-05 が「開設の手順の」と書く）と並ぶが、flows のどこにも現れない

### 3-2 unitOfWork の適合テストの1ケースが、示された例では組み立てられない

- 引用（`testcases/ports/unitOfWork.md`「楽観ロックの競合と一意性の違反」）: 「ID のほかの一意性をポートが担保する集約（例: 同じ店舗と地域の所属は1つ）| その一意性に反する2件を、別々の `run` で `insert` する | 後の `run` は `ConflictError` で拒否する」
- 引用（`domains/region.md` PlaceAffiliationsRepository）: 「一意性: 「同じ店舗と地域の所属は1つ」は集約の不変条件で、楽観ロックで守る。ポートは `PlaceId` の一意性だけを担保する」
- 内容: 例に挙げた一意性はポートが担保しないので、「その一意性に反する2件を `insert` する」は作れない（所属は `PlaceAffiliations` の中の要素で、`insert` の単位ではない）。ID のほかの一意性をポートが担保するのは `ApplicationRepository` の枠（`domains/application.md`「`ConflictError`（ID の重複、枠の一意性の違反、…）」）など。期待結果は例を差し替えれば決まるが、今の記述からは、どの集約で確かめるケースかが一意に決まらない（条件 4 の食い違いでもある）

## 条件 4 矛盾がなく、現在形で単体で読める

### 4-1 Moderation の状態を変える要求の競合: flows は版と `ConflictError`、usecases・testcases は版なしと `BusinessRuleError`

- 引用（`flows/index.md` F-21 失敗時の扱い）: 「対応済みにする操作は、読んだ時点の版と違えば `ConflictError`（別のサービス運営者が先に終えた）」
- 引用（`flows/index.md` F-22 失敗時の扱い）: 「状態を変える要求は、読んだ時点の版と違えば `ConflictError`（別のサービス運営者が先に依頼した、または終えた）」
- 引用（`usecases/moderation.md` 冒頭）: 「状態を変える要求（対応を終える、確認の依頼）は、版を含めない。すでにその状態であること（…）は、前提の変化として状態の `BusinessRuleError` で返し」。`resolveTakedownClaim`「入力: …版を含めない」
- 引用（`testcases/moderation/resolveTakedownClaim.md`）: 「サービス運営者 A と B が、同じ未対応の申立てを読んだ。B が先に対応を終えた | A が…対応を終える | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）」
- `domains/index.md`「編集の競合」（「状態を変えるだけの要求（公開、非公開、中止、対応済みなど）は版を含めず」）は usecases の側と一致する。食い違うのは flows の2か所

### 4-2 F-14 の通知のキーの元が `domains/notification.md` と違う

- 引用（`flows/index.md` F-14 失敗時の扱い）: 「通知は `occurredAt` の暦日から作るキーで1つになる」
- 引用（`domains/notification.md` 対応表）: 「`listing.offering_ended` | `by: "content"`。`token` は `observedOn`」。`testcases/notification/deliverNotifications.md` も「2つのジョブが同じ `observedOn` で重ねて確かめた」
- F-20 は「通知は `observedOn` から作るキーで1つになる」で一致している。F-14 だけが違う

### 4-3 「集約のリポジトリは `TransactionalRepository` を拡張する」と、拡張しない集約ルートのリポジトリ

- 引用（`domains/index.md`「リポジトリの共通の契約」）: 「集約のリポジトリは `TransactionalRepository<TEntity, TId>` を拡張する。」例外として挙げるのは「全体で1つ、または決まった少数しかない集約（カテゴリーの台帳、役割ごとの名簿）」だけ
- 引用（`domains/bookmark.md`）: 「### Bookmark（集約ルート）」「`TransactionalRepository` を拡張しない。…楽観ロックを使わない」
- 引用（`domains/notification.md`）: 「### Notification（集約ルート）」「`TransactionalRepository` を拡張しない。通知は内容が変わらず、書き込みはどれも冪等なので、楽観ロックを使わない」
- 共通の契約の側に、内容が変わらず書き込みが冪等な集約の扱いがない

### 4-4 保存先の障害（`SystemError`）がポートの契約に入るかどうかが、ポートごとに違う

- 引用（契約に入れる側）: `domains/listing.md` ListingRepository「エラー: 保存先の障害は `SystemError`。」、`domains/media.md` PhotoAssetRepository「エラー: 保存先の障害は `SystemError`。」、`domains/notification.md` NotificationRepository「エラー: `SystemError`（保存先の障害、保存された値が規則を欠く）」、`domains/account.md`・`domains/authority.md`・`domains/application.md` のエラーの列挙の `SystemError`
- 引用（契約に入れない側）: `domains/place.md`「保存先の障害を `SystemError` にするのはアダプターの責務で、適合テストの対象にしない。」、`domains/bookmark.md`・`domains/moderation.md`・`domains/article.md`「保存先の障害の扱いはアダプターの責務で、契約の項目にしない」、`domains/area.md` も同じ
- 内容: 同じ種類のポート（集約のリポジトリ）で、同じ事柄の扱いが2通りある。`domains/index.md`「リポジトリの共通の契約」「エラーの種類」はどちらとも定めない。層の表は `testcases/ports/` に「契約の全項目」を求めるが、契約に入れる側のポートの適合テスト（`testcases/ports/listingRepository.md` など）に `SystemError` のケースはない

### 4-5 同じ操作を指す語がドメインごとに違う

`domains/index.md`「ドメインイベントの名前」は「同じ出来事には、ドメインをまたいで同じ語を使う。運営による非公開は `suspended`、その解除は `unsuspended`」と定め、ドメインイベントの型名はそろっている。振る舞い・ユースケース・エラーコードの名前はそろっていない。

- 運営による非公開の解除: `Listing.unsuspend`・`unsuspendListing`、`Place.unsuspend`・`unsuspendPlace` に対し、`Region.liftSuspension`・`liftRegionSuspension`、`Occasion.liftSuspension`・`liftOccasionSuspension`（`flows/index.md` F-13 の表の同じ行に4つが並ぶ）
- 申立てに基づく写真の削除: `removeListingPhotoByTakedown`（`Listing.removePhotoByTakedown`）、`removePlacePhotosByClaim`（`Place.removePhotosByClaim`）、`takeDownRegionPhotos`（`Region.takeDownPhotos`）、`takeDownOccasionPhotos`、`removeArticlePhotoByTakedown`（`flows/index.md` F-21）
- 公開条件の不足のコード: `LISTING_PUBLISH_CONDITION_UNMET`、`REGION_PUBLISH_REQUIREMENTS_MISSING`、`OCCASION_PUBLISH_REQUIREMENTS_MISSING`、`ARTICLE_PUBLISH_CONDITION_UNMET`（`domains/index.md`「公開状態」は「対象ごとのコードの `BusinessRuleError`」とだけ定める）

### 4-6 ドメインイベントの型名の規則と、規則に合わない型名

- 引用（`domains/index.md`「ドメインイベントの名前」）: 「ドメインイベントの型名は `"{ドメイン}.{出来事}"`」
- 引用（`flows/index.md`「ドメインイベントと消費者」）: `category.retired`（ドメインは Listing）、`takedown_claim.submitted`・`takedown_claim.resolved`・`info_report.submitted`・`info_report.confirmation_requested`（ドメインは Moderation）、`photos.released`（共有カーネル）
- 先頭の語が、ドメイン名のものと集約名のものに分かれている。規則の側に集約名を使う場合の定めがない

### 4-7 spec の外の作業メモへの参照

- 引用: `domains/application.md`「承認者への自由記述。任意（decisions-scenario A-0）」「（decisions-scenario O-2）」ほか8か所、`domains/discovery.md`「（P-87、P-88、B-46、decisions-mid M-12）」ほか7か所、`domains/listing.md`「（decisions-mid M-13、CF-06）」「（decisions-scenario L-2）」ほか9か所（計24か所）
- 内容: `decisions-scenario`・`decisions-mid` は `spec/review/` の作業メモで、spec の成果物ではない。spec のどこにも定義がなく、`spec/index.md`・`spec/ledger.md` からも辿れない。辿り先は scenario の ID か要求台帳の番号で書ける

### 4-8 `Article.create` の ID の型が、ユースケースと共有カーネルの定めと違う

- 引用（`domains/article.md`）: 「`Article.create` | `params: { id: string; content: ArticleContentInput }`」
- 引用（`usecases/article.md` createArticle）: 「入力: `Actor`、呼び出し側が決めた `ArticleId`」。`domains/index.md`「ID」は `ArticleId` を「不透明な空でない文字列のブランド型」とし、他の生成の振る舞いは `id: RegionId`・`id: ListingId`・`id: PlaceId`・`id: OccasionId` を取る

### 4-9 `domains/place.md` が `UnitOfWorkContext` の名前を定めていない

- 引用（`usecases/place.md`）: 「スコープ内で使うリポジトリ: `roleRosterRepository`、`placeRepository`、`photoAssetRepository`」
- 引用（`domains/index.md` UnitOfWork ポート）: 「各ドメインのリポジトリ（ドメインごとのファイルが定めるポート）」。他のドメインは定めている（`domains/region.md`「`UnitOfWorkContext` に、`regionRepository: RegionRepository` と…を加える」、`domains/listing.md`「`UnitOfWorkContext` に `listingRepository` として入る」）。`domains/place.md` には `UnitOfWorkContext` も `placeRepository` も現れない

### 4-10 「結果整合にするもの」の列挙が flows と合わない

- 引用（`domains/index.md`「トランザクションとドメインイベント」）: 「ドメインイベントの消費で結果整合にするもの: 申請の失効、通知、写真の削除、退会に伴う保存の削除と個人の申請の取り下げ」
- 引用（`flows/index.md`）: F-11「`reassignListingsOfRetiredCategory`（掲載1件ごとの UnitOfWork。…）」「`replaceRetiredCategoryInApplications`」、F-03「`sweepWithdrawnAccount`（`account.withdrawn`）」「`purgeNotificationsOnWithdrawal`（`account.withdrawn`）」、F-21「`sendTakedownOutcome`（`takedown_claim.resolved`）」
- 内容: 例示ではなく列挙の形だが、カテゴリーの付け替え、退会に伴う通知の削除と残った管理権限・役割の除去、申立ての結果のメールが入っていない

## 条件 5

区分の外（scenario / pages の読み手が担当）。

## 条件 6 アーキテクチャ制約、アダプターの差し替え

`testcases/ports/unitOfWork.md` に、in-memory と PostgreSQL の片方でだけ通るケースは見つからなかった（スコープ内の読み取りは結果を確かめず、競合はコミットの時点でも呼び出しの時点でもよいとしている。保存されたドメインイベントの観測は、テンプレートのポート `OutboxRepository.claimPending` を使う）。`domains/index.md` の UnitOfWork・リポジトリの共通の契約に、永続化技術の語彙は見つからなかった。

### 6-1 ユースケースの名前の画面の語彙（Discovery の読み手の区分と重なりうる）

- 引用（`usecases/discovery.md`）: 「readMapPins（地図の範囲の店舗と地域を読む）」
- 引用（契約 D-09）: 「地図: 移動に応じた再検索、ピンの集約」「このうち…ピンの見た目…は UI デザインが定め」
- 内容: 「ピン」は地図の画面上の表現の語。ユースケースが返すのは「店舗を区画ごとの件数にまとめ、地域を位置とともに」で、画面の語を使わずに言える。`domains/discovery.md` はユビキタス言語に「Pin cell | ピンの区画」「Card | カード」を置いており、ドメインの語として定義済みと読むこともできる（境界的）

## 条件 7 次の改訂が前より高くつかない設計である

### 7-1 申立てに基づく写真の削除が、5つのドメインに、3つの名前と2つの形で別々に定義されている

- 引用（`domains/index.md`「申立てに基づく写真の削除」）: 「申立てに基づく写真の削除は、写真を持つ各ドメイン（Place、Listing、Region、Occasion、Article）が、集約の振る舞いとユースケースを持つ。…Moderation は写真の削除のユースケースを持たず」
- 引用（形の違い）: `domains/listing.md`「`removePhotoByTakedown` | `listing: Listing, photoId: PhotoId, now: Date`」、`domains/article.md`「`Article.removePhotoByTakedown` | …`photoId: PhotoId`」に対し、`domains/place.md`「`Place.removePhotosByClaim` | …`photoIds: readonly [PhotoId, ...PhotoId[]]`」、`domains/region.md`・`domains/occasion.md`「`takeDownPhotos` | `(…, photoIds: readonly [PhotoId, ...PhotoId[]], now: Date)`」。ドメインイベントのペイロードも、`listing.photos_taken_down`・`article.photos_taken_down` は「`photoId`; `unpublished: boolean`」、`region.photos_taken_down`・`occasion.photos_taken_down` は「`photoIds`」だけで `unpublished` を持たない
- 内容: 5つのユースケースは同じオーケストレーション（サービス運営者の可否 → `TakedownClaimRepository.findById` → `TakedownClaim.authorizePhotoRemoval` → 対象の振る舞い → `photos.released`）を別々に持ち、すでに名前・引数・ペイロードが食い違っている。1つの画面（OM-04「掲載・店舗・地域・イベント・読みもののどの写真も削除できる」）が、対象の種類ごとに形の違う5つを呼び分ける。Notification も同じ出来事を2つの形で受ける
- 同じ構造の別の決定との不一致: 「あるドメインの要求が、別のドメインの集約に書き込む」場合、申請の承認は要求の側（Application）にユースケースを置く（`usecases/region.md`「所属申請・離脱申請の承認（`PlaceAffiliations.affiliate`・`leave`）は Application のユースケースが行う」）。申立ては対象の側に置く。置き場所の規則が2通りある
- 代案: 各集約の振る舞いを1つの形（`takeDownPhotos(target, photoIds: readonly [PhotoId, ...PhotoId[]], now)`、ドメインイベントは `{ …Id; photoIds; unpublished }`）にそろえ、ユースケースを Moderation の1つ（申立ての ID と `photoIds` を受け、申立ての `ContentRef.kind` で対象のリポジトリと振る舞いを選ぶ。承認のユースケースと同じ置き方）にする。申立ての前提の確認・操作の可否・`photos.released` の保存が1か所になり、対象ごとの違い（店舗は公開状態を持たない、公開条件を欠いた対象は `unpublished`）は集約の振る舞いに残る。写真の削除と「対応済み」を別の UnitOfWork にする決定（F-21）は変わらない
- 次に来そうな要求での比較: 「申立てで削除した写真を、申立ての記録に残す」または「写真を持つ対象が増える」。現状は5つ（6つ）のユースケース・5つのテストケースのファイル・2つの形のドメインイベントと Notification の対応表に広がる。代案では Moderation のユースケース1つと、増えた集約の振る舞い1つで済む

## 7 条件の外

- `domains/index.md`「エラーの種類」は「テンプレートの `NotFoundError`・`ConflictError`・`ValidationError`・`SystemError` に、…`ForbiddenError` を加える」と書くが、テンプレート（`packages/core/src/application/errors.ts`）はすでに `ForbiddenError` を持つ
- `domains/index.md`「開発の順序との対応」は、段階2の Discovery を「店舗詳細・掲載詳細・対象の選択の候補」とするが、段階2のユースケース（`matchPlaces` の写真の代用、店舗・掲載の申請の提出、`submitTakedownClaim`・`submitInfoReport`）は `ReferenceQueries.resolve`・`isViewable` を読む。`ReferenceQueries` がどの段階に入るかが表から読めない。段階1の「Notification（基盤と段階1の出来事）」は、契約 T-03 が通知を最後の段階に置くことと並びが違う（T-03 の「各段階には、その対象に関わる管理・運営機能を含める」で説明はつく）
- `domains/index.md`「依存方向」の「Notification | すべてのドメイン」は、ドメインイベントを出さない Area・Media・Bookmark・Discovery（`flows/index.md` 末尾）を含む書き方になっている
- 契約の番号のうち scenario に現れないのは AC-74、D-05、D-08、P-01、P-02、P-03、P-05、P-06、P-10、P-11、T-01〜T-03。AC-74 は関連要件（B-16、B-43）が scenario にあり、testcases（`registerPlaceByProxy`・`updatePlaceProfile`）に添えられている。D-05 は pages にある。残りは方針・用語・前提の項目で、個別の要求（UC-01〜15、P-79 など）を通じて辿れるので、反例にしていない
- `scenario/index.md`「申請の前提」は「申請の種類ごとに前提が1つ決まる」と書いた直後に「複数の行に当たる申請は、当たる前提のすべてが成り立つ間だけ有効」と書く（scenario の読み手の区分）
