# 進行メモ（作業ファイル）

## 段取り

契約 → 台帳の読み（済・16件+9件を反映）→ scenario（一覧は済、詳細6体並列）→ pages → 体験側の中間読み → domains 境界 → 境界の中間読み → domains 詳細 / usecases / flows / testcases → 全量の読み（最大3周）→ manual-tests → review 削除

## scenario 委譲の返答

### operation + editorial（完了）

未決の問いと、こちらの決定:

- カテゴリー名の重複 → 入力エラー（同じ名称のカテゴリーは置けない）。表示順は契約になく、作成順
- 廃止するカテゴリーが確認中・差し戻し中の掲載申請にある → 申請内容のカテゴリーも移行先に付け替える（P-18「既存の掲載を付け替える」の帰結として domains で定める）。閲覧者の選択中条件 → 廃止されたカテゴリーは条件から外れる
- 移行先は常に必須、最後の1つは廃止不可（シナリオのまま）
- 読みものの下書き削除 → 契約になく、設計しない
- 紹介先リンク → 記事に付随する順序つきの一覧（本文中の位置は持たない）
- 見え方の確認は必須手順にしない（確認できる、まで）
- 同時編集 → 楽観ロック。後から保存した側に競合を示し、最新を読み直して再操作（AGENTS.md の OCC）
- 一覧に「読みものを状態別に確認する」がない → EDT-01・EDT-04 の最初の手順に含めた（一覧はそのまま）

### keep + account（完了）

- メールログイン → ワンタイムのリンク。有効期間は設定値。端末の保存の合流は、ログインが成立したブラウザの端末の保存に対して行う
- 外部アカウントの提供元 → 設定（ポートで抽象化）。メールアドレスを受け取れなければ不成立、同じメールアドレスは同一アカウント（本文のまま）
- アカウントは初回ログインで作成（本文のまま）。退会後の同じメールアドレスでのログインは新しいアカウントになる
- 合流後、端末の保存は空にする（アカウントの保存が正）
- 通知の既読・保持期間・停止設定、保存一覧の並び順 → 契約になし。保存一覧は保存した日時の新しい順（ポートの契約で定める）。通知一覧は新しい順
- 承諾前の招待と退会 → membership の返答を見て決める（案: 招待は対象に属し、対象の管理者が不在になったら承諾前の招待は無効）
- ログアウト、メールアドレスの変更 → 契約になく設計しない。完了報告で「見送り」として伝える

### discover + explore（完了）

- V-49 の「一覧」は地図の一覧（V-14）。イベントの一覧と地域内の一覧にエリア・カテゴリーの条件は効かない
- キーワード検索は条件と独立（本文のまま）
- 掲載詳細の「関連する地域」は、店舗のすべての公開中の所属地域（店舗詳細と同じ。P-19）
- 並び順: 地図の一覧はフィードと同じ順（V-48）。地域の一覧は位置情報ありで近い順・なしで公開の新しい順。地域内の一覧は掲載・店舗とも新しい順。読みもの一覧は公開の新しい順
- 絞り込みで掲載が0件なら空状態を示し、地域・イベント・読みものの挿入もしない（挿入は掲載の間に行うもの）
- 廃止されたカテゴリーは選択中の条件から外れる。条件は閲覧中の画面の間で共有し、再訪時には保持しない
- 地図の単位は店舗と地域、カテゴリー選択中はそのカテゴリーの提供中の掲載を持つ店舗に限る／地図の初期範囲／位置情報の許可は閲覧者の操作をきっかけ → 本文の読みを採用

### region + event（完了）

