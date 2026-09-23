# takeDownListingPhotos

基本の前提: 掲載 L を対象にした未対応の取り下げの申立てがある。操作する人はサービス運営者。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 基本の前提。掲載 L は公開中で、写真が3枚ある | 申立てに基づいて2枚目を削除する | 写真は2枚になり、`published` のまま。`listing.photos_taken_down`（`photoIds` は2枚目、`unpublished: false`）と、削除した写真の `photos.released` が出る。申立ては未対応のまま変わらない | |
| 基本の前提。掲載 L は公開中で、写真が3枚ある | 1枚目を削除する | 次の写真が1枚目（代表写真）になる。`published` のまま | |
| 基本の前提。掲載 L は公開中で、写真が P1、P2、P3 の順にある | P1 と P3 を1回で削除する | 写真は P2 だけになり、`published` のまま。`listing.photos_taken_down` と `photos.released` の `photoIds` は P1、P3 | |
| 基本の前提。掲載 L は公開中で、写真が P1、P2 の2枚ある | P1 と P2 を1回で削除する | 写真がなくなり、`unpublished`（`reason: "photoTakedown"`）になる。`listing.photos_taken_down`（`unpublished: true`）、`listing.unpublished`、`photos.released` が出る | |
| 基本の前提。掲載 L は公開中で、写真が1枚だけある | その写真を削除する | 写真がなくなり、`unpublished`（`reason: "photoTakedown"`）になる。`listing.photos_taken_down`（`unpublished: true`）、`listing.unpublished`（`reason: "photoTakedown"`）、`photos.released` が出る（AC-79） | |
| 基本の前提。掲載 L は公開中で写真が1枚だけあり、運営による非公開になっている | その写真を削除する | `unpublished`（`photoTakedown`）になる。運営による非公開は変わらない（AC-79） | |
| 基本の前提。掲載 L は一時非公開（`byManager`）で、写真が1枚だけある | その写真を削除する | 写真がなくなる。公開状態は `unpublished`（`byManager`）のまま。`listing.photos_taken_down`（`unpublished: false`）と `photos.released` が出て、`listing.unpublished` は出ない | |
| 基本の前提。申立人は写真 P1 を示している。掲載 L には P1 と P2 がある | P2 を削除する | 削除できる。削除できるのは、申立人が示した写真に限らない | |
| 基本の前提。掲載 L の店舗に店舗管理者がいる場合と、いない場合 | 写真を削除する | どちらも成立する | |
| 掲載 L を対象にした申立てが、すでに対応済み | その申立てに基づいて写真を削除する | `BusinessRuleError`（`TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。掲載は変わらない | |
| 未対応の申立ての対象が、別の掲載 M | その申立てに基づいて掲載 L の写真を削除する | `BusinessRuleError`（`TAKEDOWN_TARGET_MISMATCH`）。掲載 L は変わらない | |
| 指定した申立てがない | 写真を削除する | `NotFoundError`。掲載は変わらない | |
| 基本の前提。掲載 L が、対応の前に削除されている | 写真を削除する | `NotFoundError` | |
| 基本の前提。示された写真 P1 を、店舗管理者が対応の前に掲載から外している。掲載には P2 がある | P1 と P2 を削除する | `BusinessRuleError`（`LISTING_PHOTO_NOT_FOUND`）。P2 を含めて1枚も外れず、掲載は変わらない。ドメインイベントは出ない | |
| 操作する人は掲載 L の店舗の店舗管理者で、サービス運営者の役割を持たない | 申立てに基づいて写真を削除する | `ForbiddenError`。掲載は変わらない | |
