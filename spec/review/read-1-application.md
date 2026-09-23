# 独立した読み 1: domains/index.md と Application の技術設計

読んだ範囲: `spec/domains/index.md`、`spec/domains/application.md`、`spec/usecases/application.md`、`spec/testcases/application/`（30件）、`spec/testcases/ports/{applicationRepository,applicationReviewDesk,overdueNoticeLedger}.md`。上流として `spec/scenario/index.md`・`application.md`、`shop.md`（SHP-03・04・08〜11）、`listing.md`（LST-12〜14）、`region.md`（共通の規則、REG-01〜03）、`event.md`（共通の規則、EVT-01・08）、`spec/pages/request.md`、`shared.md` の CM-01、`account.md` の MY-04・MY-05、`operation.md` の OM-01。定義の確認のために `domains/{media,occasion,authority,discovery}.md`、`usecases/discovery.md`、`flows/index.md` を部分的に読んだ。

反例の一覧だけを書く。成立の認定はしない。

## 条件 1 要求を取りこぼしていない

### 1-1 RQ-06 の「自分の申請が確認中・差し戻しの地域」を、個人の申請者に返すユースケースがない

- 引用（上流）: `pages/request.md` RQ-06 機能「所属の申請では、公開中の地域から対象を選ぶ（CF-02）。…所属中の地域と、自分の申請が確認中・差し戻しの地域は、理由とともに示し、選べない」「利用者は、店舗管理者のいない店舗について、個人として申請する」
- 引用（下流）: `usecases/discovery.md` findSelectionCandidates「すでに選んだ対象と選べない対象は、呼び出す操作が持つ現在の結びつき（所属、参加、関連づけ、紹介先）から決まり、このユースケースは区別しない」。`usecases/application.md` listApplicationsForSubject のエラーケース「その対象を管理できない | `ForbiddenError`」。listMyApplications の入力「絞り込む `PlaceId`（任意）」は「その店舗が行った申請だけを返す」。checkSubmissionEligibility の入力は対象1組
- 反例: 店舗管理者は listApplicationsForSubject（店舗、`applicant: "place"`、進行中）で申請中の地域を得られる。個人の申請者が「この店舗について自分が出した進行中の所属の申請」を一覧で得る読み取りは、どのユースケースにもない。listApplicationsForSubject は管理できない人を拒み、listMyApplications は対象の店舗で絞れず、checkSubmissionEligibility は地域1件ずつしか答えない。RQ-06 の候補の一覧の「選べない」の表示（個人の場合）が、usecases の層に落ちていない

## 条件 2 足しすぎていない

### 2-1 resubmitApplication の `APPLICATION_TARGET_CHANGED` は、入力から到達できないエラー

- 引用: `usecases/application.md` resubmitApplication 入出力「直した内容（種類ごとに、提出と同じ入力。対象の指定を除く）」、エラーケース「対象を指す項目が変わっている | `BusinessRuleError`（`APPLICATION_TARGET_CHANGED`）」、ロールバック「対象を指す項目が変わっている」
- 反例: 入力が対象の指定を持たないので、利用者の操作でこの条件は起きない。層の表の usecases の「書かない」のうち「技術的に起こりうるだけのエラー」に当たる。`testcases/application/resubmitApplication.md` にも対応するケースがない（上流に引用元のあるエラーなら代表ケースを持つ）

### 2-2 approvePlaceRegistration のテストケースに、どのユースケースからも到達できない前提条件がある

- 引用: `testcases/application/approvePlaceRegistration.md`「r1 の写真 ph1 の持ち主が、r1 でない | O が r1 を承認する | `BusinessRuleError`（`MEDIA_PHOTO_OWNER_MISMATCH`）になる」
- 反例: 申請の写真の持ち主は提出と同じ UnitOfWork で申請に設定され（`domains/application.md` トランザクション境界「提出」）、申請が手放すまで他の操作で替わらない。この前提条件を作るユースケースがなく、`usecases/application.md` approvePlaceRegistration のエラーケース（「判断に共通のエラーケース」）にも上流の記述がない。層の表の testcases の「書かない」のうち「技術的なエッジケース」に当たる

### 2-3 listMyApplications のテストケースに境界値のケースがある

- 引用: `testcases/application/listMyApplications.md`「A は101店舗の店舗管理者で、それぞれの店舗が行った申請が1件ずつ保存されている | … | 全件数は 101」
- 反例: 「ID の集合は件数に上限を持たない」（`domains/index.md` リポジトリの共通の契約）の 100件の境界を確かめるケースで、層の表の `testcases/${domain}/` の「書かない」のうち「境界値」に当たる。同じ境界は `testcases/ports/applicationRepository.md` の findPageByApplicants「101店舗…101件の `places` で呼ぶ」が契約のケースとして持っている

