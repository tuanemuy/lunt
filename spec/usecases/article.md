# Article のユースケース

ドメイン: Article（[../domains/article.md](../domains/article.md)）

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `createArticle` | 読みものを下書きとして作成する | EDT-01、EDT-02 / AM-02 |
| `reviseArticle` | タイトル・本文・写真・紹介先を置き換えて保存する | EDT-02、EDT-04、EDT-06、MOD-03 / AM-02 |
| `publishArticle` | 下書きまたは公開を取り下げた読みものを公開する | EDT-03、MOD-03 / AM-02、CM-03 |
| `unpublishArticle` | 公開中の読みものの公開を取り下げる | EDT-05 / AM-02 |
| `listArticlesForEditing` | すべての読みものを、状態別に、更新の新しい順で返す | EDT-01、EDT-03、EDT-04、EDT-05 / AM-01 |
| `getArticleForEditing` | 1件の読みものと、紹介先それぞれの現在の状態を返す | EDT-02、EDT-04、EDT-06、MOD-03 / AM-02 |
| `previewArticle` | 公開していない読みものの、閲覧者への見え方と、欠けている公開条件を返す | EDT-03 / CM-03 |
| `takeDownArticlePhotos` | サービス運営者が、申立てに基づいて読みものの写真を削除する | MOD-02 / OM-04 |

## 操作の可否

どのユースケースも `Actor` を取り、操作する人の役割を `RoleRosterRepository.findRolesOf` で読んで `AccessPolicy.decide` に渡す。`takeDownArticlePhotos` は `operate_service`、ほかは `edit_articles` で判断する。`allowed: false` なら `ForbiddenError` にする。

- 書き込みを持つユースケースは、役割の読み取りと可否の判断を、書き込みと同じ UnitOfWork の中で、書き込みの前に行う。先にコミットされた任命の解除は判断に反映され、任命を解かれた人の要求は成立しない
- どの編集担当者も、誰が作成した読みものにも同じ操作を行える。サービス運営者・店舗管理者・地域運営者・イベント運営者は、編集担当者の役割がなければ `ForbiddenError` になる

各ユースケースの節は、この2つ（`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`）と `ForbiddenError` を重ねて書かない。

`ArticleId` を受け取るユースケースは、`ArticleRepository.findById` が `null` を返せば `NotFoundError` にする。これも各節に重ねて書かない。

## createArticle

### 概要

読みものを下書きとして作成する。タイトル・写真・本文がそろっていなくても作成でき、公開条件を確かめない。紹介先の指す先があること、閲覧できることを確かめず、紹介先の管理者の承認も通知もない。内容の写真は、同じ UnitOfWork で読みものを持ち主にする。

冪等な作成。同じ `ArticleId` で同じ内容の要求は、書き込みなしに成功として扱う。

### 入出力

- 入力: `Actor`、呼び出し側が決めた `ArticleId`、内容（タイトル、本文、写真の `PhotoId` の並び、紹介先の並び）
- 出力: 作成した読みもの（ID、内容、公開状態、版）
- 空文字と空白だけのタイトル・本文は、ないものとして扱う

### 使用するドメインの振る舞い・ポート

- `Article.create`、`Article.sameContent`
- `ArticleRepository.findById`、`insert`
- `PhotoAssetRepository.findByIds`、`save`
- `PhotoOwnership.claimAll`（`photoIds` は `addedPhotoIds`、`owner` は `{ kind: "article"; id }`、`by` は `Actor`）
- `Clock`

### トランザクション境界

UnitOfWork を使う。

