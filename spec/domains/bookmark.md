# Bookmark

アカウントの保存と、端末の保存の合流を管理する。共有カーネルの型（`AccountId`、`BookmarkRef`）と、UnitOfWork ポートは [index.md](index.md) が定める。

- 保存の対象は掲載と店舗。掲載の保存と、その掲載が紐づく店舗の保存は別のもの
- ログインしていない間の保存は端末のブラウザにだけあり、サーバーに保存しない。Bookmark のポートに現れるのは、アカウントの保存と、合流のために受け取る端末の保存の一覧だけ
- 保存済みかどうかと、対象を閲覧できるかどうかは別に扱う（P-86）。Bookmark は対象の内容と状態を持たない。保存一覧に示す内容と、閲覧できるかどうかは、Discovery の `resolveReferences` が、ログインの有無にかかわらず `BookmarkRef` から解決する。アカウントの保存は `listBookmarks` が返す参照を、端末の保存は端末が持つ参照を渡す。ログインしていない間の、保存の時点の閲覧できるかどうかの確認も `resolveReferences` が担う
- 対象が閲覧できなくなっても、削除されても、保存は残る。解除は閲覧者が行う。Bookmark は対象のドメインのドメインイベントを消費しない

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| Bookmark | 保存 | アカウントが掲載または店舗を後から見返すために残した記録 |
| BookmarkTarget | 保存の対象 | 保存が指す掲載または店舗。`BookmarkRef` で指す |
| SavedAt | 保存した日時 | 閲覧者が対象を保存した日時。保存一覧の並び順の基準 |
| DeviceBookmark | 端末の保存 | ログインしていない間に端末のブラウザに残した保存。対象と保存した日時を持つ |
| Merge | 合流 | ログインが成立したブラウザの端末の保存を、アカウントの保存に合わせること |
| Save | 保存する | 閲覧できる対象を、アカウントの保存に加えること |
| Remove | 解除する | アカウントの保存から対象をなくすこと |
| Restore | 解除を取り消す | 保存一覧で解除した保存を、保存した日時を保って戻すこと |

## エンティティ

### Bookmark（集約ルート）

```ts
type Bookmark = Readonly<{
  accountId: AccountId;
  target: BookmarkRef;
  savedAt: Date;
}>;
```

#### フィールド

| 名前 | 型 | 制約 |
| --- | --- | --- |
| `accountId` | `AccountId` | 保存を持つアカウント |
| `target` | `BookmarkRef` | 掲載または店舗 |
| `savedAt` | `Date` | 保存した日時。作成の後は変わらない |

同一性は `accountId` と `target`（`kind` と `id`）の組で決まる。独立した ID と版を持たない。

#### 振る舞い

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `Bookmark.save` | `actor: Actor`, `target: BookmarkRef`, `facts: { targetViewable: boolean }`, `now: Date` | `Bookmark` | `savedAt` を `now` にした保存を作る。`targetViewable` は、Discovery の `ReferenceQueries.isViewable` の結果をユースケースが渡す。対象が閲覧できなければ `BusinessRuleError`（`BOOKMARK_TARGET_UNAVAILABLE`）。提供開始前・提供終了・休業・閉店は保存を妨げない |
| `Bookmark.carryOver` | `actor: Actor`, `device: DeviceBookmark`, `now: Date` | `Bookmark` | 端末の保存から、アカウントの保存を作る。`savedAt` は端末の保存の日時を引き継ぐ。`now` より後の日時は `now` にする。対象が閲覧できるかどうかを問わない |
| `Bookmark.sameTarget` | `a: BookmarkRef`, `b: BookmarkRef` | `boolean` | `kind` と `id` が等しいかを返す |
| `Bookmark.reconstruct` | 保存された値 | `Bookmark` | 値を確かめて組み立て直す |

#### 不変条件

- 同じアカウントと同じ対象の保存は1つ。`BookmarkRepository` が担保する
- `savedAt` は変わらない。すでにある保存をもう一度保存しても、合流で同じ対象を受け取っても、元の `savedAt` が残る
- 新しく保存を始める操作（`save`）は、閲覧できる対象に限る。すでに行われた保存をアカウントに移す・戻す操作（`carryOver`）は、対象の状態を問わない（閲覧できない保存も引き継ぐ。閲覧できない保存の解除も取り消せる）

