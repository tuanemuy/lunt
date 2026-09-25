# Article

読みものの内容、紹介先、公開状態を管理する。共有カーネルの型（`ArticleId`、`PhotoId`、`PhotoSet`、`ShowcaseRef`、`ContentRef`、`Publication`、`PhotosReleasedEvent`、`PhotosTakenDownEvent`、`SearchableText`、`KeywordRelevance`）、リポジトリの共通の契約、申立てに基づく写真の削除の分担は [index.md](index.md) が定める。

- 読みものはサービス全体に属し、地域・イベント・店舗に所属しない。紹介先との結びつきは所属を表さない（P-20）
- 読みものは `Suspension` を持たない。運営による非公開の対象にならない（B-48）
- 読みものを削除する振る舞いはない
- 作成・編集・公開・公開の取り下げは編集担当者の役割で、申立てに基づく写真の削除はサービス運営者の役割（Moderation の `takeDownPhotosByClaim`）で行う。可否は Authority の `AccessPolicy` が判断し、Article の振る舞いは操作する人を受け取らない。どの編集担当者も、すべての読みものに同じ操作を行える（I-05）

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Article | 読みもの | タイトル・写真・本文・紹介先を持つ記事 |
| ArticleContent | 読みものの内容 | タイトル、本文、写真、紹介先の組 |
| PublishableContent | 公開できる内容 | 公開条件（タイトル・写真・本文）を満たす内容 |
| Showcase | 紹介先 | 読みものが紹介する掲載・店舗・地域・イベント。`ShowcaseRef` で指す |
| ShowcaseList | 紹介先の一覧 | 順序つきで重複のない紹介先の並び。記事はこの順で紹介先を示す |
| Draft | 下書き | 一度も公開していない状態 |
| Published | 公開 | 閲覧者が閲覧できる状態 |
| Unpublished | 公開の取り下げ | 公開した後に、閲覧者が閲覧できなくなった状態 |
| UnpublishReason | 取り下げの事由 | 共有カーネルの `Publication` の `reason`。編集担当者の操作（`byManager`）か、申立てによる最後の写真の削除（`photoTakedown`）か |
| PhotoTakedown | 申立てによる写真の削除 | サービス運営者が、取り下げの申立てに基づいて読みものの写真を削除すること |

## エンティティ

### Article（集約ルート）

```ts
type ArticlePhoto = Readonly<{ photoId: PhotoId }>;

type ArticleContent = Readonly<{
  title: ArticleTitle | null;
  body: ArticleBody | null;
  photos: PhotoSet<ArticlePhoto>;
  showcases: ShowcaseList;
}>;

type PublishableContent = ArticleContent &
  Readonly<{
    title: ArticleTitle;
    body: ArticleBody;
    photos: PhotoSet<ArticlePhoto> &
      Readonly<{ items: readonly [ArticlePhoto, ...ArticlePhoto[]] }>;
  }>;

type ArticleBase = Readonly<{
  id: ArticleId;
  version: Version;
  updatedAt: Date;
}>;

type DraftArticle = ArticleBase &
  Readonly<{ publication: { status: "draft" }; content: ArticleContent }>;

type PublishedArticle = ArticleBase &
  Readonly<{
    publication: { status: "published"; firstPublishedAt: Date };
    content: PublishableContent;
  }>;

type UnpublishedArticle = ArticleBase &
  Readonly<{
    publication: {
      status: "unpublished";
      firstPublishedAt: Date;
      reason: "byManager" | "photoTakedown";
    };
    content: ArticleContent;
  }>;

type Article = DraftArticle | PublishedArticle | UnpublishedArticle;

type PublicationRequirement = "title" | "photos" | "body";
```

#### フィールド

