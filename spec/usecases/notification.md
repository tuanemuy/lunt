# Notification のユースケース

ドメイン: Notification（[../domains/notification.md](../domains/notification.md)）

Notification は利用者の書き込みの操作を持たない。通知は他のドメインのドメインイベントの消費で作られ、利用者は自分に届いた通知を読むだけ。ドメインイベントと出来事の対応、宛先の規則、同じ出来事の見分け方は、ドメインの `Announcements`・`Addressing`・`OccurrenceKey` が持つ。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `deliverNotifications` | 通知する出来事のドメインイベントを消費し、宛先を決め、サービス内の通知を記録して、同じ出来事のメールを送る | ACC-03（通知の表のすべての出来事）、APP-05、MEM-02、OPE-03、EDT-06、MOD-02、MOD-05 / 通知のメール |
| `listNotifications` | ログインしたアカウントに届いた通知を、新しい順で返す | ACC-03、APP-05 / MY-03 |
| `purgeNotificationsOnWithdrawal` | `account.withdrawn` を消費し、そのアカウントの通知をすべて削除する | ACC-04 |

## deliverNotifications

### 概要

notification.md の「消費するドメインイベントと、出来事の対応」の表にあるドメインイベント（`account.withdrawn` を除く）の消費者。1つのドメインイベントから告知を取り出し、告知ごとに宛先を決め、宛先のアカウントへの通知を記録し、記録がコミットした後に、同じ出来事のメールをすべての宛先に送る（P-90、B-39）。

- 1つのドメインイベントは、0個以上の告知になる。条件に当たらないドメインイベント（招待の承諾による就任、辞任・退会による解除、閉店でない営業状況の変更、イベント運営者による参加内容の変更、離脱の承認による所属の解除）は、告知を持たず、何もせずに成功する
- 宛先は、消費の時点の管理体制・名簿で決める。存在しないアカウントは宛先から外す。宛先が0人の告知（編集担当者が0人、就任した人のほかに店舗管理者がいない、サービス運営者の名簿が開設前でサービス運営者宛てまたは `proxy` の宛先がいない）は、記録もメールもなく成立する
- アカウントのないメールアドレスへの招待は、サービス内の通知を持たず、メールだけが届く
- 1つの宛先への送信の失敗で他の宛先への送信を止めず、1つの告知の失敗で他の告知の処理を止めない。すべての告知の記録と送信が成立したときだけ、消費は成功になる。1つでも失敗すれば消費は失敗になり、リレーが同じドメインイベントを再び配送する

冪等。同じドメインイベントを重ねて消費すると、同じ告知は同じ `occurrenceKey` になる。通知は `NotificationRepository.deliverAll` が同じキーの2回目を何もせずに成功にし、メールは `MailDispatchLedger` に送信済みの記録があるキーを送らない。消費の前にドメインイベントを処理済みとして記録しない。失敗した消費の続き（送信済みの記録のないメールの送信）は、再配送が行う。メールは少なくとも1回の配送で、送信の成立の後に送信済みの記録が成立しなかった場合と、同じドメインイベントの消費が同時に重なった場合は、同じメールがもう1通届きうる。サービス内の通知は重複しない。

### 入出力

- 入力: ドメインイベント（`NotifiableEvent`。ドメインイベントの ID、型、ペイロード、`occurredAt`）。`Actor` を取らない
- 出力: なし。消費の成否だけを返す（失敗は例外）

### 使用するドメインの振る舞い・ポート

Notification の振る舞い。

- `Announcements.showcaseRefsOf`、`Announcements.from`
- `Addressing.audienceOf`、`Addressing.resolve`
- `Occurrence.refsOf`
- `Notification.issue`（`OccurrenceKey.of` を含む）
- `NotificationMail.compose`

Notification のポート。

- `NotificationRepository.deliverAll`
- `MailDispatchLedger.findDispatched`（100件ずつ）、`MailDispatchLedger.record`
- `NotificationMailRenderer.render`、`Mailer.send`

告知を取り出すための事実（`AnnouncementFacts`）。

