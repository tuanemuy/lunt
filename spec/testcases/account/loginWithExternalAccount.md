# loginWithExternalAccount

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `ExternalIdentityVerifier.verify` が `verified` とメールアドレスを返す。そのメールアドレスのアカウントがない | 提供元と証明を渡して実行する | 成功する。そのメールアドレスのアカウントが、`registeredAt = now` で作られる。作ったアカウントの `AccountId` とメールアドレス、作ったことを返す。パスワードは求めない。ドメインイベントは出ない（AC-42） | |
| `verify` が `verified` とメールアドレスを返す。そのメールアドレスのアカウントが、メールアドレスでのログインで作られている | 提供元と証明を渡して実行する | 成功する。既存のアカウントを返す（同じメールアドレスは同じアカウント）。アカウントは増えない。書き込みはない | |
| `verify` が `email_unavailable` を返す | 提供元と証明を渡して実行する | `BusinessRuleError`（`VERIFIED_EMAIL_REQUIRED`）。アカウントは作られない | |
| `verify` が `not_authenticated` を返す | 提供元と証明を渡して実行する | `BusinessRuleError`（`EXTERNAL_LOGIN_NOT_AUTHENTICATED`）。アカウントは作られない | |
| なし | 設定にない提供元と証明を渡して実行する | `BusinessRuleError`（`UNKNOWN_EXTERNAL_PROVIDER`）。アカウントは作られない | |
| `verify` が提供元の障害で `SystemError` になる | 提供元と証明を渡して実行する | `SystemError`（再試行できる）。アカウントは作られない | |
