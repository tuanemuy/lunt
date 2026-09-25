# FeedCandidateQueries

契約は [Discovery](../../domains/discovery.md) の「ポート」の「共通の契約」と「FeedCandidateQueries」による。このポートは読み取りだけを持つので、前提条件の集約は、各ドメインのリポジトリ（`PlaceRepository`・`ListingRepository`・`RegionRepository`・`PlaceAffiliationsRepository`・`OccasionRepository`・`ParticipationRepository`）の `insert`・`save`・`delete` を UnitOfWork の中で呼んで置き、コミットの後に読む。集約は各ドメインの振る舞いで作る。

- 「フィード対象の掲載」は、`published` で運営による非公開でなく、提供状態の段階が `available` で、紐づく店舗が非公開でも閉店でもない掲載を指す
- 特に書かなければ、`criteria` は条件なし（`areaCodes`・`categoryIds` とも `null`）、`origin` は `null`、`today` は前提条件の「今日」、`pagination` は `page: 1`・`limit: 10`
- 期待結果の Entry は、同じ集約に `ViewProjection.placeEntry` を当てた結果と一致する

## findListings の対象

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 掲載が1件もない | `findListings` を呼ぶ | `items` は空、`count` は 0 | |
| 営業中の店舗 P のフィード対象の掲載 L が1件 | `findListings` を呼ぶ | L と P の `ListingEntry` が1件返る。`count` は 1 | |
| 店舗 P に、`draft` の掲載、`unpublished`（`byManager`）の掲載、`unpublished`（`photoTakedown`）の掲載、`published` で運営による非公開の掲載がある | `findListings` を呼ぶ | どれも現れない | |
| 非公開の店舗 P に、`published` で提供中の掲載がある | `findListings` を呼ぶ | 現れない | |
| フィード対象の掲載 L を `ListingRepository.delete` で削除した | `findListings` を呼ぶ | L は現れない | |
| 営業中の店舗に、提供期間の開始が今日より後の掲載、提供期間の終了が今日より前の掲載、最後の開催日が今日より前の掲載、`manualEnd.ended: true` の掲載がある | `findListings` を呼ぶ | どれも現れない | |
| 営業中の店舗に、最初の開催日が今日より後の掲載と、提供の設定が「設定しない」の掲載がある | `findListings` を呼ぶ | どちらも現れる | |
| 提供期間の開始が 5/10 の `published` の掲載 | `today` を 5/9 にして呼ぶ。別に 5/10 にして呼ぶ | 5/9 では現れず、5/10 では現れる（提供状態は引数の `today` で求まる） | |
| 提供期間の終了が 5/8 の掲載と、最後の開催日が 5/8 の掲載 | `today` を 5/8 にして呼ぶ。別に 5/9 にして呼ぶ | 5/8 ではどちらも現れ、5/9 ではどちらも現れない（`Offering.lastAvailableOn` の日まで提供中） | |
| 休業中（`temporarilyClosed`）の店舗と、閉店（`permanentlyClosed`）の店舗に、`published` で提供中の掲載がある | `findListings` を呼ぶ | 休業中の店舗の掲載だけが現れる | |
| フィード対象の掲載 L が、参加（`Participation`）の `listingIds` に添えられている | `findListings` を呼ぶ | L が、他の掲載と同じ条件で1回だけ現れる | |

