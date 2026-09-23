# 独立した読み 1: domains/index.md と Article・Moderation・Bookmark

読んだ範囲: `spec/domains/index.md`（全文）、`spec/domains/{article,moderation,bookmark}.md`、`spec/usecases/{article,moderation,bookmark}.md`、`spec/testcases/{article,moderation,bookmark}/`、`spec/testcases/ports/{articleRepository,bookmarkRepository,takedownClaimRepository,infoReportRepository,takedownOutcomeMailer}.md`。上流は `spec/scenario/{editorial,moderation,keep}.md` と、`spec/pages/` の AM-01・AM-02・CM-03・OM-01・OM-03〜OM-05・RQ-08・RQ-09・VW-10・CF-04・SM-07。区分の中の記述が参照する定義を確かめるために、`domains/discovery.md` の `ReferenceQueries`、`flows/index.md` の F-02・F-21・F-22・F-24、他ドメインの申立てに基づく写真の削除の定義を部分的に読んだ。

## 条件 1: 要求を取りこぼしていない

### 1-1 ログインしていない閲覧者の保存一覧と保存時の確認を実現するユースケースがない

- 上流の引用
  - `scenario/keep.md` KEP-02 手順 1〜3: 「ログインしていない間は端末の保存、ログインしている間はアカウントの保存が、保存した日時の新しい順に並ぶ」「掲載は写真・名称・店舗名・代表地域、店舗は写真・名称で見分ける」「対象は状態を区別して並ぶ」
  - `scenario/keep.md` KEP-03 手順 1: 「閲覧できなくなった保存は、閲覧できないことが示される」（前提にログインの有無の限定はない）
  - `scenario/keep.md` KEP-01 異常系: 「保存しようとした対象が、表示した後に非公開・削除で閲覧できなくなっている。閲覧できないことが示される」（他の行と違い「ログイン中に」の限定がない）
  - `pages/browse.md` VW-10: 「ログインしていない間は端末の保存を、ログインしている間はアカウントの保存を示す」「掲載は写真・名称・店舗名・地域名で、店舗は写真・名称で示す」、状態「閲覧できない保存を含む」
  - `pages/index.md` CF-04: 「保存の時点で対象が閲覧できなくなっていれば、閲覧できないことを示す（CS-06）」
- 落ちている下流
  - `usecases/bookmark.md` 冒頭: 「すべてログインしたアカウントの操作で、保存を持つアカウントは `Actor` から決まる。…ログインしていない間の保存は端末にだけあり、どのユースケースも通らない」。`listBookmarks`・`saveBookmark` は `Actor` を取る
  - `usecases/discovery.md`: 「保存一覧の解決は Bookmark の `listBookmarks` が `ReferenceQueries.resolve` を使う」。Discovery のユースケース（`readFeed`〜`findSelectionCandidates`）に、`Actor` なしで `BookmarkRef` の並びを解決するものはない
- 反例の内容: 端末の保存（`BookmarkRef` と保存した日時だけを持つ）から、写真・名称・店舗名・代表地域・状態・閲覧できるかどうかを得る読み取りが、usecases にも testcases にもない。ログインしていない閲覧者の保存の時点の閲覧可否の確認（CS-06）も同じ。AC-07（「非公開になった対象は閲覧不可と分かり」）と AC-20（「ログインせずに…保存でき」）のログインなしの側を確かめる testcase が存在しない
- 関連: `scenario/keep.md` 共通の規則の「サーバーに送らない」（2-1）と両立しない。表示の内容と閲覧可否は、端末の `BookmarkRef` をサーバーへ渡さなければ得られない

### 1-2 MOD-02 の「対応を終える」に、操作の取り消しの観点の次の操作がない

- 契約の引用: M-39「サービス運営者は対象の写真の削除または掲載・店舗の非公開を行い、結果をメールで連絡する」、O-21
- scenario の引用: `scenario/moderation.md` MOD-02 異常系の「操作の取り消し」は「削除した写真を戻したい」「非公開にした掲載・店舗を戻す」の2行だけ。`pages/operation.md` OM-04「CS-12 対応を終える確認 | …取り消せないことを示す」
- 反例の内容: 観点「操作の取り消し」で、対応を終えた後に措置の不足に気づいた場合の次の操作が決まっていない。`domains/moderation.md` は「対応済みは終わりの状態で、未対応に戻らない」、写真の削除は `TAKEDOWN_CLAIM_ALREADY_RESOLVED` で拒まれる（`authorizePhotoRemoval`）ため、対応済みの申立ての対象からは写真を削除できなくなる。サービス運営者が取れる操作（申立人に再度の申立てを依頼する、など）が scenario にない

