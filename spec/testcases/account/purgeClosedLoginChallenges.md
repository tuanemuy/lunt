# purgeClosedLoginChallenges

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `redeemed` のログインの確認、`exhausted` のログインの確認、有効期間を過ぎた `pending` のログインの確認、有効期間内の `pending` のログインの確認が1件ずつある | 実行する | 有効期間内の `pending` のログインの確認だけが残る。ドメインイベントは出ない | |
| 上のケースの後 | もう一度実行する | 成功する。残っているログインの確認は変わらない | |
| ログインの確認が1件もない | 実行する | 成功する | |
| 有効期間内の `pending` のログインの確認がある | 実行した後、そのコードで `completeLoginByCode` を実行する | ログインが成立する。使用できるログインの確認は削除されていない | |
| 有効期間を過ぎた `pending` のログインの確認がある | 実行した後、そのリンクの鍵で `completeLoginByLink` を実行する | `BusinessRuleError`（`ACCOUNT_LOGIN_CHALLENGE_INVALID`）。削除の前と同じ結果になる | |
