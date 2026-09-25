# Media

登録された写真の実体と、権利と利用への同意、持ち主、削除までのライフサイクルを管理する。

共有カーネルの `PhotoId`・`AccountId`・`PhotoOwnerRef`・`ContentRef`・`ApplicationId`・`PhotosReleasedEvent`・`Actor` を使う（[index.md](index.md)）。他のドメインに依存しない。写真を持つドメインは `PhotoId` だけを持ち、このドメインの型を参照しない。

- 写真の並び順、代表写真、見せる範囲は、写真を載せる側の集約が持つ（`PhotoSet`、Listing の `Framing`）。Media は1枚ごとの写真だけを扱う
- 写真を載せられる対象は、掲載・店舗・地域・イベント・読みものと、申請（B-41、I-06）。動画は扱わない

## ユビキタス言語

| 英語名 | 日本語名 | 定義 |
| --- | --- | --- |
| PhotoAsset | 写真 | 登録された1枚の写真の記録。登録した人、同意の日時、持ち主、実体の段階を持つ |
| Registrant | 登録した人 | 写真を登録する操作を行い、同意したアカウント。複製した写真では、複製を行ったアカウント（同意は元の写真から引き継ぐ） |
| PhotoConsent | 同意 | 自ら撮影した写真または利用の許諾を得た写真であることと、Lunt での利用への同意。登録の操作のたびに確かめる（M-37、B-53） |
| Owner | 持ち主 | 写真を載せている集約または申請。`PhotoOwnerRef`。1つの写真に1つ以下 |
| Claim | 持ち主の設定 | 持ち主のない写真に、最初の持ち主を設定すること |
| Transfer | 持ち主の付け替え | 申請の承認で、申請が持ち主の写真のすべての持ち主を、申請から反映先の集約に替えること |
| Duplicate | 複製 | 掲載の複製（Listing の `duplicateListing`）と、否認・取り下げ・失効で終わった申請からの再申請（Application の `prepareReapplication`）のために、写真の実体と同意を引き継いだ新しい写真を作ること。同意を求め直さない。複製した写真は、新しい掲載・申請が持ち主になる |
| Release | 解放 | 持ち主が写真を手放したこと。`photos.released` で伝わる |
| Discard | 破棄 | 写真を削除の対象にすること。破棄した写真は載せられず、実体と記録が削除される |
| Abandoned | 持ち主のない写真 | 登録から一定の期間（設定値）を過ぎても持ち主が設定されていない写真 |
| PhotoFile | 写真のファイル | 登録のときに受け取る、写真の実体のバイト列と形式と要約 |
| PhotoDigest | ファイルの要約 | 写真のファイルのバイト列から求める値。登録の送り直しが同じファイルかどうかを決める |
| PhotoDisplayRef | 表示用の参照 | 閲覧者と管理する人の画面が、写真の実体を取得するための参照 |
| PhotoPolicy | 写真の設定値 | 持ち主のない写真を残す期間 |

## エンティティ

### PhotoAsset

集約ルート。実体の段階ごとの直和型で、実体のない写真に持ち主がいる状態と、破棄した写真に持ち主がいる状態を型で表せなくする。

```ts
type PhotoAssetBase = Readonly<{
  id: PhotoId;
  registeredBy: AccountId;   // 登録した人
  consentedAt: Date;         // 同意の日時
  digest: PhotoDigest;       // ファイルの要約。複製した写真では元の写真の値
  registeredAt: Date;
  version: Version;
}>;

type AcceptedPhoto = PhotoAssetBase & Readonly<{ stage: "accepted" }>;

type StoredPhoto = PhotoAssetBase & Readonly<{
  stage: "stored";
  owner: PhotoOwnerRef | null;
}>;

type DiscardedPhoto = PhotoAssetBase & Readonly<{ stage: "discarded" }>;

type PhotoAsset = AcceptedPhoto | StoredPhoto | DiscardedPhoto;
```

| 段階 | 意味 |
| --- | --- |
| `accepted` | 同意とファイルの確認を終えて受け付けた。実体はまだ置かれていない |
| `stored` | 実体が `PhotoStorage` に置かれている。持ち主を設定でき、表示できる |
| `discarded` | 削除の対象。実体の削除と記録の削除を待っている |

