# withdrawApplication

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 利用者 A の情報修正の申請 a1 が確認中。申請が持ち主の写真は ph1 | A が、確かめたときの版を添えて a1 を取り下げる | a1 は取り下げになる。内容は反映されない。`application.withdrawn`（承認者の席は `operator`）が出る。`photos.released` は出ず、ph1 の持ち主は a1 のまま | |
| A の管理権限の申請 a2 が差し戻し | A が a2 を取り下げる | a2 は取り下げになる | |
| A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 | A が r1 を取り下げる | r1 は取り下げになる。この UnitOfWork では s1 は変わらない（s1 は `reassessApplicationPremises` が失効にする） | |
| A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 | A が s1 を取り下げる | s1 は取り下げになる。r1 は確認中のまま残る | |
| 店舗 p1 の店舗管理者 T が店舗管理者として行った所属の申請 a3 が確認中。S は p1 の別の店舗管理者 | S が a3 を取り下げる | a3 は取り下げになる。`application.withdrawn` の `approver` は対象の地域の `steward`（AC-66） | |
| A の申請 a1 が取り下げになっている | A が、同じ店舗の情報修正を、別の ID で申請する | 新しい申請が確認中で保存される（取り下げの後に再申請できる）（AC-21） | |
| A の申請 a1 が確認中。利用者 B は申請者でない | B が a1 を取り下げる | `ForbiddenError` になる。a1 は変わらない | |
| 店舗 p1 について店舗管理者として行った申請 a3 が確認中。T は p1 の店舗管理者を辞任している | T が、自分が提出した a3 を取り下げる | `ForbiddenError` になる | |
| A の申請 a1 は、取り下げる前に承認された | A が a1 を取り下げる | `BusinessRuleError`（`APPLICATION_ALREADY_APPROVED`）になる。a1 は承認のまま | |
| A の申請 a1 は、取り下げる前に失効した | A が a1 を取り下げる | `BusinessRuleError`（`APPLICATION_ALREADY_LAPSED`）になる | |
| 店舗 p1 について店舗管理者として行った申請 a3 を、T が先に取り下げた | S が a3 を取り下げる | `BusinessRuleError`（`APPLICATION_ALREADY_WITHDRAWN`）になる | |
| 店舗 p1 について店舗管理者として行った申請 a3 は、S が差し戻しの状態で確かめた後に、T が再提出して確認中に戻った | S が、古い版を添えて a3 を取り下げる | `ConflictError` になる。a3 は確認中のまま | |
| ID が a9 の申請はない | A が a9 を取り下げる | `NotFoundError` になる | |
