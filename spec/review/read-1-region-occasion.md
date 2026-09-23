# 独立した読み 1: domains/index.md と Region・Occasion の技術設計

区分: `spec/domains/index.md`、`spec/domains/region.md`・`occasion.md`、`spec/usecases/region.md`・`occasion.md`、`spec/testcases/region/`・`occasion/`、`spec/testcases/ports/` の `regionRepository`・`placeAffiliationsRepository`・`occasionRepository`・`participationRepository`・`regionLinkRepository`・`holdingStatusLedger`。上流は `spec/scenario/region.md`・`event.md`・`moderation.md` と `spec/pages/region.md`・`event.md`・`shop.md`（SM-05・SM-06）・`index.md`（代行、CF-02）。

反例だけを書く。成立の認定はしない。

## 条件 1 要求を取りこぼしていない

この区分では、形を取る反例を見つけていない。

## 条件 2 足しすぎていない

### 2-1 代表地域の選択と所属地域の状況の確認の、サービス運営者による代行

- 引用
  - `spec/domains/region.md` 冒頭: 「代表地域の選択と店舗の所属地域の状況の確認は、店舗管理者、不在ならサービス運営者が行う」
  - `spec/usecases/region.md` `chooseRepresentativeRegion` 概要: 「店舗管理者が不在の店舗では、サービス運営者が代行する」。`getPlaceAffiliationStatus` も「店舗管理者（不在ならサービス運営者）に」
  - `spec/testcases/region/chooseRepresentativeRegion.md` 表の7行目: 「店舗に店舗管理者がいない。操作する人がサービス運営者…選んだ代表地域が Y になる（代行）」。`getPlaceAffiliationStatus.md` 表の9行目も同じ
- 上流に引用元がない
  - 契約 P-15「店舗管理者が選ぶ。選ばない場合と…最初に所属した地域を代表地域とする」、R-12「店舗管理者は代表地域を所属地域から選べる」。P-70 の30行に、代表地域の代行の行はない
  - `spec/scenario/region.md` REG-04 の利用者は「店舗管理者」だけ。REG-13（代行）の流れにも代表地域はない
  - `spec/pages/index.md`「サービス運営者の代行」: 「サービス運営者は、SM-01・SM-05・SM-06・SM-07 と、店舗管理者として行う申請（RQ-06、RQ-07）を代行で開かない」。SM-05 が `chooseRepresentativeRegion`・`getPlaceAffiliationStatus` の唯一の画面なので、代行の分岐は到達する画面を持たない
- 同じ「店舗の側の操作」を、Occasion は「サービス運営者は代行しない」と定めている（4-1 と対）

## 条件 3 Issue をまたぐ決定が決まりきっている

### 3-1 共有カーネルの値オブジェクトの違反のエラーコード

- 引用
  - `spec/domains/index.md`「エラーの種類」: 「ドメインの不変条件の違反は `BusinessRuleError`（コードつき）」
  - `spec/domains/index.md`「日付と位置」: `DateRange` は「`start <= end`」、`GeoPoint` は「緯度は -90〜90」、「キャッチコピー」: `Tagline` は「1〜60文字」。どれもコードを定めていない
  - `spec/usecases/occasion.md` `registerOccasion`・`updateOccasionContent` のエラーケース: 「`BusinessRuleError`（`DateRange` の違反）」
  - `spec/testcases/occasion/registerOccasion.md` 表の5行目、`updateOccasionContent.md` 表の8行目: 期待結果が「`BusinessRuleError`（`DateRange` の違反）」
- 決まっていない問い: `DateRange`・`Tagline`・`GeoPoint` の違反のコードは何か。Region・Occasion の自前の値オブジェクトは `INVALID_REGION_NAME`・`INVALID_OCCASION_NAME`・`DUPLICATE_PHOTO` とコードを持つのに、共有カーネルだけが持たない
- 依存する 2 か所
  - `registerOccasion`・`updateOccasionContent` のテストケースの期待結果（コードで照合できない）
  - `spec/pages/event.md` EM-02 の「CS-10 開催期間の誤り（イベントだけ）」を、公開条件の不足（`OCCASION_PUBLISH_REQUIREMENTS_MISSING`）と区別して示す presentation 層の対応づけ。`Tagline` は Region と Occasion の両方の登録・更新が使う

## 条件 4 矛盾がなく、現在形で単体で読める

### 4-1 「参加の管理」の代行の有無

