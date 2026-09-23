# CategoryCatalogRepository

ポートの契約は [../../domains/listing.md](../../domains/listing.md) の「CategoryCatalogRepository」と、[../../domains/index.md](../../domains/index.md) の「リポジトリの共通の契約」（全体で1つの集約）による。台帳は、`find` の結果にドメインの振る舞い（`establish`、`add`、`rename`、`retire`）を適用した値を `save` して用意する。

## find / save

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 保存された台帳がない | `find` する | カテゴリーのない空の台帳（`version` は `Version.initial()`）と、その版の `expectedVersion` が返る。`null` を返さず、エラーにならない | |
| 保存された台帳がない | `find` し、`establish` で4つのカテゴリーを入れた台帳を、返った `expectedVersion` で `save` する | 成功する。以後の `find` は、4つの現役のカテゴリーを作成順で返す | |
| 上の `save` が成立している | `find` する | 返る台帳は `save` した台帳と等しい（各カテゴリーの `id`、`name`、`status`、`createdAt`、台帳の `version`、`updatedAt`）。新しい `expectedVersion` が返る | |
| 4つのカテゴリーの台帳が保存されている | `find` し、`add` で5つ目を加えた台帳を `save` する | 成功する。以後の `find` は、5つ目を並びの最後に返す | |
| 台帳が保存されている | `find` し、`rename` で名称を変えた台帳を `save` する | 成功する。以後の `find` は、新しい名称を同じ位置で返す | |
| 台帳が保存されている | `find` し、`retire` で1つを廃止した台帳を `save` する | 成功する。以後の `find` は、廃止済みのカテゴリーを `status: "retired"`、`retiredAt`、`successorId` とともに、作成順の元の位置で返す。廃止済みのカテゴリーは消えない | |
| 廃止済みのカテゴリーの移行先が、さらに廃止されている台帳を `save` している | `find` する | 2つの廃止済みのカテゴリーと、それぞれの `successorId` がそのまま返る | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 台帳が保存されている。`find` で `expectedVersion` を得た後、別の `save` が成立している | 古い `expectedVersion` で `save` する | `ConflictError`。保存されている台帳は、先に成立した `save` の内容のまま | |
| 台帳が保存されている。2つの呼び出し側が、同じ `expectedVersion` を持っている | 2つの `save` を同時に行う | 一方が成功し、他方は `ConflictError`。保存されているのは成功した側の台帳 | |
| 保存された台帳がない。`find` で空の台帳の `expectedVersion` を得ている | その `expectedVersion` で `save` し、成立した後に、同じ空の台帳の `expectedVersion` でもう一度 `save` する | 2回目は `ConflictError`。保存されているのは1回目の台帳 | |
| 保存された台帳がない。2つの呼び出し側が、空の台帳の `expectedVersion` を持っている | 2つの `save` を同時に行う | 一方が成功し、他方は `ConflictError`。保存された台帳は1つだけで、以後の `find` は成功した側の台帳を返す | |
| `save` が成立している | 成立した後の `find` が返す `expectedVersion` で `save` する | 成功する | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 台帳が保存されている | `UnitOfWorkProvider.run` の中で `find` し、`retire` した台帳を `save` して、コミットする | コミットの直後の `find` が、廃止済みのカテゴリーと移行先を返す | |
| 台帳が保存されている | `run` の中で台帳を `save` した後に、例外を投げる | ロールバックされる。`find` は `save` の前の台帳と、前の `expectedVersion` を返す | |
| 保存された台帳がない | `run` の中で空の台帳の `expectedVersion` で `save` した後に、例外を投げる | ロールバックされる。`find` は空の台帳を返し、空の台帳の `expectedVersion` での `save` は、その後も成立する | |
| 台帳が保存されている | `run` の中で、古い `expectedVersion` で `save` する | 遅くともコミットの時点で `ConflictError` になり、同じスコープの他の書き込みも反映されない | |
