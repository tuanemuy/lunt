# ドメイン一覧

Lunt のドメインの境界、依存方向、ドメインをまたぐ規約を定める。各ドメインの詳細はドメインごとのファイルが定める。

この層では、催し（祭り・マルシェなど）を「イベント」、ドメインで起きた出来事の記録を「ドメインイベント」と呼び分ける。催しのドメインの英語名は `Occasion` とする。

「代行」は、サービス運営者が対象の管理者・運営者の代わりに行うことの総称で、次の2つの場合に分けて呼ぶ。

- 不在の代行: 管理者・運営者がいない対象について、サービス運営者が行う（B-14、R-11、E-09）。Authority の `AccessPolicy` の結果（`AccessDecision`）の `basis` が `absence_proxy` の場合に当たる。運営者が不在の地域・イベントへの申請の判断もこれに当たる
- 期間超過の代行: 地域運営者・イベント運営者が一定の期間確認していない申請を、サービス運営者が承認・否認する（P-78、I-13）

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

ユースケース（application 層）は、複数のドメインのポートと振る舞いを呼んで合成する（例: `withdraw` が Authority の管理体制と名簿を同じ UnitOfWork で書き換える、申立ての提出が Discovery の `ReferenceQueries.isViewable` を事実として読む、消費者が他のドメインのドメインイベントを受け取る）。ユースケースによる合成は、依存に数えない。ユースケースは、主に書き換える集約、または結果を返す読み取りを持つドメインのファイルに置く。種類をまたぐ参照（`ContentRef`）で対象を受け取り、`kind` で対象のドメインの集約を呼び分けるユースケースは、その操作を許す判断を持つドメインのファイルに置く（Moderation の `takeDownPhotosByClaim`）。

| ドメイン | 依存するドメイン | 理由 |
| --- | --- | --- |
| Area、Media、Account、Authority、Listing、Article、Moderation、Bookmark | なし | |
| Place、Region、Occasion | Area | 所在地のエリア |
| Application | Place、Listing、Occasion、Authority | 申請の内容に、対象のドメインの値オブジェクトを使う。`ApproverPolicy` は Authority の `AccessDecision` を引数に使う |
| Discovery | Area、Place、Listing、Region、Occasion、Article、Authority | 読み取り専用。各ドメインの状態の型と純粋な関数（Place の `PlaceMatching.searchableText`、Listing の `ListingMatching.searchableText` など）を使う。対象の選択の候補の「管理者のいない店舗」の判定に、Authority の `Stewardship.isVacant` を使う |
| Notification | ドメインイベントを出すすべてのドメイン | 告知を取り出し、宛先と行き先を決める純粋な関数が、各ドメインのドメインイベントの型と、その判断に要る値の型（Authority の管理体制・名簿・役割、Application の承認者の席・申請の種類・申請者、Moderation の申立ての結果・連絡の対象など）を引数に使う |

- 循環はない。Discovery と Notification は最下流にあり、どのドメインのドメイン層からも参照されない
- Place・Listing・Region・Occasion・Article は互いに依存しない。関係は、関係を持つ側の集約が相手の ID を持つ（掲載は `PlaceId`、所属は `PlaceId` と `RegionId`、参加は `OccasionId`・`PlaceId`・`ListingId`、関連づけは `OccasionId` と `RegionId`、紹介先は `ShowcaseRef`）
- 写真を持つドメインは、写真について共有カーネルの `PhotoId`・`PhotoSet`・`RevisedPhotos`・`PhotosReleasedEvent`・`PhotosTakenDownEvent` だけを参照し、Media と Moderation に依存しない。Media は、共有カーネルのドメインイベント `photos.released` だけを消費し、他のドメインに依存しない

他のドメインの状態に基づく規則（例: 店舗管理者のいる店舗への修正の申請は受け付けない、添えられる掲載はその店舗の公開中の掲載に限る）は、規則を持つドメインの振る舞いが「事実」を引数で受け取って判断する。事実（店舗管理者の有無、掲載の公開状態など）はユースケースが他のドメインのポートから読んで渡す。ドメインの振る舞いは他のドメインのポートを呼ばない。

## 共有カーネル

`domain/common` に置く。どのドメインにも属さない、型と純粋な関数だけを持つ。

`BusinessRuleError` のコードの規則は、すべてのドメインと共有カーネルに共通する。

- コードは、定めるドメインの英語名の SNAKE_CASE を接頭辞にして始める（例: `AUTHORITY_LAST_OPERATOR`、`OCCASION_PLACE_HAS_STEWARD`）。共有カーネルの接頭辞は `COMMON`
- 集約・型の名前を主語にするときは、接頭辞の後に続ける（例: `LISTING_CATEGORY_NOT_FOUND`、`MODERATION_TAKEDOWN_CLAIM_ALREADY_RESOLVED`、`COMMON_PUBLICATION_INVALID_TRANSITION`）
- 値オブジェクトの生成の失敗は `{接頭辞}_INVALID_{値の名前の SNAKE_CASE}`（例: `LISTING_INVALID_NAME`、`MODERATION_INVALID_TAKEDOWN_REASON`、`COMMON_INVALID_DATE_RANGE`）

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
| `AreaCode` | 町域の郵便番号（7桁の数字）のブランド型。エリアの識別子。Area の `AreaCatalog` に存在する値だけが `Address` に入る（マスターにあるかどうかは `AreaCatalog` が答える） |
| `Address` | `{ areaCode: AreaCode; prefecture: string; municipality: string; town: string; rest: string }`。対象のエリアは `areaCode`。利用者は町域を選び、`rest`（町域より後の部分）を入力する。`Address` は Area の町域（`Town`）からだけ作る（1つの `AreaCode` に複数の町域が対応しうるため、`areaCode`・`prefecture`・`municipality`・`town` の組は町域が決める）。事業所固有の郵便番号は `AreaCode` にならない |
| `Address.text(address: Address): string` | `prefecture`・`municipality`・`town`・`rest` を、この順に区切りなしでつないだ文字列。所在地をキーワードの一致の対象（`SearchableText`）にするときに使う |