#### 振る舞い

すべて純粋な関数。`version` の進み方は index.md「リポジトリの共通の契約」による。Media はドメインイベントを出さないので、戻り値は次の状態のエンティティ。

| メソッド | 引数 | 戻り値 | 処理 |
| --- | --- | --- | --- |
| `reconstruct` | 保存された値 | `PhotoAsset` | 値オブジェクトを通して組み立て直す。段階ごとの形を欠く値（`stored` でない写真が持ち主を持つなど）は `RehydrationError` |
| `register` | `params: { id: PhotoId; registrant: Actor; consent: PhotoConsent; file: PhotoFile }, now: Date` | `AcceptedPhoto` | 写真を受け付ける。`registeredBy` は `registrant.accountId`、`consentedAt` は `consent.agreedAt`、`digest` は `file.digest`、`registeredAt` は `now`。`PhotoConsent` は同意がなければ作れないので、同意のない登録は成立しない |
| `duplicate` | `source: PhotoAsset \| null, params: { id: PhotoId; by: Actor }, now: Date` | `AcceptedPhoto` | 複製した写真を受け付ける。`source` が `null`（元の写真の記録がない）、または `stored` でなければ `BusinessRuleError`（`MEDIA_DUPLICATE_SOURCE_UNAVAILABLE`）。`consentedAt` と `digest` は `source` の値を引き継ぐ（同じ写真への同意。複製で同意を求め直さない）。`registeredBy` は `by.accountId`、`registeredAt` は `now`。`source` は変わらず、持ち主も変わらない |
| `isResendOf` | `photo: PhotoAsset, params: { registrant: Actor; file: PhotoFile }` | `boolean` | 同じ `PhotoId` の登録の要求が、`photo` を作った登録の送り直しかどうか。`registeredBy` が `registrant.accountId` に等しく、`digest` が `file.digest` に等しければ `true`（冪等な作成の「同じ内容」） |
| `markStored` | `photo: AcceptedPhoto` | `StoredPhoto` | 実体が置かれたことを記録する。`owner` は `null` |
| `claim` | `photo: PhotoAsset, owner: PhotoOwnerRef, by: Actor` | `StoredPhoto` | 最初の持ち主を設定する。`stored` でなければ `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`）。持ち主がすでにあれば、同じ持ち主でも `BusinessRuleError`（`MEDIA_PHOTO_ALREADY_OWNED`）。`by.accountId` が `registeredBy` と違えば `BusinessRuleError`（`MEDIA_PHOTO_NOT_REGISTRANT`） |
| `transfer` | `photo: PhotoAsset, from: { kind: "application"; id: ApplicationId }, to: ContentRef` | `StoredPhoto` | 持ち主を申請から反映先の集約に替える。`stored` でない、または現在の持ち主が `from` と一致しなければ `BusinessRuleError`（`MEDIA_PHOTO_OWNER_MISMATCH`） |
| `discard` | `photo: AcceptedPhoto \| StoredPhoto` | `DiscardedPhoto` | 破棄する。持ち主の有無を問わない |
| `isAbandoned` | `photo: PhotoAsset, sweepBefore: Date` | `boolean` | `accepted`、または持ち主のない `stored` で、`registeredAt` が `sweepBefore`（`PhotoPolicy.sweepBefore` の値）より前なら `true` |

#### 不変条件

- 同意のない写真は存在しない。`registeredBy` と `consentedAt` は生成の後は変わらない
- 持ち主を持てるのは `stored` の写真だけ。1つの写真の持ち主は常に1つ以下
- 最初の持ち主を設定できるのは、その写真の登録した人（複製した写真では複製を行った人）の操作だけ。集約と申請に載る写真は、同意のある写真だけ（複製した写真は元の写真の同意を引き継ぐ）
- 持ち主が設定された写真に、`claim` で別の持ち主も同じ持ち主も設定し直せない。持ち主が手放した写真は、どの集約にも載せ直せない
- 持ち主が替わるのは、申請から集約への `transfer` だけ
- `discarded` から他の段階へ戻らない

#### ライフサイクル