| 名前 | 型 | 制約 |
| --- | --- | --- |
| `id` | `ArticleId` | 作成を要求する側が決める |
| `version` | `Version` | 進み方は index.md「リポジトリの共通の契約」による |
| `updatedAt` | `Date` | 内容または公開状態が最後に変わった日時。進み方は index.md「リポジトリの共通の契約」による。`ArticleRepository.findPage` の並び順の基準 |
| `publication` | `Publication` | 共有カーネルの公開状態。公開の取り下げの間は `reason` を持つ |
| `content` | `ArticleContent` | 公開中は `PublishableContent`。`photos.takenDown` は、申立てに基づいて写真が削除されたか（index.md「写真の並び」） |

#### 振る舞い

入力の型は次のとおり。空文字と空白だけのタイトル・本文は `null` として扱う。

```ts
type ArticleContentInput = Readonly<{
  title: string;
  body: string;
  photoIds: readonly PhotoId[];
  showcases: readonly ShowcaseRef[];
}>;

type ArticleEvent = PhotosTakenDownEvent | PhotosReleasedEvent;
```

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Article.create` | `params: { id: ArticleId; content: ArticleContentInput }`, `now: Date` | `{ entity: DraftArticle; addedPhotoIds: readonly PhotoId[] }` | 値オブジェクトを組み立てて下書きを作る。写真は `PhotoSet.of(…, "ARTICLE")` で作る。公開条件を確かめない。`addedPhotoIds` は内容のすべての写真。ドメインイベントは出さない |
| `Article.revise` | `article: Article`, `content: ArticleContentInput`, `now: Date` | `WithEventDrafts<Article, PhotosReleasedEvent> & { addedPhotoIds: readonly PhotoId[] }` | 内容の全体を置き換える。公開状態は変えない。公開中の読みものは、新しい内容が公開条件を欠けば、欠けている項目（`Article.missingRequirements`）を添えた `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。下書きと公開の取り下げは公開条件を確かめない。写真は、`PhotoSet.of(…, "ARTICLE")` で作った並びの `items` で `PhotoSet.replace(article.content.photos, …)` により置き換える（写真の `PhotoId` の並びが変われば `takenDown` は `false` になる。index.md「写真の並び」）。外れた写真を `photos.released` に載せ、加わった写真を `addedPhotoIds` で返す。内容が変わらなければ、状態が変わらない振る舞いとして、同じ `entity` と空の下書きを返す |
| `Article.publish` | `article: Article`, `now: Date` | `PublishedArticle` | 共有カーネルの `Publication.publish({ publication, suspension: { suspended: false } }, Article.missingRequirements(article.content), now, "ARTICLE")` で `published` にする。読みものは `Suspension` を持たないので、`{ suspended: false }` を渡す。判定の順とエラー（`COMMON_PUBLICATION_INVALID_TRANSITION`、欠けている項目を添えた `ARTICLE_PUBLISH_CONDITION_UNMET`）は、この関数が持つ（index.md「公開状態と運営による非公開の関数」）。紹介先の件数と、紹介先が閲覧できるかどうかは条件にしない |
| `Article.unpublish` | `article: Article`, `now: Date` | `UnpublishedArticle` | 共有カーネルの `Publication.unpublish({ publication, suspension: { suspended: false } }, "byManager", "ARTICLE")` で `unpublished` にする。公開中でなければ、この関数が `COMMON_PUBLICATION_INVALID_TRANSITION` にする。内容と紹介先は保つ |
| `Article.takeDownPhotos` | `article: Article`, `photoIds: readonly [PhotoId, ...PhotoId[]]`, `now: Date` | `WithEventDrafts<Article, ArticleEvent>` | 申立てに基づいて、共有カーネルの `PhotoSet.takeDown(article.content.photos, photoIds, "ARTICLE")` で写真を外す（`takenDown` は `true` になる）。申立てを受け取らない。`photoIds` に読みものの写真でないものがあれば、この関数が `BusinessRuleError`（`ARTICLE_PHOTO_NOT_FOUND`）にし、1枚も外さない。残る写真の順は変えず、1枚目を外すと残る先頭の写真が代表写真になる。公開中の読みものの写真がなくなると、`Publication.unpublish({ publication, suspension: { suspended: false } }, "photoTakedown", "ARTICLE")` で `unpublished` にする。下書きと公開の取り下げの読みものは、公開状態も `reason` も変えない。外した写真を載せた `content.photos_taken_down`（`owner` は `{ kind: "article"; id }`）と `photos.released` の下書きを返す |
| `Article.missingRequirements` | `content: ArticleContent` | `readonly PublicationRequirement[]` | 公開条件のうち欠けている項目を返す。空なら公開条件を満たす。公開条件の判定はこの関数だけが持ち、`publish`・`revise` と、公開前の確認が使う |
| `Article.searchableText` | `article: Article` | `SearchableText` | 1つのキーワードで読みものを探す読み取り（Discovery のキーワード検索）の対象の文字列の全体。`primary` はタイトル（タイトルのない読みものは空の文字列）、`secondary` は本文。値のない項目は含めない。一致と関連度は、この値に共有カーネルの `KeywordRelevance` を当てて決める |
| `Article.sameContent` | `article: Article`, `content: ArticleContentInput` | `boolean` | 内容が等しいかを返す。冪等な作成の判定に使う |
| `Article.reconstruct` | 保存された値 | `Article` | 値オブジェクトを通して組み立て直す。不変条件を欠く値は `RehydrationError` |

