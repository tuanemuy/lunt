# /spec の再開メモ

最終更新: 2026-09-23。`/spec` スキル（`~/.claude/skills/spec/SKILL.md`、完了の定義は `~/.claude/skills/_shared/references/spec-ready.md`）で Lunt の spec を作成中。Implementation Ready の手前で止まっている。

## 現在地

**2周目の独立した読みを最初からやり直すところ。**

2周目の読み（9区分）を起動した直後に、利用上限（HTTP 429、monthly spend limit）で9体すべてが中断した。`spec/review/read-2-*.md` は1つも書かれていない。成果物は1周目の直しと追い直しがすべて反映された状態で、機械チェックも通っている（下記）。

## 終わっていること

| 段階 | 状態 |
| --- | --- |
| 契約（`spec/review/contract.md`）と台帳の読み | 完了。恒久版を `spec/ledger.md`（要求台帳。`spec/index.md` からリンク）に置いた。解釈 I-01〜I-19 |
| scenario（13カテゴリー、114シナリオ） | 完了 |
| pages（10画面群、57画面） | 完了 |
| 中間の独立した読み（scenario / pages 一覧 / domains 一覧） | 完了・反映済み（`read-mid.md`、`decisions-mid.md`） |
| domains（14ドメイン + index.md） | 完了 |
| usecases（14ドメイン、179ユースケース） | 完了 |
| flows（`spec/flows/index.md`、24本、ドメインイベント50種） | 完了 |
| testcases（ユースケーステスト179、ポート適合テスト40） | 完了 |
| `spec/index.md` | 完了（スクリプトで生成。テストケースのリンクを含む） |
| 1周目の独立した読み（9区分、`read-1-*.md`） | 完了 |
| 1周目の反例の直し | 完了（決定: `decisions-read1.md`、範囲外の依頼: `followups-1.md` もすべて反映済み） |

最後の機械チェック（1周目の直しの後）:

- usecases の見出し（`## camelName`）179 = testcases のファイル 179、ports 40
- `spec/index.md` のリンク切れなし
- `ValidationError`・`decisions-`・`spec/review` への参照・旧名（`lift*Suspension`、`remove*PhotoByTakedown`、`removePlacePhotosByClaim`、`category_reassigned`、`sweepWithdrawnAccount`、`findInitialMapExtent`、`readMapPins`）の残りなし

## 次にやること

1. **2周目の読みを9区分で起動し直す**（審査区分。最上位モデル。新しいコンテキスト）。ブリーフは `spec/review/brief-read.md`。出力は `spec/review/read-2-{区分}.md`。1周目の `read-1-*.md` は渡さない（ブリーフが `spec/review/` の他のファイルを読まないよう指示している）。区分と依頼文は下の「2周目の読みの依頼文」
   - 利用上限で2回中断しているので、9体を一度に並列で出さず、3体ずつなどに分けてもよい
2. 反例を直す。直しのブリーフは `spec/review/brief-fix2.md`（末尾の「再委譲の注意」は、途中で中断した直しを引き継ぐときだけ使う）。区分をまたぐ決定は `decisions-read2.md` を新しく作って書き、直しの担当に読ませる。範囲の外の依頼は `followups-2.md` に集めて、最後にまとめて当てる
3. 直した後、機械チェック（上と同じ）をして `spec/index.md` をスクリプトで作り直す
4. **3周目の読み（予算の最後）**。反例ゼロなら Implementation Ready。反例が残れば予算に達したので停止し、残りの反例と成り立っていない条件をユーザーに渡す（`spec/review/` は削除しない）
5. Implementation Ready になったら:
   - `spec/manual-tests/` を `~/.claude/skills/spec-manual-test/SKILL.md` で生成する
   - `spec/review/` を削除する。**`spec/ledger.md` は残す**（spec の各層が引く番号の定義）
   - 完了報告（`~/.claude/skills/spec/SKILL.md` の形式）

## 予算の記録

- spec の読み → 修正 → 読み直し: 1周目は完了。2周目は起動したが中断（周回には数えない）。残り2周（2周目・3周目）
- 同じ作業の再委譲: 1周目の直し7体は1回再委譲した（利用上限による中断）。2周目の読み9体は1回中断した（次の起動が1回目の再委譲）