- 生成: 登録（`register`）または複製（`duplicate`）で `accepted`
- `accepted → stored`: 実体を `PhotoStorage` に置いた後の `markStored`
- 持ち主: `stored` の間に、`claim` で `null` から設定され、`transfer` で申請から集約へ替わる
- `accepted`・`stored → discarded`: `photos.released` の消費、または持ち主のない写真の掃除
- 終了: `discarded` の写真は、実体を削除した後に記録を削除する。削除した写真は戻せない（MOD-02）

## 値オブジェクト

### PhotoConsent

```ts
type PhotoConsent = Readonly<{ agreedAt: Date }>;
```

- `PhotoConsent.agree(input: { agreed: boolean }, now: Date): PhotoConsent`: `agreed` が `true` でなければ `BusinessRuleError`（`MEDIA_INVALID_CONSENT`）。1つの同意が、写真の権利（自ら撮影、または許諾を得た）と Lunt での利用の両方を指す
- 同意は写真1枚の登録ごとに作る。以前の同意を別の写真に使い回さない
- 等価性: `agreedAt` の一致

### PhotoFormat / PhotoFile

```ts
type PhotoFormat = string & { readonly [photoFormatBrand]: true }; // 静止画の形式を表すメディアタイプ（"image/jpeg" など）

type PhotoDigest = string & { readonly [photoDigestBrand]: true }; // バイト列の SHA-256 の16進表記

type PhotoFile = Readonly<{
  bytes: Uint8Array;
  format: PhotoFormat;
  digest: PhotoDigest;
}>;
```

- `PhotoFormat.create(input: string)`: `image/` で始まるメディアタイプでなければ `BusinessRuleError`（`MEDIA_INVALID_FORMAT`）
- `PhotoDigest.of(bytes: Uint8Array): PhotoDigest`: バイト列の SHA-256 を小文字の16進表記で返す純粋な関数。要約を求める唯一の場所
- `PhotoFile` は `PhotoIntake.accept` だけが作る
- 等価性: `PhotoFormat` と `PhotoDigest` は値の一致。`PhotoFile` は比べない（同じファイルかどうかは `digest` で決める）

### PhotoInspection

```ts
type PhotoInspection =
  | Readonly<{ kind: "photo"; format: PhotoFormat }>
  | Readonly<{ kind: "not_a_photo" }>;
```

`PhotoInspector` が、ファイルの中身から判定した結果。`not_a_photo` は、静止画として読めないファイル（動画、壊れたファイル、画像でないファイル）。

### PhotoPolicy

```ts
type PhotoPolicy = Readonly<{
  unownedRetentionMs: number; // 正の整数。持ち主のない写真を残す期間
}>;
```

設定値。`PhotoPolicy.create(input)` は、制約を欠けば `BusinessRuleError`（`MEDIA_INVALID_POLICY`）。

`PhotoPolicy.sweepBefore(policy: PhotoPolicy, now: Date): Date` は、`now` から `policy.unownedRetentionMs` を引いた日時を返す。持ち主のない写真を削除の対象にする期限を定める唯一の場所で、`PhotoAsset.isAbandoned` の引数と `PhotoAssetRepository.findPageSweepable` の `registeredBefore` は、この値を使う。

### PhotoDisplayRef

```ts
type PhotoDisplayRef = Readonly<{ url: string }>;
```

`PhotoStorage.displayRefs` だけが返す。ドメインは中身を解釈しない。

## ドメインサービス

### PhotoIntake

責務: 写真として扱えないファイルを拒否する。ポートに依存しない純粋な関数。

```ts
PhotoIntake.accept(bytes: Uint8Array, inspection: PhotoInspection): PhotoFile
```

- `inspection.kind` が `not_a_photo` なら `BusinessRuleError`（`MEDIA_NOT_A_PHOTO`）。写真として扱えないファイルは登録されず、扱えないことが示される（`scenario/index.md`「写真の登録と同意」）
- `PhotoFile` の形式は、利用者が申告した値ではなく `inspection.format` を使う。`digest` は `PhotoDigest.of(bytes)`

### PhotoOwnership

