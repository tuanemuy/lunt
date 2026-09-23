# 独立した読み 1: domains/index.md、Discovery、Notification

区分: `spec/domains/index.md`、`spec/domains/discovery.md`・`notification.md`、`spec/usecases/discovery.md`・`notification.md`、`spec/testcases/discovery/`・`notification/`、`spec/testcases/ports/` の Discovery・Notification のポート（`feedCandidateQueries`・`explorationQueries`・`keywordSearchQueries`・`detailQueries`・`referenceQueries`・`notificationRepository`・`mailer`）。

上流として `spec/scenario/index.md`・`discover.md`・`explore.md`・`account.md`、`spec/pages/index.md`・`browse.md`・`detail.md`・`account.md` を読んだ。`detailQueries`・`feedCandidateQueries` のテストケースは見出しと一部の行だけを確かめた。

## 条件 1: 要求を取りこぼしていない

反例なし。

契約 P-90〜P-100、I-05、I-16、V-05〜V-50 のうち Discovery に当たる項目、P-16、P-43、P-87、P-88 を、scenario → pages → domains → usecases → testcases の順に辿れた。

## 条件 2: 足しすぎていない

### 2-1 usecases に、技術的に起こりうるだけのエラーがある

- 引用: `spec/usecases/notification.md` deliverNotifications「エラーケース」
  > | 通知の記録が成立しない（`SystemError`） | その告知の通知もメールもなく、消費は失敗になる。再配送でやり直す |
- 内容: 層の表の usecases の「書かない」の「技術的に起こりうるだけのエラー」に当たる。表の前置きは「要件が振る舞いを定める失敗は次のとおり」だが、この行に当たる要求が契約にない（B-39 が定めるのはメールが届かない場合だけ）。保存先の障害で消費が失敗して再配送される振る舞いは、`spec/domains/index.md`「トランザクションとドメインイベント」が全消費者に共通で定めている

### 2-2 testcases に、技術的なエッジケースがある

- 引用: `spec/testcases/discovery/readFeed.md`「ページ」
  > | 同じ店舗・同じ地域の掲載が混ざった、フィード対象の掲載が250件。… | 1ページ100件で、1〜3ページ目を同じ条件で読む | 3つのページをつないだ掲載の並びが、250件の候補の全体を `FeedComposer.arrange` で並べた結果と一致する（構成に要る候補が100件を超えても、先頭から欠けなく読まれる）。… |
- 内容: 層の表の testcases の「書かない」の「技術的なエッジケース」に当たる。確かめているのは、ポートの `Pagination` の `limit` の上限（100）を越えて候補を読みつなぐ実装上の手順で、要求（V-45、V-46）が満たされたことの代表ケースは直前の30件のケースが確かめている

## 条件 3: Issue をまたぐ決定が決まりきっている

反例なし。

## 条件 4: 矛盾がなく、現在形で単体で読める

### 4-1 spec の外の作業メモを出典として参照している

- 引用（`spec/domains/discovery.md`）
  - VisibilityPolicy「（P-87、P-88、B-46、decisions-mid M-12）」
  - BrowseCriteria.resolve「廃止されたカテゴリーと台帳にない ID は条件から外れる（D-5）」
  - SearchRelevance「（decisions-scenario D-1）」、ViewProjection「（decisions-scenario D-2）」、共通の契約「（V-45、V-48、decisions-scenario D-3）」、FeedComposer「（decisions-scenario D-4）」、`findMapExtent`「（decisions-mid M-11）」、ReferenceQueries「（decisions-scenario R-3）」
- 引用（`spec/domains/notification.md`）
  - Notification の不変条件「…出来事が指す対象（`pointedContent`、または `occurrence` の申請）を必ず持つ（M-15）」
  - Addressing「宛先の規則（C-2、I-05、I-16）を持つ唯一の場所」
- 内容: `decisions-mid`・`decisions-scenario` は `spec/review/` の作業メモで、spec の成果物ではない（`spec/index.md` からリンクされていない）。定義のない参照に当たる。さらに `M-11`・`M-12`・`M-15` は契約の台帳の ID（M-11 修正申請、M-12 管理メンバーの招待、M-15 共通の掲載）と同じ字面で、別のものを指す。`D-5`・`R-3` も契約の `D-05`・`R-03` と桁だけが違い、`（D-5）` は出典のファイル名も伴わない。`C-2` は契約にも spec のどの層にも定義がない。同じ `M-15` は `spec/domains/place.md`「ドメインイベント」の末尾にもある

