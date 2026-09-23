# sendTakedownOutcome

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 行った措置を結果に添えて対応済みになった申立てがある。送信の記録はない | その申立ての `takedown_claim.resolved` を消費する | `TakedownOutcomeMailer.send` が、申立人のメールアドレス（宛先）、対象、受け付けた日時、結果で1回呼ばれる。申立人に結果のメールが1通届く。申立ての `outcomeSentAt` が現在時刻になる（AC-46） | |
| 措置を行わないことを結果に添えて対応済みになった申立てがある | その申立ての `takedown_claim.resolved` を消費する | 同じく、結果のメールが1通届き、送信が記録される | |
| 対応済みの申立ての対象が、対応の後に削除されている | その申立ての `takedown_claim.resolved` を消費する | 成功する。申立てが持つ対象の `ContentRef` を載せて `send` が呼ばれる | |
| 対応済みの申立ての結果のメールを送り、送信を記録している | 同じ `takedown_claim.resolved` をもう一度消費する | 成功する。`send` は呼ばれず、申立人に届くメールは1通のまま。`outcomeSentAt` と版は変わらない | |
| 対応済みの申立てがある。`TakedownOutcomeMailer` が送信を引き受けられない | `takedown_claim.resolved` を消費する | `SystemError` がそのまま返る。申立ては対応済みのままで、結果も変わらず、`outcomeSentAt` は `null` のまま | |
| 上の失敗の後、`TakedownOutcomeMailer` が送信を引き受けられるようになった | 同じ `takedown_claim.resolved` が再び配送され、消費する | 成功する。申立人に結果のメールが1通届き、送信が記録される | |
| 閲覧できる掲載がある | `submitTakedownClaim` で申立てを提出し、`takedown_claim.submitted` が配送される | `TakedownOutcomeMailer.send` は呼ばれない。受け付けのメールは送られない | |
