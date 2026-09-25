# submitListingRevision

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 p1 に店舗管理者がいない。p1 の掲載 l1 は公開中。利用者 A がログインしている | A が、l1 の名称と提供の設定だけを変えた内容で、修正を申請する | 確認中の掲載の修正の申請が保存される。内容は名称と提供の設定の項目だけを持ち、申請の `placeId` は p1。`application.submitted`（承認者の席は `operator`）が出る。掲載は変わらない（AC-19） | |
| l1 の写真は ph1、ph2。A が登録した、持ち主のない写真 ph3 がある | A が、写真を ph3、ph1 の順にして（ph2 を外し、ph3 を加える）修正を申請する | 内容の写真の項目は ph3、ph1。申請が持ち主の写真（`ownedPhotoIds`）は ph3 だけで、ph3 の持ち主はその申請になる。ph1・ph2 の持ち主は l1 のまま | |
| 利用者 B の l1 への修正の申請が確認中 | A が l1 の修正を申請する | A の申請が確認中で保存される。B の申請は変わらない | |
| 店舗 p1 に店舗管理者がいる | A が l1 の修正を申請する | `BusinessRuleError`（`APPLICATION_PLACE_HAS_STEWARD`）になる（AC-19） | |
| A の l1 への修正の申請が確認中 | A が、別の ID で l1 の修正を申請する | `BusinessRuleError`（`APPLICATION_ALREADY_ACTIVE`）になる | |
| l1 は入力の間に削除された | A が l1 の修正を申請する | `BusinessRuleError`（`APPLICATION_LISTING_NOT_FOUND`）になる。申請は作られない | |
| l1 は入力の間に一時非公開になった。または運営による非公開になった | A が l1 の修正を申請する | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`）になる | |
| l1 は公開中。店舗 p1 はサービス運営者が非公開にしている | A が l1 の修正を申請する | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`）になる | |
| l1 は公開中で、店舗管理者がいない | A が、現在の内容から何も変えずに申請する | `BusinessRuleError`（`COMMON_INVALID_FIELD_PATCH`）になる | |
| l1 は公開中で、店舗管理者がいない | A が、写真をすべて外して申請する。名称を空にして申請する | どちらも `BusinessRuleError`（`LISTING_PUBLISH_CONDITION_UNMET`）になる | |
| l1 は公開中で、店舗管理者がいない。カテゴリー c2 は廃止済み | A が、l1 のカテゴリーを c2 に変えて申請する | `BusinessRuleError`（`LISTING_CATEGORY_NOT_AVAILABLE`）になる。申請は作られない | |
| A の l1 への修正の申請 a1（名称の項目）が確認中で保存されている。その後、別の修正の申請の承認で l1 の説明が変わった | A が、同じ ID a1 と、最初と同じ修正後の内容で、もう一度申請する | 成功として a1 を返す。a1 の内容は名称の項目のまま。書き込みもドメインイベントもない | |
| A の l1 への修正の申請 a1（名称の項目）が確認中で保存されている | A が、同じ ID a1 で、名称の違う修正後の内容を送る | `ConflictError` になる。a1 は変わらない | |
| A の l1 への修正の申請 a1（名称の項目）が確認中で保存されている | A が、同じ ID a1 で、名称は同じまま説明も変えた修正後の内容を送る | `ConflictError` になる（保存されている変更にない項目も、入力の全体として比べる）。a1 は名称の項目だけを持ったまま | |