`create` は `updatedAt` を `now` にする。

エラー（すべて `BusinessRuleError`）は次のとおり。

| コード | 状況 |
| --- | --- |
| `ARTICLE_PUBLISH_CONDITION_UNMET` | 公開条件を欠く内容での公開、または公開中の読みものの保存。欠けている項目（`Article.missingRequirements` の結果）を添える |
| `ARTICLE_PHOTO_NOT_FOUND` | `takeDownPhotos` の `photoIds` に、読みものの写真でないものがある |
| `COMMON_PUBLICATION_INVALID_TRANSITION`（共有カーネル） | 公開中の読みものの公開、公開中でない読みものの公開の取り下げ |
| `ARTICLE_INVALID_TITLE`、`ARTICLE_INVALID_BODY`、`ARTICLE_DUPLICATE_PHOTO`、`ARTICLE_INVALID_SHOWCASE_LIST` | `create`・`revise` の内容が値オブジェクトの規則を満たさない（下の「値オブジェクト」） |

#### 不変条件

- 公開中の読みものの内容は、タイトル・本文を持ち、写真を1枚以上持つ
- 写真の `PhotoId` は重複しない。紹介先は重複しない
- `firstPublishedAt` は最初の公開の日時で、再び公開しても変わらない
- 紹介先が閲覧できなくなっても、結びつけは編集担当者が外すまで残る。本文は、紹介先の変化で書き換わらない（B-10、B-12）。Article は紹介先の状態を持たず、ドメインイベントを消費しない

#### ライフサイクル

- 生成: `Article.create` で下書きとして生まれる。内容は空でもよい
- 遷移

| 遷移 | きっかけ |
| --- | --- |
| `draft → published` | `publish` |
| `published → unpublished`（`byManager`） | `unpublish` |
| `published → unpublished`（`photoTakedown`） | `takeDownPhotos` で写真がなくなる |
| `unpublished → published` | `publish`。写真を加えて保存しただけでは公開に戻らない |

- 終わりの状態はない。削除しない

## 値オブジェクト

