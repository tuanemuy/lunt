# LoginChallengeRepository

リポジトリは `UnitOfWorkContext` から得る。「UnitOfWork の中で」と書かない操作は、1つの操作ごとに1つの `run` の中で行い、コミットする。前提条件のログインの確認は `LoginChallenge.issue` で作り、`redeemed`・`exhausted` は `redeemByLink`・`redeemByCode` の結果を `save` して作る。C1、C2 は `id` も `linkTokenDigest` も互いに違う。T は基準の時刻。`delete` を持たない。

## insert、findById、findByLinkTokenDigest

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | `insert(C1)` の後、`findById(C1.id)` | C1 と同じ内容（`email`、2つの要約、`expiresAt`、`status: "pending"`、`failedCodeAttempts: 0`）のログインの確認と、`expectedVersion` を返す | |
| `insert(C1)` 済み | `findByLinkTokenDigest(C1.linkTokenDigest)` | C1 と、`findById` と同じ `expectedVersion` を返す | |
| 空 | `findById(C1.id)`、`findByLinkTokenDigest(C1.linkTokenDigest)` | どちらも `null` | |
| `insert(C1)` 済み | `findByLinkTokenDigest(C1.codeDigest)` | `null`。コードの要約では解決しない | |
| `insert(C1)` 済み | 同じ `id` で、違う `linkTokenDigest` のログインの確認を `insert` | `ConflictError`。C1 は変わらない | |
| `insert(C1)` 済み | 違う `id` で、同じ `linkTokenDigest` のログインの確認を `insert` | `ConflictError`。`findByLinkTokenDigest` は C1 を返す | |
| `insert(C1)` 済み | 違う `id`・違う `linkTokenDigest` で、C1 と同じ `email`・同じ `codeDigest` のログインの確認を `insert` | 成功する。一意なのは `id` と `linkTokenDigest` だけ | |
| C1 は `redeemed` で保存されている | `findByLinkTokenDigest(C1.linkTokenDigest)` | `redeemed` の C1 を返す。状態で絞らない | |
| C1 は `exhausted` で保存されている | `findByLinkTokenDigest(C1.linkTokenDigest)` | `exhausted` の C1 を返す | |
| C1 は `pending` で、`expiresAt` を過ぎている | `findByLinkTokenDigest(C1.linkTokenDigest)`、`findById(C1.id)` | どちらも C1 を返す。有効期間で絞らない | |

## save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `insert(C1)` 済み。`findById` で `expectedVersion` を得ている | 誤入力を1回数えた C1（`pending`、`failedCodeAttempts: 1`）を `save` し、`findById` | 成功する。`failedCodeAttempts: 1` の C1 と、前と違う `expectedVersion` を返す | |
| `insert(C1)` 済み | リンクで使用した C1（`redeemed`）を `save` し、`findById` | `redeemed` の C1 を返す | |
| `insert(C1)` 済み | `exhausted` にした C1 を `save` し、`findById` | `exhausted` の C1 を返す | |
| `insert(C1)` 済み。`expectedVersion` V を得た後、別の `save` が成功している | V で `save` | `ConflictError`。先の `save` の内容は変わらない | |
| `insert(C1)` 済み | 同じ `expectedVersion` で、リンクで使用した C1 の `save` と、コードで使用した C1 の `save` を、別々の UnitOfWork で同時に実行する | 一方だけが成功し、他方は `ConflictError`。保存されている C1 は `redeemed` | |
| `insert(C1)` 済み | 同じ `expectedVersion` で、誤入力を1回数えた C1 の `save` を、別々の UnitOfWork で同時に2つ実行する | 一方だけが成功し、他方は `ConflictError`。`failedCodeAttempts` は 1 | |
| 空 | `save(C1, expectedVersion)` | `NotFoundError` | |

## deleteClosedBefore

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | `deleteClosedBefore(T)` | エラーにならない | |
| `pending` で `expiresAt` が T より後のログインの確認が1件 | `deleteClosedBefore(T)` | ログインの確認は残る | |
| `pending` で `expiresAt` が T より前のログインの確認が1件 | `deleteClosedBefore(T)` | `findById`・`findByLinkTokenDigest` はどちらも `null` | |
| `pending` で `expiresAt` が T と等しいログインの確認が1件 | `deleteClosedBefore(T)` | ログインの確認は残る。削除するのは `expiresAt < threshold` のものだけ | |
| `redeemed` で `expiresAt` が T より後、`exhausted` で `expiresAt` が T より後のログインの確認が1件ずつ | `deleteClosedBefore(T)` | どちらも `findById` が `null` を返す。`redeemed`・`exhausted` は有効期間にかかわらず削除する | |
| `redeemed`、`exhausted`、期限切れの `pending`、有効期間内の `pending` が1件ずつ | `deleteClosedBefore(T)` を2回続けて呼ぶ | どちらもエラーにならない。1回目の後も2回目の後も、有効期間内の `pending` だけが残る | |
| `redeemed` の C1 がある。`findById` で `expectedVersion` V を得ている | `deleteClosedBefore(T)` の後、V で `save(C1, V)` | `deleteClosedBefore` は版を確かめずに C1 を削除する。その後の `save` は、版にかかわらず `NotFoundError` | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `insert(C1)` 済み | UnitOfWork の中で、使用した C1 を `save` してコミットし、直後に別の UnitOfWork で `findById`・`findByLinkTokenDigest` | どちらも `redeemed` の C1 を返す（read-your-writes） | |
| `insert(C1)` 済み | UnitOfWork の中で、使用した C1 を `save` し、`fn` が例外を投げる | ロールバックされる。`findById` は `pending` の C1 と、前と同じ `expectedVersion` を返す | |
| 空 | UnitOfWork の中で `insert(C1)` と `insert(C2)` を行い、`fn` が例外を投げる | ロールバックされる。どちらの `findById` も `null` | |
| `redeemed` の C1 がある | UnitOfWork の中で `deleteClosedBefore(T)` を行い、`fn` が例外を投げる | ロールバックされる。`findById(C1.id)` は C1 を返す | |
| `insert(C1)` 済み | UnitOfWork の中で、`insert(C2)` と、古い `expectedVersion` での C1 の `save` を行う | 遅くともコミットの時点で `ConflictError` になる。スコープ全体がロールバックされ、`findById(C2.id)` は `null` | |