日付で決まる状態（掲載の提供状態、イベントの開催の状態）は、保存せず、`LocalDate` を引数に取る純粋な関数で求める。その状態で絞り込む・数える問い合わせの契約は、ドメインの純粋な関数が内容から求めた暦日（Listing の `Offering.startsOn`・`Offering.lastAvailableOn`、イベントの開催期間の両端）と今日の暦日の比較で書く。アダプターは、暦日を保存の時点でドメインの関数から求めて持ち、状態を求める規則を持たない。

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
- 遷移と判定の順序は、下の「公開状態と運営による非公開の関数」だけが持つ。不正な遷移は `BusinessRuleError`（コード `COMMON_PUBLICATION_INVALID_TRANSITION`）。公開条件を欠く公開は、`BusinessRuleError`（コード `{LISTING|REGION|OCCASION|ARTICLE}_PUBLISH_CONDITION_UNMET`）
- `reason` は、管理者・運営者・編集担当者の操作による `byManager` と、申立てによる写真の削除で公開条件を欠いた `photoTakedown` を区別する（管理側の画面がこの区別を示す）。掲載・地域・イベント・読みものは同じ表現を使う
- `published` の対象の内容が公開条件を欠くと（申立てによる最後の写真の削除）、集約の振る舞いが `unpublished`（`photoTakedown`）にする。公開条件を欠く内容での `published` の対象の更新は、公開と同じく、不足する項目を添えた `{subject}_PUBLISH_CONDITION_UNMET` の `BusinessRuleError`

### 運営による非公開

掲載・店舗・地域・イベントに共通する。公開状態に重なる別の状態。

```ts
type Suspension = Readonly<{ suspended: boolean }>;
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

`subject` は対象のドメインの英語名で、エラーコードの接頭辞になる。

| 関数 | 判定（上から順）と結果 |
| --- | --- |
| `Publication.publish(state: Exposure, missing: readonly unknown[], now: Date, subject)` | 運営による非公開なら `{subject}_SUSPENDED`。`published` なら `COMMON_PUBLICATION_INVALID_TRANSITION`。`missing`（公開条件のうち欠けている項目）が空でなければ、項目を添えた `{subject}_PUBLISH_CONDITION_UNMET`。どれにも当たらなければ `published` を返す。`firstPublishedAt` は、`draft` からの公開では `now`、再公開では変わらない |
| `Publication.unpublish(state: Exposure, reason, subject)` | `reason` が `byManager` のとき、運営による非公開なら `{subject}_SUSPENDED`。`published` でなければ `COMMON_PUBLICATION_INVALID_TRANSITION`。どれにも当たらなければ、`reason` を持つ `unpublished` を返す。`photoTakedown` は運営による非公開を判定しない |
| `Suspension.suspend(s: Suspension, subject)` | すでに運営による非公開なら `{subject}_ALREADY_SUSPENDED`。そうでなければ `{ suspended: true }` を返す |
| `Suspension.unsuspend(s: Suspension, subject)` | 運営による非公開でなければ `{subject}_NOT_SUSPENDED`。そうでなければ `{ suspended: false }` を返す |

エラーはどれも `BusinessRuleError`。読みものは `Suspension` を持たず、`{ suspended: false }` を渡す。店舗は `Suspension` の関数だけを使う。

### 閲覧できる対象

対象が閲覧できるかどうかは、Discovery の `VisibilityPolicy` の `is…Viewable`（種類ごとの純粋な関数。[discovery.md](discovery.md)）だけが定める。

ユースケースが「対象が閲覧できるか」を求める経路は、書き込みの条件にするか表示のために読むかを問わず、対象の集約を自分で読むかどうかだけで決まる。対象の集約を自分で読むユースケース（例: 直接の追加の店舗、開催地域の関連づけの地域、店舗の所属地域の状況、申請の提出・提出の前の見え方の確認・申請を始められるかの確認で内容と前提の事実のために読む店舗・掲載・イベント、連絡の提出で紐づく店舗のために読む掲載、申請の判断の画面の読み取りで内容の見比べのために読む店舗・掲載）は、読んだ集約に `VisibilityPolicy` の `is…Viewable`（純粋な関数）を当て、同じ対象を `ReferenceQueries.isViewable` で読み直さない。掲載には、紐づく店舗の集約も読んで当てる。対象の集約を読まず、参照（`ContentRef` とその部分型、または ID）だけで対象を扱うユースケース（例: 申立ての提出、申請の提出のうち対象を読まないもの、申請の判断の画面の読み取りのうち内容の見比べに使わない対象）は、Discovery の `ReferenceQueries.isViewable` で読む。

閲覧できることを書き込みの条件にしない操作は、閲覧できるかどうかを読まない。申請の承認・否認・差し戻しと再提出は、対象が閲覧できなくても成立する。読みものの紹介先は、指す対象が閲覧できなくても結びつけて保存できる（[article.md](article.md)）。保存は対象と日時だけを書き込み、閲覧できるかどうかは保存一覧の解決と詳細の読み取りの時点で扱う。申請の判断の画面の読み取り（Application の `getApplicationForReview`）は、対象が閲覧できるかどうかを表示のために上の経路で求め、判断の可否には使わない。

### 写真の並び

```ts
type PhotoSet<P extends { photoId: PhotoId }> = Readonly<{
  items: readonly P[]; // 順序つき。1枚目が代表写真。PhotoId の重複はない
  takenDown: boolean; // 申立てに基づいて写真が削除されたか
}>;
```

掲載は `P = { photoId: PhotoId; framing: Framing | null }`、店舗・地域・イベント・読みものは `P = { photoId: PhotoId }`。

`takenDown` は、申立てに基づいて写真が削除されたことを、管理する人が写真を変えて保存するまで管理側に示すための事実。写真の並びを作る・変える書き込みは、次の関数だけを通す。

| 関数 | 結果 |
| --- | --- |
| `PhotoSet.of(items: readonly P[], subject): PhotoSet<P>` | `takenDown` が `false` の並び。集約・申請の内容を新しく作るときに使う。`items` に同じ `PhotoId` が重なれば `BusinessRuleError`（`{subject}_DUPLICATE_PHOTO`。`subject` は「公開状態と運営による非公開の関数」の `ExposureSubject`） |
| `PhotoSet.replace(current: PhotoSet<P>, items: readonly P[]): PhotoSet<P>` | 保存されている並びを `items` に置き換える。`items` の `PhotoId` の並びが `current.items` と同じなら `takenDown` を保ち、違えば `false` にする。内容の保存と、承認による反映（`RevisedPhotos.overlay`）が使う |
| `PhotoSet.takeDown(photos: PhotoSet<P>, photoIds: readonly [PhotoId, ...PhotoId[]], subject)` | 申立てに基づく写真の削除が使う。`photoIds`（重複なし）のすべてを外し、`takenDown` を `true` にした並びを返す。残る写真の順序は変わらない。`photos.items` にない `PhotoId` が混じれば、1枚も外さず `BusinessRuleError`（`{subject}_PHOTO_NOT_FOUND`。`subject` は「公開状態と運営による非公開の関数」の `ExposureSubject`） |

### 写真の修正

```ts
type RevisedPhotos<P extends { photoId: PhotoId }> = readonly (P & { origin: "current" | "added" })[];
```

修正の申請（店舗の情報修正、掲載の修正）の写真の項目の値。写真ごとに、提出の時点で対象にあった `current` か、修正が新たに添えた `added` かを持つ。`PhotoId` の重複はない。

| 関数 | 結果 |
| --- | --- |
| `RevisedPhotos.between(current: PhotoSet<P>, desired: PhotoSet<P>): RevisedPhotos<P>` | `desired.items` の並びのまま、`current.items` に同じ `PhotoId` がある写真を `current`、ない写真を `added` にする |
| `RevisedPhotos.overlay(current: PhotoSet<P>, revised: RevisedPhotos<P>): PhotoSet<P>` | `revised` の並びから、`origin` が `current` で、対象の現在の写真（引数の `current.items`）に同じ `PhotoId` がないものを除いた並び（`origin` は外す）で、`PhotoSet.replace(current, …)` の結果を返す。提出の後に対象から外れた写真は戻らない |
| `RevisedPhotos.addedPhotoIds(revised: RevisedPhotos<P>): readonly PhotoId[]` | `added` の写真の `PhotoId`。申請が持ち主になる写真はこれだけ |

### 修正の申請

店舗の情報修正と掲載の修正の申請の内容は、変更した項目だけを持つ `FieldPatch` で表す。各ドメインは、変更の直和型（`Change`）と、項目ごとの読み方・比べ方・重ね方（`FieldPatchSchema`）と、そのドメインに固有の規則だけを持つ（Place の `PlaceRevision = FieldPatch<PlaceChange>`、Listing の `ListingPatch = FieldPatch<ListingChange>`）。

```ts
type FieldChange = Readonly<{ field: string; value: unknown }>;
type FieldPatch<C extends FieldChange> = readonly [C, ...C[]]; // 1つ以上。同じ field は1つまで

