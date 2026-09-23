# ドメイン一覧

Lunt のドメインの境界、依存方向、ドメインをまたぐ規約を定める。各ドメインの詳細はドメインごとのファイルが定める。

この層では、催し（祭り・マルシェなど）を「イベント」、ドメインで起きた出来事の記録を「ドメインイベント」と呼び分ける。催しのドメインの英語名は `Occasion` とする。

## ドメイン

| ドメイン | ファイル | 責務 |
| --- | --- | --- |
| Area（エリア） | [area.md](area.md) | 町域の郵便番号を単位とするエリアと、都道府県・市区町村・町域の階層を提供する |
| Media（写真） | [media.md](media.md) | 登録された写真の実体と、権利と利用への同意、持ち主、削除までのライフサイクルを管理する |
| Account（アカウント） | [account.md](account.md) | メールアドレスを持つアカウントと、パスワードを使わないログイン、退会を管理する |
| Authority（権限） | [authority.md](authority.md) | 店舗・地域・イベントの管理権限と招待、編集担当者・サービス運営者の役割、操作の可否の判断を管理する |
| Place（店舗・スポット） | [place.md](place.md) | 訪問先となる店舗・スポットの情報、営業状況、公開と非公開、店名・住所による照合を管理する |
| Listing（掲載） | [listing.md](listing.md) | 掲載の内容、公開状態、提供状態と、掲載を分類するカテゴリーを管理する |
| Region（地域） | [region.md](region.md) | 地域の情報と公開状態、店舗の地域への所属と代表地域を管理する |
| Occasion（イベント） | [occasion.md](occasion.md) | イベントの情報、公開状態、開催の状態、店舗の参加、開催地域の関連づけを管理する |
| Article（読みもの） | [article.md](article.md) | 読みものの内容、紹介先、公開状態を管理する |
| Application（申請） | [application.md](application.md) | 承認を求める8種の申請の内容と前提、確認中から承認・否認・取り下げ・失効までの進み方、承認者の判断を管理する |
| Moderation（申立て・連絡） | [moderation.md](moderation.md) | 取り下げの申立てと、情報の誤り・閉店の連絡の受け付けから対応済みまでを管理する |
| Bookmark（保存） | [bookmark.md](bookmark.md) | アカウントの保存と、端末の保存の合流を管理する |
| Discovery（発見） | [discovery.md](discovery.md) | 閲覧者に見せる範囲の規則、フィードの構成、絞り込み・検索・地図・詳細の読み取りを提供する |
| Notification（通知） | [notification.md](notification.md) | 出来事から宛先を決め、サービス内の通知とメールを届ける |

運営による非公開は独立したドメインを持たない。対象（掲載・店舗・地域・イベント）の集約が状態として持ち、操作はサービス運営者の役割で行う。

## 依存方向

依存は、ドメイン層（エンティティ、値オブジェクト、ドメインサービス、ポートのシグネチャ）が、他のドメインのドメイン層の型（値オブジェクト、エンティティ、ドメインイベントの型、純粋な関数）を参照することを指す。すべてのドメインは共有カーネルに依存する。集約どうしは共有カーネルの ID で参照し、他のドメインのエンティティを持たない。

ユースケース（application 層）は、複数のドメインのポートと振る舞いを呼んで合成する（例: `withdraw` が Authority の管理体制と名簿を同じ UnitOfWork で書き換える、保存のユースケースが Discovery の `ReferenceQueries.isViewable` を事実として読む、消費者が他のドメインのドメインイベントを受け取る）。ユースケースによる合成は、依存に数えない。ユースケースは、主に書き換える集約、または結果を返す読み取りを持つドメインのファイルに置く。

| ドメイン | 依存するドメイン | 理由 |
| --- | --- | --- |
| Area、Media、Account、Authority、Listing、Article、Moderation、Bookmark | なし | |
| Place、Region、Occasion | Area | 所在地のエリア |
| Application | Place、Listing、Occasion、Authority | 申請の内容に、対象のドメインの値オブジェクトを使う。`ApproverPolicy` は Authority の `AccessDecision` を引数に使う |
| Discovery | Area、Place、Listing、Region、Occasion、Article | 読み取り専用。各ドメインの状態の型と純粋な関数（Place の `PlaceMatching` など）を使う |
| Notification | ドメインイベントを出すすべてのドメイン | 告知を取り出す純粋な関数が、各ドメインのドメインイベントの型を引数に使う |

- 循環はない。Discovery と Notification は最下流にあり、どのドメインのドメイン層からも参照されない
- Place・Listing・Region・Occasion・Article は互いに依存しない。関係は、関係を持つ側の集約が相手の ID を持つ（掲載は `PlaceId`、所属は `PlaceId` と `RegionId`、参加は `OccasionId`・`PlaceId`・`ListingId`、関連づけは `OccasionId` と `RegionId`、紹介先は `ShowcaseRef`）
- 写真を持つドメインは、共有カーネルの `PhotoId`・`PhotoSet` だけを参照し、Media に依存しない。Media は、共有カーネルのドメインイベント `PhotosReleased` だけを消費し、他のドメインに依存しない