### 1-3 AC-42 の保存一覧の案内を確かめる testcase がない

- 契約の引用: 「AC-01〜AC-80 は関連要件の確認基準…各 AC は、関連要件の辿り先の testcases で確認できる」「AC-42: V-51、V-52、B-40」、REQ 12 AC-42「保存一覧で、端末の保存が失われる条件とログインによる引き継ぎが案内される」
- 落ちている下流: `testcases/` で AC-42 を引くのは `testcases/account/` の4ファイルだけで、どれもログインのケース。V-52 の辿り先は `pages/browse.md` VW-10 の「端末の保存」の状態で止まり、usecases・testcases に続かない（1-1 と同じく、ログインしていない間の保存一覧がユースケースを通らないため）

## 条件 2: 足しすぎていない

### 2-1 scenario に、契約に引用元のない技術上の決定がある

- 引用: `scenario/keep.md` 共通の規則「ログインしていない間の保存は端末のブラウザに残り、サーバーに送らない」
- 内容: 契約 V-41 は「ログインせずに保存でき、保存は端末に残る」までで、「サーバーに送らない」の引用元がない。保存先の技術の決定で、scenario の層（利用者の操作とフロー、異常系）の外。1-1 の取りこぼしの原因になっている

### 2-2 scenario に UI パターンの記述がある

- 引用: `scenario/keep.md` KEP-02 手順 5「解除した対象は、保存一覧を開き直すまで解除済みとして同じ行に残り、開き直すとなくなる」、KEP-03 手順 2 と異常系「保存は解除済みとして同じ行に残っている」「その行で保存し直す」
- 内容: 層の表の scenario の「書かない」（UI パターン）に当たる。利用者の操作としては「解除の直後はその場で取り消せる。保存一覧を開き直した後は取り消せない」で足り、「同じ行に残る」は pages（VW-10 の状態「解除済みの行を含む」）が既に持つ

### 2-3 ドメインの testcases に境界値のケースがある

- 引用
  - `testcases/article/createArticle.md`: 「互いに違う101件の紹介先を入れて作成する」
  - `testcases/bookmark/mergeDeviceBookmarks.md`: 「101件の一覧を1回で渡して合流する」「100件と50件に分けて、2回合流する」
  - `testcases/bookmark/getSavedTargets.md`: 「101件の対象を示して読む」
- 内容: 層の表の `testcases/${domain}/` の「書かない」（境界値）に当たる。同じ境界は `testcases/ports/bookmarkRepository.md`（100件・101件）が契約の項目として持つ

### 2-4 ドメインの testcases に技術的なエッジケースがある

- 引用
  - `testcases/article/publishArticle.md`: 「2人の編集担当者が同時に公開し、どちらの要求も下書きを読んだ | 一方が成功し、他方は `ConflictError`」
  - `testcases/moderation/resolveTakedownClaim.md`: 「サービス運営者 A と B が同時に対応を終え、どちらの要求も未対応の申立てを読んだ」
  - `testcases/moderation/requestInfoReportConfirmation.md`・`resolveInfoReport.md` の同時の要求のケース
  - `testcases/bookmark/mergeDeviceBookmarks.md`: 「`addAll` の途中で保存先の障害が起きる | `SystemError`」
- 内容: 「書かない」（技術的なエッジケース）に当たる。同時の `save` の競合は `testcases/ports/*Repository.md` の「並行性」「楽観ロック」が持ち、保存先の障害は `domains/bookmark.md` が「契約の項目にしない」としている。`usecases/bookmark.md` の `mergeDeviceBookmarks` のエラーケースに `SystemError` はなく、この期待結果は usecases から辿れない

## 条件 3: Issue をまたぐ決定が決まりきっている

### 3-1 申立てに基づく写真の削除が、1回の要求で1枚か複数枚かが決まっていない

