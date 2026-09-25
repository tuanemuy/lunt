# withdraw

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| アカウント A は、どの対象の管理者でもなく、役割も持たない | A を `Actor` として実行する | 成功する。A のアカウントが削除され、`AccountRepository.findById`・`findByEmail` は A を返さない。`"account.withdrawn"`（`accountId` は A）が1件出る。Authority のドメインイベントは出ない（AC-70） | |
| A は店舗 P の2人の管理者の1人（もう1人は B）、地域 R の唯一の管理者、編集担当者 | A を `Actor` として実行する | 成功する。1つのコミットで次が確定する。A のアカウントが削除される。P は B だけを管理者に持つ `stewarded` のまま。R は `vacant` になる。編集担当者の名簿から A が消える。ドメインイベントは、`"account.withdrawn"`、P と R の `"authority.steward_removed"`（`reason: "withdrawn"`）、R の `"authority.stewardship_vacated"`、`"authority.role_revoked"`（`editor`、`reason: "withdrawn"`）。P の `"authority.stewardship_vacated"` は出ない（AC-70） | |
| A は店舗 P の唯一の管理者。P に、A が送った承諾前の招待（宛先は C のメールアドレス）がある | A を `Actor` として実行する | 成功する。P は `vacant` になり、招待は残る。その後、C が `acceptInvitation` を実行すると成立し、P は `stewarded` になる（AC-28） | |
| A は唯一のサービス運営者で、店舗 P の管理者 | A を `Actor` として実行する | `BusinessRuleError`（`AUTHORITY_LAST_OPERATOR`）。A のアカウント、P の管理体制、サービス運営者の名簿は変わらない。ドメインイベントは1件も出ない（AC-76） | |
| A と B がサービス運営者 | A を `Actor` として実行する | 成功する。サービス運営者の名簿は B だけになる。`"authority.role_revoked"`（`operator`、`reason: "withdrawn"`）が出る | |
| A と B がサービス運営者 | A の `withdraw` と、B の `withdraw` を同時に実行する | 一方だけが成功する。他方は `ConflictError` になり、送り直すと `AUTHORITY_LAST_OPERATOR` になる。サービス運営者の名簿は0人にならない（AC-76） | |
| A が退会している | A のメールアドレスでログインを成立させ、`getMyAuthority` を実行する | 別の `AccountId` のアカウントが作られる。管理する対象は空で、役割も持たない。以前の管理権限・役割とは結びつかない（AC-70） | |
