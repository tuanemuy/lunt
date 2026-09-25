# AccountRepository

リポジトリは `UnitOfWorkContext` から得る。「UnitOfWork の中で」と書かない操作は、1つの操作ごとに1つの `run` の中で行い、コミットする。前提条件のアカウントは `Account.register` で作る。A1、A2、A3 は `AccountId` の昇順で、メールアドレスは互いに違う。`save` に渡すアカウントは `Account.markReferenced` で作る。

## insert、findById、findByEmail

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | `insert(A1)` の後、`findById(A1.id)` | A1 と同じ `id`・`email` のアカウントと、`expectedVersion` を返す | |
| `insert(A1)` 済み | `findByEmail(A1.email)` | A1 と、`findById` と同じ `expectedVersion` を返す | |
| 空 | `findById(A1.id)` | `null` | |
| `insert(A1)` 済み | `findByEmail(A2.email)` | `null` | |
| `insert(A1)` 済み | 同じ `id` で、違う `email` のアカウントを `insert` | `ConflictError`。A1 は変わらない | |
| `insert(A1)` 済み | 違う `id` で、同じ `email` のアカウントを `insert` | `ConflictError`。`findByEmail(A1.email)` は A1 を返す | |
| 空 | 違う `id`・同じ `email` の2つのアカウントの `insert` を、別々の UnitOfWork で同時に実行する | 一方だけが成功し、他方は `ConflictError`。事前の `findByEmail` がどちらも `null` を返していても同じ。その `email` のアカウントは1つだけ | |

## findByIds

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A1、A2、A3 を `insert` 済み | `findByIds([A3.id, A1.id])` | A1、A3 を、この順（`AccountId` の昇順）で返す。A2 は含まれない | |
| A1 を `insert` 済み | `findByIds([A1.id])` | A1 の1件を返す | |
| A1 を `insert` 済み | `findByIds([A1.id, 存在しない ID])` | A1 の1件を返す。存在しない ID は結果に含まれず、エラーにならない | |
| A1 を `insert` 済み | `findByIds([存在しない ID])` | 空の結果を返す | |
| A1、A2 を `insert` 済み。A2 を `delete` 済み | `findByIds([A1.id, A2.id])` | A1 の1件を返す。退会したアカウントは返さない | |
| A1 を `insert` 済み | `findByIds([])` | 空の結果を返す。エラーにならない | |
| 100件のアカウントを `insert` 済み | 100件の ID で `findByIds` | 100件を、`AccountId` の昇順で返す | |
| A1 を `insert` 済み | 101件の ID で `findByIds` | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `insert(A1)` 済み。`findById` で `expectedVersion` V を得ている | `Account.markReferenced(A1)` を V で `save` し、`findById(A1.id)` | 成功する。`id`・`email` は変わらず、V と違う `expectedVersion` を返す。`findByEmail` も同じ `expectedVersion` を返す | |
| `insert(A1)` 済み。`findByEmail` で `expectedVersion` V を得ている | V で `save` | 成功する。`findByEmail` が返した `expectedVersion` でも保存できる | |
| `insert(A1)` 済み。`expectedVersion` V を得た後、別の `save` が成功している | V で `save` | `ConflictError` | |
| `insert(A1)` 済み。`expectedVersion` V を得た後、`save` が成功している | V で `delete(A1.id, V)` | `ConflictError`。A1 は削除されない。`save` の後に得た `expectedVersion` での `delete` は成功する | |
| `insert(A1)` 済み。`expectedVersion` V を得た後、A1 を `delete` 済み | V で `save` | `NotFoundError`。削除済みの対象は、版にかかわらず `NotFoundError` | |
| 空 | `save(A1, expectedVersion)` | `NotFoundError` | |
| `insert(A1)` 済み。`expectedVersion` V を得ている | V での `save` と、V での `delete(A1.id, V)` を、別々の UnitOfWork で同時に実行する | 一方だけが成功する。`save` が成功したなら `delete` は `ConflictError`。`delete` が成功したなら `save` は `ConflictError` または `NotFoundError` | |

## delete

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `insert(A1)` 済み。`findById` で `expectedVersion` を得ている | `delete(A1.id, expectedVersion)` の後、`findById(A1.id)` と `findByEmail(A1.email)` | 削除が成功する。どちらも `null` | |
| `insert(A1)` 済み。A1 を `delete` 済み | 違う `id`・A1 と同じ `email` のアカウントを `insert` | 成功する。`findByEmail` は新しいアカウントを返す | |
| 空 | `delete(A1.id, expectedVersion)` | `NotFoundError` | |
| `insert(A1)` 済み。A1 を `delete` 済み | 削除の前に得た `expectedVersion` で、もう一度 `delete(A1.id, ...)` | `NotFoundError`。削除済みの対象は、版にかかわらず `NotFoundError` | |
| `insert(A1)` 済み | 同じ `expectedVersion` での `delete(A1.id, ...)` を、別々の UnitOfWork で同時に実行する | 一方だけが成功する。他方は `ConflictError` または `NotFoundError` のどちらかで失敗する | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | UnitOfWork の中で `insert(A1)` してコミットし、直後に別の UnitOfWork で `findById`・`findByEmail`・`findByIds` | 3つとも A1 を返す（read-your-writes） | |
| 空 | UnitOfWork の中で `insert(A1)` と `insert(A2)` を行い、`fn` が例外を投げる | ロールバックされる。`findById(A1.id)`・`findById(A2.id)` はどちらも `null` | |
| `insert(A1)` 済み | UnitOfWork の中で `delete(A1.id, ...)` を行い、`fn` が例外を投げる | ロールバックされる。`findById(A1.id)` は A1 を返し、その後の `delete` は同じ `expectedVersion` で成功する | |
| `insert(A1)` 済み。`expectedVersion` V を得た後、A1 を `delete` 済み | UnitOfWork の中で、`insert(A2)` と、V での A1 の `save` を行う | `NotFoundError` で失敗する。スコープ全体がロールバックされ、`findById(A2.id)` は `null` | |
| `insert(A1)` 済み | UnitOfWork の中で、`insert(A2)` と、A1 と同じ `email` のアカウントの `insert` を行う | 遅くともコミットの時点で `ConflictError` になる。スコープ全体がロールバックされ、`findById(A2.id)` は `null` | |
