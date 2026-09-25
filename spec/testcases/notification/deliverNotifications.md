# deliverNotifications

共通の前提。断りのないケースは、この状態から始める。

- サービス運営者は O1・O2、編集担当者は E1・E2
- 店舗 P の店舗管理者は S1・S2。店舗 V は店舗管理者が不在。掲載 L は店舗 P、掲載 LV は店舗 V に紐づく
- 地域 R の地域運営者は RS1・RS2。地域 RV は地域運営者が不在
- イベント C のイベント運営者は CS1・CS2。イベント CV はイベント運営者が不在
- どのアカウントも存在し、メールアドレスを持つ

期待結果の「X に届く」は、X を `recipient` とする通知が1つ記録され、同じ `occurrenceKey` のメールが X のメールアドレスに1通送られることを指す。`direct` と `proxy` は通知とメールの `delivery`。`pointedContent` は `Occurrence.pointedContent`、`vacantTarget` は `DeliveredOccurrence.vacantTarget` の結果。

## 記録とメール

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 利用者 U が個人として行った申請 Ap が差し戻された | Ap の `application.returned` を消費する | 消費は成功する。U に `direct` で届く。通知の `occurrence` は `applicant` / `returned` で Ap を指し、`createdAt` は消費の時刻。メールは同じ `occurrence`・`delivery` と、Ap の名称（`labels`）を持つ。ドメインイベントは出ない（AC-41） | |
| 上の消費の後 | 同じ `application.returned` をもう一度消費する | 消費は成功する。U の通知は1つのままで、`id` と `createdAt` は1回目のまま。U に届くメールは1通のまま | |
| 店舗 P が運営による非公開になった。`Mailer.send` がどの宛先にも失敗する | `place.suspended` を消費する | S1・S2 の通知は記録される。メールは届かない。消費は失敗する（再配送される）。S1・S2 は通知一覧で同じ通知を確かめられる（AC-41） | |
| 上の失敗の後、`Mailer.send` が成功するようになった | 同じ `place.suspended` をもう一度消費する | 消費は成功する。S1・S2 の通知は1つずつのまま。S1・S2 にメールが1通ずつ届く | |
| `Mailer.send` が S1 への送信だけに失敗する | `place.suspended` を消費する | S1・S2 の通知は記録される。S2 にメールが届く。消費は失敗する | |
| 上の失敗の後、`Mailer.send` が成功するようになった | 同じ `place.suspended` をもう一度消費する | 消費は成功する。S1 にメールが1通届く。S2 に届くメールは1通のまま | |
| イベント C に店舗 P と店舗 Q（店舗管理者は T1）が参加中。店舗 Q の店舗管理者への通知の記録だけが成立しない | `occasion.cancelled` を消費する | 店舗 P の告知は成立し、S1・S2 に届く。T1 の通知とメールはない。消費は失敗する | |
| 上の失敗の後、記録が成立するようになった | 同じ `occasion.cancelled` をもう一度消費する | 消費は成功する。T1 に届く。S1・S2 の通知とメールは1つずつのまま | |
| 店舗 P の `place.suspended` の消費が、通知の記録の後、メールの送信の前に失敗した。再配送までに、S2 が店舗管理者を辞任し、S3 が店舗管理者に就いた | 同じ `place.suspended` をもう一度消費する | S1 と S3 にメールが届き、S3 の通知が加わる。S2 の通知は残り、S2 にメールは送られない | |
| 店舗 P が運営による非公開になった後、`place.suspended` の消費の前に、S2 が退会した（退会は、管理体制からの除去とアカウントの削除を1つの UnitOfWork で確定する） | `place.suspended` を消費する | 消費は成功する。S1 にだけ届く。S2 の通知は記録されず、メールも送られない | |
| 利用者 U が個人として行った申請 Ap が差し戻された後、`application.returned` の消費の前に、U が退会した | Ap の `application.returned` を消費する | 消費は成功する。存在しないアカウントは宛先から外れ、通知もメールもない | |
| S1 が店舗 P の店舗管理者で、編集担当者でもある。公開中の読みもの A が掲載 L を紹介している | 掲載 L の `listing.suspended` を消費する | S1 は、`contentManagers`（掲載 L の `suspended`）の通知と `editors`（`showcase_changed`）の通知を別に1つずつ受ける（メールも2通）。出来事をまたいでまとめない | |
| サービス運営者の名簿が開設前（サービス運営者がいない）。店舗 V は店舗管理者が不在 | 店舗 V の `place.suspended` を消費する | 消費は成功する。`proxy` の宛先は0人で、通知もメールもない | |
| サービス運営者の名簿が開設前 | `takedown_claim.submitted` を消費する | 消費は成功する。宛先は0人で、通知もメールもない | |