他のドメインの状態に基づく規則（例: 店舗管理者のいる店舗への修正の申請は受け付けない、添えられる掲載はその店舗の公開中の掲載に限る）は、規則を持つドメインの振る舞いが「事実」を引数で受け取って判断する。事実（店舗管理者の有無、掲載の公開状態など）はユースケースが他のドメインのポートから読んで渡す。ドメインの振る舞いは他のドメインのポートを呼ばない。

## 共有カーネル

`domain/common` に置く。どのドメインにも属さない、型と純粋な関数だけを持つ。

共有カーネルの値オブジェクトの生成の失敗は、`BusinessRuleError` のコード `COMMON_INVALID_{型名の SNAKE_CASE}`（例: `COMMON_INVALID_DATE_RANGE`、`COMMON_INVALID_TAGLINE`）で返す。

### ID

すべて不透明な空でない文字列のブランド型。形式は `IdGenerator` ポートが決める。

`AccountId`、`PlaceId`、`ListingId`、`CategoryId`、`RegionId`、`OccasionId`、`ArticleId`、`ApplicationId`、`PhotoId`、`InvitationId`、`TakedownClaimId`、`InfoReportId`、`NotificationId`

ドメインイベントの ID はテンプレートの `EventId`（`domain/common/event.ts`）で、催しの ID（`OccasionId`）とは別の型。

### 参照

| 型 | 定義 | 使う場面 |
| --- | --- | --- |
| `ContentRef` | `{ kind: "listing"; id: ListingId } \| { kind: "place"; id: PlaceId } \| { kind: "region"; id: RegionId } \| { kind: "occasion"; id: OccasionId } \| { kind: "article"; id: ArticleId }` | 申立ての対象、通知が指す対象が店舗・掲載・地域・イベント・読みもののときの参照 |
| `ShowcaseRef` | `ContentRef` のうち `listing`・`place`・`region`・`occasion` | 読みものの紹介先 |
| `BookmarkRef` | `ContentRef` のうち `listing`・`place` | 保存の対象 |
| `StewardedRef` | `ContentRef` のうち `place`・`region`・`occasion` | 管理権限の対象 |
| `PhotoOwnerRef` | `ContentRef \| { kind: "application"; id: ApplicationId }` | 写真の持ち主 |

### 日付と位置

| 型 | 定義 |
| --- | --- |
| `LocalDate` | 日本時間の暦日（年・月・日）。`LocalDate.fromInstant(now: Date): LocalDate` は日本時間（UTC+9 固定）で暦日を求める。比較は暦日の前後 |
| `DateRange` | `{ start: LocalDate; end: LocalDate }`。`start <= end`。両端を含む。イベントの開催期間に使う |
| `GeoPoint` | `{ latitude: number; longitude: number }`。緯度は -90〜90、経度は -180〜180 |
| `GeoBounds` | `{ southWest: GeoPoint; northEast: GeoPoint }`。南西の緯度・経度は北東の緯度・経度以下。経度180度をまたぐ矩形は扱わない |
| `AreaCode` | 町域の郵便番号（7桁の数字）。エリアの識別子。Area の `AreaCatalog` に存在する値だけが `Address` に入る |
| `Address` | `{ areaCode: AreaCode; prefecture: string; municipality: string; town: string; rest: string }`。対象のエリアは `areaCode`。利用者は町域を選び、`rest`（町域より後の部分）を入力する。`Address` は Area の町域（`Town`）からだけ作る（1つの `AreaCode` に複数の町域が対応しうるため、`areaCode`・`prefecture`・`municipality`・`town` の組は町域が決める）。事業所固有の郵便番号は `AreaCode` にならない |

日付で決まる状態（掲載の提供状態、イベントの開催の状態）は、保存せず、`LocalDate` を引数に取る純粋な関数で求める。

### 公開状態

地域・イベント・読みもの・掲載に共通する。

```ts
type Publication =
  | { status: "draft" }
  | { status: "published"; firstPublishedAt: Date }
  | { status: "unpublished"; firstPublishedAt: Date; reason: "byManager" | "photoTakedown" };
```

