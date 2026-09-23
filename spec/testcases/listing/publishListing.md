# publishListing

日付に関わるケースは、今日を日本時間の 2026-07-10 とする。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 A の下書きに、写真1枚・名称・カテゴリーがある。説明と提供の設定はない。操作する人は店舗 A の店舗管理者 | 公開する | `published` になる。`firstPublishedAt` は公開の日時、`manualEnd` は `{ ended: false }`。承認は要らない。ドメインイベントは出ない。提供状態は提供中（AC-10） | |
| 店舗 A の下書きに写真・名称・カテゴリーがあり、提供期間の開始日が 2026-07-20 | 公開する | `published` になる。提供状態は提供開始前 | |
| 店舗 A の下書きに名称とカテゴリーがあり、写真がない | 公開する | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）。不足する項目として写真が示される。掲載は `draft` のまま（AC-10） | |
| 店舗 A の下書きに写真だけがあり、名称とカテゴリーがない | 公開する | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）。不足する項目として名称とカテゴリーが示される。掲載は `draft` のまま | |
| 店舗 A の掲載が、店舗管理者の操作で一時非公開になっている。公開条件を満たす | 再公開する | `published` に戻る。`firstPublishedAt` は最初の公開の日時のまま | |
| 店舗 A の掲載を店舗管理者が提供終了にし、その後一時非公開にした | 再公開する | `published` に戻る。`manualEnd` は保たれ、提供状態は管理する人による提供終了のまま | |
| 店舗 A の一時非公開の掲載が、一時非公開の間の編集で名称を欠いている | 再公開する | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）。不足する項目として名称が示される。一時非公開のまま | |
| 店舗 A の掲載が、申立てによる写真の削除で写真がなくなり、一時非公開（`photoTakedown`）になっている | 写真を登録せずに再公開する | `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）。不足する項目として写真が示される（AC-79） | |
| 上の掲載に、写真を1枚登録して保存した | 再公開する | `published` に戻る（AC-79） | |
| 店舗 A の一時非公開の掲載が、運営による非公開になっている。操作する人は店舗 A の店舗管理者 | 再公開する | `BusinessRuleError`（`LISTING_SUSPENDED`）。掲載は変わらない（AC-64） | |
| 店舗 B の掲載が運営による非公開になった後で、操作する人が店舗 B の管理権限を得た | 再公開する | `BusinessRuleError`（`LISTING_SUSPENDED`）。掲載は変わらない（AC-64） | |
| 店舗 A の下書きが、写真を欠き、運営による非公開になっている | 公開する | `BusinessRuleError`（`LISTING_SUSPENDED`）。運営による非公開を、公開条件より先に判定する。掲載は変わらない | |
| 店舗 A の公開中の掲載が、運営による非公開になっている | 公開する | `BusinessRuleError`（`LISTING_SUSPENDED`）。運営による非公開を、不正な遷移より先に判定する。掲載は変わらない | |
| 店舗 A が非公開になっている。店舗 A の下書きは公開条件を満たす | 公開する | `published` になる | |
| 店舗 B に店舗管理者がいない。操作する人はサービス運営者。店舗 B の下書きは公開条件を満たす | 公開する | `published` になる。承認は要らない（AC-19） | |
| 店舗 A に店舗管理者がいる。操作する人は店舗 A の管理権限を持たないサービス運営者 | 店舗 A の下書きを公開する | `ForbiddenError`。掲載は `draft` のまま（AC-19） | |
| 操作する人は店舗 A の管理権限を持たない利用者 | 店舗 A の下書きを公開する | `ForbiddenError`。掲載は `draft` のまま | |
| 別の店舗管理者が掲載を削除している | 公開する | `NotFoundError` | |
| 別の店舗管理者が、先に同じ下書きを公開している | 公開する | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。掲載は `published` のまま変わらず、`firstPublishedAt` も変わらない | |
