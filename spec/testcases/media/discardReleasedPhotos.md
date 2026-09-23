# discardReleasedPhotos

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 読みものを持ち主とする `stored` の写真が2枚 | 2枚の `PhotoId` を載せた `photos.released` を消費する | 2枚とも実体が削除され、記録が削除される。表示用の参照で取得できない。ドメインイベントは出ない | |
| 上の消費の後 | 同じ `photos.released` をもう一度消費する | 成功する。何も変わらない（記録のない写真は削除済みとして扱う） | |
| 記録のない `PhotoId` と、`stored` の写真の `PhotoId` | 両方を載せた `photos.released` を消費する | 成功する。`stored` の写真は削除される | |
| 実体の削除で失敗し、`discarded` のまま残った写真と、前の消費で削除された写真 | 同じ `photos.released` の再配送を消費する | 成功する。残っていた写真は、実体の削除から続け、実体と記録が削除される。削除された写真には何も起きない | |
| `stored` の写真が2枚。1枚目の `PhotoStorage.delete` が失敗する | 2枚を載せた `photos.released` を消費する | 2枚目は実体と記録が削除される。1枚目は `discarded` の記録のまま残り、持ち主を設定できない。消費は失敗として終わり、再配送を求める | |
| 申立てで削除された写真（MOD-02） | `takeDownArticlePhotos` が出した `photos.released` を消費する | 写真の実体と記録が削除される。削除した写真は、どの集約にも載せ直せない（`claimAll` は `MEDIA_PHOTO_NOT_AVAILABLE`） | |
| `photos.released` に載っていない、同じ読みものの別の写真 | `photos.released` を消費する | 載っていない写真は変わらない | |