## findListings の絞り込み

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 所在地の `areaCode` が A の店舗の掲載 La と、B の店舗の掲載 Lb（どちらもフィード対象） | `areaCodes: {A}` で呼ぶ | La だけが返る。`count` は 1 | |
| 上と同じ | `areaCodes: {A, B}` で呼ぶ | La と Lb が返る | |
| 上と同じ | `areaCodes` を空の集合にして呼ぶ | `items` は空、`count` は 0 | |
| `categoryId` が K1 の掲載 L1 と、K2 の掲載 L2（どちらもフィード対象） | `categoryIds: {K1}` で呼ぶ | L1 だけが返る | |
| 上と同じ | `categoryIds: {K1, K2}` で呼ぶ | L1 と L2 が返る | |
| カテゴリー K が廃止され、移行先は M。`content.categoryId` に K が保存されたままのフィード対象の掲載 L | `categoryIds: {M, K}`（M の `predecessorsOf`）で呼ぶ | L が返る。結果の `listing.content.categoryId` は K のまま | |
| 上と同じ | `categoryIds: {M}` で呼ぶ | L は返らない（保存された値と比べる） | |
| `areaCode` A の店舗の K1 の掲載 L1、A の店舗の K2 の掲載 L2、B の店舗の K1 の掲載 L3 | `areaCodes: {A}`・`categoryIds: {K1}` で呼ぶ | L1 だけが返る | |

## Entry の中身

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P が、公開中の地域 X・Y にこの順に所属し、代表地域に Y を選んでいる | `findListings` を呼ぶ | P の掲載の `place.regions` は Y、X の順 | |
| 店舗 P が X・Y・Z にこの順に所属し、代表地域に X を選んでいる。X は `unpublished`、Z は運営による非公開 | `findListings` を呼ぶ | `place.regions` は Y だけ | |
| 店舗 P の `PlaceAffiliations` が保存されていない。店舗 Q の `PlaceAffiliations` は所属が空 | `findListings` を呼ぶ | どちらの店舗の掲載も、`place.regions` は空 | |
| 写真を持つ店舗 P | `findListings` を呼ぶ | `place.substituteCover` は `null` | |
| 写真のない店舗 P に、提供中の掲載 a1・a2 がある。`firstPublishedAt` は a1 が T1、a2 が T2（T1 < T2） | `findListings` を呼ぶ | a1 と a2 のどちらの Entry でも、`place.substituteCover` は a2 とその代表写真（見せる範囲を含む） | |
| 上に加えて、P に、`firstPublishedAt` が T3（T2 < T3）の提供開始前の掲載 u1 がある | `findListings` を呼ぶ | a1 と a2 のどちらの Entry でも、`place.substituteCover` は u1 とその代表写真（提供状態を問わず、`firstPublishedAt` が最も新しい閲覧できる掲載） | |
| 写真のない店舗 P に、`firstPublishedAt` が同じ提供中の掲載が2件ある | `findListings` を呼ぶ | `place.substituteCover` は、`ListingId` が小さいほうの掲載 | |
| 写真のない店舗 P に、提供中の掲載 a1（T1）と、`firstPublishedAt` が T2（T1 < T2）の掲載が、`unpublished` のものと運営による非公開のものとで1件ずつある | `findListings` を呼ぶ | `place.substituteCover` は a1 とその代表写真（閲覧できない掲載では代用しない） | |

## findListings の並び順とページング

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| フィード対象の掲載 L1・L2・L3 の `firstPublishedAt` が T1 < T2 < T3 | `origin: null` で呼ぶ | L3、L2、L1 の順 | |
| 上の L1 を `unpublish` して保存し、T3 より後に `publish` して保存した | `origin: null` で呼ぶ | L3、L2、L1 の順のまま | |
| `firstPublishedAt` が同じ掲載が2件 | `origin: null` で呼ぶ | `ListingId` の昇順 | |
| 店舗 P1・P2・P3 の位置が、`origin` から 100 m・500 m・2 km。それぞれにフィード対象の掲載が1件。`firstPublishedAt` は P3 の掲載が最も新しい | その `origin` で呼ぶ | P1、P2、P3 の掲載の順 | |
| 同じ店舗に、フィード対象の掲載 a1（先に公開）と a2（後に公開） | `origin` つきで呼ぶ | a2、a1 の順（距離が同じなら新しい順） | |
| `Geo.distanceMeters` が同じになる2つの店舗に、`firstPublishedAt` が同じ掲載が1件ずつ | `origin` つきで呼ぶ | `ListingId` の昇順 | |
| フィード対象の掲載が3件 | `page: 1`・`limit: 3` で呼ぶ | `items` は3件、`count` は 3 | |
| フィード対象の掲載が5件 | `limit: 3` で、`page: 1` と `page: 2` を呼ぶ | `page: 1` は並び順の先頭の3件、`page: 2` は残りの2件。重複も欠けもない。どちらも `count` は 5 | |
| フィード対象の掲載が5件 | `page: 3`・`limit: 3` で呼ぶ | `items` は空、`count` は 5 | |
| フィード対象の掲載が5件、対象でない掲載（提供終了、一時非公開）が3件 | `limit: 100` で呼ぶ | `items` は5件、`count` は 5 | |

