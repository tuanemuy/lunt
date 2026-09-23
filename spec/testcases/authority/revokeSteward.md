# revokeSteward

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A、B は店舗 P の管理者。O はサービス運営者 | O を `Actor` として、P の管理者 A の権限を解除する | 成功する。P の管理者は B だけになる。`"authority.steward_removed"`（`target` は P、`accountId` は A、`reason: "revoked"`）が1件出る（AC-28） | |
| A は地域 R の唯一の管理者。R に承諾前の招待がある。O はサービス運営者 | O を `Actor` として、R の管理者 A の権限を解除する | 成功する。R は `vacant` になり、招待は残る。`"authority.steward_removed"` と `"authority.stewardship_vacated"` が出る（AC-28） | |
| A、B は店舗 P の管理者。O はサービス運営者 | O を `Actor` として、A、B の順に権限を解除する | どちらも成功する。P は `vacant` になり、2件目の解除で `"authority.stewardship_vacated"` が出る。以後、`AccessPolicy` は P の `manage_target` をサービス運営者に `operator` として許す（AC-77） | |
| A、B は店舗 P の管理者。B はサービス運営者ではない | B を `Actor` として、P の管理者 A の権限を解除する | `ForbiddenError`。管理者は変わらない。他の管理者の権限は、サービス運営者だけが解除できる（AC-28） | |
| A は店舗 P の管理者だったが、確定の前に自分で辞任した（または退会した）。O はサービス運営者 | O を `Actor` として、P の A の権限を解除する | `BusinessRuleError`（`NOT_A_STEWARD`）。管理体制は変わらず、ドメインイベントは出ない | |
| A は店舗 P の管理者。O はサービス運営者だったが、確定の前に役割を解除されている | O を `Actor` として、P の A の権限を解除する | `ForbiddenError`。管理体制は変わらない | |
| A は店舗 P1 と店舗 P2 の管理者で、編集担当者。O はサービス運営者 | O を `Actor` として、P1 の A の権限を解除する | P1 だけから取り除かれる。P2 の管理体制と、編集担当者の名簿は変わらない | |
| A、B は店舗 P の管理者。O はサービス運営者 | O による A の解除と、A の辞任を同時に実行する | 一方だけが成功し、他方は `ConflictError`。送り直すと、解除は `NOT_A_STEWARD`、辞任は `ForbiddenError` になる | |