- `spec/domains/index.md`「操作の可否」の表: 「対象の管理（店舗・地域・イベントの情報と状態、店舗の掲載、所属・参加の管理）｜その対象の管理権限を持つ人。対象に管理者がいなければ、サービス運営者（代行）」
- `spec/domains/occasion.md` 冒頭: 「店舗の側の参加の操作（参加内容の変更、取りやめ）は、店舗管理者だけが行う。サービス運営者は代行しない」。`spec/usecases/occasion.md`「操作の可否の確かめ方」: 「店舗の側｜`manage_target`（`standing` はその店舗）で、`capacity` が `steward`｜…サービス運営者の代行はない」
- 同じ `manage_target`（店舗）の操作について、index は代行ありと言い、Occasion は代行なしと言う。Region の店舗の側の操作（`chooseRepresentativeRegion`）は index の側に従っていて、2つのドメインで扱いが割れている（2-1）

### 4-2 冪等な作成の規約と、参加・関連づけの送り直し

- `spec/domains/index.md`「リポジトリの共通の契約」: 「集約を新しく作る要求は、呼び出し側が ID を決めて送る。同じ ID で同じ内容の要求は、書き込みもドメインイベントもなしに成功として扱い…（冪等な作成）」
- `spec/domains/occasion.md` `Participation` のライフサイクル: 「集約の ID は呼び出し側が決める値ではなく、イベントと店舗の組。成立した後に同じ追加を送り直すと `ALREADY_PARTICIPATING` になる」。`RegionLink` も「同じ関連づけを送り直すと `REGION_ALREADY_LINKED` になる」。`spec/testcases/occasion/addParticipationDirectly.md` 表の8行目が同じ期待結果を持つ
- `addParticipationDirectly`・`linkRegion` は集約を新しく作る要求で、呼び出し側が組（= 集約の ID）を送る。index の規約は例外を持たないので、同じ組・同じ内容の送り直しは index では成功、occasion ではエラーになる。契約 T-02 は「冪等な作成」を前提に挙げている

### 4-3 操作の可否の読み取りが UnitOfWork の中か外か

- `spec/usecases/region.md` 冒頭: 「書き込みを持つユースケースは、この読み取りを書き込みと同じ UnitOfWork の中で、書き込みの前に行う」。各ユースケース: 「スコープ内で使うリポジトリは `stewardshipRepository`、`roleRosterRepository`、`regionRepository`」
- `spec/usecases/occasion.md` `publishOccasion`: 「使うリポジトリは `occasionRepository`」。`cancelOccasion`・`suspendOccasion`・`excludeParticipant` なども、Authority のリポジトリをスコープに挙げていない。一方で同ファイルの冒頭は「確定の時点の管理体制で確かめられ」と言う
- 同じ型の操作（管理する対象の状態の変更）について、2つのユースケース定義でスコープの範囲が食い違う

### 4-4 同じものを指す語が 2 つある

- サービス運営者が非公開を含めて探す読み取り: `spec/usecases/region.md` は `searchRegionsIncludingHidden`、`spec/usecases/occasion.md` は `searchOccasionsForOperation`（Listing は `searchListingsForOperation`）
- 運営による非公開の解除: Region・Occasion は `liftRegionSuspension`・`liftOccasionSuspension`、ドメインイベントは `region.unsuspended`、Listing のユースケースは `unsuspendListing`。index.md「ドメインイベントの名前」は「同じ出来事には、ドメインをまたいで同じ語を使う」と定める
- `spec/domains/region.md`: 本文は「地域の運営者」、ドメインイベントの表は「Notification（地域運営者、編集担当者）」。`spec/domains/occasion.md` も「イベントの運営者」と「イベント運営者」が混じる。契約の語は「地域運営者」「イベント運営者」

### 4-5 ドメインイベントの名前の規約と `photos.released`

- `spec/domains/index.md`「ドメインイベントの名前」: 「ドメインイベントの型名は `"{ドメイン}.{出来事}"`」
- 同ファイル「写真の解放」: `DomainEventBase<"photos.released", …>`。`photos` というドメインはなく（写真のドメインは Media）、規約に例外の定めもない

## 条件 5

技術設計の層の区分なので問わない。

## 条件 6 アーキテクチャ制約に従い、アダプターを差し替えられる

### 6-1 「店舗の側の操作に代行はない」の規則がユースケース層にある

