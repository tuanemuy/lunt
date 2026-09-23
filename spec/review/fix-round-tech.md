# 技術設計の直し（usecases/testcases の担当からの指摘の集約）

全 usecases の担当が完了したら、ドメインごとに直しを依頼する。

## Region（usecases: a2ffcf0e1349399a3 / domains: a33bc0536200a033e）

- 決定: サービス運営者が ID で対象を開いて状態と管理者の有無を確かめる読み取り（OM-03）を、Place・Listing・Region・Occasion がそれぞれユースケースとして持つ（運営者の有無にかかわらずサービス運営者が行える。AccessPolicy の操作の種類として index に足す）
- 決定: 代表地域の選択と所属状況の確認は AccessPolicy の結果どおり（管理者不在ならサービス運営者も行える）。pages が入口を示さないだけで、矛盾ではない
- 決定: `AreaCatalog.findTown` が null の TownRef での登録・更新は `ValidationError`（入力エラー）。Place・Region・Occasion のユースケースに共通
- MY-01 が示す「管理する対象の名称」を返すユースケースの置き場所 → Authority の usecases の返答を見て決める
- region.md: 編集の要求が版を含む記述がない（place.md と揃える）。publish/unpublish の不正な遷移のエラーコード。写真の削除が TakedownClaim.authorizePhotoRemoval を呼ぶことの記述（依存: Region → Moderation? index の依存表に「申立ての確認のために Moderation の型を参照」を足すか、ユースケースが事実として渡す形にするか → 事実（申立てが未対応で対象が一致すること）をユースケースが Moderation のポートから読んで確かめる。ドメインの依存は増やさない）
- ポート契約の曖昧さ: search の空文字の keyword、findByIds の100件超

## Discovery 完了（domains: a7b8cf61d74047b42）からの要望

- Application: RQ-05 の提出前の入力中の内容の見え方を確かめるユースケースを Application が持つ（`ViewProjection.previewListing` を使う）
- Article: previewArticle は `ReferenceQueries.resolve` の結果を `ViewProjection.previewArticle` に渡す形にそろえる
- Place: 既存店舗の確認の写真の代用（P-43）は Discovery の `ReferenceQueries.resolve` か `ViewProjection.placeEntry` を使う（規則を重ねない）
- `ReferenceQueries.isViewable` を事実に使う: Bookmark の save、Moderation の viewable/targetViewable、Occasion の placeViewable/regionViewable、Application の提出時の対象の確認
- 決定: 周辺の地域の半径は設定値。MIX_WINDOW=12、「同じ地域」=一覧に示す地域、キーワードは空白区切りの全語一致と点数づけ、地図の初めの範囲は条件に合う店舗が収まる範囲 → 提案どおり採用。GeoBounds の定義は index に反映済み

## Area + Place（usecases: accbd047c16a6bb5f / domains: a13e9157e09b5a8b0）

- 決定 P-43 の写真の代用: その店舗の閲覧できる掲載（公開中。提供状態を問わない）のうち、最初の公開が最も新しい掲載の代表写真。規則は Discovery の `ViewProjection.placeEntry`（または ReferenceQueries）だけが持ち、Place の MatchPlaces は Discovery の投影を使う。非公開の店舗には代用しない（サービス運営者の照合は写真なしで示す）
- 決定: 照合で管理者の有無を返すのはサービス運営者の照合だけ（提案どおり）
- 決定: 管理者のいる店舗をサービス運営者が読む経路 → index の操作の可否に「サービス運営者が対象を開いて確かめる読み取り」を追加済み。GetManagedPlace の扱いは提案どおり
- 決定: 非公開・解除・写真削除は版を含めない（提案どおり）。CS-08（前提の変化）を優先し、版の競合は save の楽観ロック
- area.md: 町域の候補がない郵便番号・解決できない TownRef は `ValidationError`。`AreaCode.create`（7桁の数字の形式だけを確かめる。マスターにあるかは AreaCatalog が答える）。listTowns の並びは kana のコードポイント順と明記。AreaCatalog の適合テストはテスト用マスターを両実装に与える（提案どおり）
- place.md: RemovePlacePhotosByClaim が申立ての事実（未対応で対象が一致）を Moderation のポートから読むことを明記。代理登録の再送の判定は PlaceProfile.equals

