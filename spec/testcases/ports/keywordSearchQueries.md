# KeywordSearchQueries

契約は [Discovery](../../domains/discovery.md) の「ポート」の「共通の契約」と「KeywordSearchQueries」、対象の文字列は同じファイルの `SearchRelevance` の表、一致と関連度は共有カーネルの `KeywordRelevance`（[index.md](../../domains/index.md)「キーワードの一致」）による。このポートは読み取りだけを持つので、前提条件の集約は、各ドメインのリポジトリ（`PlaceRepository`・`ListingRepository`・`RegionRepository`・`PlaceAffiliationsRepository`・`OccasionRepository`・`ArticleRepository`、候補の範囲では Authority の `StewardshipRepository`）の `insert`・`save`・`delete` を UnitOfWork の中で呼んで置き、コミットの後に読む。集約は各ドメインの振る舞いで作る。

- 特に書かなければ、店舗は営業中で非公開でなく、地域・イベント・読みもの・掲載は `published` で運営による非公開でない。`keyword` は共有カーネルの `SearchKeyword.create` で作り、`pagination` は `page: 1`・`limit: 10`。`searchPlaces` の `vacantOnly` と `searchOccasions` の `openOnly` は `false`、`today` はテストの今日
- 期待結果の `relevance` は、その種類の `SearchableText` に対する `KeywordRelevance.relevance` の値と、`PlaceEntry` は `ViewProjection.placeEntry` の結果と一致する

## 一致と関連度

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗「山田」「山田珈琲店」「喫茶山田屋」、紹介にだけ「山田」を含む店舗「海の家」、どこにも「山田」を含まない店舗「港食堂」。どの所在地も「山田」を含まない | 「山田」で `searchPlaces` を呼ぶ | 「山田」（`relevance: 4`）、「山田珈琲店」（3）、「喫茶山田屋」（2）の順。「海の家」と「港食堂」は現れない（店舗は店名と住所で探す）。`count` は 3 | |
| 所在地（`Address.text`）にだけ「銀座」を含む店舗 P と、名称が「銀座食堂」で所在地にも「銀座」を含む店舗 Q | 「銀座」で `searchPlaces` を呼ぶ | Q（`relevance: 3`。名称が語で始まる）、P（1。所在地だけが語を含む）の順 | |
| 名称が「CAFE Lunt」の店舗 | 「cafe」で `searchPlaces` を呼ぶ | `relevance: 3` で返る（対象の文字列は共有カーネルの `TextNormalization.normalize` で正規化して比べるので、「cafelunt」が「cafe」で始まる） | |
| 掲載「山田の桃」（説明に「直売」を含む）と、掲載「山田のぶどう」（「直売」をどこにも含まない） | 「山田 直売」で `searchListings` を呼ぶ | 「山田の桃」だけが `relevance: 4`（3 + 1）で返る | |
| 名称が「山田珈琲」の店舗と「珈琲山田」の店舗 | 「山田 珈琲」で `searchPlaces` を呼ぶ | どちらも `relevance: 5`（3 + 2、2 + 3）で返る。語の順序は一致に関わらない | |
| 名称が「桃」の掲載と、説明にだけ「桃」を含む掲載 | 「桃」で `searchListings` を呼ぶ | 名称が「桃」の掲載（4）、説明に含む掲載（1）の順 | |
| 名称・キャッチコピー・紹介・所在地のそれぞれにだけ「港」を含む地域が1つずつ | 「港」で `searchRegions` を呼ぶ | 4つとも返る。名称に含む地域が先頭で、残りの3つは `relevance: 1` | |
| キャッチコピーを持たない地域 | その地域のどこにもない語で `searchRegions` を呼ぶ | 現れない | |
| 名称・キャッチコピー・紹介・開催場所の所在地のそれぞれにだけ「港」を含むイベントが1つずつ | 「港」で `searchOccasions` を呼ぶ | 4つとも返る。名称に含むイベントが先頭で、残りの3つは `relevance: 1` | |
| タイトルに「港」を含む読みものと、本文にだけ「港」を含む読みもの | 「港」で `searchArticles` を呼ぶ | タイトルに含む読みもの、本文に含む読みものの順 | |
| 店舗の名称と、その店舗の掲載の名称が、どちらも「山田」を含む | 「山田」で `searchPlaces` と `searchListings` を呼ぶ | 店舗は `searchPlaces` だけに、掲載は `searchListings` だけに現れる | |
| どの対象にも含まれない語 | 5つのメソッドをそれぞれ呼ぶ | どれも `items` は空、`count` は 0 | |