- スコープに含まれる書き込み: 読みものの `insert`、`claimAll` の結果のすべての `save`
- スコープ内で使うリポジトリ: `roleRosterRepository`、`articleRepository`、`photoAssetRepository`
- ロールバックが起きる条件: 可否の判断、値オブジェクトの規則、持ち主の設定のどれかが成立しない。写真の楽観ロックが競合する。読みものも持ち主の設定も残らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 同じ `ArticleId` の読みものがあり、内容が違う | `ConflictError` |
| 同じ紹介先を重ねて結びつけている | `BusinessRuleError`（`ARTICLE_SHOWCASE_DUPLICATED`） |
| 紹介先が100件を超える | `BusinessRuleError`（`ARTICLE_SHOWCASE_LIMIT_EXCEEDED`） |
| タイトル・本文・写真の並びが値オブジェクトの規則を満たさない | `BusinessRuleError`（値オブジェクトのコード） |
| 写真が存在しない、削除の対象になっている | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`） |
| 写真がすでに持ち主を持つ | `BusinessRuleError`（`MEDIA_PHOTO_ALREADY_OWNED`） |
| 写真を登録した人が、操作する人と違う | `BusinessRuleError`（`MEDIA_PHOTO_NOT_REGISTRANT`） |

## reviseArticle

### 概要

読みものの内容（タイトル・本文・写真・紹介先）の全体を置き換えて保存する。公開状態は変えない。下書きと公開を取り下げた読みものは、公開条件を確かめずに保存できる。公開中の読みものは公開条件を確かめ、保存した時点で閲覧者への表示に反映される。

加わった写真は読みものを持ち主にし、外れた写真は `PhotosReleased` で手放す。写真を加えて保存しただけでは、公開を取り下げた読みものは公開に戻らない。紹介先が閲覧できなくても保存できる。内容が変わらなければ、書き込みもドメインイベントもなしに成功する。

### 入出力

- 入力: `Actor`、`ArticleId`、編集担当者が読んだ時点の版、内容（`createArticle` と同じ）
- 出力: 保存した読みもの（内容、公開状態、版）

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`、`save`
- `Article.revise`、`Article.missingRequirements`（欠けている項目をエラーに添える）
- `PhotoAssetRepository.findByIds`、`save`
- `PhotoOwnership.claimAll`（`photoIds` は `addedPhotoIds`）
- `collectEvents`（`PhotosReleased`）
- `Clock`

### トランザクション境界

UnitOfWork を使う。

- スコープに含まれる書き込み: 読みものの `save`、`claimAll` の結果のすべての `save`、`PhotosReleased` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`articleRepository`、`photoAssetRepository`
- ロールバックが起きる条件: 可否の判断、版の一致、公開条件、値オブジェクトの規則、持ち主の設定のどれかが成立しない。読みものまたは写真の楽観ロックが競合する
- 写真の削除（Media）は `PhotosReleased` の消費で結果整合になる

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 入力の版が、`findById` が返した版と違う（他の編集担当者の保存・公開・取り下げ、申立てによる写真の削除が先に確定している）。同時の保存が `save` で競合した | `ConflictError`。入力中の内容は反映されない |
| 公開中の読みものから、タイトル・本文・すべての写真のいずれかをなくしている | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目を示す |
| 同じ紹介先を重ねて結びつけている | `BusinessRuleError`（`ARTICLE_SHOWCASE_DUPLICATED`） |
| 紹介先が100件を超える | `BusinessRuleError`（`ARTICLE_SHOWCASE_LIMIT_EXCEEDED`） |
| タイトル・本文・写真の並びが値オブジェクトの規則を満たさない | `BusinessRuleError`（値オブジェクトのコード） |
| 加わった写真が存在しない・すでに持ち主を持つ・登録した人が違う | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_ALREADY_OWNED`、`MEDIA_PHOTO_NOT_REGISTRANT`） |

## publishArticle

### 概要

下書きまたは公開を取り下げた読みものを公開する。保存されている内容が公開条件（タイトル・写真・本文）を満たすときだけ成立する。紹介先が1つもなくても、閲覧できない紹介先があっても公開できる。承認を求めない。最初の公開の日時は、再び公開しても変わらない。

未保存の変更を伴う公開は、`reviseArticle` と `publishArticle` の2つの要求になる。公開が成立しなくても、保存した内容は公開していない状態のまま残る。

### 入出力

- 入力: `Actor`、`ArticleId`。版を含めない
- 出力: 公開した読みもの（公開状態、版）

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`、`save`
- `Article.publish`、`Article.missingRequirements`（欠けている項目をエラーに添える）
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは読みものの `save`。スコープ内で使うリポジトリは `roleRosterRepository`、`articleRepository`。可否の判断、公開状態、公開条件のどれかが成立しない、または `save` の楽観ロックが競合すると、ロールバックする。保存されている内容をそのまま公開するので、他の編集担当者が先に保存した内容も公開の対象になる。ドメインイベントは出ない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 読みものがすでに公開中（他の編集担当者が先に公開している）。公開条件より先に判定する | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。前提の変化として現在の状態を示す。何も変わらない |
| タイトル・写真・本文のいずれかがない | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目を示す |
| 同時の保存・公開・取り下げが `save` で競合した | `ConflictError` |

