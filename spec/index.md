# Lunt spec

Lunt の設計ドキュメントのインデックス。上流から順に、シナリオ、画面、ドメイン、ユースケース、動的フロー、テストケースを持つ。派生物として、人が画面を操作して確かめるマニュアルテストを持つ。

## 出典

- [初期アイデア](idea.md)
- [要件定義書](requirements.md)
- [付属資料：デザイン・画面構成・プロトタイプ](design-appendix.md)
- [要求台帳](ledger.md) — 各層が辿り先として引く要求の番号（P・D・T・X・I と、要件定義書の ID）の定義

## シナリオ

利用者の視点の操作とフロー。

- [シナリオ一覧](scenario/index.md)
- [発見](scenario/discover.md)
- [探索と詳細](scenario/explore.md)
- [保存](scenario/keep.md)
- [アカウントと通知](scenario/account.md)
- [申請の共通の進み方](scenario/application.md)
- [管理権限](scenario/membership.md)
- [店舗](scenario/shop.md)
- [掲載](scenario/listing.md)
- [地域](scenario/region.md)
- [イベント](scenario/event.md)
- [申立て・連絡・非公開](scenario/moderation.md)
- [サービス運営](scenario/operation.md)
- [読みもの編集](scenario/editorial.md)

## 画面

画面の一覧と共通の規則、画面群ごとの機能と状態。

- [画面一覧](pages/index.md)
- [発見と探索（VW）](pages/browse.md)
- [詳細（DT）](pages/detail.md)
- [アカウントと自分の申請（MY）](pages/account.md)
- [申請・申立て・連絡（RQ）](pages/request.md)
- [共通の管理（CM）](pages/shared.md)
- [店舗管理（SM）](pages/shop.md)
- [地域運営（RM）](pages/region.md)
- [イベント運営（EM）](pages/event.md)
- [サービス運営（OM）](pages/operation.md)
- [読みもの編集（AM）](pages/editorial.md)

## デザイン

画面のデザイン。Figma から取り込み、以後は `spec/design/` を正本とする。

- [デザイン方針と取り込み元](design/index.md)
- [デザイントークン](design/tokens.md)
- 画面ごとのデザイン: `design/pages/{画面 ID}_{画面名}.html`（56 画面。状態は各 HTML の中で切り替える）
- 画像・アイコン: `design/assets/`

## ドメイン

ドメインの境界と依存方向、共有カーネル、ドメインごとのモデルとポートの契約。

- [ドメイン一覧](domains/index.md)
- [Area](domains/area.md)
- [Media](domains/media.md)
- [Account](domains/account.md)
- [Authority](domains/authority.md)
- [Place](domains/place.md)
- [Listing](domains/listing.md)
- [Region](domains/region.md)
- [Occasion](domains/occasion.md)
- [Article](domains/article.md)
- [Application](domains/application.md)
- [Moderation](domains/moderation.md)
- [Bookmark](domains/bookmark.md)
- [Discovery](domains/discovery.md)
- [Notification](domains/notification.md)

## ユースケース

ドメインごとのユースケース。

- [Area のユースケース](usecases/area.md)
- [Media のユースケース](usecases/media.md)
- [Account のユースケース](usecases/account.md)
- [Authority のユースケース](usecases/authority.md)
- [Place のユースケース](usecases/place.md)
- [Listing のユースケース](usecases/listing.md)
- [Region のユースケース](usecases/region.md)
- [Occasion のユースケース](usecases/occasion.md)
- [Article のユースケース](usecases/article.md)
- [Application のユースケース](usecases/application.md)
- [Moderation のユースケース](usecases/moderation.md)
- [Bookmark のユースケース](usecases/bookmark.md)
- [Discovery のユースケース](usecases/discovery.md)
- [Notification のユースケース](usecases/notification.md)

## 動的フロー

複数のユースケース・時間をまたぐフローの台帳。

- [動的フロー台帳](flows/index.md)

## テストケース

ユースケーステストは `testcases/${domain}/${usecase}.md`、ポート適合テストは `testcases/ports/${port}.md`。