### 4-2 Notification の依存先と「Discovery はどのドメインからも依存されない」が食い違う

- 引用: `spec/domains/index.md`「依存方向」
  > | Notification | すべてのドメイン | ドメインイベントを消費して通知を作る |
  > - 循環はない。Account・Area は何にも依存しない。Discovery と Notification は最下流にあり、どのドメインからも依存されない
- 引用: `spec/domains/discovery.md`「ドメインイベント」
  > なし。Discovery はドメインイベントを出さず、消費しない。
- 内容: 「すべてのドメイン」は Discovery を含むので、同じ節の「Discovery は…どのドメインからも依存されない」と食い違う。`notification.md` の「消費するドメインイベントと、出来事の対応」の表と「他のドメインのポートから読む事実」の表に現れるのは Account・Authority・Place・Listing・Region・Occasion・Article・Application・Moderation で、Area・Media・Bookmark・Discovery の型は参照していない

### 4-3 ドメインイベントの名前の規約と、実際の型名が食い違う

- 引用: `spec/domains/index.md`「ドメインイベントの名前」
  > ドメインイベントの型名は `"{ドメイン}.{出来事}"` で、出来事は過去形の snake_case で書く
- 引用: `spec/domains/notification.md`「ドメインイベント」
  > | P-97 | `operators` / `takedown_claim_received` | `takedown_claim.submitted` | |
  > | P-97 | `operators` / `info_report_received` | `info_report.submitted` | |
  > | P-93 | `placeStewards` / `confirmation_requested` | `info_report.confirmation_requested` | |
- 内容: Moderation のドメインイベントの接頭辞はドメイン名（`moderation`）ではなく集約名。`spec/domains/index.md`「写真の解放」の `"photos.released"` も、ドメイン名（`media` でも、出す側のドメインでもない）を接頭辞にしていない。規約が「ドメイン」なのか「集約」なのかが、index.md の記述から決まらない

### 4-4 結果整合にするものの列挙が、Notification の退会時の削除を含まない

- 引用: `spec/domains/index.md`「トランザクションとドメインイベント」
  > - ドメインイベントの消費で結果整合にするもの: 申請の失効、通知、写真の削除、退会に伴う保存の削除と個人の申請の取り下げ
- 引用: `spec/domains/notification.md`「トランザクション境界」
  > - 退会に伴う削除は、`account.withdrawn` の消費で結果整合にする。
- 内容: index.md の列挙は `account.withdrawn` の消費者として Bookmark と Application だけを挙げ、Notification の `purgeNotificationsOnWithdrawal` と、同じ index.md の依存方向の表が述べる Authority の消費（「退会と同時の就任で残った管理権限・役割を取り除く」）を含まない

### 4-5 地図の初めの範囲の定義が、pages と usecases で食い違う

- 引用: `spec/pages/index.md`「地図」
  > - VW-04 の初めの範囲は、エリアを選択中なら選択エリアの条件に合う店舗が収まる範囲、選択がなく位置情報の利用を許可していれば現在地の周辺とする。どちらもなければ、公開中の店舗が収まる範囲を…表示し
- 引用: `spec/usecases/discovery.md` findInitialMapExtent
  > 条件から求める範囲は、条件に合う店舗が収まる範囲で、条件がなければ、閲覧できて発見の対象であるすべての店舗が収まる範囲になる。
- 引用: `spec/testcases/discovery/findInitialMapExtent.md`
  > | カテゴリー「食べる」の提供中の掲載を持つ店舗が P だけ | カテゴリー「食べる」を選んだ条件で求める | P の位置だけの範囲を返す | |
- 内容: エリアを選ばず、位置情報もなく、カテゴリーだけを選択中の場合、pages は「公開中の店舗が収まる範囲」（カテゴリーは効かない）、usecases と testcases は「カテゴリーの条件に合う店舗が収まる範囲」になる。VW-04 の実装と `findInitialMapExtent` のどちらに合わせるかで結果が変わる

