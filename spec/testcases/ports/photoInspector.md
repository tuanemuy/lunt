# PhotoInspector

契約: [../../domains/media.md](../../domains/media.md) の `PhotoInspector`。テスト用の実装と本番の実装が、同じケースを通す。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| JPEG の静止画のバイト列 | `inspect` する | `{ kind: "photo", format: "image/jpeg" }` を返す | |
| PNG の静止画のバイト列 | `inspect` する | `{ kind: "photo", format: "image/png" }` を返す | |
| 動画のファイルのバイト列 | `inspect` する | `{ kind: "not_a_photo" }` を返す。エラーにならない | |
| 静止画のファイルの途中までしかない、壊れたバイト列 | `inspect` する | `{ kind: "not_a_photo" }` を返す。エラーにならない | |
| テキストのファイルのバイト列 | `inspect` する | `{ kind: "not_a_photo" }` を返す。エラーにならない | |
| 空のバイト列 | `inspect` する | `{ kind: "not_a_photo" }` を返す。エラーにならない | |
| 先頭だけが静止画の形式に見える、画像でないバイト列 | `inspect` する | `{ kind: "not_a_photo" }` を返す。中身を読んで判定する | |
| PNG の静止画のバイト列（利用者は JPEG と申告している） | `inspect` する | `format` は `image/png`。判定はバイト列だけで決まり、ファイル名と申告された形式を受け取らない | |
| 同じ静止画のバイト列 | `inspect` を2回呼ぶ | 同じ結果を返す | |
| 同じ静止画でないバイト列 | `inspect` を2回呼ぶ | どちらも `{ kind: "not_a_photo" }` を返す | |
| 返された `format` | `PhotoFormat.create` に渡す | 成立する。`image/` で始まるメディアタイプになっている | |
