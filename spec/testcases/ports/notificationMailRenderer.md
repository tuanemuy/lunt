# NotificationMailRenderer

契約: [../../domains/notification.md](../../domains/notification.md) の `NotificationMailRenderer`。行き先（`link`）は `NotificationDestination` の値。行き先から URL への写しは実装が持ち、テストは実装の写しの結果が本文にあることを確かめる。`NotificationMail` は `NotificationMail.compose`、`TakedownOutcomeMail` は `TakedownOutcomeMail.compose` で作る。

## render

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 宛先 M1 の `direct` の `NotificationMail` | `render` を呼ぶ | `to` は M1。件名と本文は空でない | |
| `Occurrence` の宛先の立場（`applicant`、`approver`、`placeStewards`、`regionStewards`、`occasionStewards`、`contentManagers`、`editors`、`operators`、`invitee`、`grantee`、`self`）ごとの `NotificationMail` | それぞれ `render` を呼ぶ | どの立場でも、例外なく `RenderedMail` を返す。`link` は `NotificationDestination.of(mail)` と一致し、`null` でなければ本文がその行き先の URL を含む | |
| 同じ `NotificationMail` | `render` を2回呼ぶ | 2つの結果は一致する | |
| `labels` に、名称が `null` の参照を持つ `NotificationMail` | `render` を呼ぶ | 例外なく `RenderedMail` を返す | |
| `placeStewards` / `categories_reassigned` の `NotificationMail` | `render` を呼ぶ | 本文は移行先のカテゴリーを載せない | |

## 行き先

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| `direct` の、`contentManagers` / 掲載 L の `suspended` の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "listingManagement", listingId: L }` | |
| `proxy` の、`contentManagers` / 掲載 LV の `suspended` の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "proxyOperation", target: 店舗 V, direct: { kind: "listingManagement", listingId: LV } }`（`target` は `vacantTarget`。掲載 LV は店舗 V に紐づく） | |
| `direct` の、`applicant` / `returned`（個人として行った申請 Ap）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "ownApplication", applicationId: Ap }` | |
| `proxy` の、`applicant` / `lapsed`（店舗 V の店舗管理者として行った申請 Ap）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "proxyOperation", target: 店舗 V, direct: { kind: "ownApplication", applicationId: Ap } }`（`target` は `vacantTarget`） | |
| `proxy` の、`contentManagers` / 店舗 V の `photos_taken_down` の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "proxyOperation", target: 店舗 V, direct: { kind: "placeManagement", placeId: V, facet: "profile" } }` | |
| `proxy` の、`placeStewards` / 店舗 V の `confirmation_requested`（連絡 Rp）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "proxyOperation", target: 店舗 V, direct: { kind: "confirmationRequest", reportId: Rp } }` | |
| `proxy` の、`placeStewards` / 店舗 V の `steward_added`（就任した人 S3）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "proxyOperation", target: 店舗 V, direct: { kind: "placeManagement", placeId: V, facet: "members" } }` | |
| `proxy` の、`occasionStewards` / イベント CV の `participation_withdrawn`（店舗 P）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "proxyOperation", target: イベント CV, direct: { kind: "occasionParticipant", occasionId: CV, placeId: P } }` | |
| `proxy` の、`approver` / `submitted`（申請 Ap）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "applicationReview", applicationId: Ap }` | |
| `direct` の、`placeStewards` / 店舗 P の `occasion_cancelled`（イベント C）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "participationEditing", placeId: P, occasionId: C }` | |
| `direct` の、`occasionStewards` / イベント C の `participation_withdrawn`（店舗 P）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "occasionParticipant", occasionId: C, placeId: P }` | |
| `invitee`（店舗 P への招待 I）の `NotificationMail` | `render` を呼ぶ | `link` は `{ kind: "invitation", target: 店舗 P, invitationId: I }` | |
| `self` の `NotificationMail` | `render` を呼ぶ | `link` は `null`。本文は行き先を載せない | |

## renderTakedownOutcome

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 宛先 M1、対象が掲載・店舗・地域・イベント・読みもののそれぞれの `TakedownOutcomeMail` | それぞれ `renderTakedownOutcome` を呼ぶ | どれも例外なく返る。`to` は M1、`link` は `null`。件名と本文は空でなく、本文は `outcome` の全文を含む | |
| 措置を行わないことを `outcome` にした `TakedownOutcomeMail` | `renderTakedownOutcome` を呼ぶ | 本文は `outcome` の全文を含む | |
| 対象の名称が `null` の `TakedownOutcomeMail` | `renderTakedownOutcome` を呼ぶ | 例外なく `RenderedMail` を返す | |
| 同じ `TakedownOutcomeMail` | `renderTakedownOutcome` を2回呼ぶ | 2つの結果は一致する | |
