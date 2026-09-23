# LoginSecretGenerator

状態を持たず、UnitOfWork に参加しないので、可視性と UnitOfWork の中での振る舞いのケースは持たない。値を推測できないこと、要約から入力を求められないこと、コードが手で入力できる形であることは、アダプターの責務で、ケースを持たない。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| なし | `generate()` の `linkToken` を `LinkToken.create`、`code` を `LoginCode.create` に渡す | どちらもエラーにならず、渡した値と同じ値を返す（空でなく、前後に空白を持たない） | |
| なし | `generate()` を1000回呼ぶ | `linkToken` に重複がない（呼び出しごとに新しく作り、値だけでログインの確認を特定できる） | |
| `generate()` で得た `linkToken` | 同じ `linkToken` で `digest` を2回呼ぶ | 同じ要約を返す | |
| `generate()` で得た `code` | 同じ `code` で `digest` を2回呼ぶ | 同じ要約を返す | |
| `generate()` を2回呼んで得た、違う2つの `linkToken` | それぞれ `digest` | 違う要約を返す（要約どうしの一致で、入力の一致を判断できる） | |
| `generate()` で得た `code` と、1文字だけ違うコード | それぞれ `digest` | 違う要約を返す | |
| `generate()` で得た `linkToken` と `code` | それぞれ `digest` | 空でない要約を返す。要約は入力と違う値 | |
| `LinkToken.create` で作った、`generate()` によらない値 | `digest` | 要約を返す。利用者が入力した値も要約にできる | |
