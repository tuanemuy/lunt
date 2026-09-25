# registerPhoto

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| ログインした利用者。静止画のファイル | 同意して、新しい `PhotoId` で登録する | 成功する。写真は `stored` で、登録した人は操作した人、同意の日時は登録の時刻、ファイルの要約はそのファイルの `PhotoDigest.of` の値、持ち主はない。実体が `PhotoStorage` に置かれ、表示用の参照で取得できる。ドメインイベントは出ない（AC-31） | |
| ログインした利用者。静止画のファイル | 同意せずに登録する | `BusinessRuleError`（`MEDIA_INVALID_CONSENT`）。記録も実体も残らない（AC-31） | |
| ログインした利用者 | 同意して、動画のファイルを登録する | `BusinessRuleError`（`MEDIA_NOT_A_PHOTO`）。記録も実体も残らない | |
| ログインした利用者 | 同意して、壊れたファイルを、静止画の形式として申告して登録する | `BusinessRuleError`（`MEDIA_NOT_A_PHOTO`）。申告した形式は使われない | |
| 実体を置くところで失敗し、`accepted` のまま残った写真 | 登録した人が、同じ `PhotoId` と同じファイルで送り直す | 成功する。記録は重ねて作られず、実体が置かれ、写真は `stored` になる。`registeredBy`・`consentedAt`・`registeredAt` は最初の登録のまま | |
| 登録が成立して `stored` になった写真 | 登録した人が、同じ `PhotoId` と同じファイルで送り直す | 成功する。記録は変わらず、版は進まない | |
| 実体を置くところで失敗し、`accepted` のまま残った写真 | 登録した人が、同じ `PhotoId` で別のファイルを送る | `ConflictError`。記録は `accepted` のままで、別のファイルの実体は置かれない | |
| 登録が成立して `stored` になった写真 | 登録した人が、同じ `PhotoId` で別のファイルを送る | `ConflictError`。記録と実体は最初の登録のまま | |
| 別の人が登録した写真 | その写真と同じ `PhotoId` で登録する | `ConflictError`。元の写真の記録と実体は変わらない | |
| 登録した写真が破棄され、`discarded` のまま残っている | 登録した人が、同じ `PhotoId` で送り直す | `ConflictError`。写真は `discarded` のままで、実体は置かれない | |
| 登録した写真が集約に載った後に手放され、破棄・実体の削除・記録の削除を終えている | 登録した人が、同じ `PhotoId` と同じファイルで送り直す | `ConflictError`。記録も実体も作られず、写真は戻らない | |
| 残す期間を過ぎた `accepted` の写真。登録した人が同じ `PhotoId` と同じファイルで送り直し、1つ目の UnitOfWork で `accepted` を読んだ後に、`sweepUnownedPhotos` が破棄・実体の削除・記録の削除を終える。その後に送り直しの `PhotoStorage.put` が実体を置く | 送り直しが2つ目の UnitOfWork に進む | `ConflictError`。送り直しが置いた実体は `PhotoStorage.delete` で削除され、記録も実体も残らない | |
| 上と同じ順で、掃除は破棄の `save` だけを終え、記録は `discarded` で残っている | 送り直しが2つ目の UnitOfWork に進む | `ConflictError`。送り直しが置いた実体は削除される。記録は `discarded` のままで、掃除または `photos.released` の消費が続きを進める | |
| 同じ人が続けて2枚登録する | それぞれ同意して、別の `PhotoId` で登録する | 2枚とも `stored` になり、それぞれが自分の同意の日時を持つ。1枚目の同意を2枚目に使い回さない | |
