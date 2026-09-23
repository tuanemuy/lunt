# publishArticle

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| タイトル・本文・写真1枚を持つ下書き。紹介先はない | 公開する | 成功する。公開状態が `published` になり、`firstPublishedAt` が操作の時刻になる。版が進む。承認を求めない。ドメインイベントは出ない。Discovery の読み取りに、その読みものが現れる（AC-62） | |
| 別の編集担当者が作成した、公開条件を満たす下書き | 公開する | 成功する | |
| 公開条件を満たす下書き。紹介先の1つが閲覧できない | 公開する | 成功する。結びつけは残る | |
| タイトルのない下書き | 公開する | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目として `title` を示す。下書きのまま残る（AC-68） | |
| 写真のない下書き | 公開する | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目として `photos` を示す（AC-68） | |
| 本文のない下書き | 公開する | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目として `body` を示す（AC-68） | |
| タイトル・写真・本文のどれもない下書き | 公開する | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目として3つとも示す | |
| 公開条件を欠く下書きに、未保存の変更がある | `reviseArticle` で保存し、続けて公開する | 保存は成立し、公開は `ARTICLE_PUBLISH_CONDITION_UNMET` になる。保存した内容は下書きのまま残る | |
| 時刻 T1 に公開し、その後に `unpublishArticle` で取り下げた読みもの | 時刻 T2 に公開する | 成功する。`published` になり、`firstPublishedAt` は T1 のまま | |
| 申立てによる写真の削除で公開が取り下げられ、`reviseArticle` で写真を加えた読みもの | 公開する | 成功する。`published` になり、`firstPublishedAt` は最初の公開の日時のまま（AC-79） | |
| 申立てによる写真の削除で公開が取り下げられ、写真を加えていない読みもの | 公開する | `BusinessRuleError`（`ARTICLE_PUBLISH_CONDITION_UNMET`）。欠けている項目として `photos` を示す（AC-79） | |
| 編集担当者 A が下書きを開いた後、編集担当者 B が先に公開した | A が公開する | `BusinessRuleError`（`PUBLICATION_INVALID_TRANSITION`）。読みものは B が公開した状態のまま変わらない | |
| 編集担当者 A が下書きを開いた後、編集担当者 B が内容を保存した | A が公開する | 成功する。B が保存した内容で公開される。公開の要求は版を含まない | |
| 編集担当者の役割を持たない利用者 | 公開する | `ForbiddenError` | |
| 下書きを開いている間に、編集担当者の任命を解かれた利用者 | 公開する | `ForbiddenError`。下書きのまま残る（AC-75） | |