### 4-6 店舗詳細の地域の順が、pages と usecases で違う語で定義されている

- 引用: `spec/pages/index.md`「詳細の関連情報」
  > | DT-01 | 地域 | 店舗のすべての公開中の所属地域 | 一覧に示す地域を先頭に、以降は所属した順 | すべて |
  > | DT-02 | 地域 | すべての公開中の所属地域 | 代表地域を先頭に、以降は所属した順 | すべて |
- 引用: `spec/usecases/discovery.md` viewPlace
  > - 地域は、すべての閲覧できる所属地域を、一覧に示す地域を先頭に、以降は所属した順で返す
- 内容: 同じ並び（`PlaceEntry.regions`）を、DT-01 は「一覧に示す地域」、DT-02 は「代表地域」で定義している。代表地域が公開の取り下げ中のとき、DT-02 の「代表地域を先頭に」は先頭が決まらない。`spec/testcases/discovery/viewPlace.md` は「代表地域に Z を選んでいる。Z は公開の取り下げ中 → X、Y の順」を期待し、usecases の定義に従っている

## 条件 5: 体験設計

この区分は技術設計の層なので、問わない。

## 条件 6: アーキテクチャ制約、アダプターの差し替え

### 6-1 Mailer の契約が、送信先のサービスの冪等の機能がなければ成立しない

- 制約: アダプターの差し替え可能性（ポートは特定の外部サービスに依存しない。どの実装でも契約が成立する）
- 引用: `spec/domains/notification.md`「Mailer」
  > | `send` | …送信を引き受けた時点で解決する。引き受けられなければ `SystemError`（再び呼べる）。引き受けが成立した `key`（`occurrenceKey` と `to` の組）の以後の `send` は、送らずに成功として返る。同時に届いた同じ `key` の `send` でも、届くメールは1通。この一意性はポートが担保する |
- 引用: `spec/testcases/ports/mailer.md`
  > | 上の失敗の後、実装が送信を引き受けられる状態に戻った | 同じキーで、もう一度 `send` を呼ぶ | エラーなく完了し、メールが1通届く。失敗した `send` は、送信済みの記録を残していない | |
- 内容: 「引き受けの成立」と「キーの記録」は、送信先のサービスとアダプターの記録の2か所にまたがり、原子的に確定できない。キーを先に記録する実装は、引き受けの前に落ちると、以後の `send` が「送らずに成功」になってメールが失われる（契約は、引き受けが成立したキーだけを送らないと定める）。引き受けの後に記録する実装は、記録の前に落ちると、再配送で2通目が届く（契約は1通と定める）。契約が厳密に成立するのは、送信先のサービスがキーによる冪等な送信を提供する場合だけで、in-memory の実装では通り、一般の SMTP の実装では成立しない。`deliverNotifications` は「重複の防止は、この2つのポートの一意性だけに頼り」と定めるので、ここが崩れると「通知もメールも重複しない」（`notification.md`「トランザクション境界」）が成り立たない

### 6-2 Discovery のユースケースの名前と入出力に、画面の語彙がある

- 制約: ユースケースの名前と入出力に画面の語彙がない
- 引用: `spec/usecases/discovery.md`
  > | readMapPins（地図の範囲の店舗と地域を読む） | …
  > | findInitialMapExtent（地図の初めの範囲を求める） | …
  > 地図を開くときの初めの範囲を求める。…現在地の周辺を初めの範囲にする場合は、このユースケースを使わない。
  > - 出力: 範囲（`GeoBounds`）。…条件から求めた範囲が `null`（条件に合う店舗が0件）のとき、地図は日本全体が収まる範囲から始まる（`spec/pages/index.md`「地図」）
  > | listListingsOfPlace（店舗の掲載の続きを読む） | …店舗の詳細の掲載の区分の続きに当たる。
- 内容: 「ピン」は契約 D-09 が「画面設計で扱う事項」に置く語（「ピンの集約」）、「初めの範囲」は VW-04 を開く時点という画面の状態、「続きを読む」は CF-05 の機能名。`findInitialMapExtent` は、出力の節で画面の振る舞い（日本全体から始まる）まで述べている。`viewRegion`・`viewListing`・`viewPlace`・`viewOccasion` の出力の件数（6件、3件）も、`spec/pages/index.md`「詳細の関連情報」の画面ごとの値をそのまま入出力に持つ

