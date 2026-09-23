# cancelInvitation

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A、B は店舗 P の管理者。A が送った C 宛ての承諾前の招待がある | B を `Actor` として、その招待を取り消す | 成功する。招待が P の承諾前の招待から消える。管理者は変わらない。ドメインイベントは出ない | |
| 上のケースの後 | C を `Actor` として、その招待で `acceptInvitation` を実行する | `BusinessRuleError`（`INVITATION_NOT_FOUND`）。C は管理者にならない | |
| 地域 R は管理者不在で、C 宛ての承諾前の招待が残っている。O はサービス運営者 | O を `Actor` として、その招待を取り消す | 成功する。招待が消える。R は `vacant` のまま | |
| 店舗 P の管理者は A。C 宛ての承諾前の招待がある。O はサービス運営者で、P の管理者ではない | O を `Actor` として、その招待を取り消す | `ForbiddenError`。招待は残る | |
| 店舗 P の管理者は A。C 宛ての承諾前の招待がある。X は P の管理者でもサービス運営者でもない | X を `Actor` として、その招待を取り消す | `ForbiddenError`。招待は残る | |
| A は店舗 P の管理者。C 宛ての招待は、C がすでに承諾している | A を `Actor` として、その招待を取り消す | `BusinessRuleError`（`INVITATION_NOT_FOUND`）。C は管理者のまま | |
| A は店舗 P の管理者。C 宛ての承諾前の招待がある | A の取り消しと、C の承諾を同時に実行する | 一方だけが成功し、他方は `ConflictError`。取り消しが成功した場合、C が送り直すと `INVITATION_NOT_FOUND`。承諾が成功した場合、A が送り直すと `INVITATION_NOT_FOUND` | |
