# approveStewardshipClaim

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 p1 に店舗管理者がいない（保存された管理体制がない）。利用者 A の管理権限の申請 a1 が確認中。操作する人はサービス運営者 O | O が、確かめたときの版を添えて a1 を承認する | a1 は承認になる。p1 の管理体制が保存され、A が店舗管理者になる。`application.approved` と、`via: "application"` の `authority.steward_appointed` が出る。反映先として p1 への参照が返る | |
| 店舗 p1 はサービス運営者が代理登録した店舗。店舗本人の A の管理権限の申請 a1 が確認中 | O が a1 を承認する | A が p1 の店舗管理者になり、p1 を管理できる（`AccessPolicy.decide` の `manage_target` が `steward`）（AC-57） | |
| 店舗 p1 に店舗管理者 S がいる。A の管理権限の申請 a1 が確認中 | O が a1 を承認する | A が店舗管理者に加わる。S は店舗管理者のまま | |
| 利用者 A と B の、p1 への管理権限の申請がどちらも確認中 | O が、A の申請と B の申請を順に承認する | どちらも成立し、A と B がどちらも p1 の店舗管理者になる | |
| 登録申請 r1 は承認されていて、店舗 p1 が保存されている。r1 に併せた管理権限の申請 s1 が確認中 | O が s1 を承認する | s1 は承認になり、A が p1 の店舗管理者になる（AC-08） | |
| 登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 | O が s1 を承認する | `BusinessRuleError`（`APPLICATION_REGISTRATION_PENDING`）になる。s1 は確認中のまま | |
| 登録申請 r1 は否認された。s1 の前提の再評価はまだ届いていない | O が s1 を承認する | 例外にならず、s1 が失効になったことと、成り立たない前提 `registrationStanding` が返る。管理体制は変わらない | |
| a1 の確認中に、A が招待の承諾で p1 の店舗管理者になった。前提の再評価はまだ届いていない | O が a1 を承認する | 例外にならず、a1 が失効になったことと、成り立たない前提 `applicantNotSteward` が返る。`application.lapsed` が出る | |
| a1 の確認中に、p1 がサービス運営者によって非公開になった | O が a1 を承認する | 承認が成立し、A は非公開の店舗 p1 の店舗管理者になる | |
| 利用者 U はサービス運営者でない | U が a1 を承認する | `ForbiddenError` になる | |
| a1 は、判断の前に A が取り下げた | O が a1 を承認する | `BusinessRuleError`（`APPLICATION_ALREADY_WITHDRAWN`）になる | |
| a1 の確認中に、A が退会した。`account.withdrawn` の消費による取り下げはまだ届いていない | O が a1 を承認する | `BusinessRuleError`（`APPLICATION_APPLICANT_WITHDRAWN`）になる。a1 は確認中のまま残り、p1 の管理体制は変わらない。その後の `account.withdrawn` の消費で、a1 は取り下げになる | |
| a1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が内容を直して再提出して確認中に戻った | O が、古い版を添えて a1 を承認する | `ConflictError` になる。a1 は確認中のまま、管理体制は変わらない | |
