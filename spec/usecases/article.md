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

## 操作の可否

どのユースケースも `Actor` を取り、操作する人の役割を `RoleRosterRepository.findRolesOf` で読んで `AccessPolicy.decide` に渡し、`edit_articles` で判断する。`allowed: false` なら `ForbiddenError` にする。申立てに基づく読みものの写真の削除は、Moderation の `takeDownPhotosByClaim`（[moderation.md](moderation.md)）が `Article.takeDownPhotos` を呼んで行う。

- 書き込みを持つユースケースは、役割の読み取りと可否の判断を、書き込みと同じ `run` の中で、書き込みの前に行う。先にコミットされた任命の解除は判断に反映され、任命を解かれた人の要求は成立しない
- 読みものは作成した人を持たず、可否は役割だけで決まる。可否の条件は `AccessPolicy` だけが持つ
- UnitOfWork の使い方は index.md の「UnitOfWork ポート」による。`roleRosterRepository` と `articleRepository` は `run` の中で読み、読み取りだけのユースケースも `run` を1つ使って書き込まずに返す。Discovery の `ReferenceQueries` と Media の `PhotoStorage` は `run` の外で呼ぶ

各ユースケースの節は、この2つ（`RoleRosterRepository.findRolesOf`、`AccessPolicy.decide`）と `ForbiddenError` を重ねて書かない。

`ArticleId` を受け取るユースケースは、`ArticleRepository.findById` が `null` を返せば `NotFoundError` にする。これも各節に重ねて書かない。

## createArticle

### 概要

読みものを下書きとして作成する。タイトル・写真・本文がそろっていなくても作成でき、公開条件を確かめない。紹介先の指す先があること、閲覧できることを確かめず、紹介先の管理者の承認も通知もない。内容の写真は、同じ UnitOfWork で読みものを持ち主にする。

冪等な作成。同じ `ArticleId` で同じ内容の要求は、書き込みなしに成功として扱う。

### 入出力

- 入力: `Actor`、呼び出し側が決めた `ArticleId`、内容（タイトル、本文、写真の `PhotoId` の並び、紹介先の並び）
- 出力: 作成した読みもの（下書き）
- 空文字と空白だけのタイトル・本文は、ないものとして扱う

### 使用するドメインの振る舞い・ポート

- `Article.create`、`Article.sameContent`
- `ArticleRepository.findById`、`insert`
- `PhotoAssetRepository.findByIds`、`save`
- `PhotoOwnership.claimAll`（`photoIds` は `addedPhotoIds`、`owner` は `{ kind: "article"; id }`、`by` は `Actor`）
- `Clock`

### トランザクション境界

- `run` を1つ使う
- スコープに含まれる書き込み: 読みものの `insert`、`claimAll` の結果のすべての `save`
- スコープ内で使うリポジトリ: `roleRosterRepository`、`articleRepository`、`photoAssetRepository`
- ロールバックが起きる条件: 可否の判断、値オブジェクトの規則、持ち主の設定のどれかが成立しない。写真の楽観ロックが競合する。読みものも持ち主の設定も残らない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 同じ `ArticleId` の読みものがあり、内容が違う | `ConflictError` |
| 同じ紹介先を重ねて結びつけている | `BusinessRuleError`（`ARTICLE_INVALID_SHOWCASE_LIST`） |
| タイトルが値オブジェクトの規則を満たさない。同じ写真を重ねて入れている | `BusinessRuleError`（`ARTICLE_INVALID_TITLE`、`ARTICLE_DUPLICATE_PHOTO`） |
| 写真が存在しない、削除の対象になっている | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`） |
| 写真がすでに持ち主を持つ | `BusinessRuleError`（`MEDIA_PHOTO_ALREADY_OWNED`） |
| 写真を登録した人が、操作する人と違う | `BusinessRuleError`（`MEDIA_PHOTO_NOT_REGISTRANT`） |

## reviseArticle

### 概要

読みものの内容（タイトル・本文・写真・紹介先）の全体を置き換えて保存する。公開状態は変えない。下書きと公開を取り下げた読みものは、公開条件を確かめずに保存できる。公開中の読みものは公開条件を確かめ、保存した時点で閲覧者への表示に反映される。

加わった写真は読みものを持ち主にし、外れた写真は `photos.released` で手放す。写真を加えて保存しただけでは、公開を取り下げた読みものは公開に戻らない。紹介先が閲覧できなくても保存できる。内容が変わらなければ、書き込みもドメインイベントもなしに成功する。

### 入出力

- 入力: `Actor`、`ArticleId`、編集担当者が読んだ時点の版、内容（`createArticle` と同じ）
- 出力: 保存した読みもの（公開状態は変わらない）

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`、`save`
- `Article.revise`（公開中の読みものの内容が公開条件を欠けば、`Article.missingRequirements` の項目を添えた `ARTICLE_PUBLISH_CONDITION_UNMET` を返す）
- `PhotoAssetRepository.findByIds`、`save`
- `PhotoOwnership.claimAll`（`photoIds` は `addedPhotoIds`）
- `collectEvents`（`photos.released`）
- `Clock`