- `unpublished` は、掲載では一時非公開、地域・イベント・読みものでは公開の取り下げに当たる
- 遷移は `draft → published`、`published → unpublished`、`unpublished → published`。`published` への遷移は、対象ごとの公開条件を満たすときだけ成立する。`firstPublishedAt` は最初の公開の日時で、再び公開しても変わらない（「新しい順」の基準）
- 遷移と判定の順序は、下の「公開状態と運営による非公開の関数」だけが持つ。不正な遷移は `BusinessRuleError`（コード `PUBLICATION_INVALID_TRANSITION`）。公開条件を欠く公開は、`BusinessRuleError`（コード `{LISTING|REGION|OCCASION|ARTICLE}_PUBLISH_CONDITION_UNMET`）
- `reason` は、管理者・運営者・編集担当者の操作による `byManager` と、申立てによる写真の削除で公開条件を欠いた `photoTakedown` を区別する（管理側の画面がこの区別を示す）。掲載・地域・イベント・読みものは同じ表現を使う
- `published` の対象の内容が公開条件を欠くと（申立てによる最後の写真の削除）、集約の振る舞いが `unpublished`（`photoTakedown`）にする。公開条件を欠く内容での `published` の対象の更新は、公開と同じコード（`{subject}_PUBLISH_CONDITION_UNMET`）の `BusinessRuleError`

### 運営による非公開

掲載・店舗・地域・イベントに共通する。公開状態に重なる別の状態。

```ts
type Suspension =
  | { suspended: false }
  | { suspended: true; suspendedAt: Date };
```

- 運営による非公開にする操作と解除する操作は、公開状態を書き換えない。解除すると、公開状態はそのまま現れる
- 運営による非公開の間、対象は閲覧できない。管理者・運営者の操作による公開状態の変更（公開、一時非公開、公開の取り下げ、再公開）は `BusinessRuleError` になる。情報の更新と削除はできる
- 公開条件を欠いたことによる `unpublished` への遷移は、運営による非公開の間も起きる
- 店舗は `Publication` を持たず、`Suspension` だけを持つ（登録された店舗は公開されている）
- 対象の公開状態にかかわらず、運営による非公開にできる

### 公開状態と運営による非公開の関数

公開状態と運営による非公開の遷移と、判定の順序は、共有カーネルの純粋な関数だけが持つ。各集約の振る舞いは、自分の状態と、公開条件のうち欠けている項目を渡して呼び、判定を自分で持たない。

```ts
type Exposure = { publication: Publication; suspension: Suspension };
type ExposureSubject = "LISTING" | "PLACE" | "REGION" | "OCCASION" | "ARTICLE";
```

`subject` は対象の種類で、エラーコードの接頭辞になる。

| 関数 | 判定（上から順）と結果 |
| --- | --- |
| `Publication.publish(state: Exposure, missing: readonly unknown[], now: Date, subject)` | 運営による非公開なら `{subject}_SUSPENDED`。`published` なら `PUBLICATION_INVALID_TRANSITION`。`missing`（公開条件のうち欠けている項目）が空でなければ、項目を添えた `{subject}_PUBLISH_CONDITION_UNMET`。どれにも当たらなければ `published` を返す。`firstPublishedAt` は、`draft` からの公開では `now`、再公開では変わらない |
| `Publication.unpublish(state: Exposure, reason, subject)` | `reason` が `byManager` のとき、運営による非公開なら `{subject}_SUSPENDED`。`published` でなければ `PUBLICATION_INVALID_TRANSITION`。どれにも当たらなければ、`reason` を持つ `unpublished` を返す。`photoTakedown` は運営による非公開を判定しない |
| `Suspension.suspend(s: Suspension, now: Date, subject)` | すでに運営による非公開なら `{subject}_ALREADY_SUSPENDED`。そうでなければ `{ suspended: true; suspendedAt: now }` を返す |
| `Suspension.unsuspend(s: Suspension, subject)` | 運営による非公開でなければ `{subject}_NOT_SUSPENDED`。そうでなければ `{ suspended: false }` を返す |

エラーはどれも `BusinessRuleError`。読みものは `Suspension` を持たず、`{ suspended: false }` を渡す。店舗は `Suspension` の関数だけを使う。

### 閲覧できる対象

「閲覧できる」の定義は1つで、Discovery の `VisibilityPolicy` が持つ。掲載は「`published` かつ運営による非公開でない、かつ紐づく店舗が非公開でない」、店舗は「非公開でない」、地域・イベントは「`published` かつ運営による非公開でない」、読みものは「`published`」。

ユースケースが「対象が閲覧できるか」を求める経路は、対象の受け取り方で決まる。種類をまたぐ参照（`ContentRef` とその部分型）で対象を受け取るユースケース（保存、申立て、連絡、申請の提出と承認）は、Discovery の `ReferenceQueries.isViewable` で読む。特定の種類の集約を自分で読むユースケース（直接の追加の店舗、開催地域の関連づけの地域、店舗の所属地域の状況）は、読んだ集約に `VisibilityPolicy` の `is…Viewable`（純粋な関数）を当て、同じ対象を読み直さない。

### 写真の並び

```ts
type PhotoSet<P extends { photoId: PhotoId }> = readonly P[]; // 順序つき。1枚目が代表写真。PhotoId の重複はない
```