## Application domains（a3f17b26fd9275cc1）

- 決定: 店舗管理者として行う所属・離脱・参加の提出に店舗の閲覧可否は求めない。個人の離脱の申請は地域が閲覧できることを求める（提案どおり）
- index 反映済み: AccessDecision の参照、事実の列挙、参加の解除は再評価のきっかけにしない（occasion.md の participation_dissolved の消費者欄から Application を外す → Occasion 担当へ）
- Listing: `ListingContent.replaceCategory` の戻り値と toPublishable の通し直し → Listing 担当へ（PublishableListingContent.replaceCategory を持たせる）
- ApplicationReviewDesk / OverdueNoticeLedger.findPageDue は Authority の管理体制にまたがる読み取り（Discovery のポートと同じ扱い＝ドメインの語彙で定め、アダプターが実現）。index の「読み取り」に一文足す

## Moderation（usecases: a83471447358f039d / domains: abfbd95c6c12142cb）

- 決定: 削除済みの掲載への連絡は `INFO_REPORT_TARGET_UNAVAILABLE`（閲覧できない対象と同じ扱い。CS-06）。依頼を持たない連絡を開いたら NotFoundError
- 決定: 一覧と詳細の対象の名称は、Moderation のユースケースが Discovery の `ReferenceQueries.resolve`（閲覧できる対象）と、サービス運営者向けには各ドメインの findByIds で解決して添える。連絡した利用者はメールアドレス（Account のポート）。RQ-08・RQ-09 を開いた時点の判定は、Discovery の詳細の読み取り（手続きの入口の事実）が担う
- 決定: 状態のエラー（ALREADY_RESOLVED・NOT_OPEN = CS-08）を版の比較より先に判定する、と moderation.md に明記
- 確認の依頼の読み取りは manage_target のまま（代行でも読める）
- TakedownOutcomeMailer: 適合テストは「同じキーの2回目の send が成功を返し、テスト用実装の送信の記録が1通」の形。本番実装は送信先のサンドボックスで同じケースを通す

## 全 usecases 共通

- ユースケースの名前は camelCase の英語に統一（index に規約を追加済み）。PascalCase の account/area/authority/listing/media/occasion/place と、日本語見出しの region を直す（見出しは `## camelName`）。テストファイル名は camelCase で統一済み
- エラーの種類: ForbiddenError を application 層に追加、閲覧できない対象は NotFoundError（index に追加済み）
- findByIds などは 0〜100件、超過は ValidationError（index に追加済み）

## Account + Authority（usecases: ab4fa33c9f114ad12 / domains: adcda3d0ff495f6d5）

- 決定: 退会したアカウントのログインは無効。`Actor` を作る境界（presentation）がアカウントの存在を確かめる、と account.md に書く
- 決定: 管理する対象の名称は `getMyAuthority`・`previewWithdrawal` が Place/Region/Occasion のリポジトリの findByIds で解決して返す（checkInvitation と同じ形）
- 決定: `establishFirstOperator` は、名簿が未開設のとき、または名簿の持ち主が全員退会済みのアカウントのときに成立する（退会と付与の競合からの回復）
- account.md: ログインの確認が見つからない場合は `BusinessRuleError("LOGIN_CHALLENGE_INVALID")`。AccountRepository.save は使わないので契約から外す（insert/findById/delete と問い合わせだけ）。`ExternalProviderKey.create`。LoginSecretGenerator の契約を検証できる形に（重複しない、LinkToken.create / LoginCode.create を通る）
- authority.md: checkInvitation が対象の名称を他ドメインのリポジトリから読むこと、招待は target と InvitationId で引くこと、アカウントのない管理者・持ち主は AccountId だけで返すこと、grantStewardship の対象の存在確認を明記

