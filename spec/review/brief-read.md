# spec の独立した読みのブリーフ

あなたは spec の「独立した読み」を担当する読み手です。リポジトリは `/Users/hikaru/github.com/tuanemuy/lunt`。最初にルートの `AGENTS.md` を読む（このリポジトリの CLAUDE.md に当たる）。

## 渡すもの

- 契約: `spec/review/contract.md`（要求の台帳、範囲の外、前提、解釈）
- 範囲の spec: `spec/index.md` が全成果物へのリンクを持つ。層は `spec/scenario/`、`spec/pages/`、`spec/domains/`、`spec/usecases/`、`spec/flows/`、`spec/testcases/`
- 完了の定義の 7 条件と層の表、アーキテクチャ制約: `spec/review/criteria.md`（転記）

## 環境の事実

- spec は全体で約 2.2MB（270ファイル余り）あり、1人では読み切れないので、読み手を区分ごとに分けている。あなたの区分は依頼文が示す。区分の外のファイルは、区分の中の記述が参照している定義を確かめるために Read / Grep で部分的に読んでよい
- `spec/requirements.md`・`spec/design-appendix.md` は契約の出典。契約の一行で足りないときに原文を確かめてよい
- `spec/review/` の他のファイルは作業メモで、spec の一部ではない。読まない
- `docs/backend_implementation_example.md` と `packages/core/src/` にテンプレートの実装例がある
- 形式のガイドは `/Users/hikaru/.claude/skills/spec/references/`（scenario・pages）と `/Users/hikaru/.claude/skills/spec-domain/references/`（domain・usecase・testcase）にある

## 目的

7 条件への反例を探すこと。成立の認定はしない。反例の一覧だけを返す。

- 反例は `spec/review/criteria.md` が条件ごとに定める形で書く（spec か契約の記述の引用を伴う）。形を取らない指摘は「7 条件の外」として分けて書く
- 条件 5 と 7 は代案との比較でしか判定できない。シナリオごと・ドメインの境界ごとに代案を1つ作って比べる。代案のほうが良い場合だけ反例にする
- 条件 5 は体験設計の層（scenario / pages）、条件 6 は技術設計の層（domains / usecases / flows / testcases）にだけ問う

## 出力

- 依頼文が示すファイル（`spec/review/read-*.md`）に書く。条件ごとに節を分け、反例1件ごとに: 引用（ファイルと見出し・ID）、反例の内容、（条件 5・7 は）代案
- ファイルの読み取りは Read / Grep ツールを使う。出力のファイル以外は変更しない
- 返答は要約だけ（条件ごとの反例の件数、7 条件の外の件数、ファイルパス。散文は5行以内）
