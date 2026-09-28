import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from "@tanstack/react-router";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBody,
  ManagePage,
  ManageShell,
} from "@/components/layout/ManageShell";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { classifyError } from "@/presentation/errorState";
import { resolveListingPlaceFn } from "@/presentation/landing";

/**
 * The notification landing of a listing (`notificationDestination.ts`):
 * opens SM-04 under the listing's store, where the store's guard decides
 * between its stewards and the absence proxy.
 */
export const Route = createFileRoute("/_manage/manage/listings/$listingId")({
  beforeLoad: async ({ params }) => {
    const { placeId } = await resolveListingPlaceFn({
      data: { listingId: params.listingId },
    });
    throw redirect({
      to: "/manage/places/$placeId/listings/$listingId",
      params: { placeId, listingId: params.listingId },
      replace: true,
    });
  },
  errorComponent: ListingLandingError,
});

/**
 * SM-04's CS-17 for a listing deleted after its notification: a deleted
 * listing no longer names its store, so this leads back to the
 * notifications (MY-03) instead of the store's SM-03.
 */
function ListingLandingError({ error }: ErrorComponentProps) {
  return (
    <ManageShell context="お店の管理" homeTo="/me" solo>
      {classifyError(error).kind === "notFound" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title="この掲載は削除されています"
              headingLevel="h1"
              actions={
                <>
                  <ButtonLink to="/me/notifications">通知へ戻る</ButtonLink>
                  <ButtonLink variant="secondary" to="/me">
                    マイページへ
                  </ButtonLink>
                </>
              }
            >
              通知の対象の掲載は、削除されたため開けません。店舗のほかの掲載は、マイページから店舗を開いて確かめられます。
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </ManageShell>
  );
}