掲載は `P = { photoId: PhotoId; framing: Framing | null }`、店舗・地域・イベント・読みものは `P = { photoId: PhotoId }`。追加・並び替え・削除の純粋な関数を共有する。`PhotoSet.takeDown(photos, photoIds: readonly [PhotoId, ...PhotoId[]], subject)` は、申立てに基づく写真の削除が使う。`photoIds`（重複なし）のすべてを外した並びを返し、残る写真の順序は変わらない。`photos` にない `PhotoId` が混じれば、1枚も外さず `BusinessRuleError`（`{subject}_PHOTO_NOT_FOUND`。`subject` は「公開状態と運営による非公開の関数」の `ExposureSubject`）。

### 写真の修正

```ts
type RevisedPhotos<P extends { photoId: PhotoId }> = readonly (P & { origin: "current" | "added" })[];
```

修正の申請（店舗の情報修正、掲載の修正）の写真の項目の値。写真ごとに、提出の時点で対象にあった `current` か、修正が新たに添えた `added` かを持つ。

| 関数 | 結果 |
| --- | --- |
| `RevisedPhotos.between(current: PhotoSet<P>, desired: PhotoSet<P>): RevisedPhotos<P>` | `desired` の並びのまま、`current` に同じ `PhotoId` がある写真を `current`、ない写真を `added` にする |
| `RevisedPhotos.overlay(current: PhotoSet<P>, revised: RevisedPhotos<P>): PhotoSet<P>` | `revised` の並びから、`origin` が `current` で、対象の現在の写真（引数の `current`）に同じ `PhotoId` がないものを除いた並びを返す（`origin` は外す）。提出の後に対象から外れた写真は戻らない |
| `RevisedPhotos.addedPhotoIds(revised: RevisedPhotos<P>): readonly PhotoId[]` | `added` の写真の `PhotoId`。申請が持ち主になる写真はこれだけ |

### 写真の解放

```ts
type PhotosReleasedEvent = DomainEventBase<"photos.released", { photoIds: readonly PhotoId[] }>;
```

写真を持つ集約と申請は、写真を手放したとき（写真を外して保存した、集約を削除した、申立てで写真が削除された、申請が承認されずに終わった、承認で採用されなかった）に、手放した `PhotoId` を載せた `PhotosReleased` の下書きを返す。Media がこれを消費して写真を削除する。

### キャッチコピー

`Tagline` は、前後の空白を除いた1〜60文字の文字列のブランド型。地域とイベントが同じ型を使う。掲載はキャッチコピーを持たない。

### 文字列の正規化

`TextNormalization.normalize(input: string): string` は、Unicode の NFKC 正規化、ロケールに依存しない Unicode の既定の小文字化（ASCII の外の文字にも当たる）、空白（全角を含む）の除去を、この順に行う。キーワードや店名・住所の一致を定める規則（Place の `PlaceMatching`、Discovery のキーワード検索、サービス運営者が非公開を含めて探す読み取り）は、どれもこの関数で正規化した値を比べる。保存先にかかわらず、一致の結果はこの定義で決まる。

### メールアドレス

`EmailAddress` は、形式が正しく、前後の空白を除き、小文字にそろえた254文字以内の文字列のブランド型。等価性は値の一致。アカウント、招待の宛先、申立人の連絡先が同じ型を使う。

### 操作する人

```ts
type Actor = { accountId: AccountId };
```

ログインしていない操作（閲覧、取り下げの申立て）は `Actor` を取らない。

## ドメインをまたぐ規約

### 操作の可否

操作の可否の規則は Authority の `AccessPolicy`（純粋な関数）だけが持つ。ユースケースは、操作する人の管理権限・役割と、対象の管理者の有無を Authority のポートから読み、`AccessPolicy` に渡す。

| 操作 | `AccessPolicy` の操作の種類 | 行える人 |
| --- | --- | --- |
| 対象の管理（店舗の情報・営業状況・掲載、地域の情報・公開状態・所属店舗・関連づけ、イベントの情報・公開状態・開催の状態・参加店舗・開催地域） | `manage_target` | その対象の管理権限を持つ人。対象に管理者がいなければ、サービス運営者（代行。M-35、M-46、R-11、R-15、E-09、E-11、E-15） |
| 店舗として行う操作（代表地域の選択、店舗の所属状況・参加状況の確認、参加内容の変更、参加の取りやめ、店舗管理者として行う申請） | `act_as_place` | その店舗の管理権限を持つ人だけ。代行はない（管理者のいない店舗の所属は個人の申請、参加はイベントの側の操作が扱う） |
| 管理メンバーの確認 | `view_members` | その対象の管理権限を持つ人と、サービス運営者 |
| 管理メンバーの招待・招待の取り消し・辞任 | `invite_member`・`cancel_invitation`・`resign` | その対象の管理権限を持つ人。対象に管理者がいなければ、招待の取り消しはサービス運営者 |
| サービス運営者が対象（店舗・掲載・地域・イベント）を ID やキーワードで開き、状態と管理者の有無を確かめる読み取り | `operate_service` | サービス運営者（管理者の有無にかかわらず） |
| 管理者の権限の解除、地域・イベントの管理権限の付与、役割の付与・解除、運営による非公開、代理登録、地域・イベントの登録、カテゴリーの管理、申立て・連絡への対応 | `operate_service` | サービス運営者 |
| 読みものの作成・編集・公開 | `edit_articles` | 編集担当者 |
| 申請の判断 | Application の `ApproverPolicy` | 承認者の種類ごとに、`AccessPolicy` の結果と、確認中になってからの期間で決まる |

