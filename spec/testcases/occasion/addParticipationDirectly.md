# addParticipationDirectly

共通の前提: イベント O の開催期間は 10/1〜10/3。店舗 P は店舗管理者がいなく、非公開でない。店舗 P の掲載 L1 は公開中で提供中、L2 は一時非公開、L3 は公開中で提供終了。店舗 P は地域 R に所属中。

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人はイベント O の運営者。店舗 P は参加していない | 掲載 L1 と参加日 10/1・10/2 を添えて、店舗 P を追加する | 承認なしに参加が成立する。`participatedAt` は現在時刻。`occasion.participation_established` が出る。イベント O の参加店舗と、店舗 P の参加中のイベントに現れる。店舗 P と掲載 L1 の公開状態・提供状態、店舗 P の地域 R への所属は変わらない（AC-33、AC-73） | |
| 操作する人はイベント O の運営者 | 掲載も参加日も添えずに、店舗 P を追加する | 参加が成立する | |
| 操作する人はイベント O の運営者 | 提供終了の掲載 L3 を添えて、店舗 P を追加する | 参加が成立する（I-22） | |
| 操作する人はイベント O の運営者。イベント O は開催期間を過ぎて終了している | 店舗 P を追加する | 参加が成立する。開催の状態を問わない | |
| イベント O にイベント運営者がいない。操作する人はサービス運営者 | 店舗 P を追加する | 参加が成立する（代行） | |
| 操作する人はイベント O の運営者。店舗 Q に店舗管理者がいる | 店舗 Q を追加する | `BusinessRuleError`（`OCCASION_PLACE_HAS_STEWARD`）。参加は作られない（AC-33） | |
| 操作する人はイベント O の運営者。店舗 P は非公開になっている | 店舗 P を追加する | `BusinessRuleError`（`OCCASION_PLACE_NOT_VIEWABLE`）。参加は作られない | |
| 操作する人はイベント O の運営者。店舗 P はすでに参加中 | 店舗 P を追加する | `BusinessRuleError`（`OCCASION_ALREADY_PARTICIPATING`）。参加内容は変わらず、`occasion.participation_established` は重ねて出ない | |
| 操作する人はイベント O の運営者。店舗 P の追加が成立した後 | 同じ追加をもう一度送る | `BusinessRuleError`（`OCCASION_ALREADY_PARTICIPATING`） | |
| 操作する人はイベント O の運営者 | 一時非公開の掲載 L2 を添えて、店舗 P を追加する | `BusinessRuleError`（`OCCASION_LISTING_NOT_ATTACHABLE`）。参加は作られない | |
| 操作する人はイベント O の運営者 | 参加日 10/4 を添えて、店舗 P を追加する | `BusinessRuleError`（`OCCASION_PARTICIPATION_DATE_OUT_OF_PERIOD`）。参加は作られない | |
| 操作する人はイベント O の運営者。除外された店舗 P は参加していない | 店舗 P を追加する | 新しい参加として成立する。`participatedAt` は現在時刻 | |
| イベント O にイベント運営者がいる。操作する人は、イベント O の管理権限を持たないサービス運営者 | 店舗 P を追加する | `ForbiddenError`。参加は作られない | |
| 操作する人は、イベント O の管理権限を持たない利用者 | 店舗 P を追加する | `ForbiddenError` | |
| 操作する人はイベント O の運営者。指定した ID の店舗がない | 店舗を追加する | `NotFoundError`。参加は作られない | |
| 操作する人はイベント O の運営者。店舗 P の参加の申請の承認と、店舗 P の追加が、それぞれ読んだ時点の事実では成立する状態で、同時に確定する | 店舗 P を追加する | 後に確定する側が `ConflictError` になる。組の参加は1つで、`occasion.participation_established` は1件だけ残る | |