## Occasion（usecases: acd2edc1de3dad6e2 / domains: a33bc0536200a033e）

- index 反映済み: 編集の競合（編集の要求は版を含む。状態のエラーを先に判定）、ジョブの打ち切り、PUBLICATION_INVALID_TRANSITION
- 決定: 店舗の側の参加の操作（変更・取りやめ）は店舗管理者だけ（管理者のいない店舗の参加はイベントの側が扱う。E-11）。occasion.md に明記
- 決定: 期間外の参加日を残したままの保存は PARTICIPATION_DATE_OUT_OF_PERIOD（仕様どおり）
- occasion.md: 添えられる掲載の事実を読むポート名（ListingRepository.findByIds と Listing.shelfOn）、search の空のキーワードは空の結果、delete は型から除く、authorizePhotoRemoval の不成立のコード名（Moderation 側）、TownRef 未解決は ValidationError、サービス運営者が ID で開く読み取り
- occasion.md の participation_dissolved の消費者欄から Application を外す

## Media + Bookmark + Article（usecases: aafcd572562b01d7e / domains: a68de67132fe752d7（Media）, abfbd95c6c12142cb（Article, Bookmark））

- 決定: registerPhoto の送り直しで同じ PhotoId が discarded なら ConflictError。PhotoAsset.duplicate の元が存在しない・stored でないときは BusinessRuleError（コードを media.md に定義）
- 決定: discardReleasedPhotos で一部が失敗したら消費を失敗として再配送を求める（冪等）
- 決定: mergeDeviceBookmarks は1回に100件まで。端末は100件ずつに分けて送る
- 決定: ShowcaseList は100件まで（article.md）
- 決定: previewArticle に公開中の読みものが渡ったら現在の公開状態を値で返す（提案どおり）。publish/unpublish は状態の確認が先（index に規約を追加済み）
- article.md: ArticleRepository.delete は型から除く。検証できない SystemError の契約は「アダプターの責務」として契約の項目から外す

## Listing（usecases: a28deac6e9034a73c / domains: a68de67132fe752d7）

- 決定: duplicateListing の送り直し → 同じ ID の掲載があり、同じ店舗の掲載なら送り直しとして成功（書き込みなし）。違う店舗なら ConflictError
- 決定: サービス運営者が掲載1件を確かめる読み取りは getManagedListing が担う（index の操作の可否に追加済みの読み取り）
- 決定: `listing.photos_taken_down` の `unpublished` は「この削除で一時非公開になった」。Place 以外の4ドメインで同じ意味
- listing.md: 編集の要求の版（index に規約あり）、型で除外した状態が実行時に来た場合のコード（PUBLICATION_INVALID_TRANSITION と、提供終了・復帰のコード）、写真の削除が申立ての事実を読むこと、searchForOperation の関連度の定義は2段階でよい、PublishableListingContent.replaceCategory

## Notification（usecases: a1e341d2802c23971 / domains: a4a627119c1ecc1b4）

- 決定: categories_reassigned の通知は移行先の名称を持たず、一覧を返すユースケース（listNotifications）が表示の時点で `CategoryCatalog.resolve` を呼んで添える
- 決定: 開設前（サービス運営者の名簿が未開設）は proxy の宛先が0人（届け先なし）
- notification.md: `RoleRosterRepository.find(role)` に合わせる（null を返さない）。名称の解決は findByIds を持つドメインは findByIds、持たないドメイン（Article、Moderation）は findById
- 改名と observedOn は一括の置換で行う（notification の usecases/testcases も対象）

## Discovery（usecases: adaf2cb6d1366060f / domains: a7b8cf61d74047b42）

