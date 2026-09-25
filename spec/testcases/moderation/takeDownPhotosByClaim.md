# takeDownPhotosByClaim

操作する人は、特に書かない限りサービス運営者。申立ては `submitTakedownClaim` で用意し、特に書かない限り、その対象を `target` に渡す未対応の申立てを使う。

## 申立て

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 写真 A・B を持つ公開中の掲載 L。写真の権利者が L の写真 A を示した未対応の申立て | 申立てに基づいて、L の写真 A を削除する | 成功する。L の写真は B だけになり、公開は続く。L の写真の並びの `takenDown` は `true` になる。`content.photos_taken_down`（`owner` は L、`photoIds` は A、`unpublished: false`）と、A を載せた `photos.released` が出る。申立ては未対応のままで、版も変わらない（AC-31） | |
| 上の削除の後 | `discardReleasedPhotos` が `photos.released` を消費する | 写真 A の実体と記録が削除される。削除した写真は戻せない | |
| 写真 A・B を持つ店舗 P。申立人が示した写真は A | 申立てに基づいて、示されていない写真 B を削除する | 成功する。削除できる写真は、申立人が示した写真に限らない | |
| 存在しない `TakedownClaimId` | その ID と掲載 L を渡して写真を削除する | `NotFoundError`。L は変わらない | |
| 対応済みの申立て（別のサービス運営者が先に対応を終えた） | 申立てに基づいて写真を削除する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。対象は変わらず、ドメインイベントは出ない | |
| 地域 R1 を対象にした未対応の申立て。地域 R2 は写真を持つ | 申立てと R2 を渡して、R2 の写真を削除する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH`）。R2 は変わらない | |
| 同じ ID の掲載と店舗がある。掲載を対象にした未対応の申立て | 申立てと店舗を渡して、店舗の写真を削除する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_MISMATCH`）。対象は `kind` と `id` の組で比べる | |
| イベント O1 を対象にした対応済みの申立て。イベント O2 は写真を持つ | 申立てと O2 を渡して、O2 の写真を削除する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`）。対応済みを、対象の一致より先に判定する | |
| 掲載 L を対象にした未対応の申立て。L は対応の前に削除されている | 申立てと L を渡して写真を削除する | `NotFoundError` | |
| 写真 A・B を持つ掲載 L を対象にした未対応の申立て。写真の削除の要求が L を読んだ後に、店舗管理者の L の保存が先にコミットした | 写真の削除の要求がコミットする | `ConflictError`。L は店舗管理者の保存した内容のままで、写真は外れず、ドメインイベントは出ない | |
| 操作する人は掲載 L の店舗の店舗管理者で、サービス運営者の役割を持たない | 申立てに基づいて L の写真を削除する | `ForbiddenError`。L は変わらない | |
| 操作する人は編集担当者で、サービス運営者の役割を持たない。読みもの A1 を対象にした未対応の申立て | 申立てに基づいて A1 の写真を削除する | `ForbiddenError`。A1 は変わらない | |
| 管理者のいない店舗 P。編集担当者の名簿が0人で、読みもの A1 がある。それぞれを対象にした未対応の申立て | サービス運営者が、それぞれの写真を削除する | どちらも成功する。管理者・編集担当者の有無を問わない（AC-31） | |

## 店舗

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P の写真は ph1、ph2、ph3 の順 | ph1 を削除する | 写真は ph2、ph3 の順になり、ph2 が代表写真になる。版が進む。店舗は公開のまま | |
| 店舗 P の写真は ph1 の1枚だけ | ph1 を削除する | 写真は0枚になる。店舗は公開のままで、営業状況も変わらない。`content.photos_taken_down` は `unpublished: false` | |
| 非公開の店舗 P が写真 ph1・ph2 を持つ | ph1 を削除する | 成功する。店舗は非公開のまま | |
| 店舗 P の写真は ph2、ph3（ph1 は店舗管理者が先に外した） | ph1 と ph2 を削除する | `BusinessRuleError`（`PLACE_PHOTO_NOT_FOUND`）。ph2 を含めて1枚も外れず、店舗は変わらない。ドメインイベントは出ない | |

## 掲載

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の掲載 L の写真は P1、P2、P3 の順 | P1 と P3 を1回で削除する | 写真は P2 だけになり、公開のまま。`content.photos_taken_down` と `photos.released` の `photoIds` は P1、P3 | |
| 公開中の掲載 L の写真は1枚だけ | その写真を削除する | 写真がなくなり、`unpublished`（`reason: "photoTakedown"`）になる。`firstPublishedAt` は保たれる。`content.photos_taken_down`（`unpublished: true`）、`listing.unpublished`（`reason: "photoTakedown"`）、`photos.released` が出る（AC-79） | |
| 公開中で運営による非公開の掲載 L の写真は1枚だけ | その写真を削除する | `unpublished`（`photoTakedown`）になる。運営による非公開は変わらない（AC-79） | |
| 管理する人が一時非公開にした掲載 L（`reason: "byManager"`）の写真は1枚だけ | その写真を削除する | 写真がなくなる。公開状態は `unpublished`（`byManager`）のまま。`content.photos_taken_down`（`unpublished: false`）と `photos.released` が出て、`listing.unpublished` は出ない | |
| 掲載 L の写真は P2 だけ（示された P1 は店舗管理者が先に外した） | P1 と P2 を削除する | `BusinessRuleError`（`LISTING_PHOTO_NOT_FOUND`）。P2 を含めて1枚も外れず、掲載は変わらない。ドメインイベントは出ない | |

## 地域

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の地域 R の写真は A・B・C の順 | A を削除する | 写真は B・C の順になり、B が代表写真になる。公開のまま。`region.unpublished` は出ない | |
| 公開中の地域 R の写真は A だけ | A を削除する | 写真がなくなり、`unpublished`（`photoTakedown`）になる。`content.photos_taken_down`（`unpublished: true`）、`region.unpublished`（`reason: "photoTakedown"`）、`photos.released` が出る（AC-79） | |
| 下書きの地域 R の写真は A だけ | A を削除する | 写真がなくなる。公開状態は下書きのまま。`content.photos_taken_down` は `unpublished: false` で、`region.unpublished` は出ない | |
| 地域 R は写真 A を持つ | A と、R が持たない写真 X を削除する | `BusinessRuleError`（`REGION_PHOTO_NOT_FOUND`）。A も外れず、地域は変わらない。ドメインイベントは出ない | |

## イベント

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中のイベント O の写真は A、B の順 | A を削除する | 写真は B だけになり、B が代表写真になる。公開のまま。`occasion.unpublished` は出ない | |
| 公開中で運営による非公開のイベント O の写真は A だけ | A を削除する | `unpublished`（`photoTakedown`）になる。運営による非公開は変わらない。`content.photos_taken_down`（`unpublished: true`）と `occasion.unpublished`（`reason: "photoTakedown"`）が出る（AC-79） | |
| イベント O の写真は B だけ（A はイベント運営者が先に外した） | A を削除する | `BusinessRuleError`（`OCCASION_PHOTO_NOT_FOUND`）。イベントは変わらず、ドメインイベントは出ない | |

## 読みもの

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の読みもの A1 の写真は A・B | A と B を1回で削除する | 写真がなくなり、`unpublished`（`photoTakedown`）になる。`firstPublishedAt` は保たれる。`content.photos_taken_down`（`unpublished: true`）と `photos.released` が出る。公開状態のドメインイベントは出ない。Discovery の読み取りに現れなくなる（AC-79） | |
| 公開中の読みもの A1 の写真は A・B | 同じ申立てに基づいて A を削除し、続けて別の要求で B を削除する | どちらも成功する。1回目は公開が続き、2回目で `unpublished`（`photoTakedown`）になる | |
| 下書きの読みもの A1 の写真は A だけ | A を削除する | 写真がなくなる。公開状態は下書きのまま。`content.photos_taken_down` は `unpublished: false` | |
| 編集担当者が公開を取り下げた読みもの A1（`reason: "byManager"`）の写真は A だけ | A を削除する | 公開状態も事由（`byManager`）も変わらない | |
| 読みもの A1 の写真は B だけ（A は編集担当者が先に外した） | A と B を削除する | `BusinessRuleError`（`ARTICLE_PHOTO_NOT_FOUND`）。B も外れず、読みものは変わらない。ドメインイベントは出ない | |
