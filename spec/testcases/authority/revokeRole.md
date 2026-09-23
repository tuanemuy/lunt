# revokeRole

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| O はサービス運営者。E1、E2 は編集担当者 | O を `Actor` として、`editor` と E1 で実行する | 成功する。編集担当者の名簿は E2 だけになる。`"authority.role_revoked"`（`role: "editor"`、`accountId` は E1、`reason: "revoked"`）が1件出る。その後の E1 の `getMyAuthority` は `editor` を返さず、`AccessPolicy` は E1 の `edit_articles` を許さない（AC-75） | |
| O はサービス運営者。編集担当者は E1 だけ | O を `Actor` として、`editor` と E1 で実行する | 成功する。編集担当者の名簿は0人になる | |
| O1、O2 はサービス運営者 | O1 を `Actor` として、`operator` と O2 で実行する | 成功する。サービス運営者の名簿は O1 だけになる。`"authority.role_revoked"`（`role: "operator"`、`reason: "revoked"`）が出る。その後、O2 を `Actor` とする `listRoleHolders` は `ForbiddenError`（AC-76） | |
| O1、O2 はサービス運営者 | O1 を `Actor` として、`operator` と O1 自身で実行する | 成功する。サービス運営者の名簿は O2 だけになる。その後、O1 を `Actor` とするサービス運営者の操作は `ForbiddenError` | |
| サービス運営者は O だけ | O を `Actor` として、`operator` と O 自身で実行する | `BusinessRuleError`（`LAST_OPERATOR`）。名簿は変わらず、ドメインイベントは出ない（AC-76） | |
| O1、O2 はサービス運営者 | O1 による O2 の解除と、O2 による O1 の解除を同時に実行する | 一方だけが成功し、他方は `ConflictError`。送り直すと、役割を失っているため `ForbiddenError`。サービス運営者の名簿は0人にならない（AC-76） | |
| O はサービス運営者。E1 は、確定の前に任命を解かれている（または退会している） | O を `Actor` として、`editor` と E1 で実行する | `BusinessRuleError`（`ROLE_NOT_HELD`）。名簿は変わらない | |
| E1 は編集担当者で、サービス運営者ではない。E2 は編集担当者 | E1 を `Actor` として、`editor` と E2 で実行する | `ForbiddenError`。名簿は変わらない | |
| O はサービス運営者。E1 は編集担当者で、サービス運営者で、店舗 P の管理者 | O を `Actor` として、`editor` と E1 で実行する | 編集担当者の名簿からだけ取り除かれる。サービス運営者の名簿と、P の管理体制は変わらない | |