## 条件 3 Issue をまたぐ決定が決まりきっている

### 3-1 終わった申請が手放した写真を、再申請の初めの内容と、終わった申請の内容の表示がどう扱うかが決まっていない

- 引用:
  - `domains/application.md` Application の振る舞い `reject`・`withdraw`・`reassess`「`ownedPhotoIds` のすべてを `PhotosReleased` で返す」、`domains/index.md` 写真の解放「Media がこれを消費して写真を削除する」
  - `scenario/application.md` APP-04 流れ 3「前の申請の内容と補足が入った状態で、入力が始まる」、`pages/request.md` RQ-03 状態「再申請は、前の登録申請の内容と補足が入った内容で始まる」、RQ-05 状態「再申請は、前の申請の内容と補足が入った内容で始まる」
  - `usecases/application.md` getMyApplication「再提出と再申請の入力の初めの内容…も、この読み取りが返す」「写真は表示用の参照を…返す」、提出に共通のエラーケース「…または写真がない | `BusinessRuleError`（…`MEDIA_PHOTO_NOT_AVAILABLE`）」
- 答えが決まっていない問い: 否認・取り下げ・失効の申請の内容にある写真（登録申請と掲載の申請のすべての写真、修正の申請が添えた写真）は削除済みになる。(a) 再申請の初めの内容に、その写真を含めるか。(b) 終わった申請の内容の表示（MY-05、CM-01 の「確認中でない」）で、削除済みの写真をどう返すか（`PhotoStorage.displayRefs` は「実体の有無を確かめない」）
- 依存する箇所: getMyApplication・getApplicationForReview の出力（usecases）、RQ-03・RQ-05 の「入力（再申請）」の状態（pages）、submit〜 の再申請のテストケース（`testcases/application/submitPlaceRegistration.md`「r1 の内容を直して、別の ID r2 で登録を申請する」、`submitNewListing.md`「前の内容を直して、別の ID で申請する」は写真の扱いを述べない）。(a) を「含める」と読むと、掲載の再申請は写真が必須なので、そのまま提出した再申請は必ず `MEDIA_PHOTO_NOT_AVAILABLE` になる

## 条件 4 矛盾がなく、現在形で単体で読める

### 4-1 `ApplicationReviewDesk` の `asApprover` と `ApproverPolicy.decide` の一致の記述が、併せた管理権限の申請で食い違う

- 引用 A: `domains/application.md` ApplicationReviewDesk「`service`・`asApprover` | …併せた登録申請がまだ承認されていない管理権限の申請を含む」、`testcases/ports/applicationReviewDesk.md`「登録申請 r（確認中）と、r を参照する併せた管理権限の申請 s（確認中）… | r と s の両方が返る」
- 引用 B: 同じ節「`service` の2つの区分は重ならず、`ApproverPolicy.decide` がサービス運営者に `approver` または `proxy` を返す確認中の申請と一致する」、`ApproverPolicy.decide` の手順 5「…併せた管理権限の申請で、`registration` が `"underReview"` または `"returned"` なら `registrationPending`」（`ReviewPermission` の `allowed: false`）
- 反例: s について `decide` は `approver` も `proxy` も返さないが、`asApprover` は s を返す。「一致する」が成り立たない

### 4-2 spec の外の作業メモへの参照がある

- 引用: `domains/application.md` の8か所。「ApplicantNote | 補足 | …任意（decisions-scenario A-0）」「再申請も同じ振る舞いで、前の申請との結びつきを持たない（decisions-mid M-7）」「状態は変わらない（decisions-scenario A-1）」「文章で記す（decisions-scenario A-6）」「（decisions-scenario A-7）」「decisions-scenario R-3」「（P-76、decisions-scenario C-2）」「（decisions-scenario O-2）」
- 反例: `decisions-scenario`・`decisions-mid` は `spec/review/` の作業メモで、spec の成果物にも `spec/index.md` のリンクにも定義がない。定義のない参照で、単体で読めない。同じ参照が `domains/listing.md`（9か所）と `domains/discovery.md`（7か所。例「Application の提出 | …（decisions-scenario R-3）」）にもある

### 4-3 `Premise`・`SubmissionScope`・`ApplicationSlot` は内容を持つ `ApplicationCase` を引数に取るが、ユースケースは内容なしで呼ぶ