## unpublishArticle

### 概要

公開中の読みものの公開を取り下げる。取り下げの事由は `byManager` になる。内容と紹介先の結びつけは保たれ、取り下げた後も編集と再びの公開ができる。

### 入出力

- 入力: `Actor`、`ArticleId`。版を含めない
- 出力: 公開を取り下げた読みもの（公開状態、版）

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`、`save`
- `Article.unpublish`
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは読みものの `save`。スコープ内で使うリポジトリは `roleRosterRepository`、`articleRepository`。可否の判断、公開状態のどれかが成立しない、または `save` の楽観ロックが競合すると、ロールバックする。ドメインイベントは出ない。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 読みものが公開中でない（下書き、他の編集担当者が先に取り下げている、申立てによる写真の削除で取り下げられている） | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。前提の変化として現在の状態を示す。何も変わらない |
| 同時の保存・公開・取り下げが `save` で競合した | `ConflictError` |

## listArticlesForEditing

### 概要

すべての編集担当者の読みものを、状態で絞って、更新の新しい順で返す。申立てによる写真の削除で公開が取り下げられた読みものは、取り下げの事由（`photoTakedown`）で分かる。

### 入出力

- 入力: `Actor`、状態（下書き・公開・公開の取り下げのどれか、または絞らない）、`Pagination`
- 出力: 読みものの並び（ID、タイトル、公開状態と取り下げの事由、更新の日時が分かる粒度）と、条件に合う全件数
- 条件に合う読みものがなければ、空の並びと件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findPage`

### トランザクション境界

UnitOfWork は不要。読み取りだけを行う。

### エラーケース

`ForbiddenError` のほかに、要件が振る舞いを定めるエラーはない。

## getArticleForEditing

### 概要

1件の読みものを、編集のために返す。合成をまたぐ規則は次のとおり。

- 紹介先は、読みものが持つ順のまま、それぞれに Discovery の `ReferenceQueries.resolve` の結果を添えて返す。閲覧できるかどうかの区別は `resolve` の契約が定め、このユースケースは判定の規則を持たない。閲覧できない紹介先（非公開・公開の取り下げ・削除・下書き）は、対象の情報を持たない。結びつけは残る
- 閲覧できる紹介先は、参照の場面の表示範囲で、状態（提供開始前・提供終了、休業・閉店、開催前・終了・中止）を区別して返す

### 入出力

