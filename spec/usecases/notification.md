# Notification のユースケース

ドメイン: Notification（[../domains/notification.md](../domains/notification.md)）

Notification は利用者の書き込みの操作を持たない。通知と申立ての結果のメールは他のドメインのドメインイベントの消費で作られ、利用者は自分に届いた通知を読むだけ。ドメインイベントと出来事の対応、宛先の規則、同じ出来事の見分け方は、ドメインの `Announcements`・`Addressing`・`OccurrenceKey` が持つ。

UnitOfWork の使い方は index.md の「UnitOfWork ポート」による。集約のリポジトリ（`notificationRepository`、`mailDispatchLedger`、事実を読む他のドメインのリポジトリ）は `run` の中で読み書きする。`NotificationMailRenderer`・`Mailer`・Moderation の `ContentDirectory` はコンテナから得て、`run` の外で呼ぶ。

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `deliverNotifications` | 通知する出来事のドメインイベントを消費し、宛先を決め、サービス内の通知を記録して、同じ出来事のメールを送る | ACC-03（通知の表のすべての出来事）、APP-05、MEM-02、OPE-03、EDT-06、MOD-02、MOD-05 / 通知のメール |
| `sendTakedownOutcome` | `takedown_claim.resolved` を消費し、申立人に結果のメールを送る | MOD-01、MOD-02 / 申立ての結果のメール |
| `listNotifications` | ログインしたアカウントに届いた通知を、新しい順で返す | ACC-03、APP-05 / MY-03 |
| `purgeNotificationsOnWithdrawal` | `account.withdrawn` を消費し、そのアカウントの通知をすべて削除する | ACC-04 |

## deliverNotifications

### 概要

notification.md の「消費するドメインイベントと、出来事の対応」の表の P-91〜P-100 の行にあるドメインイベントの消費者。1つのドメインイベントから告知を取り出し、告知ごとに宛先を決め、宛先のアカウントへの通知を記録し、記録がコミットした後に、同じ出来事のメールをすべての宛先に送る（P-90、B-39）。

- 1つのドメインイベントは、0個以上の告知になる。対応の表の条件に当たらないドメインイベントは告知を持たず、何もせずに成功する
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
- `Addressing.resolve`（`audienceOf`・`stewardsOf` を含む）
- `Occurrence.refsOf`
- `Notification.issue`（`OccurrenceKey.of` を含む）
- `NotificationMail.compose`

Notification のポート。

- `NotificationRepository.deliverAll`
- `MailDispatchLedger.findDispatched`（100件ずつ）、`MailDispatchLedger.record`
- `NotificationMailRenderer.render`、`Mailer.send`

告知を取り出すための事実（`AnnouncementFacts`）。

- Occasion の `ParticipationRepository.findByOccasion`（`occasion.cancelled`・`occasion.period_changed`。すべてのページ）
- Listing の `ListingRepository.findById`（`owner` が掲載の `content.photos_taken_down`。その掲載の `placeId` を `ownerListingPlace` にする）
- Listing の `ListingRepository.findPageByPlace`（`place.suspended`、閉店の `place.operating_status_changed`。`shelf` は `{ publication: null, phase: null }`（すべての掲載）、`today` は `Clock` の現在時刻の暦日。すべてのページ）
- Listing の `CategoryCatalogRepository.find`、`CategoryCatalog.predecessorsOf`、`ListingRepository.findPageByCategories`（`category.retired`。`predecessorsOf(catalog, categoryId)` の `CategoryId` の集合を渡し、すべてのページを読む。結果の掲載の `placeId` を、重複を除いて `placesOfRetiredCategory` にする。当たる掲載がなければ、告知を持たず、何もせずに成功する）
- Article の `ArticleRepository.findPublishedByShowcases`（`Announcements.showcaseRefsOf` が空でないドメインイベント。候補のすべてを1回で渡し、すべてのページを読む）

宛先を決めるための事実（`AddressingFacts`）。

- Authority の `StewardshipRepository.findById`（届け先の立場が `stewards`）
- Authority の `RoleRosterRepository.find`（届け先の立場が `role`、`stewards` の `proxy`。保存された名簿がなければ `RoleRoster.initial(role)` が返る）
- Account の `AccountRepository.findByEmail`（届け先の立場が `email`）
- Account の `AccountRepository.findByIds`（宛先のアカウントのメールアドレス。100件ずつ。存在しないアカウントを宛先から外す）