### トランザクション境界

- `run` を1つ使う
- スコープに含まれる書き込み: 読みものの `save`、`claimAll` の結果のすべての `save`、`photos.released` の保存
- スコープ内で使うリポジトリ: `roleRosterRepository`、`articleRepository`、`photoAssetRepository`
- ロールバックが起きる条件: 可否の判断、版の一致、公開条件、値オブジェクトの規則、持ち主の設定のどれかが成立しない。読みものまたは写真の楽観ロックが競合する
- 写真の削除（Media）は `photos.released` の消費で結果整合になる

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 入力の版が、`findById` が返した版と違う（他の編集担当者の保存・公開・取り下げ、申立てによる写真の削除が先に確定している）。同時の保存が `save` で競合した | `ConflictError`。入力中の内容は反映されない |
| 公開中の読みものから、タイトル・本文・すべての写真のいずれかをなくしている | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目を示す |
| 同じ紹介先を重ねて結びつけている | `BusinessRuleError`（`ARTICLE_INVALID_SHOWCASE_LIST`） |
| タイトルが値オブジェクトの規則を満たさない。同じ写真を重ねて入れている | `BusinessRuleError`（`ARTICLE_INVALID_TITLE`、`ARTICLE_DUPLICATE_PHOTO`） |
| 加わった写真が存在しない・すでに持ち主を持つ・登録した人が違う | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`、`MEDIA_PHOTO_ALREADY_OWNED`、`MEDIA_PHOTO_NOT_REGISTRANT`） |

## publishArticle

### 概要

下書きまたは公開を取り下げた読みものを公開する。保存されている内容が公開条件（タイトル・写真・本文）を満たすときだけ成立する。紹介先が1つもなくても、閲覧できない紹介先があっても公開できる。承認を求めない。最初の公開の日時は、再び公開しても変わらない。

未保存の変更を伴う公開は、`reviseArticle` と `publishArticle` の2つの要求になる。公開が成立しなくても、保存した内容は公開していない状態のまま残る。

### 入出力

- 入力: `Actor`、`ArticleId`。版を含めない
- 出力: 公開した読みもの

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`、`save`
- `Article.publish`（公開条件を欠けば、`Article.missingRequirements` の項目を添えた `ARTICLE_PUBLISH_CONDITION_UNMET` を返す）
- `Clock`

### トランザクション境界

- `run` を1つ使う
- スコープに含まれる書き込みは読みものの `save`
- スコープ内で使うリポジトリは `roleRosterRepository`、`articleRepository`
- 可否の判断、公開状態、公開条件のどれかが成立しない、または `save` の楽観ロックが競合すると、ロールバックする
- 保存されている内容をそのまま公開するので、他の編集担当者が先に保存した内容も公開の対象になる
- ドメインイベントは出ない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 読みものがすでに公開中（他の編集担当者が先に公開している）。公開条件より先に判定する | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`）。前提の変化として現在の状態を示す。何も変わらない |
| タイトル・写真・本文のいずれかがない | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目を示す |
| 同時の保存・公開・取り下げが `save` で競合した | `ConflictError` |

## unpublishArticle

### 概要

公開中の読みものの公開を取り下げる。取り下げの事由は `byManager` になる。内容と紹介先の結びつけは保たれ、取り下げた後も編集と再びの公開ができる。

### 入出力

- 入力: `Actor`、`ArticleId`。版を含めない
- 出力: 公開を取り下げた読みもの（事由は `byManager`）

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`、`save`
- `Article.unpublish`
- `Clock`

### トランザクション境界

- `run` を1つ使う
- スコープに含まれる書き込みは読みものの `save`
- スコープ内で使うリポジトリは `roleRosterRepository`、`articleRepository`
- 可否の判断、公開状態のどれかが成立しない、または `save` の楽観ロックが競合すると、ロールバックする
- ドメインイベントは出ない

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 読みものが公開中でない（下書き、他の編集担当者が先に取り下げている、申立てによる写真の削除で取り下げられている） | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`）。前提の変化として現在の状態を示す。何も変わらない |
| 同時の保存・公開・取り下げが `save` で競合した | `ConflictError` |

## listArticlesForEditing

### 概要

すべての編集担当者の読みものを、状態で絞って、更新の新しい順（`ArticleRepository.findPage` の並び順。内容または公開状態が最後に変わった日時）で返す。申立てによる写真の削除で公開が取り下げられた読みものは、取り下げの事由（`photoTakedown`）で分かる。

### 入出力

- 入力: `Actor`、状態（下書き・公開・公開の取り下げのどれか、または絞らない）、`Pagination`
- 出力: 読みものの並び（それぞれの公開状態と取り下げの事由、申立てで写真が削除されたかどうか（`getArticleForEditing` と同じ `takenDown` による）が分かる）と、条件に合う全件数
- 条件に合う読みものがなければ、空の並びと件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findPage`

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `roleRosterRepository`、`articleRepository` を読む

