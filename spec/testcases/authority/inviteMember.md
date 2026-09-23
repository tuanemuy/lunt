# inviteMember

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A は店舗 P の管理者。C のアカウントがある | A を `Actor` として、新しい `InvitationId` と C のメールアドレスで招待する | 成功する。サービス運営者の承認なしに、P の承諾前の招待に C 宛ての招待が加わる（`invitedAt = now`）。`"authority.invitation_issued"`（`target` は P、`invitationId`、`email`）が1件出る。管理者は変わらない（AC-23） | |
| A は地域 R の管理者。あるメールアドレスのアカウントがない | A を `Actor` として、そのメールアドレスで招待する | 成功する。招待が加わり、`"authority.invitation_issued"` が出る | |
| A、B は店舗 P の管理者 | A を `Actor` として、B のメールアドレスで招待する | `BusinessRuleError`（`ALREADY_STEWARD`）。招待は加わらず、ドメインイベントは出ない | |
| A は店舗 P の管理者。C のメールアドレス宛ての承諾前の招待がある | A を `Actor` として、別の `InvitationId` と C のメールアドレスで招待する | `BusinessRuleError`（`INVITATION_ALREADY_PENDING`）。招待は増えない | |
| A は店舗 P の管理者 | A を `Actor` として、形式の正しくないメールアドレスで招待する | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`）。招待は加わらない | |
| A は店舗 P の管理者。ある `InvitationId` で C 宛ての招待が成立している | 同じ `InvitationId`・同じメールアドレスで送り直す | 成功する。書き込みもドメインイベントもない。招待は1件のまま | |
| A は店舗 P の管理者。ある `InvitationId` で C 宛ての招待が成立している | 同じ `InvitationId` と、D のメールアドレスで招待する | `ConflictError`。招待は変わらない | |
| 店舗 P の管理者は A。X は P の管理者でない | X を `Actor` として P に招待する | `ForbiddenError`。招待は加わらない | |
| 店舗 P の管理者は A。O はサービス運営者で、P の管理者ではない | O を `Actor` として P に招待する | `ForbiddenError` | |
| 地域 R は管理者不在。O はサービス運営者 | O を `Actor` として R に招待する | `ForbiddenError`。招待できるのは対象の管理者だけ | |
| X は地域 R の管理者で、店舗 P の管理者ではない | X を `Actor` として P に招待する | `ForbiddenError`（AC-45） | |
