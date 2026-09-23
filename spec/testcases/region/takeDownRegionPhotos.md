# takeDownRegionPhotos

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人がサービス運営者。この地域を対象とする未対応の申立てがある。地域は `published` で、写真 A・B・C を持つ | A を削除する | 写真は B・C の順になり、B が代表写真になる。公開状態は `published` のまま。A を載せた `region.photos_taken_down` と `photos.released` が出る。`region.unpublished` は出ない。申立ては未対応のまま | |
| 操作する人がサービス運営者。未対応の申立てがある。地域は `published` で、写真は A だけ | A を削除する | 写真がなくなり、`unpublished`（`photoTakedown`）になる。`region.photos_taken_down`、`photos.released`、`region.unpublished`（`reason: "photoTakedown"`）が出る（AC-79） | |
| 操作する人がサービス運営者。未対応の申立てがある。地域は `published` で運営による非公開。写真は A だけ | A を削除する | `unpublished`（`photoTakedown`）になる。運営による非公開は変わらない。`region.unpublished`（`reason: "photoTakedown"`）が出る | |
| 操作する人がサービス運営者。未対応の申立てがある。地域は `draft` で、写真は A だけ | A を削除する | 写真がなくなる。公開状態は `draft` のまま。`region.unpublished` は出ない | |
| 操作する人がサービス運営者。未対応の申立てがある。申立人が示した写真は A。地域は写真 A・B を持つ | B を削除する | B が外れる。申立人が示していない写真も削除できる | |
| 操作する人がサービス運営者。未対応の申立てがある。地域は写真 A を持つ | A と、地域が持たない写真 X を指定して削除する | `BusinessRuleError("REGION_PHOTO_NOT_FOUND")`。A も外れず、地域は変わらない。ドメインイベントは出ない | |
| 操作する人がサービス運営者。未対応の申立てがある。指定する写真は、対応の前に地域情報の更新で外されている | その写真を削除する | `BusinessRuleError("REGION_PHOTO_NOT_FOUND")`。地域は変わらず、ドメインイベントは出ない | |
| 操作する人がサービス運営者。申立ては別のサービス運営者の操作で対応済み | 写真を削除する | `BusinessRuleError("TAKEDOWN_CLAIM_ALREADY_RESOLVED")`。地域は変わらない | |
| 操作する人がサービス運営者。未対応の申立ての対象は、別の地域 | この地域の写真を削除する | `BusinessRuleError("TAKEDOWN_TARGET_MISMATCH")`。地域は変わらない | |
| 操作する人が地域運営者で、サービス運営者でない | 写真を削除する | `ForbiddenError`。地域は変わらない | |
| 指定した ID の申立てがない | 写真を削除する | `NotFoundError`。地域は変わらない | |
| 操作する人がサービス運営者。申立ては対応済みで、その対象は別の地域 | この地域の写真を削除する | `BusinessRuleError("TAKEDOWN_CLAIM_ALREADY_RESOLVED")`（対応済みを、対象の一致より先に判定する）。地域は変わらない | |
