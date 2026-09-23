# registerPhoto

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| ログインした利用者。受け付ける形式で、大きさの上限以内の静止画 | 同意して、新しい `PhotoId` で登録する | `PhotoId` を返す。写真は `stored` で、登録した人は操作した人、同意の日時は登録の時刻、持ち主はない。実体が `PhotoStorage` に置かれ、表示用の参照で取得できる。ドメインイベントは出ない（AC-31） | |
| ログインした利用者。受け付ける形式の静止画 | 同意せずに登録する | `BusinessRuleError`（`MEDIA_CONSENT_REQUIRED`）。記録も実体も残らない（AC-31） | |
| ログインした利用者 | 同意して、動画のファイルを登録する | `BusinessRuleError`（`MEDIA_NOT_A_PHOTO`）。記録も実体も残らない | |
| ログインした利用者 | 同意して、壊れたファイルを、静止画の形式として申告して登録する | `BusinessRuleError`（`MEDIA_NOT_A_PHOTO`）。申告した形式は使われない | |
| ログインした利用者。設定値の `acceptedFormats` にない形式の静止画 | 同意して登録する | `BusinessRuleError`（`MEDIA_FORMAT_NOT_ACCEPTED`）。記録も実体も残らない | |
| ログインした利用者。設定値の `maxBytes` を超える静止画 | 同意して登録する | `BusinessRuleError`（`MEDIA_PHOTO_TOO_LARGE`）。記録も実体も残らない | |
| 実体を置くところで失敗し、`accepted` のまま残った写真 | 登録した人が、同じ `PhotoId` で送り直す | 成功する。記録は重ねて作られず、実体が置かれ、写真は `stored` になる。`registeredBy`・`consentedAt`・`registeredAt` は最初の登録のまま | |
| 登録が成立して `stored` になった写真 | 登録した人が、同じ `PhotoId` で送り直す | 成功する。記録は変わらず、版は進まない | |
| 別の人が登録した写真 | その写真と同じ `PhotoId` で登録する | `ConflictError`。元の写真の記録と実体は変わらない | |
| 登録した写真が破棄され、`discarded` のまま残っている | 登録した人が、同じ `PhotoId` で送り直す | `ConflictError`。写真は `discarded` のままで、実体は置かれない | |
| 同じ人が続けて2枚登録する | それぞれ同意して、別の `PhotoId` で登録する | 2枚とも `stored` になり、それぞれが自分の同意の日時を持つ。1枚目の同意を2枚目に使い回さない | |
| `PhotoStorage.put` が失敗する | 同意して登録する | `SystemError`。写真は `accepted` のまま残り、持ち主を設定できない | |