責務: 他のドメインのユースケースが、写真を載せた集約または申請の書き込みと同じ UnitOfWork で呼ぶ、持ち主の設定と付け替え。複数の写真をまとめて扱い、1枚でも成立しなければ全体が成立しない。ポートに依存しない純粋な関数（写真はユースケースが `PhotoAssetRepository.findByIds` で読んで渡す）。

```ts
PhotoOwnership.claimAll(
  photos: readonly PhotoAsset[],
  photoIds: readonly PhotoId[],
  owner: PhotoOwnerRef,
  by: Actor,
): readonly StoredPhoto[]

PhotoOwnership.transferAll(
  photos: readonly PhotoAsset[],
  photoIds: readonly PhotoId[],
  from: { kind: "application"; id: ApplicationId },
  to: ContentRef,
): readonly StoredPhoto[]
```

- `photoIds` のうち `photos` にないものがあれば `BusinessRuleError`（`MEDIA_PHOTO_NOT_AVAILABLE`）。存在しない写真、削除された写真は載せられない
- 各写真に `PhotoAsset.claim`・`PhotoAsset.transfer` を適用する。呼び出し側は、戻り値のすべてを `save` する
- `claimAll` の `photoIds` は、その保存・提出で新しく加わった写真だけ。すでにその集約・申請に載っている写真は渡さない
- `transferAll` の `photoIds` は、承認する申請が持ち主の写真のすべて（Application の `ApplicationCase.ownedPhotoIds`。index.md「写真の持ち主」）

## ドメインイベント

Media はドメインイベントを出さない。

消費するドメインイベントは、共有カーネルの `photos.released`（`{ photoIds: readonly PhotoId[] }`）だけ。写真を持つ集約と申請が出し、Media が載っている写真を破棄して削除する。配送は少なくとも1回で順序を保証しないので、消費は冪等にする（すでに削除した写真、すでに破棄した写真を含む `photoIds` を、何度受けても同じ結果になる）。

## ポート

### PhotoAssetRepository

目的: 写真の記録の永続化と、掃除の対象の問い合わせ。`TransactionalRepository<PhotoAsset, PhotoId>` を拡張する（共通の契約は index.md）。`UnitOfWorkContext` に `photoAssetRepository` として入る。

```ts
interface PhotoAssetRepository extends TransactionalRepository<PhotoAsset, PhotoId> {
  findByIds(ids: readonly PhotoId[]): Promise<readonly Versioned<PhotoAsset>[]>;
  findPageSweepable(registeredBefore: Date, pagination: Pagination): Promise<PaginationResult<Versioned<PhotoAsset>>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `insert`・`findById`・`save`・`delete` | index.md の共通の契約。ID の一意性はポートが担保する。`save`・`delete` は楽観ロック。持ち主の設定と掃除が同じ写真で競合すると、後からコミットする側が `ConflictError` になる。`delete` した写真は、以後のどの問い合わせにも現れない。ポートは削除した写真の ID を覚え、同じ ID の `insert` は `ConflictError` にする（削除した写真は、登録の送り直しでも戻らない） |
| `findByIds` | 与えた ID のうち、存在する写真を、楽観ロックの版とともに返す。順序は保証しない。存在しない ID は結果に現れない。ID は 0〜100件で、0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`。index.md）。呼び出し側が分けて呼ぶ |
| `findPageSweepable` | 次のどちらかに当たる写真を返す（`registeredBefore` は呼び出し側が `PhotoPolicy.sweepBefore` で求める）。(1) `accepted`、または持ち主のない `stored` で、`registeredAt` が `registeredBefore` より前。(2) `discarded`。並び順は `registeredAt` の古い順、同順位は ID の昇順。削除した写真と、持ち主が設定された写真は結果から外れる。掃除は先頭のページ（`page: 1`）を読み直して進め、読んだページの全件が失敗したら打ち切る。残りは次の掃除が続ける |

- 「1つの写真の持ち主は1つ以下」は、集約の不変条件と楽観ロックで守る。ポートは、持ち主から写真を引く問い合わせを持たない（集約が `PhotoId` を持つ）
- `owner` の指す先があることは、呼び出し側のユースケースが、同じ UnitOfWork で持ち主の集約・申請を書き込むことで満たす
- エラー: 楽観ロックの競合と ID の重複（削除した写真の ID を含む）は `ConflictError`、対象のない（削除済みを含む）`save`・`delete` は `NotFoundError`、100件を超える `findByIds` は `BusinessRuleError`（`COMMON_INVALID_INPUT`）
- 可視性: コミットした書き込みは、以後のすべての問い合わせに即座に反映される