代行の有無は操作の種類が決める。ユースケースは、`AccessPolicy` の結果の立場（管理者か代行か）を見て可否を分岐しない。

権限は対象ごとに独立で、役割の兼任は範囲を広げない。

### 申請の前提

申請の種類ごとの前提は Application の `Premise`（純粋な関数）だけが持つ。ユースケースが事実（店舗管理者の有無、申請者がその店舗の店舗管理者かどうか、所属の有無、参加の有無、掲載の有無、イベントの開催の状態、併せた登録申請の状態）を読んで渡す。

- 提出と承認は、前提が成り立たなければ成立しない
- 失効は「申請の種類ごとの前提が成り立たなくなった」という1つの規則による（P-77、I-19）。前提に関わるドメインイベント（管理者の就任と不在、所属の成立と解除、参加の成立、掲載の削除、イベントの終了と中止、登録申請の否認・取り下げ）の消費者が、関係する確認中・差し戻し中の申請の前提を再評価し、成り立たない申請を失効にする

### トランザクションとドメインイベント

- 書き込みを持つユースケースは `UnitOfWorkProvider.run(fn)` の中で実行する。スコープ内の書き込みは、すべて成功するか、1つも反映されないかのどちらかになる
- ドメインイベントは、集約の振る舞いが下書きとして返し、ユースケースが `collectEvents` で UnitOfWork に渡す。ドメインイベントは書き込みと同じスコープで Outbox に保存され、リレーが配送する。配送は少なくとも1回で、順序は保証しない。消費者は冪等に作る
- 消費に失敗したドメインイベントはリレーが再配送する。再配送の上限に達したドメインイベントは、テンプレートの DLQ に移る。DLQ からの再投入は運用が行い、消費者は冪等なので再投入で続きが進む。spec は DLQ に移った後のアプリケーション内のフローを持たない
- 1つの要求の中で原子的に確定するもの: 集約の書き込み、その要求で変わる他の集約の書き込み（例: 申請の承認と承認で反映される内容、退会とその人の管理権限・役割の喪失、管理権限・役割を与える書き込みと相手のアカウントの版の更新、写真の持ち主の設定）、ドメインイベントの保存
- ドメインイベントの消費で結果整合にするもの: 前提の再評価による申請の失効、通知とそのメール、手放された写真の削除、退会に伴う保存の削除・個人の申請の取り下げ・通知の削除、申立ての結果のメール。消費者の一覧は [../flows/index.md](../flows/index.md) の「ドメインイベントと消費者」が持つ

### ドメインイベントの名前

ドメインイベントの型名は `"{主語}.{出来事}"`。主語は出来事の主語で、ドメインの名前（上の「ドメイン」の表の英語名の snake_case）、またはそのドメインの中の集約の名前（Listing の `category`、Moderation の `takedown_claim`・`info_report`）。共有カーネルのドメインイベントの主語は `photos`（`"photos.released"` だけ）。出来事は過去形の snake_case で書く（例: `"listing.unpublished"`、`"place.operating_status_changed"`、`"category.retired"`）。ドメインの名前を主語にして、出来事の側に集約の語を含めてもよい（例: `"region.affiliation_established"`、`"authority.role_granted"`）。型名の一覧は [../flows/index.md](../flows/index.md) の「ドメインイベントと消費者」が持つ。

同じ出来事と、その出来事を起こす振る舞い・ユースケースには、ドメインをまたいで同じ語を使う。

| 出来事 | ドメインイベントの出来事の語 | 集約の振る舞い | ユースケース |
| --- | --- | --- | --- |
| 運営による非公開 | `suspended` | `suspend` | `suspend{Place\|Listing\|Region\|Occasion}` |
| 運営による非公開の解除 | `unsuspended` | `unsuspend` | `unsuspend{Place\|Listing\|Region\|Occasion}` |
| 公開・再公開 | ドメインイベントを出さない | `publish` | `publish{Listing\|Region\|Occasion\|Article}` |
| 公開していない状態への遷移 | `unpublished`（読みものは出さない） | `unpublish` | `unpublish{Listing\|Region\|Occasion\|Article}` |
| 申立てに基づく写真の削除 | `photos_taken_down` | `takeDownPhotos` | `takeDown{Place\|Listing\|Region\|Occasion\|Article}Photos` |