## 2周目の読みの依頼文

共通の前置き: 「まず `/Users/hikaru/github.com/tuanemuy/lunt/spec/review/brief-read.md` を読み、その指示にすべて従ってください。契約は `spec/review/contract.md`（同じ内容が spec の成果物として `spec/ledger.md` にある）。」に続けて、区分ごとに次を渡す。

| 区分 | 出力 | 範囲 |
| --- | --- | --- |
| scenario | `read-2-scenario.md` | `spec/scenario/`（index.md と13カテゴリーの全文）。上流は契約 |
| pages | `read-2-pages.md` | `spec/pages/`（index.md と10画面群の全文）。上流は `spec/scenario/`（index.md は全文、各カテゴリーは必要な範囲） |
| account-authority | `read-2-account-authority.md` | `spec/domains/index.md`（全文）と Account・Authority の domains・usecases・testcases・ポート適合テスト。上流は scenario の account・membership・operation と関係する pages |
| application | `read-2-application.md` | `spec/domains/index.md`（全文）と Application の domains・usecases・testcases・`ports/{applicationRepository,applicationReviewDesk,overdueNoticeLedger}.md`。上流は scenario/index.md（申請の前提）・application.md と申請を出す・判断するシナリオ、pages の request.md・shared.md CM-01・account.md MY-04/05 |
| place-listing | `read-2-place-listing.md` | `spec/domains/index.md`（全文）と Area・Place・Listing・Media の domains・usecases・testcases・ポート適合テスト。上流は scenario の shop・listing・moderation・operation と関係する pages |
| region-occasion | `read-2-region-occasion.md` | `spec/domains/index.md`（全文）と Region・Occasion の domains・usecases・testcases・ポート適合テスト。上流は scenario の region・event・moderation と関係する pages |
| article-moderation-bookmark | `read-2-article-moderation-bookmark.md` | `spec/domains/index.md`（全文）と Article・Moderation・Bookmark の domains・usecases・testcases・ポート適合テスト。上流は scenario の editorial・moderation・keep と関係する pages |
| discovery-notification | `read-2-discovery-notification.md` | `spec/domains/index.md`（全文）と Discovery・Notification の domains・usecases・testcases・ポート適合テスト。上流は scenario の index.md（表示範囲）・discover・explore・account（通知）と pages の index・browse・detail・account |
| flows-cross | `read-2-flows-cross.md` | `spec/domains/index.md`・`spec/flows/index.md`（全文）、`testcases/ports/unitOfWork.md`、`spec/index.md`、`spec/ledger.md`、層と層・ドメインとドメインの突き合わせ（契約の各項目が scenario から testcases まで辿れるか、参照される振る舞い・ポートメソッド・ドメインイベント・型が定義されているか、依存方向の表と実際の参照、同じものを指す語が1つか、AC-01〜AC-80 が testcases に添えられているか）。全層を Grep と部分的な Read で |

## 作業ファイルの案内（`spec/review/`）

| ファイル | 内容 |
| --- | --- |
| `progress.md` | 時系列の進行メモ（段取り、各委譲の結果の要点） |
| `contract.md` | 契約（要求台帳の元。`spec/ledger.md` と同じ内容） |
| `criteria.md` | 完了の定義の7条件・層の表・アーキテクチャ制約の転記（読み手に渡す） |
| `brief-*.md` | 委譲のブリーフ（scenario / pages / domain / usecase / fix / fix2 / read） |
| `decisions-scenario.md`、`decisions-mid.md`、`decisions-read1.md`、`pages-index-patch.md`、`fix-round-tech.md`、`followups-1.md` | 各段階で下した決定と依頼（すべて spec に反映済み。spec からは参照しない） |
| `ledger-read.md`、`read-mid.md`、`read-1-*.md` | 独立した読みの結果 |
| `flow-candidates.md` | flows の入力にした候補 |

## 完了報告に書く見送り・注意

- ログアウトとメールアドレスの変更は出典になく設計していない（I-17）
- 読みものの削除はない。連絡した利用者への結果の通知はない
- APX 4 の「検索候補」は REQ に要件がなく設計していない（X-07）
- spec の成果物は git に未コミット（`spec/` 配下がすべて未追跡）
