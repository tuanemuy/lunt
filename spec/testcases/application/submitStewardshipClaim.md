# submitStewardshipClaim

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 p1 は公開されていて、店舗管理者がいない。利用者 A がログインしている | A が、店舗との関係と、確認に使える連絡先を文章で記して、p1 の管理権限を申請する | 確認中の管理権限の申請が保存される。内容は関係と連絡先を持ち、対象の指定の `registrationId` は `null`。`application.submitted`（承認者の席は `operator`）が出る（AC-43） | |
| 店舗 p1 に店舗管理者 S がいる。A は p1 の店舗管理者でない | A が p1 の管理権限を申請する | 申請が確認中で保存される（店舗管理者がいる店舗にも申請できる） | |
| 店舗 p1 はサービス運営者が代理登録した店舗で、店舗管理者がいない | 店舗本人の A が p1 の管理権限を申請する | 申請が確認中で保存される（AC-57） | |
| 利用者 B の p1 への管理権限の申請が確認中 | A が p1 の管理権限を申請する | A の申請が確認中で保存される。B の申請は変わらない | |
| A の登録申請 r1 は確認中。r1 に併せた管理権限の申請 s1 は取り下げになっている | A が、r1 を参照して、別の ID s2 で管理権限を申請する | s2 が確認中で保存される。対象の指定の `registrationId` は r1、`placeId` は r1 の `reservedPlaceId`。s1 は取り下げのまま残る。予約した `placeId` の店舗がまだなくても成立する | |
| A の登録申請 r1 は否認になっている | A が、r1 を参照して管理権限を申請する | `BusinessRuleError`（`APPLICATION_REGISTRATION_NOT_STANDING`）になる。申請は作られない | |
| A は p1 の店舗管理者 | A が p1 の管理権限を申請する | `BusinessRuleError`（`APPLICATION_ALREADY_STEWARD`）になる | |
| A の p1 への管理権限の申請が確認中 | A が、別の ID で p1 の管理権限を申請する | `BusinessRuleError`（`APPLICATION_ALREADY_ACTIVE`）になる | |
| 店舗 p1 はサービス運営者が非公開にしている | A が p1 の管理権限を申請する | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`）になる | |
| 店舗 p1 に店舗管理者がいない | A が、確認に使える連絡先または資料を空にして申請する | `BusinessRuleError`（`APPLICATION_CLAIM_REQUIRED`）になる | |
| 利用者 B の登録申請 r2 が確認中 | A が、r2 を参照して管理権限を申請する | `NotFoundError` になる。申請は作られない | |
