# ADR 0019: 画面と URL の対応

- 状態: 採用

## 背景

spec/pages は画面の ID と機能を定め、URL を定めない。通知の行き先、検索パラメーターの転送境界、画面間の行き来は、画面と URL の対応を共有する。

## 決定

画面は次の URL に置く。URL は英語の名詞で、対象の ID をパスに持つ。実際のルートは `apps/web/app/routes` のファイルルートが正で、この表は対応の一覧として保つ。

ログイン: 「要」は CS-04 の誘導の対象。管理側はさらに役割・管理権限の確認（CS-05）を持つ。

| ID | 画面 | ログイン | URL（検索パラメーター） |
| --- | --- | --- | --- |
| VW-01 | みつける | 不要 | `/`（`area`・`cat`） |
| VW-02 | 絞り込み | 不要 | `/filter`（`from=discover\|map\|regions` と現在の条件） |
| VW-03 | 検索 | 不要 | `/search`（`q`） |
| VW-04 | マップ | 不要 | `/map`（`area`・`cat`・`view=map\|list`・`region`・`bbox`） |
| VW-05 | まち | 不要 | `/regions`（`area`） |
| VW-06 | 地域内の一覧 | 不要 | `/regions/$regionId/places`（`tab=places\|listings`） |
| VW-07 | イベントの一覧 | 不要 | `/events` |
| VW-08 | 参加店舗マップ | 不要 | `/events/$occasionId/map` |
| VW-09 | 読む | 不要 | `/articles` |
| VW-10 | 保存 | 不要（端末またはアカウント） | `/saved` |
| DT-01 | 掲載詳細 | 不要 | `/listings/$listingId` |
| DT-02 | 店舗詳細 | 不要 | `/places/$placeId` |
| DT-03 | 地域詳細 | 不要 | `/regions/$regionId` |
| DT-04 | イベント詳細 | 不要 | `/events/$occasionId` |
| DT-05 | 記事 | 不要 | `/articles/$articleId` |
| MY-01 | マイページ | 不要（2つの状態） | `/me` |
| MY-02 | ログイン | 不要 | `/login`（`next`）、リンクの着地 `/login/link`、外部ログインの戻り先はサーバーのルート |
| MY-03 | 通知一覧 | 要 | `/me/notifications` |
| MY-04 | 自分の申請の一覧 | 要 | `/me/applications`（SM から開くときは `place`） |
| MY-05 | 申請の詳細 | 要 | `/me/applications/$applicationId` |
| MY-06 | 招待の承諾 | 要 | `/invitations/$invitationId` |
| MY-07 | 退会 | 要 | `/me/withdraw` |
| RQ-01 | 店舗を探す | 不要 | `/apply/find-place`（`name`・`address`） |
| RQ-02 | 店舗の申請 | 要 | `/apply/places/new`、`/apply/places/$placeId/revision` |
| RQ-03 | 管理権限の申請 | 要 | `/apply/places/$placeId/stewardship` |
| RQ-04 | 掲載の申請 | 要 | `/apply/places/$placeId/listings/new`、`/apply/listings/$listingId/revision`（`step=preview`） |
| RQ-05 | 所属・離脱の申請 | 要 | `/apply/affiliation`（`placeId`・`regionId`・`mode=join\|leave`） |
| RQ-06 | 参加の申請 | 要 | `/apply/participation`（`placeId`・`occasionId`） |
| RQ-07 | 取り下げの申立て | 不要 | `/takedown/$kind/$id` |
| RQ-08 | 情報の誤り・閉店の連絡 | 要 | `/info-report/$kind/$id` |
| CM-01 | 申請の判断 | 要 | `/manage/applications/$applicationId` |
| CM-02 | メンバーの管理 | 要 | `/manage/{places\|regions\|events}/$id/members` |
| CM-03 | 公開前の確認 | 要 | `/manage/places/$placeId/listings/$listingId/preview`、`/editorial/articles/$articleId/preview`（RQ-04 からは RQ-04 の中の段階） |
| CM-04 | 参加内容の編集 | 要 | `/manage/places/$placeId/events/$occasionId`、`/manage/events/$occasionId/participants/{$placeId,new}` |
| SM-01〜07 | 店舗管理 | 要 | `/manage/places/$placeId`（01）、`/info`（02）、`/listings`（03）、`/listings/{new,$listingId}`（04、`copyFrom`）、`/regions`（05）、`/events`（06）、`/checks/$reportId`（07）。サービス運営者の代理登録は `/manage/places/new` |
| RM-01〜03 | 地域運営 | 要 | `/manage/regions/$regionId`（01）、`/info`（02）、`/events`（03）。登録は `/manage/regions/new` |
| EM-01〜03 | イベント運営 | 要 | `/manage/events/$occasionId`（01）、`/info`（02）、`/regions`（03）。登録は `/manage/events/new` |
| OM-01〜07 | サービス運営 | 要 | `/ops`（01、`kind`）、`/ops/search`（02、`q`・`kind`）、`/ops/subjects/$kind/$id`（03）、`/ops/takedowns/$claimId`（04）、`/ops/reports/$reportId`（05）、`/ops/categories`（06）、`/ops/roles`（07） |
| AM-01・02 | 読みもの編集 | 要 | `/editorial`（`status`）、`/editorial/articles/{new,$articleId}` |

共通の検索パラメーター: 再提出・再申請（RQ-02〜06）は `?resubmit=<applicationId>`・`?reapply=<applicationId>`（転送境界で `ApplicationId` として検証）。不在の代行（CS-14）の戻り先は `?via=search`・`?via=report:<reportId>`（代行かどうかはサーバーが求め、URL には戻り先だけを持つ）。

## 結果

- 通知の行き先（`spec/domains/notification.md` の `NotificationDestination`）から URL への写しは presentation の1か所が持つ
