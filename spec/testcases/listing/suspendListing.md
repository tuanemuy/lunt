# suspendListing

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 A に店舗管理者がいる。店舗 A の公開中の掲載がある。操作する人はサービス運営者 | 運営による非公開にする | `suspension` が `{ suspended: true; suspendedAt: 操作の日時 }` になる。公開状態は `published` のまま書き換わらない。`listing.suspended`（`listingId`、`placeId`）が出る（AC-64） | |
| 店舗 A の下書き、一時非公開の掲載がある | それぞれを運営による非公開にする | どちらも成立する。公開状態は `draft`、`unpublished` のまま | |
| 店舗 B に店舗管理者がいない | 店舗 B の公開中の掲載を運営による非公開にする | 成立する。店舗管理者の有無を問わない | |
| 掲載を運営による非公開にした | 店舗 A の店舗管理者が、内容を保存し（`updateListing`）、複製し（`duplicateListing`）、削除する（`deleteListing`） | どれも成立する。複製で作った下書きは運営による非公開を引き継がない。公開（`publishListing`）と一時非公開（`unpublishListing`）は `LISTING_SUSPENDED` で成立しない（AC-64） | |
| 別のサービス運営者が、先に同じ掲載を運営による非公開にしている | 運営による非公開にする | `BusinessRuleError`（`LISTING_ALREADY_SUSPENDED`）。`suspendedAt` は変わらず、ドメインイベントは出ない | |
| 操作する人は店舗 A の店舗管理者で、サービス運営者の役割を持たない | 店舗 A の掲載を運営による非公開にする | `ForbiddenError`。掲載は変わらない | |
| 操作する人は、操作の途中でサービス運営者の役割を解除された | 運営による非公開にする | `ForbiddenError`。掲載は変わらない | |
| 掲載が削除されている | 運営による非公開にする | `NotFoundError` | |