1. 運営者が不在のイベントの開催地域の関連づけ → サービス運営者が行える（E-01 は関連する地域をイベント情報に含め、E-15 が情報の更新を代行させる）。EVT-13 に足す
2. 管理権限・役割の付与先 → 既存のアカウントをメールアドレスで指定。アカウントがなければ付与できない（本文のまま。OPE-04・05 と共通）
3. 添える掲載と参加日 → どちらも複数可。添えられるのは、その店舗の公開中で提供中または提供開始前の掲載（E-11 の直接追加も同じ）。添えた後に提供終了になった掲載は状態を区別して表示する（P-87a）。参加日は保存時に開催期間内に限る。開催期間の変更で期間外になった参加日は表示しない（店舗管理者は P-93 の通知を受けて変更する）
4. 重ねた申請 → 同じ申請者（個人、または店舗管理者としての店舗）が、同じ種類・同じ対象で確認中・差し戻し中の申請を持つ間は重ねて申請できない（P-74 の帰結）。別の申請者の申請は独立（P-75）
5. 閲覧できない地域・イベントには申請できない（リソース不在）。取り下げ中・運営による非公開の地域との既存の所属は、店舗管理者の所属状況に状態つきで示し、離脱申請と代表地域の選択の対象にできる（表示の代替は P-16）
6. 終了・中止したイベント → 参加の申請・直接追加・参加内容の変更はできない。取りやめと除外はできる。終了したイベントは中止にできない。中止の取り消しは中止中ならできる
7. 運営による非公開の間 → 管理者・運営者は情報を更新できるが、公開状態（公開・取り下げ・一時非公開・再公開）は変更できない。解除で元の公開状態に戻る
8. 管理者・運営者が不在の対象への管理者・運営者宛ての通知は、サービス運営者に届く（B-14・B-31 の帰結）。除外に理由は求めない

### application/membership/shop と listing/moderation（完了）

決定はすべて `spec/review/decisions-scenario.md` にまとめ、6体に反映を依頼した（SendMessage）。契約の解釈 I-10〜I-17 を追記。

## 次

- 6体の反映完了を待つ → pages（index を1体で設計 → 自分で確認 → 詳細を並列）

## scenario 完了（13ファイル）

- 決定の反映は全6体完了。追加決定: 並び順の基準（D-3 追記）、P-77b の失効通知はサービス運営者宛て、種別は店舗情報の一項目、掲載の申請・新規登録に重複制限なし（契約 I-10）、確認中の参加申請の期間外の参加日は表示されない、運営による非公開の間も中止・取り消しはできる、編集担当者0人の間の編集担当者宛て通知は届け先なし

## pages 進行中

- brief: spec/review/brief-pages.md。index を1体で設計中 → 自分で確認 → 詳細を画面群ごとに並列

## ドメイン境界の素案（頭の中の案。pages の後に domains/index.md に書く）

Area / Media(PhotoAsset, 同意) / Account(ログイン) / Authority(管理権限・招待・役割) / Place(店舗・スポット) / Listing(+Category) / Region(+所属・代表地域) / Event(+参加・開催地域の関連づけ) / Article / Application(申請6状態・8種・失効はイベント消費+承認時の前提確認) / Moderation(申立て・連絡) / Save(保存) / Discovery(読み取り側: 表示範囲ポリシー P-87・フィード構成・検索) / Notification(全ドメインのイベント消費、メール)
依存: コンテンツ系 → Area/Media、Application → 各コンテンツ+Authority、Discovery/Notification は最下流。循環なし

## 現在（pages 詳細 + 中間読み）

- pages/index.md 完了（57画面・10群）。詳細4体が執筆中: browse+detail / account+request（application.md に A-0 補足の追記も依頼） / shared+shop / region+event+operation+editorial
- domains/index.md を自分で執筆済み（14ドメイン、共有カーネル、またぐ規約）
- 中間の独立した読みを実行中 → 結果は spec/review/read-mid.md。criteria は spec/review/criteria.md（転記）
- 次: 中間読みの反例を直す → domains 詳細（ドメイン並列）→ usecases → flows → testcases → 全量の読み

## 中間読みの後（現在）

- read-mid.md: 反例22件 + 7条件の外6件 → 決定は spec/review/decisions-mid.md（M-1〜M-17 と技術設計4点）。scenario 5体は反映完了、scenario/index.md に共通の規則（表示範囲・申請の前提）を追加、APP-04 の操作名を「否認・取り下げ・失効の後に再申請する」に変更
- pages/index.md は一覧の設計担当（a4da2fd010b23e3a9）が pages-index-patch.md + decisions-mid.md を反映中 → 返答に「直しが要る詳細ファイルと要点」が来る → pages 詳細4体（aec7339c2c60a8f64 browse+detail / a32158af7bb8a6310 account+request / a2baf568f332825ee shared+shop / a230ba80a4da7e707 region+event+operation+editorial）に SendMessage で反映依頼
- domains/index.md は書き直し済み（Occasion に改名、Media の循環解消＝PhotosReleased、申請の前提 Premise、発見/参照の場面、AreaCode、時間の経過の記録は集約の外、店名・住所の照合は Place）
- domains 詳細 第1波 実行中: Account+Authority / Area+Place / Listing+Media / Region+Occasion / Article+Moderation+Bookmark（brief: spec/review/brief-domain.md）
- 第2波（第1波の完了後）: Application / Discovery / Notification
- その後: usecases（ドメイン並列）→ flows/index.md → testcases（ドメイン + ポート並列）→ spec/index.md → 全量の読み（最大3周。1周目は新しい目）→ manual-tests（spec-manual-test スキル）→ spec/review 削除 → 完了報告
- 完了報告に書く見送り: ログアウトとメールアドレスの変更は出典になく未設計（I-17）、読みものの削除なし、連絡者への結果通知なし

