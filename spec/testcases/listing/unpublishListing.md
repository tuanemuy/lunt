# unpublishListing

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 A の公開中の掲載がある。操作する人は店舗 A の店舗管理者 | 一時非公開にする | `unpublished`（`reason: "byManager"`）になる。内容、`manualEnd`、`firstPublishedAt` は変わらない。`listing.unpublished`（`reason: "byManager"`）が出る（AC-58） | |
| 店舗 B の掲載は、管理者のいなかった時期の申請の承認で公開された。その後、操作する人が店舗 B の店舗管理者に就いた | その掲載を一時非公開にする | `unpublished`（`byManager`）になる（AC-30） | |
| 店舗 B に店舗管理者がいない。操作する人はサービス運営者 | 店舗 B の公開中の掲載を一時非公開にする | `unpublished`（`byManager`）になる | |
| 店舗 A の公開中の掲載が、運営による非公開になっている。操作する人は店舗 A の店舗管理者 | 一時非公開にする | `BusinessRuleError`（`LISTING_SUSPENDED`）。掲載は変わらず、ドメインイベントは出ない（AC-64） | |
| 店舗 A の下書きの掲載がある | 一時非公開にする | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`）。掲載は `draft` のまま | |
| 別の店舗管理者が、先に同じ掲載を一時非公開にしている | 一時非公開にする | `BusinessRuleError`（`COMMON_PUBLICATION_INVALID_TRANSITION`）。掲載は変わらず、ドメインイベントは出ない | |
| 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 | 店舗 A の公開中の掲載を一時非公開にする | `ForbiddenError`。掲載は変わらない | |
| 操作する人は店舗 A の管理権限を持たない利用者 | 店舗 A の公開中の掲載を一時非公開にする | `ForbiddenError`。掲載は変わらない | |
| 別の店舗管理者が掲載を削除している | 一時非公開にする | `NotFoundError` | |
| 店舗 A の公開中の掲載がある。店舗管理者が一時非公開にする操作と、別の店舗管理者の同じ掲載の内容の保存が同時に確定する | 一時非公開にする | 後に確定する側が `ConflictError` になり、その側の変更もドメインイベントも残らない | |