### PhotoStorage

目的: 写真の実体を置く。UnitOfWork の外にあり、書き込みはトランザクションに入らない。すべての操作は、同じ引数で繰り返しても同じ結果になる。

```ts
interface PhotoStorage {
  put(photoId: PhotoId, file: PhotoFile): Promise<void>;
  copy(sourceId: PhotoId, destinationId: PhotoId): Promise<void>;
  delete(photoId: PhotoId): Promise<void>;
  displayRefs(photoIds: readonly PhotoId[]): Promise<ReadonlyMap<PhotoId, PhotoDisplayRef>>;
}
```

| メソッド | 振る舞いの契約 |
| --- | --- |
| `put` | `photoId` の実体として `file` を置く。同じ `photoId` の実体があれば置き換える。解決した後は、`copy` の元にでき、`displayRefs` の参照で取得できる |
| `copy` | `sourceId` の実体を、`destinationId` の実体として複製する。`destinationId` の実体があれば置き換える。`sourceId` の実体がなければ `NotFoundError`。元の実体は変わらず、複製の後は互いに独立する（一方を削除しても他方は残る） |
| `delete` | `photoId` の実体を削除する。実体がなくても成功する。解決した後は、`displayRefs` の参照で取得できない |
| `displayRefs` | 与えた `PhotoId` のすべてについて、表示用の参照を返す。実体の有無を確かめない。ID は 0〜100件で、0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。呼び出し側が分けて呼ぶ。同じ `PhotoId` の参照は、実体がある間、その実体を指す |

- エラー: 元の実体のない `copy` は `NotFoundError`、100件を超える `displayRefs` は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。再試行しない。呼び出し側が同じ要求を送り直せる
- 実体の鍵は `PhotoId` だけ。持ち主、並び順、見せる範囲を実体の側に持たない

### PhotoInspector

目的: ファイルの中身を読んで、写真として扱えるかどうかと形式を判定する。

```ts
interface PhotoInspector {
  inspect(bytes: Uint8Array): Promise<PhotoInspection>;
}
```

- 静止画として読めるファイルは `{ kind: "photo"; format }`、読めないファイルは `{ kind: "not_a_photo" }` を返す。判定は中身だけで行い、ファイル名と申告された形式を使わない
- 同じ `bytes` には同じ結果を返す。読めないファイルをエラーにしない

## トランザクション境界

写真の実体（`PhotoStorage`）は UnitOfWork に入らない。記録の書き込みと実体の操作を、どの順で失敗しても、記録のない実体が残らない順に並べる。