- 引用（上流の定義）: `domains/application.md`「`required(case: ApplicationCase)`」「`evaluate<K>(case: ApplicationCase & { kind: K }, facts: PremiseFactsOf<K>)`」「`SubmissionScope.targets(case: ApplicationCase)`」「`ApplicationSlot.of(case: ApplicationCase)`」。`ApplicationCase` は種類ごとの `content`（`PlaceRevision`、`PublishableListingContent`、`ListingPatch` など）を必ず持ち、「何も変えない修正、公開条件を欠く掲載…は、これらの関数が拒む」
- 引用（下流の参照）:
  - `usecases/application.md` checkSubmissionEligibility 入力「`Actor`、申請の種類、申請者の立場、対象（…）」、使用する振る舞い「`Premise.required`、`Premise.evaluate`」「`SubmissionScope.targets`」「`ApplicationSlot.of`」
  - 提出に共通すること「内容を作るのに要る対象…がなければ、内容を作らずに前提を確かめ、前提が成り立てば `SubmissionScope.requireViewable` がその対象を閲覧できない対象として拒む」
  - submitListingRevision エラーケース「内容を作らずに前提を確かめる。店舗が決まらないので `placeHasSteward` は `false` として渡し、`listingExists` を欠く」
- 反例: checkSubmissionEligibility は申請の内容を入力に持たないので `ApplicationCase` を作れず、定義どおりの `Premise.evaluate`・`SubmissionScope.targets`・`ApplicationSlot.of` を呼べない。「内容を作らずに前提を確かめる」も同じ。下流が参照する呼び方が、上流のシグネチャに定義されていない（代案は 7-1）

## 条件 5

技術設計の区分なので問わない。

## 条件 6 アーキテクチャ制約

### 6-1 併せた管理権限の申請の不変条件を、ユースケースが判定している

- 制約: ビジネスロジックの配置（ビジネスルールはエンティティまたはドメインサービスに置く。ユースケース層はオーケストレーションのみ）
- 引用: `domains/application.md` 不変条件「併せた管理権限の申請と登録申請は、申請者が同じで、`placeId` が同じ」。`usecases/application.md` submitStewardshipClaim 入出力「登録申請を参照するときは、その登録申請の申請者が `Actor` で、予約した `placeId` が入力の `PlaceId` と同じであること」、エラーケース「参照する登録申請がない、または他の人の登録申請である | `NotFoundError`」
- 反例: この不変条件を確かめるドメインの振る舞いがない。`Application.submit` は登録申請を引数に取らず、`StewardshipContent` を作る関数も定義がない。規則の判定はユースケース（submitStewardshipClaim と、submitPlaceRegistration の再送の「保存されている登録申請の予約した `placeId` で併せた申請の内容を作る」）に置かれている。`placeId` が違う場合のエラーも決まっていない

### 6-2 判断のユースケースが、申請の状態からエラーコードを決める規則を自分で持つことになる

- 制約: 同上
- 引用: `domains/application.md` ApproverPolicy.decide「判断のユースケースは、`notApprover`、申請の状態のエラー、`awaitingStewards`・`registrationPending`、版の比較の順に判定する（確認中でない申請は、サービス運営者にも現在の状態のコードで返る）」「`Reviewer` は `ApproverPolicy.reviewer` だけが作る」「`reviewer(actor: Actor, permission: ReviewPermission & { allowed: true })`」。`testcases/application/rejectApplication.md`「b2 は、代行の前に、X の運営者が承認した | O が b2 を否認する | `BusinessRuleError`（`APPLICATION_ALREADY_APPROVED`）になる（申請の状態を、代行できるかどうかより先に判定する）」
- 反例: 状態とコードの対応（「現在の状態 | コード | 当たる操作」の表）は `sendBack`・`approve`・`reject` の振る舞いが持つが、これらは `Reviewer` を引数に取り、`Reviewer` は `allowed: true` のときしか作れない。`awaitingStewards`・`registrationPending` より先に状態のエラーを返すには、ユースケースが `status.kind` からコードを選ぶ規則を自分で持つしかない。状態のエラーだけを判定するドメインの関数が定義されていない

## 条件 7 次の改訂が前より高くつかない設計

境界ごとに比べた代案。Application を1つのドメインに集める現在の境界と、種類ごとの申請を対象のドメイン（Place・Listing・Region・Occasion）に分けて進み方だけを共有する代案を比べた。代案は進み方・枠・代行・失効の規則を4か所に写すことになり、現在の設計のほうが良い。承認のユースケースを種類ごとに8つ持つ現在の形と、1つの `approveApplication` にまとめる代案を比べた。代案は1つのユースケースが8つの反映先を負うので、現在の設計のほうが良い。期間超過の通知の記録を集約の外に持つ現在の形と、`underReview` の状態に通知済みの印を持つ代案を比べた。代案はジョブが申請の版を進め、承認者の版の比較を壊すので、現在の設計のほうが良い。代案のほうが良いものは次の2件。