| ドメイン | ユースケーステスト |
| --- | --- |
| area | [browseAreaHierarchy](testcases/area/browseAreaHierarchy.md)、[findTownsByPostalCode](testcases/area/findTownsByPostalCode.md)、[labelAreaSelections](testcases/area/labelAreaSelections.md) |
| media | [discardReleasedPhotos](testcases/media/discardReleasedPhotos.md)、[duplicatePhotos](testcases/media/duplicatePhotos.md)、[registerPhoto](testcases/media/registerPhoto.md)、[sweepUnownedPhotos](testcases/media/sweepUnownedPhotos.md) |
| account | [completeLoginByCode](testcases/account/completeLoginByCode.md)、[completeLoginByLink](testcases/account/completeLoginByLink.md)、[getMyAccount](testcases/account/getMyAccount.md)、[loginWithExternalAccount](testcases/account/loginWithExternalAccount.md)、[previewWithdrawal](testcases/account/previewWithdrawal.md)、[purgeClosedLoginChallenges](testcases/account/purgeClosedLoginChallenges.md)、[startEmailLogin](testcases/account/startEmailLogin.md)、[withdraw](testcases/account/withdraw.md) |
| authority | [acceptInvitation](testcases/authority/acceptInvitation.md)、[cancelInvitation](testcases/authority/cancelInvitation.md)、[checkInvitation](testcases/authority/checkInvitation.md)、[establishFirstOperator](testcases/authority/establishFirstOperator.md)、[getMyAuthority](testcases/authority/getMyAuthority.md)、[grantRole](testcases/authority/grantRole.md)、[grantStewardship](testcases/authority/grantStewardship.md)、[inviteMember](testcases/authority/inviteMember.md)、[listRoleHolders](testcases/authority/listRoleHolders.md)、[resignStewardship](testcases/authority/resignStewardship.md)、[revokeRole](testcases/authority/revokeRole.md)、[revokeSteward](testcases/authority/revokeSteward.md)、[viewMembers](testcases/authority/viewMembers.md) |
| place | [changeOperatingStatus](testcases/place/changeOperatingStatus.md)、[getManagedPlace](testcases/place/getManagedPlace.md)、[listStewardedPlaces](testcases/place/listStewardedPlaces.md)、[matchPlaces](testcases/place/matchPlaces.md)、[matchPlacesForOperation](testcases/place/matchPlacesForOperation.md)、[registerPlaceByProxy](testcases/place/registerPlaceByProxy.md)、[suspendPlace](testcases/place/suspendPlace.md)、[unsuspendPlace](testcases/place/unsuspendPlace.md)、[updatePlaceProfile](testcases/place/updatePlaceProfile.md) |
| listing | [addCategory](testcases/listing/addCategory.md)、[createListingDraft](testcases/listing/createListingDraft.md)、[deleteListing](testcases/listing/deleteListing.md)、[detectEndedOfferings](testcases/listing/detectEndedOfferings.md)、[duplicateListing](testcases/listing/duplicateListing.md)、[endListingOffering](testcases/listing/endListingOffering.md)、[getManagedListing](testcases/listing/getManagedListing.md)、[listCategories](testcases/listing/listCategories.md)、[listPlaceListings](testcases/listing/listPlaceListings.md)、[previewListing](testcases/listing/previewListing.md)、[provisionInitialCategories](testcases/listing/provisionInitialCategories.md)、[publishListing](testcases/listing/publishListing.md)、[renameCategory](testcases/listing/renameCategory.md)、[resumeListingOffering](testcases/listing/resumeListingOffering.md)、[retireCategory](testcases/listing/retireCategory.md)、[searchListingsForOperation](testcases/listing/searchListingsForOperation.md)、[suspendListing](testcases/listing/suspendListing.md)、[unpublishListing](testcases/listing/unpublishListing.md)、[unsuspendListing](testcases/listing/unsuspendListing.md)、[updateListing](testcases/listing/updateListing.md) |
| region | [chooseRepresentativeRegion](testcases/region/chooseRepresentativeRegion.md)、[excludeAffiliatedPlace](testcases/region/excludeAffiliatedPlace.md)、[getManagedRegion](testcases/region/getManagedRegion.md)、[getPlaceAffiliationStatus](testcases/region/getPlaceAffiliationStatus.md)、[listAffiliatedPlaces](testcases/region/listAffiliatedPlaces.md)、[publishRegion](testcases/region/publishRegion.md)、[registerRegion](testcases/region/registerRegion.md)、[searchRegionsForOperation](testcases/region/searchRegionsForOperation.md)、[suspendRegion](testcases/region/suspendRegion.md)、[unpublishRegion](testcases/region/unpublishRegion.md)、[unsuspendRegion](testcases/region/unsuspendRegion.md)、[updateRegionContent](testcases/region/updateRegionContent.md) |
| occasion | [addParticipationDirectly](testcases/occasion/addParticipationDirectly.md)、[cancelOccasion](testcases/occasion/cancelOccasion.md)、[changeParticipationByOccasion](testcases/occasion/changeParticipationByOccasion.md)、[changeParticipationByPlace](testcases/occasion/changeParticipationByPlace.md)、[detachRegionLink](testcases/occasion/detachRegionLink.md)、[excludeParticipant](testcases/occasion/excludeParticipant.md)、[getManagedOccasion](testcases/occasion/getManagedOccasion.md)、[getParticipationDetails](testcases/occasion/getParticipationDetails.md)、[getPlaceParticipations](testcases/occasion/getPlaceParticipations.md)、[linkRegion](testcases/occasion/linkRegion.md)、[listAttachableListings](testcases/occasion/listAttachableListings.md)、[listOccasionParticipants](testcases/occasion/listOccasionParticipants.md)、[listOccasionRegionLinks](testcases/occasion/listOccasionRegionLinks.md)、[listRegionOccasionLinks](testcases/occasion/listRegionOccasionLinks.md)、[publishOccasion](testcases/occasion/publishOccasion.md)、[recordEndedOccasions](testcases/occasion/recordEndedOccasions.md)、[registerOccasion](testcases/occasion/registerOccasion.md)、[restoreRegionLink](testcases/occasion/restoreRegionLink.md)、[revokeOccasionCancellation](testcases/occasion/revokeOccasionCancellation.md)、[searchOccasionsForOperation](testcases/occasion/searchOccasionsForOperation.md)、[suspendOccasion](testcases/occasion/suspendOccasion.md)、[unlinkRegion](testcases/occasion/unlinkRegion.md)、[unpublishOccasion](testcases/occasion/unpublishOccasion.md)、[unsuspendOccasion](testcases/occasion/unsuspendOccasion.md)、[updateOccasionContent](testcases/occasion/updateOccasionContent.md)、[withdrawParticipation](testcases/occasion/withdrawParticipation.md) |
| article | [createArticle](testcases/article/createArticle.md)、[getArticleForEditing](testcases/article/getArticleForEditing.md)、[listArticlesForEditing](testcases/article/listArticlesForEditing.md)、[previewArticle](testcases/article/previewArticle.md)、[publishArticle](testcases/article/publishArticle.md)、[reviseArticle](testcases/article/reviseArticle.md)、[unpublishArticle](testcases/article/unpublishArticle.md) |
| application | [approveAffiliation](testcases/application/approveAffiliation.md)、[approveLeave](testcases/application/approveLeave.md)、[approveListingRevision](testcases/application/approveListingRevision.md)、[approveNewListing](testcases/application/approveNewListing.md)、[approveParticipation](testcases/application/approveParticipation.md)、[approvePlaceRegistration](testcases/application/approvePlaceRegistration.md)、[approvePlaceRevision](testcases/application/approvePlaceRevision.md)、[approveStewardshipClaim](testcases/application/approveStewardshipClaim.md)、[checkSubmissionEligibility](testcases/application/checkSubmissionEligibility.md)、[getApplicationForReview](testcases/application/getApplicationForReview.md)、[getMyApplication](testcases/application/getMyApplication.md)、[listApplicationsAwaitingReview](testcases/application/listApplicationsAwaitingReview.md)、[listApplicationsForSubject](testcases/application/listApplicationsForSubject.md)、[listMyActiveApplicationsAboutPlace](testcases/application/listMyActiveApplicationsAboutPlace.md)、[listMyApplications](testcases/application/listMyApplications.md)、[notifyOverdueReviews](testcases/application/notifyOverdueReviews.md)、[prepareReapplication](testcases/application/prepareReapplication.md)、[previewListingSubmission](testcases/application/previewListingSubmission.md)、[reassessApplicationPremises](testcases/application/reassessApplicationPremises.md)、[rejectApplication](testcases/application/rejectApplication.md)、[resubmitApplication](testcases/application/resubmitApplication.md)、[sendBackApplication](testcases/application/sendBackApplication.md)、[submitAffiliationChange](testcases/application/submitAffiliationChange.md)、[submitListingRevision](testcases/application/submitListingRevision.md)、[submitNewListing](testcases/application/submitNewListing.md)、[submitParticipation](testcases/application/submitParticipation.md)、[submitPlaceRegistration](testcases/application/submitPlaceRegistration.md)、[submitPlaceRevision](testcases/application/submitPlaceRevision.md)、[submitStewardshipClaim](testcases/application/submitStewardshipClaim.md)、[withdrawApplication](testcases/application/withdrawApplication.md)、[withdrawApplicationsOfWithdrawnAccount](testcases/application/withdrawApplicationsOfWithdrawnAccount.md) |
| moderation | [getConfirmationRequest](testcases/moderation/getConfirmationRequest.md)、[getInfoReport](testcases/moderation/getInfoReport.md)、[getTakedownClaim](testcases/moderation/getTakedownClaim.md)、[listConfirmationRequestsForPlace](testcases/moderation/listConfirmationRequestsForPlace.md)、[listOpenTakedownClaims](testcases/moderation/listOpenTakedownClaims.md)、[listUnresolvedInfoReports](testcases/moderation/listUnresolvedInfoReports.md)、[requestInfoReportConfirmation](testcases/moderation/requestInfoReportConfirmation.md)、[resolveInfoReport](testcases/moderation/resolveInfoReport.md)、[resolveTakedownClaim](testcases/moderation/resolveTakedownClaim.md)、[submitInfoReport](testcases/moderation/submitInfoReport.md)、[submitTakedownClaim](testcases/moderation/submitTakedownClaim.md)、[takeDownPhotosByClaim](testcases/moderation/takeDownPhotosByClaim.md) |
| bookmark | [getSavedTargets](testcases/bookmark/getSavedTargets.md)、[listBookmarks](testcases/bookmark/listBookmarks.md)、[mergeDeviceBookmarks](testcases/bookmark/mergeDeviceBookmarks.md)、[purgeBookmarksOnWithdrawal](testcases/bookmark/purgeBookmarksOnWithdrawal.md)、[removeBookmark](testcases/bookmark/removeBookmark.md)、[saveBookmark](testcases/bookmark/saveBookmark.md) |
| discovery | [findMapExtent](testcases/discovery/findMapExtent.md)、[findRegions](testcases/discovery/findRegions.md)、[findSelectionCandidates](testcases/discovery/findSelectionCandidates.md)、[listArticles](testcases/discovery/listArticles.md)、[listArticlesShowcasing](testcases/discovery/listArticlesShowcasing.md)、[listListingsOfPlace](testcases/discovery/listListingsOfPlace.md)、[listListingsOfRegion](testcases/discovery/listListingsOfRegion.md)、[listMapTargets](testcases/discovery/listMapTargets.md)、[listOccasions](testcases/discovery/listOccasions.md)、[listPlacesOfRegion](testcases/discovery/listPlacesOfRegion.md)、[locateParticipants](testcases/discovery/locateParticipants.md)、[readArticle](testcases/discovery/readArticle.md)、[readFeed](testcases/discovery/readFeed.md)、[readMapCells](testcases/discovery/readMapCells.md)、[resolveReferences](testcases/discovery/resolveReferences.md)、[searchByKeyword](testcases/discovery/searchByKeyword.md)、[viewListing](testcases/discovery/viewListing.md)、[viewOccasion](testcases/discovery/viewOccasion.md)、[viewPlace](testcases/discovery/viewPlace.md)、[viewRegion](testcases/discovery/viewRegion.md) |
| notification | [deliverNotifications](testcases/notification/deliverNotifications.md)、[listNotifications](testcases/notification/listNotifications.md)、[purgeNotificationsOnWithdrawal](testcases/notification/purgeNotificationsOnWithdrawal.md)、[sendTakedownOutcome](testcases/notification/sendTakedownOutcome.md) |