- 問い: OM-04 で、サービス運営者は写真を1枚ずつ削除するのか、複数を選んで1回で削除するのか
- 引用: `pages/operation.md` OM-04「対象の写真から選んで削除する」「CS-13 削除の完了 | …続けて別の写真を削除できる」。`usecases/article.md` `removeArticlePhotoByTakedown`「写真を1枚削除する」「入力: …削除する写真の `PhotoId`」、`usecases/listing.md` `removeListingPhotoByTakedown`「掲載の写真を1枚削除する」。一方 `usecases/place.md` `removePlacePhotosByClaim`「削除する写真の `PhotoId`（1つ以上）」、`usecases/region.md`・`usecases/occasion.md`「外す写真の `PhotoId`（1枚以上）」
- 依存する箇所: OM-04 の画面（1つの画面が5種の対象を扱う）、5つのユースケース、`*.photos_taken_down` のペイロード（Article・Listing は `photoId` と `unpublished`、Place・Region・Occasion は `photoIds`）と、それを消費する Notification。pages は答えを持たず、usecases は対象の種類で答えが割れている（4-3、7-1）

## 条件 4: 矛盾がなく、現在形で単体で読める

### 4-1 申立て・連絡の対象の名称の解決元が食い違う

- 引用 A: `domains/discovery.md` ReferenceQueries の使い方の表「Moderation の申立て・連絡 | …一覧と詳細に示す対象（掲載・店舗・地域・イベント）の名称は、`resolve` の結果から解決する」。同じ表で `resolve` は「閲覧できない対象と存在しない対象は結果に現れない」
- 引用 B: `usecases/moderation.md` 共通の扱い「対象の名称と、対象があるかどうか: 対象のドメインのリポジトリで、閲覧できない対象を含めて読む」、`domains/moderation.md`「対象の名称は、ユースケースが対象のドメインのリポジトリ（…`findByIds`、Article は `findById`）で、閲覧できない対象を含めて解決する」、`testcases/moderation/listOpenTakedownClaims.md`「名称は、閲覧できない対象についても返る」
- 内容: A の方法では B の期待結果（運営による非公開の対象の名称）を返せない

### 4-2 フローの「先に対応された」場合のエラーが、ユースケースと食い違う

- 引用 A: `flows/index.md` F-21「対応済みにする操作は、読んだ時点の版と違えば `ConflictError`（別のサービス運営者が先に終えた）」、F-22「状態を変える要求は、読んだ時点の版と違えば `ConflictError`（別のサービス運営者が先に依頼した、または終えた）」
- 引用 B: `usecases/moderation.md` 共通の扱い「状態を変える要求（対応を終える、確認の依頼）は、版を含めない。すでにその状態であること（別のサービス運営者が先に対応を終えた、先に確認を依頼した）は、前提の変化として状態の `BusinessRuleError` で返し」。`testcases/moderation/resolveTakedownClaim.md`「B が先に対応を終えた | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）」、`testcases/moderation/resolveInfoReport.md`「B が先に確認を依頼した | A が対応を終える | 成功する」
- 内容: 先に終えた・先に依頼した場合の結果が、A は `ConflictError`、B は `BusinessRuleError` または成功

### 4-3 同じ操作（申立てに基づく写真の削除）に、3通りの名前と2通りの形がある

- 引用: `domains/index.md`「申立てに基づく写真の削除は、写真を持つ各ドメイン…が、集約の振る舞いとユースケースを持つ」「同じ出来事には、ドメインをまたいで同じ語を使う」。実際の名前は Article `Article.removePhotoByTakedown`／`removeArticlePhotoByTakedown`、Listing `removePhotoByTakedown`／`removeListingPhotoByTakedown`、Place `Place.removePhotosByClaim`／`removePlacePhotosByClaim`、Region・Occasion `takeDownPhotos`／`takeDownRegionPhotos`・`takeDownOccasionPhotos`
- 内容: 同じものを指す語が `removePhotoByTakedown`・`removePhotosByClaim`・`takeDownPhotos` の3つ。引数も `photoId: PhotoId`（Article・Listing）と `photoIds: readonly [PhotoId, ...PhotoId[]]`（Place・Region・Occasion）で割れ、公開の取り下げの伝え方も、ペイロードの `unpublished: boolean`（Article・Listing）と別のドメインイベント `region.unpublished`・`occasion.unpublished`（Region・Occasion。Listing は両方）で割れている

### 4-4 Bookmark のライフサイクルと「解除を取り消す」が食い違う

- 引用 A: `domains/bookmark.md` ライフサイクル「消滅: 閲覧者による解除、または退会に伴う削除。解除した保存は戻らず、もう一度保存すると新しい保存になる」
- 引用 B: 同ファイルのユビキタス言語「Restore | 解除を取り消す | 保存一覧で解除した保存を、保存した日時を保って戻すこと」、`testcases/bookmark/restoreBookmark.md`「保存が `savedAt` を T にして戻り、`listBookmarks` で元の位置に並ぶ」

