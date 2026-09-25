# Media のユースケース

ドメイン: Media（[../domains/media.md](../domains/media.md)）

| 名前 | 説明 | 実現する |
| --- | --- | --- |
| `registerPhoto` | ログインした利用者が、同意を確かめて写真を1枚登録する | LST-02、LST-12、LST-13、LST-15、MOD-03、SHP-03、SHP-06、SHP-08、SHP-12、SHP-13、REG-06、REG-12、EVT-04、EVT-12、EDT-01、EDT-04、APP-02、APP-04 / CF-01（SM-02、SM-04、RM-02、EM-02、AM-02、RQ-02、RQ-04） |
| `duplicatePhotos` | 掲載の複製と、終わった申請からの再申請のために、元の写真を複製する。他のユースケースの中から呼ぶ手続きで、転送境界から呼ばない | LST-09、APP-04 |
| `discardReleasedPhotos` | `photos.released` を消費し、手放された写真を破棄して削除する | LST-02、LST-06、LST-10、SHP-06、SHP-13、REG-06、EVT-04、EDT-04、MOD-02、APP-02、APP-07 |
| `sweepUnownedPhotos` | 日次のジョブ。持ち主のない写真と、削除の途中で残った写真を削除する | LST-01、LST-02、LST-12 |

持ち主の設定と付け替え（`PhotoOwnership`）、表示用の参照の取得（`PhotoStorage.displayRefs`）は、写真を載せるドメインと、写真を返す読み取りのユースケースが行う。

## registerPhoto

### 概要

ログインした利用者が、写真の権利と Lunt での利用への同意を確かめて、写真を1枚登録する。同意のない登録と、写真として扱えないファイルを拒否し、理由を返す。登録した写真は持ち主を持たず、写真を載せた集約または申請の保存・提出が持ち主を設定する。

冪等な作成。同じ `PhotoId` の写真があれば、`PhotoAsset.isResendOf`（登録した人とファイルの要約が等しい）で送り直しかどうかを決める。送り直しなら、`accepted` の写真は実体を置くところから続け、`stored` の写真は書き込みなしに成功として扱う。送り直しでない写真（登録した人かファイルが違う）と、`discarded` の写真（破棄されて削除を待っている）は `ConflictError`。記録を削除した写真の `PhotoId` も、`insert` が `ConflictError` になり、写真は戻らない。

### 入出力

- 入力: `Actor`、呼び出し側が決めた `PhotoId`、ファイルのバイト列、同意したかどうか
- 出力: なし（成立すると、写真は持ち主を持たない `stored` で、集約・申請に載せられる）
- 写真の形式は、利用者が申告した値ではなく、ファイルの中身から判定した値を使う
- 操作の可否を確かめない。ログインしたどの利用者も登録できる

### 使用するドメインの振る舞い・ポート

- `PhotoConsent.agree`
- `PhotoInspector.inspect`
- `PhotoIntake.accept`
- `PhotoAsset.register`、`PhotoAsset.isResendOf`、`PhotoAsset.markStored`
- `PhotoAssetRepository.findById`、`insert`、`save`
- `PhotoStorage.put`、`PhotoStorage.delete`（2つ目の UnitOfWork で写真が破棄されていたとき）
- `Clock`

### トランザクション境界

UnitOfWork を2つ使う。写真の実体は UnitOfWork に入らない。

