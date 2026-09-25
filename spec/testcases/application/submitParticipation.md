# submitParticipation

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 利用者 S は店舗 p1 の店舗管理者。イベント e1 は公開中で開催前、運営者がいる。p1 の掲載 l1 は公開中で提供中、l2 は公開中で提供開始前、l6 は公開中で提供終了 | S が、l1・l2・l6 と、開催期間内の参加日2日を添えて、p1 の e1 への参加を申請する | 確認中の参加の申請が保存される。申請者は店舗 p1。内容は l1・l2・l6 と参加日を持つ（提供状態を問わず添えられる）。`application.submitted` の `approver` は e1 の `steward`。参加はまだ成立しない（AC-17） | |
| S は p1 の店舗管理者。e1 は公開中で開催中 | S が、掲載も参加日も添えずに、p1 の e1 への参加を申請する | 申請が確認中で保存される | |
| p1 の e1 への参加の申請が否認になっている | S が、別の ID で p1 の e1 への参加を申請する | 新しい申請が確認中で保存される。前の申請は否認のまま残る（AC-21） | |
| 利用者 A は p1 の店舗管理者でない。p1 に店舗管理者がいない | A が p1 の e1 への参加を申請する | `ForbiddenError` になる（管理者のいない店舗の参加を、利用者は申請できない） | |
| S は申請の入力の途中で p1 の管理権限を失った | S が p1 の e1 への参加を申請する | `ForbiddenError` になる | |
| S は p1 の店舗管理者。e1 は終了している | S が p1 の e1 への参加を申請する | `BusinessRuleError`（`APPLICATION_OCCASION_NOT_OPEN`）になる。申請は作られない | |
| S は p1 の店舗管理者。e1 は中止になっている | S が p1 の e1 への参加を申請する | `BusinessRuleError`（`APPLICATION_OCCASION_NOT_OPEN`）になる | |
| S は p1 の店舗管理者。p1 は e1 に参加中 | S が p1 の e1 への参加を申請する | `BusinessRuleError`（`APPLICATION_ALREADY_PARTICIPATING`）になる | |
| p1 の別の店舗管理者 T が行った、p1 の e1 への参加の申請が差し戻し | S が p1 の e1 への参加を申請する | `BusinessRuleError`（`APPLICATION_ALREADY_ACTIVE`）になる | |
| S は p1 の店舗管理者。e1 は公開を取り下げられている | S が p1 の e1 への参加を申請する | `BusinessRuleError`（`APPLICATION_TARGET_NOT_VIEWABLE`）になる | |
| S は p1 の店舗管理者。e1 は開催前 | S が、開催期間の外の日付を参加日にして申請する | `BusinessRuleError`（`OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`）になる | |
| S は p1 の店舗管理者。p1 の掲載 l3 は下書き、l4 は一時非公開、l5 は別の店舗の公開中の掲載 | S が、l3、l4、l5 のどれかを添えて申請する | どれも `BusinessRuleError`（`OCCASION_LISTING_NOT_ATTACHABLE`）になる | |
| l1 と参加日を添えた、p1 の e1 への参加の申請 c1 が確認中で保存されている。その後、l1 が一時非公開になり、e1 の開催期間が短くなって参加日が期間外になった | S が、同じ ID c1 と、最初と同じ掲載と参加日で、もう一度申請する | 成功として c1 を返す。書き込みもドメインイベントもない（再送では、添えられる掲載と開催期間を確かめない） | |
| c1 が確認中で保存されている | S が、同じ ID c1 で、添える掲載の違う入力を送る | `ConflictError` になる。c1 は変わらない | |