## 対象の範囲

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| キーワードに一致する、休業中の店舗と閉店した店舗 | `searchPlaces` を呼ぶ | どちらも返る | |
| キーワードに一致する、非公開の店舗 | `searchPlaces` を呼ぶ | 現れない。`count` にも含まれない | |
| キーワードに一致する写真のない店舗 P に、`published` の掲載がある。写真のない店舗 Q には、閲覧できる掲載がない | `searchPlaces` を呼ぶ | P も Q も返る。P の `substituteCover` はその掲載と代表写真、Q の `substituteCover` は `null` | |
| キーワードに一致する店舗が、公開中の地域 X・Y にこの順に所属し、代表地域は Y。`unpublished` の地域 Z にも所属している | `searchPlaces` を呼ぶ | `regions` は Y、X の順。Z は含まれない | |
| キーワードに一致する、提供開始前の掲載、期日で提供終了の掲載、管理する人が提供終了にした掲載、閉店した店舗の掲載 | `searchListings` を呼ぶ | どれも返る | |
| キーワードに一致する、`draft`・`unpublished`・運営による非公開の掲載、非公開の店舗の `published` の掲載、`delete` した掲載 | `searchListings` を呼ぶ | どれも現れない | |
| キーワードに一致する、`draft`・`unpublished`・運営による非公開の地域 | `searchRegions` を呼ぶ | どれも現れない | |
| キーワードに一致する、開催前・開催中・終了・中止のイベント | `searchOccasions` を呼ぶ | 4つとも返る | |
| キーワードに一致する、`draft`・`unpublished`・運営による非公開のイベント | `searchOccasions` を呼ぶ | どれも現れない | |
| キーワードに一致する、`draft` と `unpublished` の読みもの | `searchArticles` を呼ぶ | どちらも現れない | |

## 候補の範囲

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| キーワードに一致する、店舗管理者のいる店舗 P1、管理体制の保存がない店舗 P2、最後の店舗管理者が辞任して `vacant` になった店舗 P3 | `vacantOnly: true` で `searchPlaces` を呼ぶ。別に `vacantOnly: false` で呼ぶ | `true` では P2・P3 だけが返り、`count` は 2。`false` では3つとも返り、`count` は 3 | |
| キーワードに一致する、管理者のいない店舗が5件と、店舗管理者のいる店舗が3件 | `vacantOnly: true`・`limit: 3` で `page: 1`・`page: 2` を呼ぶ | 3件、2件。どちらのページも管理者のいない店舗だけで、`count` は 5 | |
| キーワードに一致する、管理者のいない非公開の店舗 | `vacantOnly: true` で `searchPlaces` を呼ぶ | 現れない | |
| キーワードに一致する、開催前・開催中・終了・中止のイベント | `openOnly: true` で `searchOccasions` を呼ぶ | 開催前と開催中の2つだけが返り、`count` は 2 | |
| キーワードに一致するイベントの開催期間の終了日が D | `today` を D にして、`openOnly: true` で呼ぶ。別に、`today` を D の翌日にして呼ぶ | 前者では返り、後者では返らない（`standing` は引数の `today` で求める） | |

## 並び順とページング

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `relevance` が同じ店舗 P1・P2 の `registeredAt` が T1 < T2 | `searchPlaces` を呼ぶ | P2、P1 の順 | |
| `relevance` も `registeredAt` も同じ店舗が2つ | `searchPlaces` を呼ぶ | `PlaceId` の昇順 | |
| `relevance` が同じ掲載 L1・L2 の `firstPublishedAt` が T1 < T2。`relevance` の高い掲載 L0 の `firstPublishedAt` は最も古い | `searchListings` を呼ぶ | L0、L2、L1 の順 | |
| `relevance` が同じ地域・イベント・読みものが、それぞれ `firstPublishedAt` の違う2つずつ | `searchRegions`・`searchOccasions`・`searchArticles` を呼ぶ | どれも `firstPublishedAt` の新しいほうが先。イベントも開催日の順ではなく新しい順 | |
| 一致する掲載が1件 | `searchListings` を呼ぶ | `items` は1件、`count` は 1 | |
| 一致する掲載が3件 | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| 一致する掲載が5件 | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |
| 一致する店舗が5件、掲載が2件 | `searchPlaces` を `page: 2`・`limit: 3`、`searchListings` を `page: 1`・`limit: 3` で呼ぶ | 店舗は残りの2件、掲載は2件。種類ごとに独立にページングされる | |
| 一致する店舗・地域・イベント・読みものが、それぞれ5件 | `searchPlaces`・`searchRegions`・`searchOccasions`・`searchArticles` を、`limit: 3` で `page: 1`・`page: 2`・`page: 3` と呼ぶ | どのメソッドも、3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## 可視性と UnitOfWork

このポートは UnitOfWork に参加しない。各ドメインの書き込みのコミットとロールバックが、読み取りにどう現れるかを確かめる。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 名称が「港食堂」の店舗 | 名称を「山田食堂」に更新して `save` してコミットし、直後に「山田」と「港」で `searchPlaces` を呼ぶ | 「山田」では現れ、「港」では現れない | |
| キーワードに一致する `published` の掲載 L | `unpublish` した L を `save` してコミットし、直後に `searchListings` を呼ぶ。続けて、`publish` して `save` してコミットし、もう一度呼ぶ | 1回目は現れず、2回目は現れる | |
| キーワードに一致する掲載を持つ店舗 P | P を非公開にして `save` してコミットし、直後に `searchPlaces`・`searchListings` を呼ぶ | P も、P の掲載も現れない | |
| キーワードに一致する `draft` の地域・イベント・読みもの（公開条件を満たす） | それぞれ `publish` して `save` してコミットし、直後に `searchRegions`・`searchOccasions`・`searchArticles` を呼ぶ | どれも現れる | |
| キーワードに一致する `draft` の掲載 L | UnitOfWork の中で、`publish` した L を `save` した後に、`fn` が例外を投げる | `searchListings` に L は現れない | |
| キーワードに一致する、管理者のいない店舗 P | 管理権限の申請の承認で P に店舗管理者を置き、`StewardshipRepository` に保存してコミットし、直後に `vacantOnly: true` で `searchPlaces` を呼ぶ | P は現れない | |
