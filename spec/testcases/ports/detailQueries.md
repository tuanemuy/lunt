# DetailQueries

契約は [Discovery](../../domains/discovery.md) の「ポート」の「共通の契約」と「DetailQueries」による。このポートは読み取りだけを持つので、前提条件の集約は、各ドメインのリポジトリ（`PlaceRepository`・`ListingRepository`・`RegionRepository`・`PlaceAffiliationsRepository`・`OccasionRepository`・`ParticipationRepository`・`RegionLinkRepository`・`ArticleRepository`）の `insert`・`save`・`delete` を UnitOfWork の中で呼んで置き、コミットの後に読む。集約は各ドメインの振る舞いで作る。

- 特に書かなければ、店舗は営業中で非公開でなく、地域・イベント・読みもの・掲載は `published` で運営による非公開でない。`today` は前提条件の「今日」、`pagination` は `page: 1`・`limit: 10`
- 期待結果の `PlaceEntry` は、同じ集約に `ViewProjection.placeEntry` を当てた結果と一致する

## 対象1件の読み取り

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| どの集約も保存されていない | `findListing`・`findPlace`・`findRegion`・`findOccasion`・`findArticle` を、それぞれ任意の ID で呼ぶ | どれも `null`。エラーにならない | |
| 営業中の店舗 P の、`published` で提供中の掲載 L | `findListing` を呼ぶ | L と P の `ListingEntry` が返る | |
| 提供開始前の掲載、期日で提供終了の掲載、管理する人が提供終了にした掲載、休業中の店舗の掲載、閉店した店舗の掲載 | それぞれ `findListing` を呼ぶ | どれも返る | |
| `draft` の掲載、`unpublished`（`byManager`）の掲載、`unpublished`（`photoTakedown`）の掲載、`published` で運営による非公開の掲載、非公開の店舗の `published` の掲載 | それぞれ `findListing` を呼ぶ | どれも `null` | |
| `published` の掲載を `ListingRepository.delete` で削除した | `findListing` を呼ぶ | `null` | |
| `content.categoryId` が廃止された K のままの掲載 | `findListing` を呼ぶ | 結果の `categoryId` は K のまま | |
| 営業中・休業中・閉店の店舗 | それぞれ `findPlace` を呼ぶ | どれも `PlaceEntry` が返る | |
| 非公開の店舗 | `findPlace` を呼ぶ | `null` | |
| 店舗 P が、公開中の地域 X・Y・Z にこの順に所属し、代表地域に Z を選んでいる | `findPlace` を呼ぶ | `regions` は Z、X、Y の順 | |
| 上の Z を `unpublish` して保存した | `findPlace` を呼ぶ | `regions` は X、Y の順 | |
| 写真のない店舗 P に、提供終了の掲載だけがある | `findPlace` を呼ぶ | `substituteCover` は、その掲載と代表写真（提供状態を問わず、閲覧できる掲載で代用する） | |
| 写真のない店舗 P に、提供中の掲載 a1（`firstPublishedAt` が T1）と、提供終了の掲載 e1（T2。T1 < T2）がある | `findPlace` を呼ぶ | `substituteCover` は e1 とその代表写真（`firstPublishedAt` が最も新しい閲覧できる掲載） | |
| 写真のない店舗 P の掲載が、`draft` と `unpublished` だけ | `findPlace` を呼ぶ | `substituteCover` は `null` | |
| 写真を持つ店舗 P に、`published` の掲載がある | `findPlace` を呼ぶ | `substituteCover` は `null` | |
| `published` の地域 | `findRegion` を呼ぶ | 地域が返る | |
| `draft`・`unpublished`・運営による非公開の地域 | それぞれ `findRegion` を呼ぶ | どれも `null` | |
| 開催前・開催中・終了・中止の公開中のイベント | それぞれ `findOccasion` を呼ぶ | どれも返る | |
| `draft`・`unpublished`・運営による非公開のイベント | それぞれ `findOccasion` を呼ぶ | どれも `null` | |
| `published` の読みもの。紹介先はすべて閲覧できない | `findArticle` を呼ぶ | 読みものが返る。`showcases` は保存された内容のまま | |
| `draft` と `unpublished` の読みもの | それぞれ `findArticle` を呼ぶ | どちらも `null` | |

