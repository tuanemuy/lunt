# rejectApplication

期間超過の代行ができるまでの期間（`ReviewPolicy.proxyAfterMs`）は7日とする。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 利用者 A の登録申請 r1 が確認中。申請が持ち主の写真は ph1、ph2。操作する人はサービス運営者 O | O が、確かめたときの版と、既存の店舗との重複の理由を添えて r1 を否認する | r1 は否認になる。`reason` は入力の理由（承認者の席が `operator` の申請の否認は、判断の立場を持たない）。店舗は作られない。申請者が A の `application.rejected` が出る。`photos.released` は出ず、ph1・ph2 の持ち主は r1 のまま | |
| A の登録申請 r1 は、サービス運営者が非公開にしている店舗 p2 と重複している | O が、重複を理由に添えて r1 を否認する | r1 は否認になる。p2 は非公開のまま変わらない（AC-78） | |
| A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 | O が r1 を否認する | r1 は否認になる。この UnitOfWork では s1 は変わらない（s1 は `reassessApplicationPremises` が失効にする） | |
| 登録申請 r1 は承認されている。併せた管理権限の申請 s1 が確認中 | O が、理由を添えて s1 を否認する | s1 は否認になる。店舗は公開されたまま、A に管理権限は付かない（AC-08） | |
| 利用者 R は地域 X の運営者。X からの離脱の申請 b1 が確認中 | R が、理由を添えて b1 を否認する | b1 は否認になる。所属は続く | |
| 地域 X に運営者がいる。X への所属の申請 b2 は10日前から確認中。O は X の運営者でない | O が、理由を添えて b2 を否認する | b2 は否認になる。`reviewAs` は `overdue_proxy`（AC-67） | |
| A の申請が否認になっている | A が、その申請を確かめる（`getMyApplication`） | 否認の理由が返る（AC-21） | |
| r1 が確認中 | O が、理由を空白だけにして否認する | `BusinessRuleError`（`APPLICATION_INVALID_REJECTION_REASON`）になる。r1 は確認中のまま | |
| 地域 Y に運営者がいない。Y への所属の申請 b5 は3日前から確認中。サービス運営者 O が不在の代行で b5 を確かめた後、否認の前に利用者 R が Y の運営者に就いた | O が b5 を否認する | `BusinessRuleError`（`APPLICATION_AWAITING_STEWARDS`）になる。b5 は確認中のまま | |
| 地域 Y に運営者がいない。Y への所属の申請 b6 は10日前から確認中。サービス運営者 O が不在の代行で b6 を確かめた後、否認の前に利用者 R が Y の運営者に就いた | O が、理由を添えて b6 を1回否認する | その1回の操作で b6 は否認になり（判断済み）、`reviewAs` は `overdue_proxy`。`application.rejected` が出る | |
| 地域 X に運営者がいる。b2 は3日前から確認中 | O が b2 を否認する | `BusinessRuleError`（`APPLICATION_AWAITING_STEWARDS`）になる | |
| 登録申請 r1 と併せた申請 s1 が、どちらも確認中 | O が s1 を否認する | `BusinessRuleError`（`APPLICATION_REGISTRATION_PENDING`）になる | |
| 利用者 U は、r1 の承認者でない | U が r1 を否認する | `ForbiddenError` になる | |
| ID が a9 の申請はない | O が a9 を否認する | `NotFoundError` になる | |
| b2 は、期間超過の代行の前に、X の運営者が承認した | O が b2 を否認する | `BusinessRuleError`（`APPLICATION_ALREADY_APPROVED`）になる（申請の状態を、期間超過の代行ができるかどうかより先に判定する） | |
| A の情報修正の申請 a1 は、判断の前に失効した。または A が取り下げた | O が、理由を添えて a1 を否認する | それぞれ `BusinessRuleError`（`APPLICATION_ALREADY_LAPSED`、`APPLICATION_ALREADY_WITHDRAWN`）になる | |
| r1 は差し戻されている | O が r1 を否認する | `BusinessRuleError`（`APPLICATION_RETURNED`）になる | |
| r1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が内容を直して再提出して確認中に戻った | O が、古い版と理由を添えて r1 を否認する | `ConflictError` になる。r1 は確認中のまま | |