参照の名称（`labels`）。

- 店舗・掲載・地域・イベント・読みもの（`ContentRef`）: Moderation の `ContentDirectory.describe`（100件ずつ）の `name`。出来事の参照、申請の対象、申立て・連絡の対象のどれも、この読み取りだけで解決する
- 申請: `ApplicationRepository.findByIds` で読み、種類と、Application の「申請の対象の名称」の規則による対象ごとの名称（申請の内容から取る名称は、併せた登録申請を含めて `ApplicationRepository.findByIds` で、読んだ時点の対象の名称は `ContentDirectory.describe` で解決する）
- 申立て・連絡: `TakedownClaimRepository.findById`・`InfoReportRepository.findById` で対象を読み、その対象の名称を `ContentDirectory.describe` で解決する
- カテゴリー（`categories_reassigned` の廃止したカテゴリー）: Listing の `CategoryCatalogRepository.find` の台帳にある名称
- アカウント: `AccountRepository.findByIds` のメールアドレス
- 指す先がなければ（`describe` の結果にない対象を含む）、名称は `null`

application 層のポート。

- `Clock`（`createdAt`、`findPageByPlace` に渡す暦日）、`IdGenerator`（`NotificationId`）

### トランザクション境界

`run` を次のように使う。どの `run` も、他のドメインの集約を書き換えず、ドメインイベントを保存しない。

- 事実の読み取り: 最初に、書き込まない `run` を1つ使い、告知を取り出すための事実、宛先を決めるための事実、宛先の候補（管理体制の管理者、名簿の持ち主、招待の宛先のアカウント）のメールアドレス、参照の名称のうちリポジトリから読むものをすべて読む。`ContentRef` の名称は、この `run` の後に `run` の外で `ContentDirectory.describe` で読む。告知の取り出しと宛先の決定は、この `run` の後に行う
- 通知の記録: 告知1つごとに1つの `run`。書き込みは、その告知のすべての宛先のアカウントへの通知の `notificationRepository.deliverAll` だけ
- メール: 通知の記録がコミットした後に、書き込まない `run` で、その告知の宛先の `MailKey` を `mailDispatchLedger.findDispatched` で確かめる。記録のない宛先ごとに、`run` の外で `NotificationMailRenderer.render` の結果を `Mailer.send` に渡す。送信が成立した宛先ごとに、`mailDispatchLedger.record` だけを含む `run` を確定する

複数の告知と、記録とメールは、原子的に確定しない。途中で失敗したときに残る状態は次のとおり。

- 記録の前に失敗: その告知の通知もメールもない。再配送で最初から行う
- 記録がコミットした後、メールの送信の前または途中で失敗: サービス内の通知は届いていて、メールは一部または全部が届いていない。再配送で、通知の記録は何もせず、送信済みの記録のないメールだけが送られる
- 送信が成立した後、送信済みの記録の前に失敗: 再配送で、その宛先に同じメールがもう1通届く
- 一部の告知だけが成立: 成立した告知の通知とメールは残る。再配送で、成立していない告知だけが進む
- 再配送のたびに宛先を決め直す。再配送までに管理者・役割を持つ人が替わっていれば、新しい宛先にも届く。先に届いた通知は取り消さない。記録の後に宛先でなくなったアカウントに、送れていなかったメールは送らない
- メールの送信が成立しないまま、リレーの再配送の上限に達しても、利用者は通知一覧で同じ通知を確かめられる（B-39）
- 配送の順序は保証されない。告知は消費の時点の事実で作るので、先に起きた出来事の通知が後から届くことがある。通知一覧の並びは `createdAt`（通知を作った日時）による

### エラーケース

利用者に返すエラーはない。要件が振る舞いを定めるエラーはない。

## sendTakedownOutcome

### 概要

`takedown_claim.resolved` の消費者。対応済みの申立てを読み、結果のメールを申立人のメールアドレスに送る（MOD-01、MOD-02）。措置を行わなかった申立ての結果も送る。申立てを書き込まない。

冪等。メールのキーは `OccurrenceKey.ofTakedownOutcome(claimId)` と申立人のメールアドレスの組で、`MailDispatchLedger` に送信済みの記録があれば、メールを送らずに成功する。メールを送れなければ消費は失敗になり、リレーが再び配送する。申立ての対応済みは取り消さない。送信の成立の後に送信済みの記録が成立しなかった場合と、消費が同時に重なった場合は、同じメールがもう1通届きうる（少なくとも1回の配送）。

