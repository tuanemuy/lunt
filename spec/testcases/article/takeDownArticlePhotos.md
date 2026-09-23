# takeDownArticlePhotos

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 写真 A・B を持つ公開中の読みもの。写真の権利者が、その読みものの写真 A を示した未対応の申立て | サービス運営者が、申立てに基づいて写真 A を削除する | 成功する。読みものの写真は B だけになり、公開は続く。`article.photos_taken_down`（`photoIds` は A、`unpublished: false`）と、A を載せた `PhotosReleased` が出る。申立ては未対応のまま変わらない（AC-31） | |
| 写真 A・B・C を持つ公開中の読みもの。未対応の申立て | 1枚目の写真 A を削除する | 成功する。写真は B・C の順になり、B が代表写真になる | |
| 写真 A・B・C を持つ公開中の読みもの。未対応の申立て | 1回の要求で、写真 A と C を削除する | 成功する。写真は B だけになり、公開は続く。`article.photos_taken_down`（`photoIds` は A・C、`unpublished: false`）と、A・C を載せた `PhotosReleased` が1件ずつ出る | |
| 写真 A・B を持つ公開中の読みもの。未対応の申立て | 1回の要求で、写真 A と B を削除する | 成功する。読みものは `unpublished`（事由は `photoTakedown`）になる。`article.photos_taken_down` は `unpublished: true` | |
| 写真 A だけを持つ公開中の読みもの。未対応の申立て | 写真 A を削除する | 成功する。読みものは `unpublished`（事由は `photoTakedown`）になり、`firstPublishedAt` は保たれる。`article.photos_taken_down`（`unpublished: true`）と `PhotosReleased` が出る。Discovery の読み取りに現れなくなる（AC-79） | |
| 上の削除の後 | Notification が `article.photos_taken_down` を消費する | すべての編集担当者に、写真の削除の通知が届く（AC-79） | |
| 上の削除の後 | `discardReleasedPhotos` が `PhotosReleased` を消費する | 写真 A の実体と記録が削除される。削除した写真は戻せない | |
| 写真 A・B を持つ読みもの。申立人が示した写真は A | 申立てに基づいて、示されていない写真 B を削除する | 成功する。削除できる写真は、対象のどの写真でもよい | |
| 写真 A だけを持つ下書きの読みもの。未対応の申立て | 写真 A を削除する | 成功する。写真がなくなり、公開状態は下書きのまま。`article.photos_taken_down`（`unpublished: false`）と `PhotosReleased` が出る | |
| 写真 A だけを持つ、編集担当者が公開を取り下げた読みもの（事由は `byManager`）。未対応の申立て | 写真 A を削除する | 成功する。公開状態も事由（`byManager`）も変わらない | |
| 写真 A・B を持つ公開中の読みもの。未対応の申立て | 同じ申立てに基づいて A を削除し、続けて別の要求で B を削除する | どちらも成功する。2回目で `unpublished`（`photoTakedown`）になる | |
| 存在しない `TakedownClaimId` | その ID に基づいて写真を削除する | `NotFoundError`。読みものは変わらない | |
| 対応済みの申立て | 申立てに基づいて写真を削除する | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。読みものは変わらず、ドメインイベントは出ない | |
| 別の読みものを対象とする未対応の申立て | その申立てに基づいて、この読みものの写真を削除する | `BusinessRuleError`（`TAKEDOWN_TARGET_MISMATCH`）。読みものは変わらない | |
| 写真 A・B を持つ読みもの。申立ての後、対応の前に、編集担当者が写真 A を外して保存した | 1回の要求で、写真 A と B を削除する | `BusinessRuleError`（`ARTICLE_PHOTO_NOT_FOUND`）。B も削除されない。読みものは変わらず、ドメインイベントは出ない | |
| 編集担当者の役割だけを持つ利用者 | 申立てに基づいて写真を削除する | `ForbiddenError`。読みものは変わらない | |
| 編集担当者のいないサービス（編集担当者の名簿が0人）。写真 A を持つ公開中の読みもの | サービス運営者が写真 A を削除する | 成功する。店舗管理者・編集担当者の有無にかかわらず、サービス運営者が削除できる（AC-31） | |