| 操作 | 順序と、原子的に確定するもの |
| --- | --- |
| 登録 | (1) 同意とファイルを確かめる。(2) UnitOfWork で `accepted` の記録を `insert` する。(3) `PhotoStorage.put`。(4) UnitOfWork で写真を読み直し、`accepted` なら `markStored` を `save` する。読み直した写真が `discarded` またはない（(3) の間に掃除が破棄した）なら、(3) で置いた実体を `PhotoStorage.delete` で削除してから `ConflictError` で終える。(3) 以降が失敗した写真は `accepted` のまま残り、同じ `PhotoId` の登録の送り直しが (3) から続ける。送り直されなければ、掃除が削除する。同じ `PhotoId` の写真があるときは、冪等な作成として扱う。`PhotoAsset.isResendOf` が成り立つ `accepted` は (3) から続け、成り立つ `stored` は書き込みなしに成功として扱う。成り立たない写真（登録した人かファイルが違う）と、`discarded` の写真は `ConflictError`。記録を削除した写真の `PhotoId` では、(2) の `insert` が `ConflictError` になる（`PhotoAssetRepository`） |
| 持ち主の設定（他のドメインのユースケース） | 写真を載せた集約または申請の書き込みと、`PhotoOwnership.claimAll` の結果の `save` を、1つの UnitOfWork で確定する。写真の楽観ロックが競合すれば、集約・申請の書き込みごとロールバックされる |
| 持ち主の付け替え（Application の承認のユースケース） | 申請の書き込み、反映先の集約の書き込み、`PhotoOwnership.transferAll` の結果の `save` を、1つの UnitOfWork で確定する |
| 複製（Listing の `duplicateListing` と Application の `prepareReapplication` の中で呼ぶ手続き） | (1) UnitOfWork で、元の写真ごとに `duplicate` の記録を `insert` する。元の写真が1枚でも `duplicate` で成立しなければ、記録は1件も残らない。(2) 写真ごとに `PhotoStorage.copy`。(3) 呼び出したユースケースが `markStored` を `save` する。`claim` は、写真を載せる掲載または申請の書き込みと同じ UnitOfWork で `save` する（掲載の複製は、`markStored` と `claim` を新しい掲載の書き込みと同じ UnitOfWork で行う。再申請は、`prepareReapplication` が `markStored` を行い、再申請の提出が `claim` を行う）。途中で失敗した複製と、持ち主が設定されないまま残った複製は、掃除が削除する |
| 破棄と削除（`photos.released` の消費、掃除） | 写真1枚ごとに、(1) UnitOfWork で `discard` を `save` する。(2) `PhotoStorage.delete`。(3) UnitOfWork で記録を `delete` する。(2) 以降が失敗した写真は `discarded` のまま残り、`photos.released` の再配送または次の掃除が (2) から続ける |

- 掃除の (1) は楽観ロックで守る。持ち主の設定と競合した写真は破棄されず、載った写真の実体は削除されない
- `photos.released` の消費は、`photoIds` のうち記録のない写真を、削除済みとして扱う
- 写真1枚の失敗は、他の写真の破棄と削除を妨げない。`photos.released` の消費は、1枚でも削除まで進まなかった写真があれば、残りの写真を処理した後に、消費を失敗として終えて再配送を求める。消費は冪等なので、再配送は残った写真だけを進める

## ユースケース（概要）

| # | 名前 | 説明 | シナリオ |
| --- | --- | --- | --- |
| 1 | registerPhoto | ログインした利用者が、同意を確かめて写真を1枚登録する。同意のない登録と、写真として扱えないファイルを拒否し、理由を返す。冪等な作成（同じ `PhotoId` で `PhotoAsset.isResendOf` が成り立てば、`accepted` の写真は実体を置くところから続け、`stored` の写真は成功として扱う。成り立たない写真と、`discarded` の写真は `ConflictError`） | LST-02、LST-12、LST-13、LST-15、MOD-03、SHP-03、SHP-06、SHP-08、SHP-12、SHP-13、REG-06、REG-12、EVT-04、EVT-12、EDT-01、EDT-04、APP-02、APP-04 |
| 2 | duplicatePhotos | 掲載の複製と、終わった申請からの再申請のために、元の写真を複製し、元の `PhotoId` から新しい `PhotoId` への対応を返す。`duplicateListing`・`prepareReapplication` の中で呼ぶ手続きで、転送境界から呼ばない（操作の可否は呼び出したユースケースが確かめる）。元の写真の記録がない、または `stored` でなければ成立しない。`markStored` と持ち主の設定は、呼び出したユースケースが行う | LST-09、APP-04 |
| 3 | discardReleasedPhotos | `photos.released` の消費者。手放された写真を破棄し、実体と記録を削除する。一部の写真が削除まで進まなければ、消費を失敗として終えて再配送を求める | LST-02、LST-06、LST-10、SHP-06、SHP-13、REG-06、EVT-04、EDT-04、MOD-02、APP-02、APP-07 |
| 4 | sweepUnownedPhotos | 日次のジョブ。`PhotoPolicy.sweepBefore(policy, now)` の値で、`findPageSweepable` の写真のうち `isAbandoned` の写真を破棄して削除し、`discarded` のまま残った写真の削除を続ける | LST-01、LST-02、LST-12 |

持ち主の設定と付け替え（`PhotoOwnership`）、表示用の参照の取得（`PhotoStorage.displayRefs`）は、独立したユースケースを持たない。写真を載せるドメインと、写真を返す読み取りのユースケースが、このドメインのポートとドメインサービスを使う。