## 告知にならないドメインイベント

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 招待の承諾で S3 が店舗 P の店舗管理者に就いた | `authority.steward_appointed`（`via: "invitation"`）を消費する | 消費は成功する。通知もメールもない | |
| S2 が店舗 P の店舗管理者を辞任した。別に、退会で管理権限を失った | `authority.steward_removed`（`reason: "resigned"`）、（`reason: "withdrawn"`）をそれぞれ消費する | どちらも消費は成功する。通知もメールもない | |
| 役割を持つ人が退会した | `authority.role_revoked`（`reason: "withdrawn"`）を消費する | 消費は成功する。通知もメールもない | |
| 店舗 P が休業になった | `place.operating_status_changed`（`to` が休業）を消費する | 消費は成功する。通知もメールもない | |
| イベント運営者が、店舗 V の参加内容を変更した | `occasion.participation_changed`（`changedBy: "occasion"`）を消費する | 消費は成功する。通知もメールもない | |
| 離脱の承認で店舗 P の地域 R への所属が解除された | `region.affiliation_dissolved`（`cause: "left"`）を消費する | 消費は成功する。通知もメールもない | |

## 申請者宛て（P-91）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 利用者 U が個人として行った申請 Ap | Ap の `application.returned`、`application.approved`、`application.rejected`、`application.lapsed` をそれぞれ消費する | どれも U にだけ `direct` で届く。事柄は順に `returned`、`approved`、`rejected`、`lapsed`。`pointedContent` は `null`、`occurrence` が Ap を指す（AC-41） | |
| 利用者 U が管理者のいない店舗 V に行った掲載の申請 Ap が、店舗管理者の就任で失効した | Ap の `application.lapsed` を消費する | U に `direct` で届く（AC-66） | |
| S1 が店舗 P の店舗管理者として行った申請 Ap（`applicant` は店舗 P） | Ap の `application.returned`、`application.approved`、`application.rejected`、`application.lapsed` をそれぞれ消費する | どれも S1 と S2 の両方に `direct` で届く。申請した S1 に限らない | |
| S1 が店舗 P の店舗管理者として申請 Ap を行った後、S1 が辞任し、S3 が店舗管理者に就いた | Ap の `application.approved` を消費する | 消費の時点の店舗管理者 S2・S3 に届く。S1 には届かない | |
| 店舗管理者として行った申請 Ap の店舗で、最後の店舗管理者が権限を手放し、Ap が失効した。店舗は店舗管理者が不在 | Ap の `application.lapsed` を消費する | O1・O2 に `proxy`（`vacantTarget` はその店舗）で届く。`occurrence` は Ap を指す。権限を手放した本人には届かない（AC-66） | |
| サービス運営者の代行で承認された申請 Ap（申請者は利用者 U） | Ap の `application.approved` を消費する | U に `direct` で届く | |