#### ライフサイクル

- 生成: `save`、または合流・解除の取り消しの `carryOver`
- 状態の遷移はない。内容は変わらない
- 消滅: 閲覧者による解除、または退会に伴う削除。解除した保存は、解除の取り消し（`carryOver`）で、元の保存した日時のまま戻せる。`save` でもう一度保存すると、新しい保存した日時を持つ保存になる

## 値オブジェクト

| 名前 | フィールド | バリデーション | 等価性 |
| --- | --- | --- | --- |
| `DeviceBookmark` | `{ target: BookmarkRef; savedAt: Date }` | `target` は `BookmarkRef`（掲載または店舗）。`savedAt` は有効な日時。端末の値はサーバーが確かめていない値で、対象があることを前提にしない | `target` の一致 |

## ドメインサービス

### BookmarkMerge

端末の保存の一覧を、アカウントに加える保存の一覧にする。純粋な関数で、ポートに依存しない。

```ts
const BookmarkMerge: {
  plan(
    actor: Actor,
    device: readonly DeviceBookmark[],
    now: Date,
  ): readonly Bookmark[];
};
```

- 一覧の中で同じ対象が重なれば、`savedAt` の最も新しい1つを残す
- 残った端末の保存を、`Bookmark.carryOver` でアカウントの保存にする
- アカウントにすでにある対象かどうかは判断しない。すでにある対象の `savedAt` を変えないことは、`BookmarkRepository.addAll` が担保する
- 空の一覧には空の一覧を返す
- 1回の合流で受け取る端末の保存は 0〜100件。100件を超える `device` は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。端末は100件ずつに分けて送る

## ドメインイベント

Bookmark はドメインイベントを出さない。保存と解除を必要とする消費者はない。

消費するドメインイベントは次のとおり。

| 型名 | 持ち主 | 使うペイロード | 処理 |
| --- | --- | --- | --- |
| `account.withdrawn` | Account | `accountId` | そのアカウントの保存をすべて削除する（V-53）。重ねて受けても結果は同じ |

## ポート

### BookmarkRepository

アカウントの保存を持つ。`UnitOfWorkContext` に `bookmarkRepository` として現れる。保存は独立した ID と版を持たず、内容が変わらず、書き込みはどれも冪等で、順序を入れ替えても結果が矛盾しない。楽観ロックで守る不変条件がないので、`TransactionalRepository` の `insert`・`findById`・`save`・`delete` のどれも持たず、次のメソッドだけを持つ。