- 制約: 「ビジネスルールはエンティティまたはドメインサービスに置く。ユースケース層はオーケストレーションのみ」。`spec/domains/index.md` も「操作の可否の規則は Authority の `AccessPolicy`（純粋な関数）だけが持つ」
- 違反箇所: `spec/usecases/occasion.md`「操作の可否の確かめ方」: 「店舗の側｜`manage_target`（`standing` はその店舗）で、`capacity` が `steward`」。`AccessPolicy.decide` の `manage_target` は、管理者のいない店舗でサービス運営者に `allowed: true`（`capacity: "operator"`）を返す（`spec/domains/authority.md` の判定表）。それを拒む判断（`capacity` が `steward` でなければ `ForbiddenError`）を、`changeParticipationByPlace`・`withdrawParticipation`・`getPlaceParticipations` の各ユースケースが自分で行う。`spec/testcases/occasion/withdrawParticipation.md` 表の7行目「`ForbiddenError`。店舗の側の操作に代行はない」は、この判断がユースケースにあることを前提にしている

## 条件 7 次の改訂が前より高くつかない設計である

### 7-1 公開状態と運営による非公開の判定が、集約ごとに複製されている

- 引用: `spec/domains/index.md`「運営による非公開」: 「公開状態を変える操作は、運営による非公開 → 不正な遷移（`PUBLICATION_INVALID_TRANSITION`）→ 公開条件、の順に判定する」。共有カーネルが関数として持つのは `Publication.publish`・`unpublish` だけで、`Suspension` は型だけ。`spec/domains/region.md` の `publish`・`unpublish`・`suspend`・`liftSuspension` と `spec/domains/occasion.md` の同名の振る舞いが、同じ順序と同じ処理を別々に定義し、コードも `REGION_SUSPENDED`／`OCCASION_SUSPENDED`／`LISTING_SUSPENDED`、`REGION_ALREADY_SUSPENDED`／`OCCASION_ALREADY_SUSPENDED`／`LISTING_ALREADY_SUSPENDED`／`PLACE_ALREADY_SUSPENDED` とドメインごとに分かれる。不正な遷移だけが共通のコード
- 代案: 共有カーネルに、`Publication` と `Suspension` の組を受け取る関数（`suspend`・`liftSuspension`、判定順を内蔵した `publish(state, missingRequirements, now)`・`unpublish`）と、共通のコード（`SUSPENDED`・`ALREADY_SUSPENDED`・`NOT_SUSPENDED`・`PUBLISH_REQUIREMENTS_MISSING`）を置く。各集約は、公開条件の不足の一覧を渡すだけにする
- 次の要求の想定: 「読みものも運営による非公開の対象にする」または「判定順を変える」。今の構造では、4〜5 の集約の振る舞い、各ユースケースのエラーケース、各テストケース、presentation のコードの対応づけに広がる。代案では共有カーネルの1か所と、対象の型に `Suspension` を足す変更で済む

### 7-2 手元に読んだ集約の「閲覧できるか」を、Discovery のポートで読み直している

- 引用: `spec/usecases/occasion.md` `linkRegion`: 「`RegionRepository.findById`（地域があること）、Discovery の `ReferenceQueries.isViewable`（`regionViewable`）」。`addParticipationDirectly`: 「`PlaceRepository.findById`（店舗があること）、Discovery の `ReferenceQueries.isViewable`（`placeViewable`）」。一方 `spec/usecases/region.md` `getPlaceAffiliationStatus` は、同じ事実を「`VisibilityPolicy.isRegionViewable`（`RegionRepository.findByIds` で読んだ地域から…求める）」で得る。`spec/domains/index.md` は「閲覧できる対象」を共有カーネルの節に置きながら、「定義は1つで、Discovery の `VisibilityPolicy` が持つ」とし、依存方向では「Discovery と Notification は最下流にあり、どのドメインからも依存されない」と言う
- 同じ事実に2つの経路があり、ポートの経路ではアダプターが「閲覧できる」の規則をもう一度実装する。書き込みのユースケースは、集約を読んだ上で同じ対象をもう1回読む
- 代案: 「閲覧できる」の述語（`Publication` と `Suspension` だけで決まる）を共有カーネルの純粋な関数にする。集約を読むユースケース（`linkRegion`・`addParticipationDirectly`・`getPlaceAffiliationStatus`）は、読んだ集約に述語を当てる。`ReferenceQueries.isViewable` は、集約を読まない呼び出し側（Bookmark、Moderation）だけが使う
- 次の要求の想定: 「閲覧できる」の条件の追加（例: 地域に公開予約を足す）。今の構造では `VisibilityPolicy`、`ReferenceQueries` の全アダプターとその適合テスト、経路の違う各ユースケースに広がる。代案では、書き込み側は述語の1か所で済む

### 7-3 「添えられる掲載」の求め方が、ユースケースごとに書かれている