### domains 第1波の返答メモ

- Area+Place 完了。index 修正済み（Application の消費から Place を外す、Address は Town から作る、Pagination はテンプレートの page/limit）。決定: 営業時間・連絡先は自由記述。「以下に掲載がない場合」の郵便番号は町域として扱い、地名は市区町村名だけ（area.md に未反映なら第2波の前に依頼）。照合の関連度は提案どおり
- 他ドメインへの要望: Discovery は Place.registeredAt を新しい順に使う・AreaCatalog.expand を使う。Application は PlaceProfile / PlaceRevision（between, applyRevision の adoptedPhotoIds, addedPhotoIds）を使う。Notification は place.suspended / unsuspended / photosRemovedByClaim / operatingStatusChanged を消費。Moderation は写真の削除を重ねて定義しない
- Article+Moderation+Bookmark 完了。index 修正済み（Publication.unpublished に reason、EmailAddress を共有カーネルへ）。第1波の完了後に各担当へ「index.md を読み直して合わせる」依頼が要る: Article（unpublishedBy → kernel の reason、）、Moderation（ClaimantEmail → EmailAddress）、Account（EmailAddress は kernel）、Listing/Region/Occasion（reason）、Area（「以下に掲載がない場合」の郵便番号は町域として扱い地名は市区町村名だけ）
- 申立てによる写真の削除: ユースケースは Moderation が1つ持ち（対象の種類ごとに集約の振る舞いを呼ぶ）、Place/Listing/Region/Occasion/Article は集約の振る舞いだけを持つ（Place のユースケース一覧から外す）
- 文字数の上限などの値は「仮」と書かせず、現在形の制約として書かせる
- Account+Authority 完了。決定: コードの誤入力は回数の上限（設定値）で無効。Authority は account.withdrawn を消費して残った権限・役割を掃除（index の依存表に追加済み）。期限切れのログインの確認の掃除ジョブは残す。AccessPolicy の管理メンバーの確認はサービス運営者なら常に可（index 反映済み）。EmailAddress は kernel（account.md の定義は参照に直させる）
- Region+Occasion 完了。決定: 承認時に添えた掲載・参加日を確かめ直さない（提案どおり）。Tagline を共有カーネルへ（index 反映済み。region.md/occasion.md の RegionTagline/OccasionTagline は Tagline に直させる）。参加・関連づけの ID は組のキー（提案どおり）。店舗の参加状況は参加の新しい順

## usecases + testcases（現在）

- domains 第1波は index の改訂に合わせ済み（全5体完了）。第2波 実行中: Application(a3f17b26fd9275cc1) / Discovery(a7b8cf61d74047b42) / Notification(a4a627119c1ecc1b4)
- brief: spec/review/brief-usecase.md。usecases+ユースケーステスト+ポート適合テストを担当ドメインごとに1体で書く
- 実行中 7体: Account+Authority / Area+Place / Listing / Media+Bookmark+Article(+ports/unitOfWork.md) / Region / Occasion / Moderation
- 第2波ドメインの完了後に: Application / Discovery / Notification の usecases+tests 3体
- 全 usecases の完了後に: spec/flows/index.md（各体の返答の「動的フロー候補」を入力に1体）→ flows の失敗時の扱いに基づく testcases の追記 → spec/index.md → 全量の読み
- 決定: 申立てに基づく写真の削除のユースケースは各コンテンツドメインが持つ（Moderation は TakedownClaim.authorizePhotoRemoval の純粋な関数だけ提供）

### 機械的な置換（全 usecases/testcases の書き手が完了してから spec/ 全体に一括で行う）

