# 1周目の読みを受けた、区分をまたぐ決定

直しの担当は、自分の区分の read-1-*.md に加えてこのファイルを読む。ここに書いた決定は、区分ごとの判断より優先する。

## 申立てに基づく写真の削除の統一（Place・Listing・Region・Occasion・Article）

- 集約の振る舞いの名前は `takeDownPhotos(entity, photoIds, now)`。`photoIds` は1枚以上（重複なし）。対象の写真でない `PhotoId` が混じれば、そのドメインの `*_PHOTO_NOT_FOUND` の `BusinessRuleError` で、1枚も外さない
- ユースケースの名前は `takeDown{Place|Listing|Region|Occasion|Article}Photos`。入力は申立ての ID、対象の ID、`photoIds`。サービス運営者（`operate_service`）。申立ての事実は Moderation の `TakedownClaimRepository.findById` と `TakedownClaim.authorizePhotoRemoval`（不成立は `TAKEDOWN_CLAIM_ALREADY_RESOLVED` → `TAKEDOWN_TARGET_MISMATCH` の順、申立てが無ければ `NotFoundError`）
- ドメインイベントは `{domain}.photos_taken_down`。ペイロードは `{ <対象の ID>; photoIds: readonly PhotoId[]; unpublished: boolean }`。`unpublished` は「この削除で公開していない状態になった」。店舗は公開状態を持たないので `unpublished` を持たない。あわせて `photos.released` を出す
- テストケースのファイル名はユースケースの名前に合わせる（名前を変えたらファイル名も変える）。flows・notification の参照も合わせる

## ログインしていない閲覧者の保存一覧

- 端末の保存はサーバーに保存しない。保存一覧の表示と、保存の時点の閲覧できるかどうかの確認のために、端末は対象の参照（`BookmarkRef[]`）を送り、Discovery の読み取り（`ReferenceQueries.resolve`・`isViewable`）の結果を受け取る。送られた参照は保存されない
- これを実現するユースケースは Discovery が持つ（ログインの有無にかかわらず `BookmarkRef[]` を解決する読み取り。`Actor` を取らない）。Bookmark の `listBookmarks` はアカウントの保存の参照を返し、表示の内容の解決は同じ Discovery のユースケースを使う
- `spec/scenario/keep.md` の「サーバーに送らない」は「サーバーに保存しない」に直す

## 要求の番号の定義場所

- 契約の番号（P・D・T・X・I と、要件定義書の V・M・R・E・O・B・AC）は `spec/ledger.md`（要求台帳）が定義する。`spec/index.md` からリンクしている。`spec/review/` は作業メモで、完了時に削除される。spec のファイルから `spec/review/` のファイル（`contract.md`、`decisions-*.md` など）を参照しない。決定の内容は、参照ではなく現在形の事実として spec に書く（`spec/domains/discovery.md`・`listing.md`・`application.md` に参照が残っている）

## 店舗の側の操作と代行

- サービス運営者の代行の対象は、契約が挙げる範囲に限る: 店舗の情報・営業状況・掲載（M-35、M-46）、運営者が不在の地域・イベントの管理（R-11、R-15、E-09、E-11、E-15）
- 店舗として行う操作（代表地域の選択、店舗の所属状況・参加状況の確認、参加内容の変更、参加の取りやめ、店舗管理者として行う申請）は、その店舗の管理権限を持つ人だけが行える。代行はない。`spec/domains/index.md`「操作の可否」の表に行を足した
- この区別は Authority の `AccessPolicy` の操作の種類として定義し（例: `act_as_place`）、ユースケース層で `capacity` を見て分岐しない。Region（`chooseRepresentativeRegion`、`getPlaceAffiliationStatus`）と Occasion（店舗の側の参加の操作）は同じ種類を使う

## 共有カーネルの値オブジェクトのエラーコード

- 共有カーネルの値オブジェクト（`LocalDate`、`DateRange`、`GeoPoint`、`GeoBounds`、`AreaCode`、`Tagline`、`EmailAddress`、`PhotoSet`）の生成の失敗は、`BusinessRuleError` のコード `COMMON_INVALID_{型名の SNAKE_CASE}`（例: `COMMON_INVALID_DATE_RANGE`）。index.md に追記する

## エラーの種類（テンプレートに合わせる）

- テンプレートの application 層のエラーは `NotFoundError`・`ConflictError`・`UnauthorizedError`・`ForbiddenError`・`SystemError`。`ValidationError` はない。spec の `ValidationError` はすべて `BusinessRuleError`（コード `COMMON_INVALID_INPUT`、またはそのドメインのコード。例: 解決できない町域は `AREA_TOWN_NOT_FOUND`）にする。ログインが必要な操作をログインせずに呼んだ場合は `UnauthorizedError`
- 集約の版の型は、テンプレートの `Version`（`domain/common/version.ts`。`number` のブランド型）に統一する

