# grantRole

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| O はサービス運営者。U のアカウントがある。編集担当者はいない | O を `Actor` として、`editor` と U のメールアドレスで実行する | 成功する。U の承諾なしに、編集担当者の名簿に U が加わる（`since = now`）。`"authority.role_granted"`（`role: "editor"`、`accountId` は U）が1件出る。その後の U の `getMyAuthority` は `editor` を返し、`AccessPolicy` は U の `edit_articles` を許す（AC-75） | |
| O はサービス運営者。U のアカウントがある | O を `Actor` として、`operator` と U のメールアドレスで実行する | 成功する。サービス運営者の名簿は O、U の順になる。`"authority.role_granted"`（`role: "operator"`）が出る。その後、U を `Actor` とする `listRoleHolders` が成功する（AC-76） | |
| O はサービス運営者。U のアカウントがあり、`AccountRepository.findById` で U の `expectedVersion` V を得ている | O を `Actor` として、`editor` と U のメールアドレスで実行した後、V で `AccountRepository.delete(U)` を実行する | 付与は成功し、U のアカウントの版が進む。V での `delete` は `ConflictError`。付与の後に U が `withdraw` を実行すると成功し、編集担当者の名簿から U が消える | |
| O はサービス運営者で、編集担当者ではない | O を `Actor` として、`editor` と O 自身のメールアドレスで実行する | 成功する。O が編集担当者に加わる。サービス運営者の名簿は変わらない | |
| O はサービス運営者。U は店舗 P の管理者で、編集担当者 | O を `Actor` として、`operator` と U のメールアドレスで実行する | 成功する。P の管理体制と、編集担当者の名簿は変わらない | |
| O はサービス運営者。あるメールアドレスのアカウントがない | O を `Actor` として、`editor` とそのメールアドレスで実行する | `NotFoundError`。名簿は変わらず、ドメインイベントは出ない | |
| O はサービス運営者。U は編集担当者 | O を `Actor` として、`editor` と U のメールアドレスで実行する | `BusinessRuleError`（`ROLE_ALREADY_HELD`）。名簿は変わらず、ドメインイベントは出ない | |
| O はサービス運営者 | O を `Actor` として、形式の正しくないメールアドレスで実行する | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） | |
| X はサービス運営者ではない（編集担当者、または店舗の管理者）。U のアカウントがある | X を `Actor` として、`editor` と U のメールアドレスで実行する | `ForbiddenError`。名簿は変わらない | |
| O はサービス運営者だったが、確定の前に役割を解除されている | O を `Actor` として、`editor` と U のメールアドレスで実行する | `ForbiddenError`。名簿は変わらない | |
