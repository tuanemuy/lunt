# StewardedTargetDirectory

契約は [Authority](../../domains/authority.md) の「StewardedTargetDirectory」による。読み取り専用のポートで、書き込みのメソッドを持たない。前提条件は、店舗を Place の `PlaceRepository`、地域を Region の `RegionRepository`、イベントを Occasion の `OccasionRepository` の `insert`・`save` で保存して組み立てる。

記号: P1、P2 は店舗、R1 は地域、O1 はイベントを指す `StewardedRef`（同じ種類の中は ID の昇順）。

## describe

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P1、公開中の地域 R1、公開中のイベント O1 が保存されている | `describe([O1, R1, P1])` | P1、R1、O1 の順（`target.kind` は `place`、`region`、`occasion` の順）に、それぞれの `target` と名称を返す | |
| 店舗 P2、P1 が保存されている | `describe([P2, P1])` | P1、P2 の順（同じ種類の中は `target.id` の昇順）に返す | |
| 店舗 P1 が保存されている。P2 は保存されていない | `describe([P1, P2])` | P1 の1件を返す。存在しない対象は結果に含まれず、エラーにならない | |
| 店舗 P1 が保存されている | `kind` が `region` で、`id` の文字列が P1 と同じ `StewardedRef` で `describe` | 空の結果を返す。対象は `kind` と `id` の組で区別する | |
| 名称を持つ下書きの地域 R1 が保存されている | `describe([R1])` | R1 を名称つきで返す。公開状態を問わない | |
| 名称が未入力の下書きの地域 R1 と、名称が未入力の下書きのイベント O1 が保存されている | `describe([R1, O1])` | R1、O1 を、どちらも `name: null` で返す | |
| 運営による非公開の店舗 P1、運営による非公開の地域 R1、公開を取り下げたイベント O1 が保存されている | `describe([P1, R1, O1])` | 3件を名称つきで返す。運営による非公開と公開状態を問わない | |
| 店舗 P1 が保存されている | `describe([])` | 空の結果を返す。エラーにならない | |
| 100件の店舗が保存されている | 100件の対象で `describe` | 100件を返す | |
| 店舗 P1 が保存されている | 101件の対象で `describe` | `BusinessRuleError`（`COMMON_INVALID_INPUT`） | |

## 可視性

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 空 | UnitOfWork の中で地域 R1 を `insert` してコミットし、直後に `describe([R1])` | R1 を返す（read-your-writes） | |
| 地域 R1 が保存されている | UnitOfWork の中で R1 の名称を変えて `save` してコミットし、直後に `describe([R1])` | 新しい名称を返す | |
| 空 | UnitOfWork の中で地域 R1 を `insert` し、`fn` が例外を投げた後、`describe([R1])` | 空の結果を返す | |
