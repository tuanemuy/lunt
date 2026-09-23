# establishFirstOperator

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| サービス運営者の名簿は保存されたことがない（`unestablished`）。U のアカウントがある | U のメールアドレスで実行する | 成功する。サービス運営者の名簿は、U だけを持ち主に持つ `established` で保存される。ドメインイベントは出ない。その後、U を `Actor` とする `grantRole` が成功する | |
| 名簿は `unestablished`。U のアカウントがあり、`AccountRepository.findById` で U の `expectedVersion` V を得ている | U のメールアドレスで実行した後、V で `AccountRepository.delete(U)` を実行する | 設定は成功し、U のアカウントの版が進む。V での `delete` は `ConflictError` | |
| 名簿は `established` で、持ち主は U だけ | U のメールアドレスで送り直す | 成功する。書き込みはなく、名簿は変わらない | |
| 名簿は `established` で、持ち主は U だけ。V のアカウントがある | V のメールアドレスで実行する | `BusinessRuleError`（`OPERATORS_ALREADY_ESTABLISHED`）。名簿は変わらない | |
| 名簿は `established` で、持ち主は U、V | U のメールアドレスで実行する | `BusinessRuleError`（`OPERATORS_ALREADY_ESTABLISHED`）。名簿は変わらない | |
| 名簿は `unestablished`。あるメールアドレスのアカウントがない | そのメールアドレスで実行する | `NotFoundError`。名簿は保存されない | |