## findListingsOfPlace

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P に掲載がない | `scene: "reference"` で呼ぶ | `items` は空、`count` は 0 | |
| 店舗 P に、提供終了の掲載 e1、提供開始前の掲載 u1、提供中の掲載 a1（`firstPublishedAt` が T1）・a2（T2）。`firstPublishedAt` は e1 が最も新しい | `scene: "reference"` で呼ぶ | a2、a1、u1、e1 の順。`count` は 4 | |
| 上と同じ | `scene: "discovery"` で呼ぶ | a2、a1 の順。`count` は 2 | |
| 同じ段階で `firstPublishedAt` が同じ掲載が2件 | `scene: "reference"` で呼ぶ | `ListingId` の昇順 | |
| 提供期間の開始が 5/10 の掲載 u と、提供中の掲載 a（u より古い） | `scene: "reference"` で、`today` を 5/9 にして呼ぶ。別に 5/10 にして呼ぶ | 5/9 では a、u の順。5/10 では u、a の順 | |
| 店舗 P に、`draft`・`unpublished`・運営による非公開の掲載がある | どちらの `scene` でも呼ぶ | どれも現れない | |
| 閉店した店舗 P に、`published` で提供中の掲載がある | `scene: "reference"` と `scene: "discovery"` で呼ぶ | `reference` では返り、`discovery` では `items` は空、`count` は 0 | |
| 休業中の店舗 P に、`published` で提供中の掲載がある | `scene: "discovery"` で呼ぶ | 返る | |
| 店舗 P が非公開。または、その ID の店舗がない | どちらの `scene` でも呼ぶ | `items` は空、`count` は 0 | |
| 別の店舗 Q の掲載がある | P で呼ぶ | Q の掲載は現れない | |
| P に対象の掲載が3件 | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| P に対象の掲載が5件 | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## findOccasionsRelatedTo

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P が、開催前のイベント E1 に掲載 L を添えて、開催前のイベント E2 に L を添えずに参加中 | `listing` の L で呼ぶ | E1 だけが返る | |
| 上と同じ | `place` の P で呼ぶ | E1 と E2 が返る | |
| 地域 R が、開催前のイベント E1 に `linked` で、開催前のイベント E2 に `detached` で関連づけられている | `region` の R で呼ぶ | E1 だけが返る | |
| 上の E2 との関連づけを `restore` して保存した | `region` の R で呼ぶ | E1 と E2 が返る | |
| 店舗 P が、開催前・開催中・終了・中止のイベントに1つずつ参加中 | `place` の P で呼ぶ | 開催前と開催中のイベントだけが返る | |
| 店舗 P が参加中のイベントの開催期間の終了が 5/10 | `place` の P で、`today` を 5/10 にして呼ぶ。別に 5/11 にして呼ぶ | 5/10 では返り、5/11 では返らない | |
| 店舗 P が参加中の開催前のイベントが、`draft`・`unpublished`・運営による非公開のいずれか | `place` の P で呼ぶ | どれも現れない | |
| 店舗 P が参加中のイベント E1（5/1〜5/5）、E2（4/28〜5/2）、E3（5/1〜5/3） | `place` の P で呼ぶ | E2、E3、E1 の順 | |
| 店舗 P が参加中の、開催期間が同じイベントが2つ | `place` の P で呼ぶ | `OccasionId` の昇順 | |
| 店舗 P の参加を `ParticipationRepository.delete` で解除した | `place` の P で呼ぶ | そのイベントは現れない | |
| 対象に結びつくイベントがない。または、その ID の対象がない | 3つの種類でそれぞれ呼ぶ | どれも空の並び | |
| 開催前の公開中のイベントに結びつく、`unpublished` の掲載（参加に添えられている）、非公開の店舗（参加中）、`unpublished` の地域（`linked`） | `listing`・`place`・`region` のそれぞれで呼ぶ | どれも空の並び（対象が閲覧できない） | |
| 店舗 P が、開催前のイベント12個に参加中 | `place` の P で呼ぶ | 12個すべてが返る（ページングを持たない） | |

## findParticipants

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中のイベント E に参加がない | E で呼ぶ | 空の並び | |
| E に、店舗 P（`participatedAt` が T1）、Q（T2）、S（T3）が参加中 | E で呼ぶ | P、Q、S の順（`participatedAt` の昇順）。それぞれ `place`（`PlaceEntry`）と `participation` を持つ | |
| E に、同じ `participatedAt` で店舗が2つ参加中 | E で呼ぶ | `PlaceId` の昇順 | |
| E に、休業中の店舗、閉店した店舗、非公開の店舗が参加中 | E で呼ぶ | 休業中の店舗と閉店した店舗が返る。非公開の店舗は現れない | |
| 店舗 P の参加の `listingIds` が l3、l1、l2 の順。どれも `published` で提供中 | E で呼ぶ | P の `listings` は l3、l1、l2 の順 | |
| 店舗 P の参加に添えた掲載に、提供開始前の掲載と提供終了の掲載がある | E で呼ぶ | どちらも `listings` に含まれる | |
| 店舗 P の参加に添えた掲載に、`unpublished` の掲載、運営による非公開の掲載、`delete` した掲載がある | E で呼ぶ | どれも `listings` に含まれない。P と、残りの掲載は返る。`participation.details.listingIds` は保存された値のまま | |
| 店舗 P の参加が、掲載を添えていない | E で呼ぶ | P が返り、`listings` は空 | |
| 参加日に、開催期間の外になった日付が残っている参加 | E で呼ぶ | `participation.details.dates` は保存された値のまま返る | |
| 終了したイベントと、中止のイベントに参加がある | それぞれで呼ぶ | どちらも参加店舗が返る | |
| イベントが `unpublished`、または運営による非公開。または、その ID のイベントがない | そのイベントで呼ぶ | どれも空の並び | |
| 別のイベント F の参加がある | E で呼ぶ | F の参加店舗は現れない | |
| E に、店舗30個が参加中 | E で呼ぶ | 30個すべてが返る（ページングを持たない） | |