## findRegionFrames

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の地域が1つもない | `findRegionFrames` を呼ぶ | `items` は空、`count` は 0 | |
| 公開中の地域 R に所属する店舗に、フィード対象の掲載が1件ある | `findRegionFrames` を呼ぶ | R が返る。`count` は 1 | |
| 公開中の地域 R に、所属する店舗がない。公開中の地域 S に所属する店舗の掲載は、提供終了と一時非公開だけ | `findRegionFrames` を呼ぶ | R も S も現れない | |
| 公開中の地域 R に所属する店舗が、閉店した店舗と非公開の店舗だけ。どちらにも `published` で提供中の掲載がある | `findRegionFrames` を呼ぶ | R は現れない | |
| 店舗 P が地域 X・Y に所属し、代表地域は X。P にフィード対象の掲載がある | `findRegionFrames` を呼ぶ | X と Y の両方が返る | |
| `draft`・`unpublished`・運営による非公開の地域に所属する店舗に、フィード対象の掲載がある | `findRegionFrames` を呼ぶ | どの地域も現れない | |
| 地域 R1 に所属する店舗（`areaCode` A）に K1 の掲載、地域 R2 に所属する店舗（`areaCode` A）に K2 の掲載、地域 R3 に所属する店舗（`areaCode` B）に K1 の掲載がある。R3 の所在地の `areaCode` は A | `areaCodes: {A}`・`categoryIds: {K1}` で呼ぶ | R1 だけが返る（同じ `criteria` の `findListings` の対象になる掲載を持つ地域に限る。地域の所在地は関わらない） | |
| 対象になる地域 R1・R2・R3 の `firstPublishedAt` が T1 < T2 < T3 | `origin: null` で呼ぶ | R3、R2、R1 の順 | |
| `firstPublishedAt` が同じ対象の地域が2つ | `origin: null` で呼ぶ | `RegionId` の昇順 | |
| 地域 R1・R2 の位置と、それぞれに所属しフィード対象の掲載を持つ店舗の位置が、`origin` から 5 km・1 km | その `origin` で呼ぶ | R2、R1 の順 | |
| 地域 R1 の位置は `origin` から 5 km で、R1 に所属しフィード対象の掲載を持つ店舗の位置は 500 m。地域 R2 の位置と、R2 に所属しフィード対象の掲載を持つ店舗の位置は 1 km。地域 R3 の位置と、R3 に所属しフィード対象の掲載を持つ店舗の位置は 3 km で、R3 に所属する非公開の店舗の位置は 100 m | その `origin` で呼ぶ | R1、R2、R3 の順（地域の距離は、`RegionFootprint.of(…, "reference")` の位置のうち最も近いものまで。非公開の店舗は効かない） | |
| 対象になる地域が5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## findOccasionFrames

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中のイベントが1つもない | `findOccasionFrames` を呼ぶ | `items` は空、`count` は 0 | |
| 開催前の公開中のイベント E に、営業中の店舗の参加が1つある。参加は掲載を添えていない | `findOccasionFrames` を呼ぶ | E が返る。`count` は 1 | |
| 開催前のイベント E の参加に添えた掲載が、提供開始前の掲載だけ | `findOccasionFrames` を呼ぶ | E が返る | |
| 開催期間が今日を含むイベント E に、参加がある | `findOccasionFrames` を呼ぶ | E が返る | |
| 開催前のイベントに、参加が1つもない | `findOccasionFrames` を呼ぶ | 現れない | |
| 開催前のイベントの参加が、非公開の店舗の参加だけ | `findOccasionFrames` を呼ぶ | 現れない | |
| 開催前のイベントの参加が、閉店した店舗の参加だけ | `findOccasionFrames` を呼ぶ | 現れる（閉店した店舗は閲覧できる） | |
| 参加を持つイベントで、開催期間の終了が今日より前のものと、`cancellation.cancelled: true` のものがある | `findOccasionFrames` を呼ぶ | どちらも現れない | |
| 開催期間の終了が 5/10 の、参加を持つイベント | `today` を 5/10 にして呼ぶ。別に 5/11 にして呼ぶ | 5/10 では現れ、5/11 では現れない | |
| 参加を持つ開催前のイベントが、`draft`、`unpublished`、運営による非公開のいずれか | `findOccasionFrames` を呼ぶ | どれも現れない | |
| 開催場所の `areaCode` が A のイベント Ea と、B のイベント Eb（どちらも対象）。Ea の参加店舗の所在地は B | `areaCodes: {A}` で呼ぶ | Ea だけが返る（開催場所の所在地で決まる） | |
| 対象のイベント E の参加店舗が、K1 の掲載を持たない | `categoryIds: {K2}` で呼ぶ | E が返る（カテゴリーの条件は効かない） | |
| 対象のイベント E1（5/1〜5/5）、E2（4/28〜5/2）、E3（5/1〜5/3） | `origin: null` で呼ぶ | E2、E3、E1 の順（`period.start` の昇順、次に `period.end` の昇順） | |
| 開催期間が同じ対象のイベントが2つ | `origin: null` で呼ぶ | `OccasionId` の昇順 | |
| 対象のイベント E1・E2 の開催場所が、`origin` から 5 km・1 km。開催は E1 のほうが早い | その `origin` で呼ぶ | E2、E1 の順（`venue.location` までの距離） | |
| 対象のイベントが5つ | `limit: 3` で `page: 1`・`page: 2`・`page: 3` を呼ぶ | 3件、2件、空。重複も欠けもない。どれも `count` は 5 | |