- place.operatingStatusChanged → place.operating_status_changed
- place.photosRemovedByClaim → place.photos_taken_down
- article.photo_taken_down → article.photos_taken_down
- listing.photo_taken_down → listing.photos_taken_down
- occasion.suspension_lifted → occasion.unsuspended / region.suspension_lifted → region.unsuspended
- listing.offering_ended のペイロードに observedOn（確かめた日）を足す（listing.md と notification.md の OccurrenceKey）
- 置換後に grep で旧名が残っていないことを確かめる

### Notification 完了メモ

- 重複の防止は deliverAll と Mailer.send のキーの一意性。Notification の消費者に IdempotencyStore の「先に処理済み」を重ねない（flows と usecases の前提）
- Application のドメインイベント案を Application 担当へ送付済み
- pages: 店舗としての申請の申請者宛て通知を不在のためサービス運営者が受けたら OM-03（index 担当へ依頼済み）。scenario region/event: 不在の地域・イベントへの申請の通知は申請の判断へ（担当へ依頼済み）

## 直しと flows（現在）

- usecases + testcases 全14ドメイン完了（ユースケース178、ポート適合テスト37ファイル）。機械的な置換（イベント改名6種、ユースケース名 camelCase 化135件、region の見出し）は実行済み
- 書き手の指摘と決定の集約: spec/review/fix-round-tech.md。直しのブリーフ: spec/review/brief-fix.md。直し8体 実行中（Account+Authority / Area+Place / Listing+Media / Region+Occasion / Article+Moderation+Bookmark / Application / Discovery(+pages 2点) / Notification）
- flows: spec/review/flow-candidates.md を入力に1体で spec/flows/index.md を執筆中（a6e26df5d9c0ad302）。返答の「欠け」を直す → flows の失敗時の扱いに基づく testcases の追記が要るか判断
- 次: spec/index.md を書く → 全量の独立した読み（新しい目。criteria.md・contract.md・spec 全量。最大3周）→ 反例を直す → manual-tests（spec-manual-test スキル）→ spec/review 削除 → 完了報告

## 直しの状況

- 直し8体は完了。統一事項を4体に追い依頼中: Article+Moderation+Bookmark(a8d56da9a0ba74a5f)=版を含む要求の範囲を index に合わせる / Region+Occasion(a63c13bcc9aaed7ee)・Listing(a47c43cd7bb2fcdec)=申立ての写真削除のエラー・公開操作の判定順・authorizePhotoRemoval のコード / Authority(aea74b7c69c28ad32)=operate_service の説明
- scenario/editorial.md の共通の規則を「保存の競合」と「公開・取り下げの前提の変化」に分けた（index「編集の競合」が正）
- flows（a6e26df5d9c0ad302）待ち → 欠けを直す → spec/index.md → 全量の読み

## 全量の読み 1周目（現在）

- flows 完了（24本・ドメインイベント51種。欠け4件は決定して反映済み: DLQ は運用、approveNewListing のイベント、Bookmark の残り方）。spec/index.md 生成済み（274ファイル、約2.2MB）
- 読みのブリーフ: spec/review/brief-read.md。spec が大きいので読み手を9区分に分けた（環境の事実として区分を伝えるだけで、疑う箇所は伝えていない）。出力は spec/review/read-1-*.md
  - scenario / pages / account-authority / application / place-listing / region-occasion / article-moderation-bookmark / discovery-notification / flows-cross
- 予算: 読み → 修正 → 読み直しは3周まで。1周目の反例を直したら、2周目は増分（直した箇所）を同じ読み手に見せるか、新しい目に読ませるかを決める
- その後: manual-tests（spec-manual-test スキル）→ spec/review 削除 → 完了報告（見送り: ログアウト・メールアドレス変更は未設計、読みものの削除なし、連絡者への結果通知なし）

### 1周目の読みの状況

- 返ってきた読み: pages(14) / article-moderation-bookmark(19+5) / scenario(8+5) / region-occasion(12+6)。残り: account-authority / application / place-listing / discovery-notification / flows-cross
- 区分をまたぐ決定: spec/review/decisions-read1.md（申立ての写真削除の統一、匿名の保存一覧、要求台帳 spec/ledger.md を恒久化、店舗の側の操作に代行なし、共有カーネルのエラーコード）。index.md にも反映済み
- 直しのブリーフ: spec/review/brief-fix2.md。体験側（scenario+pages）の直し a650ca795bc47e5a9 実行中。技術側は全読みが揃ってから区分ごとに直しを投げる（decisions-read1.md を読ませる）
- 完了時: spec/review を削除するが spec/ledger.md は残す（spec が引く番号の定義）