## ユースケースの名前の統一

- 運営による非公開とその解除: `suspend{Place|Listing|Region|Occasion}` / `unsuspend{…}`（`lift…Suspension` は使わない）
- サービス運営者が非公開を含めて探す読み取り: `search{Places|Listings|Regions|Occasions}ForOperation`。ID で開く読み取り: `getManaged{Place|Listing|Region|Occasion}`
- 申立てに基づく写真の削除: `takeDown{Place|Listing|Region|Occasion|Article}Photos`
- 名前を変えたら、テストケースのファイル名、`spec/index.md` のリンク、flows・他ドメインの参照も合わせる

## その他（place-listing / account-authority / discovery-notification の読みから）

- index.md「編集の競合」: 営業状況の変更は、現在の営業状況を見て変える操作で、版を含める（scenario/shop.md の「別の店舗管理者が営業状況を変えた → 競合」）。index の列挙に「営業状況の変更」を足す
- spec の中で `M-1`・`M-6`・`M-11`・`M-12`・`M-15`・`C-2` など作業メモの番号を引いている箇所は、契約の ID（要件定義書の M-xx）と衝突する。作業メモの番号への参照はすべてなくし、内容を現在形の事実として書く
- 退会と就任・付与の競合（account-authority 3-1・7-1）: 読み手の代案（就任・付与・承諾・承認による管理権限の付与は、相手のアカウントの存在を同じ UnitOfWork で確かめ、アカウントの版で退会と直列にする）を採る。`sweepWithdrawnAccount` の消費者と、退会済みの持ち主だけが残った場合の `establishFirstOperator` の回復は、代案で不要になれば取り除く
- コードの誤入力の上限（`exhausted`）は上流に引用元がないが、ワンタイムのコードを総当たりから守るために要る。契約の解釈に I-18 として足す（要求台帳 `spec/ledger.md` にも足す）: 「メールアドレスでのログインのワンタイムのコードは、誤入力の回数の上限で無効になる（V-51 のパスワードを使わないログインを安全に成り立たせるため）」
- `Mailer` の「同じキーは1通」: 送信先のサービスに冪等な送信がなくても成り立つよう、送信済みの記録（キー）を Notification のポート（`NotificationRepository` か専用の台帳）が持ち、`Mailer.send` は「送る」だけにする。重複の防止は Notification の側の記録の一意性で守る（送信の成功の後に記録が失敗した場合は、再配送で同じメールがもう1通届きうる。少なくとも1回の配送として許容する、と明記する）
- Discovery のユースケースの名前と入出力から画面の語彙（ピン、初めの範囲、続きを読む）をなくし、ドメインの語彙（地図の区画、範囲、ページ）にする
- 店舗のキーワードの一致の規則は Place の `PlaceMatching` だけが持ち、Discovery はそれを使う

## flows-cross の読みから

- 2-1（参加の成立による参加申請の失効）: 契約の解釈 I-19 として要求台帳に足した。spec の該当箇所は I-19 を辿り先に引く
- 4-1: Moderation の状態を変える要求は版を含めない（index.md「編集の競合」が正）。flows を usecases・testcases に合わせる
- 4-3: index.md「リポジトリの共通の契約」は「`insert`・`findById`・`save`・`delete` のうち、その集約に要るものだけを持つ（使わない `delete` は型から除く。決まったキーの集約は `insert`・`delete` を持たない）」と書く
- 4-4: 保存先の障害（`SystemError`）への変換はアダプターの責務で、どのポートの契約の項目にも、適合テストにも入れない。ポートのエラーの列挙から `SystemError` を外す
- 4-5・7-1: 名前の統一は「ユースケースの名前の統一」「申立てに基づく写真の削除の統一」の節のとおり
- 4-6: ドメインイベントの型名は変えない。index.md の規約の側を「型名の先頭は出来事の主語で、ドメインの名前、またはそのドメインの中の集約の名前（`category`、`takedown_claim`、`info_report`）、共有カーネルのドメインイベントは `photos`」と書く（index.md に反映済み）
- 4-5: 公開条件の不足のコードは `{LISTING|REGION|OCCASION|ARTICLE}_PUBLISH_CONDITION_UNMET` に統一する。店舗の公開条件（名称・所在地・位置）の不足は `PLACE_PUBLISH_CONDITION_UNMET`
- 1-1: AC-56 をテストケースに添える（`getPlaceDetail` 相当の Discovery の詳細の読み取りと、`matchPlaces`）
- 7 条件の外: index.md の依存方向の「Notification | すべてのドメイン」は、ドメインイベントを出すドメインに限る書き方に直す。開発の順序の表は `ReferenceQueries` の段階を明記する
