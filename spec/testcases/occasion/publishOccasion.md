# publishOccasion

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人はイベント運営者。イベントは `draft` で、名称・開催期間・開催場所（所在地と位置）・写真1枚を持つ | 公開する | `published` になり、`firstPublishedAt` は現在時刻。版が1つ進む。ドメインイベントは出ない（AC-61） | |
| イベントにイベント運営者がいない。操作する人はサービス運営者。イベントは `draft` で公開条件を満たす | 公開する | `published` になる（AC-17、AC-67） | |
| 操作する人はイベント運営者。イベントは公開の取り下げ中（`byManager`）で、公開条件を満たす | 公開する | `published` になる。`firstPublishedAt` は最初の公開の日時のまま変わらない | |
| 操作する人はイベント運営者。イベントは、申立てによる最後の写真の削除で公開の取り下げ（`photoTakedown`）になった後、`updateOccasionContent` で写真を1枚載せて保存してある | 公開する | `published` になる（AC-79） | |
| 操作する人はイベント運営者。イベントは、申立てによる最後の写真の削除で公開の取り下げ（`photoTakedown`）になっていて、写真がない | 公開する | `BusinessRuleError`（`OCCASION_PUBLISH_CONDITION_UNMET`）。不足する項目として写真が示される。公開状態は変わらない（AC-79） | |
| 操作する人はイベント運営者。イベントは `draft` で、開催場所の位置がない | 公開する | `BusinessRuleError`（`OCCASION_PUBLISH_CONDITION_UNMET`）。不足する項目として開催場所が示される。`draft` のまま（AC-68） | |
| 操作する人はイベント運営者。イベントは `draft` で、公開条件を満たし、開催期間を過ぎている | 公開する | `published` になる。開催の状態は終了で返る | |
| 操作する人はイベント運営者。イベントは公開の取り下げ中で公開条件を満たし、運営による非公開 | 公開する | `BusinessRuleError`（`OCCASION_SUSPENDED`）。公開状態は変わらない（AC-64） | |
| 操作する人はイベント運営者。イベントは公開中 | 公開する | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。イベントは変わらず、`firstPublishedAt` も変わらない | |
| イベントにイベント運営者がいる。操作する人は、そのイベントの管理権限を持たないサービス運営者 | 公開する | `ForbiddenError` | |
| 操作する人は、そのイベントの管理権限を持たない利用者 | 公開する | `ForbiddenError` | |
| 操作する人はイベント運営者。イベントは公開中で、運営による非公開 | 公開する | `BusinessRuleError`（`OCCASION_SUSPENDED`）（運営による非公開を、不正な遷移より先に判定する）。イベントは変わらない | |
| 操作する人はイベント運営者。イベントは `draft` で運営による非公開。写真がない | 公開する | `BusinessRuleError`（`OCCASION_SUSPENDED`）（運営による非公開を、公開条件より先に判定する）。イベントは変わらない | |