## 承認者宛て（P-92）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 承認者の席が `operator` の申請 Ap（店舗の登録申請） | Ap の `application.submitted`、`application.resubmitted`、`application.withdrawn` をそれぞれ消費する | どれも O1・O2 に `direct` で届く。事柄は順に `submitted`、`resubmitted`、`withdrawn`。`occurrence` が Ap を指す（AC-41） | |
| 登録申請 Ap1 に管理権限の申請 Ap2 を併せて提出した。店舗はまだない | Ap1 と Ap2 の `application.submitted` をそれぞれ消費する | O1・O2 は、Ap1 の通知と Ap2 の通知を別に1つずつ受ける。どちらのメールの `labels` も、申請の対象の名称として Ap1 の内容の店名を持つ | |
| 利用者 U が、管理者のいない店舗 V に掲載の申請 Ap を提出した。掲載はまだない | Ap の `application.submitted` を消費する | O1・O2 に `direct` で届く。メールの `labels` は、申請の種類と、対象ごとの名称として Ap の内容の掲載の名称と店舗 V の名称を持つ | |
| 承認者の席が地域 R の `steward` の所属申請 Ap | Ap の `application.submitted`、`application.resubmitted`、`application.withdrawn` をそれぞれ消費する | どれも RS1・RS2 に `direct` で届く。サービス運営者には届かない | |
| 承認者の席がイベント C の `steward` の参加申請 Ap | Ap の `application.submitted` を消費する | CS1・CS2 に `direct` で届く | |
| 承認者の席が、地域運営者が不在の地域 RV の `steward` の所属申請 Ap | Ap の `application.submitted`、`application.resubmitted`、`application.withdrawn` をそれぞれ消費する | どれも O1・O2 に `proxy`（`vacantTarget` は地域 RV）で届く。`occurrence` が Ap を指す | |
| 承認者の席が、イベント運営者が不在のイベント CV の `steward` の参加申請 Ap | Ap の `application.submitted` を消費する | O1・O2 に `proxy`（`vacantTarget` はイベント CV）で届く | |
| O1 が自分で店舗の登録申請 Ap を提出した | Ap の `application.submitted` を消費する | O1・O2 の両方に届く。申請した O1 を宛先から除かない | |
| 利用者 U の退会で、U が個人として行った地域 R への申請 Ap が取り下げになった。U のアカウントはない | Ap の `application.withdrawn` を消費する | RS1・RS2 に `direct` で届く | |

