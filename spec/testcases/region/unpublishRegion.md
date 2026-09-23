# unpublishRegion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人が地域運営者。地域は `published`。店舗が所属中で、その店舗はこの地域を選んだ代表地域にしている | 公開を取り下げる | `unpublished`（`byManager`）になり、`firstPublishedAt` は変わらない。`region.unpublished`（`reason: "byManager"`）が出る。店舗の所属と選んだ代表地域は変わらない。店舗と掲載への書き込みはない（AC-60、AC-73） | |
| 地域に地域運営者がいない。操作する人がサービス運営者。地域は `published` | 公開を取り下げる | `unpublished`（`byManager`）になる（AC-67） | |
| 操作する人が地域運営者。地域は `published` で運営による非公開 | 公開を取り下げる | `BusinessRuleError("REGION_SUSPENDED")`。地域は変わらず、ドメインイベントは出ない（AC-64） | |
| 操作する人が地域運営者。地域は別の運営者の操作ですでに `unpublished` | 公開を取り下げる | `BusinessRuleError("PUBLICATION_INVALID_TRANSITION")`。地域は変わらず、ドメインイベントは出ない | |
| 操作する人が地域運営者。地域は `draft` | 公開を取り下げる | `BusinessRuleError("PUBLICATION_INVALID_TRANSITION")`。地域は変わらない | |
| 地域に地域運営者がいる。操作する人は、その地域の管理権限を持たないサービス運営者 | 公開を取り下げる | `ForbiddenError`。地域は変わらない | |
| 操作する人が、この地域の管理権限も役割も持たない | 公開を取り下げる | `ForbiddenError`。地域は変わらない | |
| 指定した ID の地域がない | 公開を取り下げる | `NotFoundError` | |
| 操作する人が地域運営者。地域は `unpublished` で運営による非公開 | 公開を取り下げる | `BusinessRuleError("REGION_SUSPENDED")`（運営による非公開を、不正な遷移より先に判定する）。地域は変わらない | |
