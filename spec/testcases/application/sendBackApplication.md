# sendBackApplication

期間超過の代行ができるまでの期間（`ReviewPolicy.proxyAfterMs`）は7日とする。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 利用者 A の管理権限の申請 a1 が確認中。店舗との関係の確認が足りない。操作する人はサービス運営者 O | O が、確かめたときの版と、追加で必要な確認 q を添えて a1 を差し戻す | a1 は差し戻しになる。`request` は q。版が進む。申請者が A の `application.returned` が出る。内容は反映されない（AC-43） | |
| 利用者 R は地域 X の運営者。店舗 p1 について店舗管理者として行った X への所属の申請 b1 が確認中 | R が、追加で必要な確認を添えて b1 を差し戻す | b1 は差し戻しになる。`application.returned` の申請者は店舗 p1 | |
| 地域 Y に運営者がいない。Y への所属の申請 b3 が確認中 | サービス運営者 O が b3 を差し戻す | b3 は差し戻しになる（不在の代行をするサービス運営者は承認者） | |
| 差し戻しになった a1 | 対応を待つ申請（`listApplicationsAwaitingReview`）を読む | a1 は現れない。A が再提出すると、再び現れる | |
| a1 が確認中 | O が、追加で必要な確認を空白だけにして差し戻す | `BusinessRuleError`（`APPLICATION_INVALID_RETURN_REQUEST`）になる。a1 は確認中のまま | |
| 地域 X に運営者がいる。b1 は10日前から確認中。O は X の運営者でない | O が b1 を差し戻す | `BusinessRuleError`（`APPLICATION_OVERDUE_PROXY_CANNOT_RETURN`）になる。b1 は確認中のまま | |
| 地域 Y に運営者がいない。Y への所属の申請 b4 は10日前から確認中。サービス運営者 O が不在の代行で b4 を確かめた後、差し戻しの前に利用者 R が Y の運営者に就いた | O が b4 を差し戻す | `BusinessRuleError`（`APPLICATION_OVERDUE_PROXY_CANNOT_RETURN`）になる。b4 は確認中のまま（期間超過の代行は承認・否認だけを行える） | |
| 地域 X に運営者がいる。b1 は3日前から確認中 | O が b1 を差し戻す | `BusinessRuleError`（`APPLICATION_AWAITING_STEWARDS`）になる | |
| 利用者 U は、a1 の承認者でない | U が a1 を差し戻す | `ForbiddenError` になる | |
| a1 は、別のサービス運営者が先に承認した | O が a1 を差し戻す | `BusinessRuleError`（`APPLICATION_ALREADY_APPROVED`）になる。a1 は承認のまま | |
| a1 は、判断の前に A が取り下げた | O が a1 を差し戻す | `BusinessRuleError`（`APPLICATION_ALREADY_WITHDRAWN`）になる | |
| a1 はすでに差し戻されている | O が a1 をもう一度差し戻す | `BusinessRuleError`（`APPLICATION_RETURNED`）になる | |
| a1 は、O が確かめた後に、別のサービス運営者が差し戻し、A が再提出して確認中に戻った | O が、古い版を添えて a1 を差し戻す | `ConflictError` になる。a1 は確認中のまま | |