## 店舗管理者宛て（P-93）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P が地域 R から除外された | `region.affiliation_dissolved`（`cause: "excluded"`）を消費する | S1・S2 に `direct` で届く。店舗 P の事柄 `excluded_from_region`（地域 R）。`pointedContent` は店舗 P（AC-41） | |
| 店舗 P がイベント C から除外された | `occasion.participation_dissolved`（`cause: "excluded"`）を消費する | S1・S2 に `direct` で届く。店舗 P の事柄 `excluded_from_occasion`（イベント C）。イベント運営者には届かない | |
| イベント C に店舗 P と店舗 Q（店舗管理者は T1）が参加中。イベント C を紹介する公開中の読みものはない | `occasion.cancelled` を消費する | 店舗ごとに1つの出来事になり、S1・S2 に店舗 P の、T1 に店舗 Q の `occasion_cancelled`（イベント C）が `direct` で届く。`pointedContent` はそれぞれの店舗。参加していない店舗の店舗管理者には届かない（AC-69） | |
| イベント C に店舗 P と、店舗管理者が不在の店舗 V が参加中 | `occasion.period_changed` を消費する | S1・S2 に店舗 P の `occasion_period_changed` が `direct` で、O1・O2 に店舗 V の同じ事柄が `proxy`（`vacantTarget` は店舗 V）で届く | |
| イベント C に参加中の店舗がない。紹介する公開中の読みものもない | `occasion.cancelled` を消費する | 消費は成功する。通知もメールもない | |
| 店舗 P を対象とする連絡 Rp について、確認が依頼された | `info_report.confirmation_requested` を消費する | S1・S2 に `direct` で届く。店舗 P の事柄 `confirmation_requested`（Rp）。`pointedContent` は店舗 P（AC-41） | |
| 掲載 L を対象とする連絡 Rp について、確認が依頼された | `info_report.confirmation_requested` を消費する | S1・S2 に `direct` で届く。掲載 L の事柄 `confirmation_requested`（Rp）。`pointedContent` は掲載 L | |
| カテゴリー K が廃止された。店舗 P の掲載 L と掲載 M が、K を `CategoryId` として保存している | `category.retired`（`categoryId` は K）を消費する | S1・S2 の通知は、店舗 P とカテゴリー K の組の `categories_reassigned`（`retiredCategoryId` は K）が1つずつ。メールも1通ずつ。事柄は移行先を持たない（AC-72） | |
| カテゴリー K が廃止された。店舗 P の掲載 L と、店舗管理者が不在の店舗 V の掲載 LV が、K を保存している | `category.retired`（`categoryId` は K）を消費する | S1・S2 に店舗 P の `categories_reassigned` が `direct` で、O1・O2 に店舗 V の同じ事柄が `proxy`（`vacantTarget` は店舗 V）で届く（AC-72） | |
| カテゴリー J が、移行先を K として先に廃止されている。店舗 P の掲載 L は J を、店舗 Q の `draft` の掲載 N は K を保存している。K が廃止された | `category.retired`（`categoryId` は K）を消費する | 店舗 P と店舗 Q の店舗管理者に、`retiredCategoryId` が K の `categories_reassigned` が1つずつ届く（`CategoryCatalog.predecessorsOf` の集合で、公開状態を問わずに掲載を読む） | |
| カテゴリー K が廃止された。K と、K に行き着くカテゴリーを保存している掲載が1件もない | `category.retired` を消費する | 通知もメールもなく、消費は成功する | |
| カテゴリー K が廃止された。店舗 P の掲載 L と掲載 M が、K を保存している | 同じ `category.retired` を2回消費する | S1・S2 の通知は1つずつのまま。メールは送り直さない | |
| 管理権限の申請の承認で、S3 が店舗 P の店舗管理者に加わった。消費の時点の店舗管理者は S1・S2・S3 | `authority.steward_appointed`（`via: "application"`）を消費する | S1・S2 に `direct` で届く。事柄は `steward_added`（`appointee` は S3）。S3 には届かない（AC-41） | |
| 管理権限の申請の承認で、S3 が店舗管理者のいなかった店舗 V の店舗管理者に就いた。消費の時点の店舗管理者は S3 だけ | `authority.steward_appointed`（`via: "application"`）を消費する | 消費は成功する。宛先は0人で、通知もメールもない。サービス運営者にも届かない | |
| 店舗管理者が不在の店舗 V と、その掲載 LV | 店舗 V の `region.affiliation_dissolved`（`excluded`）、`occasion.participation_dissolved`（`excluded`）、`place.suspended`、`place.unsuspended`、`content.photos_taken_down`（`owner` は店舗 V）、`info_report.confirmation_requested`、掲載 LV の `listing.suspended`、`listing.unsuspended`、`content.photos_taken_down`（`owner` は掲載 LV）をそれぞれ消費する | どの出来事も、O1・O2 に `proxy`（`vacantTarget` は店舗 V）で届く。`pointedContent` は、掲載についての出来事は掲載 LV、ほかは店舗 V | |

## 地域運営者宛て（P-94）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| イベント C が地域 R を開催地域として関連づけた | `occasion.region_linked` を消費する | RS1・RS2 に `direct` で届く。事柄は `occasion_linked`（イベント C）。`pointedContent` は地域 R。イベント運営者には届かない（AC-41） | |
| 地域運営者が不在の地域 RV | 地域 RV の `occasion.region_linked`、`region.suspended`、`region.unsuspended`、`content.photos_taken_down`（`owner` は地域 RV）をそれぞれ消費する | どの出来事も、O1・O2 に `proxy`（`vacantTarget` は地域 RV）で届く。`pointedContent` は地域 RV | |

