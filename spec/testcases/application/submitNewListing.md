# submitNewListing

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 p1 は公開されていて、店舗管理者がいない。カテゴリー c1 は現役。利用者 A が登録した、持ち主のない写真 ph1、ph2 がある | A が、写真 ph1・ph2（見せる範囲を含む）、名称、カテゴリー c1、説明、提供期間を入力して、p1 の掲載を申請する | 確認中の掲載の申請が保存される。`reservedListingId` は新しく予約された ID で、その ID の掲載はまだない。ph1 と ph2 の持ち主はその申請になる。`application.submitted`（承認者の席は `operator`）が出る（AC-19） | |
| A の p1 への掲載の申請が確認中 | A が、別の ID で p1 の別の掲載を申請する | 新しい申請が確認中で保存される（掲載の申請は重ねて出せる） | |
| A の p1 への掲載の申請（写真 ph1）が取り下げになっていて、ph1 は手放されている。A が新しく登録した、持ち主のない写真 ph4 がある | A が、前の申請の内容から写真を除いた内容を直し、ph4 を添えて、別の ID で申請する | 新しい申請が確認中で保存される。ph4 の持ち主は新しい申請になる。前の申請は取り下げのまま残る（AC-21） | |
| A の p1 への掲載の申請（写真 ph1）が取り下げになっていて、ph1 は削除されている | A が、前の申請の写真 ph1 を添えたまま、別の ID で申請する | `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`）になる。申請は作られない | |
| 店舗 p1 に店舗管理者がいる | A が p1 の掲載を申請する | `BusinessRuleError`（`APPLICATION_PLACE_HAS_STEWARD`）になる。申請は作られず、写真の持ち主は設定されない（AC-19） | |
| 店舗 p1 はサービス運営者が非公開にしている | A が p1 の掲載を申請する | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`）になる | |
| ID が p9 の店舗はない | A が p9 の掲載を申請する | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`）になる | |
| 店舗 p1 に店舗管理者がいない | A が、写真を添えずに申請する。名称を空にして申請する。カテゴリーを選ばずに申請する | どれも `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）になる | |
| カテゴリー c2 は廃止済み | A が、カテゴリーを c2 にして申請する | `BusinessRuleError`（`LISTING_CATEGORY_NOT_AVAILABLE`）になる | |
| 写真 ph3 は別の利用者が登録した、持ち主のない写真 | A が、ph3 を添えて申請する | `BusinessRuleError`（`MEDIA_PHOTO_NOT_REGISTRANT`）になる。申請は作られない | |
| A の掲載の申請 a1 が確認中で保存されている | A が、同じ ID a1 と同じ内容・補足で、もう一度申請する | 成功として a1 を返す。書き込みもドメインイベントもなく、`reservedListingId` は変わらない | |
