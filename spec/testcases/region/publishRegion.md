# publishRegion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人が地域運営者。地域は `draft` で、名称・所在地・位置・写真がそろっている | 公開する | `published` になり、`firstPublishedAt` は操作の日時。版が1つ進む。ドメインイベントは出ない（AC-60） | |
| 操作する人が地域運営者。地域は `unpublished`（`byManager`）で、公開条件を満たす | 公開する | `published` になる。`firstPublishedAt` は最初の公開の日時のまま | |
| 地域に地域運営者がいない。操作する人がサービス運営者。地域は `draft` で、公開条件を満たす | 公開する | `published` になる。地域運営者はいないまま（AC-16、AC-67） | |
| 操作する人が地域運営者。地域は `draft` で、写真と位置がない | 公開する | `BusinessRuleError("REGION_PUBLISH_CONDITION_UNMET")`。不足する項目として位置、写真がこの順に示される。地域は `draft` のまま（AC-68） | |
| 操作する人が地域運営者。地域は `unpublished`（`photoTakedown`）で、写真がない | 公開する | `BusinessRuleError("REGION_PUBLISH_CONDITION_UNMET")`。地域は変わらない | |
| 操作する人が地域運営者。地域は `unpublished`（`photoTakedown`）で、写真を加えて保存済み | 公開する | `published` になる（AC-79） | |
| 操作する人が地域運営者。地域は `unpublished` で運営による非公開。公開条件を満たす | 公開する | `BusinessRuleError("REGION_SUSPENDED")`。地域は変わらない（AC-64） | |
| 操作する人が地域運営者。地域は別の運営者の操作ですでに `published` | 公開する | `BusinessRuleError("COMMON_PUBLICATION_INVALID_TRANSITION")`。地域は変わらない | |
| 地域に地域運営者がいる。操作する人は、その地域の管理権限を持たないサービス運営者 | 公開する | `ForbiddenError`。地域は変わらない | |
| 操作する人が、この地域の管理権限も役割も持たない | 公開する | `ForbiddenError`。地域は変わらない | |
| 指定した ID の地域がない | 公開する | `NotFoundError` | |
| 操作する人が地域運営者。地域は `published` で運営による非公開 | 公開する | `BusinessRuleError("REGION_SUSPENDED")`（運営による非公開を、不正な遷移より先に判定する）。地域は変わらない | |
| 操作する人が地域運営者。地域は `draft` で運営による非公開。写真がない | 公開する | `BusinessRuleError("REGION_SUSPENDED")`（運営による非公開を、公開条件より先に判定する）。地域は変わらない | |
| 操作する人が地域運営者。地域は `draft` で公開条件を満たす。公開と、別の運営者の地域情報の保存が同時に確定する | 公開する | 後に確定する側が `ConflictError` になり、その側の変更は残らない | |