### エラーケース

`ForbiddenError` のほかに、要件が振る舞いを定めるエラーはない。

## getArticleForEditing

### 概要

1件の読みものを、編集のために返す。合成をまたぐ規則は次のとおり。

- 紹介先は、読みものが持つ順のまま、それぞれに Discovery の `ReferenceQueries.resolve` の結果を添えて返す。閲覧できるかどうかの区別は `resolve` の契約が定め、このユースケースは判定の規則を持たない。閲覧できない紹介先（非公開・公開の取り下げ・削除・下書き）は、閲覧者向けの対象の情報を持たない。編集担当者がどの紹介先かを見分けて外せるよう、Moderation の `ContentDirectory.describe` で読んだ対象の有無と名称（削除された対象は有無だけ）を添える（`previewArticle` も同じ）。閲覧できない理由は返さない（画面は「記事に表示されない」ことを示す）。結びつけは残る
- 閲覧できる紹介先は、参照の場面の表示範囲で、状態（提供開始前・提供終了、休業・閉店、開催前・終了・中止）を区別して返す
- 申立てで写真が削除されたかどうかは、読みものの写真の並びの `takenDown` で決まる（いつ設定され、いつ消えるかは [../domains/index.md](../domains/index.md)「写真の並び」）。写真が残って公開が続く読みもの、下書き・公開の取り下げの読みものにも当たる

### 入出力

- 入力: `Actor`、`ArticleId`
- 出力: 読みもの（公開状態と取り下げの事由を含む）、申立てで写真が削除されたかどうか、紹介先それぞれの現在の状態（閲覧できるかどうか、閲覧できる紹介先の状態）
- 出力の版は、`reviseArticle` の入力になる

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`
- `ReferenceQueries.resolve`（Discovery。読みものの紹介先の全件を、持つ順のまま100件ずつに分けて呼ぶ）
- `ViewProjection.listingSummary`・`placeSummary`・`regionSummary`・`occasionSummary`（Discovery。`RegionContext` は `displayed`）、`Standing.ofListing`・`Standing.ofPlace`・`Standing.ofOccasion`
- `PhotoStorage.displayRefs`（Media）
- `Clock`（`LocalDate.fromInstant`）

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `roleRosterRepository`、`articleRepository` を読む
- `ReferenceQueries.resolve` と `PhotoStorage.displayRefs` は `run` の外で呼ぶ

### エラーケース

`ForbiddenError` のほかに、要件が振る舞いを定めるエラーはない。

## previewArticle

### 概要

公開していない読みもの（下書き、公開の取り下げ）の保存された内容について、閲覧者への見え方と、欠けている公開条件を返す。見え方は、記事（写真・本文・紹介先）と、読みものの一覧・フィードで紹介されるときの表現で、Discovery の `ViewProjection.previewArticle` が、閲覧者に返すのと同じ規則で投影する。公開条件を欠く内容も投影できる。閲覧者が閲覧できない紹介先は、見え方に現れず、見え方に現れないことが分かる形で返る。紹介先が1つもない読みものと、結びつけた紹介先がすべて閲覧できない読みものは区別できる。

確認は公開の必須手順ではなく、読みものを変えない。公開中の読みもの（他の編集担当者が先に公開している）が渡っても、エラーにせず同じ形の出力を返し、現在の公開状態（`published`）が値で分かる。

### 入出力

- 入力: `Actor`、`ArticleId`
- 出力: 閲覧者への見え方、見え方に現れない閲覧できない紹介先、欠けている公開条件（`title`・`photos`・`body` のうち欠けているもの。空なら公開できる）、現在の公開状態

### 使用するドメインの振る舞い・ポート

- `ArticleRepository.findById`
- `Article.missingRequirements`
- `ReferenceQueries.resolve`（Discovery。読みものの紹介先の全件を、持つ順のまま100件ずつに分けて呼ぶ）
- `ViewProjection.previewArticle`（Discovery。`content` は保存されている内容、`showcases` は `resolve` の結果のすべて。閲覧できる紹介先だけを見え方に投影し、閲覧できない紹介先はその旨とともに返す）
- `PhotoStorage.displayRefs`（Media）
- `Clock`（`LocalDate.fromInstant`）

### トランザクション境界

- `run` を1つ使い、書き込まない
- `run` の中で `roleRosterRepository`、`articleRepository` を読む
- `ReferenceQueries.resolve` と `PhotoStorage.displayRefs` は `run` の外で呼ぶ

### エラーケース

`ForbiddenError` のほかに、要件が振る舞いを定めるエラーはない。
