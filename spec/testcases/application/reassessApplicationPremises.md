# reassessApplicationPremises

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 管理者のいなかった店舗 p1 に、利用者 S が店舗管理者として就いた。個人が p1 に行った、A の情報修正の申請 a1（確認中）、B の掲載の申請 a2（差し戻し）、A の掲載の修正の申請 a3（確認中）、B の所属の申請 a4（確認中）、A の離脱の申請 a5（確認中）がある | p1 の `authority.steward_appointed` を消費する | a1〜a5 はどれも失効になり、`brokenPremises` は `placeHasNoSteward`。申請ごとに、申請者宛ての `application.lapsed` が出る。内容は反映されない。`photos.released` は出ず、申請が持ち主の写真は申請が持ち続ける（AC-66） | |
| 同上。別の利用者 C の p1 への管理権限の申請 a6 が確認中 | p1 の `authority.steward_appointed` を消費する | a6 は確認中のまま変わらない | |
| 利用者 A の p1 への管理権限の申請 a7 が確認中。A が招待の承諾で p1 の店舗管理者になった | p1 の `authority.steward_appointed` を消費する | a7 は失効になり、`brokenPremises` は `applicantNotSteward`（AC-66） | |
| 店舗 p1 が店舗管理者として行った、所属の申請 b1（確認中）と参加の申請 b2（差し戻し）がある。p1 の最後の店舗管理者が辞任した | p1 の `authority.stewardship_vacated` を消費する | b1 と b2 は失効になり、`brokenPremises` は `placeHasSteward`。`application.lapsed` の申請者は店舗 p1（AC-66） | |
| 店舗 p1 について店舗管理者として行った申請 b1 が確認中。b1 を提出した店舗管理者 T が辞任し、店舗管理者 S が残っている（`authority.stewardship_vacated` は出ない）。その後、p1 の別の地域への所属が成立した | p1 の `region.affiliation_established` を消費する | b1 は確認中のまま変わらない（他の店舗管理者がいる間は続く）（AC-66） | |
| 登録申請 r1 と、併せた管理権限の申請 s1 が確認中だった。r1 が否認された | r1 の `application.rejected` を消費する | s1 は失効になり、`brokenPremises` は `registrationStanding`（AC-66） | |
| 登録申請 r1 と、併せた管理権限の申請 s1 が確認中だった。r1 が取り下げられた | r1 の `application.withdrawn` を消費する | s1 は失効になる | |
| A の退会の消費で、登録申請 r1 と、併せた管理権限の申請 s1 が同じ UnitOfWork で取り下げになった | r1 の `application.withdrawn` を消費する | s1 は取り下げのまま変わらず、`application.lapsed` は出ない | |
| 情報修正の申請 a1 が否認された（登録申請でない） | a1 の `application.rejected` を消費する | どの申請も変わらない | |
| 掲載 l1 への修正の申請 a3 が確認中。l1 が削除された | l1 の `listing.deleted` を消費する | a3 は失効になり、`brokenPremises` は `listingExists`（AC-66） | |
| 店舗 p2 の地域 X への所属の申請が、A のもの（b3）と B のもの（b4）、どちらも確認中だった。b3 が承認されて所属が成立した | `region.affiliation_established` を消費する | b4 は失効になり、`brokenPremises` は `notAffiliated`。p2 の別の地域 Y への所属の申請は変わらない | |
| 店舗 p1 の X からの離脱の申請 b5 が確認中。X の運営者が p1 を除外した | `region.affiliation_dissolved` を消費する | b5 は失効になり、`brokenPremises` は `affiliated` | |
| イベント e1 への参加の申請 c1（確認中）と c2（差し戻し）がある。e1 が中止になった | e1 の `occasion.cancelled` を消費する | c1 と c2 は失効になり、`brokenPremises` は `occasionOpen` | |
| e1 への参加の申請 c1 が確認中。日次のジョブが e1 の終了を確かめた | e1 の `occasion.ended` を消費する | c1 は失効になる | |
| e1 への参加の申請 c1（確認中）と c2（差し戻し）がある。e1 の開催期間が過去の日付へ更新され、開催の状態が終了になった | e1 の `occasion.period_changed` を消費する | c1 と c2 は失効になり、`brokenPremises` は `occasionOpen`。`occasion.ended` を待たない（EVT-04） | |
| e1 への参加の申請 c1 が確認中。e1 の開催期間が別の未来の日付へ更新され、開催の状態は開催前のまま | e1 の `occasion.period_changed` を消費する | c1 は確認中のまま変わらない | |
| e1 への参加の申請 c1 が確認中。e1 は公開を取り下げていて、開催期間を消す更新で開催の状態がなくなった | e1 の `occasion.period_changed` を消費する | c1 は確認中のまま変わらない（終了でも中止でもない） | |
| e1 への、店舗 p1 の参加の申請 c1 が確認中。p1 の最後の店舗管理者が辞任して p1 が管理者不在になり、e1 の運営者が p1 を直接追加し、その後に利用者 T が p1 の店舗管理者に就いた。辞任と就任による再評価は、まだ届いていない | p1 の `occasion.participation_established` を消費する | c1 は失効になり、`brokenPremises` は `notParticipating` だけ（消費の時点で、店舗管理者はいて、イベントは開催前） | |
| c1 は e1 の中止で失効した。その後、中止が取り消された | 再配送された e1 の `occasion.cancelled` を消費する | c1 は失効のまま戻らず、ドメインイベントは出ない | |
| 情報修正の申請 a1 の対象の店舗 p1（店舗管理者がいない）が、サービス運営者によって非公開になった。その後、p1 の地域への所属が成立した | p1 の `region.affiliation_established` を消費する | a1 は確認中のまま変わらない（非公開は前提に含まれない） | |
| a1〜a5 は、`authority.steward_appointed` の消費ですでに失効している | 同じドメインイベントをもう一度消費する | どの申請も変わらず、ドメインイベントは出ない（冪等） | |
| p1 に店舗管理者が就いた後、`authority.steward_appointed` が届く前に、その店舗管理者が辞任して p1 は管理者不在に戻っている | 遅れて届いた `authority.steward_appointed` を消費する | 個人が p1 に行った申請は失効しない（消費の時点の事実で判定する） | |
| a1 と a2 が確認中。a1 の `save` が、同時の承認者の判断と競合した | p1 の `authority.steward_appointed` を消費する | a2 の失効は確定する。a1 は先の判断のまま残り、消費は失敗として終わって再配送される | |