## イベント運営者宛て（P-95）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P がイベント C への参加を取りやめた | `occasion.participation_dissolved`（`cause: "withdrawn"`）を消費する | CS1・CS2 に `direct` で届く。事柄は `participation_withdrawn`（店舗 P）。`pointedContent` はイベント C。店舗管理者には届かない（AC-41） | |
| 店舗管理者が、イベント C への参加に添えた掲載と参加日を変更した | `occasion.participation_changed`（`changedBy: "place"`）を消費する | CS1・CS2 に `direct` で届く。事柄は `participation_changed`（店舗 P）（AC-41） | |
| 地域 R の地域運営者が、イベント C の関連づけを解除した | `occasion.region_link_detached` を消費する | CS1・CS2 に `direct` で届く。事柄は `region_link_detached`（地域 R）。地域運営者には届かない（AC-41） | |
| イベント運営者が不在のイベント CV | イベント CV の `occasion.participation_dissolved`（`withdrawn`）、`occasion.participation_changed`（`place`）、`occasion.region_link_detached`、`occasion.suspended`、`occasion.unsuspended`、`content.photos_taken_down`（`owner` はイベント CV）をそれぞれ消費する | どの出来事も、O1・O2 に `proxy`（`vacantTarget` はイベント CV）で届く。`pointedContent` はイベント CV | |

## 対象を管理する人宛て（P-93〜P-96 の、運営による非公開とその解除、申立てによる写真の削除）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 店舗 P が運営による非公開になり、その後に解除された。店舗 P とその掲載を紹介する公開中の読みものはない | `place.suspended`、`place.unsuspended` をそれぞれ消費する | S1・S2 に `direct` で届く。出来事は `contentManagers` で、`content` は店舗 P、事柄は `suspended`、`unsuspended`。`pointedContent` は店舗 P（AC-41） | |
| 掲載 L が運営による非公開になり、その後に解除された。掲載 L を紹介する公開中の読みものはない | `listing.suspended`、`listing.unsuspended` をそれぞれ消費する | 掲載 L の店舗 P の S1・S2 に `direct` で届く。`content` は掲載 L、`placeId` は店舗 P、事柄は `suspended`、`unsuspended`。`pointedContent` は掲載 L | |
| 地域 R が運営による非公開になり、その後に解除された。地域 R を紹介する公開中の読みものはない | `region.suspended`、`region.unsuspended` をそれぞれ消費する | RS1・RS2 に `direct` で届く。`content` は地域 R、事柄は `suspended`、`unsuspended` | |
| イベント C が運営による非公開になり、その後に解除された。イベント C を紹介する公開中の読みものはない | `occasion.suspended`、`occasion.unsuspended` をそれぞれ消費する | CS1・CS2 に `direct` で届く。`content` はイベント C、事柄は `suspended`、`unsuspended` | |
| 申立てに基づいて、店舗 P の写真が削除された | `content.photos_taken_down`（`owner` は店舗 P、`unpublished: false`）を消費する | S1・S2 に `direct` で届く。`content` は店舗 P、事柄は `photos_taken_down`。`pointedContent` は店舗 P（AC-79） | |
| 申立てに基づいて、掲載 L の最後の写真が削除され、掲載 L が一時非公開になった | `content.photos_taken_down`（`owner` は掲載 L、`unpublished: true`）を消費する | S1・S2 に `direct` で届く。`content` は掲載 L、`placeId` は店舗 P、事柄は `photos_taken_down`。`pointedContent` は掲載 L。事柄は、公開が取り下げられたかどうかを持たない（AC-79） | |
| 申立てに基づいて、地域 R、イベント C の写真が削除された | `content.photos_taken_down`（`owner` は地域 R）、（`owner` はイベント C）をそれぞれ消費する | 地域 R は RS1・RS2 に、イベント C は CS1・CS2 に `direct` で届く。事柄は `photos_taken_down`（AC-79） | |
| 申立てに基づいて、読みもの A の写真が削除された | `content.photos_taken_down`（`owner` は読みもの A）を消費する | E1・E2 に `direct` で届く。`content` は読みもの A、事柄は `photos_taken_down`。`pointedContent` は読みもの A（AC-79） | |

