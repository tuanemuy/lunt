# startEmailLogin

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| そのメールアドレスのアカウントがない | 新しい `LoginChallengeId` と、形式の正しいメールアドレスで実行する | 成功する。`pending`、`failedCodeAttempts = 0`、`expiresAt = now + validForMs` のログインの確認が保存される。保存されるのはリンクの鍵とコードの要約だけ。リンクとコードの両方を載せた1通のメールが、そのメールアドレスに送られる。パスワードは求めない。アカウントは作られず、ドメインイベントは出ない（AC-42） | |
| そのメールアドレスのアカウントがある | 新しい `LoginChallengeId` と、そのメールアドレスで実行する | アカウントがない場合と同じ応答を返す。ログインの確認が保存され、メールが送られる | |
| なし | 形式の正しくないメールアドレスで実行する | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`）。メールは送られず、ログインの確認は保存されない | |
| 同じ `LoginChallengeId`・同じメールアドレスのログインの確認が保存されている | 同じ `LoginChallengeId`・同じメールアドレスで送り直す | 成功する。メールは送られず、書き込みもない。保存されているログインの確認は変わらない | |
| ある `LoginChallengeId` のログインの確認が保存されている | 同じ `LoginChallengeId` と、違うメールアドレスで実行する | `ConflictError`。メールは送られず、保存されているログインの確認は変わらない | |
| 同じ新しい `LoginChallengeId`・同じメールアドレスの要求 X、Y がある。X が判定の `run` を終えてメールを送る間に、Y が保存までを終える | X の書き込みの `run` を実行する | X は成功し、書き込まない。ログインの確認は Y が保存した1件だけ | |
| あるメールアドレスに `pending` のログインの確認がある | 同じメールアドレスと、別の `LoginChallengeId` で実行する | 新しいログインの確認が保存され、新しいメールが送られる。前のログインの確認は `pending` のまま変わらず、有効期間まで使用できる | |
| `maxUnexpiredChallenges` = 3。あるメールアドレスに、有効期間を過ぎていないログインの確認が3件ある（`pending`・`redeemed`・`exhausted` を1件ずつ） | 同じメールアドレスと、新しい `LoginChallengeId` で実行する | `BusinessRuleError`（`ACCOUNT_LOGIN_REQUESTS_EXCEEDED`）。メールは送られず、ログインの確認は保存されない | |
| `maxUnexpiredChallenges` = 3。あるメールアドレスに、有効期間を過ぎていないログインの確認が2件と、有効期間を過ぎたログインの確認が1件ある | 同じメールアドレスと、新しい `LoginChallengeId` で実行する | 成功する。新しいログインの確認が保存され、メールが送られる | |
| `maxUnexpiredChallenges` = 3。あるメールアドレスに、有効期間を過ぎていないログインの確認が3件あり、そのうち1件は `LoginChallengeId` X | X・同じメールアドレスで送り直す | 成功する。送り直しの判定が上限の判定より先で、メールは送られず、書き込みもない | |
| `maxUnexpiredChallenges` = 3。メールアドレス A に有効期間を過ぎていないログインの確認が3件ある | 別のメールアドレス B と、新しい `LoginChallengeId` で実行する | 成功する。上限はメールアドレスごと | |
