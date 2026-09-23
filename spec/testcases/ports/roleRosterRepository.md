# RoleRosterRepository

前提条件の名簿は、`find` が返した名簿に `RoleRoster.establishOperators`・`grant`・`removeHolder` を適用して作る。A、B は `AccountId`。`insert`・`delete` を持たない。

## find、save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | `find("operator")` | `RoleRoster.initial("operator")`（`status: "unestablished"`）と、まだ保存がないことを表す `expectedVersion` を返す。`null` を返さない | |
| 空 | `find("editor")` | `RoleRoster.initial("editor")`（持ち主が0人）と、まだ保存がないことを表す `expectedVersion` を返す | |
| 空 | `find("operator")` の `expectedVersion` で、A だけを持ち主に持つ `established` の名簿を `save` し、`find("operator")` | 成功する。`status: "established"`、持ち主 A（`since` を保つ）の名簿と、前と違う `expectedVersion` を返す | |
| 空 | `find("editor")` の `expectedVersion` で、A、B（付与の古い順）を持ち主に持つ名簿を `save` し、`find("editor")` | 持ち主を A、B の順で返す | |
| `operator` の名簿が保存されている | まだ保存がないことを表す `expectedVersion` で、`operator` の名簿を `save` | `ConflictError`。保存されている名簿は変わらない | |
| 空 | まだ保存がないことを表す `expectedVersion` での `operator` の名簿の `save` を、別々の UnitOfWork で同時に2つ実行する | 一方だけが成功し、他方は `ConflictError`。`operator` の名簿は1つだけ | |
| `editor` の名簿が保存されている。`expectedVersion` V を得た後、別の `save` が成功している | V で `save` | `ConflictError`。先の `save` の内容は変わらない | |
| 持ち主 A、B の `operator` の名簿が保存されている | 同じ `expectedVersion` で、A を取り除いた名簿の `save` と、B を取り除いた名簿の `save` を、別々の UnitOfWork で同時に実行する | 一方だけが成功し、他方は `ConflictError`。保存されている名簿の持ち主は1人 | |
| 持ち主 A の `editor` の名簿が保存されている | A を取り除いた名簿（持ち主が0人）を `save` し、`find("editor")` | 持ち主が0人の名簿を返す。次の `save` は、この `find` の `expectedVersion` で成功する（まだ保存がないことを表す `expectedVersion` では `ConflictError`） | |
| `operator` の名簿が保存されている。`editor` の名簿は保存されていない | `find("editor")` | `RoleRoster.initial("editor")` と、まだ保存がないことを表す `expectedVersion` を返す。名簿は役割ごとに独立している | |
| `operator` と `editor` の名簿が保存されている。`operator` の `expectedVersion` V を得ている | `editor` の名簿を `save` した後、V で `operator` の名簿を `save` | 成功する。一方の名簿の `save` は、他方の名簿の版を進めない | |

## findRolesOf

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | `findRolesOf(A)` | 空の集合を返す | |
| 持ち主 A の `editor` の名簿が保存されている | `findRolesOf(A)` | `editor` だけの集合を返す | |
| A は `editor` と `operator` の両方の名簿の持ち主 | `findRolesOf(A)` | `editor` と `operator` の集合を返す | |
| 持ち主 A の `operator` の名簿が保存されている | `findRolesOf(B)` | 空の集合を返す | |
| 持ち主 A、B の `operator` の名簿から、A を取り除いて `save` 済み | `findRolesOf(A)` | 空の集合を返す | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 持ち主 A の `operator` の名簿が保存されている | UnitOfWork の中で B を加えた名簿を `save` してコミットし、直後に UnitOfWork の外で `find("operator")` と `findRolesOf(B)` | 名簿は A、B を返し、`findRolesOf(B)` は `operator` を返す（read-your-writes） | |
| 持ち主 A の `operator` の名簿が保存されている | UnitOfWork の中で B を加えた名簿を `save` し、`fn` が例外を投げる | ロールバックされる。`find("operator")` は A だけの名簿を、前と同じ `expectedVersion` で返す。`findRolesOf(B)` は空 | |
| 空 | UnitOfWork の中で、まだ保存がないことを表す `expectedVersion` で `operator` の名簿を `save` し、`fn` が例外を投げる | ロールバックされる。`find("operator")` は `RoleRoster.initial("operator")` と、まだ保存がないことを表す `expectedVersion` を返す | |
| A は `editor` と `operator` の両方の名簿の持ち主。`operator` の `expectedVersion` V を得た後、`operator` の別の `save` が成功している | 1つの UnitOfWork の中で、A を取り除いた `editor` の名簿の `save` と、V での `operator` の名簿の `save` を行う | 遅くともコミットの時点で `ConflictError` になる。スコープ全体がロールバックされ、`editor` の名簿も変わらない | |
