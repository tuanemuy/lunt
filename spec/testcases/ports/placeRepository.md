# PlaceRepository

ポートの契約は [../../domains/place.md](../../domains/place.md) の「PlaceRepository」と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」による。前提条件は `PlaceRepository` のメソッド呼び出しだけで組み立てる。`delete` は持たない。リポジトリは `UnitOfWorkContext` から得る。「UnitOfWork の中で」と書かない呼び出しは、呼び出しごとに1つの `run` の中で行い、コミットする。

## テスト用の店舗

ID は `p1 < p2 < … < p6` の昇順。`match` のケースは、次の6件をすべて `insert` し、p4 は `insert` の後に非公開にした内容を `save` した状態を前提にする。

| ID | 名称 | 所在地（`prefecture`・`municipality`・`town`・`rest`） | 営業状況 | 非公開 |
|---|---|---|---|---|
| p1 | 山田珈琲店 | 東京都・千代田区・大手町・1-1 | `open` | いいえ |
| p2 | 山田珈琲店 別館 | 東京都・中央区・銀座・2-2 | `temporarilyClosed` | いいえ |
| p3 | 純喫茶 山田珈琲店 | 大阪府・大阪市北区・梅田・3-3 | `permanentlyClosed` | いいえ |
| p4 | 山田 | 大阪府・大阪市北区・梅田・4-4 | `open` | はい |
| p5 | 海の家 | 東京都・千代田区・千代田・5-5 | `open` | いいえ |
| p6 | Yamada Coffee | 東京都・中央区・銀座・6-6 | `open` | いいえ |

`criteria` の語は `MatchText.create` で作る（`TextNormalization.normalize` で正規化した値）。

## メソッドの基本動作

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗がない | p1 を `insert` し、`findById(p1)` を呼ぶ | `insert` した内容と等しい店舗（店舗情報、写真の順序、営業状況、非公開かどうか、登録の日時、更新の日時）と、`save` に使える `expectedVersion` を返す | |
| 店舗がない | `findById(p1)` | `null` を返す | |
| p1 がある | 同じ ID の店舗（内容は別）を `insert` する | `ConflictError` になる。`findById(p1)` は最初の内容のまま | |
| p1 がある | p1 と同じ名称・同じ所在地で、ID が p2 の店舗を `insert` する | 成立する。`findById(p1)` と `findById(p2)` がそれぞれの店舗を返す（名称・所在地の一意性は担保しない） | |
| p1 がある | `findById(p1)` の `expectedVersion` で、名称と写真の並びを変えた内容を `save` し、`findById(p1)` を呼ぶ | 変えた後の内容を返す。写真は保存した順序のまま。返る `expectedVersion` で、続けて `save` できる | |
| p1 が写真を2枚持つ | `findById(p1)` の `expectedVersion` で、`takeDownPhotos` で1枚を外した内容を `save` し、`findById(p1)` を呼ぶ | 残る写真と、写真の並びの `takenDown` を、保存した値のまま返す | |
| p1 がある | `findById(p1)` の `expectedVersion` で、非公開にした内容を `save` し、`findById(p1)` を呼ぶ | 非公開の店舗（`suspended: true`）を返す。非公開の店舗も `findById` で読める | |
| 店舗がない | 保存されていない p1 を `save` する | `NotFoundError` になる | |
| p1、p2（p2 は非公開）がある | `findByIds([p2, p1, p9])`（p9 は存在しない） | p1、p2 を返す（順序は問わない）。非公開の p2 を含む。p9 は結果に現れない | |
| p1 がある | `findByIds([])` | 空の結果を返す | |
| 100件の店舗がある | 100件の ID を渡して `findByIds` を呼ぶ | 100件すべてを返す | |
| 店舗がある | 101件の ID を渡して `findByIds` を呼ぶ | `BusinessRuleError`（`COMMON_INVALID_INPUT`）になる | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| p1 がある。`findById(p1)` を2回呼び、同じ版の `expectedVersion` を2つ持つ | 1つ目の `expectedVersion` で店舗情報を変えて `save` し、続けて2つ目の `expectedVersion` で営業状況を変えて `save` する | 1つ目は成立し、2つ目は `ConflictError` になる。`findById(p1)` は1つ目の内容で、営業状況は変わっていない | |
| p1 がある。同じ版の `expectedVersion` を2つ持つ | 非公開にする `save` と、写真を削除する `save` を同時に行う | どちらか一方だけが成立し、他方は `ConflictError` になる（店舗情報の更新、営業状況の変更、情報修正の反映、非公開とその解除、写真の削除は、同じ版で競合を検出する） | |

## 照合（`match`）

