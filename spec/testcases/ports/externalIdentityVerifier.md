# ExternalIdentityVerifier

外部サービスのポート。テスト用の実装と本番の実装が、同じケースを通す。前提条件の証明は、実装ごとの手段（テスト用の実装は決まった証明、本番の実装は提供元の検証用の環境）で用意する。状態を持たず、UnitOfWork に参加しないので、可視性と UnitOfWork の中での振る舞いのケースは持たない。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 設定にある提供元。提供元が確認済みとしたメールアドレスを持つ外部アカウントの、有効な証明 | `verify(provider, proof)` | `{ outcome: "verified", email }` を返す。`email` は提供元が確認済みとしたメールアドレスで、`EmailAddress` として正規化されている（前後の空白がなく、小文字） | |
| 設定にある提供元。メールアドレスを持たない外部アカウントの、有効な証明 | `verify(provider, proof)` | `{ outcome: "email_unavailable" }` を返す | |
| 設定にある提供元。メールアドレスはあるが、提供元で確認済みでない外部アカウントの、有効な証明 | `verify(provider, proof)` | `{ outcome: "email_unavailable" }` を返す。確認済みでないメールアドレスは返さない | |
| 設定にある提供元。無効な証明（改ざんされている、期限を過ぎている、その提供元のものでない） | `verify(provider, proof)` | `{ outcome: "not_authenticated" }` を返す。エラーにならない | |
| 設定にある提供元。利用者が認証または承認をやめて戻ったことを表す証明 | `verify(provider, proof)` | `{ outcome: "not_authenticated" }` を返す | |
| 設定にない提供元 | `verify(provider, proof)` | `BusinessRuleError`（`UNKNOWN_EXTERNAL_PROVIDER`） | |
| 設定にある提供元。提供元が障害で応答しない、または通信エラー | `verify(provider, proof)` | `SystemError`（再試行できる）。`not_authenticated` にしない | |
| 設定にある提供元。同じ外部アカウントの有効な証明を2つ | それぞれ `verify` | どちらも同じ `email` の `verified` を返す。検証は結果を保存せず、外部アカウントとアカウントの結びつきを残さない | |