type ValueOf<C extends FieldChange, F extends C["field"]> = Extract<C, { field: F }>["value"];

// S は対象の内容。Current は項目ごとの、対象の現在の値の型（写真の項目は PhotoSet、ほかは変更の値と同じ型。
// 公開していない対象で項目が欠けうるときは、その型と null の合併。例: 一時非公開の掲載の名称・カテゴリー）
type FieldPatchSchema<S, C extends FieldChange, Current extends { [F in C["field"]]: unknown }> = Readonly<{
  order: readonly C["field"][]; // 項目の定義の順
  photoField: C["field"] | null; // 値が RevisedPhotos の項目
  fields: { [F in C["field"]]: Readonly<{
    read(state: S): Current[F];                           // 対象の現在の値
    equals(a: Current[F], b: Current[F]): boolean;        // 値の等価性
    propose(current: Current[F], desired: Current[F]): ValueOf<C, F>; // 変更の値。写真は RevisedPhotos.between、ほかは desired
    overlay(state: S, value: ValueOf<C, F>): S;           // 1項目を重ねる。写真は RevisedPhotos.overlay、ほかは値の置き換え
  }> };
}>;

type FieldComparison<C extends FieldChange, Current extends { [F in C["field"]]: unknown }> = {
  [F in C["field"]]: Readonly<{ field: F; current: Current[F]; proposed: ValueOf<C, F> }>;
}[C["field"]];
```

| 関数 | 結果 |
| --- | --- |
| `FieldPatch.create(changes: readonly C[]): FieldPatch<C>` | 項目が0件、または同じ `field` が重なれば `BusinessRuleError`（`COMMON_INVALID_FIELD_PATCH`） |
| `FieldPatch.between(schema, current: S, desired: S): FieldPatch<C>` | `order` の順に、`equals` で値が違う項目だけを、`propose` の値で並べる。違う項目がなければ `COMMON_INVALID_FIELD_PATCH`。申請の提出と再提出は、この関数で内容を作る |
| `FieldPatch.preview(schema, current: S, patch: FieldPatch<C>): S` | `patch` のすべての項目を、`overlay` で対象の現在の内容に重ねる。項目にない値は対象の現在の値。提出の後に対象から外れた写真は戻らない（`RevisedPhotos.overlay`）。承認で反映する内容と、再提出・再申請の入力の初めの内容は、この結果になる |
| `FieldPatch.compare(schema, current: S, patch: FieldPatch<C>): readonly FieldComparison<C, Current>[]` | `order` の順に、`patch` の項目ごとの、対象の現在の値（`read`）と申請の値。承認者の判断に使う |
| `FieldPatch.addedPhotoIds(schema, patch: FieldPatch<C>): readonly PhotoId[]` | `photoField` の項目の `RevisedPhotos.addedPhotoIds`。写真の項目がなければ空。申請が持ち主になる写真はこれだけ |

- 承認は、すべての項目を反映する（`preview` の結果）。一部の項目だけを反映しない
- 同じ対象への複数の修正の申請は、それぞれ、読んだ時点の対象の現在の内容と見比べ、重ねる

### 写真の解放

```ts
type PhotosReleasedEvent = DomainEventBase<"photos.released", { photoIds: readonly PhotoId[] }>;
```

写真の解放は、写真の持ち主（集約または申請）が写真を手放すこと。写真を持つ集約と申請は、写真を手放したとき（写真を外して保存した、集約を削除した、申立てで写真が削除された、差し戻しからの再提出で申請が写真を外した）に、手放した `PhotoId` を載せた `photos.released` の下書きを返す。Media がこれを消費して写真を削除する。否認・取り下げ・失効で終わった申請は、写真を手放さない（下の「写真の持ち主」）。

### キャッチコピー

`Tagline` は、前後の空白を除いた1〜60文字の文字列のブランド型。地域とイベントが同じ型を使う。掲載はキャッチコピーを持たない。

### 文字列の正規化

`TextNormalization.normalize(input: string): string` は、Unicode の NFKC 正規化、ロケールに依存しない Unicode の既定の小文字化（ASCII の外の文字にも当たる）、空白（全角を含む）の除去を、この順に行う。キーワードや店名・住所の一致を定める規則（下の「キーワードの一致」、Place の `PlaceMatching`）は、どれもこの関数で正規化した値を比べる。保存先にかかわらず、一致の結果はこの定義で決まる。

### キーワードの一致

Discovery のキーワード検索（店舗・掲載・地域・イベント・読みものの5種類）と対象の選択の候補（店舗・掲載・地域・イベントの4種類）と、サービス運営者が非公開を含めて1つのキーワードで掲載・地域・イベントを探す読み取り（Listing の `ListingRepository.searchForOperation`、Region の `RegionRepository.searchForOperation`、Occasion の `OccasionRepository.searchForOperation`）は、この一致と関連度で決まる。対象の `SearchableText`（対象の文字列の全体）は、その種類のドメインの純粋な関数（Place の `PlaceMatching.searchableText`、Listing の `ListingMatching.searchableText`、Region の `Region.searchableText`、Occasion の `Occasion.searchableText`、Article の `Article.searchableText`）だけが定め、閲覧者向けの読み取り（Discovery の `SearchRelevance`）とサービス運営者の読み取り（`searchForOperation`）は同じ値を使う。店名と住所を別々に入れる照合（既存店舗の確認、登録申請の自動の照合、サービス運営者が名称・所在地で店舗を探す操作）は、Place の `PlaceMatching` が定める。

```ts
type SearchKeyword = Readonly<{ terms: readonly [string, ...string[]] }>; // 正規化済みの語。重複なし、初出の順
type SearchableText = Readonly<{ primary: string; secondary: readonly string[] }>; // 値のない項目は含めない
```

`SearchKeyword.parse(input: string): SearchKeyword | null`

1. 前後の空白を除いた `input` が100文字を超えれば `BusinessRuleError`（`COMMON_INVALID_SEARCH_KEYWORD`）
2. Unicode の NFKC 正規化を行い、空白で語に分ける（全角の空白は NFKC で半角になる）
3. 各語を `TextNormalization.normalize` で正規化する。空の語を除き、同じ語を1つにまとめる。順序は初出の順
4. 語が1つもなければ（空、または空白だけのキーワード）`null`

`SearchKeyword.create(input: string): SearchKeyword` は、`parse` の結果が `null` なら `BusinessRuleError`（`COMMON_INVALID_SEARCH_KEYWORD`）。キーワードを必須とする読み取りは `create`、空のキーワードを空の結果にする読み取り（対象の選択の候補）は `parse` を使う。等価性は `terms` の順序を含む一致。

| 関数 | 定義 |
| --- | --- |
| `KeywordRelevance.termScore(text: SearchableText, term: string): 0 \| 1 \| 2 \| 3 \| 4` | 各文字列を `TextNormalization.normalize` で正規化して比べる。正規化した語が空なら 0。`primary` が語と等しければ 4、語で始まれば 3、語を含めば 2。どれでもなく、`secondary` のどれかが語を含めば 1。それ以外は 0 |
| `KeywordRelevance.relevance(text: SearchableText, keyword: SearchKeyword): number` | すべての語の `termScore` が 1 以上なら、その和。どれかが 0 なら 0 |
| `KeywordRelevance.matches(text: SearchableText, keyword: SearchKeyword): boolean` | `relevance` が 1 以上 |

一致する対象は `matches` が成り立つもので、関連度の高い順は `relevance` の降順。

### メールアドレス

`EmailAddress` は、形式が正しく、前後の空白を除き、小文字にそろえた254文字以内の文字列のブランド型。等価性は値の一致。アカウント、招待の宛先、申立人の連絡先が同じ型を使う。

### 値の生成

共有カーネルの値は、次の関数だけで作る。規則を満たさなければ `BusinessRuleError`（コードは表のとおり）。各ドメインは、この関数を呼び、同じ規則を持たない。

| 関数 | 確かめること | コード |
| --- | --- | --- |
| `EmailAddress.create(raw: string): EmailAddress` | 前後の空白を除き、小文字にそろえた値が、形式が正しく254文字以内 | `COMMON_INVALID_EMAIL_ADDRESS` |
| `AreaCode.create(input: string): AreaCode` | 7桁の数字。形式だけを確かめ、正規化しない（利用者が入力した郵便番号の正規化は Area の `PostalCode.create`） | `COMMON_INVALID_AREA_CODE` |
| `DateRange.create(start: LocalDate, end: LocalDate): DateRange` | `start <= end` | `COMMON_INVALID_DATE_RANGE` |
| `GeoPoint.create(latitude: number, longitude: number): GeoPoint` | 緯度が -90〜90、経度が -180〜180 | `COMMON_INVALID_GEO_POINT` |
| `GeoBounds.create(southWest: GeoPoint, northEast: GeoPoint): GeoBounds` | 南西の緯度・経度が北東の緯度・経度以下 | `COMMON_INVALID_GEO_BOUNDS` |
| `Tagline.create(input: string): Tagline` | 前後の空白を除いた値が1〜60文字 | `COMMON_INVALID_TAGLINE` |

### 操作する人

```ts
type Actor = { accountId: AccountId };
```

ログインを必要としない操作（閲覧、取り下げの申立て）は、`Actor` を必須にしない。ログインしていなくても成立する。

`Actor` を作る境界は、アカウントがあることを確かめてから `Actor` を作る。退会したアカウントの要求は、ログインしていない要求として扱う（[account.md](account.md)）。境界が `Actor` を作った後に本人の退会がコミットしたときは、次のとおり。

- ユースケースが、同じ要求の中で操作する人本人のアカウントを `AccountRepository.findById` で読んで `null` だったときは、`UnauthorizedError`（ログインしていない要求と同じ）
- 本人のアカウントを読んだ後に退会がコミットし、そのアカウントの `save`・`delete` が失敗したときは、リポジトリが返したエラーをそのまま返してロールバックする（種類は `AccountRepository` の契約のとおり。ユースケースは翻訳しない）。次の要求は、境界がログインしていない要求として扱う

本人のアカウントを読むユースケースは、個別のエラーケースに書かなくても、この規則に従う。

## ドメインをまたぐ規約

### 操作の可否

操作の可否の規則は Authority の `AccessPolicy`（純粋な関数）だけが持つ。申請の判断と、申請者として申請を扱う操作だけは、Application の純粋な関数（`ApproverPolicy`、`isHandledBy`）が持つ。ユースケースは、操作する人の管理権限・役割と、対象の管理者の有無を Authority のポートから読み、`AccessPolicy` に渡す。この表は、操作と、可否を決める `AccessPolicy` の操作の種類または Application の関数の対応だけを定める。行える人と不在の代行の有無は `AccessPolicy` の表が定める。

| 操作 | `AccessPolicy` の操作の種類、または Application の関数 |
| --- | --- |
| 対象の管理（店舗の情報・営業状況・掲載、地域の情報・公開状態・所属店舗・関連づけ、イベントの情報・公開状態・開催の状態・参加店舗・開催地域、地域・イベントへの申請の一覧） | `manage_target` |
| 店舗として行う操作（代表地域の選択、店舗の所属状況・参加状況の確認、参加内容の変更、参加の取りやめ、店舗管理者として行う申請とその一覧、店舗への確認の依頼の閲覧） | `act_as_place` |
| 対象を開いて状態と管理者の有無を確かめる管理側の読み取り（`getManaged{Place\|Listing\|Region\|Occasion}`） | `inspect_target` |
| 管理メンバーの確認 | `view_members` |
| 管理メンバーの招待・招待の取り消し・辞任 | `invite_member`・`cancel_invitation`・`resign` |
| サービス運営者の操作（非公開を含めて対象をキーワードで探す読み取り、非公開を含めて店舗を店名・住所で探す読み取り、役割の持ち主の確認、管理者の権限の解除、地域・イベントの管理権限の付与、役割の付与・解除、運営による非公開、代理登録、地域・イベントの登録、カテゴリーの管理、申立て・連絡への対応） | `operate_service` |
| 読みものの作成・編集・公開 | `edit_articles` |
| 申請の判断 | Application の `ApproverPolicy`（`AccessPolicy` の結果と、`ReviewPolicy.proxyableAt` から決める） |
| 申請者として申請を扱う（確かめる、再提出する、取り下げる、再申請を始める） | Application の `isHandledBy`（個人の申請は申請者のアカウント、店舗管理者として行った申請は店舗の一致から決める。店舗の一致の前提になる店舗管理者の立場は `act_as_place`） |

ユースケースは、`AccessPolicy` の結果の `basis`（管理者か、不在の代行か、役割か）を見て可否を分岐しない。

### 申請の前提

申請の種類ごとの前提は Application の `Premise`（純粋な関数）だけが持つ。ユースケースが事実（店舗管理者の有無、申請者がその店舗の店舗管理者かどうか、所属の有無、参加の有無、掲載の有無、イベントの開催の状態、併せた登録申請の状態）を読んで渡す。

- 提出と承認は、前提が成り立たなければ成立しない
- 失効は「申請の種類ごとの前提が成り立たなくなった」という1つの規則による（P-77、I-19）。前提に関わるドメインイベント（管理者の就任と不在、所属の成立と解除、参加の成立、掲載の削除、イベントの終了と中止と開催期間の変更、登録申請の否認・取り下げ）の消費者が、関係する確認中・差し戻し中の申請の前提を再評価し、成り立たない申請を失効にする

### トランザクションとドメインイベント

- 書き込みを持つユースケースは `UnitOfWorkProvider.run(fn)` の中で実行する。スコープ内の書き込みは、すべて成功するか、1つも反映されないかのどちらかになる
- ドメインイベントは、集約の振る舞いが下書きとして返し、ユースケースが `collectEvents` で UnitOfWork に渡す。下書きの `occurredAt`（テンプレートの `DomainEventDraftBase`）は、下書きを返す振る舞いが引数で受け取る `now` で、ドメインイベントを返しうる振る舞いは、集約に書く日時がなくても `now` を取る。ドメインイベントは書き込みと同じスコープで Outbox（テンプレートの `OutboxRepository`、`application/ports/outboxRepository.ts`）に保存され、リレーが `OutboxRepository.claimPending` で取り出して配送する。配送は少なくとも1回で、順序は保証しない。消費者は冪等に作る
- 消費に失敗したドメインイベントはリレーが再配送する。再配送の上限に達したドメインイベントは、テンプレートの DLQ に移る。DLQ からの再投入は運用が行い、消費者は冪等なので再投入で続きが進む。spec は DLQ に移った後のアプリケーション内のフローを持たない
- 1つの要求の中で原子的に確定するもの: 集約の書き込み、その要求で変わる他の集約の書き込み（例: 申請の承認と承認で反映される内容、退会とその人の管理権限・役割の喪失、管理権限・役割を与える書き込みと相手のアカウントの版の更新、写真の持ち主の設定）、ドメインイベントの保存
- ドメインイベントの消費で結果整合にするもの: 前提の再評価による申請の失効、通知とそのメール、手放された写真の削除、退会に伴う保存の削除・個人の申請の取り下げ・通知の削除、申立ての結果のメール。消費者の一覧は [../flows/index.md](../flows/index.md) の「ドメインイベントと消費者」が持つ

### ドメインイベントの名前

ドメインイベントの型名は `"{主語}.{出来事}"`。主語は出来事の主語で、ドメインの名前（上の「ドメイン」の表の英語名の snake_case）、またはそのドメインの中の集約の名前（Listing の `category`、Moderation の `takedown_claim`・`info_report`）。共有カーネルのドメインイベントは `"photos.released"`（写真の解放）と `"content.photos_taken_down"`（申立てに基づく写真の削除）の2つで、主語は写真（`photos`）と、写真を持つ対象の総称（`content`。`ContentRef`）。出来事は過去形の snake_case で書く（例: `"listing.unpublished"`、`"place.operating_status_changed"`、`"category.retired"`）。ドメインの名前を主語にして、出来事の側に集約の語を含めてもよい（例: `"region.affiliation_established"`、`"authority.role_granted"`）。型名の一覧は [../flows/index.md](../flows/index.md) の「ドメインイベントと消費者」が持つ。

同じ出来事と、その出来事を起こす振る舞い・ユースケースには、ドメインをまたいで同じ語を使う。

| 出来事 | ドメインイベントの出来事の語 | 集約の振る舞い | ユースケース |
| --- | --- | --- | --- |
| 運営による非公開 | `suspended` | `suspend` | `suspend{Place\|Listing\|Region\|Occasion}` |
| 運営による非公開の解除 | `unsuspended` | `unsuspend` | `unsuspend{Place\|Listing\|Region\|Occasion}` |
| 公開・再公開 | ドメインイベントを出さない | `publish` | `publish{Listing\|Region\|Occasion\|Article}` |
| 公開していない状態への遷移 | `unpublished`（読みものは出さない） | `unpublish` | `unpublish{Listing\|Region\|Occasion\|Article}` |
| 申立てに基づく写真の削除 | `photos_taken_down`（共有カーネルの `content.photos_taken_down` の1つ） | `takeDownPhotos` | `takeDownPhotosByClaim`（Moderation。5種類の対象に1つ） |

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
- スコープ内の読み取りが、スコープを開いた後に他のスコープがコミットした書き込みを見るかどうか（スコープの中で1つのスナップショットに揃うか、読むたびに最新を返すか）は契約の外で、適合テストの対象にしない。ユースケースはどちらでも正しく動き、テストケースはどちらか一方に依る前提を持たない
- 集約のリポジトリ（集約とは別のポートで持つ記録を含む。ドメインごとのファイルが `UnitOfWorkContext` に入れるポート）は、`UnitOfWorkContext` からだけ得る。読み取りだけのユースケースも、集約のリポジトリを読むときは `run` を1つ使い、書き込まずに返す（テンプレートの `listTodos` と同じ）。`Actor` を作る境界の `AccountRepository.findById` も同じ
- UnitOfWork に参加しない読み取り専用のポート（Area の `AreaCatalog`、Discovery の読み取りのポート、Authority の `StewardedTargetDirectory`、Application の `ApplicationReviewDesk` など）は、コンテナから得て、`run` の外で呼ぶ
- 書き込みを持つユースケースは、集約のリポジトリからの読み取り（操作の可否の判断に使う読み取りと、振る舞いに渡す事実の読み取り）を、書き込みと同じ `run` の中で、書き込みの前に終える
- 外部への副作用（メールの送信、写真の複製）を書き込みの前に行うユースケースと、複数の `run` を使うユースケース（日次のジョブ、告知ごとに記録する消費者など）は、副作用・書き込みの前に、判定のための読み取りだけの `run` を使ってよい。書き込みの `run` の中で、書き込む集約を読み直して前提を確かめ直す（冪等な作成は、同じ ID・同じ内容の送り直しとして扱う）。書き込みの対象でない集約の事実は、最初の `run` で読んだものを使ってよい
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

- すべての集約は、振る舞いの表に `reconstruct`（保存された値から復元する。不変条件を欠く値は `RehydrationError`）を持つ。アダプターは読み取りでこれを通し、`RehydrationError` を `SystemError` に訳す
- 全体で1つ、または決まった少数しかない集約（カテゴリーの台帳、役割ごとの名簿）は、ID の代わりに決まったキーで読み書きし、`findById`・`save` と同じ楽観ロックの契約を持つ。`insert`・`delete` は持たない
- 作った後に内容が変わらず、書き込みがどれも冪等な集約（保存、通知）のリポジトリは、この4つのメソッドを持たず、楽観ロックを使わない。冪等な書き込みの契約は各ポートが定める
- `insert`: 同じ ID の集約があれば `ConflictError`。ID の一意性はポートが担保する
- `save`・`delete`: `findById` が返した `expectedVersion` と保存されている版が違えば `ConflictError`（楽観ロック）。対象がなければ（削除済みを含む）、版にかかわらず `NotFoundError`
- ID 以外の一意性（例: 同じ店舗と地域の所属は1つ）は、ポートが担保するか、1つの集約の不変条件にして楽観ロックで守る。「事前に検索して無ければ保存」で守らない。どちらで守るかは各ポートが定める
- 集約の版は、集約の振る舞いが進める。集約の状態を変える振る舞いは `version` を1つ進め、`updatedAt` を持つ集約はそれを `now` にする。状態が変わらない振る舞い（同じ内容の保存、同じ参加内容の保存など）は、集約をそのまま返し、版を進めない。アダプターは、振る舞いが返した版を保存する
- 参照整合性（他の集約の ID が指す先があること）を、ポートは担保しない。集約とは別のポートで持つ記録（Listing の `OfferingPhaseLedger`、Occasion の `HoldingStatusLedger`、Application の `OverdueNoticeLedger`）も同じで、ポートは記録が指す集約があることを確かめず、書き込みは成功する。指す先のない記録は、問い合わせの結果に現れない。指す先があることを書き込みの条件にする規則は、呼び出し側のユースケースが、書き込みの前に確かめる。条件にしない参照（読みものの紹介先、保存の対象など。各ドメインが定める）は確かめない。指す先がない参照と、参照先が後から消えた参照は、参照する側が閲覧できない対象として扱う
- 呼び出し側が ID を決めて送る集約を新しく作る要求は、同じ ID で同じ内容なら、書き込みもドメインイベントもなしに成功として扱い、同じ ID で違う内容なら `ConflictError` にする（冪等な作成）。ID が組のキーで決まる集約（参加、開催地域の関連づけ、保存）は対象でない。同じ組の送り直しの扱いは、各ドメインが定める
- 保存先の障害を `SystemError` にするのはアダプターの責務で、どのポートの契約の項目にも、適合テストにも入れない。ポートのエラーの列挙に `SystemError` を含めない
- ID やキーで集約を引く問い合わせ（`findByIds` など）は、0〜100件を受け取る。0件は空を返し、100件を超える入力は `BusinessRuleError`（`COMMON_INVALID_INPUT`）。呼び出し側が分けて呼ぶ。存在しない ID は結果に現れない。ID の集合を絞り込みの条件に使う一覧の問い合わせ（例: この店舗たちが行った申請）は、集合の件数に上限を持たない
- 一覧の問い合わせはテンプレートの `Pagination`（`page` は1始まり、`limit` は 1〜100）を取り、`PaginationResult`（`items` と、条件に合う全件数 `count`）を返す。並び順は各ポートが定め、同順位は ID の昇順で決める。ID の昇順は、文字列の Unicode のコードポイント順で、ロケールと照合順序に依存しない。範囲の外の `page` は空の `items` を返す

### エラーの種類

- ドメインの不変条件の違反と、値オブジェクトの生成の失敗は `BusinessRuleError`（コードつき。コードの規則は「共有カーネル」）
- application 層のエラーは、テンプレートの `NotFoundError`・`ConflictError`・`UnauthorizedError`（ログインが必要）・`ForbiddenError`（操作の可否で拒まれた）・`SystemError`
- 閲覧者として対象を開く・操作する要求（閲覧側の読み取り、申請の提出の前の見え方の確認など。ログインしていない要求を含む。次の項目の要求を除く）では、閲覧できない対象を、存在しない対象と同じ `NotFoundError` で表す
- 閲覧できない対象を、別の対象に添える・関連づける・申請や申立て・連絡の対象にする要求（参加に加える店舗、開催地域、申請の対象など）は、それぞれのドメインの `BusinessRuleError`（例: `OCCASION_PLACE_NOT_VIEWABLE`、`OCCASION_REGION_NOT_VIEWABLE`、`APPLICATION_TARGET_NOT_VIEWABLE`）。閲覧できることを書き込みの条件にしない操作（「閲覧できる対象」。読みものの紹介先など）は除く
- 管理する人・サービス運営者が管理の読み取り・操作で扱う対象そのもの（下書き・公開の取り下げ・運営による非公開のものを含む）は、閲覧できるかどうかで拒まない。対象がなければ `NotFoundError`。対象がないことと操作の可否の拒否の両方に当たるときは、ユースケースが判定の順を定める場合を除き、対象がないことを先に判定して `NotFoundError` にする。この規則は操作の対象そのもの（指して開く・操作する店舗・掲載・地域・イベント・申請など）に当たり、操作に加える関係の相手（参加に加える店舗、関連づける地域など）の有無は、操作の可否の後にそれぞれのドメインのエラーで判定する（画面は対象がないこと（CS-17）を示す。ID は推測できない値なので、対象の有無が権限のない利用者に分かっても実害は小さい）
- 入力の形の誤りのうち転送境界で確かめないもの（ID やキーの件数の超過、マスターにない町域の指定など）は、`BusinessRuleError` のコード `COMMON_INVALID_INPUT`、またはそのドメインが定めるコードで返す

### ユースケースの名前

ユースケースの名前は、テンプレートの関数名と同じ camelCase の英語（例: `publishListing`）。テストケースのファイル名と一致する。名前と入出力に画面の語彙を使わない。

ドメインをまたいで同じ役割を持つユースケースは、同じ形の名前を使う。出来事を起こすユースケースは「ドメインイベントの名前」の表による。サービス運営者が非公開を含めてキーワードで探す読み取りは `search{Listings|Regions|Occasions}ForOperation`（サービス運営者は店舗をキーワードで探さない）、店名・住所で店舗を探す読み取りは、利用者向けの `matchPlaces` に対して `matchPlacesForOperation`、ID で開く読み取りは `getManaged{Place|Listing|Region|Occasion}`。

### 時刻と ID

ドメインは現在時刻と ID を自分で作らない。`Clock`・`IdGenerator` ポート（application 層）の値を引数で受け取る。

### 編集の競合

人が内容を編集して保存する要求（店舗・掲載・地域・イベント・読みものの内容の更新、営業状況の変更、参加内容の変更、申請の再提出と取り下げ）と、内容を見て判断する要求（申請の承認・否認・差し戻し）は、読んだときの版を要求に含める。ユースケースは、保存されている版と違えば `ConflictError` にする（他の人が先に保存した。再読み込みして操作し直す）。入力の値の誤り（値オブジェクトの生成の失敗）は版の比較より先に判定する。状態を変えるだけの要求（公開、非公開、中止、対応済みなど）は版を含めず、すでにその状態であることは前提の変化として `BusinessRuleError` で返し、同時の書き込みは `save` の楽観ロックで守る。状態のエラーは版の比較より先に判定する。

### 時間の経過で起きる出来事

提供状態と開催の状態は日付から求めるので、保存された状態の遷移を持たない。状態が変わった出来事（掲載の提供終了、イベントの終了。掲載の提供終了は、期日によるものも管理する人の操作によるものも含む）を必要とする消費者（通知、申請の前提の再評価）のために、日次のジョブが、集約の外の確認記録と今日の状態を比べ、違えば記録を更新してドメインイベントを出す。

- 確認記録は、対象の ID、最後に確かめた状態、確かめた時点の集約の版、状態が次に変わる暦日を持つ。次に変わる暦日は、ドメインの純粋な関数（Listing の `OfferingStatus.nextChangeOn`、Occasion の `HoldingStatus.nextChangeOn`）が返す。次に変わらなければ `null`
- 確かめる対象を返す問い合わせの契約は「記録がない、または記録の版が集約の版と違う、または次に変わる暦日が今日以前」だけで、版と暦日を比べる。状態を求める規則はドメインの関数だけが持ち、アダプターは持たない
- ジョブは、対象の今日の状態をドメインの関数で求め、記録を置き換える。記録の状態から今日の状態への変化が出来事に当たる（提供終了になった、終了になった）ときだけ、ドメインイベントを出す
- 記録は Listing と Occasion がそれぞれ、集約とは別のポートで持つ。ジョブの書き込みは集約の版を進めない
- ジョブの処理の単位と、失敗したときの進め方は、[../flows/index.md](../flows/index.md) の「共通の前提」の日次のジョブの規則による

運営者が一定の期間確認していない申請の通知（P-97）は、Application の日次のジョブが、期間超過の代行ができる申請（`ApplicationReviewDesk` の `asOverdueProxy`）を、申請ごとの通知済みの記録（Application の `OverdueNoticeLedger`）と比べて出す。

### 読み取り

- 閲覧者に見せる読み取り（フィード、絞り込み、地図、検索、詳細、保存一覧の解決、対象の選択の候補）は Discovery のポートが提供する。閲覧できない対象の内容は、Discovery のどの読み取りにも現れない（参照の解決は、閲覧できないことだけを返す）。発見の場面と参照の場面の表示範囲（提供開始前・提供終了・閉店・休業・終了・中止）は Discovery の `VisibilityPolicy` だけが定める
- 店名・住所による店舗の照合（既存店舗の確認、登録申請の自動の照合、サービス運営者が名称・所在地で店舗を探す操作）は、Place のポートの1つの問い合わせ（`PlaceRepository.match`）が提供する。非公開の店舗を含めるかどうかは引数で決める
- 管理側の読み取り（管理する対象の一覧、状態別の掲載の一覧、所属店舗、参加店舗、サービス運営者が非公開を含めて探す読み取り）は、各ドメインのリポジトリの問い合わせが提供する
- Discovery のポートは複数のドメインの集約にまたがる問い合わせを、ドメインの語彙で定める。アダプターは保存先に合わせて実現する
- Application の `ApplicationReviewDesk`（サービス運営者の対応を待つ確認中の申請。サービス運営者が承認者である申請 `asApprover` と、期間超過の代行ができる申請 `asOverdueProxy` の2つの区分）は、申請と Authority の管理体制（承認者の席の地域・イベントに運営者がいるかどうか）にまたがる読み取りで、同じくドメインの語彙で定め、アダプターが実現する。区分ごとに返す申請は、このポートの契約（[application.md](application.md)）が定める。申請と管理体制にまたがる読み取りは、このポートだけが持つ。期間超過の代行ができる申請（`asOverdueProxy`）には、ユースケースが `ReviewPolicy.overdueCutoff(policy, now)` で求めた `pendingSinceBefore` を渡し、アダプターは日時の比較だけを持つ。`OverdueNoticeLedger` は通知済みの記録の読み書き（`findByApplicationIds`、`record`）だけを持つ
- Authority の `StewardedTargetDirectory`（管理権限の対象があることと、その名称）は、店舗・地域・イベントにまたがる読み取りで、同じくドメインの語彙で定め、アダプターが実現する。管理権限の対象を種類をまたいで（`StewardedRef` で）扱う Account・Authority のユースケースは、対象の有無と名称をこの読み取りで読み、対象のドメインのリポジトリを読まない。1つの種類の対象を読むユースケース（例: Place の `listStewardedPlaces`）は、そのドメインのリポジトリを読む
- Moderation の `ContentDirectory`（対象の有無、名称、現在の写真）は、掲載・店舗・地域・イベント・読みものにまたがる読み取りで、同じくドメインの語彙で定め、アダプターが実現する。申立て・連絡の対象を読むユースケースと、Notification・Application が対象（`ContentRef`）の読んだ時点の名称を解決するユースケースが使う

### 申立てに基づく写真の削除

申立てに基づく写真の削除は、Moderation の1つのユースケース `takeDownPhotosByClaim` が行い、写真を持つ各ドメイン（Place、Listing、Region、Occasion、Article）は同じ形の集約の振る舞いだけを持つ。申立人への結果のメールは、Notification の `sendTakedownOutcome` が `takedown_claim.resolved` を消費して送る。写真の削除と、申立てを対応済みにする操作は、別の UnitOfWork で確定する。

- 集約の振る舞いは `takeDownPhotos(entity, photoIds: readonly [PhotoId, ...PhotoId[]], now)`。申立てを受け取らない。共有カーネルの `PhotoSet.takeDown` で写真を外し（対象の写真でない `PhotoId` が混じれば `{subject}_PHOTO_NOT_FOUND` で、1枚も外さない。`takenDown` は `true` になる）、`published` の対象が公開条件を欠けば `Publication.unpublish`（`photoTakedown`）で `unpublished` にする。運営による非公開の間も同じ
- ユースケースは `takeDownPhotosByClaim`。サービス運営者（`operate_service`）だけが行う。申立てを読み、`TakedownClaim.authorizePhotoRemoval` で削除できるかを確かめ、`target.kind` で対象のドメインのリポジトリ（`UnitOfWorkContext` から得る）と `takeDownPhotos` を呼び分ける。申立てと、対象・写真の関係の規則は `authorizePhotoRemoval` だけが持ち、ユースケースは述べない。申立ては書き込まない。呼び分けは application 層の合成で、対象のドメインは Moderation に依存しない
- ドメインイベントは共有カーネルの `content.photos_taken_down` の1つ。`unpublished` は、この削除で公開していない状態になったかどうかで、店舗は公開状態を持たないので常に `false`。公開していない状態になった掲載・地域・イベントは、あわせて `{domain}.unpublished`（`reason: "photoTakedown"`）を出す（読みものは `unpublished` のドメインイベントを持たない）。外した写真は `photos.released` に載せる

```ts
type PhotosTakenDownEvent = DomainEventBase<
  "content.photos_taken_down",
  { owner: ContentRef; photoIds: readonly PhotoId[]; unpublished: boolean }
