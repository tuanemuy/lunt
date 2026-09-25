# requestInfoReportConfirmation

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗管理者が2人いる店舗についての、未対応の連絡がある。操作する人はサービス運営者 | 確認を依頼する | 成功する。連絡は確認依頼中になり、依頼の日時（現在時刻）を持つ。対象・種類・内容・連絡した人・受け付けた日時は変わらない。`info_report.confirmation_requested`（`reportId`、対象）が1件出る。以後の `listConfirmationRequestsForPlace` に現れ、`listUnresolvedInfoReports` にも確認依頼中として現れる（AC-77） | |
| 店舗管理者のいる店舗の掲載を対象にした、未対応の連絡がある | サービス運営者が確認を依頼する | 成功する。`info_report.confirmation_requested` の対象は、掲載の ID と店舗の `placeId` を持つ | |
| 未対応の連絡の対象の店舗が、非公開になっている。店舗管理者はいる | サービス運営者が確認を依頼する | 成功する。対象が閲覧できるかどうかを確かめずに確認依頼中になる | |
| 未対応の連絡の対象の店舗で、連絡の後にすべての店舗管理者が辞任・退会した | サービス運営者が確認を依頼する | `BusinessRuleError`（`MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`）。連絡は未対応のままで、`info_report.confirmation_requested` は出ない | |
| 確認依頼中の連絡がある | サービス運営者が、もう一度確認を依頼する | `BusinessRuleError`（`MODERATION_INFO_REPORT_NOT_OPEN`）。依頼の日時は変わらず、ドメインイベントは新たに出ない | |
| 対応済みの連絡がある | サービス運営者が確認を依頼する | `BusinessRuleError`（`MODERATION_INFO_REPORT_NOT_OPEN`）。連絡は対応済みのままで、ドメインイベントは出ない | |
| サービス運営者 A と B が、同じ未対応の連絡を読んだ。B が先に確認を依頼した | A が確認を依頼する | `BusinessRuleError`（`MODERATION_INFO_REPORT_NOT_OPEN`）。連絡は B の依頼のままで、`info_report.confirmation_requested` は B の1件だけ | |
| サービス運営者 A と B の、同じ未対応の連絡への確認の依頼が同時に実行され、どちらも未対応の連絡を読んだ後に、B が先にコミットした | A の要求がコミットする | `ConflictError`。連絡は B の依頼のままで、`info_report.confirmation_requested` は B の1件だけ | |
| 確認依頼中の連絡の対象の店舗で、すべての店舗管理者が辞任した | サービス運営者が確認を依頼する | `BusinessRuleError`（`MODERATION_INFO_REPORT_NOT_OPEN`）。連絡の状態を、店舗管理者の有無より先に判定する | |
| 未対応の連絡がある。操作する人は、対象の店舗の店舗管理者で、サービス運営者の役割を持たない | 確認を依頼する | `ForbiddenError`。連絡は未対応のままで、ドメインイベントは出ない | |
