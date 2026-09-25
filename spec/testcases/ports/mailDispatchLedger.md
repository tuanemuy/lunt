# MailDispatchLedger

契約: [../../domains/notification.md](../../domains/notification.md) の `MailDispatchLedger`。`record` も `findDispatched` も UnitOfWork の中で呼ぶ（`findDispatched` だけの呼び出しは書き込まない `run`）。どの操作も `ConflictError` と `NotFoundError` を返さない。

以下で「キー」は `MailKey`（`occurrenceKey` と `to` の組）を指す。

## record と findDispatched

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 記録がない | キー（K1、M1）を `findDispatched` に渡す | 空の並び | |
| 記録がない | （K1、M1）を `record` してコミットし、（K1、M1）を `findDispatched` に渡す | （K1、M1）を返す | |
| （K1、M1）の記録がある | （K1、M1）をもう一度 `record` する | 成功する。`ConflictError` にならない。記録は1つのまま | |
| 記録がない | （K1、M1）の `record` を、2つの UnitOfWork で同時に行う | どちらも成功する。記録は1つ | |
| （K1、M1）の記録がある | （K1、M2）、（K2、M1）、（K1、M1）を `findDispatched` に渡す | （K1、M1）だけを返す（キーは `occurrenceKey` と `to` の組で決まる） | |
| 記録がある | 空の `keys` で `findDispatched` を呼ぶ | 空の並び。エラーにならない | |
| 記録のあるキーが100件 | 100件のキーで `findDispatched` を呼ぶ | 100件を返す | |
| — | 101件のキーで `findDispatched` を呼ぶ | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |
| アカウント A のメールアドレス M1 について、（K1、M1）の記録がある | A を `AccountRepository.delete` で削除してコミットし、（K1、M1）を `findDispatched` に渡す | （K1、M1）を返す（キーは集約を指さず、記録は宛先のアカウントの削除の後も残る） | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 記録がない | UnitOfWork の中で（K1、M1）を `record` してコミットし、直後に `findDispatched` を呼ぶ | （K1、M1）を返す | |
| 記録がない | UnitOfWork の中で（K1、M1）を `record` した後に、`fn` が例外を投げる | `findDispatched` は空の並びを返す | |
