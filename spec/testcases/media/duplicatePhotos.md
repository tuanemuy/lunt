# duplicatePhotos

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 掲載を持ち主とする `stored` の写真が2枚 | 2枚の `PhotoId` を渡して複製する | 元の `PhotoId` それぞれに、新しい `PhotoId` の対応を返す。新しい写真は `accepted` で、`consentedAt` は元の写真の値、`registeredBy` は複製を行った人、持ち主はない。新しい `PhotoId` で実体を取得できる | |
| 上の複製の後 | 元の写真を読む | 元の写真の段階・持ち主・版は変わらない。元の実体も取得できる | |
| 上の複製の後 | 元の写真の実体を削除する | 複製した写真の実体は残る | |
| 写真のない掲載の複製（空の一覧） | 空の一覧を渡して複製する | 空の対応を返す。記録は作られない | |
| `stored` の写真が1枚と、記録のない `PhotoId` が1つ | 2つを渡して複製する | `BusinessRuleError`（`MEDIA_DUPLICATE_SOURCE_UNAVAILABLE`）。複製の記録は1件も作られず、実体は複製されない | |
| `stored` の写真が1枚と、`discarded` の写真が1枚 | 2枚を渡して複製する | `BusinessRuleError`（`MEDIA_DUPLICATE_SOURCE_UNAVAILABLE`）。複製の記録は1件も作られず、実体は複製されない | |
| `stored` の写真が2枚。2枚目の `PhotoStorage.copy` が失敗する | 2枚を渡して複製する | `SystemError`。対応を返さない。複製の記録は `accepted` のまま残り、`sweepUnownedPhotos` の対象になる。元の写真は変わらない | |
| 複製が成立したが、呼び出したユースケースが持ち主を設定しなかった | `PhotoPolicy.unownedRetentionMs` を過ぎてから `sweepUnownedPhotos` を実行する | 複製した写真の実体と記録が削除される。元の写真は残る | |
