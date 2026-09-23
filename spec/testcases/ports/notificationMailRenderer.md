# NotificationMailRenderer

契約: [../../domains/notification.md](../../domains/notification.md) の `NotificationMailRenderer`。行き先は、pages の「通知から開く画面」（[../../pages/index.md](../../pages/index.md)）による。`NotificationMail` は `NotificationMail.compose` で作る。

## render

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 宛先 M1 の `direct` の `NotificationMail` | `render` を呼ぶ | `to` は M1。件名と本文は空でない | |
| `Occurrence` の宛先の立場（`applicant`、`approver`、`placeStewards`、`regionStewards`、`occasionStewards`、`editors`、`operators`、`invitee`、`grantee`、`self`）ごとの `NotificationMail` | それぞれ `render` を呼ぶ | どの立場でも、例外なく `RenderedMail` を返す | |
| 同じ `NotificationMail` | `render` を2回呼ぶ | 2つの結果は一致する | |
| `labels` に、名称が `null` の参照を持つ `NotificationMail` | `render` を呼ぶ | 例外なく `RenderedMail` を返す | |
| `placeStewards` / `categories_reassigned` の `NotificationMail` | `render` を呼ぶ | 本文は移行先のカテゴリーを載せない | |

## 行き先

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `direct` の、`placeStewards` / `listing_suspended` の `NotificationMail` | `render` を呼ぶ | 本文は、その掲載の編集を開く行き先を載せる | |
| `proxy` の、`placeStewards` / `listing_suspended` の `NotificationMail` | `render` を呼ぶ | 本文は、その掲載の対象の運営を開く行き先を載せる | |
| `direct` の、`applicant` / `returned`（個人の申請）の `NotificationMail` | `render` を呼ぶ | 本文は、その申請の詳細を開く行き先を載せる | |
| `proxy` の、`applicant` / `lapsed`（店舗として行った申請）の `NotificationMail` | `render` を呼ぶ | 本文は、管理者が不在の店舗の対象の運営を開く行き先を載せる | |
| `proxy` の、`approver` / `submitted` の `NotificationMail` | `render` を呼ぶ | 本文は、その申請の判断を開く行き先を載せる | |
| `invitee` の `NotificationMail` | `render` を呼ぶ | 本文は、その招待の承諾を開く行き先を載せる | |
| `self` の `NotificationMail` | `render` を呼ぶ | 本文は、行き先を載せない | |
| 同じ出来事の通知と `NotificationMail` | 通知一覧からその通知を開く画面と、`render` の本文の行き先を比べる | 同じ画面を指す | |