括弧の中の数は、その店舗と `criteria` に対する `PlaceMatching.relevance` の値（並びの根拠）。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| テスト用の店舗 | 店名「山田」、`includeSuspended: false`、`page: 1`、`limit: 10` | `items` は p1（3）、p2（3）、p3（2）の順。同じ関連度の p1 と p2 は ID の昇順。`count` は 3。非公開の p4 は含まれない。休業の p2 と閉店の p3 は含まれる（営業状況では絞り込まない） | |
| テスト用の店舗 | 店名「山田」、`includeSuspended: true`、`page: 1`、`limit: 10` | `items` は p4（4）、p1（3）、p2（3）、p3（2）の順。`count` は 4。非公開の p4 を含む | |
| テスト用の店舗 | 店名「山田珈琲店」、`includeSuspended: true` | `items` は p1（4）、p2（3）、p3（2）、p4（1）の順。`count` は 4。名称「山田」の p4 は、名称が語に含まれることで一致する | |
| テスト用の店舗 | 店名「山田珈琲店 本店」（正規化した値は `山田珈琲店本店`）、`includeSuspended: true` | `items` は p1（1）、p4（1）の順（同順位は ID の昇順）。`count` は 2。名称が語に含まれる店舗だけが一致し、名称が語を含まない p2・p3 は含まれない | |
| テスト用の店舗 | 住所「東京都千代田区」、`includeSuspended: false` | `items` は p1（3）、p5（3）の順（同順位は ID の昇順）。`count` は 2。所在地は `prefecture`・`municipality`・`town`・`rest` をこの順につないだ文字列で比べる | |
| テスト用の店舗 | 住所「東京都千代田区大手町1-1」、`includeSuspended: false` | `items` は p1（4）だけ | |
| テスト用の店舗 | 住所「銀座」、`includeSuspended: false` | `items` は p2（2）、p6（2）の順 | |
| テスト用の店舗 | 店名「山田珈琲店」と住所「東京都千代田区」、`includeSuspended: false` | `items` は p1（7）、p2（3）、p5（3）、p3（2）の順。店名だけが一致する p2・p3 と、住所だけが一致する p5 を含み、両方が一致する p1 が先頭。`count` は 4 | |
| テスト用の店舗 | 店名「ＹＡＭＡＤＡ　ｃｏｆｆｅｅ」から作った語（正規化した値は `yamadacoffee`）、`includeSuspended: false` | `items` は p6（4）だけ。保存された名称「Yamada Coffee」は、NFKC 正規化・小文字化・空白の除去をした値で比べられる | |
| テスト用の店舗 | 同じ語「梅田」を店名と住所の両方に入れる、`includeSuspended: true` | `items` は p3（2）、p4（2）の順。`count` は 2 | |
| テスト用の店舗 | 上の各ケースの結果 | `items` のすべての店舗で `PlaceMatching.matches` が成り立ち、並びは `PlaceMatching.relevance` の降順（同順位は ID の昇順）と一致する | |
| テスト用の店舗 | 店名「存在しない店」、`includeSuspended: true` | `items` は空、`count` は 0 | |
| テスト用の店舗 | 店名「海の家」、`includeSuspended: false`、`page: 1`、`limit: 10` | `items` は p5 の1件、`count` は 1 | |
| テスト用の店舗 | 店名「山田」、`includeSuspended: true`、`page: 1`、`limit: 4`（件数が上限ちょうど） | `items` は p4、p1、p2、p3 の4件、`count` は 4 | |
| テスト用の店舗 | 店名「山田」、`includeSuspended: true`、`page: 1`、`limit: 3`（件数が上限を超える） | `items` は p4、p1、p2 の3件、`count` は 4 | |
| テスト用の店舗 | 店名「山田」、`includeSuspended: true`、`page: 2`、`limit: 3` | `items` は p3 の1件、`count` は 4 | |
| テスト用の店舗 | 店名「山田」、`includeSuspended: true`、`page: 3`、`limit: 3`（範囲の外の `page`） | `items` は空、`count` は 4 | |

## 可視性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗がない | p1 を `insert` した直後に、`findById(p1)`、`findByIds([p1])`、店名「山田珈琲店」の `match` を呼ぶ | 3つとも p1 を返す | |
| p1 がある | 名称を「川辺食堂」に変えて `save` した直後に、店名「山田珈琲店」と店名「川辺食堂」の `match` を呼ぶ | 「山田珈琲店」では p1 は現れず、「川辺食堂」では p1 が現れる | |
| p1 がある | 非公開にした内容を `save` した直後に、店名「山田珈琲店」の `match` を `includeSuspended: false` と `true` で呼ぶ | `false` では p1 は現れず、`true` では p1 が現れる | |

## UnitOfWork の中での振る舞い

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗がない | UnitOfWork の中で p1 と p2 を `insert` し、`fn` が値を返す | コミットの後、`findByIds([p1, p2])` が2件を返し、`match` にも現れる | |
| 店舗がない | UnitOfWork の中で p1 と p2 を `insert` し、その後に `fn` が例外を投げる | ロールバックの後、`findById(p1)`・`findById(p2)` は `null`。`match` にも現れない。1件も残らない | |
| p1 がある | UnitOfWork の中で、p1 の名称を変えて `save` し、p2 を `insert` し、その後に `fn` が例外を投げる | `findById(p1)` は元の内容のまま、`findById(p2)` は `null` | |
| p1 がある | UnitOfWork の中で、p2 を `insert` し、同じ ID の p1 を `insert` する | 遅くともコミットの時点で `ConflictError` になり、スコープ全体がロールバックされる。`findById(p2)` は `null` | |
| p1 がある。先の UnitOfWork で `findById(p1)` の `expectedVersion` を得た後、別の UnitOfWork の `save` が p1 を更新している | 新しい UnitOfWork の中で、p2 を `insert` し、古い `expectedVersion` で p1 を `save` する | 遅くともコミットの時点で `ConflictError` になり、スコープ全体がロールバックされる。`findById(p2)` は `null`、p1 は別の `save` の内容のまま | |