### 7-1 前提・閲覧できる対象・枠の規則を、内容を含む `ApplicationCase` ではなく、対象の指定だけの型の上に定める

- 引用: 4-3 の引用に同じ。加えて `domains/application.md` SubmissionScope「内容を作るのに要る対象…が存在せず、申請の内容を作れない提出でも、ユースケースがこの関数で同じエラーにする」
- 反例: `Premise.required`・`SubmissionScope.targets`・`ApplicationSlot.of`・`ApproverPolicy.seatOf`・`Application.subjects`（カテゴリーを除く）が使うのは、種類、申請者、対象の ID、`registrationId` だけで、内容の本体を使わない。それを `ApplicationCase` 全体の上に定めたため、「内容を作らずに前提を確かめる」「`placeHasSteward` は `false` として渡す」「ユースケースが `requireViewable` を直接呼ぶ」という例外の手順が、提出の共通の規則・submitListingRevision・submitPlaceRevision・checkSubmissionEligibility に散っている
- 代案: `ApplicationTarget`（種類、申請者、対象の ID、`registrationId` の直和型。`ApplicationSlot.target` を全種類に広げた形）を値オブジェクトにし、`ApplicationCase` は `target` と `content` の組にする。`Premise`・`SubmissionScope`・`ApplicationSlot`・`seatOf` は `ApplicationTarget` を引数に取る。checkSubmissionEligibility は入力からそのまま `ApplicationTarget` を作り、提出は「`ApplicationTarget` で前提・閲覧・枠を確かめる → 内容を作る」の1本の順になって、内容を作れない場合の例外の手順が消える。次に申請の種類が増えても、内容の型の都合が前提の確認に及ばない

### 7-2 `ApproverFacts` が、承認者の席と合わない事実の組み合わせを表せる

- 引用: `domains/application.md` ApproverPolicy「`targetManagement: AccessDecision | null; // 承認者の席が steward のとき、その対象への manage_target の結果。operator では null`」、手順 2「承認者の席が `steward`: `targetManagement.allowed` なら `approver`」。同じファイルの PremiseFacts「`PremiseFactsOf<K>` は、種類 `K` の前提が使う事実だけを持つ `PremiseFacts` の部分型」
- 反例: 席が `steward` で `targetManagement` が `null`、席が `operator` で `targetManagement` がある、という組み合わせが型で表せ、手順 2 はその場合の分岐を定めていない。前提の事実は `PremiseFactsOf<K>` で種類ごとに絞っているのに、承認者の事実は絞っていない
- 代案: `ApproverFacts` を席で判別する直和型にする（`{ seat: "operator"; serviceOperation; registration } | { seat: "steward"; targetManagement: AccessDecision; serviceOperation }`）。`registration` は管理権限の申請（席は常に `operator`）にだけ要るので、`steward` の側から消える。手順 1〜3 の「席が〜なら」の分岐が型の判別になる

## 7 条件の外

- `testcases/application/withdrawApplicationsOfWithdrawnAccount.md` の2行目（「A は店舗 p1 の店舗管理者で…b1 は確認中のまま変わらない。S が b1 を扱える」）と最終行（「A は店舗 p1 の店舗管理者だった…b1 は変わらない」）は、同じ前提条件・同じ操作・同じ期待結果のケース
- 「実現する」シナリオの一覧が、`domains/application.md`「ユースケース（概要）」と `usecases/application.md` の冒頭の表で違う（例: `reassessApplicationPremises` は前者が「APP-05」、後者が「APP-05、SHP-10、REG-09、EVT-01、LST-13、MEM-04」。`replaceRetiredCategoryInApplications` は前者が「OPE-03」、後者が「OPE-03、LST-14」）。同じ対応を2か所に持っている
- ポートの契約と domains の記述に画面の語がある。`domains/application.md` findPageByApplicants「1つの店舗に絞るときは `individual` を `null` にする（MY-04）」、ApplicationReviewDesk「`count` は、画面が種ごとの件数に使う」、Application の振る舞い「画面は、コードから競合…か前提の変化かを示し分ける」。`usecases/application.md` getMyApplication「再提出と再申請の入力の初めの内容…も、この読み取りが返す」は、出力を入力画面の用途で述べている
- `domains/application.md` 不変条件「確認中の申請の内容と補足は変えられない（P-73）」の P-73 は取り下げの要求で、内容を変えられないことの引用元になっていない（`scenario/application.md` APP-02 の異常系も同じ番号を引く）
- `Premise.require` は「`broken` の最初の前提のコード」を投げるが、複数の前提を欠くとき（例: 店舗管理者のいる店舗が、すでに所属中の地域への所属を個人が申請する）の `broken` の並び順の定めがない。提出のエラーコード1か所にだけ効く