### 1周目の直し（実行中）

- 体験側 a650ca795bc47e5a9 / Application a30cac9805f4a301c / Article+Moderation+Bookmark af252fbf8320786c2 / Region+Occasion a7afdc7731e544b69 / Place+Listing ad58132f582653853 / Account+Authority(+index.md) ac925873765f1eb28 / Discovery+Notification a63e0be229bee2576
- 先に投げた3体（Application / Article+… / Region+Occasion）は decisions-read1.md の後半（エラーの種類＝ValidationError をなくす、ユースケースの名前の統一 unsuspend/searchForOperation、版の型 Version、作業メモの番号への参照をなくす）を読んでいない可能性 → 完了後に SendMessage で「decisions-read1.md を読み直して後半を当てる」を依頼する
- flows-cross の読み（abfec53f856b474db）はまだ。返ってきたら flows と横断の直しを1体で
- 直しが全部終わったら: ValidationError / decisions- / lift.*Suspension / 旧ファイル名 の残りを grep で確かめ、spec/index.md のリンク切れを確かめる → 2周目の読み

## 利用上限による中断と再委譲（1回目）

- 1周目の直し7体と flows-cross の読みが利用上限（429）で中断。flows-cross の読みは出力ファイルが末尾まで書けていたので完了として扱った（read-1-flows-cross.md）
- 再委譲（同じスコープ・1回目）: 体験側 a28f86f801c1abd23 / Application a652e1e1acb20183c / Article+Moderation+Bookmark a8dbb54699da73e92 / Region+Occasion aa4760712e495d06e / Place+Listing aa4760712e495d06e ではなく a825df82adf83f139 / Account+Authority a3ce8a6ca66b8786b / Discovery+Notification aa726cde1d9720a67 / flows+index.md+横断（新規）a1f63445cce9895e5
- brief-fix2.md に「再委譲の注意」を追記。decisions-read1.md は全決定を集約（エラーの種類、命名の統一、代行の範囲、I-18・I-19 を要求台帳に追加、イベント名は変えず規約の側を直す、公開条件のコードの統一）
- index.md は flows+横断の担当だけが触る。spec/index.md のテストケースのリンクは、直しが全部終わってから自分でスクリプトで作り直す
- 再委譲の回数: 直し7体は各1回目。もう一度中断したら2回目はスコープを分割する

## 1周目の直し 完了 → 追い直し（現在）

- 再委譲した直し8体はすべて完了。範囲の外の依頼は spec/review/followups-1.md に集約
- 追い直し3体 実行中: 技術1（Place/Listing/Media/Article/Moderation/Bookmark/Area）a1747f25118afad19 / 技術2（Region/Occasion/Discovery/Notification/flows）a55d3b32296323437 / 体験側の小さな直し ac6d49a02181490a5
- 追い直しの後に自分でやること: spec/index.md をスクリプトで作り直す（テストケースのリンク、ledger.md のリンクを保つ）。grep で ValidationError・decisions-・spec/review・旧名・lift.*Suspension の残りを確かめる。usecases の見出しと testcases のファイル名の一致を確かめる
- その後: 2周目の読み（予算3周のうち2周目。1周目と同じ9区分で新しい目。出力は read-2-*.md）

## 2周目の読み（現在）

- 1周目の直し・追い直しは完了。機械チェック: usecases の見出し179 = testcases のファイル179、ports 40、spec/index.md のリンク切れなし、旧名・ValidationError・作業メモ参照の残りなし
- 自分で直したもの: 技術設計の「カード」→「要約」（Discovery の改名の追随）、index.md に deliverNotifications の読み取りの位置の例外を一文
- 2周目の読み: 新しい目で9区分（1周目と同じ区分）。出力は spec/review/read-2-*.md。1周目の read-1-*.md は読み手に渡さない（brief-read.md は「spec/review の他のファイルは読まない」と指示済み）
- 予算: これが3周のうち2周目。2周目の反例を直したら3周目（最後）。3周目で反例が残れば停止してユーザーに渡す

## 2周目の読みの中断（2026-09-23）

- 2周目の読み9体が利用上限（429、monthly spend limit）で全て中断。read-2-*.md は無し
- 再開手順は spec/review/RESUME.md にまとめた
