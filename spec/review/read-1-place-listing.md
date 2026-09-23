# 独立した読み 1: domains/index.md、Area・Place・Listing・Media

区分: `spec/domains/index.md`、`spec/domains/`・`spec/usecases/` の area・place・listing・media、`spec/testcases/area/`・`place/`・`listing/`・`media/`、この4ドメインのポートの `spec/testcases/ports/`（areaCatalog、placeRepository、listingRepository、categoryCatalogRepository、offeringPhaseLedger、photoAssetRepository、photoStorage、photoInspector）。上流として `spec/scenario/shop.md`・`listing.md`・`moderation.md`・`operation.md` と、`spec/pages/shop.md`・`operation.md`・`index.md`・`browse.md` の関係する箇所を読んだ。

反例の一覧だけを書く。成立の認定はしない。

## 条件 1 要求を取りこぼしていない

反例は見つけていない。

## 条件 2 足しすぎていない

反例は見つけていない。

## 条件 3 Issue をまたぐ決定が決まりきっている

反例は見つけていない（営業状況の変更の版の扱いは条件 4 の 4-2、申立てに基づく写真の削除の枚数は条件 7 の 7-1 に書いた）。

## 条件 4 矛盾がなく、現在形で単体で読める

### 4-1 spec の外の作業メモへの参照。契約の ID と衝突する番号

引用:

- `spec/domains/listing.md` ユビキタス言語「Offering … どれか1つ（decisions-mid M-13、CF-06）」「OfferingPeriod … どちらか一方だけでもよい（decisions-scenario L-2）」「ListingPatch … 変更した項目だけの値（decisions-mid M-6）」
- `spec/domains/listing.md` Listing の振る舞い `createDraft`「内容は空でよい（decisions-scenario L-1）」、`duplicate`「`offering` は `{ kind: "none" }` にする（decisions-scenario L-3）」、`applyPatch`「（decisions-mid M-6）」、`removePhotoByTakedown`「運営による非公開の間も同じ（decisions-mid M-14）」、ライフサイクル「（M-31、decisions-scenario L-2）」、CategoryCatalog の不変条件「追加したカテゴリーは最後に入る（decisions-scenario O-1）」
- `spec/domains/place.md` ユビキタス言語「PlaceRevision … 情報修正の申請の内容（M-6）」、ドメインイベントの節「店舗管理者宛ての通知の宛先を Notification がサービス運営者に決める（M-15）」
- `spec/domains/area.md` AreaCatalog のメソッドごとの契約 `findTownsByPostalCode`「…`ValidationError`（町域の候補がない）にする（M-1）」

反例の内容: 定義のない参照。`decisions-mid`・`decisions-scenario` は `spec/review/` の作業メモで、spec の層にも契約にも定義がない（`spec/index.md` のどのリンクからも辿れない）。place.md と area.md の「M-6」「M-15」「M-1」は接頭辞なしで書かれていて、契約の台帳の ID と衝突する。契約の M-15 は「商品・体験・景色・見どころを共通の掲載として登録できる」で、同じ listing.md の「Listing … 種類はカテゴリーが兼ねる（M-15、B-24）」はこちらを指す。place.md の「（M-15）」は通知の宛先の話で、契約の M-15 とは別物。契約に M-1・M-6 はなく、M-06 は X-02 で範囲の外。読み手は参照先を契約から引けず、単体で読めない。同じ型の参照は区分の外の `domains/application.md`・`domains/discovery.md` にもある（`decisions-scenario A-0`、`decisions-mid M-12` など）。

### 4-2 「状態を変えるだけの要求は版を含めない」と、営業状況の変更

引用:

- `spec/domains/index.md` 編集の競合「状態を変えるだけの要求（公開、非公開、中止、対応済みなど）は版を含めず、すでにその状態であることは前提の変化として `BusinessRuleError` で返し、同時の書き込みは `save` の楽観ロックで守る」。版を含める側の列挙は「店舗・掲載・地域・イベント・読みものの内容の更新、参加内容の変更、申請の再提出と取り下げ」と「申請の承認・否認・差し戻し」
- `spec/domains/place.md` PlaceRepository「店舗情報の更新と営業状況の変更は、読んだときの `Place.version` を要求に含め…違えば `ConflictError` にする」
- `spec/usecases/place.md` changeOperatingStatus「入力: …現在の営業状況を読んだときの版」「版が一致し、現在と同じ営業状況なら、書き込みもドメインイベントもなしに、現在の店舗を返す」

