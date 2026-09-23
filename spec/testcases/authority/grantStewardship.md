# grantStewardship

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域 R があり、管理体制は保存されたことがない。U のアカウントがある。O はサービス運営者 | O を `Actor` として、R と U のメールアドレスで付与する | 成功する。U の承諾なしに、R の管理体制が U を管理者に持つ `stewarded` で新しく保存される（`since = now`）。`"authority.steward_appointed"`（`target` は R、`accountId` は U、`via: "grant"`、`wasVacant: true`）が1件出る | |
| 上のケースの後 | U を `Actor` として、R に `viewMembers` と `inviteMember` を実行する | どちらも成功する。付与された U は、R の管理者の操作を行える | |
| 地域 R がある。U のアカウントがあり、`AccountRepository.findById` で U の `expectedVersion` V を得ている。O はサービス運営者 | O を `Actor` として、R と U のメールアドレスで付与した後、V で `AccountRepository.delete(U)` を実行する | 付与は成功し、U のアカウントの版が進む。V での `delete` は `ConflictError`。付与の後に U が `withdraw` を実行すると成功し、R の管理者から U が消える | |
| イベント E の管理者は A。U のアカウントがある。O はサービス運営者 | O を `Actor` として、E と U のメールアドレスで付与する | 成功する。E の管理者は A、U の順になる。`"authority.steward_appointed"`（`wasVacant: false`）が出る | |
| 下書きの地域 R がある。U のアカウントがある。O はサービス運営者 | O を `Actor` として付与する | 成功する。付与は公開の前でもできる | |
| 地域 R に、U のメールアドレス宛ての承諾前の招待がある。O はサービス運営者 | O を `Actor` として、R と U のメールアドレスで付与する | 成功する。U が管理者になり、U 宛ての招待は承諾前の招待から消える | |
| 地域 R がある。あるメールアドレスのアカウントがない。O はサービス運営者 | O を `Actor` として、そのメールアドレスで付与する | `NotFoundError`。管理体制は保存されず、ドメインイベントは出ない | |
| U は地域 R の管理者。O はサービス運営者 | O を `Actor` として、R と U のメールアドレスで付与する | `BusinessRuleError`（`ALREADY_STEWARD`）。管理体制は変わらない | |
| 地域 R がある。O はサービス運営者 | O を `Actor` として、形式の正しくないメールアドレスで付与する | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`） | |
| U のアカウントがある。O はサービス運営者 | O を `Actor` として、存在しない地域の ID と U のメールアドレスで付与する | `NotFoundError`。管理体制は保存されない | |
| A は地域 R の管理者で、サービス運営者ではない。U のアカウントがある | A を `Actor` として、R と U のメールアドレスで付与する | `ForbiddenError`。管理者は変わらない | |