## 条件 7: 次の改訂が前より高くつかない

### 7-1 店舗のキーワードの一致の規則が2つあり、`findSelectionCandidates` が種類で分岐する

- 引用: `spec/usecases/discovery.md` findSelectionCandidates
  > - 出力: 状態つきのカードの並びと全件数。関連度の高い順
  > - 掲載・地域・イベント: `KeywordSearchQueries.searchListings`・`searchRegions`・`searchOccasions`
  > - 店舗: `PlaceMatchCriteria.create`、`PlaceRepository.match`（Place）、`ReferenceQueries.resolve`（照合の結果を `PlaceEntry` にする。並びは照合の順）…
  > UnitOfWork は不要。店舗の照合と解決の間に非公開になった店舗は、候補から落ちる。
- 引用: `spec/domains/discovery.md` SearchRelevance（店舗の `SearchableText` は「名称 / 所在地、紹介」、`termScore` は 0〜4、すべての語の一致が必要）と、`spec/domains/place.md` PlaceMatching（`fieldScore` は 0〜3、「値が語を含むか語が値を含めば 1」、店名と住所のどちらか一方の一致で足りる）
- 内容: 「キーワードで店舗を探す」規則が、Discovery の `SearchRelevance` と Place の `PlaceMatching` に別々に定義されている。`findSelectionCandidates` は同じ出力の「関連度の高い順」を、種類によって別の関連度で並べ、店舗だけ `SearchKeyword` の語の分割を使わない（`parse` は空かどうかの判定にだけ使う）。店舗の枝は2つのポートをまたぐので、`match` の `count` と `resolve` の後の件数がずれうる。次の要求（例: 店舗の検索の対象に営業時間や読みを加える、関連度の規則を変える）は、2つのドメインサービス、2つのポート適合テスト、`findSelectionCandidates` の分岐に広がる
- 代案: `findSelectionCandidates` の店舗も `KeywordSearchQueries.searchPlaces` を使う（店舗の `SearchableText` はすでに名称と所在地を持ち、CF-02 の「店舗は店名・住所」を満たす。`PlaceEntry` と `substituteCover` もそのまま返る）。分岐、`ReferenceQueries.resolve` の呼び出し、読み取りの間の件数のずれが消える。`PlaceMatching` は、店名と住所を別々の入力で受ける既存店舗の確認と登録申請の照合（M-02、P-42）だけが使う

### 7-2 通知のメールの文面と行き先の規則を、Mailer のアダプターが持つ

- 引用: `spec/domains/notification.md`「Mailer」
  > - 文面は、アダプターが `occurrence`・`delivery`・`labels` から組み立てる。メールは、サービス内の通知と同じ画面を開く行き先を載せる。行き先は pages の「通知から開く画面」に従い、アダプターが `occurrence` と `delivery` から組み立てる
- 引用: `spec/testcases/ports/mailer.md`「行き先」
  > | `proxy` の、`placeStewards` / `listing_suspended` の `NotificationMail` | `send` を呼ぶ | 届いたメールは、その掲載の対象の運営を開く行き先を載せる | |
- 内容: 出来事と届いた経路から開く画面を決める規則（`spec/pages/index.md`「通知から開く画面」の22行と、`proxy` の例外）が、MY-03 の実装（apps/web の presentation）と、Mailer のアダプターの2か所に別々に実装される。Mailer のアダプターを差し替える（送信先のサービスを替える、テスト用の実装を足す）たびに、この規則を実装し直し、ポート適合テストの「行き先」の節が送信の契約に画面の対応を持ち込む。次の要求（例: P-93 に出来事を1つ足す、開く画面を1つ替える）は、`Occurrence`、pages の表、MY-03、Mailer のすべての実装、ポート適合テストに広がる
- 代案: 行き先と文面を組み立てる1つの関数（application 層のポート `NotificationMailRenderer`、または presentation が DI で渡す関数）を置き、`deliverNotifications` がその結果（件名、本文、行き先）を `Mailer.send` に渡す。`Mailer` は、キーの一意性と送信だけを契約にする。行き先の規則は、MY-03 と同じ1か所（通知 → 画面の対応）を使う。ポート適合テストから「行き先」の節が消え、アダプターの差し替えが送信だけで閉じる