>;
```

### 写真の持ち主

- 写真（`PhotoAsset`）は登録の時点では持ち主を持たず、同意と登録した人だけを持つ。写真を載せた集約または申請の保存・提出と同じ UnitOfWork で、持ち主（`PhotoOwnerRef`）が設定される
- 申請の承認は、申請が持ち主の写真のすべての持ち主を、申請から反映先の集約に付け替える。否認・取り下げ・失効で終わった申請は、添えた写真の持ち主のまま残り、内容の表示は写真を含む
- 写真を別の持ち主に引き継ぐときは、Media の `duplicatePhotos` で写真を複製して新しい `PhotoAsset` を作り、新しい持ち主を設定する（掲載の複製、終わった申請の写真を含む再申請）。複製は複製元の同意を引き継ぐ。1つの写真の持ち主は常に1つ以下
- 持ち主が手放した写真は `photos.released` で削除される。登録から一定の期間（設定値）持ち主が設定されない写真は、Media の日次のジョブが削除する

## 開発の順序との対応

| 段階（契約 T-03） | ドメイン |
| --- | --- |
| 1. アカウント、管理権限、申請の共通の進み方 | Account、Authority、Application（進み方、前提、承認者の判断）、Notification（基盤と段階1の出来事。招待のメールと、申請の通知の共通の仕組みを含む。申請の種類ごとの通知は、その種類が入る段階で加わる） |
| 2. 店舗・スポット、カテゴリー、掲載 | Area、Media、Place、Listing、Application（店舗・掲載の5種）、Moderation（店舗・掲載が対象）、Discovery（`VisibilityPolicy`、`ReferenceQueries`、店舗詳細・掲載詳細（店舗の掲載の区分の `listListingsOfPlace` を含む）。どれも店舗・掲載の範囲）、Notification（段階2の出来事。申立ての結果のメールを含む） |
| 3. 地域、イベント | Region、Occasion、Application（所属・離脱・参加の3種）、Moderation（地域・イベントが対象に加わる）、Discovery（地域詳細・イベント詳細（地域の区分の `listPlacesOfRegion`・`listListingsOfRegion` を含む）、対象の選択の候補、`ReferenceQueries` の地域・イベント、店舗詳細・掲載詳細の所属地域とイベントの区分）、Notification（段階3の出来事） |
| 4. 閲覧者向け機能 | Discovery（フィード、絞り込み、地図、検索、一覧）、Bookmark |
| 5. 読みもの、通知 | Article、Moderation（読みものが対象に加わる）、Discovery（読みもの、`ReferenceQueries` の読みもの、詳細の読みものの区分）、Notification（段階5で加わる出来事。読みものの紹介先の変化など） |

- 写真は、段階2の店舗・掲載とその申請から使う（Media は段階2）。対象の選択の候補は、それを使う画面（所属・参加の申請、直接の追加、開催地域の関連づけ、紹介先の選択）が段階3から現れるので、段階3で入る
- Discovery の `ReferenceQueries`（`resolve`・`isViewable`）は段階2から使う（店舗の照合の写真の代用、店舗・掲載の申請の提出、申立ての提出、申立て・連絡の詳細）。対象の種類は、そのドメインの段階で加わる
- 店舗の所属地域を読む読み取り（管理する掲載・店舗の読み取りの所属地域、店舗詳細・掲載詳細の所属地域）は、Region が入る段階3で加わる。段階2では所属地域を空で返す
- 各段階の Notification は、その段階の対象に関わる出来事の通知を、管理・運営機能の一部として含める（契約の解釈 I-23）。通知一覧は段階1から使う