- Occasion の `ParticipationRepository.findByOccasion`（`occasion.cancelled`・`occasion.period_changed`。すべてのページ）
- Listing の `ListingRepository.findPageByPlace`（`place.suspended`、閉店の `place.operating_status_changed`。`shelf` は `null`、`today` は `Clock` の現在時刻の暦日。すべてのページ）
- Listing の `CategoryCatalogRepository.find`、`CategoryCatalog.predecessorsOf`、`ListingRepository.findPageByCategories`（`category.retired`。`predecessorsOf(catalog, categoryId)` の `CategoryId` の集合を渡し、すべてのページを読む。結果の掲載の `placeId` を、重複を除いて `placesOfRetiredCategory` にする。当たる掲載がなければ、告知を持たず、何もせずに成功する）
- Article の `ArticleRepository.findPublishedByShowcases`（`Announcements.showcaseRefsOf` が空でないドメインイベント。候補を100件ずつ、すべてのページ）

宛先を決めるための事実（`AddressingFacts`）。

- Authority の `StewardshipRepository.findById`（`Audience` が `stewards`）
- Authority の `RoleRosterRepository.find`（`Audience` が `role`、`stewards` の `proxy`。保存された名簿がなければ `RoleRoster.initial(role)` が返る）
- Account の `AccountRepository.findByEmail`（`Audience` が `email`）
- Account の `AccountRepository.findByIds`（宛先のアカウントのメールアドレス。100件ずつ。存在しないアカウントを宛先から外す）

参照の名称（`labels`）。

- 店舗・掲載・地域・イベント: `PlaceRepository`・`ListingRepository`・`RegionRepository`・`OccasionRepository` の `findByIds`（100件ずつ）
- 読みもの: `ArticleRepository.findById`
- 申請: `ApplicationRepository.findByIds` で読み、種類と、`Application.subjects` の対象の名称（上の読み取りで解決する）。対象がまだない申請は、申請の内容から取る。店舗の登録申請は `content`（`PlaceProfile`）の店名、掲載の申請は `content`（`PublishableListingContent`）の名称と店舗の名称、登録申請に併せた管理権限の申請は、`target.registrationId` の登録申請（`ApplicationRepository.findByIds`）の `content`（`PlaceProfile`）の店名
- 申立て・連絡: `TakedownClaimRepository.findById`・`InfoReportRepository.findById` で読み、その対象の名称（上の読み取りで解決する）
- カテゴリー（`categories_reassigned` の廃止したカテゴリー）: Listing の `CategoryCatalogRepository.find` の台帳にある名称
- アカウント: `AccountRepository.findByIds` のメールアドレス
- 指す先がなければ、名称は `null`

application 層のポート。

- `Clock`（`createdAt`、`findPageByPlace` に渡す暦日）、`IdGenerator`（`NotificationId`）

### トランザクション境界

UnitOfWork を使う。告知1つごとに1つの UnitOfWork で、スコープに含まれる書き込みは、その告知のすべての宛先のアカウントへの通知の `notificationRepository.deliverAll` だけ。他のドメインの集約を書き換えず、ドメインイベントを保存しない。事実の読み取りと宛先の決定は、スコープの前に終える。

メールは、通知の記録がコミットした後に、スコープの外で送る。その告知の宛先の `MailKey` を `MailDispatchLedger.findDispatched` で確かめ、記録のない宛先ごとに `NotificationMailRenderer.render` の結果を `Mailer.send` に渡す。送信が成立した宛先ごとに、`mailDispatchLedger.record` だけを含む UnitOfWork を確定する。

複数の告知と、記録とメールは、原子的に確定しない。途中で失敗したときに残る状態は次のとおり。