- 入力: `Actor`、`ArticleId`
- 出力: 読みもの（内容、公開状態と取り下げの事由、版）、写真の表示用の参照、紹介先それぞれの現在の状態
- 出力の版は、`reviseArticle` の入力になる

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`
- `ReferenceQueries.resolve`（Discovery。読みものの紹介先の全件を1回で渡す。`ShowcaseList` は100件までなので、`resolve` の件数の上限に収まる）
- `ViewProjection.listingSummary`・`placeSummary`・`regionSummary`・`occasionSummary`（Discovery。`RegionContext` は `displayed`）、`Standing.ofListing`・`Standing.ofPlace`・`Standing.ofOccasion`
- `PhotoStorage.displayRefs`（Media）
- `Clock`（`LocalDate.fromInstant`）

### トランザクション境界

UnitOfWork は不要。読み取りだけを行う。

### エラーケース

`ForbiddenError` のほかに、要件が振る舞いを定めるエラーはない。

## previewArticle

### 概要

公開していない読みもの（下書き、公開の取り下げ）の保存された内容について、閲覧者への見え方と、欠けている公開条件を返す。見え方は、記事（写真・本文・紹介先）と、読みものの一覧・フィードで紹介されるときの表現で、Discovery の `ViewProjection.previewArticle` が、閲覧者に返すのと同じ規則で投影する。公開条件を欠く内容も投影できる。閲覧者が閲覧できない紹介先は、見え方に現れない。

確認は公開の必須手順ではなく、読みものを変えない。公開中の読みもの（他の編集担当者が先に公開している）が渡っても、エラーにせず同じ形の出力を返し、現在の公開状態（`published`）が値で分かる。

### 入出力

- 入力: `Actor`、`ArticleId`
- 出力: 閲覧者への見え方、欠けている公開条件（`title`・`photos`・`body` のうち欠けているもの。空なら公開できる）、現在の公開状態、版

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`
- `Article.missingRequirements`
- `ReferenceQueries.resolve`（Discovery。読みものの紹介先の全件を1回で渡す）
- `ViewProjection.previewArticle`（Discovery。`content` は保存されている内容、`showcases` は `resolve` の結果）
- `PhotoStorage.displayRefs`（Media）
- `Clock`（`LocalDate.fromInstant`）

### トランザクション境界

UnitOfWork は不要。読み取りだけを行う。

### エラーケース

`ForbiddenError` のほかに、要件が振る舞いを定めるエラーはない。

## takeDownArticlePhotos

### 概要

サービス運営者が、未対応の取り下げの申立ての対象である読みものから、写真を1枚以上削除する。削除できる写真は、申立人が示した写真に限らず、その読みもののどの写真でもよい。残る写真の順は変わらず、1枚目を削除すると残る先頭の写真が代表写真になる。公開中の読みものの写真がなくなると、公開が取り下げられ、事由は `photoTakedown` になる。

申立ては書き換えない。申立てを対応済みにする操作は、Moderation の別の UnitOfWork になる。削除は確定の時点で反映され、対応を終える要求を待たない。削除した写真は戻せない。

### 入出力

- 入力: `Actor`、`TakedownClaimId`、`ArticleId`、削除する写真の `PhotoId`（1枚以上。重複しない）。版を含めない
- 出力: 削除の後の読みもの（残る写真、公開状態と取り下げの事由）

### 使用するドメインの振る舞い・ポート

- `AccessPolicy.decide`（`operate_service`）
- `TakedownClaimRepository.findById`
- `TakedownClaim.authorizePhotoRemoval`（`owner` は `{ kind: "article"; id }`）
- `ArticleRepository.findById`、`save`（`findById` が返した版で保存する）
- `Article.takeDownPhotos`
- `collectEvents`（`article.photos_taken_down`、`PhotosReleased`）
- `Clock`

### トランザクション境界

UnitOfWork を使う。

- スコープに含まれる書き込み: 読みものの `save`、`article.photos_taken_down` と `PhotosReleased` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`takedownClaimRepository`（読み取りだけ）、`articleRepository`
- ロールバックが起きる条件: 可否の判断、申立ての前提、写真の有無のどれかが成立しない。読みものの楽観ロックが競合する
- 写真の実体と記録の削除（Media）、すべての編集担当者への通知（Notification）は、ドメインイベントの消費で結果整合になる

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 操作する人がサービス運営者でない（編集担当者だけの人を含む） | `ForbiddenError` |
| 申立てがない | `NotFoundError` |
| 申立てが対応済み（別のサービス運営者が先に対応を終えた） | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`） |
| 申立ての対象が、その読みものでない | `BusinessRuleError`（`TAKEDOWN_TARGET_MISMATCH`） |
| 削除する写真に、読みものにない写真がある（編集担当者が先に外している、すでに削除している） | `BusinessRuleError`（`ARTICLE_PHOTO_NOT_FOUND`）。1枚も削除されず、読みものは変わらない |
| 編集担当者の保存・公開・取り下げが、同時に確定している | `ConflictError`。読み直してやり直す |
