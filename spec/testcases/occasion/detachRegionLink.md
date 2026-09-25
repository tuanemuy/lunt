# detachRegionLink

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 操作する人は地域 R の運営者。イベント O が地域 R を関連づけ中（`linked`）。店舗 P は地域 R に所属中で、イベント O に参加中 | イベント O からの関連づけを解除する | 関連づけが `detached` になり、`linkedAt` は変わらない。`occasion.region_link_detached` が出る。店舗 P の所属と参加、店舗 P とその掲載の公開状態・提供状態は変わらない（AC-34、AC-73） | |
| 操作する人は地域 R の運営者。解除した後 | イベント O の運営者が `linkRegion` で地域 R を関連づける | `BusinessRuleError`（`OCCASION_REGION_LINK_DETACHED`）（AC-34） | |
| 操作する人は地域 R の運営者。関連づけ中のイベント O は、運営による非公開 | 関連づけを解除する | `detached` になる。閲覧できないイベントも同じく解除できる | |
| 地域 R に地域運営者がいない。操作する人はサービス運営者 | 関連づけを解除する | `detached` になる（代行） | |
| 操作する人は地域 R の運営者。解除するまでの間に、イベント O の運営者が関連づけを外した | 関連づけを解除する | `NotFoundError`。関連づけは作られない | |
| 操作する人は地域 R の運営者。別の運営者がすでに解除している | 関連づけを解除する | `BusinessRuleError`（`OCCASION_REGION_LINK_ALREADY_DETACHED`）。関連づけは変わらず、`occasion.region_link_detached` は重ねて出ない | |
| 地域 R に地域運営者がいる。操作する人は、地域 R の管理権限を持たないサービス運営者 | 関連づけを解除する | `ForbiddenError`。関連づけは変わらない | |
| 操作する人は、イベント O の運営者で、地域 R の管理権限を持たない | 関連づけを解除する | `ForbiddenError` | |
| 操作する人は地域 R の運営者。関連づけは `linked`。別の運営者の解除が同時に確定する | 関連づけを解除する | 後に確定する側が `ConflictError` になる。関連づけは `detached` で、`occasion.region_link_detached` は1件だけ残る | |
