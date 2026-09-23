# takeDownOccasionPhotos

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人はサービス運営者。このイベントを対象とする未対応の申立てがある。イベントは公開中で、写真 A・B を A、B の順に持つ | 申立てを添えて、写真 A を外す | 写真は B だけになり、B が代表写真になる。公開状態は `published` のまま。A を載せた `occasion.photos_taken_down` と `photos.released` が出る。`occasion.unpublished` は出ない。申立ては未対応のまま | |
| 操作する人はサービス運営者。このイベントを対象とする未対応の申立てがある。イベントは公開中で、写真は A だけ | 申立てを添えて、写真 A を外す | 写真がなくなり、`unpublished`（`reason: "photoTakedown"`）になる。`occasion.photos_taken_down`、`photos.released`、`reason: "photoTakedown"` の `occasion.unpublished` が出る（AC-79） | |
| 操作する人はサービス運営者。未対応の申立てがある。イベントは公開中で運営による非公開、写真は A だけ | 申立てを添えて、写真 A を外す | `unpublished`（`photoTakedown`）になる。運営による非公開は変わらない | |
| 操作する人はサービス運営者。未対応の申立てがある。申立人が示した写真は A。イベントは写真 A・B を持つ | 申立てを添えて、申立人が示していない写真 B を外す | B が外れる。申立人が示した写真に限らない | |
| 操作する人はサービス運営者。未対応の申立てがある。イベントは写真 B だけを持つ | 申立てを添えて、写真 A（イベントにない）と B を外す | `BusinessRuleError`（`OCCASION_PHOTO_NOT_FOUND`）。B も外れず、イベントは変わらない。ドメインイベントは出ない | |
| 操作する人はサービス運営者。未対応の申立てがある。写真 A は、対応の前にイベント運営者が外している | 申立てを添えて、写真 A を外す | `BusinessRuleError`（`OCCASION_PHOTO_NOT_FOUND`）。イベントは変わらず、ドメインイベントは出ない | |
| 操作する人はサービス運営者。申立ては対応済み | 申立てを添えて、写真 A を外す | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。イベントは変わらない | |
| 操作する人はサービス運営者。未対応の申立ての対象は別のイベント | 申立てを添えて、このイベントの写真 A を外す | `BusinessRuleError`（`TAKEDOWN_TARGET_MISMATCH`）。イベントは変わらない | |
| 操作する人はサービス運営者 | 存在しない `TakedownClaimId` を添えて、写真 A を外す | `NotFoundError` | |
| 操作する人は、そのイベントのイベント運営者で、サービス運営者の役割を持たない | 申立てを添えて、写真 A を外す | `ForbiddenError`。イベントは変わらない | |
| 操作する人はサービス運営者。申立ては対応済みで、その対象は別のイベント | 申立てを添えて、このイベントの写真 A を外す | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）（対応済みを、対象の一致より先に判定する）。イベントは変わらない | |