```ts
interface BookmarkRepository {
  add(bookmark: Bookmark): Promise<void>;
  addAll(bookmarks: readonly Bookmark[]): Promise<void>;
  remove(accountId: AccountId, target: BookmarkRef): Promise<void>;
  removeAllByAccount(accountId: AccountId): Promise<void>;

  findByAccount(
    accountId: AccountId,
    pagination: Pagination,
  ): Promise<PaginationResult<Bookmark>>;

  findSavedTargets(
    accountId: AccountId,
    targets: readonly BookmarkRef[],
  ): Promise<readonly BookmarkRef[]>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `add` | 同じ `accountId` と `target` の保存がなければ加える。あれば何もせず、元の `savedAt` を残す。どちらも成功として返る。一意性はポートが担保し、呼び出し側は事前に検索しない。同時に届いた2つの `add` は、1つの保存になる |
| `addAll` | `bookmarks` のそれぞれに `add` と同じ規則を当てる。1つの UnitOfWork の中で、すべて反映されるか、1つも反映されないかのどちらかになる。`bookmarks` は 0〜100件。空の一覧は何もしない。100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。`bookmarks` の中に同じ対象は重ならない（`BookmarkMerge.plan` が除く） |
| `remove` | 同じ `accountId` と `target` の保存があれば削除する。なければ何もしない。どちらも成功として返る |
| `removeAllByAccount` | そのアカウントの保存をすべて削除する。1件もなければ何もしない |
| `findByAccount` | そのアカウントの保存を返す。並び順は `savedAt` の新しい順、同順位は `target.kind`（`listing`、`place` の順）、`target.id` の昇順。`count` はそのアカウントの保存の全件数。対象が閲覧できるかどうかで絞らない |
| `findSavedTargets` | `targets` のうち、そのアカウントが保存している対象を返す。`targets` は 0〜100件。0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。呼び出し側が分けて呼ぶ。順序は保証しない |

- エラー: `BusinessRuleError`（`COMMON_INVALID_INPUT`。100件を超える `addAll`・`findSavedTargets`）。`ConflictError` と `NotFoundError` は返さない。保存先の障害の扱いはアダプターの責務で、契約の項目にしない
- 並行性: 楽観ロックを使わない。同じアカウントの別の端末から同じ対象の保存・解除が重なっても、どの書き込みも成功し、最後にコミットした操作の結果になる
- 可視性: コミットした書き込みは、以後の `findByAccount`・`findSavedTargets` に即座に反映される
- 参照整合性: 対象があることを、ポートもユースケースも保存の条件にしない。`save` の閲覧できるかどうかの事実だけを、ユースケースが Discovery の `ReferenceQueries.isViewable` から読んで渡す。指す先のない保存は、Discovery の `resolveReferences` が閲覧できない保存として返す

## トランザクション境界

| 書き込み | 1つの UnitOfWork で確定する範囲 |
| --- | --- |
| 保存 | `add` の1件 |
| 解除 | `remove` の1件 |
| 合流 | `addAll` の全件。一部だけが反映されることはない |
| 解除の取り消し | `addAll` の1件 |
| 退会に伴う削除 | `removeAllByAccount` |

- 合流が成立しなければ、アカウントの保存は変わらない。端末の保存を空にするのは、合流の成立を受けた後の端末の側の処理で、Bookmark は関わらない。同じ一覧の合流をやり直しても結果は同じ
- 退会に伴う削除は、`account.withdrawn` の消費で結果整合にする。退会したアカウントではログインできないため、削除までの間も保存は読まれない。退会の後に同じメールアドレスで作られるアカウントは別の `AccountId` を持ち、以前の保存を引き継がない
- 退会と同時の保存・合流が、退会に伴う削除の後にコミットすると、その保存は削除されずに残る。`AccountId` は再び使われないので、残った保存はどの一覧にも現れない

## ユースケース（概要）

すべてログインしたアカウントの操作で、`accountId` は操作する人から決まる。他のアカウントの保存を扱う要求はない。ログインせずに呼んだ要求は `UnauthorizedError`。ログインしていない間の保存一覧の表示と、保存の時点の閲覧できるかどうかの確認は、Discovery の `resolveReferences` が受け持つ。

| 名前 | 説明 | シナリオ |
| --- | --- | --- |
| `saveBookmark` | 閲覧できる掲載または店舗を保存する。すでに保存済みなら何も変えずに成功する。対象が閲覧できるかどうかを Discovery の `ReferenceQueries.isViewable` から読んで渡す | KEP-01 |
| `removeBookmark` | 保存を解除する。閲覧できない保存も解除できる。すでに解除済みなら何も変えずに成功する | KEP-01、KEP-02、KEP-03 |
| `restoreBookmark` | 保存一覧で解除した保存を、その行の対象と保存した日時で戻す。`BookmarkMerge.plan` と `addAll` を1件の一覧で使う | KEP-02、KEP-03 |
| `mergeDeviceBookmarks` | ログインが成立したブラウザの端末の保存の一覧（1回に100件まで）を受け取り、アカウントの保存に合わせる。すでにある対象の保存した日時は変えない。100件を超える端末の保存は、端末が100件ずつに分けて送る | KEP-04 |
| `listBookmarks` | アカウントの保存の参照（対象と保存した日時）を、保存した日時の新しい順で返す。対象が閲覧できるかどうかで絞らない。表示の内容と、閲覧できるかどうかは、返した参照を Discovery の `resolveReferences` に渡して得る | KEP-02、KEP-03 |
| `getSavedTargets` | 示した掲載・店舗（0〜100件）のうち、保存済みのものを返す。一覧と詳細の保存済みの表示に使う。保存済みかどうかは Discovery の読み取りに含まれず、このユースケースだけが返す | KEP-01 |
| `purgeBookmarksOnWithdrawal` | `account.withdrawn` を消費し、そのアカウントの保存をすべて削除する | ACC-04 |
