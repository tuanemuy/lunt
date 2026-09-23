# completeLoginByLink

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 有効期間内の `pending` のログインの確認がある。そのメールアドレスのアカウントがない | そのリンクの鍵で実行する | 成功する。ログインの確認は `redeemed`（`redeemedBy: "link"`、`redeemedAt = now`）で保存される。そのメールアドレスのアカウントが、`registeredAt = now` で作られる。作ったアカウントの `AccountId` とメールアドレス、作ったことを返す。パスワードは求めない。ドメインイベントは出ない（AC-42） | |
| 有効期間内の `pending` のログインの確認がある。そのメールアドレスのアカウントがある | そのリンクの鍵で実行する | 成功する。既存のアカウントの `AccountId` とメールアドレス、作っていないことを返す。アカウントは増えない | |
| リンクで使用済み（`redeemed`）のログインの確認がある | 同じリンクの鍵でもう一度実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。ログインの確認は変わらない | |
| コードで使用済み（`redeemed`）のログインの確認がある | そのログインの確認のリンクの鍵で実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。一方を使うと他方も無効になっている | |
| `pending` のログインの確認があり、有効期間を過ぎている。そのメールアドレスのアカウントがない | そのリンクの鍵で実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。アカウントは作られない | |
| 誤入力の上限に達した（`exhausted`）ログインの確認がある | そのリンクの鍵で実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`） | |
| なし | どのログインの確認にも対応しないリンクの鍵で実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。アカウントは作られない | |
| あるメールアドレスのアカウントが退会している。そのメールアドレスの有効期間内の `pending` のログインの確認がある | そのリンクの鍵で実行する | 退会したアカウントとは別の `AccountId` のアカウントが作られる | |
