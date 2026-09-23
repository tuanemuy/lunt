# unsuspendRegion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人がサービス運営者。地域は `published` で運営による非公開 | 解除する | 運営による非公開でなくなる。公開状態は `published` のままで、`firstPublishedAt` は変わらない。`region.unsuspended` が出る（AC-64） | |
| 操作する人がサービス運営者。地域は `unpublished`（`byManager`）で運営による非公開 | 解除する | 運営による非公開でなくなる。公開状態は `unpublished`（`byManager`）のまま | |
| 操作する人がサービス運営者。地域は運営による非公開の間に最後の写真が削除され、`unpublished`（`photoTakedown`）になっている | 解除する | 運営による非公開でなくなる。公開状態は `unpublished`（`photoTakedown`）のまま（AC-79） | |
| 運営による非公開を解除した地域。操作する人が地域運営者。地域は `unpublished` で公開条件を満たす | 地域を公開する（publishRegion） | `published` になる | |
| 操作する人がサービス運営者。地域は別のサービス運営者の操作ですでに解除されている | 解除する | `BusinessRuleError("REGION_NOT_SUSPENDED")`。地域は変わらず、ドメインイベントは出ない | |
| 操作する人が地域運営者で、サービス運営者でない。地域は運営による非公開 | 解除する | `ForbiddenError`。地域は運営による非公開のまま（AC-64） | |
| 指定した ID の地域がない | 解除する | `NotFoundError` | |
