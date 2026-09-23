# Bookmark のユースケース

ドメイン: Bookmark（[../domains/bookmark.md](../domains/bookmark.md)）

すべてログインしたアカウントの操作で、保存を持つアカウントは `Actor` から決まる。他のアカウントの保存を扱う入力はない。ログインせずに呼んだ要求は `UnauthorizedError` にする。各ユースケースの節に重ねて書かない。

ログインしていない間の保存は端末にだけあり、サーバーに保存しない。保存一覧に示す内容と、対象が閲覧できるかどうかは、ログインの有無にかかわらず、Discovery の `resolveReferences` が `BookmarkRef` から解決する（[discovery.md](discovery.md)）。ログインしている間は `listBookmarks` が返す参照を、ログインしていない間は端末が持つ参照を渡す。ログインしていない間の、保存の時点の閲覧できるかどうかの確認（KEP-01、CF-04）も `resolveReferences` が担う。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `saveBookmark` | 閲覧できる掲載または店舗を保存する | KEP-01 / CF-04（VW-01、DT-01、DT-02） |
| `removeBookmark` | 保存を解除する | KEP-01、KEP-02、KEP-03 / CF-04（VW-01、DT-01、DT-02、VW-10） |
| `restoreBookmark` | 解除した保存を、保存した日時を保って戻す | KEP-02、KEP-03 / CF-04（VW-10） |
| `mergeDeviceBookmarks` | 端末の保存の一覧を、アカウントの保存に合わせる | KEP-04 / VW-10 |
| `listBookmarks` | アカウントの保存の参照を、保存した日時の新しい順で返す | KEP-02、KEP-03 / VW-10 |
| `getSavedTargets` | 示した掲載・店舗のうち、保存済みのものを返す | KEP-01 / CF-04（VW-01、DT-01、DT-02） |
| `purgeBookmarksOnWithdrawal` | `account.withdrawn` を消費し、そのアカウントの保存をすべて削除する | ACC-04 |

## saveBookmark

### 概要

閲覧できる掲載または店舗を、アカウントの保存に加える。提供開始前・提供終了・休業・閉店は保存を妨げない。すでに保存済みなら、何も変えずに成功し、元の保存した日時が残る。同じアカウントの別の端末で同じ保存が済んでいても、結果は同じになる。

### 入出力

- 入力: `Actor`、保存の対象（`BookmarkRef`）
- 出力: なし（成立すると、対象は保存済み）

### 使用するドメインの振る舞い・ポート

- `ReferenceQueries.isViewable`（Discovery。結果を `Bookmark.save` の `targetViewable` に渡す）
- `Bookmark.save`
- `BookmarkRepository.add`
- `Clock`

保存済みかどうかを事前に検索しない。一意性は `add` が担保する。

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `bookmarkRepository.add` の1件。閲覧できるかどうかの読み取りは、書き込みの前に終える。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 対象が、非公開・一時非公開・削除で閲覧できない。存在しない対象を含む | `BusinessRuleError`（`BOOKMARK_TARGET_UNAVAILABLE`）。保存は加わらない。すでにある保存は残る |

## removeBookmark

### 概要

アカウントの保存から対象をなくす。対象が閲覧できるかどうかを問わず、閲覧できない保存も解除できる。すでに解除済みなら、何も変えずに成功する。

### 入出力

- 入力: `Actor`、保存の対象（`BookmarkRef`）
- 出力: なし（成立すると、対象は保存していない状態）

### 使用するドメインの振る舞い・ポート

- `BookmarkRepository.remove`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `bookmarkRepository.remove` の1件。

### エラーケース

要件が振る舞いを定めるエラーはない。保存のない対象の解除は成功として扱う。

## restoreBookmark

### 概要

保存の一覧で解除した保存を、その行の対象と保存した日時で戻す。対象が閲覧できるかどうかを問わず、閲覧できない保存の解除も取り消せる。戻すまでの間に同じ対象が保存されていれば、その保存の日時が残る。

### 入出力

- 入力: `Actor`、解除した保存の対象（`BookmarkRef`）と保存した日時
- 出力: なし（成立すると、対象は保存済み）
- 入力の対象と日時は `DeviceBookmark` として確かめる。現在より後の日時は現在の日時になる