### 4-5 参照整合性を確かめる主体の共通の契約と、Article・Bookmark の契約が食い違う

- 引用 A: `domains/index.md` リポジトリの共通の契約「参照整合性（他の集約の ID が指す先があること）は、ポートではなく呼び出し側のユースケースが、書き込みの前に確かめる」
- 引用 B: `domains/article.md`「参照整合性: 紹介先の指す先があること、閲覧できることを、保存の条件にしない」、`usecases/article.md` `createArticle`「紹介先の指す先があること、閲覧できることを確かめず」。`domains/bookmark.md`「対象があることを、ポートもユースケースも保存の条件にしない」
- 内容: A は例外を持たない全称の規則で、B はユースケースも確かめないと定める。A が「確かめる必要がある場合の担当」を言うのか「必ず確かめる」を言うのかが index.md から読めない

### 4-6 リポジトリの共通の契約の全称と、BookmarkRepository が食い違う

- 引用 A: `domains/index.md`「集約のリポジトリは `TransactionalRepository<TEntity, TId>` を拡張する」（例外は「全体で1つ、または決まった少数しかない集約」だけ）
- 引用 B: `domains/bookmark.md`「Bookmark（集約ルート）」「`TransactionalRepository` を拡張しない。…楽観ロックを使わない」

### 4-7 区分の外で見かけた、spec の外の作業メモへの参照

- 引用: `domains/discovery.md` ReferenceQueries の使い方の表「（decisions-scenario R-3）」、`domains/listing.md` `removePhotoByTakedown`「（decisions-mid M-14）」
- 内容: spec のどの成果物にも定義のない参照で、決定の経緯を指す。区分の中のファイル（index・article・moderation・bookmark の domains / usecases / testcases）には同種の参照はない

## 条件 5: 利用者の目的が迂回なく達成でき、画面の役割が重ならない

反例なし。比べた代案は次のとおりで、どれも現行より少ないステップ・画面にならない。

- EDT-03: 公開の操作を AM-02 だけに置き CM-03 を確認専用にする案。確認を経る公開が1ステップ増える
- KEP-02・KEP-03: 解除の取り消しを持たず保存し直しに一本化する案。閲覧できない保存は保存し直せず、KEP-03 の取り消しができなくなる
- MOD-05: OM-05 から権限の解除と代行の更新を直接行う案。契約 I-03（すべての店舗管理者の権限を解除してから更新）と CM-02 の役割に重なる

## 条件 6: アーキテクチャ制約に従い、アダプターを差し替えられる

### 6-1 「ID の昇順」が不透明な文字列の順序を定めておらず、in-memory と PostgreSQL で結果が分かれる

- 引用: `domains/index.md`「すべて不透明な空でない文字列のブランド型。形式は `IdGenerator` ポートが決める」「並び順は各ポートが定め、同順位は ID の昇順で決める」。`testcases/ports/articleRepository.md`「読みものが2件。`updatedAt` が同じ | 読む | ID の昇順に返す」、`testcases/ports/bookmarkRepository.md`「`target.id` の昇順に返す」、`takedownClaimRepository.md`・`infoReportRepository.md` の「ID の昇順で返る」
- 片方でだけ通るケース: ID が `"B"` と `"a"` の2件。in-memory（JavaScript の文字列比較、コード単位の順）は `"B"` → `"a"`、PostgreSQL の既定の照合順序（ロケール依存）は `"a"` → `"B"` を返す。契約が比較の規則（例: コードポイント順）を定めていないため、同じ適合テストが ID の選び方でバックエンドごとに結果を変える

### 6-2 区分のユースケースの出力が、画面の語彙（カード）を持つ型で組み立てられる

- 引用: `usecases/bookmark.md` `listBookmarks`「`ViewProjection.listingCard`・`ViewProjection.placeCard`（Discovery）」、`usecases/article.md` `getArticleForEditing`「`ViewProjection.listingCard`・`placeCard`・`regionCard`・`occasionCard`」。`domains/discovery.md`「`ListingCard` | 代表写真…」
- 内容: 制約「ユースケースの名前と入出力に画面の語彙がない」。`Card` は UI の部品の語で、`listBookmarks`・`getArticleForEditing` の出力（「種類ごとの表示の内容」「紹介先それぞれの現在の状態」）がこの型になる。定義の本体は Discovery（区分の外）

## 条件 7: 次の改訂が前より高くつかない

### 7-1 申立てに基づく写真の削除が、5つのドメインに別々の形で定義されている

