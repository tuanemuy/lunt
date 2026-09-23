# unpublishArticle

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の読みもの。紹介先を持つ | 公開を取り下げる | 成功する。公開状態が `unpublished`（事由は `byManager`）になり、`firstPublishedAt` は保たれる。内容と紹介先の結びつけは変わらない。版が進む。ドメインイベントは出ない。Discovery の読み取り（読みものの一覧、検索、紹介先の詳細、記事）に現れなくなる（AC-62） | |
| 別の編集担当者が公開した読みもの | 公開を取り下げる | 成功する | |
| 公開を取り下げた読みもの | `listArticlesForEditing` を公開の取り下げで絞って読む | その読みものが現れ、事由は `byManager` | |
| 公開を取り下げた読みもの | `reviseArticle` で内容を直し、`publishArticle` で公開する | どちらも成功する | |
| 下書きの読みもの | 公開を取り下げる | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。下書きのまま変わらない | |
| 編集担当者 A が公開中の読みものを開いた後、編集担当者 B が先に取り下げた | A が取り下げる | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。読みものは B が取り下げた状態のまま変わらない | |
| 編集担当者 A が公開中の読みものを開いた後、編集担当者 B が内容を保存した | A が取り下げる | 成功する。B が保存した内容のまま `unpublished`（`byManager`）になる。取り下げの要求は版を含まない | |
| 公開中の読みものを開いている間に、編集担当者の任命を解かれた利用者 | 取り下げる | `ForbiddenError`。公開のまま残る（AC-75） | |