反例の内容: 営業状況の変更は営業中・休業・閉店という状態だけを変える要求で、index.md の区分では「版を含めない・すでにその状態なら `BusinessRuleError`」の側に入る（同じ型のイベントの中止は版を含めない）。place.md と usecases/place.md は逆に、版を含め、同じ状態は成功として返す。index.md の規則は、どちらの列挙にも営業状況を挙げていないので、規則だけからは place.md の扱いを導けない。上流（SHP-07 の異常系「確定する前に、別の店舗管理者が営業状況を変えた → 競合が示され、確定されない」）は place.md の側を求めているので、食い違いは index.md の規則の側にある。

### 4-3 同じ操作を指すユースケースの名前が、ドメインごとに違う

引用:

- 運営による非公開の解除: `usecases/place.md`「unsuspendPlace」、`usecases/listing.md`「unsuspendListing」に対し、`usecases/region.md`「liftRegionSuspension」、`usecases/occasion.md`「liftOccasionSuspension」（`flows/index.md` F-13 の表が4つを同じ行に並べている）
- 申立てに基づく写真の削除: `usecases/place.md`「removePlacePhotosByClaim」、`usecases/listing.md`「removeListingPhotoByTakedown」、`usecases/article.md`「removeArticlePhotoByTakedown」、`usecases/region.md`「takeDownRegionPhotos」、`usecases/occasion.md`「takeDownOccasionPhotos」。集約の振る舞いも `Place.removePhotosByClaim`・`Listing.removePhotoByTakedown`・`Region.takeDownPhotos`
- サービス運営者が非公開を含めて探す読み取り: `usecases/listing.md`「searchListingsForOperation」、`usecases/occasion.md`「searchOccasionsForOperation」に対し、`usecases/region.md`「searchRegionsIncludingHidden」、`usecases/place.md`「matchPlaces」（場面の引数で兼ねる）
- `spec/domains/index.md` ドメインイベントの名前「同じ出来事には、ドメインをまたいで同じ語を使う。運営による非公開は `suspended`、その解除は `unsuspended`…申立てに基づく写真の削除は `photos_taken_down`」、ユースケースの名前「テストケースのファイル名と一致する」

反例の内容: 同じものを指す語が1つでない。ドメインイベントでは語をそろえる規約があるのに、同じ出来事を起こすユースケースと振る舞いは、解除が `unsuspend` と `liftSuspension`、写真の削除が `remove…ByClaim`・`remove…ByTakedown`・`takeDown…Photos` の3通り、運営の検索が `…ForOperation` と `…IncludingHidden` に分かれる。OM-03・OM-04・OM-02 は、対象の種類ごとにこれらを呼び分ける1つの画面で、名前から対応が引けない。

### 4-4 店舗の版の型だけが `number`

引用:

- `spec/domains/place.md` Place のフィールド「`version` | `number` | 登録の時点は 0。内容が変わる振る舞いのたびに 1 進む」
- `spec/domains/listing.md`「`version: Version;`」、CategoryCatalog のライフサイクル「`version` は `Version.initial()`」、`spec/domains/media.md`「`version: Version;`」（region.md・occasion.md・article.md も `Version`）

反例の内容: 同じもの（集約の版）の型が、店舗だけ素の `number` で、ほかはテンプレートの `Version`（`packages/core/src/domain/common/version.ts`）。

## 条件 5 体験設計の層

区分は技術設計の層。上流として読んだ shop・listing・moderation・operation のシナリオと SM・OM の画面について、シナリオごとに代案（手順を1つ減らす、画面を1つにまとめる）を当ててみたが、代案のほうが良いものは見つけていない。

## 条件 6 アーキテクチャ制約、アダプターの差し替え

### 6-1 `searchForOperation` の「大文字と小文字を区別しない」が、保存先で結果の変わる契約になっている

引用:

- `spec/domains/listing.md` ListingRepository `searchForOperation`「前後の空白を除いたキーワードを、名称または説明に含む掲載を…返す。大文字と小文字を区別しない部分一致」
- `spec/testcases/ports/listingRepository.md` searchForOperation「名称が「Apple Pie」の掲載がある | 「apple」と「APPLE」で探す | どちらでも返る」
- 対比: `spec/domains/place.md` PlaceMatching「`normalize` … Unicode の NFKC 正規化、英字の小文字化、空白（全角を含む）の除去を、この順に行う」「保存先にかかわらず、照合の結果はこの定義で決まる」