- 引用: 4-3 と 3-1 の引用。`domains/index.md` Publication「`published` の対象の内容が公開条件を欠くと（申立てによる最後の写真の削除）、集約の振る舞いが `unpublished`（`photoTakedown`）にする」
- 内容: 同じ規則（写真を外す、残る順を保つ、`published` で写真がなくなれば `photoTakedown`、`*.photos_taken_down` と `PhotosReleased` を出す）が5か所にあり、名前・引数・ペイロード・公開の取り下げの伝え方が既に食い違っている。想定する次の要求「申立人が示した写真をまとめて削除する」または「写真を持つ対象の種類を足す」では、5つの集約・5つのユースケース・OM-04・Notification の5つの告知を、それぞれ違う形のまま直すことになる
- 代案: `domains/index.md` の「申立てに基づく写真の削除」に、形を1つ定める。共有カーネルに `PhotoSet.takeDown(set, photoIds: readonly [PhotoId, ...PhotoId[]])` と、`Publication` に「公開条件を欠いたら `photoTakedown`」の関数を置き、各集約の振る舞いは `removePhotosByTakedown(entity, photoIds, now)`、ユースケースは `remove{Target}PhotosByTakedown(actor, claimId, targetId, photoIds)`、ドメインイベントは `{target}.photos_taken_down` のペイロード `{ id, photoIds, unpublished }` にそろえる。OM-04 は種類による分岐を持たずに済み、3-1 の問いが消える

### 7-2 「`resolve` の結果にない対象は閲覧できない」の推論を、呼び出す側がそれぞれ持つ

- 引用: `usecases/bookmark.md` `listBookmarks`「`resolve` の結果にない保存は、閲覧できないことだけを添えて、対象の情報なしで返す。指す先のない保存も同じ」、`usecases/article.md` `getArticleForEditing`「`ReferenceQueries.resolve` の結果にない紹介先（非公開・公開の取り下げ・削除・下書き）は、閲覧できない紹介先として返し」、`domains/discovery.md` の使い方の表の Bookmark・Article・Place の行
- 内容: 「入力にあって結果にない = 閲覧できない」という同じ規則を、Bookmark・Article・Place のユースケースが別々に持ち、入力の順と結果の突き合わせもそれぞれが行う。想定する次の要求「閲覧できない理由を管理側にだけ示す」では、`resolve` と、推論を持つすべての呼び出し側を直すことになる
- 代案: `resolve` が入力の全件に対して直和型を返す（`{ ref; status: "viewable"; entry } | { ref; status: "unavailable" }`）。欠落からの推論と順の突き合わせが呼び出し側から消え、規則は Discovery の1か所になる

## 7 条件の外

- `Standing` が3つのドメインで別の意味を持つ。Moderation「Standing | 申立人の立場」（`domains/moderation.md`）、Discovery「Standing | 対象の状態」、Authority `Stewardship.standingOf`／`TargetStanding`。`usecases/moderation.md` は `Stewardship.standingOf` と `standing: "proprietor"` を同じファイルで使い、`usecases/bookmark.md`・`usecases/article.md` は Discovery の `Standing.ofListing` を使う。同義語ではなく同音異義なので条件 4 の形にならない
- `domains/article.md` の `ShowcaseList.add`・`remove`・`move`・`includes` と `ARTICLE_SHOWCASE_INVALID_MOVE` を使うユースケースがない。`createArticle`・`reviseArticle` は紹介先の全体を `ShowcaseList.create` で置き換える。上流（EDT-02 の追加・並び替え・解除）には辿れるので条件 2 の形にならない
- `ArticleRepository` だけ `findByIds` を持たず、`listOpenTakedownClaims` は読みものが対象の申立てを1件ずつ `findById` で解決する（`usecases/moderation.md` 共通の扱い）。決定としては一意
- `domains/index.md`「開発の順序との対応」は Moderation を段階 2 に置くが、`submitTakedownClaim`・`getTakedownClaim` は `regionRepository`・`occasionRepository`（段階 3）と `articleRepository`（段階 5）を読み、Article の `removeArticlePhotoByTakedown` は段階 5 になる。段階 2 の時点の Moderation の範囲（対象の種類）を示す記述がない
- `TakedownOutcomeMailer` の「申立人に届くメールは1通。ポートが担保する」は、送信の引き受けと送信済みの記録の間の失敗では成り立たない。適合テストは逐次の2回目だけを確かめるので、テストと契約の文面の強さが合っていない