### UnitOfWork ポート

```ts
interface UnitOfWorkProvider {
  run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T>;
}

interface UnitOfWorkContext {
  // 各ドメインのリポジトリ（ドメインごとのファイルが定めるポート）
  collectEvents(drafts: readonly EventDraft[]): void;
}
```

- `fn` が値を返すとコミットし、例外を投げるとロールバックする。ロールバックでは、書き込みもドメインイベントも1件も残らない
- スコープはネストしない。`fn` の中で `run` を呼ばない（呼んだときの振る舞いは契約の外で、適合テストの対象にしない）
- スコープ内で書いた内容を、同じスコープ内の読み取りで読めることを前提にしない（書き込みをコミット時にまとめて反映するアダプターがある）。ユースケースは、読み取りをすべて終えてから書き込む
- 書き込みを持つユースケースは、集約のリポジトリからの読み取り（操作の可否の判断に使う読み取りと、振る舞いに渡す事実の読み取り）を、書き込みと同じ `run` の中で、書き込みの前に終える。UnitOfWork に参加しない読み取り専用のポート（Area の `AreaCatalog`、Discovery の読み取りのポートなど）は、`run` の前に呼んでよい。1つの消費で複数の `run` を使うユースケース（Notification の `deliverNotifications` が告知ごとに記録する場合など）は、どの `run` の書き込みの対象でもない集約の事実を、最初の `run` の前に読んでよい。読み取りだけのユースケースは `run` を使わない
- 楽観ロックの競合と、ポートが担保する一意性の違反は、遅くともコミットの時点で `ConflictError` になり、スコープ全体がロールバックされる
- コミットした書き込みは、以後の読み取りに即座に反映される（read-your-writes）
- 失敗した書き込みは再試行しない。呼び出し側が同じ要求を送り直せる

### リポジトリの共通の契約

集約のリポジトリは、テンプレートの `TransactionalRepository<TEntity, TId>`（`domain/common/transactionalRepository.ts`）の `insert`・`findById`・`save`・`delete` のうち、その集約に要るものだけを持つ。使わないメソッドは型から除く（例: 削除されない集約は `Omit<…, "delete">`）。集約の版の型は、テンプレートの `Version`（`domain/common/version.ts`）。

```ts
interface TransactionalRepository<TEntity, TId> {
  insert(entity: TEntity): Promise<void>;
  findById(id: TId): Promise<Versioned<TEntity> | null>;
  save(entity: TEntity, expectedVersion: ExpectedVersion<TEntity>): Promise<void>;
  delete(id: TId, expectedVersion: ExpectedVersion<TEntity>): Promise<void>;
}
```

- 全体で1つ、または決まった少数しかない集約（カテゴリーの台帳、役割ごとの名簿）は、ID の代わりに決まったキーで読み書きし、`findById`・`save` と同じ楽観ロックの契約を持つ。`insert`・`delete` は持たない
- 作った後に内容が変わらず、書き込みがどれも冪等な集約（保存、通知）のリポジトリは、この4つのメソッドを持たず、楽観ロックを使わない。冪等な書き込みの契約は各ポートが定める
- `insert`: 同じ ID の集約があれば `ConflictError`。ID の一意性はポートが担保する
- `save`・`delete`: `findById` が返した `expectedVersion` と保存されている版が違えば `ConflictError`（楽観ロック）。対象がなければ（削除済みを含む）、版にかかわらず `NotFoundError`
- ID 以外の一意性（例: 同じ店舗と地域の所属は1つ）は、ポートが担保するか、1つの集約の不変条件にして楽観ロックで守る。「事前に検索して無ければ保存」で守らない。どちらで守るかは各ポートが定める
- 参照整合性（他の集約の ID が指す先があること）を、ポートは担保しない。指す先があることを書き込みの条件にする規則は、呼び出し側のユースケースが、書き込みの前に確かめる。条件にしない参照（読みものの紹介先、保存の対象など。各ドメインが定める）は確かめない。指す先がない参照と、参照先が後から消えた参照は、参照する側が閲覧できない対象として扱う
- 呼び出し側が ID を決めて送る集約を新しく作る要求は、同じ ID で同じ内容なら、書き込みもドメインイベントもなしに成功として扱い、同じ ID で違う内容なら `ConflictError` にする（冪等な作成）。ID が組のキーで決まる集約（参加、開催地域の関連づけ、保存）は対象でない。同じ組の送り直しの扱いは、各ドメインが定める
- 保存先の障害を `SystemError` にするのはアダプターの責務で、どのポートの契約の項目にも、適合テストにも入れない。ポートのエラーの列挙に `SystemError` を含めない
- ID やキーで集約を引く問い合わせ（`findByIds` など）は、0〜100件を受け取る。0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。呼び出し側が分けて呼ぶ。存在しない ID は結果に現れない。ID の集合を絞り込みの条件に使う一覧の問い合わせ（例: この店舗たちが行った申請）は、集合の件数に上限を持たない
- 一覧の問い合わせはテンプレートの `Pagination`（`page` は1始まり、`limit` は 1〜100）を取り、`PaginationResult`（`items` と、条件に合う全件数 `count`）を返す。並び順は各ポートが定め、同順位は ID の昇順で決める。ID の昇順は、文字列の Unicode のコードポイント順で、ロケールと照合順序に依存しない。範囲の外の `page` は空の `items` を返す

