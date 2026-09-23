# resignStewardship

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A、B は店舗 P の管理者 | A を `Actor` として P の管理権限を辞任する | 成功する。P の管理者は B だけになり、`stewarded` のまま。`"authority.steward_removed"`（`target` は P、`accountId` は A、`reason: "resigned"`）が1件出る。`"authority.stewardship_vacated"` は出ない | |
| 上のケースの後 | A を `Actor` として `getMyAuthority` と、P の `viewMembers` を実行する | 管理する対象に P は含まれない。`viewMembers` は `ForbiddenError` | |
| A は地域 R の唯一の管理者 | A を `Actor` として辞任する | 成功する。R は `vacant` になる。`"authority.steward_removed"` と `"authority.stewardship_vacated"`（`target` は R）が出る。R の地域の情報と公開状態は、この操作で変わらない（AC-28） | |
| A は店舗 P の唯一の管理者。A が送った C 宛ての承諾前の招待がある | A を `Actor` として辞任し、その後 C を `Actor` として招待を承諾する | 辞任は成功し、P は `vacant` になる。招待は残っている。承諾は成功し、P は C を管理者に持つ `stewarded` になる（AC-28） | |
| 店舗 P の管理者は B。X は P の管理者でない | X を `Actor` として P の管理権限を辞任する | `ForbiddenError`。管理体制は変わらない | |
| A は店舗 P の管理者だったが、すでに辞任している | A を `Actor` として、もう一度辞任する | `ForbiddenError`。ドメインイベントは出ない | |
| A は店舗 P1 と店舗 P2 の管理者 | A を `Actor` として P1 の管理権限を辞任する | P1 だけから取り除かれる。P2 の管理体制は変わらない | |