- 引用: `spec/domains/occasion.md` `ParticipationDetails`: 「ユースケースが、入力の `ListingId` を Listing の `ListingRepository.findByIds` で読み、`placeId` がその店舗で、`Listing.shelfOn(listing, today)` が `published` の掲載の ID を渡す」。同じ手順を `spec/usecases/occasion.md` の冒頭と `addParticipationDirectly`・`changeParticipationByPlace`・`changeParticipationByOccasion`、`spec/usecases/application.md` 267行目（`submitParticipation`）がそれぞれ持つ。`getParticipationDetails` は別の経路（`findPageByPlace` の `shelf: published`）で同じ集合を求める
- 規則（その店舗の掲載で、区分が `published`）が、ドメインの関数ではなくユースケースの手順として 5 か所にある
- 代案: Listing に純粋な関数 `Listing.attachableIds(listings, placeId, today): ReadonlySet<ListingId>` を置き、どのユースケースもそれを呼ぶ。`ParticipationDetails.create` の `facts` はその結果を受け取る
- 次の要求の想定: 「休業中・閉店した店舗の掲載は添えられない」「参加日より後に提供が始まる掲載は添えられない」。今の構造では 5 つのユースケースとそのテストケースに広がる

### 7-4 `getParticipationDetails` が 2 つの責務を負っている

- 引用: `spec/usecases/occasion.md` `getParticipationDetails` 概要: 「参加内容と、参加内容の入力に要る事実を返す。店舗の側は変更と取りやめの前に、イベントの側は直接の追加と変更の前に使う。参加していない組では、参加内容なしで、添えられる掲載と開催期間を返す」。入力に「添えられる掲載の `Pagination`」を持つ。形式のガイド（usecase-guide）は「複数の読み取りを1つに合成してよいのは、合成をまたぐ規則があるときだけ」「1画面のデータ一式 ≠ 1ユースケース」と定める
- 既存の参加の読み取りと、店舗の添えられる掲載の一覧（ページつき）は、間に規則を持たない。CM-04 の画面のデータ一式を1つにまとめた形で、掲載の一覧のページを進めるたびに、参加・イベント・管理体制も読み直す。`spec/pages/request.md` RQ-07（参加の申請）も同じ「添えられる掲載」の候補を要るが、このユースケースの実現先（EVT-02、EVT-10 / CM-04）に入っていない
- 代案: `getParticipationDetails`（参加内容、版、開催期間、期間外の参加日、店舗管理者の有無）と、`listAttachableListings(placeId, pagination)`（7-3 の関数を使う）に分ける。後者は CM-04 と RQ-07 の両方が使う
- 次の要求の想定: 参加の申請の入力（RQ-07）や再提出で候補の示し方を変える要求。今の構造では、候補の読み取りが Occasion のこのユースケースと別経路に分かれて広がる

## 7 条件の外

- 参加の申請が確認中のまま残る経路がある。記録が `ended` のイベントの開催期間を未来へ更新し（申請が出せる）、次の日次のジョブより前に過去へ戻すと、記録と今日の状態がどちらも `ended` のままなので `occasion.ended` は出ず、その間に出た申請は失効しない（`spec/domains/occasion.md` `HoldingStatusObserver`）。承認は `Premise` が拒むので、否認か取り下げで終わる
- `HoldingStatusLedger.findToObserve` は「今日の開催の状態（`HoldingStatus.of` の規則による）が、記録の `lastObserved` と違うイベント」を返すので、`HoldingStatus.of` の規則を全アダプターが問い合わせとして再実装する。全件を走査して `HoldingStatusObserver` に判断させる代案は規則を1か所にできるが、日次の読み取りが全イベントに広がるので、優劣を付けなかった
- `HoldingStatusLedger.put` は、存在しない `OccasionId` の記録を受けたときの扱い（参照整合性を誰が担保するか）を書いていない。index.md の参照整合性の規約は「リポジトリの共通の契約」の中にあり、このポートは `TransactionalRepository` ではない
- 削除された掲載の `ListingId` は参加に残り（`spec/domains/occasion.md`「後から削除された掲載の `ListingId` は参加に残り」）、`ParticipationDetails.create` は `current.listingIds` にあれば通すので、外す操作をするまで残り続ける。`getParticipationDetails`・`getPlaceParticipations`・`listOccasionParticipants` の出力「添えた掲載（名称と提供状態）」は、削除された掲載をどう返すかを書いていない
- `spec/usecases/region.md` と `spec/usecases/occasion.md` で、操作の可否の書き方が違う（Region はユースケースごとに Authority のポートを列挙、Occasion は冒頭の「立場」の表を参照）。読み手は2つの読み方を覚える必要がある
- 区分の外で目に入ったもの: `spec/domains/discovery.md` 569行目「申請の対象…の `isViewable` を確かめる（decisions-scenario R-3）」は、spec の外の作業メモへの参照
