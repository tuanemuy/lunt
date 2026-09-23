# unpublishOccasion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人はイベント運営者。イベントは公開中。店舗 P が参加中で、地域 R が関連づけ中 | 公開を取り下げる | `unpublished`（`reason: "byManager"`）になり、`firstPublishedAt` は変わらない。`reason: "byManager"` の `occasion.unpublished` が出る。店舗 P の参加と、地域 R との関連づけは変わらない（AC-61） | |
| イベントにイベント運営者がいない。操作する人はサービス運営者。イベントは公開中 | 公開を取り下げる | `unpublished`（`byManager`）になる（AC-67） | |
| 操作する人はイベント運営者。イベントは公開中で、運営による非公開 | 公開を取り下げる | `BusinessRuleError`（`OCCASION_SUSPENDED`）。公開状態は変わらず、ドメインイベントは出ない（AC-64） | |
| 操作する人はイベント運営者。イベントは `draft` | 公開を取り下げる | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。イベントは変わらず、ドメインイベントは出ない | |
| 操作する人はイベント運営者。イベントは別の運営者の操作ですでに `unpublished` | 公開を取り下げる | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。イベントは変わらず、ドメインイベントは出ない | |
| イベントにイベント運営者がいる。操作する人は、そのイベントの管理権限を持たないサービス運営者 | 公開を取り下げる | `ForbiddenError`。イベントは変わらない | |
| 操作する人は、そのイベントの管理権限を持たない利用者 | 公開を取り下げる | `ForbiddenError` | |
| 操作する人はイベント運営者。イベントは公開の取り下げ中で、運営による非公開 | 公開を取り下げる | `BusinessRuleError`（`OCCASION_SUSPENDED`）（運営による非公開を、不正な遷移より先に判定する）。イベントは変わらない | |