## 編集担当者宛て（P-96）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 公開中の読みもの A が掲載 L を紹介している | 掲載 L の `listing.suspended`、`listing.unpublished`、`listing.deleted` をそれぞれ消費する | どれも E1・E2 に `direct` で届く。事柄は `showcase_changed` で、紹介先は掲載 L、変化は順に `suspended`、`unpublished`、`deleted`。`pointedContent` は読みもの A。`listing.suspended` は、S1・S2 への `contentManagers` の `suspended` の通知とは別の出来事になる（AC-41） | |
| 公開中の読みもの A が掲載 L を紹介している。掲載 L が期日で提供終了になった | 掲載 L の `listing.offering_ended` を消費する | E1・E2 に `direct` で届く。事柄は `showcase_changed` で、紹介先は掲載 L、変化は `offering_ended`。店舗管理者には届かない（AC-41） | |
| 公開中の読みもの A が掲載 L を紹介している。店舗管理者が掲載 L を提供終了にした | 掲載 L の `listing.offering_ended` を消費する | E1・E2 に `direct` で届く。変化は `offering_ended` | |
| 公開中の読みもの A が掲載 L を紹介している。掲載 L の提供終了を、2つのジョブが同じ `observedOn` で重ねて確かめた | 掲載 L の2つの `listing.offering_ended`（ドメインイベントの ID は別、`observedOn` は同じ）をそれぞれ消費する | E1・E2 の通知は、紹介先の掲載 L の `offering_ended` が1つずつ。メールも1通ずつ | |
| 公開中の読みもの A が掲載 L を紹介している。掲載 L が提供終了になり、提供中に戻った後、別の日に再び提供終了になった | `observedOn` の違う2つの `listing.offering_ended` をそれぞれ消費する | E1・E2 は、`offering_ended` の通知を2つずつ受ける。メールも2通ずつ | |
| 公開中の読みもの A が店舗 P と掲載 L を紹介し、公開中の読みもの B が掲載 M（店舗 P）を紹介している | 店舗 P の `place.suspended` を消費する | E1・E2 は、読みものと紹介先の組ごとに1つ、3つの通知を受ける（A と店舗 P の `suspended`、A と掲載 L の `place_suspended`、B と掲載 M の `place_suspended`）。S1・S2 には `contentManagers` の `suspended` が別に届く | |
| 公開中の読みもの A が店舗 P と掲載 L を紹介している。店舗 P が閉店になった | `place.operating_status_changed`（`to` が閉店）を消費する | E1・E2 は、A と店舗 P の `closed`、A と掲載 L の `place_closed` の2つの通知を受ける。店舗管理者には届かない | |
| 公開中の読みもの A が地域 R を紹介している | 地域 R の `region.suspended`、`region.unpublished` をそれぞれ消費する | どれも E1・E2 に `direct` で届く。変化は `suspended`、`unpublished`。`region.suspended` は、RS1・RS2 にも別の出来事として届く | |
| 公開中の読みもの A がイベント C を紹介している。イベント C に参加中の店舗はない | イベント C の `occasion.suspended`、`occasion.unpublished`、`occasion.cancelled`、`occasion.ended` をそれぞれ消費する | どれも E1・E2 に `direct` で届く。変化は順に `suspended`、`unpublished`、`cancelled`、`ended`（AC-41） | |
| 公開中の読みもの A がイベント C を紹介している。イベント C の終了を、2つのジョブが同じ `observedOn` で重ねて確かめた | 2つの `occasion.ended` をそれぞれ消費する | E1・E2 の通知は1つずつ。メールも1通ずつ | |
| 公開中の読みもの A が掲載 L を紹介している。申立てに基づいて掲載 L の最後の写真が削除され、掲載 L が一時非公開になった | `content.photos_taken_down`（`owner` は掲載 L、`unpublished: true`）と、`listing.unpublished`（`reason: "photoTakedown"`）をそれぞれ消費する | 前者は S1・S2 にだけ `contentManagers`（掲載 L の `photos_taken_down`）で届き、編集担当者には届かない。後者は E1・E2 に `showcase_changed`（掲載 L の `unpublished`）で届く | |
| 掲載 L を紹介する読みものが、下書きの読みものと、公開を取り下げた読みものだけ | 掲載 L の `listing.deleted` を消費する | 消費は成功する。編集担当者への通知もメールもない | |
| 公開中の読みもの A が掲載 L を紹介している | 掲載 L の `listing.unsuspended` を消費する | 編集担当者には届かない。S1・S2 にだけ届く | |
| 編集担当者が0人。公開中の読みもの A が掲載 L を紹介している | 掲載 L の `listing.suspended` を消費する | 消費は成功する。編集担当者宛ての通知は誰にも届かず、サービス運営者にも届かない。S1・S2 への `contentManagers` の `suspended` は届く | |