- 決定: 地域詳細（DT-03）の店舗・掲載の区分のカードに示す地域名は「その地域」（V-05 の地域内の一覧と同じ扱い）。pages/index.md と detail.md にも反映が要る
- 決定: 地図の初めの範囲で店舗が0件のとき（null）は、日本全体が収まる範囲（pages/index.md の地図に追記）
- 決定: 対象の選択の候補の店舗は、1つのキーワードを店名・住所の両方に当てる。空のキーワードは空の結果
- discovery.md: standingOf はログインしていない閲覧者に使えない → StewardshipRepository.findById と isVacant / isSteward で事実を作る。保存済みかどうかは Bookmark の getSavedTargets が返し Discovery は持たない（冒頭の記述を直す）。選んでいる地域そのものは DetailQueries.findRegion。findPlacePinCells の selectedRegionId が閲覧できない・bounds の外は「加えない」。findOccasionsRelatedTo・findRegionsOfOccasion・findArticlesShowcasing は対象が閲覧できなければ空。ReferenceQueries.resolve は 0〜100件（index の規約）。FeedComposer.requirement が100を超えるときは findListings を複数ページで読むことを明記

## Application（usecases: afec9920a1e1ca7cc / domains: a3f17b26fd9275cc1）

- 決定: 承認・否認・差し戻しは、承認者が確かめたときの版を要求に含める（index「編集の競合」に追加済み）。再提出の後に古い内容を見たままの判断は ConflictError
- 決定: listMyApplications で管理する店舗が100件を超えるときは、100件ずつ分けて `findPageByApplicants` を呼ぶのではなく、ポートの引数を「個人の AccountId と、その人が管理する店舗」を表す形にできないため、usecase が店舗を100件ずつに分けて読み、提出の新しい順に併合する、とはしない。→ `findPageByApplicants` の `places` の上限を外し、件数の上限を持たない集合として受ける（index の 0〜100件の規約の例外にせず、「ID の集合で絞り込む問い合わせ」は上限なし、「ID で引く問い合わせ（findByIds）」が 0〜100件、と index を直す）
- 決定: 管理権限の申請の承認で申請者のアカウントが退会済みなら、承認は成立しない（BusinessRuleError。前提の変化 CS-08）。申請は退会の消費で取り下げになる
- 決定: previewListingSubmission を application.md のユースケース（概要）に足す。店舗が閲覧できなければ NotFoundError
- application.md: 提出の前に枠を求める関数（`ApplicationSlot.of(case)` など。`slotOf(application)` と同じ規則を1か所で）。SubmissionScope の閲覧できるかどうかは Discovery の `ReferenceQueries.isViewable` の事実。登録申請の冪等な再送で併せた申請が予約済みの placeId を使うこと。提出時のエラーの順序（前提 → 閲覧できない対象 → 重ねた申請）。種類の違う申請の ID は NotFoundError
- Listing へ: `ListingPatch.compare`（見比べ。Place の PlaceRevision.compare と同じ形）。掲載の申請・修正の提出時にカテゴリーが現役かを確かめる（`CategoryCatalog.requireActive`）ことを listing.md か application.md に明記
- ApplicationReviewDesk / OverdueNoticeLedger の適合テストの前提は ApplicationRepository と StewardshipRepository の書き込みで組む（提案どおり）

## 直しの返答から出た統一事項（直しの完了後にまとめて依頼）

- 申立てによる写真の削除で、対象の写真でない PhotoId が混じったら、5ドメインとも BusinessRuleError（Place の扱いに統一。1枚も削除しない）→ Listing / Region / Occasion / Article
- Authority: StewardshipRepository.findByTargets は 0〜100件（index）
- Discovery: substituteCover の掲載の順は「最初の公開が最も新しい掲載」、resolve は 0〜100件
- 運営者の照合でも公開中の店舗には写真を代用する（Place の解釈どおり）
- 公開状態を変える操作の判定の順は「運営による非公開 → 不正な遷移 → 公開条件」（index に追加済み）。Region / Occasion / Article を Listing の順に合わせる
- Authority の `Operation`: サービス運営者が対象を開いて確かめる読み取りは `operate_service` に含める、と authority.md の説明に明記（Listing / Place / Region / Occasion は operate_service で判定済み）
- domains 末尾の「ユースケース（概要）」の表の名前を全ドメインで camelCase に（Place など日本語のままのものが残っていれば）
