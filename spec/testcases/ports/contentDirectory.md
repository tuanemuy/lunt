# ContentDirectory

契約は [Moderation](../../domains/moderation.md) の「ContentDirectory」による。読み取り専用のポートで、書き込みのメソッドを持たない。前提条件は、掲載を Listing の `ListingRepository`、店舗を Place の `PlaceRepository`、地域を Region の `RegionRepository`、イベントを Occasion の `OccasionRepository`、読みものを Article の `ArticleRepository` の `insert`・`save` で保存して組み立てる。削除された対象は、`delete` を持つ `ListingRepository` の `delete` で掲載を削除して組み立てる。前提条件の書き込みは UnitOfWork の中で行う。`describe` は UnitOfWork に参加しないので、`run` の外で呼ぶ。

記号: L1 は掲載、P1・P2 は店舗、R1 は地域、O1 はイベント、A1 は読みものを指す `ContentRef`（同じ種類の中は ID の昇順）。

## describe

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の掲載 L1、店舗 P1、公開中の地域 R1、公開中のイベント O1、公開中の読みもの A1 が保存されている | `describe([A1, O1, R1, P1, L1])` | L1、P1、R1、O1、A1 の順（`target.kind` は `listing`、`place`、`region`、`occasion`、`article` の順）に、それぞれの `target`、名称（読みものはタイトル）、写真を返す | |
| 店舗 P2、P1 が保存されている | `describe([P2, P1])` | P1、P2 の順（同じ種類の中は `target.id` の昇順）に返す | |
| 写真 X・Y・Z をこの順に持つ掲載 L1 が保存されている | `describe([L1])` | `photoIds` は X、Y、Z の順 | |
| 写真を持たない店舗 P1 が保存されている | `describe([P1])` | P1 を、空の `photoIds` で返す | |
| 店舗 P1 が保存されている。P2 は保存されていない | `describe([P1, P2])` | P1 の1件を返す。存在しない対象は結果に含まれず、エラーにならない | |
| 掲載 L1 が保存されている | UnitOfWork の中で L1 を `delete` してコミットし、直後に `describe([L1])` | 空の結果を返す。削除された対象は結果に含まれない | |
| 店舗 P1 が保存されている | `kind` が `listing` で、`id` の文字列が P1 と同じ `ContentRef` で `describe` | 空の結果を返す。対象は `kind` と `id` の組で区別する | |
| 運営による非公開の掲載 L1、非公開の店舗 P1、公開を取り下げた地域 R1、運営による非公開のイベント O1、公開を取り下げた読みもの A1 が保存されている | `describe([L1, P1, R1, O1, A1])` | 5件を、名称と写真つきで返す。公開状態、運営による非公開、店舗の非公開を問わない | |
| 非公開の店舗 P1 に紐づく公開中の掲載 L1 が保存されている | `describe([L1])` | L1 を名称と写真つきで返す | |
| 名称が未入力の下書きの地域 R1 と、タイトルが未入力の下書きの読みもの A1 が保存されている | `describe([R1, A1])` | R1、A1 を、どちらも `name: null` で返す | |
| 店舗 P1 が保存されている | `describe([])` | 空の結果を返す。エラーにならない | |
| 100件の店舗が保存されている | 100件の対象で `describe` | 100件を返す | |
| 店舗 P1 が保存されている | 101件の対象で `describe` | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## 可視性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 写真 X・Y を持つ掲載 L1 が保存されている | UnitOfWork の中で、X を外した L1 を `save` してコミットし、直後に `describe([L1])` | `photoIds` は Y だけ（read-your-writes） | |
| 写真 X を持つ地域 R1 が保存されている | UnitOfWork の中で、写真 Y を加えた R1 を `save` してコミットし、直後に `describe([R1])` | `photoIds` は X、Y の順 | |
| 読みもの A1 が保存されている | UnitOfWork の中で A1 のタイトルを変えて `save` してコミットし、直後に `describe([A1])` | 新しいタイトルを返す | |
| 空 | UnitOfWork の中で店舗 P1 を `insert` し、`fn` が例外を投げた後、`describe([P1])` | 空の結果を返す | |