- 記録の前に失敗: その告知の通知もメールもない。再配送で最初から行う
- 記録がコミットした後、メールの送信の前または途中で失敗: サービス内の通知は届いていて、メールは一部または全部が届いていない。再配送で、通知の記録は何もせず、送信済みの記録のないメールだけが送られる
- 送信が成立した後、送信済みの記録の前に失敗: 再配送で、その宛先に同じメールがもう1通届く
- 一部の告知だけが成立: 成立した告知の通知とメールは残る。再配送で、成立していない告知だけが進む
- 再配送のたびに宛先を決め直す。再配送までに管理者・役割を持つ人が替わっていれば、新しい宛先にも届く。先に届いた通知は取り消さない。記録の後に宛先でなくなったアカウントに、送れていなかったメールは送らない

### エラーケース

利用者に返すエラーはない。要件が振る舞いを定める失敗は次のとおり。

| 条件 | 振る舞い |
| --- | --- |
| メールの送信が引き受けられない（`Mailer.send` の `SystemError`） | サービス内の通知は残り、消費は失敗になる。リレーの再配送の上限に達しても、利用者は通知一覧で同じ通知を確かめられる（B-39） |

## listNotifications

### 概要

ログインしたアカウントに届いた通知を、新しい順で返す。複数の管理権限・役割に届いた通知も、1つの並びに現れる。通知ごとに、出来事が持つ参照の名称を補う。合成をまたぐ規則は次のとおり。

- 並び順と件数は Notification が決める。出来事の種類、届いた経路、指す対象が閲覧できるかどうか、宛先が今も管理権限・役割を持つかどうかで絞らない
- 参照の名称は、対象が閲覧できるかどうかを問わず、各ドメインの管理側の読み取りから解決する。指す先がなくなっていれば、名称なし（`null`）で返す
- `categories_reassigned` の通知には、表示の時点の移行先のカテゴリーを添える。通知は移行先を持たず、読むたびに Listing の `CategoryCatalog.resolve(catalog, retiredCategoryId)` で求める。廃止の後に移行先がさらに廃止されていれば、その先の現役のカテゴリーになる
- 通知から進んだ先の可否は、進んだ先の操作が確かめる。このユースケースは確かめない

### 入出力

- 入力: `Actor`、`Pagination`
- 出力: 通知の並び（出来事、届いた経路、指す対象（`pointedContent`）、管理者が不在の対象（`vacantTarget`）、参照の名称（`labels`）、通知を作った日時。`categories_reassigned` の通知は、移行先のカテゴリーの `CategoryId` と名称も）と、そのアカウントの通知の全件数
- 通知が1件もなければ、空の並びと件数 0 を返す
- 他のアカウントの通知を扱う入力はない。通知の宛先は `Actor` から決まる

### 使用するドメインの振る舞い・ポート

- `NotificationRepository.findByRecipient`
- `Notification.pointedContent`、`Notification.vacantTarget`
- `Occurrence.refsOf`
- 参照の名称: `deliverNotifications` の「参照の名称」と同じ読み取り
- 移行先のカテゴリー: Listing の `CategoryCatalogRepository.find`、`CategoryCatalog.resolve`

### トランザクション境界

UnitOfWork は不要。読み取りだけを行う。

### エラーケース

| 条件 | 種類 |
| --- | --- |
| ログインしていない | `UnauthorizedError` |

## purgeNotificationsOnWithdrawal

### 概要

`account.withdrawn` の消費者。退会したアカウントの通知をすべて削除する。

冪等。`removeAllByRecipient` は、通知が1件もなければ何もしないので、重ねて受けても結果は同じになる。退会の後に同じメールアドレスで作られるアカウントは別の `AccountId` を持ち、以前の通知を引き継がない。削除の後に、退会したアカウントを宛先にする告知が消費されても、`deliverNotifications` は存在しないアカウントを宛先から外す。

### 入出力

- 入力: ドメインイベント `account.withdrawn`（`accountId`）。`Actor` を取らない
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `NotificationRepository.removeAllByRecipient`

### トランザクション境界

UnitOfWork を使う。スコープに含まれる書き込みは `notificationRepository.removeAllByRecipient`。退会の確定とは別の UnitOfWork で、結果整合になる。削除までの間も、退会したアカウントではログインできないため、通知は読まれない。

### エラーケース

要件が振る舞いを定めるエラーはない。
