# completeLoginByCode

`maxCodeAttempts` は 3 とする（誤入力の回数の上限。I-18）。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 有効期間内の `pending` のログインの確認がある。そのメールアドレスのアカウントがない | その `LoginChallengeId` と正しいコードで実行する | 成功する。ログインの確認は `redeemed`（`redeemedBy: "code"`、`redeemedAt = now`）で保存される。そのメールアドレスのアカウントが作られる。作ったアカウントの `AccountId` とメールアドレス、作ったことを返す。パスワードは求めない（AC-42） | |
| 有効期間内の `pending` のログインの確認がある。そのメールアドレスのアカウントがある | その `LoginChallengeId` と正しいコードで実行する | 成功する。既存のアカウントを返す。アカウントは増えない | |
| 有効期間内の `pending`、`failedCodeAttempts = 0` のログインの確認がある。そのメールアドレスのアカウントがない | 正しくないコードで実行する | `BusinessRuleError`（`LOGIN_CODE_MISMATCH`）。ログインの確認は `pending`、`failedCodeAttempts = 1` で保存されている。アカウントは作られない | |
| 上のケースの後（`failedCodeAttempts = 1`） | 正しいコードで実行する | 成功する。ログインの確認は `redeemed` になる | |
| 有効期間内の `pending`、`failedCodeAttempts = 2` のログインの確認がある | 正しくないコードで実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。ログインの確認は `exhausted`（`exhaustedAt = now`）で保存されている | |
| 誤入力の上限に達した（`exhausted`）ログインの確認がある | 正しいコードで実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。ログインは成立せず、アカウントは作られない | |
| リンクで使用済み（`redeemed`）のログインの確認がある | その `LoginChallengeId` と正しいコードで実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。一方を使うと他方も無効になっている | |
| `pending` のログインの確認があり、有効期間を過ぎている | その `LoginChallengeId` と正しいコードで実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`）。`failedCodeAttempts` は変わらない | |
| なし | 保存されていない `LoginChallengeId` で実行する | `BusinessRuleError`（`LOGIN_CHALLENGE_INVALID`） | |
| あるメールアドレスに、有効期間内の `pending` のログインの確認が2つある | 一方を正しいコードで使用した後、他方を正しいコードで使用する | どちらも成功し、同じアカウントを返す。ログインの確認どうしは独立している | |
