# 技術設計の直しの委譲ブリーフ

リポジトリは `/Users/hikaru/github.com/tuanemuy/lunt`。最初にルートの `AGENTS.md` を読む。

domains・usecases・testcases は書き終わっている。書き手からの指摘と、それへの決定を `spec/review/fix-round-tech.md` に集約した。担当ドメインの3層（`spec/domains/${domain}.md`、`spec/usecases/${domain}.md`、`spec/testcases/${domain}/*.md`、担当ドメインのポートの `spec/testcases/ports/*.md`）を、決定と `spec/domains/index.md` の規約に合わせて直す。

## 読むもの

1. `spec/domains/index.md` — 全文。書き手の指摘を受けて改訂されている。**これが正**。とくに: 依存方向、共有カーネル（`EmailAddress`、`Tagline`、`Publication` の `reason` と `PUBLICATION_INVALID_TRANSITION`、`GeoBounds`）、操作の可否（サービス運営者が対象を開いて確かめる読み取り）、ドメインイベントの名前、リポジトリの共通の契約（決まった少数の集約、`findByIds` は 0〜100件、削除済みへの `save` は `NotFoundError`）、エラーの種類（`ForbiddenError`）、ユースケースの名前（camelCase）、編集の競合（版を含む要求、状態のエラーを先に判定）、時間の経過で起きる出来事（ジョブの進め方と打ち切り）、申立てに基づく写真の削除、写真の持ち主
2. `spec/review/fix-round-tech.md` — 全文。担当ドメインの節、「全 usecases 共通」、他のドメインの節のうち担当ドメインに求めていること
3. 担当ドメインの3層のファイルと、参照する他ドメインのファイル
4. 形式と層の決まりは `spec/review/brief-domain.md` と `spec/review/brief-usecase.md`

## 直し方

- 上流（index.md、決定）が正。3層を上流から下流へ一貫して直す（domains を直したら、それを使う usecases と testcases も直す）
- ユースケースの名前は camelCase に一括で置換済み、ドメインイベントの名前も一括で置換済み。置換で不自然になった箇所（一覧の表、見出し、本文）があれば整える
- 決定に「提案どおり」とあるものは、書き手の暫定の書き方のままでよい。ただし「暫定」「仮」「未定」などの書き方が残っていれば、現在形の事実に直す
- fix-round-tech.md に挙がっていない誤り・食い違い（domains に定義のない振る舞い・ポートを usecases が呼んでいる、testcases の期待結果が domains から一意に決まらない、など）を見つけたら、上流から決まる範囲で直す。決まらないものは返答で伝える
- 現在形で書く。経緯・代替案・「変更した」などは書かない。契約と上流にない要素を足さない
- 担当外のファイルは変更しない。他ドメインのファイルに直しが要る点は返答で伝える

## 返答

要約だけ（直したファイルの数、決まらなかった点、他ドメインに求めること。5行以内）。ファイルの読み取りは Read / Grep ツールを使う。