### エラーの種類

- ドメインの不変条件の違反と、値オブジェクトの生成の失敗は `BusinessRuleError`（コードつき）
- application 層のエラーは、テンプレートの `NotFoundError`・`ConflictError`・`UnauthorizedError`（ログインが必要）・`ForbiddenError`（操作の可否で拒まれた）・`SystemError`。閲覧できない対象は、存在しない対象と同じ `NotFoundError` で表す
- 入力の形の誤りのうち転送境界で確かめないもの（ID やキーの件数の超過、マスターにない町域の指定など）は、`BusinessRuleError` のコード `COMMON_INVALID_INPUT`、またはそのドメインが定めるコードで返す

### ユースケースの名前

ユースケースの名前は、テンプレートの関数名と同じ camelCase の英語（例: `publishListing`）。テストケースのファイル名と一致する。名前と入出力に画面の語彙を使わない。

ドメインをまたいで同じ役割を持つユースケースは、同じ形の名前を使う。出来事を起こすユースケースは「ドメインイベントの名前」の表による。サービス運営者が非公開を含めて探す読み取りは `search{Places|Listings|Regions|Occasions}ForOperation`、ID で開く読み取りは `getManaged{Place|Listing|Region|Occasion}`。

### 時刻と ID

ドメインは現在時刻と ID を自分で作らない。`Clock`・`IdGenerator` ポート（application 層）の値を引数で受け取る。

### 編集の競合

人が内容を編集して保存する要求（店舗・掲載・地域・イベント・読みものの内容の更新、営業状況の変更、参加内容の変更、申請の再提出と取り下げ）と、内容を見て判断する要求（申請の承認・否認・差し戻し）は、読んだときの版を要求に含める。ユースケースは、保存されている版と違えば `ConflictError` にする（他の人が先に保存した。再読み込みして操作し直す）。状態を変えるだけの要求（公開、非公開、中止、対応済みなど）は版を含めず、すでにその状態であることは前提の変化として `BusinessRuleError` で返し、同時の書き込みは `save` の楽観ロックで守る。状態のエラーは版の比較より先に判定する。

### 時間の経過で起きる出来事

提供状態と開催の状態は日付から求めるので、保存された状態の遷移を持たない。状態が変わった出来事（掲載の提供終了、イベントの終了。掲載の提供終了は、期日によるものも管理する人の操作によるものも含む）を必要とする消費者（通知、申請の前提の再評価）のために、日次のジョブが、集約の外の記録（対象の ID と、最後に確かめた状態）と今日の状態を比べ、違えば記録を更新してドメインイベントを出す。記録は Listing と Occasion がそれぞれ、集約とは別のポートで持つ。ジョブの書き込みは集約の版を進めない。ジョブは対象を1件ずつ別の UnitOfWork で処理し、1件の失敗で止まらない。処理した対象が結果から外れる問い合わせは先頭のページを読み直して進め、読んだページの全件が失敗したら打ち切る（次の実行でやり直す）。

運営者が一定の期間確認していない申請の通知（P-97）も、Application の日次のジョブが同じ形（申請の ID と、通知済みの記録）で出す。

### 読み取り

- 閲覧者に見せる読み取り（フィード、絞り込み、地図、検索、詳細、保存一覧の解決、対象の選択の候補）は Discovery のポートが提供する。閲覧できない対象は、Discovery のどの読み取りにも現れない。発見の場面と参照の場面の表示範囲（提供開始前・提供終了・閉店・休業・終了・中止）は Discovery の `VisibilityPolicy` だけが定める
- 店名・住所による店舗の照合（既存店舗の確認、登録申請の照合、代理登録の前の確認）は、Place のポートの1つの問い合わせが提供する。非公開の店舗を含めるかどうかは引数で決める
- 管理側の読み取り（管理する対象の一覧、状態別の掲載の一覧、所属店舗、参加店舗、サービス運営者が非公開を含めて探す読み取り）は、各ドメインのリポジトリの問い合わせが提供する
- Discovery のポートは複数のドメインの集約にまたがる問い合わせを、ドメインの語彙で定める。アダプターは保存先に合わせて実現する
- Application の `ApplicationReviewDesk`（承認者の対応を待つ申請）と `OverdueNoticeLedger.findPageDue`（確認の期間を過ぎた申請）は、申請と Authority の管理体制（対象に管理者がいるかどうか）にまたがる読み取りで、同じくドメインの語彙で定め、アダプターが実現する
- Authority の `StewardedTargetDirectory`（管理権限の対象があることと、その名称）は、店舗・地域・イベントにまたがる読み取りで、同じくドメインの語彙で定め、アダプターが実現する。管理権限の対象の名称を返すユースケースは、この読み取りだけを使う