- 同意とファイルの確認は、どの書き込みよりも先に行う。送り直しでも確かめる
- 1つ目の UnitOfWork: `photoAssetRepository.findById`。写真がなければ `accepted` の記録を `insert` する（記録を削除した写真の `PhotoId` なら、`insert` が `ConflictError`）。あれば冪等な作成の判定（`isResendOf` と段階）で、続けるか、書き込みなしに成功とするか、`ConflictError` にするかを決める
- `PhotoStorage.put`
- 2つ目の UnitOfWork: 写真を `findById` で読み直し、`accepted` なら `markStored` の結果を `save` する（すでに `stored` なら書き込まない）。読み直した写真が `discarded` またはない（`put` の間に掃除が破棄した）なら書き込まずに終え、`put` で置いた実体を `PhotoStorage.delete` で削除してから `ConflictError` を返す（掃除の削除より後に置いた実体を、記録のないまま残さない）
- `put` 以降が失敗した写真は、`accepted` の記録のまま残る。同じ `PhotoId` の送り直しが `put` から続ける。送り直されなければ `sweepUnownedPhotos` が削除する

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 同意していない | `BusinessRuleError`（`MEDIA_INVALID_CONSENT`）。写真は登録されない |
| 静止画として読めないファイル（動画、壊れたファイル、画像でないファイル） | `BusinessRuleError`（`MEDIA_NOT_A_PHOTO`） |
| 同じ `PhotoId` の写真を、別の人が登録している、または同じ人が別のファイルで登録している | `ConflictError` |
| 同じ `PhotoId` の写真が `discarded` になっている | `ConflictError` |
| 同じ `PhotoId` の写真の記録が削除されている | `ConflictError`。写真は戻らない |
| 実体を置いている間に、写真が掃除で破棄された | `ConflictError`。置いた実体は削除される |

## duplicatePhotos

### 概要

掲載の複製と、否認・取り下げ・失効で終わった申請からの再申請のために、元の写真の実体と同意を引き継いだ新しい写真を作り、元の `PhotoId` から新しい `PhotoId` への対応を返す。使う側は、Listing の `duplicateListing`（新しい掲載を書き込む前）と、Application の `prepareReapplication`（終わった申請の写真を、再申請の入力に使う写真として複製する）。複製した写真は `accepted` の記録と実体を持ち、持ち主を持たない。`markStored` は呼び出したユースケースが行い、持ち主の設定は写真を載せる掲載・申請の書き込みと同じ UnitOfWork で行う。同意は元の写真の同意を引き継ぎ、求め直さない。

他のユースケース（`duplicateListing`・`prepareReapplication`）の中から呼ぶ手続きで、転送境界から呼ばない。可否を自分で確かめないので、単独の入口にすると、ログインしたどの利用者も他人の写真を自分を登録した人として複製できてしまう。

元の写真と、元の写真の持ち主（元の掲載、終わった申請）は変わらない。複製した写真の登録した人は複製を行う人なので、持ち主の設定（`claim`）も同じ人の操作で行う。

### 入出力

- 入力: `Actor`（複製を行う人）、元の写真の `PhotoId` の一覧（0件なら空の対応を返す）
- 出力: 元の `PhotoId` から新しい `PhotoId` への対応
- 新しい `PhotoId` は `IdGenerator` で決める
- 操作の可否は、呼び出したユースケースが、呼ぶ前に確かめる

### 使用するドメインの振る舞い・ポート

- `PhotoAssetRepository.findByIds`（100件を超える ID は、100件ずつに分けて呼ぶ）、`insert`
- `PhotoAsset.duplicate`（`findByIds` の結果にない元の写真は `null` で渡す）
- `PhotoStorage.copy`
- `Clock`、`IdGenerator`

### トランザクション境界

UnitOfWork を1つ使う。写真の実体は UnitOfWork に入らない。

- UnitOfWork: 元の写真の `findByIds` と、元の写真ごとの `duplicate` の記録の `insert`。1件でも `duplicate` が成立しない、または `insert` が失敗すれば、記録は1件も残らず、`PhotoStorage.copy` は行わない
- コミットの後に、写真ごとに `PhotoStorage.copy`
- `copy` が途中で失敗すると、複製の記録は `accepted` のまま残り、対応を返さない。残った記録と実体は `sweepUnownedPhotos` が削除する。呼び出したユースケースが成立しなかった場合も同じ

### エラーケース

| 条件 | 種類 |
| --- | --- |
| 元の写真の記録がない、または元の写真が `stored` でない（複製の前に掲載から外されて破棄された） | `BusinessRuleError`（`MEDIA_DUPLICATE_SOURCE_UNAVAILABLE`） |

