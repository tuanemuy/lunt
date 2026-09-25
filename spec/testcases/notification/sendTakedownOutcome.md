# sendTakedownOutcome

申立ては Moderation の `submitTakedownClaim` と `resolveTakedownClaim` で用意する。「メールが1通届く」は、`NotificationMailRenderer.renderTakedownOutcome` の結果が `Mailer.send` に1回渡されることを指す。メールのキーは、`OccurrenceKey.ofTakedownOutcome` の申立ての ID と、申立てのメールアドレスの組。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 掲載 L への申立て Cl（メールアドレス M）が、行った措置を結果に添えて対応済みになった。送信済みの記録はない | Cl の `takedown_claim.resolved` を消費する | 消費は成功する。M にメールが1通届く。メールは Cl の対象（掲載 L とその名称）、受け付けた日時、結果を持ち、本文は結果を含み、行き先を持たない。M のキーの送信済みの記録ができる。申立ては書き込まれず、版も変わらない。ドメインイベントは出ない（AC-46） | |
| 申立て Cl が、措置を行わないことを結果に添えて対応済みになった | Cl の `takedown_claim.resolved` を消費する | 消費は成功する。M に結果のメールが1通届き、送信済みの記録ができる | |
| 対応済みの申立て Cl の対象が、対応の後に削除されている | Cl の `takedown_claim.resolved` を消費する | 消費は成功する。メールは Cl の対象の参照を持ち、対象の名称は `null` | |
| 対象が閲覧できない（運営による非公開の）申立て Cl が対応済みになった | Cl の `takedown_claim.resolved` を消費する | 消費は成功する。メールは対象の名称を持つ（閲覧できるかどうかを問わない） | |
| Cl の結果のメールを送り、送信済みの記録がある | 同じ `takedown_claim.resolved` をもう一度消費する | 消費は成功する。`Mailer.send` は呼ばれず、M に届くメールは1通のまま | |
| 対応済みの申立て Cl がある。`Mailer.send` が失敗する | Cl の `takedown_claim.resolved` を消費する | 消費は失敗する（再配送される）。送信済みの記録はない。申立ては対応済みのままで、結果も変わらない | |
| 上の失敗の後、`Mailer.send` が成功するようになった | 同じ `takedown_claim.resolved` をもう一度消費する | 消費は成功する。M にメールが1通届き、送信済みの記録ができる | |
| M のアカウントがあり、同じ M に通知のメールも送っている | Cl の `takedown_claim.resolved` を消費する | M に結果のメールが1通届く。通知のメールの送信済みの記録とキーが重ならず、サービス内の通知は作られない | |
| 閲覧できる掲載がある | `submitTakedownClaim` で申立てを提出し、`takedown_claim.submitted` が配送される | 申立人にメールは送られない（受け付けのメールはない）。サービス運営者への通知は `deliverNotifications` が届ける | |