### 使用するドメインの振る舞い・ポート

- `BookmarkMerge.plan`（1件の一覧で使う）
- `BookmarkRepository.addAll`
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `bookmarkRepository.addAll` の1件。

### エラーケース

要件が振る舞いを定めるエラーはない。

## mergeDeviceBookmarks

### 概要

ログインが成立したブラウザの端末の保存の一覧を受け取り、アカウントの保存に合わせる。閲覧者に確認を求めない。同じ対象が端末とアカウントの両方にあれば1つの保存になり、アカウントにすでにある保存の日時は変わらない。端末の保存は、対象が閲覧できるかどうかを問わず引き継ぐ。

同じ一覧の合流をやり直しても結果は同じになる。端末の保存を空にするのは、合流の成立を受けた端末の側の処理で、このユースケースは関わらない。

### 入出力

- 入力: `Actor`、端末の保存の一覧（`DeviceBookmark` の並び。0〜100件）。100件を超える端末の保存は、端末が100件ずつに分けて、複数の要求で送る
- 出力: なし（成立したことだけが伝わる）
- 端末の値はサーバーが確かめていない値で、対象があることを確かめない

### 使用するドメインの振る舞い・ポート

- `BookmarkMerge.plan`
- `BookmarkRepository.addAll`
- `Clock`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `bookmarkRepository.addAll` の全件。一部だけが反映されることはない。成立しなければ、アカウントの保存は変わらず、端末の保存は端末に残る。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 端末の保存の一覧が100件を超える | `BusinessRuleError`（`COMMON_INVALID_INPUT`）。アカウントの保存は変わらない |

通信エラーで成立しなかった合流は、同じ一覧で送り直せる。分けて送った合流の一部だけが成立しても、成立した分は残り、残りを送り直せる。

## listBookmarks

### 概要

アカウントの保存の参照（対象と保存した日時）を、保存した日時の新しい順で返す。並び順と件数は Bookmark が決め、対象が閲覧できるかどうかで絞らない。閲覧できなくなった保存と、指す先のない保存も返す。

表示の内容と、閲覧できるかどうかは返さない。返した参照を Discovery の `resolveReferences` に渡して得る。1ページは100件までなので、`resolveReferences` の件数の上限に収まる。

### 入出力

- 入力: `Actor`、`Pagination`
- 出力: 保存の並び（対象の `BookmarkRef`、保存した日時）と、保存の全件数
- 保存が1件もなければ、空の並びと件数 0 を返す

### 使用するドメインの振る舞い・ポート

- `BookmarkRepository.findByAccount`

### トランザクション境界

UnitOfWork は不要。読み取りだけを行う。

### エラーケース

要件が振る舞いを定めるエラーはない。

## getSavedTargets

### 概要

示した掲載・店舗のうち、アカウントが保存しているものを返す。一覧と詳細の、保存済みの表示に使う。

### 入出力

- 入力: `Actor`、対象の一覧（`BookmarkRef` が 0〜100件）
- 出力: 保存済みの対象の一覧。順序を持たない。0件の入力には空の一覧を返す

### 使用するドメインの振る舞い・ポート

- `BookmarkRepository.findSavedTargets`

### トランザクション境界

UnitOfWork は不要。読み取りだけを行う。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 対象の一覧が100件を超える | `BusinessRuleError`（`COMMON_INVALID_INPUT`） |

## purgeBookmarksOnWithdrawal

### 概要

`account.withdrawn` の消費者。退会したアカウントの保存をすべて削除する。

冪等。`removeAllByAccount` は、保存が1件もなければ何もしないので、重ねて受けても結果は同じになる。退会の後に同じメールアドレスで作られるアカウントは別の `AccountId` を持ち、削除の対象にならない。退会と同時の `saveBookmark`・`mergeDeviceBookmarks` が、この削除の後にコミットすると、その保存は残る。`AccountId` は再び使われないので、残った保存はどの読み取りにも現れない。

### 入出力

- 入力: ドメインイベント `account.withdrawn`（`accountId`）。`Actor` を取らない
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `BookmarkRepository.removeAllByAccount`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `bookmarkRepository.removeAllByAccount`。退会の確定とは別の UnitOfWork で、結果整合になる。

### エラーケース

要件が振る舞いを定めるエラーはない。