| 名前 | フィールド | バリデーション | 等価性 |
| --- | --- | --- | --- |
| `ArticleTitle` | 文字列のブランド型 | 前後の空白を除く。1〜100文字。改行を含まない。満たさなければ `BusinessRuleError`（`ARTICLE_INVALID_TITLE`） | 文字列の一致 |
| `ArticleBody` | 文字列のブランド型 | 前後の空白を除いて1文字以上、20,000文字以下。改行を含められる。書式を持たない。満たさなければ `BusinessRuleError`（`ARTICLE_INVALID_BODY`） | 文字列の一致 |
| `ShowcaseList` | `readonly ShowcaseRef[]` | 同じ `kind` と `id` の紹介先を2つ持たない。順序を持つ。件数の上限を持たない | 同じ紹介先が同じ順に並ぶ |
| `PhotoSet<ArticlePhoto>` | 共有カーネル | 共有カーネルの規則。見せる範囲を持たない。`photoIds` に同じ `PhotoId` が重なれば、`PhotoSet.of` が `BusinessRuleError`（`ARTICLE_DUPLICATE_PHOTO`） | 同じ `PhotoId` が同じ順に並ぶ |

`ShowcaseList` は `ShowcaseList.create(refs: readonly ShowcaseRef[]): ShowcaseList` で作る。重複があれば `BusinessRuleError`（`ARTICLE_INVALID_SHOWCASE_LIST`）。紹介先の追加・並び替え・解除は、編集の保存（`Article.revise`）が一覧の全体を置き換えて反映する。

## ドメインサービス

持たない。規則は `Article` と値オブジェクトの純粋な関数で足りる。

## ドメインイベント

| 型名 | ペイロード | いつ出るか | 消費者 |
| --- | --- | --- | --- |
| `content.photos_taken_down`（共有カーネル） | `{ owner: ContentRef; photoIds: readonly PhotoId[]; unpublished: boolean }` | `takeDownPhotos` が成立したとき。`owner` は `{ kind: "article"; id }`、`photoIds` は外した写真。`unpublished` は、この削除で公開していない状態になったかどうか。すでに下書き・公開の取り下げだった読みものは `false` | Notification（[notification.md](notification.md) の対応の表） |
| `photos.released`（共有カーネル） | `{ photoIds: readonly PhotoId[] }` | `revise` が写真を外したとき、`takeDownPhotos` が成立したとき | Media |

`aggregateId` は `ArticleId`。作成・公開・公開の取り下げと、写真を外さない保存は、消費者がないためドメインイベントを出さない。写真を外した保存は、上の表の `photos.released` だけを出す。紹介先の変化の通知（P-96）は、紹介先のドメインのドメインイベントを Notification が消費し、`ArticleRepository.findPublishedByShowcases` で読みものを引いて作る。

## ポート

### ArticleRepository

読みものの集約を保存し、管理側の読み取りを提供する。`UnitOfWorkContext` に `articleRepository` として現れる。

```ts
type ArticleStatus = "draft" | "published" | "unpublished";

interface ArticleRepository
  extends Omit<TransactionalRepository<Article, ArticleId>, "delete"> {
  findPage(
    filter: { status: ArticleStatus | null },
    pagination: Pagination,
  ): Promise<PaginationResult<Article>>;

  findPublishedByShowcases(
    refs: readonly ShowcaseRef[],
    pagination: Pagination,
  ): Promise<PaginationResult<PublishedArticle>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save` | リポジトリの共通の契約による。`save` は楽観ロックを使う。ID のほかに一意性はない。読みものは削除しないので、`delete` を持たない |
| `findPage` | すべての編集担当者の読みものを返す。`status` が `null` ならすべての状態、値があればその状態だけ。並び順は `updatedAt` の新しい順、同順位は ID の昇順。`count` は絞り込みに合う全件数 |
| `findPublishedByShowcases` | `refs` のどれかを紹介先に持つ、公開中の読みものを返す。1つの読みものは1回だけ現れる。`refs` は絞り込みの条件で、件数に上限を持たない。0件なら空を返す。並び順は `firstPublishedAt` の新しい順、同順位は ID の昇順。下書きと公開の取り下げの読みものは返さない |

