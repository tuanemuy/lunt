# unsuspendOccasion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人はサービス運営者。イベントは公開中のときに運営による非公開にされた | 運営による非公開を解除する | 運営による非公開でなくなり、公開状態は `published` で現れる。`firstPublishedAt` は変わらない。`occasion.unsuspended` が出る（AC-64） | |
| 操作する人はサービス運営者。イベントは公開の取り下げ中（`byManager`）のときに運営による非公開にされた | 運営による非公開を解除する | 公開状態は `unpublished`（`byManager`）で現れる | |
| 操作する人はサービス運営者。イベントは公開中のときに運営による非公開にされ、その間に `takeDownOccasionPhotos` で最後の写真が外されて `unpublished`（`photoTakedown`）になった | 運営による非公開を解除する | 公開状態は `unpublished`（`photoTakedown`）で現れ、`published` に戻らない。イベント運営者が写真を載せて `publishOccasion` を行うと `published` になる（AC-79） | |
| 操作する人はサービス運営者。別のサービス運営者がすでに解除している | 運営による非公開を解除する | `BusinessRuleError`（`OCCASION_NOT_SUSPENDED`）。`occasion.unsuspended` は重ねて出ない | |
| 操作する人は、そのイベントのイベント運営者で、サービス運営者の役割を持たない | 運営による非公開を解除する | `ForbiddenError`。運営による非公開のまま（AC-64） | |