## findRegionsOfOccasion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント E に関連づけがない | E で呼ぶ | 空の並び | |
| E に、地域 X（`linkedAt` が T1）、Y（T2）が `linked` で関連づけられている | E で呼ぶ | X、Y の順 | |
| E に、同じ `linkedAt` で地域が2つ関連づけられている | E で呼ぶ | `RegionId` の昇順 | |
| E と地域 Z の関連づけが `detached` | E で呼ぶ | Z は現れない | |
| 上の関連づけを `restore` して保存した | E で呼ぶ | Z が、元の `linkedAt` の位置に現れる | |
| E に `linked` で関連づけられた地域が、`unpublished`、または運営による非公開 | E で呼ぶ | その地域は現れない | |
| イベント E が `unpublished`、または運営による非公開。または、その ID のイベントがない。E には公開中の地域が `linked` で関連づけられている | E で呼ぶ | どれも空の並び | |
| E と地域 X の関連づけを `RegionLinkRepository.delete` で外した | E で呼ぶ | X は現れない | |

## findArticlesShowcasing

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P を紹介先に持つ読みものがない | `place` の P で呼ぶ | `items` は空、`count` は 0 | |
| P を紹介先に持つ `published` の読みもの A1・A2・A3 の `firstPublishedAt` が T1 < T2 < T3 | `place` の P で呼ぶ | A3、A2、A1 の順。`count` は 3 | |
| `firstPublishedAt` が同じ読みものが2つ | `place` の P で呼ぶ | `ArticleId` の昇順 | |
| P を紹介先に持つ `draft` の読みものと `unpublished` の読みもの | `place` の P で呼ぶ | どちらも現れない | |
| 掲載 L、地域 R、イベント E を、それぞれ紹介先に持つ公開中の読みものが1つずつ | `listing` の L、`region` の R、`occasion` の E で、それぞれ呼ぶ | それぞれ、その対象を紹介先に持つ読みものだけが返る | |
| 店舗 P の掲載 L だけを紹介先に持つ公開中の読みもの | `place` の P で呼ぶ | 現れない | |
| 公開中の読みもの A が、P を含む複数の紹介先を持つ | `place` の P で呼ぶ | A が1回だけ返る | |
| 非公開の店舗 P、P の `published` の掲載 L、`unpublished` の地域 R、運営による非公開のイベント E を、それぞれ紹介先に持つ公開中の読みものがある。または、紹介先の ID の対象がない | それぞれの参照で呼ぶ | どれも `items` は空、`count` は 0（対象が閲覧できない） | |
| P を紹介先に持つ公開中の読みものが3つ | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| P を紹介先に持つ公開中の読みものが5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## 可視性と UnitOfWork

このポートは UnitOfWork に参加しない。各ドメインの書き込みのコミットとロールバックが、読み取りにどう現れるかを確かめる。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `published` の掲載 L | L を運営による非公開にして `save` してコミットし、直後に `findListing` を呼ぶ。続けて、解除して `save` してコミットし、もう一度呼ぶ | 1回目は `null`、2回目は L が返る。公開状態は変わっていない | |
| `published` の掲載を持つ店舗 P | P を非公開にして `save` してコミットし、直後に `findPlace`・`findListing`・`findListingsOfPlace` を呼ぶ | `null`、`null`、空 | |
| 営業中の店舗 P | 営業状況を閉店にして `save` してコミットし、直後に `findPlace` を呼ぶ | 閉店の P が返る | |
| 公開中のイベント E と、参加していない店舗 P | 参加を `insert` してコミットし、直後に `findParticipants` と、`place` の P の `findOccasionsRelatedTo` を呼ぶ | P が参加店舗に、E が P のイベントに現れる | |
| 公開中のイベント E と地域 R | 関連づけを `insert` してコミットし、直後に `findRegionsOfOccasion` と、`region` の R の `findOccasionsRelatedTo` を呼ぶ | R と E が、それぞれ現れる | |
| `draft` の読みもの A が店舗 P を紹介先に持つ（公開条件を満たす） | `publish` して `save` してコミットし、直後に `findArticle` と `findArticlesShowcasing` を呼ぶ | どちらにも A が現れる | |
| `published` の掲載 L | UnitOfWork の中で、`unpublish` した L を `save` した後に、`fn` が例外を投げる | `findListing` は L を返す | |
| 公開中のイベント E と、参加していない店舗 P | UnitOfWork の中で参加を `insert` した後に、`fn` が例外を投げる | `findParticipants` に P は現れない | |