## サービス運営者宛て（P-97）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 地域 R への申請 Ap が、確認中のまま一定の期間を過ぎた | Ap の `application.review_period_elapsed` を消費する | O1・O2 に `direct` で届く。事柄は `application_review_period_elapsed`（Ap）。地域運営者には届かない | |
| 同じ申請 Ap の期間の超過を、2つのジョブが同じ `pendingSince` で重ねて確かめた | 2つの `application.review_period_elapsed` をそれぞれ消費する | O1・O2 の通知は1つずつ。メールも1通ずつ | |
| 取り下げの申立て Cl が受け付けられた | `takedown_claim.submitted` を消費する | O1・O2 に `direct` で届く。事柄は `takedown_claim_received`（Cl）。`pointedContent` は `null`。対象の管理者には届かない | |
| 情報の誤り・閉店の連絡 Rp が受け付けられた | `info_report.submitted` を消費する | O1・O2 に `direct` で届く。事柄は `info_report_received`（Rp）。店舗管理者には届かない | |

## 招待された利用者宛て（P-98）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| S1 が、アカウントを持つ利用者 U のメールアドレスを、店舗 P の管理メンバーに招待した | `authority.invitation_issued` を消費する | U に `direct` で届く。`occurrence` は `invitee` で、メールアドレス、店舗 P、招待を持つ。`pointedContent` は店舗 P。メールは招待のメールアドレスに送られる。メールの行き先は、店舗 P と招待の組の `invitation`（AC-41） | |
| S1 が、アカウントのないメールアドレスを招待した | `authority.invitation_issued` を消費する | 消費は成功する。サービス内の通知は記録されない。そのメールアドレスに、`direct` のメールが1通送られる | |
| 上の消費の後 | 同じ `authority.invitation_issued` をもう一度消費する | 消費は成功する。そのメールアドレスに届くメールは1通のまま | |

## 権限を付与された利用者宛て（P-99）と本人宛て（P-100）

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| サービス運営者が、利用者 U に地域 R の管理権限を付与した | `authority.steward_appointed`（`via: "grant"`）を消費する | U にだけ `direct` で届く。`occurrence` は `grantee` / `stewardship`（地域 R）。`pointedContent` は地域 R。既存の地域運営者には届かない（AC-41） | |
| サービス運営者が、利用者 U を編集担当者に任命した。別に、利用者 W にサービス運営者の役割を付与した | それぞれの `authority.role_granted` を消費する | U に `grantee` / `role`（`editor`）、W に `grantee` / `role`（`operator`）が `direct` で届く。`pointedContent` は `null`。ほかの役割の持ち主には届かない | |
| O1 が自分自身を編集担当者に任命した | `authority.role_granted` を消費する | O1 に届く。付与した本人を宛先から除かない | |
| サービス運営者が、S2 の店舗 P の管理権限を解除した | `authority.steward_removed`（`reason: "revoked"`）を消費する | S2 にだけ `direct` で届く。`occurrence` は `self` / `stewardship`（店舗 P）。`pointedContent` は店舗 P。S1 には届かない（AC-41） | |
| サービス運営者が、店舗 P の最後の店舗管理者 S1 の管理権限を解除し、店舗 P が店舗管理者不在になった | `authority.steward_removed`（`reason: "revoked"`）を消費する | S1 にだけ `direct` で届く。サービス運営者には届かない | |
| サービス運営者が、E2 の編集担当者の任命を解除した。別に、O2 のサービス運営者の役割を解除した | それぞれの `authority.role_revoked`（`reason: "revoked"`）を消費する | E2 に `self` / `role`（`editor`）、O2 に `self` / `role`（`operator`）が `direct` で届く。`pointedContent` は `null` | |