元の掲載・申請の有無（LST-09 の異常系など）は、呼び出したユースケースが確かめる。

## discardReleasedPhotos

### 概要

`photos.released` の消費者。写真を持つ集約と申請が手放した写真を破棄し、実体と記録を削除する。削除した写真は戻せない。

冪等。配送は少なくとも1回で順序を保証しないので、写真の段階から続きを決める。記録のない写真は削除済みとして扱い、`discarded` の写真は実体の削除から続ける。同じ `photoIds` を何度受けても結果は同じになる。

写真1枚の失敗は、他の写真の破棄と削除を妨げない。1枚でも削除まで進まなかった写真があれば、残りの写真を処理した後に、消費を失敗として終えて再配送を求める。再配送は、残った写真だけを進める。

### 入出力

- 入力: ドメインイベント `photos.released`（`photoIds`）。`Actor` を取らない
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `PhotoAssetRepository.findById`、`save`、`delete`
- `PhotoAsset.discard`
- `PhotoStorage.delete`

### トランザクション境界

写真1枚ごとに UnitOfWork を2つ使う。写真の実体は UnitOfWork に入らない。

- 1つ目の UnitOfWork: 写真を `findById` で読み、記録がなければ削除済みとして終える。`accepted`・`stored` なら `discard` の結果を `save` し、`discarded` ならそのまま次へ進む
- `PhotoStorage.delete`
- 2つ目の UnitOfWork: 記録を `findById` で読み直し、その版で `delete`
- `PhotoStorage.delete` 以降が失敗した写真は、`discarded` の記録のまま残る。`photos.released` の再配送、または `sweepUnownedPhotos` が、実体の削除から続ける
- 写真1枚の失敗は、他の写真の破棄と削除を妨げない。失敗した写真があれば、消費は失敗として終わる

### エラーケース

要件が振る舞いを定めるエラーはない。一部の写真が削除まで進まなかった消費は、失敗として終えて再配送を求める。

## sweepUnownedPhotos

### 概要

日次のジョブ。登録から一定の期間（`PhotoPolicy.unownedRetentionMs`）を過ぎても持ち主が設定されていない写真を破棄して削除し、`discarded` のまま残った写真の削除を続ける。

冪等。削除した写真と、持ち主が設定された写真は掃除の対象から外れるので、何度実行しても、載っている写真は削除されない。持ち主の設定と競合した写真は、楽観ロックで破棄が成立せず、実体は削除されない。

### 入出力

- 入力: スケジュール（実行の時刻は `Clock`）。`Actor` を取らない
- 出力: なし

### 使用するドメインの振る舞い・ポート

- `PhotoPolicy.sweepBefore`（実行の時刻で1回求め、`findPageSweepable` の `registeredBefore` と `isAbandoned` の両方に渡す）
- `PhotoAssetRepository.findPageSweepable`、`findById`、`save`、`delete`
- `PhotoAsset.isAbandoned`、`PhotoAsset.discard`
- `PhotoStorage.delete`
- `Clock`（`PhotoPolicy` は設定値）

### トランザクション境界

ページの読み取りに読み取りだけの UnitOfWork を1つ使い、写真1枚ごとに、`discardReleasedPhotos` と同じ2つの UnitOfWork を使う。

- 写真1枚ごとの1つ目の UnitOfWork で、写真を `findById` で読み直し、`isAbandoned` と段階を確かめ直す。読み直した写真に持ち主が設定されていれば、何もせずに次へ進む
- `isAbandoned` の写真は、`discard` の `save`、`PhotoStorage.delete`、記録の `delete` の順に進める。`discarded` の写真は `PhotoStorage.delete` から続ける
- 先頭のページを読み直して進める。読んだページの全件が失敗したら打ち切り、残りは次の実行が続ける
- 写真1枚の失敗は、他の写真の掃除を妨げない。途中で失敗した写真は `discarded` の記録のまま残り、次の実行が続ける

### エラーケース

要件が振る舞いを定めるエラーはない。持ち主の設定との競合（`ConflictError`）は、その写真を飛ばして続ける。