ポート適合テスト: [accountRepository](testcases/ports/accountRepository.md)、[applicationRepository](testcases/ports/applicationRepository.md)、[applicationReviewDesk](testcases/ports/applicationReviewDesk.md)、[areaCatalog](testcases/ports/areaCatalog.md)、[articleRepository](testcases/ports/articleRepository.md)、[bookmarkRepository](testcases/ports/bookmarkRepository.md)、[categoryCatalogRepository](testcases/ports/categoryCatalogRepository.md)、[contentDirectory](testcases/ports/contentDirectory.md)、[detailQueries](testcases/ports/detailQueries.md)、[explorationQueries](testcases/ports/explorationQueries.md)、[externalIdentityVerifier](testcases/ports/externalIdentityVerifier.md)、[feedCandidateQueries](testcases/ports/feedCandidateQueries.md)、[holdingStatusLedger](testcases/ports/holdingStatusLedger.md)、[infoReportRepository](testcases/ports/infoReportRepository.md)、[keywordSearchQueries](testcases/ports/keywordSearchQueries.md)、[listingRepository](testcases/ports/listingRepository.md)、[loginChallengeRepository](testcases/ports/loginChallengeRepository.md)、[loginMailSender](testcases/ports/loginMailSender.md)、[loginSecretGenerator](testcases/ports/loginSecretGenerator.md)、[mailDispatchLedger](testcases/ports/mailDispatchLedger.md)、[mailer](testcases/ports/mailer.md)、[notificationMailRenderer](testcases/ports/notificationMailRenderer.md)、[notificationRepository](testcases/ports/notificationRepository.md)、[occasionRepository](testcases/ports/occasionRepository.md)、[offeringPhaseLedger](testcases/ports/offeringPhaseLedger.md)、[overdueNoticeLedger](testcases/ports/overdueNoticeLedger.md)、[participationRepository](testcases/ports/participationRepository.md)、[photoAssetRepository](testcases/ports/photoAssetRepository.md)、[photoInspector](testcases/ports/photoInspector.md)、[photoStorage](testcases/ports/photoStorage.md)、[placeAffiliationsRepository](testcases/ports/placeAffiliationsRepository.md)、[placeRepository](testcases/ports/placeRepository.md)、[referenceQueries](testcases/ports/referenceQueries.md)、[regionLinkRepository](testcases/ports/regionLinkRepository.md)、[regionRepository](testcases/ports/regionRepository.md)、[roleRosterRepository](testcases/ports/roleRosterRepository.md)、[stewardedTargetDirectory](testcases/ports/stewardedTargetDirectory.md)、[stewardshipRepository](testcases/ports/stewardshipRepository.md)、[takedownClaimRepository](testcases/ports/takedownClaimRepository.md)、[unitOfWork](testcases/ports/unitOfWork.md)

## アーキテクチャの判断

実装の構成と方式の判断（ADR）。

- [ADR の一覧](adr/index.md)

## マニュアルテスト

- [マニュアルテスト一覧](manual-tests/index.md) — シナリオのカテゴリーごとの手順書（13文書）と件数、実行記録の表
