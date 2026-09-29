# listNotifications

通知は `deliverNotifications` の消費で用意する。宛先の決め方は `deliverNotifications` のテストが確かめる。ここでは、並び順・件数と、通知ごとに返す内容を確かめる。`pointedContent` は `Occurrence.pointedContent`、`vacantTarget` は `DeliveredOccurrence.vacantTarget`、行き先は `NotificationDestination.of` の結果。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 利用者 A に、T1 < T2 < T3 の順に3つの通知が作られた | A として1ページ目を読む | T3、T2、T1 の順に返す。通知ごとに、出来事、届いた経路、指す対象、参照の名称、行き先を持つ。`count` は 3（AC-41） | |
| 利用者 A に通知が1件もない | A として1ページ目を読む | 空の並びと `count` 0 を返す。エラーにならない | |
| 通知を持つ利用者がいる。ログインしていない | `Actor` なしで読む | `UnauthorizedError`。どの通知も返さない | |
| 利用者 A は、店舗 P の店舗管理者、地域 R の地域運営者、編集担当者を兼ねる。それぞれの立場宛ての出来事と、A が個人として行った申請の承認が起きた | A として読む | すべての通知が、1つの並びに新しい順で現れる。立場ごとに分かれない（AC-41） | |
| 利用者 A と利用者 B が店舗 P の店舗管理者で、店舗 P が運営による非公開になった。B には別の通知もある | A として読む | A の通知だけを返す。`count` は A の件数。B の通知は現れない | |
| 店舗 P の掲載 L が運営による非公開になり、店舗管理者 A に通知が届いた | A として読む | 通知は `direct` で、`pointedContent` は掲載 L、`vacantTarget` は `null`。`labels` は掲載 L の名称を持つ。掲載 L は閲覧できないが、名称は解決される。行き先は掲載 L と店舗 P の `listingManagement` | |
| 店舗管理者が不在の店舗 V の掲載 LV が運営による非公開になり、サービス運営者 O に通知が届いた | O として読む | 通知は `proxy` で、`vacantTarget` は店舗 V、`pointedContent` は掲載 LV。`labels` は掲載 LV の名称を持つ。行き先は店舗 V の `proxyOperation`（`target` は `vacantTarget`）で、`direct` は掲載 LV と店舗 V の `listingManagement` | |
| 店舗管理者として行った申請 Ap が、最後の店舗管理者の退会で失効し、サービス運営者 O に失効の通知が届いた | O として読む | 通知は `proxy` で、`vacantTarget` はその店舗、`pointedContent` は `null`、`occurrence` が Ap を指す。`labels` は Ap の種類と対象の名称を持つ。行き先はその店舗の `proxyOperation` で、`direct` は Ap の `ownApplication`（AC-66） | |
| 利用者 A の店舗の登録申請 Ap が否認され、A に通知が届いた。店舗は作られていない | A として読む | `labels` は、Ap の種類と、Ap の内容の店名を持つ。`null` にならない。行き先は Ap の `ownApplication` | |
| 利用者 A の登録申請 Ap1 が承認されて店舗が作られ、その後に店舗の名称が変更された | A として読む | 承認の通知の `labels` は、Ap1 の内容の店名を持つ（変更後の名称ではない） | |
| 利用者 A の掲載の申請 Ap が承認され、A に通知が届いた | A として読む | `labels` は、Ap の種類と、Ap の内容の掲載の名称、店舗の名称を持つ | |
| 地域運営者が不在の地域 RV への所属申請 Ap が提出され、サービス運営者 O に通知が届いた | O として読む | 通知は `approver` / `submitted` の `proxy` で、`vacantTarget` は地域 RV、`occurrence` が Ap を指す。行き先は Ap の `applicationReview` | |
| サービス運営者が A の店舗 P の管理権限を解除し、A に通知が届いた | A として読む | 通知は `self` / `stewardship` で、`pointedContent` は店舗 P。`labels` は店舗 P の名称を持つ。行き先は `null` | |
| S1 が、アカウントを持つ利用者 A のメールアドレスを店舗 P の管理メンバーに招待し（招待 I）、A に通知が届いた | A として読む | 通知は `invitee` で、`pointedContent` は店舗 P。`labels` は店舗 P の名称を持つ。行き先は `{ kind: "invitation", target: 店舗 P, invitationId: I }`（招待を開く対象と `InvitationId` の組） | |
| 店舗 P が地域 R から除外された通知を A が受けた後、A が店舗 P の店舗管理者を辞任した | A として読む | その通知は残り、同じ内容で返る。管理権限の有無で絞らない | |
| 公開中の読みもの A1 が紹介する掲載 L が削除され、編集担当者 E に通知が届いた | E として読む | 通知は `editors` / `showcase_changed`（掲載 L の `deleted`）で、`pointedContent` は読みもの A1。`labels` は、読みもの A1 のタイトルを持ち、掲載 L の名称は `null` | |
| 店舗 P への取り下げの申立て Cl が受け付けられ、サービス運営者 O に通知が届いた。その後、P が非公開になった | O として読む | `labels` の Cl の対象の名称は、`ContentDirectory.describe` が返す店舗 P の名称と一致する（閲覧できるかどうかを問わない） | |
| カテゴリー K が移行先をカテゴリー K2 として廃止され、K を保存している掲載を持つ店舗 P の店舗管理者 A に通知が届いた | A として読む | 通知は `categories_reassigned`（`retiredCategoryId` は K）で、`labels` は店舗 P の名称とカテゴリー K の名称を持つ。移行先のカテゴリーとして K2 の `CategoryId` と名称を返す（AC-72） | |
| 上の通知が届いた後、カテゴリー K2 の名称が変更された | A として読む | 移行先のカテゴリーの名称は、変更後の名称になる。通知の `occurrence` は変わらない | |
| その後、カテゴリー K2 が移行先をカテゴリー K3 として廃止された | A として読む | 同じ通知の移行先のカテゴリーは K3 になる。通知の `occurrence` は変わらない | |
| 管理権限の申請の承認で S3 が店舗 P の店舗管理者に加わり、A に通知が届いた | A として読む | `labels` は、店舗 P の名称と、S3 のメールアドレスを持つ | |
| 利用者 A の通知が、1ページの件数より多い | 1ページ目と2ページ目を読む | 2つのページを合わせると、全件が通知を作った日時の新しい順に1回ずつ現れる。`count` はどちらのページでも全件数 | |
| メールが届かなかった通知（`Mailer.send` が失敗した） | 宛先の利用者として読む | その通知を、メールが届いた通知と同じ内容で返す（AC-41） | |
