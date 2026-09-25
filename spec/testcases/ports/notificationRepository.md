# NotificationRepository

契約: [../../domains/notification.md](../../domains/notification.md) の `NotificationRepository`。通知は `Notification.issue` で作った値を `deliverAll` して用意する。書き込みも読み取りも UnitOfWork の中で行う（読み取りは書き込まない `run`）。どの操作も `ConflictError` と `NotFoundError` を返さない。

以下で「キー」は `occurrenceKey` を指す。通知の一意のキーは、`occurrenceKey` と `recipient` の組。

## deliverAll

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| アカウント A の通知がない | A へのキー K1 の通知（`id` は N1、`createdAt` は T1）を `deliverAll` する | 成功する。`findByRecipient` が、`id` N1・`createdAt` T1 の通知を返す | |
| A にキー K1 の通知（N1、T1）がある | A へのキー K1 の通知（`id` は N2、`createdAt` は T2）を `deliverAll` する | 成功する。`ConflictError` にならない。通知は1つのままで、`id` は N1、`createdAt` は T1 のまま。`count` は増えない | |
| A にキー K1 の通知がある | アカウント B へのキー K1 の通知を `deliverAll` する | 成功する。A と B がそれぞれキー K1 の通知を持つ | |
| A にキー K1 の通知がある | A へのキー K2 の通知を `deliverAll` する | 成功する。A はキー K1 とキー K2 の2つの通知を持つ | |
| 通知がない | A・B・C へのキー K1 の通知を、1つの一覧で `deliverAll` する | 成功する。3つのアカウントに1つずつ加わる | |
| A にキー K1 の通知（N1、T1）がある | A へのキー K1 の通知（N2、T2）と、B へのキー K1 の通知（N3、T2）を、1つの一覧で `deliverAll` する | 成功する。A の通知は N1・T1 のまま。B に N3 の通知が加わる | |
| A の通知がある | 空の一覧を `deliverAll` する | 成功する。何も変わらない | |
| 通知がない | 同じ一覧を、2回続けて `deliverAll` する | どちらも成功する。結果は1回目と同じ | |
| 指す先のない `AccountId` を `recipient` とし、指す先のない `ListingId` を出来事に持つ通知 | `deliverAll` する | 成功する。宛先のアカウントと、出来事が指す先があることを、保存の条件にしない | |
| 店舗管理者が不在の店舗の出来事の `proxy` の通知と、`direct` の通知 | `deliverAll` して `findByRecipient` で読む | どちらも、`occurrence`・`delivery`・`occurrenceKey`・`recipient`・`createdAt` が、書いた値のまま返る。`proxy` の通知の `DeliveredOccurrence.vacantTarget` は、その店舗 | |
| `Occurrence` の宛先の立場（`applicant`、`approver`、`placeStewards`、`regionStewards`、`occasionStewards`、`contentManagers`、`editors`、`operators`、`invitee`、`grantee`、`self`）ごとの通知 | それぞれ `deliverAll` して `findByRecipient` で読む | どの立場の通知も、事柄と、事柄が持つ ID・メールアドレスを含めて、書いた値のまま返る。`placeStewards` は店舗の事柄と掲載の事柄の、`contentManagers` は店舗・掲載（`placeId` を含む）・地域・イベント・読みものの対象の、どれも書いた値のまま返る | |

## removeAllByRecipient

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A が3件、B が2件の通知を持つ | A で `removeAllByRecipient` する | A の通知が0件になる。B の2件は残る | |
| A の通知がない | A で `removeAllByRecipient` する | 成功する。何も変わらない | |
| A の通知を `removeAllByRecipient` で削除した | もう一度 A で `removeAllByRecipient` する | 成功する。何も変わらない | |
| A と B がキー K1 の通知を1つずつ持つ | A で `removeAllByRecipient` する | A の通知だけがなくなる。B のキー K1 の通知は残る | |
| A のキー K1 の通知を `removeAllByRecipient` で削除した | A へのキー K1 の通知（N2、T2）を `deliverAll` する | 成功する。新しい通知として加わり、`id` は N2、`createdAt` は T2 | |

## findByRecipient

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の通知が3件。`createdAt` は T1 < T2 < T3 | 読む | T3、T2、T1 の順に返す | |
| A の通知に、`createdAt` が同じ通知が2件 | 読む | `id` の昇順に返す | |
| A と B が通知を持つ | A で読む | A の通知だけを返す。`count` は A の件数 | |
| A の通知に、`direct` と `proxy`、出来事の種類の違う通知、指す先のない対象の通知がある | 読む | すべて返す。出来事の種類、届いた経路、指す対象が閲覧できるかどうかで絞らない | |
| A の通知が0件 | `page: 1, limit: 10` で読む | `items` は空、`count` は 0 | |
| A の通知が1件 | `page: 1, limit: 10` で読む | `items` は1件、`count` は 1 | |
| A の通知が10件 | `page: 1, limit: 10` で読む | `items` は10件、`count` は 10 | |
| A の通知が10件 | `page: 2, limit: 10` で読む | `items` は空、`count` は 10 | |
| A の通知が11件 | `page: 1, limit: 10` と `page: 2, limit: 10` で読む | 1ページ目は新しい順の先頭10件、2ページ目は最も古い1件。重なりも抜けもない。`count` はどちらも 11 | |

## 並行性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| A の通知がない | A へのキー K1 の通知の `deliverAll`（N1 と N2）を、2つの UnitOfWork で同時に実行する | どちらも成功し、`ConflictError` にならない。A のキー K1 の通知は1つになる（`id` は N1 か N2 のどちらか） | |
| 通知がない | A・B へのキー K1 の通知の一覧と、B・C へのキー K1 の通知の一覧の `deliverAll` を、2つの UnitOfWork で同時に実行する | どちらも成功する。A・B・C に、キー K1 の通知が1つずつある | |
| A にキー K1 の通知がある | A の `removeAllByRecipient` と、A へのキー K2 の通知の `deliverAll` を、2つの UnitOfWork で同時に実行する | どちらも成功し、`ConflictError` にならない。キー K1 の通知はない。キー K2 の通知は、あるか、ないかのどちらか | |
| A の通知がある | A の `removeAllByRecipient` を、2つの UnitOfWork で同時に実行する | どちらも成功する。A の通知はない | |

## 可視性と UnitOfWork

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| UnitOfWork の中で `deliverAll` し、コミットした | コミットの直後に `findByRecipient` で読む | 即座に反映されている | |
| UnitOfWork の中で `removeAllByRecipient` し、コミットした | コミットの直後に `findByRecipient` で読む | 即座に反映されている | |
| 通知がない | UnitOfWork の中で A・B・C への通知を `deliverAll` し、その後に例外を投げる | どのアカウントの `findByRecipient` も空。1件も残らない | |
| A にキー K1 の通知がある | UnitOfWork の中で、A へのキー K1 の通知と B へのキー K1 の通知を `deliverAll` し、その後に例外を投げる | A の通知は元のまま。B の通知はない | |
| A の通知が3件 | UnitOfWork の中で `removeAllByRecipient` し、その後に例外を投げる | 3件とも残る | |