- エラー: `ConflictError`（同じ ID の `insert`、版の違う `save`）、`NotFoundError`（対象のない `save`）。保存先の障害と、保存された値が不変条件を欠く場合の扱いは、アダプターの責務で、契約の項目にしない
- 並行性: 編集の保存の要求は、編集担当者が読んだ時点の版を含む。ユースケースは、`findById` が返した版と違えば `ConflictError` にする。公開・公開の取り下げ・申立てに基づく写真の削除は版を含めず、`findById` が返した版で `save` する。すでにその状態であること（他の編集担当者が先に公開した、先に取り下げた）は、前提の変化として `COMMON_PUBLICATION_INVALID_TRANSITION` で返し、同時の書き込みは `save` の楽観ロックで守る
- 可視性: コミットした書き込みは、以後の `findById`・`findPage`・`findPublishedByShowcases` に即座に反映される
- 参照整合性: 紹介先の指す先があること、閲覧できることを、保存の条件にしない（EDT-02 の異常系）。閲覧できない紹介先は、Discovery の読み取りに現れない
- 閲覧者向けの読み取り（記事、読みものの一覧、フィード、検索、紹介先から読みものをたどる問い合わせ、紹介先それぞれの現在の状態）は Discovery が持つ。`findPublishedByShowcases` は、通知の宛先になる読みものを引くための問い合わせで、閲覧者への表示に使わない

## トランザクション境界

| 書き込み | 1つの UnitOfWork で確定する範囲 |
| --- | --- |
| 作成 | 読みものの `insert`、`addedPhotoIds` の写真の持ち主の設定（Media のポート） |
| 編集の保存 | 読みものの `save`、`addedPhotoIds` の写真の持ち主の設定、`photos.released` の保存 |
| 公開、公開の取り下げ | 読みものの `save` |
| 申立てによる写真の削除（Moderation の `takeDownPhotosByClaim`） | 読みものの `save`、`content.photos_taken_down` と `photos.released` の保存 |

写真の削除（Media）と通知（Notification）は、ドメインイベントの消費で結果整合にする。未保存の変更を持ったままの公開は、保存の要求と公開の要求の2つの UnitOfWork になり、公開が成立しなくても保存した内容は残る。

## ユースケース（概要）

各ユースケースは、書き込みの前に、操作する人の役割を Authority のポートから読み、`AccessPolicy` で確かめ、編集担当者の役割を求める。申立てに基づく写真の削除は、Moderation の `takeDownPhotosByClaim` が `Article.takeDownPhotos` を呼んで行う。任命を解かれた人の要求は、この時点で成立しない（AC-75）。

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `createArticle` | 読みものを下書きとして作成する。同じ ID で同じ内容の要求は成功として扱う | EDT-01、EDT-02 |
| `reviseArticle` | タイトル・本文・写真・紹介先を置き換えて保存する。公開中の読みものは公開条件を確かめる | EDT-02、EDT-04、EDT-06、MOD-03 |
| `publishArticle` | 下書きまたは公開を取り下げた読みものを公開する | EDT-03、MOD-03 |
| `unpublishArticle` | 公開中の読みものの公開を取り下げる | EDT-05 |
| `listArticlesForEditing` | すべての読みものを、状態別に、更新の新しい順で返す。申立てによる写真の削除で取り下げられた読みものは、`publication.reason` で分かる。申立てで写真が削除されたかどうかは `content.photos.takenDown` で分かる | EDT-01、EDT-03、EDT-04、EDT-05 |
| `getArticleForEditing` | 1件の読みものと、紹介先それぞれの現在の状態（Discovery の `ReferenceQueries.resolve` の結果）、申立てで写真が削除されたかどうかを返す | EDT-02、EDT-04、EDT-06、MOD-03 |
| `previewArticle` | 公開していない読みものの、閲覧者への見え方と、欠けている公開条件を返す。見え方は、紹介先を Discovery の `ReferenceQueries.resolve` で解決した結果のすべてを `ViewProjection.previewArticle` に渡して得る。閲覧できない紹介先は、見え方に現れず、閲覧できないことが分かる形で返る。公開中の読みものには、現在の公開状態を値で返す | EDT-03 |