### 申立てに基づく写真の削除

申立てに基づく写真の削除は、写真を持つ各ドメイン（Place、Listing、Region、Occasion、Article）が、同じ形の集約の振る舞いとユースケースを持つ。Moderation は写真の削除のユースケースを持たず、申立ての対応の記録と結果のメールだけを持つ。写真の削除と、申立てを対応済みにする操作は、別の UnitOfWork で確定する。

- 集約の振る舞いは `takeDownPhotos(entity, photoIds: readonly [PhotoId, ...PhotoId[]], now)`。申立てを受け取らない。共有カーネルの `PhotoSet.takeDown` で写真を外し（対象の写真でない `PhotoId` が混じれば `{subject}_PHOTO_NOT_FOUND` で、1枚も外さない）、`published` の対象が公開条件を欠けば `Publication.unpublish`（`photoTakedown`）で `unpublished` にする。運営による非公開の間も同じ
- ユースケースは `takeDown{Place|Listing|Region|Occasion|Article}Photos`。入力は、申立ての ID、対象の ID、`photoIds`。サービス運営者（`operate_service`）だけが行う。Moderation の `TakedownClaimRepository.findById` で申立てを読み（なければ `NotFoundError`）、`TakedownClaim.authorizePhotoRemoval` で、申立てが未対応で、対象がこの申立ての対象であることを確かめる（不成立は `TAKEDOWN_CLAIM_ALREADY_RESOLVED` → `TAKEDOWN_TARGET_MISMATCH` の順）。申立ては書き込まない
- ドメインイベントは `{domain}.photos_taken_down`。ペイロードは `{ <対象の ID>; photoIds: readonly PhotoId[]; unpublished: boolean }` で、`unpublished` は、この削除で公開していない状態になったかどうか。店舗は公開状態を持たないので、`unpublished` を持たない。公開していない状態になった掲載・地域・イベントは、あわせて `{domain}.unpublished`（`reason: "photoTakedown"`）を出す（読みものは `unpublished` のドメインイベントを持たない）。外した写真は `photos.released` に載せる

### 写真の持ち主

- 写真（`PhotoAsset`）は登録の時点では持ち主を持たず、同意と登録した人だけを持つ。写真を載せた集約または申請の保存・提出と同じ UnitOfWork で、持ち主（`PhotoOwnerRef`）が設定される
- 申請の承認は、採用した写真の持ち主を、申請から反映先の集約に付け替える。掲載の複製は、写真を複製して新しい `PhotoAsset` を作る。1つの写真の持ち主は常に1つ以下
- 持ち主が手放した写真は `PhotosReleased` で削除される。登録から一定の期間（設定値）持ち主が設定されない写真は、Media の日次のジョブが削除する

## 開発の順序との対応

| 段階（契約 T-03） | ドメイン |
| --- | --- |
| 1. アカウント、管理権限、申請の共通の進み方 | Account、Authority、Application（進み方、前提、承認者の判断）、Media、Notification（基盤と段階1の出来事） |
| 2. 店舗・スポット、カテゴリー、掲載 | Area、Place、Listing、Application（店舗・掲載の5種）、Moderation（店舗・掲載が対象）、Discovery（`VisibilityPolicy`、`ReferenceQueries`、店舗詳細・掲載詳細・対象の選択の候補。どれも店舗・掲載の範囲）、Notification（段階2の出来事） |
| 3. 地域、イベント | Region、Occasion、Application（所属・離脱・参加の3種）、Moderation（地域・イベントが対象に加わる）、Discovery（地域詳細・イベント詳細、`ReferenceQueries` の地域・イベント、店舗詳細・掲載詳細の所属地域とイベントの区分）、Notification（段階3の出来事） |
| 4. 閲覧者向け機能 | Discovery（フィード、絞り込み、地図、検索、一覧）、Bookmark |
| 5. 読みもの、通知 | Article、Moderation（読みものが対象に加わる）、Discovery（読みもの、`ReferenceQueries` の読みもの、詳細の読みものの区分）、Notification（残りの出来事と通知一覧） |

- Discovery の `ReferenceQueries`（`resolve`・`isViewable`）は段階2から使う（店舗の照合の写真の代用、店舗・掲載の申請の提出、申立てと連絡の提出）。対象の種類は、そのドメインの段階で加わる
- 各段階の Notification は、その段階の対象に関わる管理・運営機能の一部として入る（契約 T-03「各段階には、その対象に関わる管理・運営機能を含める」）。通知一覧は段階5