### 7-3 `Delivery` の `vacantTarget` が、`occurrence` から決まる値を重ねて持つ

- 引用: `spec/domains/notification.md`「Notification」の不変条件
  > - `delivery.route` が `proxy` の通知は、届け先の立場が対象の管理者の全員（`Audience` の `stewards`）である出来事だけが持つ。`vacantTarget` はその立場の対象と一致する。
  > | `Notification.issue` | … | 下の不変条件を欠けば `BusinessRuleError("NOTIFICATION_ADDRESSEE_MISMATCH")` |
- 内容: `proxy` の `vacantTarget` は、`Addressing.audienceOf(occurrence)` の `stewards` の `target` と常に同じ値で、型の上では食い違う組（`to: "grantee"` と `proxy`、店舗 P の出来事と `vacantTarget` が地域 R）を作れる。食い違いは実行時の検査（`NOTIFICATION_ADDRESSEE_MISMATCH`）と `reconstruct` の検査で防いでいる。`Audience` に届け先の立場を足す、または `proxy` の条件を変える改訂は、`Delivery`、不変条件、`issue`、`reconstruct`、`NotificationRepository` の往復のテストに広がる
- 代案: `Delivery` を `"direct" | "proxy"` の値だけにし、管理者が不在の対象は `Notification.vacantTarget(n)` が `Addressing.audienceOf(n.occurrence)` から求める（`stewards` でなければ `null`）。「`vacantTarget` が立場の対象と一致する」の不変条件と、その検査が消える。`proxy` を持てる出来事を型で限るなら、`Occurrence` の `stewards` に当たる枝（`applicant` の `place`、`approver` の `steward`、`placeStewards`、`regionStewards`、`occasionStewards`）だけが `route` を持つ形にする

## 7 条件の外

- `spec/domains/index.md`「開発の順序との対応」は、段階2に「Discovery（店舗詳細・掲載詳細・対象の選択の候補）」を置くが、`PlaceEntry.regions` は Region（段階3）の `PublishedRegion`、`viewPlace`・`viewListing` のイベントと読みものの区分は Occasion（段階3）と Article（段階5）の型を要る。`ReferenceQueries`（段階2の Moderation・Place の `matchPlaces` が使う）は、どの段階にも名前が出ない。段階2の時点でこれらの区分と型をどう扱うかが書かれていない。開発の順序は層の表の「決め切る」にないので、条件 3 の反例にしていない
- `spec/domains/index.md`「依存方向」は「Discovery と Notification は…どのドメインからも依存されない」と述べるが、`spec/domains/discovery.md`「ReferenceQueries」は Bookmark・Article・Place・Moderation・Occasion・Application のユースケースが Discovery のポートと型（`PlaceEntry`、`ResolvedTarget`）を使うと定める。index.md は依存を「他のドメインの型の参照」と定義しており、application 層の参照を依存に数えるかどうかが読み手に委ねられている。Place の `matchPlaces` → Discovery の `ReferenceQueries`、Discovery の `findSelectionCandidates` → Place の `PlaceRepository.match` は、application 層で互いを参照する
- `readFeed` は、どのページも先頭から `page × limit + 11` 件の候補（`ListingEntry` は `PlaceEntry` の所属地域と代用の写真を含む）を読み直す。ページが進むほど1回の要求の読み取りが線形に増える。性能は契約 X-03 の範囲の外なので、反例にしていない
- `ExplorationQueries.findRegions`・`findPlacesOfRegion` は `today` を取るが、店舗が発見の対象かどうかは営業状況だけで決まり（`VisibilityPolicy.isDiscoverable`）、日付に依存しない。引数が結果に効かない
- `spec/usecases/discovery.md` の `viewPlace`・`viewListing`・`viewRegion`・`viewOccasion` の「出力」は、対象の内容の項目をほぼすべて列挙している。層の表の「DTO の全フィールド」に近いが、どれも契約 V-19〜V-21、V-25 が挙げる項目なので、反例にしていない
