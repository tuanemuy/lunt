# submitTakedownClaim

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 閲覧できる掲載がある。操作する人はログインしていない | 立場を店舗本人、対象をその掲載にし、写真を示さず、理由とメールアドレスを添えて提出する | 成功する。未対応の申立てが、提出した立場・対象・理由・メールアドレスと、受け付けた日時（現在時刻）で保存される。`takedown_claim.submitted`（`claimId`）が出る。`Actor` を渡さずに成立する（AC-46） | |
| 閲覧できる店舗があり、その店舗に店舗管理者がいる | 立場を店舗本人、対象をその店舗にして提出する | 成功する。店舗管理者の有無にかかわらず、未対応の申立てが保存され、`takedown_claim.submitted` が出る（AC-31、AC-46） | |
| 閲覧できる掲載があり、写真を2枚持つ | 立場を写真の権利者、対象をその掲載にし、そのうち1枚の `PhotoId` を示して提出する | 成功する。申立ては示した写真を持つ。`takedown_claim.submitted` が出る（AC-31） | |
| 閲覧できる地域・イベント・読みものが、それぞれ写真を持つ | 立場を写真の権利者にし、それぞれの対象について、対象の写真を示して提出する | どの対象でも成功し、未対応の申立てが保存される（AC-31） | |
| 閲覧できる地域がある | 立場を店舗本人、対象をその地域にして提出する | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_GROUND`）。申立てもドメインイベントも残らない | |
| 閲覧できる掲載が写真を持つ | 立場を写真の権利者にし、写真を1枚も示さずに提出する | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_GROUND`）。申立てもドメインイベントも残らない | |
| 閲覧できる掲載が写真を持つ | 立場を店舗本人にし、その掲載の写真を1枚示して提出する | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_GROUND`）。申立てもドメインイベントも残らない | |
| 閲覧できる掲載がある | 立場を写真の権利者にし、その掲載の現在の写真にない `PhotoId` を示して提出する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET`）。申立てもドメインイベントも残らない | |
| 閲覧できる掲載が写真 A・B を持つ。写真の権利者が A を示して入力している間に、店舗管理者が A を外して保存した（掲載は閲覧できるまま） | 写真の権利者として、A を示して提出する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_PHOTO_NOT_IN_TARGET`）。含まれない写真として A を示す。申立てもドメインイベントも残らない | |
| 閲覧できる掲載がある | 理由を空にして提出する | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_REASON`）。申立てもドメインイベントも残らない | |
| 閲覧できる掲載がある | 形式の正しくないメールアドレスで提出する | `BusinessRuleError`（`COMMON_INVALID_EMAIL_ADDRESS`）。申立てもドメインイベントも残らない | |
| 対象の掲載が、入力している間に運営による非公開になった | 店舗本人として提出する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`）。申立てもドメインイベントも残らない | |
| 対象の掲載の店舗が、入力している間に非公開になった | 店舗本人として、その掲載を対象に提出する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`）。申立てもドメインイベントも残らない | |
| 対象の読みものが、入力している間に公開の取り下げになった | 写真の権利者として提出する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`）。申立てもドメインイベントも残らない | |
| 対象の掲載が、入力している間に削除された | 店舗本人として提出する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`）。申立てもドメインイベントも残らない | |
| 写真を持つ掲載が、入力している間に削除された | 写真の権利者として、その掲載の写真を示して提出する | `BusinessRuleError`（`MODERATION_TAKEDOWN_CLAIM_TARGET_UNAVAILABLE`）。申立てもドメインイベントも残らない | |
| 対象の掲載が、入力している間に運営による非公開になった | 店舗本人として、理由を空にして提出する | `BusinessRuleError`（`MODERATION_INVALID_TAKEDOWN_REASON`）。値オブジェクトの規則を、対象が閲覧できないことより先に判定する | |
| 申立てを提出して、未対応の申立てが保存されている | 同じ ID・同じ立場・対象・写真・理由・メールアドレスで、もう一度提出する | 成功する。申立ては1件のままで、受け付けた日時は変わらない。`takedown_claim.submitted` は新たに出ない | |
| 申立てを提出して、未対応の申立てが保存されている | 同じ ID で、理由だけを変えて提出する | `ConflictError`。保存されている申立ては変わらず、ドメインイベントは出ない | |
| 閲覧できる店舗に、未対応の申立てが1件ある | 同じ店舗を対象に、別の ID で申立てを提出する | 成功する。2件の申立てが、互いに独立した未対応の申立てとして保存される | |