反例の内容: 制約「同じポートを in-memory / SQLite / PostgreSQL のどれで実装しても契約が成立する」に対し、この契約は大文字と小文字の対応を定義していない。名称「ÉCLAIR」の掲載を「éclair」で探すケースは、in-memory（文字列の小文字化）と PostgreSQL（ロケールつきの `ILIKE`）では返り、SQLite・libSQL（ASCII だけを同一視する）では返らない。全角の英字も同じ。適合テストは ASCII の1ケースだけなので、契約の項目「大文字と小文字を区別しない」の期待結果が ASCII の外で一意に決まらない。Place の照合と Discovery の検索は正規化をドメインの関数（`PlaceMatching.normalize`）で定めていて、この問題を持たない。Region・Occasion の運営の検索（`domains/region.md`・`domains/occasion.md` の `search`）も同じ書き方。

代わりの形: 運営の検索の一致も、共有の正規化の関数（`PlaceMatching.normalize` と同じ定義を共有カーネルに置く）を通した部分一致として契約に書く。閲覧者の検索（Discovery）で見つかる掲載が、運営の検索（OM-02）では見つからない、という食い違いも消える。

## 条件 7 次の改訂が前より高くつかない

### 7-1 申立てに基づく写真の削除が、5つのドメインに別々の形で定義されている

引用:

- `spec/domains/index.md` 申立てに基づく写真の削除「写真を持つ各ドメイン（Place、Listing、Region、Occasion、Article）が、集約の振る舞いとユースケースを持つ」
- `spec/domains/place.md` `Place.removePhotosByClaim`「`photoIds: readonly [PhotoId, ...PhotoId[]]`」、`"place.photos_taken_down"`「`{ placeId: PlaceId; photoIds: readonly PhotoId[] }`」
- `spec/domains/listing.md` `removePhotoByTakedown`「`listing: Listing, photoId: PhotoId, now: Date`」「申立てに基づいて写真を1枚削除する」、`listing.photos_taken_down`「`{ listingId; placeId; photoId; unpublished: boolean }`」
- `spec/usecases/place.md` removePlacePhotosByClaim「削除する写真の `PhotoId`（1つ以上）」、`spec/usecases/listing.md` removeListingPhotoByTakedown「削除する写真の `PhotoId`」（1枚）。区分の外では region・occasion が複数枚で `{ photoIds }`、article が1枚で `{ photoId; unpublished }`
- `spec/pages/operation.md` OM-04「対象の写真から選んで削除する。掲載・店舗・地域・イベント・読みもののどの写真も削除できる」

反例の内容: 同じルール（未対応の申立ての対象から写真を外す。1枚目を外すと次が代表写真。公開条件を欠けば `photoTakedown` で `unpublished`。`PhotosReleased` を出す）が、5か所に、名前3通り・引数の枚数2通り・ドメインイベントのペイロード2通りで定義されている。同じ `photos_taken_down` という名前のドメインイベントが、店舗・地域・イベントでは `photoIds`、掲載・読みものでは `photoId` と `unpublished` を持つ。OM-04 と Notification は、対象の種類ごとに枚数とペイロードを分けて扱う分岐を持つことになる。

代案: 共有カーネルに、`PhotoSet` の関数として `PhotoSet.takeDown(photos, photoIds: readonly [PhotoId, ...PhotoId[]])`（なければエラー、残りの順序を保つ）を置き、`Publication` を持つ集約の「公開条件を欠いたら `photoTakedown`」も `Publication` の関数1つにする。5つの振る舞いは同じシグネチャ（複数枚）、ドメインイベントは同じペイロード（`{ …Id; photoIds; unpublished: boolean }`。店舗は常に `false`）、ユースケースは同じ名前の型（`takeDown{X}Photos(actor, claimId, id, photoIds)`）にそろえる。次の要求（例: 申立てで写真の代わりに写真のぼかしを選べる、削除の理由を記録する）の改訂が、1つの関数と1つのペイロードの型で済む。

### 7-2 「変更した項目だけの修正」が、店舗と掲載で別の構造になっている

引用:

- `spec/domains/place.md` PlaceRevision「`type PlaceRevision = readonly [PlaceChange, ...PlaceChange[]];`」「`RevisedPhoto` … `origin: "current" | "added"`」「`PlaceRevision.preview` … `"current"` で店舗の現在の写真にないもの（提出の後に外された、または申立てで削除された写真）を除いて残す」「`PlaceRevision.addedPhotoIds(revision)`」
- `spec/domains/listing.md` ListingPatch「`type ListingPatch = Readonly<{ name?: …; photos?: …; offering?: … }>`」、`applyPatch`「`facts: { applicationPhotoIds: readonly PhotoId[] }` … `patch.photos` は、掲載の現在の写真にも `applicationPhotoIds`（申請が持ち主の写真）にもない要素を除いてから反映し」「`ListingPatch.addedPhotoIds(patch, current: ListingContent)`」

反例の内容: 同じルール（修正の申請は変更した項目だけを持つ。承認はその項目だけを現在の内容に重ねる。提出の後に対象から外れた写真は承認で戻さない。申請が持ち主になるのは新たに添えた写真だけ。承認者は項目ごとに現在の値と申請の値を見比べる）が、店舗では「`field` で判別する変更の配列＋写真ごとの `origin`」、掲載では「鍵が任意のレコード＋Media の持ち主から読んだ事実」という別々の構造で定義されている。「添えた写真」の決め方も、店舗は値が持ち（`origin`）、掲載は提出時点の内容との差と承認時点の持ち主の2か所で決める。Application の提出・再提出・承認と CM-01 の見比べは、2つの構造をそれぞれ扱う。

代案: 共有カーネルに、写真の修正の値 `RevisedPhotos<P> = readonly (P & { origin: "current" | "added" })[]` と、その重ね合わせ（`"current"` で現在にないものを除く）・`addedPhotoIds` を1つ置き、店舗と掲載の修正はどちらも「`field` で判別する変更の配列（1件以上、同じ `field` は1つ）」にそろえる。`Listing.applyPatch` は `facts.applicationPhotoIds` を取らなくなり、「1枚も残らなければエラー」だけが掲載に固有の規則として残る。次の要求（例: 地域・イベントの情報修正の申請の受け付け、写真への説明文の追加）が来たとき、修正の型と見比べの型を3つ目・4つ目として足さずに済む。

### 7-3 `matchPlaces` が、閲覧者の確認と運営の照合の2つの責務を、場面の引数で切り替えている

引用:

- `spec/usecases/place.md` matchPlaces「場面は2つ。閲覧者の確認は `Actor` を取らず、非公開の店舗を含めない。サービス運営者の照合は `Actor` を取り、非公開の店舗を含める」「サービス運営者の照合だけが、非公開かどうかと、管理者の有無を併せて返す」、エラーケース「サービス運営者の照合を、サービス運営者でない人が行う | `ForbiddenError`」
- `spec/domains/place.md` ユースケース（概要）「非公開の店舗を含めるかは、場面とサービス運営者の役割で決まる」
- 対比: `spec/usecases/listing.md`「searchListingsForOperation」は運営の検索だけを負い、閲覧者の検索は Discovery が負う

反例の内容: 1つのユースケースが、入力の型（`Actor` の有無）、可否の判断、結果の形（非公開かどうか・管理者の有無の有無）の3つを、場面の値で切り替える。「場面は閲覧者で `Actor` あり」「場面は運営で `Actor` なし」という組み合わせを入力の型が排除していない。非公開の店舗を返すかどうかという公開範囲の規則が、この引数の分岐に乗っている。

代案: `PlaceRepository.match` は1つのまま、ユースケースを2つに分ける。閲覧者の確認（`Actor` なし、`includeSuspended: false`、写真の代用つき。Discovery の `findSelectionCandidates` と同じ「参照の場面」の読み取り）と、運営の照合（`Actor` 必須、`includeSuspended: true`、管理者の有無つき。名前は `searchListingsForOperation`・`searchOccasionsForOperation` にそろえる）。場面の引数とその分岐が消え、次の要求（例: 運営の照合に営業状況での絞り込みを足す、閲覧者の確認に現在地の近さを足す）が片方だけの改訂で済む。

### 7-4 「廃止したカテゴリーの掲載は移行先の掲載」が、読み取りの解決と書き込みの付け替えの2か所で定義されている

引用:

- `spec/domains/listing.md` カテゴリーの解決「掲載の内容と申請の内容の `CategoryId` は、読み取りの時点で `CategoryCatalog.resolve` を通して現役のカテゴリーとして扱う」、トランザクション境界「付け替えが終わるまでの間も、終わった後に廃止済みの `CategoryId` を持つ掲載が残った場合も、読み取りは `resolve` を通すので結果は変わらない」「カテゴリーで絞り込む問い合わせ（Discovery）は、選んだカテゴリーを `CategoryCatalog.predecessorsOf` で展開した `CategoryId` の集合で絞り込む」
- 同じファイルの `reassignCategory`、`findPageByCategory`、`listing.category_reassigned`、ユースケース 22「reassignListingsOfRetiredCategory」、`PublishableListingContent.replaceCategory`・`ListingPatch.replaceCategory`（Application の `replaceRetiredCategoryInApplications` が使う）
- `spec/domains/listing.md` Listing の振る舞い「状態を変える振る舞いは `version` を進め、`updatedAt` を `now` にする」、ListingRepository `findPageByPlace`「並び順は `updatedAt` の新しい順」、`spec/testcases/listing/reassignListingsOfRetiredCategory.md`「そのうち1件の保存が、店舗管理者の同時の保存と競合する」

反例の内容: 読み取りはすべて `resolve`・`predecessorsOf` を通すので、保存された `CategoryId` の付け替えがなくても、閲覧者と管理する人に見える結果は同じになる（spec 自身がそう述べている）。それでも付け替えを別に持つので、同じルールが2つの仕組みで定義され、付け替えのためだけに、消費者2つ（Listing・Application）、集約の振る舞い、ポートの問い合わせ、ドメインイベント、`replaceCategory` の関数2つがある。付け替えは掲載の `version` と `updatedAt` を進めるので、編集中の店舗管理者の保存が「別の人が先に保存している」の `ConflictError` になり（`usecases/listing.md` updateListing）、SM-03 の「更新の新しい順」がシステムの処理で入れ替わる、という上流にない副作用も持つ。

代案: 付け替えの書き込みを持たず、廃止と移行先の記録（台帳）と `resolve`・`predecessorsOf` だけで O-06 の「移行先に付け替える」を満たす。店舗管理者への通知（P-93）は、`category.retired` の消費で、保存された `CategoryId` がそのカテゴリー（`predecessorsOf` の集合）の掲載を持つ店舗を読んで作る（`findPageByCategory` は通知のための読み取りとして残る）。編集して保存する掲載は、その時点で現役の `CategoryId` が保存される。`reassignCategory`、`listing.category_reassigned`、`reassignListingsOfRetiredCategory`、`replaceRetiredCategoryInApplications`、`replaceCategory` の2関数と、それらのテストケースが要らなくなり、版と `updatedAt` の副作用も消える。次の要求（例: カテゴリーの統合、2階層化）の改訂が、台帳の解決の規則1か所で済む。

## 7 条件の外

- `provisionInitialCategories` の呼び出し元が書かれていない。`spec/usecases/listing.md`「開設時に…入れる。画面からは呼ばない」だけで、`usecases/authority.md` の `establishFirstOperator`「画面からは呼ばず、開設の手順が呼ぶ」に当たる記述がなく、`flows/index.md` にも現れない（F-11 のトリガーは `retireCategory` だけ）。台帳が空のままだと、カテゴリーを選べず掲載を公開できない
- ユースケースの層のドメイン間の呼び出しの向きが、`spec/domains/index.md` の依存方向の表からは読めない。表は「Discovery と Notification は最下流にあり、どのドメインからも依存されない」とするが、`usecases/place.md` matchPlaces は Discovery の `ReferenceQueries.resolve`・`PlaceEntry.substituteCover` を、`usecases/listing.md` previewListing は Discovery の `ViewProjection.previewListing` と Region のリポジトリを呼ぶ。表の「依存」がドメインの層の型の参照だけを指すなら矛盾ではないが、application の層の import の境界を決める記述がない
- `spec/domains/listing.md` ユースケース（概要）11「公開していない掲載の保存済みの内容を…返す」に対し、`spec/testcases/listing/previewListing.md` は公開中の掲載でも「内容が返り、公開状態は `published` と分かる」。概要の言い回しが実際の範囲より狭い
- `OfferingPhaseLedger.record` は楽観ロックを持たず掲載の版も見ないので、`detectEndedOfferings` の `record` と `deleteListing`（`remove` を含む）が同時に起きると、削除された掲載の記録が残りうる。`findPageDrifted` は返さないので振る舞いには出ないが、記録を消す主体がない（技術的なエッジケース）