### 入出力

- 入力: ドメインイベント `takedown_claim.resolved`（`claimId`）。`Actor` を取らない
- 出力: なし。消費の成否だけを返す（失敗は例外）

### 使用するドメインの振る舞い・ポート

- Moderation の `TakedownClaimRepository.findById`
- Moderation の `ContentDirectory.describe`（申立ての対象の名称。対象がなければ名称は `null`）
- `TakedownOutcomeMail.compose`（`OccurrenceKey.ofTakedownOutcome` を含む）
- `MailDispatchLedger.findDispatched`、`MailDispatchLedger.record`
- `NotificationMailRenderer.renderTakedownOutcome`、`Mailer.send`

### トランザクション境界

- 最初に、書き込まない `run` を1つ使い、`takedownClaimRepository.findById` で申立てを読み、`TakedownOutcomeMail.compose` のキーを `mailDispatchLedger.findDispatched` で確かめる。対象の名称は `run` の外で `ContentDirectory.describe` で読む
- 記録がなければ、`run` の外で `renderTakedownOutcome` の結果を `Mailer.send` に渡す。送信が成立したら、`mailDispatchLedger.record` だけを含む `run` を確定する
- 申立てを書き込まず、ドメインイベントを保存しない。送信が失敗すると記録の `run` を開かず、申立ては対応済みで、送信済みの記録のないまま残る
- 再配送の上限に達すると、申立ては対応済みのまま、結果のメールは届いていない。送信は DLQ からの再投入で進む

### エラーケース

要件が振る舞いを定めるエラーはない。`takedown_claim.resolved` は対応済みにした申立てにだけ出て、申立ては削除されない。

## listNotifications

### 概要

ログインしたアカウントに届いた通知を、新しい順で返す。複数の管理権限・役割に届いた通知も、1つの並びに現れる。通知ごとに、出来事が持つ参照の名称を補う。合成をまたぐ規則は次のとおり。

- 並び順と件数は Notification が決める。出来事の種類、届いた経路、指す対象が閲覧できるかどうか、宛先が今も管理権限・役割を持つかどうかで絞らない
- 参照の名称は、対象が閲覧できるかどうかを問わず解決する（`deliverNotifications` の「参照の名称」）。指す先がなくなっていれば、名称なし（`null`）で返す
- `categories_reassigned` の通知には、表示の時点の移行先のカテゴリーを添える。通知は移行先を持たず、読むたびに Listing の `CategoryCatalog.resolve(catalog, retiredCategoryId)` で求める。廃止の後に移行先がさらに廃止されていれば、その先の現役のカテゴリーになる
- 通知から進んだ先の可否は、進んだ先の操作が確かめる。このユースケースは確かめない
- 通知から開く行き先は、`NotificationDestination.of` の値で返す。行き先から画面の URL への写しは presentation が行う

### 入出力

- 入力: `Actor`、`Pagination`
- 出力: 通知の並び（出来事と届いた経路、指す対象、管理者が不在の対象、参照の名称、行き先。`categories_reassigned` の通知は、表示の時点の移行先のカテゴリーも）と、そのアカウントの通知の全件数
- 通知が1件もなければ、空の並びと件数 0 を返す
- 他のアカウントの通知を扱う入力はない。通知の宛先は `Actor` から決まる

### 使用するドメインの振る舞い・ポート

- `NotificationRepository.findByRecipient`
- `Occurrence.pointedContent`、`DeliveredOccurrence.vacantTarget`、`NotificationDestination.of`
- `Occurrence.refsOf`
- 参照の名称: `deliverNotifications` の「参照の名称」と同じ読み取り（`ContentRef` の名称は Moderation の `ContentDirectory.describe`）
- 移行先のカテゴリー: Listing の `CategoryCatalogRepository.find`、`CategoryCatalog.resolve`

### トランザクション境界

書き込まない `run` を1つ使い、`notificationRepository.findByRecipient` と、参照の名称・移行先のカテゴリーのリポジトリを読む。`ContentRef` の名称は、`run` の後に `run` の外で `ContentDirectory.describe` で読んで返す。

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

`run` を1つ使う。書き込みは `notificationRepository.removeAllByRecipient`。退会の確定とは別の `run` で、結果整合になる。削除までの間も、退会したアカウントではログインできないため、通知は読まれない。

### エラーケース

要件が振る舞いを定めるエラーはない。