## 可視性と UnitOfWork

このポートは UnitOfWork に参加しない。各ドメインの書き込みのコミットとロールバックが、読み取りにどう現れるかを確かめる。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `draft` の掲載 L（公開条件を満たす） | UnitOfWork の中で、`publish` した L を `save` してコミットし、直後に `findListings` を呼ぶ | L が現れる | |
| フィード対象の掲載 L | `unpublish` した L を `save` してコミットし、直後に `findListings` を呼ぶ | L は現れない | |
| 店舗 P にフィード対象の掲載が2件 | P を非公開にして `save` してコミットし、直後に `findListings` を呼ぶ。続けて、非公開を解除して `save` してコミットし、もう一度呼ぶ | 1回目は2件とも現れず、2回目は2件とも現れる | |
| 店舗 P にフィード対象の掲載がある | P の営業状況を閉店にして `save` してコミットし、直後に `findListings` を呼ぶ | P の掲載は現れない | |
| フィード対象の掲載を持つ店舗 P。公開中の地域 R は、対象の掲載を持たない | P の `PlaceAffiliations` に R との所属を加えて保存してコミットし、直後に `findRegionFrames` を呼ぶ | R が現れる。`findListings` の P の掲載の `place.regions` に R が現れる | |
| 参加を持たない開催前の公開中のイベント E | 参加を `ParticipationRepository.insert` してコミットし、直後に `findOccasionFrames` を呼ぶ。続けて、参加を `delete` してコミットし、もう一度呼ぶ | 1回目は E が現れ、2回目は現れない | |
| `draft` の掲載 L | UnitOfWork の中で、`publish` した L を `save` した後に、`fn` が例外を投げる | `findListings` に L は現れない | |
| フィード対象の掲載 L | UnitOfWork の中で、L を `delete` した後に、`fn` が例外を投げる | `findListings` に L が現れる | |
